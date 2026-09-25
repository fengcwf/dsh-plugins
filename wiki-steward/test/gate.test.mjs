// gate.test — 写入拦截 v1.5（Task 14，US-13/OW-INV-5 承载）：tools/pre-execute 判定矩阵。
// 被测件：lib/gate.js createWriteGate（判定矩阵 + 分流 + reason 指路文案）+ validate.quickFindings（分级快检缝）。
// 覆盖面（brief 测试清单逐条 + 审前裁定①存量降格/②kb_mark 豁免 readOnly）：
//   ① 越权/不合指引新建 = deny + reason 含 obsidian-operations 维护指引
//   ② 存量形态问题（warn 级）= ask（提示+指路）
//   ③ 合规写 = allow（next() 链续）
//   ④ 非 vault 路径/读工具 = allow（零快检）；wiki_delete 目标不存在 = fail-open 放行（crud not-found 自拒）
//   ⑤ readOnly 全 deny（INV-7；非 vault 不误伤；kb_mark 已出表豁免；wiki_delete 同拦=裁定取字面）
//   ⑥ vaultRoot 缺省 = 不拦 + 留痕
//   ⑦ 三态无改写断言（payload 原样、决策键面固定、kind ∈ allow/ask/deny）
//   附加（bug-killer）：存量 error 级=ask（①存量降格：含 error 级一律 ask）｜存量修复性编辑=allow
//     （补丁外推——预存态误判反例）｜edit 引入 error=ask（①同判；补丁外推仍按编辑后内容判）｜
//     raw/ 写零误拦（捕获/回写不误拦）｜quickFindings 异常 fail-open 留痕｜
//     steward 写类工具同面（wiki_write/wiki_rename）+ kb_mark 出表（② INV-1 明文例外）｜
//     mark 在 readOnly 下放行（②）｜写类表断言（crud 族含 wiki_delete 在表；mark/validate 不在拦列表）｜
//     wiki_delete 入表（终审裁定取字面）：readOnly=deny+指路早拦／存量欠账目标=ask 不阻塞／合规 delete=放行
// 真被测件零 mock：quickFindings=真实现+调用计数包装（插桩非 mock）；mkdtemp 真文件系统；决策零写盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { createWriteGate, WRITE_TOOLS } = await import('../lib/gate.js')
const { quickFindings } = await import('../lib/validate.js')

// ── fixture 工具（validate.test 同款口径） ───────────────────────────────────

const mkVault = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-gate-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true })
  return root
}

const put = (root, rel, content) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
  return p
}

const fm = (fields) => ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n')

const GOOD_FIELDS = {
  title: '"测试页"',
  date: '2026-05-05',
  tags: '[测试]',
  status: 'active',
  source: '"raw/素材.md"',
  related: '[]',
}

const BODY = `## 概述
说明 what/why。

## 关键点
- **要点一** 说明。

## 关联
- [[concepts/梯度计费|梯度计费]] 相关概念。

## 来源
- raw/素材.md
`

const page = (fields = GOOD_FIELDS, body = BODY) => fm(fields) + '\n' + body

/** 缺字段+根放页（越权/不合指引新建：frontmatter error + placement error） */
const BAD_NEW = fm({ title: '"缺字段"' }) + '\n' + BODY

/** 存量缺 related（frontmatter error 级） */
const MISSING_RELATED = fm({ ...GOOD_FIELDS, related: undefined }).replace('related: undefined\n', '') + '\n' + BODY

// ── 驱动器 ─────────────────────────────────────────────────────────────────

const NEXT = Symbol('next')
const next = async () => NEXT

/** exec 冻结形态（宿主契约：arguments 深冻结、identity 只读） */
const exec = (name, args) => ({
  callId: `call_${name}`,
  name,
  arguments: Object.freeze(args),
  signal: new AbortController().signal,
})

/** 门构造：quickFindings 真实现 + 调用计数（插桩非 mock） */
const mkGate = (cfg, check = quickFindings) => {
  const warns = []
  const calls = []
  const gate = createWriteGate({
    quickFindings: async (...a) => {
      calls.push(a)
      return check(...a)
    },
    getCfg: () => cfg,
    warn: (l) => warns.push(l),
  })
  return { gate, warns, calls }
}

// ── 判定矩阵 ───────────────────────────────────────────────────────────────

