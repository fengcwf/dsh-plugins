// vault-ops 删除可逆测试（T6）：OW-US-6 / OW-INV-5——.trash 落点（冲突改名+O_EXCL 占位防覆盖）
// + 双确认先行（缺省拒+副作用零发生）+ 源 lstat 门（symlink 拒/真实目录保留）+ 可逆往返逐字节同。
// 真验零 mock：真 fs（tmp vault 真写盘）、真并发抢建（_onStage 缝里真写盘抢名）、真故障注入（缝里真抛错）。
// 测试缝（仅一个，沿 T5 惯例）：opts._onStage(stage)——删除阶段点回调；stage ∈
//   'claimed:<trashRel>'    = 占位已立、rename 前（并发抢建注入点；抛错=占位后故障注入）
//   'after-rename:<trashRel>' = rename 后、目录 fsync 前（收尾故障注入点）
// OW-INV-5 后半「rename 永不静默覆盖同名」由 T5 锁定复用（报告引用）：
//   vault-rename.test.mjs 坑④ 缺省拒零写盘 / TOCTOU 目标槽位锁内重检 / web-rename.test.mjs API 负例。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { deletePath } from '../lib/vault-ops.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-delete', import.meta.url))

/** 建真 tmp vault（files=相对路径→内容；自动建父目录） */
function tmpVault(t, files) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content, 'utf8')
  }
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 全树逐字节指纹（文件集 + 每文件 sha256）——「副作用零发生」「可逆往返」断言用 */
function treeDigest(root) {
  const out = {}
  const walk = (abs, rel) => {
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) walk(path.join(abs, d.name), childRel)
      else out[childRel] = createHash('sha256').update(fs.readFileSync(path.join(abs, d.name))).digest('hex')
    }
  }
  walk(root, '')
  return out
}

const SCENE = {
  'INDEX.md': '# INDEX\n\n- [[notes/a]]\n',
  'notes/a.md': '# A\n\n内容 α\n',
  'notes/b.md': '# B\n\n[[a]]\n',
  'notes/sub/deep.md': '# Deep\n\n深层\n',
}

// ── ① 双确认：缺省拒 + 确认先于一切副作用（副作用零发生断言）────────────────────
test('① 双确认缺省拒：无 confirm 一律拒（缺省拒），源不动、.trash 不产生、全树零副作用', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const r = await deletePath(root, 'notes/a.md', {})
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'confirm-missing', '缺省（无 confirm）必须拒——绝无「没确认就删」')
  assert.equal(r.trashPath, null)
  assert.ok(Array.isArray(r.warnings))
  assert.deepEqual(treeDigest(root), before, '全树逐字节不变=副作用零发生')
  assert.equal(fs.existsSync(path.join(root, '.trash')), false, '.trash 不得产生（确认前零写盘）')
})

test('① 双确认缺省拒：confirm 复述不符（错字/空白/大小写）一律拒，副作用零发生', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  for (const confirm of ['notes/a.md ', 'notes/A.md', 'notes/a.md\n', 'notes/a.m', 'notes/b.md']) {
    const r = await deletePath(root, 'notes/a.md', { confirm })
    assert.equal(r.ok, false, `confirm=${JSON.stringify(confirm)} 不得过`)
    assert.equal(r.reason, 'confirm-mismatch')
  }
  assert.deepEqual(treeDigest(root), before, '全树逐字节不变=副作用零发生')
  assert.equal(fs.existsSync(path.join(root, '.trash')), false)
})

test('① 确认检查先于一切副作用：词法围栏违规路径 + 错误 confirm → 先回 confirm-mismatch（围栏之前）', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  // 'x/../a.md' 含 '..' 段=围栏拒；confirm 又不符——按「确认先于围栏」语义必须先回确认拒
  const r = await deletePath(root, 'x/../a.md', { confirm: 'wrong' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'confirm-mismatch', '确认检查先于围栏（wiki-steward 实测语义）')
  assert.deepEqual(treeDigest(root), before)
  // 形参非法（空路径）仍走 bad_request throw（形参校验非副作用，先于确认）
  await assert.rejects(() => deletePath(root, '', { confirm: '' }), { code: 'bad_request' })
})

