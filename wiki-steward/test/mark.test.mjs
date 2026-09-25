// mark 单测（T11 kb_mark：sha256 字节手术 + expectedRevision 乐观并发 + 原子写 + 未动段校验）：
// ① INV-1 反例（改别行/多改一行必 FAIL——逐字节断言）② 补插语义（缺 sha256 行插闭合前）
// ③ 无 frontmatter 拒+留痕 ④ expectedRevision 冲突拒 ⑤ bodyHash 与手算 sha256 对账
// ⑥ 未动段 hash 校验（模拟写坏=拒+逆放还原）⑦ 重写幂等（同值再写 changed:false）
// ⑧ 错误面契约回归（fix round 1：竞态裸异常 + rolledBack 诚实留痕）。
// 真被测件零 mock：lib/mark.js 直接真调用真文件系统；每测试独立 mkdtemp 目录，输出干净。
// 故障注入仅一处：opts._write（写入缝，测试塞真实破坏性写入器——被测校验逻辑全程真验真文件）。
// 竞态回归（⑧）用 FIFO 确定性重现「读入与快照之间」窗口（真文件系统语义，零 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const { kbMark, bodyHash } = await import('../lib/mark.js')

const mkdtemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ws-mark-'))
const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex')

// ── 样本构造（字节级精确控制；body = frontmatter 闭合 --- 之后内容） ──────────────
const BODY_LINES = ['正文第一行', '第二行 body']
const BODY = `${BODY_LINES.join('\n')}\n`
const BODY_HASH = sha256hex(Buffer.from(BODY, 'utf8'))

function sample({ mark = '0ld0ld', omitMark = false, emptyMark = false, crlf = false, extraSha = false } = {}) {
  const ls = ['---', 'title: 测试素材', 'date: 2026-09-23']
  if (!omitMark) ls.push(emptyMark ? 'sha256:' : `sha256: ${mark}`)
  if (extraSha) ls.push('sha256: dup')
  ls.push('status: draft', '---', ...BODY_LINES, '')
  return ls.join(crlf ? '\r\n' : '\n')
}

const put = (content, name = 'a.md') => {
  const dir = mkdtemp()
  const f = path.join(dir, name)
  fs.writeFileSync(f, content)
  return { dir, f }
}

// ── ⑤ bodyHash 与手算 sha256 对账（INV-13 同源口径） ────────────────────────────