test('① 越权/不合指引新建 = deny + reason 含 obsidian-operations 维护指引', async (t) => {
  const root = mkVault(t)
  const { gate, calls } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const f = path.join(root, 'wiki', '越权根放页.md')
  const r = await gate(exec('write', { file_path: f, content: BAD_NEW }), next)
  assert.equal(r.kind, 'deny')
  assert.match(r.reason, /obsidian-operations/, 'reason 引用维护指引 skill 名')
  assert.match(r.reason, /维护指引/)
  assert.match(r.reason, /frontmatter|缺必填/, 'reason 指路：说清哪里不合')
  assert.equal(calls.length, 1, 'vault 写跑了快检')
})

test('② 存量形态问题（warn 级）= ask（提示+指路）', async (t) => {
  const root = mkVault(t)
  const f = put(root, 'wiki/topics/loop-engineering.md', page())
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  // edit 形态（存量编辑）
  const r1 = await gate(exec('edit', { file_path: f, old_string: '说明 what/why。', new_string: '说明 what/why。（改）' }), next)
  assert.equal(r1.kind, 'ask', '存量 warn 级形态问题 → ask 而非 deny')
  assert.match(r1.reason, /obsidian-operations/)
  // write 全量覆盖形态（同判据）
  const r2 = await gate(exec('write', { file_path: f, content: page() }), next)
  assert.equal(r2.kind, 'ask')
  assert.match(r2.reason, /warn|形态/, 'reason 说明是形态欠账')
})

test('③ 合规写 = allow（next() 链续）', async (t) => {
  const root = mkVault(t)
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const f = path.join(root, 'wiki', 'concepts', '梯度计费.md')
  const r = await gate(exec('write', { file_path: f, content: page() }), next)
  assert.equal(r, NEXT, '合规写委托 next()（链续=allow）')
})

test('④ 非 vault 路径/读工具 = allow 且零快检；wiki_delete 目标不存在 = fail-open 放行', async (t) => {
  const root = mkVault(t)
  const { gate, calls } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  // 读工具
  assert.equal(await gate(exec('read', { file_path: path.join(root, 'wiki', 'x.md') }), next), NEXT)
  // 非 vault 写
  assert.equal(await gate(exec('write', { file_path: path.join(os.tmpdir(), 'ws-gate-outside.md'), content: '随便' }), next), NEXT)
  // wiki_delete 已入表（裁定取字面）：目标不存在 → fail-open 放行（crud not-found 自会拒），零快检
  assert.equal(await gate(exec('wiki_delete', { path: 'wiki/concepts/x.md', confirm: 'wiki/concepts/x.md' }), next), NEXT)
  assert.equal(calls.length, 0, '零快检（性能与边界）')
})

test('⑤ readOnly 全 deny（INV-7）；非 vault 写不误伤', async (t) => {
  const root = mkVault(t)
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: true } })
  const f = path.join(root, 'wiki', 'concepts', '梯度计费.md')
  const r1 = await gate(exec('write', { file_path: f, content: page() }), next)
  assert.equal(r1.kind, 'deny', 'readOnly 下连合规写也拒')
  assert.match(r1.reason, /只读|readOnly/)
  const r2 = await gate(exec('edit', { file_path: path.join(os.tmpdir(), 'ws-gate-outside.md'), old_string: 'a', new_string: 'b' }), next)
  assert.equal(r2, NEXT, '非 vault 写不受 readOnly 门（围栏外一律放行）')
})

test('⑥ vaultRoot 缺省 = 不拦 + 留痕', async (t) => {
  const root = mkVault(t)
  const { gate, warns, calls } = mkGate({ vaultRoot: '', write: { readOnly: true } })
  const f = path.join(root, 'wiki', '越权根放页.md')
  const r = await gate(exec('write', { file_path: f, content: BAD_NEW }), next)
  assert.equal(r, NEXT, '围栏不可判 → fail-open 不拦')
  assert.ok(warns.some((l) => /vaultRoot/.test(l)), '留痕说明缺 vaultRoot')
  assert.equal(calls.length, 0, '不跑快检')
  assert.ok(fs.existsSync(f) === false, '决策零副作用')
})

test('⑦ 三态无改写断言：payload 原样 + 决策键面固定 + kind ∈ allow/ask/deny', async (t) => {
  const root = mkVault(t)
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const cases = [
    ['allow', exec('write', { file_path: path.join(root, 'wiki', 'concepts', '梯度计费.md'), content: page() })],
    ['ask', exec('write', { file_path: put(root, 'wiki/topics/loop-engineering.md', page()), content: page() })],
    ['deny', exec('write', { file_path: path.join(root, 'wiki', '越权根放页.md'), content: BAD_NEW })],
  ]
  for (const [want, e] of cases) {
    const before = JSON.stringify(e)
    const r = await gate(e, next)
    assert.equal(JSON.stringify(e), before, `${want}：payload 恒原样（零输入改写）`)
    assert.equal(Object.isFrozen(e.arguments), true, 'arguments 保持冻结')
    if (want === 'allow') {
      assert.equal(r, NEXT, 'allow=next() 委托（无自有 allow 对象=无改写缝）')
    } else {
      assert.equal(r.kind, want)
      const kinds = new Set(['allow', 'ask', 'deny'])
      assert.ok(kinds.has(r.kind), `三态之内：${r.kind}`)
      const keys = Object.keys(r)
      assert.ok(keys.every((k) => ['kind', 'reason', 'displayReason'].includes(k)), `决策键面固定：${keys}`)
      assert.equal(r.arguments, undefined, '决策绝不携带改写参数')
      assert.equal(r.input, undefined, '决策绝不携带替换输入')
    }
  }
})