// ── ② trash 冲突改名（x.md→x.1.md）──────────────────────────────────────────
test('② trash 落点冲突改名：.trash/<rel> 被占 → x.md→x.1.md（再占→x.2.md），既有回收内容绝不覆盖', async (t) => {
  const root = tmpVault(t, SCENE)
  fs.mkdirSync(path.join(root, '.trash/notes'), { recursive: true })
  fs.writeFileSync(path.join(root, '.trash/notes/a.md'), '旧回收内容\n', 'utf8')
  const r = await deletePath(root, 'notes/a.md', { confirm: 'notes/a.md' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/notes/a.1.md', '冲突改名落点 x.md→x.1.md')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.md'), 'utf8'), '旧回收内容\n', '既有回收内容逐字节不动')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.1.md'), 'utf8'), SCENE['notes/a.md'], '本次删除内容落改名位')
  assert.ok(r.warnings.some((w) => w.includes('冲突改名')), '冲突改名必须留痕（INV-15 风格）')
  // 再删一个同名新文件 → a.2.md（序号递增，不覆盖任何既有位）
  fs.writeFileSync(path.join(root, 'notes/a.md'), '第二版\n', 'utf8')
  const r2 = await deletePath(root, 'notes/a.md', { confirm: 'notes/a.md' })
  assert.equal(r2.ok, true)
  assert.equal(r2.trashPath, '.trash/notes/a.2.md')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.md'), 'utf8'), '旧回收内容\n')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.1.md'), 'utf8'), SCENE['notes/a.md'])
})

test('② 冲突改名：无扩展名条目 x→x.1（同款序号位），目录条目同规则', async (t) => {
  const root = tmpVault(t, { x: '裸名\n', 'd/y.txt': 'y\n' })
  fs.mkdirSync(path.join(root, '.trash'), { recursive: true })
  fs.writeFileSync(path.join(root, '.trash/x'), '占位\n', 'utf8')
  const r = await deletePath(root, 'x', { confirm: 'x' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/x.1')
  assert.equal(fs.readFileSync(path.join(root, '.trash/x'), 'utf8'), '占位\n')
  fs.mkdirSync(path.join(root, '.trash/d'), { recursive: true })
  const r2 = await deletePath(root, 'd', { confirm: 'd' })
  assert.equal(r2.ok, true, '目录落点冲突（.trash/d 已被祖先目录占用）→ 改名 d.1')
  assert.equal(r2.trashPath, '.trash/d.1')
  assert.equal(fs.readFileSync(path.join(root, r2.trashPath, 'y.txt'), 'utf8'), 'y\n', '目录整体入改名位')
})

// ── ③ O_EXCL 占位防覆盖（并发抢建负例）────────────────────────────────────────
test('③ O_EXCL 占位防覆盖：taken→rename 窗口内并发抢建同名必 EEXIST（绝不覆盖），抢建者改名位保留', async (t) => {
  const root = tmpVault(t, SCENE)
  const events = []
  const r = await deletePath(root, 'notes/a.md', {
    confirm: 'notes/a.md',
    _onStage: async (stage) => {
      if (!stage.startsWith('claimed:')) return
      const cand = path.join(root, '.trash/notes/a.md')
      // 窗口内并发者用同款独占协议抢建同名 → 必须失败（占位已立=唯一落点）
      assert.throws(() => fs.writeFileSync(cand, 'GRAB', { flag: 'wx' }), { code: 'EEXIST' },
        '占位已立：并发抢建同名必须 EEXIST（朴素 taken→rename 实现这里会被静默覆盖=本测红）')
      events.push('grab-eexist')
      // 抢建者按冲突改名落自己的位（x.1.md），双方内容都必须活
      fs.writeFileSync(path.join(root, '.trash/notes/a.1.md'), 'GRAB2', { flag: 'wx' })
      events.push('grab-fallback')
    },
  })
  assert.equal(r.ok, true)
  assert.deepEqual(events, ['grab-eexist', 'grab-fallback'])
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.md'), 'utf8'), SCENE['notes/a.md'], '本调用内容落独占位')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.1.md'), 'utf8'), 'GRAB2', '抢建者内容完好（零覆盖）')
  assert.equal(fs.existsSync(path.join(root, 'notes/a.md')), false, '源已移入回收站')
})

test('③ O_EXCL 占位防覆盖（目录）：并发 mkdir 抢建同名必 EEXIST，目录落点唯一', async (t) => {
  const root = tmpVault(t, { 'notes/sub/deep.md': '深层\n' })
  const r = await deletePath(root, 'notes/sub', {
    confirm: 'notes/sub',
    _onStage: async (stage) => {
      if (!stage.startsWith('claimed:')) return
      assert.throws(() => fs.mkdirSync(path.join(root, '.trash/notes/sub')), { code: 'EEXIST' },
        '目录占位（mkdir 独占）已立：并发抢建必须 EEXIST')
    },
  })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/notes/sub')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/sub/deep.md'), 'utf8'), '深层\n')
})