test('bodyHash 对账：Buffer/字符串同值 + 已知向量 + 与手算 sha256 一致', () => {
  assert.equal(bodyHash(Buffer.from(BODY, 'utf8')), BODY_HASH)
  assert.equal(bodyHash(BODY), BODY_HASH, '字符串按 utf8 编码后哈希')
  assert.equal(bodyHash(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '已知空串向量')
  assert.equal(bodyHash(Buffer.from('abc')), sha256hex(Buffer.from('abc')), '手算 createHash 对账')
})

test('kbMark 回写值 = body 手算 sha256（frontmatter 闭合 --- 之后内容，INV-13）', async () => {
  const { f } = put(sample())
  const r = await kbMark(f)
  assert.equal(r.ok, true)
  assert.equal(r.current, BODY_HASH, '回写值与手算 body 哈希一致')
  const disk = fs.readFileSync(f, 'utf8')
  assert.ok(disk.includes(`sha256: ${BODY_HASH}`))
  // 手算：body = 闭合 --- 行之后的全部字节
  const afterClose = sample().split('---\n')[2]
  assert.equal(sha256hex(Buffer.from(afterClose, 'utf8')), BODY_HASH, '测试内手算对账（非实现复刻）')
})

// ── ① 更新态：仅换 sha256 值（INV-1 逐字节反例） ────────────────────────────────

test('更新态：既有 sha256 行换值——除值字节外逐字节不动（INV-1 反例：改别行/多改一行必 FAIL）', async () => {
  const content = sample()
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  assert.equal(r.previous, '0ld0ld')
  assert.equal(r.current, BODY_HASH)

  const before = Buffer.from(content, 'utf8')
  const after = fs.readFileSync(f)
  // 逐字节断言①：与手算期望内容全等（实现多改任何一行/一个字节 → 必 FAIL）
  const expected = content.replace('sha256: 0ld0ld', `sha256: ${BODY_HASH}`)
  assert.deepEqual(after, Buffer.from(expected, 'utf8'), '终态与手算期望逐字节全等')
  // 逐字节断言②：prefix（值之前）与 suffix（值之后）字节全等 → 值字节之外零改动
  const k = before.indexOf('sha256: ')
  const pre = before.subarray(0, k + 'sha256: '.length)
  const suf = before.subarray(k + 'sha256: '.length + '0ld0ld'.length)
  assert.ok(after.subarray(0, pre.length).equals(pre), '值之前字节全等')
  assert.ok(after.subarray(after.length - suf.length).equals(suf), '值之后字节全等')
  assert.equal(after.length - suf.length - pre.length, BODY_HASH.length, '只有值长度变化')
  // 逐字节断言③：未动段（去掉 sha256 行整行）hash 前后一致（INV-1 hash 级对账）
  const strip = (buf) => {
    const lines = buf.toString('utf8').split('\n')
    return sha256hex(Buffer.from(lines.filter((l) => !l.startsWith('sha256:')).join('\n'), 'utf8'))
  }
  assert.equal(strip(after), strip(before), '未动段 hash 一致')
})

test('换值语义锁定：非规范行（多空格/无空格/行尾空格）只换值字节，行内其余字节原样', async () => {
  for (const [oldLine, newLine] of [
    ['sha256:  0ld0ld ', `sha256:  ${BODY_HASH} `], // 多空格+行尾空格：全保
    ['sha256:0ld0ld', `sha256:${BODY_HASH}`], // 无空格：不补空格（值非空）
    ['sha256:\t0ld0ld', `sha256:\t${BODY_HASH}`], // Tab 前缀：保留
  ]) {
    const content = sample().replace('sha256: 0ld0ld', oldLine)
    const { f } = put(content)
    const r = await kbMark(f)
    assert.equal(r.ok, true, oldLine)
    assert.equal(fs.readFileSync(f, 'utf8'), content.replace(oldLine, newLine), oldLine)
    assert.equal(r.current, BODY_HASH)
  }
})

test('空值 sha256 行（sha256:）换值：补空格保 YAML 形 + 其余字节不动', async () => {
  const content = sample({ emptyMark: true })
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  assert.equal(r.previous, '')
  assert.equal(r.current, BODY_HASH)
  assert.equal(fs.readFileSync(f, 'utf8'), content.replace('sha256:', `sha256: ${BODY_HASH}`), '恰在冒号后补空格+值，其余逐字节不动')
})

// ── ② 补插语义（缺 sha256 行 → 插到 frontmatter 闭合 --- 前，migrate 同款） ──────

test('补插态：缺 sha256 行 → 新行插到闭合 --- 前（ingest-pipeline migrate 同款），其余逐字节不动', async () => {
  const content = sample({ omitMark: true })
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  assert.equal(r.previous, null, '插补前无标记行')
  assert.equal(r.current, BODY_HASH)
  // 手算期望：status 行后、闭合 --- 前恰插一行（多插/少插/插错位置/改别行必 FAIL）
  const hand = ['---', 'title: 测试素材', 'date: 2026-09-23', 'status: draft', `sha256: ${BODY_HASH}`, '---', ...BODY_LINES, ''].join('\n')
  assert.equal(fs.readFileSync(f, 'utf8'), hand, '终态与手算期望逐字节全等')
})

test('补插态：空 frontmatter（---/---）同样插在闭合 --- 前', async () => {
  const content = `---\n---\nBODY\n`
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, true)
  assert.equal(fs.readFileSync(f, 'utf8'), `---\nsha256: ${BODY_HASH_OF('BODY\n')}\n---\nBODY\n`)
})

function BODY_HASH_OF(s) { return sha256hex(Buffer.from(s, 'utf8')) }

// ── ③ 无 frontmatter 块 = 拒 + 留痕（INV-1 不许改结构） ─────────────────────────

test('无 frontmatter 拒：结构化错误 + 留痕 message + 文件逐字节不动', async () => {
  const content = '正文没有 frontmatter\n第二行\n'
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no-frontmatter')
  assert.equal(typeof r.message, 'string')
  assert.ok(r.message.length > 0, '留痕 message 非空')
  assert.equal(fs.readFileSync(f, 'utf8'), content, '拒绝时文件零改动')
})

test('frontmatter 未闭合（只有开栏 ---）同样拒：no-frontmatter + 零改动', async () => {
  const content = '---\ntitle: x\n正文没有闭合\n'
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no-frontmatter')
  assert.equal(fs.readFileSync(f, 'utf8'), content)
})