// ── 分流与附加反例（bug-killer） ───────────────────────────────────────────

test('存量 error 级问题 = ask（审前裁定①存量降格：含 error 级一律 ask，deny 锁死修复通道）', async (t) => {
  const root = mkVault(t)
  const f = put(root, 'wiki/concepts/存量缺字段.md', MISSING_RELATED)
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const r = await gate(exec('edit', { file_path: f, old_string: '说明 what/why。', new_string: '说明改了。' }), next)
  assert.equal(r.kind, 'ask', '存量+error 级（缺 related）→ ask（构造性强制=指路非坐牢）')
  assert.match(r.reason, /obsidian-operations/, 'reason 含指路')
  assert.match(r.reason, /related|frontmatter|缺/, 'reason 含问题摘要')
})

test('存量修复性编辑 = allow（补丁外推：按编辑后内容判，不按预存态误判）', async (t) => {
  const root = mkVault(t)
  const f = put(root, 'wiki/concepts/存量缺字段.md', MISSING_RELATED)
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  // 编辑恰好补齐缺字段 → 编辑后内容合规 → 必须 allow（按预存态判会误 deny 正当修复）
  const r = await gate(exec('edit', { file_path: f, old_string: 'source: "raw/素材.md"', new_string: 'source: "raw/素材.md"\nrelated: []' }), next)
  assert.equal(r, NEXT, '修复性编辑放行')
})

test('edit 引入 error = ask（①存量降格同判；补丁外推仍按编辑后内容判，不漏新伤）', async (t) => {
  const root = mkVault(t)
  const f = put(root, 'wiki/concepts/梯度计费.md', page())
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const r = await gate(exec('edit', { file_path: f, old_string: 'source: "raw/素材.md"\n', new_string: '' }), next)
  assert.equal(r.kind, 'ask', '编辑删掉 source 必填字段 → 编辑后 error → 存量一律 ask（非 allow=外推生效）')
  assert.match(r.reason, /obsidian-operations/)
})

test('raw/ 写 = allow 零误拦（捕获/回写不套 wiki 维护指引）', async (t) => {
  const root = mkVault(t)
  const { gate } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const f = path.join(root, 'raw', '04-session_logs', '某会话 - 2026-05-05-14-30.md')
  const r = await gate(exec('write', { file_path: f, content: '---\nsource: capture\n---\n\n会话记录\n' }), next)
  assert.equal(r, NEXT)
})

test('quickFindings 异常 = fail-open allow + 留痕（拦截绝不挡工具执行）', async (t) => {
  const root = mkVault(t)
  const boom = async () => {
    throw new Error('quickFindings boom')
  }
  const { gate, warns } = mkGate({ vaultRoot: root, write: { readOnly: false } }, boom)
  const r = await gate(exec('write', { file_path: path.join(root, 'wiki', 'concepts', 'x.md'), content: page() }), next)
  assert.equal(r, NEXT, '异常 fail-open')
  assert.ok(warns.some((l) => /quickFindings boom/.test(l)), '留痕')
})