test('③ 失败清残只清本调用占位：占位后故障 → 自家占位清掉、抢建者/既有内容零误伤、源原地不动', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const r = await deletePath(root, 'notes/a.md', {
    confirm: 'notes/a.md',
    _onStage: async (stage) => {
      if (!stage.startsWith('claimed:')) return
      fs.writeFileSync(path.join(root, '.trash/notes/a.1.md'), 'FOREIGN\n', 'utf8') // 窗口内外来内容
      throw new Error('注入：占位后故障')
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'move-failed')
  assert.equal(fs.existsSync(path.join(root, '.trash/notes/a.md')), false, '本调用占位必须清残')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.1.md'), 'utf8'), 'FOREIGN\n', '外来内容零误伤（只清本调用占位）')
  assert.equal(fs.readFileSync(path.join(root, 'notes/a.md'), 'utf8'), SCENE['notes/a.md'], '源原地不动（删除未发生）')
  const after = treeDigest(root)
  delete after['.trash/notes/a.1.md'] // 外来内容=注入产物，非本调用副作用
  assert.deepEqual(after, before, '除注入外来内容外全树零变化')
})

test('③ rename 落盘后收尾故障：删除已发生=ok:true + 留痕（绝不谎报失败、绝不误清已回收内容）', async (t) => {
  const root = tmpVault(t, SCENE)
  const r = await deletePath(root, 'notes/a.md', {
    confirm: 'notes/a.md',
    _onStage: async (stage) => {
      if (stage.startsWith('after-rename:')) throw new Error('注入：rename 后 fsync 前故障')
    },
  })
  assert.equal(r.ok, true, 'rename 已落盘=删除已发生，收尾故障不得谎报失败')
  assert.equal(r.trashPath, '.trash/notes/a.md')
  assert.ok(r.warnings.some((w) => w.includes('收尾')), '收尾故障必须留痕')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/a.md'), 'utf8'), SCENE['notes/a.md'], '已回收内容完好（不得被清残误删）')
  assert.equal(fs.existsSync(path.join(root, 'notes/a.md')), false)
})

// ── ④ 源 lstat 门：symlink 拒 / 真实目录删除保留 ─────────────────────────────────
test('④ symlink 源拒 not-a-file：不解引用（目标文件不动）、零副作用；真实目录删除保留', async (t) => {
  const root = tmpVault(t, SCENE)
  fs.symlinkSync(path.join(root, 'notes/a.md'), path.join(root, 'notes/link.md'))
  const before = treeDigest(root)
  const r = await deletePath(root, 'notes/link.md', { confirm: 'notes/link.md' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'not-a-file', 'symlink/其他节点拒（源 lstat 门，不解引用）')
  assert.deepEqual(treeDigest(root), before, '源不动、目标不动、.trash 不产生=零副作用')
  assert.equal(fs.existsSync(path.join(root, '.trash')), false)
  // 真实目录删除保留（.trash 目录特性）：目录整体移入回收站
  const r2 = await deletePath(root, 'notes/sub', { confirm: 'notes/sub' })
  assert.equal(r2.ok, true, '真实目录删除保留（不是拒）')
  assert.equal(r2.trashPath, '.trash/notes/sub')
  assert.equal(fs.statSync(path.join(root, '.trash/notes/sub')).isDirectory(), true, '回收站落点是真目录')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes/sub/deep.md'), 'utf8'), SCENE['notes/sub/deep.md'])
})

test('④ not-found：源不存在拒（域结果），.trash 不产生', async (t) => {
  const root = tmpVault(t, SCENE)
  const r = await deletePath(root, 'notes/none.md', { confirm: 'notes/none.md' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'not-found')
  assert.equal(fs.existsSync(path.join(root, '.trash')), false)
})

test('④ in-trash 门：.trash 本体/内部条目拒删（回收站恢复材料受保护）', async (t) => {
  const root = tmpVault(t, SCENE)
  const r1 = await deletePath(root, '.trash', { confirm: '.trash' })
  assert.equal(r1.ok, false)
  assert.equal(r1.reason, 'in-trash', '.trash 本体不得被删除（否则回收站整体卷入自身）')
  const r2 = await deletePath(root, '.trash/notes/a.md', { confirm: '.trash/notes/a.md' })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'in-trash')
})

// ── 修复轮 Issue 1：in-trash 门判定必须按规范化口径（'.' 段词法形态不得绕过）────────
test('④ in-trash 门（修复轮 Issue 1）：./ 前缀等词法形态不得绕过（恢复材料保护不因路径写法失效）', async (t) => {
  const root = tmpVault(t, { ...SCENE, '.trash/keep.md': 'RECOVERABLE\n' })
  const before = treeDigest(root)
  for (const relPath of ['./.trash/keep.md', '.trash/./keep.md', './.trash', '.trash/./.', './.trash/./notes/a.md']) {
    const r = await deletePath(root, relPath, { confirm: relPath })
    assert.equal(r.ok, false, `${relPath} 不得过（in-trash 门）`)
    assert.equal(r.reason, 'in-trash', `${relPath} 解析进 .trash = 恢复材料，必须拒`)
    assert.deepEqual(r.warnings, [], '拒删必须零副作用、零留痕噪声')
    assert.deepEqual(treeDigest(root), before, `${relPath} 全树逐字节不变（恢复材料不得被静默移出受保护区）`)
  }
})

// ── 修复轮 Issue 2：trashPath 输出规范化（无 '.' 段）────────────────────────────
test('② trashPath 输出规范化（修复轮 Issue 2）：notes/./a.md → trashPath 无 "." 段，逆向 rename 取回逐字节同', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const r = await deletePath(root, 'notes/./a.md', { confirm: 'notes/./a.md' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/notes/a.md', 'trashPath 必须规范化（无 "." 段）')
  assert.equal(r.trashPath.split('/').some((seg) => seg === '.' || seg === ''), false, 'trashPath 逐段规范')
  assert.equal(fs.readFileSync(path.join(root, r.trashPath), 'utf8'), SCENE['notes/a.md'], '内容落规范化落点')
  fs.renameSync(path.join(root, r.trashPath), path.join(root, 'notes/a.md')) // 取回=逆向 rename（以 trashPath 为权威）
  assert.deepEqual(treeDigest(root), before, '取回后全树逐字节同')
})

// ── 修复轮 Issue 3：祖先段被非目录占用 → 段冲突改名（Ruling 3 补负例闭证据链）────────
test('② 祖先段被非目录占用（修复轮 Issue 3）：该段冲突改名 .trash/notes.1/sub + 留痕，外来文件零误伤', async (t) => {
  const root = tmpVault(t, { 'notes/sub/deep.md': '深层\n' })
  fs.mkdirSync(path.join(root, '.trash'), { recursive: true })
  fs.writeFileSync(path.join(root, '.trash/notes'), 'FOREIGN\n', 'utf8') // 祖先段被非目录占用
  const r = await deletePath(root, 'notes/sub', { confirm: 'notes/sub' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/notes.1/sub', '祖先段冲突改名（x→x.1）落点')
  assert.ok(r.warnings.some((w) => w.includes('冲突改名')), '祖先段冲突改名必须留痕（INV-15 风格）')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes'), 'utf8'), 'FOREIGN\n', '外来文件逐字节零误伤')
  assert.equal(fs.readFileSync(path.join(root, '.trash/notes.1/sub/deep.md'), 'utf8'), '深层\n', '目录整体入改名位')
  assert.equal(fs.existsSync(path.join(root, 'notes/sub')), false, '源已移入回收站')
})

// ── ⑤ 可逆往返（trash 取回=内容逐字节同）──────────────────────────────────────
test('⑤ 可逆往返（文件）：delete→trash 取回（rename 回原位）→ 全树逐字节同（sha256 相等）', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const r = await deletePath(root, 'notes/a.md', { confirm: 'notes/a.md' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/notes/a.md')
  // 取回=普通 rename 逆向（可逆本义：delete=移动到 trash，不是 rm）
  fs.renameSync(path.join(root, r.trashPath), path.join(root, 'notes/a.md'))
  assert.deepEqual(treeDigest(root), before, '取回后全树逐字节同（sha256 逐文件相等）')
})

test('⑤ 可逆往返（目录）：delete→trash 取回 → 整树逐字节同（含嵌套文件）', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const r = await deletePath(root, 'notes/sub', { confirm: 'notes/sub' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/notes/sub')
  fs.renameSync(path.join(root, r.trashPath), path.join(root, 'notes/sub'))
  assert.deepEqual(treeDigest(root), before, '目录取回后整树逐字节同')
})