test('多条 sha256 行 = 结构歧义拒（ambiguous-sha256）+ 零改动', async () => {
  const content = sample({ extraSha: true })
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'ambiguous-sha256')
  assert.equal(fs.readFileSync(f, 'utf8'), content)
})

// ── ④ expectedRevision 乐观并发（hr98w 协议） ──────────────────────────────────

test('expectedRevision 冲突拒：revision-conflict + expected/actual 留痕 + 零改动', async () => {
  const content = sample()
  const { f } = put(content)
  const r = await kbMark(f, { expectedRevision: 'not-the-one' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'revision-conflict')
  assert.equal(r.expected, 'not-the-one')
  assert.equal(r.actual, '0ld0ld')
  assert.equal(fs.readFileSync(f, 'utf8'), content, '冲突绝不静默覆盖')
})

test('expectedRevision 命中 → 更新；缺省 → 无条件更新（调用方自负）', async () => {
  const { f: f1 } = put(sample())
  const r1 = await kbMark(f1, { expectedRevision: '0ld0ld' })
  assert.equal(r1.ok, true)
  assert.equal(r1.changed, true)

  const { f: f2 } = put(sample())
  const r2 = await kbMark(f2) // 缺省 = 无条件
  assert.equal(r2.ok, true)
})

test('expectedRevision 面对无标记行：null/\'\' 期望缺省命中（插补），非空值冲突', async () => {
  const { f: f1 } = put(sample({ omitMark: true }))
  const r1 = await kbMark(f1, { expectedRevision: null })
  assert.equal(r1.ok, true, 'expectedRevision:null = 期望无标记行')
  assert.equal(r1.previous, null)

  const { f: f2 } = put(sample({ omitMark: true }))
  const r2 = await kbMark(f2, { expectedRevision: '' })
  assert.equal(r2.ok, true, "expectedRevision:'' 同义缺省")

  const { f: f3 } = put(sample({ omitMark: true }))
  const r3 = await kbMark(f3, { expectedRevision: 'something' })
  assert.equal(r3.ok, false)
  assert.equal(r3.reason, 'revision-conflict')
  assert.equal(r3.actual, null)
})

// ── ⑥ 未动段 hash 校验（写前记 hash、写后核对——INV-6） ─────────────────────────

test('模拟写坏必拒：注入破坏性写入器改了正文行 → write-corrupt + 逆放还原原字节', async () => {
  const content = sample()
  const { f } = put(content)
  const r = await kbMark(f, {
    _write: async (target, data) => {
      // 真实写盘，但故意改坏正文一行（模拟写坏/撕裂写）
      const bad = Buffer.from(data).toString('utf8').replace('第二行 body', '第二行 BAD')
      fs.writeFileSync(target, bad)
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'write-corrupt')
  assert.equal(r.rolledBack, true, '已逆放')
  assert.equal(fs.readFileSync(f, 'utf8'), content, '逆放后与原字节全等（journal 回滚）')
})

test('模拟写坏必拒：改了 frontmatter 别行 → write-corrupt + 逆放还原', async () => {
  const content = sample({ omitMark: true })
  const { f } = put(content)
  const r = await kbMark(f, {
    _write: async (target, data) => {
      const bad = Buffer.from(data).toString('utf8').replace('date: 2026-09-23', 'date: 2099-01-01')
      fs.writeFileSync(target, bad)
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'write-corrupt')
  assert.equal(fs.readFileSync(f, 'utf8'), content, '插补场景同样逆放还原')
})

test('写入失败：_write 抛错 → io-error 结构化 + 逆放 + 原字节保留', async () => {
  const content = sample()
  const { f } = put(content)
  const r = await kbMark(f, {
    _write: async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'io-error')
  assert.equal(r.rolledBack, true)
  assert.equal(fs.readFileSync(f, 'utf8'), content, '失败后原字节保留')
})

test('写入缝透传正例：_write 写入构造内容 → 正常成功（缝不改语义）', async () => {
  const content = sample()
  const { f } = put(content)
  let seen = null
  const r = await kbMark(f, {
    _write: async (target, data) => {
      seen = Buffer.from(data)
      fs.writeFileSync(target, data)
    },
  })
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  assert.ok(seen.includes(Buffer.from(BODY_HASH, 'utf8')))
})

// ── ⑧ 错误面契约回归（fix round 1：竞态裸异常 + rolledBack 诚实留痕） ─────────────
// FIFO 确定性重现「读入与快照之间」竞态：kbMark 的 readFile 阻塞在 FIFO open 上等写者，
// 测试作为唯一写者送入内容后，在**同一同步块**内关写者（触发 EOF）+顶替/删除路径——
// JS 同步块先于任何 promise 续体执行，顶替恰落在「读入完成后、journalSave 前」的竞态窗口
// （零 mock、全程真文件系统语义；错误码探针实证：顶替=stat 过/journalSave 读 EISDIR，
// 删除=stat 段先拦 ENOENT → not-found）。
function raceSwap(f, content, swap) {
  const p = kbMark(f) // 读者 open 阻塞等写者配对
  const wfd = fs.openSync(f, 'w') // 与读者配对解除阻塞
  fs.writeSync(wfd, content)
  fs.closeSync(wfd) // EOF → readFile 即将携内容返回
  swap() // 同步块内完成顶替/删除（先于 readFile 续体 = 精确落在竞态窗口）
  return p
}

test('journalSave 竞态回归：读入与快照间目标被顶替（不可读）→ 结构化 io-error，绝不抛裸异常', async () => {
  const dir = mkdtemp()
  const f = path.join(dir, 'race.md')
  assert.equal(spawnSync('mkfifo', [f]).status, 0, 'mkfifo 就绪')
  const r = await raceSwap(f, sample(), () => {
    fs.rmSync(f)
    fs.mkdirSync(f) // 目标被目录顶替：读段 stat 过，journalSave 读必 EISDIR（原裸异常点）
  })
  assert.equal(r.ok, false, '结构化返回，不是 throw')
  assert.equal(r.reason, 'io-error')
  assert.equal(r.code, 'EISDIR', '竞态错误码留痕')
  assert.equal(r.rolledBack, false, '未写盘、无逆放发生')
  assert.match(r.message, /未写盘/)
  assert.ok(!r.message.includes('已逆放'), 'message 不谎报逆放')
})

test('竞态回归（被删半边）：读入与快照间目标被删 → 结构化 not-found + 不复活文件', async () => {
  const dir = mkdtemp()
  const f = path.join(dir, 'race.md')
  assert.equal(spawnSync('mkfifo', [f]).status, 0, 'mkfifo 就绪')
  const r = await raceSwap(f, sample(), () => fs.rmSync(f))
  assert.equal(r.ok, false, '绝不抛裸异常')
  assert.equal(r.reason, 'not-found', '删除竞态被读段 stat 先拦 = 结构化拒')
  assert.ok(typeof r.message === 'string' && r.message.length > 0, '留痕 message 非空')
  assert.equal(fs.existsSync(f), false, '绝不复活被并发删除的文件')
})

test('rolledBack 诚实①：写入失败且逆放也失败 → rolledBack:false + 回滚错误进 message（绝不谎报 true）', async () => {
  const content = sample()
  const { f } = put(content)
  const r = await kbMark(f, {
    _write: async (target) => {
      // 真实破坏：目标被目录顶替后写入失败——journalRollback 的 writeAtomic rename
      // 落在目录上同样必败（EISDIR，探针实证）＝逆放失败的诚实留痕面
      fs.rmSync(target)
      fs.mkdirSync(target)
      throw Object.assign(new Error('write failed'), { code: 'EIO' })
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'io-error')
  assert.equal(r.code, 'EIO', '原始写入错误留痕')
  assert.equal(r.rolledBack, false, '逆放失败不得谎报 rolledBack:true（恢复决策依赖此位）')
  assert.match(r.message, /逆放失败（EISDIR/, '吞掉的回滚错误至少进 message')
  assert.match(r.message, /EIO/, '原始写入错误也进 message')
})

test('rolledBack 诚实②：写后回读失败且逆放也失败 → rolledBack:false + 两处错误均进 message', async () => {
  const { f } = put(sample())
  const r = await kbMark(f, {
    _write: async (target, data) => {
      fs.writeFileSync(`${target}.injected`, data) // 注入写入物留证（输出干净）
      fs.rmSync(target)
      fs.mkdirSync(target) // 目标被顶替 → 写后回读 EISDIR
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'io-error')
  assert.equal(r.code, 'EISDIR', '回读错误码留痕')
  assert.equal(r.rolledBack, false, '逆放失败不得谎报 true')
  assert.match(r.message, /回读失败（EISDIR/)
  assert.match(r.message, /逆放失败（EISDIR/)
})

// ── ⑦ 重写幂等（同值再写 changed:false） ───────────────────────────────────────

test('重写幂等：同值再写 changed:false + 文件零改动（inode 不换=零写盘）', async () => {
  const { f } = put(sample())
  const r1 = await kbMark(f)
  assert.equal(r1.changed, true)
  const bytes1 = fs.readFileSync(f)
  const ino1 = fs.statSync(f).ino

  const r2 = await kbMark(f)
  assert.equal(r2.ok, true)
  assert.equal(r2.changed, false, '同值再写 = 无变化')
  assert.equal(r2.previous, BODY_HASH)
  assert.equal(r2.current, BODY_HASH)
  assert.deepEqual(fs.readFileSync(f), bytes1, '字节零改动')
  assert.equal(fs.statSync(f).ino, ino1, 'inode 不换 = 根本没写（幂等实证）')
})

test('幂等连写三次：恰第一次 changed:true，后两次 false', async () => {
  const { f } = put(sample({ omitMark: true }))
  const rs = [await kbMark(f), await kbMark(f), await kbMark(f)]
  assert.deepEqual(rs.map((r) => r.changed), [true, false, false])
})

// ── CRLF 口径（ingest-pipeline 同源：universal-newline 归一后哈希；行尾字节不动） ──

test('CRLF 素材：回写值=LF 归一 body 哈希（Python 同口径）+ CRLF 行尾逐字节保留', async () => {
  const content = sample({ crlf: true })
  const { f } = put(content)
  const r = await kbMark(f)
  assert.equal(r.ok, true)
  assert.equal(r.current, BODY_HASH, 'CRLF 正文归一化后与 LF 同哈希（ingest-pipeline universal newlines 同口径）')
  const expected = content.replace('sha256: 0ld0ld', `sha256: ${BODY_HASH}`)
  assert.equal(fs.readFileSync(f, 'utf8'), expected, '除 sha256 值外逐字节不动（CRLF 行尾全保留）')
})

// ── 围栏拒（realpathGuard 四步，vaultRoot 缺省不围栏=调用方自理） ─────────────────

test('围栏拒：vaultRoot 外目标 → fenced + guard 留痕 + 零改动', async () => {
  const root = mkdtemp()
  const outside = put(sample())
  const r = await kbMark(outside.f, { vaultRoot: root })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'fenced')
  assert.equal(typeof r.guard, 'string')
  assert.equal(fs.readFileSync(outside.f, 'utf8'), sample())
})

test('围栏拒：symlink 逃逸（指向 root 外实存文件 → outside-root；dangling 外指 → symlink-escape）', async () => {
  const root = mkdtemp()
  const outside = put(sample())
  fs.symlinkSync(outside.f, path.join(root, 'link-real.md'))
  const r1 = await kbMark(path.join(root, 'link-real.md'), { vaultRoot: root })
  assert.equal(r1.ok, false)
  assert.equal(r1.reason, 'fenced')
  assert.equal(r1.guard, 'outside-root')
  assert.equal(fs.readFileSync(outside.f, 'utf8'), sample(), '围栏外文件零改动')

  fs.symlinkSync(path.join(mkdtemp(), 'ghost.md'), path.join(root, 'link-dangling.md'))
  const r2 = await kbMark(path.join(root, 'link-dangling.md'), { vaultRoot: root })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'fenced')
  assert.equal(r2.guard, 'symlink-escape')
})

test('围栏内正例：vaultRoot 内真实文件正常回写', async () => {
  const root = mkdtemp()
  const f = path.join(root, 'raw-ok.md')
  fs.writeFileSync(f, sample())
  const r = await kbMark(f, { vaultRoot: root })
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
})

// ── 错误语义与参数防御 ─────────────────────────────────────────────────────────

test('目标不存在 → not-found（结构化，不抛裸异常）', async () => {
  const dir = mkdtemp()
  const r = await kbMark(path.join(dir, 'ghost.md'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'not-found')
})

test('参数防御：非字符串/空路径 → TypeError 且零副作用', async () => {
  await assert.rejects(kbMark(123), TypeError)
  await assert.rejects(kbMark(''), TypeError)
  await assert.rejects(kbMark('a\0b'), TypeError)
})

test('输出形状：成功面键固定 {ok,file,changed,previous,current} + JSON 往返等值', async () => {
  const { f } = put(sample())
  const r = await kbMark(f)
  assert.deepEqual(Object.keys(r).sort(), ['changed', 'current', 'file', 'ok', 'previous'])
  assert.equal(r.file, path.resolve(f))
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r)
})