test('steward 写类工具同面：wiki_write/wiki_rename 进同一矩阵（vault 相对锚定）；kb_mark 出表（②豁免）', async (t) => {
  const root = mkVault(t)
  const { gate, calls } = mkGate({ vaultRoot: root, write: { readOnly: false } })
  // wiki_write：vault 相对路径，新建不合指引 → deny
  const r1 = await gate(exec('wiki_write', { path: 'wiki/越权根放页.md', content: BAD_NEW }), next)
  assert.equal(r1.kind, 'deny', 'wiki_write 同矩阵（相对路径锚定 vaultRoot）')
  // kb_mark：不在写类表（② INV-1 明文例外=机械维护非内容写）→ 放行零快检
  put(root, 'wiki/topics/loop-engineering.md', page())
  const r2 = await gate(exec('kb_mark', { file: 'wiki/topics/loop-engineering.md' }), next)
  assert.equal(r2, NEXT, 'kb_mark 出表：不在拦列表，放行（零快检）')
  // wiki_rename：目标路径在 to 键上判定（新建违规目标 → deny；合规目标 → allow）
  put(root, 'wiki/concepts/梯度计费.md', page())
  const r3 = await gate(exec('wiki_rename', { from: 'wiki/concepts/梯度计费.md', to: 'wiki/越权根放页.md' }), next)
  assert.equal(r3.kind, 'deny', 'rename 到违规新路径 → deny（按 to 判）')
  const r4 = await gate(exec('wiki_rename', { from: 'wiki/concepts/梯度计费.md', to: 'wiki/concepts/梯度计费模型.md' }), next)
  assert.equal(r4, NEXT, 'rename 到合规路径 → allow')
  assert.equal(calls.length, 3, 'kb_mark 零快检（仅 wiki_write×1 + wiki_rename×2）')
})

test('mark 在 readOnly 下放行（② kb_mark 豁免 readOnly：INV-1 明文例外=机械维护非内容写）', async (t) => {
  const root = mkVault(t)
  put(root, 'wiki/topics/loop-engineering.md', page())
  const { gate, calls } = mkGate({ vaultRoot: root, write: { readOnly: true } })
  const r = await gate(exec('kb_mark', { file: 'wiki/topics/loop-engineering.md' }), next)
  assert.equal(r, NEXT, 'readOnly 下 kb_mark 照样放行（豁免；不在拦列表）')
  assert.equal(calls.length, 0, '零快检（出表永不快检）')
})

test('wiki_delete 入表（终审裁定取字面）：readOnly = deny+指路早拦；存量欠账目标 = ask 不阻塞；合规 delete = 放行', async (t) => {
  const root = mkVault(t)
  put(root, 'wiki/concepts/存量缺字段.md', MISSING_RELATED)
  put(root, 'wiki/concepts/梯度计费.md', page())
  // INV-7 门面：delete 同样早拦+指路（crud 层双确认+trash 双保险不变，本行只是 pre-execute 一致性）
  const g1 = mkGate({ vaultRoot: root, write: { readOnly: true } })
  const r1 = await g1.gate(exec('wiki_delete', { path: 'wiki/concepts/存量缺字段.md', confirm: 'wiki/concepts/存量缺字段.md' }), next)
  assert.equal(r1.kind, 'deny', 'readOnly 下 wiki_delete 同样 deny（crud 族同面）')
  assert.match(r1.reason, /只读|readOnly/)
  assert.match(r1.reason, /obsidian-operations/, 'deny 同样指路')
  assert.equal(g1.calls.length, 0, '早拦在快检之前（readOnly 不需要 IO 也能拦）')
  // 取字面代价（裁定注记）：readOnly:false 下 delete 目标存量欠账 → ask 提示（不阻塞，①存量降格同判）
  const g2 = mkGate({ vaultRoot: root, write: { readOnly: false } })
  const r2 = await g2.gate(exec('wiki_delete', { path: 'wiki/concepts/存量缺字段.md', confirm: 'wiki/concepts/存量缺字段.md' }), next)
  assert.equal(r2.kind, 'ask', 'delete 目标存量欠账 → ask（提示不阻塞）')
  assert.match(r2.reason, /obsidian-operations/)
  // 合规 delete 不被误拦 → 放行（crud 双确认+trash 照旧接手续）
  const r3 = await g2.gate(exec('wiki_delete', { path: 'wiki/concepts/梯度计费.md', confirm: 'wiki/concepts/梯度计费.md' }), next)
  assert.equal(r3, NEXT, '合规 delete 放行（本面只拦不改）')
})

test('写类表断言：crud 族（wiki_write/wiki_delete/wiki_rename）在表；mark/validate 不在拦列表（②；kb_mark=INV-1 明文例外、kb_validate 只读永不拦）', () => {
  for (const name of ['write', 'edit', 'wiki_write', 'wiki_delete', 'wiki_rename']) {
    assert.ok(WRITE_TOOLS[name], `${name} 在写类判定表`)
    assert.ok(Array.isArray(WRITE_TOOLS[name].pathKeys) && WRITE_TOOLS[name].pathKeys.length > 0)
  }
  assert.equal(WRITE_TOOLS.kb_mark, undefined, 'kb_mark 不在拦列表（豁免 readOnly，②）')
  assert.equal(WRITE_TOOLS.kb_validate, undefined, 'kb_validate 不在拦列表（只读永不拦）')
  assert.equal(WRITE_TOOLS.read, undefined, '读工具不入面')
})
