// fs-safe 单测（写安全共享层，冲突扫描裁定 T11 kb_mark / T12 CRUD 消费）：
// ③ writeAtomic 失败清残+可测语义｜④ withFileLock 互斥与 'a'（禁 'w' 截断）教训｜
// ⑤ realpathGuard 负例（../ 绝对 symlink 外逃 dangling 外指）｜⑥ journal save/rollback 往返。
// 真被测件零 mock：lib/fs-safe.js 直接真调用真文件系统；每测试独立 mkdtemp 目录，输出干净。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const {
  writeAtomic, withFileLock, realpathGuard, journalSave, journalRollback,
} = await import('../lib/fs-safe.js')

const mkdtemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ws-fs-safe-'))
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── ③ writeAtomic ────────────────────────────────────────────────────────────

test('writeAtomic 成功写入：内容整确 + mode 生效 + 零临时文件残留 + 返回 {path, bytes}', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'a.md')
  const origUmask = process.umask(0o022)
  try {
    const r = await writeAtomic(target, 'hello 原子\n', { mode: 0o644 })
    assert.equal(fs.readFileSync(target, 'utf8'), 'hello 原子\n')
    assert.equal(r.path, target)
    assert.equal(r.bytes, Buffer.byteLength('hello 原子\n'))
    assert.equal(fs.statSync(target).mode & 0o777, 0o644 & ~0o022, 'mode 经 umask 后生效')
    assert.deepEqual(fs.readdirSync(dir), ['a.md'], '无 .tmp 残留')
    // 自定义收紧 mode
    await writeAtomic(path.join(dir, 'b.md'), 'x', { mode: 0o600 })
    assert.equal(fs.statSync(path.join(dir, 'b.md')).mode & 0o777, 0o600)
  } finally {
    process.umask(origUmask)
  }
})

test('writeAtomic 覆盖既有文件：整文件替换（rename 原子换新），旧内容零残留', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'mark.md')
  fs.writeFileSync(target, 'OLD'.repeat(1000))
  const next = 'NEW'.repeat(1000)
  await writeAtomic(target, next, { mode: 0o644 })
  const got = fs.readFileSync(target, 'utf8')
  assert.equal(got, next, '终态=完整新内容')
  assert.ok(!got.includes('OLD'), '旧内容零残留')
  assert.deepEqual(fs.readdirSync(dir), ['mark.md'], 'rename 后无临时文件')
})

test('writeAtomic 并发原子性：Promise.all 双写大载荷，终态为完整 A 或完整 B（不交错不撕裂）', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'big.bin')
  const A = 'A'.repeat(256 * 1024)
  const B = 'B'.repeat(256 * 1024)
  await Promise.all([writeAtomic(target, A), writeAtomic(target, B)])
  const final = fs.readFileSync(target, 'utf8')
  assert.ok(final === A || final === B, '终态必为其中一个完整载荷（wx 独占随机临时名 + rename 原子替换）')
  assert.deepEqual(fs.readdirSync(dir), ['big.bin'], '并发双方均无残留')
})

test('writeAtomic 失败清残：rename 失败（目标为既有目录）→ 拒绝 + 目录完好 + 零 .tmp 残留', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'iamdir')
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, 'keep.txt'), 'keep')
  await assert.rejects(writeAtomic(target, 'data'), 'rename 文件→目录必须失败')
  assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'keep', '既有目标完好')
  assert.deepEqual(fs.readdirSync(dir), ['iamdir'], '失败后临时文件必须清残（T2/T6 教训）')
})

test('writeAtomic 参数防御：非字符串路径/非法 data → TypeError 且零副作用', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'keep.md')
  fs.writeFileSync(target, 'KEEP')
  await assert.rejects(writeAtomic(123, 'x'), TypeError, '路径类型校验在任何 fs 副作用之前')
  await assert.rejects(writeAtomic('', 'x'), TypeError)
  await assert.rejects(writeAtomic(target, 12345), TypeError, 'data 类型（string/Buffer/TypedArray 之外）先拒')
  await assert.rejects(writeAtomic(path.join(dir, 'nul\u0000.md'), 'x'), TypeError, 'NUL 路径先拒')
  assert.equal(fs.readFileSync(target, 'utf8'), 'KEEP', '目标未被触碰')
  assert.deepEqual(fs.readdirSync(dir), ['keep.md'], '零新文件零残留')
})

test('writeAtomic 父目录缺失 → ENOENT 拒绝且无残留', async () => {
  const dir = mkdtemp()
  await assert.rejects(writeAtomic(path.join(dir, 'nodir', 'f.md'), 'x'), (e) => e.code === 'ENOENT')
  assert.deepEqual(fs.readdirSync(dir), [], '不自动建父目录、零残留')
})

// ── ④ withFileLock ───────────────────────────────────────────────────────────

test('withFileLock 互斥：3 并发临界区不交叠（max=1）+ 持锁期间锁目录在场、释放后移除', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'vault-write')
  const state = { inside: 0, max: 0 }
  const job = (id) => withFileLock(target, async () => {
    state.inside += 1
    state.max = Math.max(state.max, state.inside)
    assert.equal(fs.existsSync(`${target}.lock`), true, '持锁期间锁目录必须在场')
    await sleep(30)
    state.inside -= 1
    return id
  })
  const results = await Promise.all([job(1), job(2), job(3)])
  assert.equal(state.max, 1, '临界区绝不交叠')
  assert.deepEqual(results, [1, 2, 3], '各 fn 返回值透传')
  assert.equal(fs.existsSync(`${target}.lock`), false, '释放后锁目录移除（零残留）')
})

test('withFileLock 超时：锁被预占 → ELOCKTIMEOUT 拒绝且 fn 不执行', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'busy')
  fs.mkdirSync(`${target}.lock`) // 模拟他方持锁
  let ran = false
  await assert.rejects(
    withFileLock(target, async () => { ran = true }, { waitMs: 60, pollMs: 10 }),
    (e) => e.code === 'ELOCKTIMEOUT',
  )
  assert.equal(ran, false, '未获锁绝不执行临界区')
  fs.rmSync(`${target}.lock`, { recursive: true })
})

test("withFileLock 'a' 教训：加锁/释放全程不碰目标数据文件（禁 'w' 截断——内容逐字保持）", async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'data.md')
  fs.writeFileSync(target, 'DO_NOT_TRUNCATE\n')
  const r = await withFileLock(target, () => 'ok')
  assert.equal(r, 'ok')
  assert.equal(fs.readFileSync(target, 'utf8'), 'DO_NOT_TRUNCATE\n', '锁机制绝不以 w 模式打开目标文件')
  assert.equal(fs.existsSync(`${target}.lock`), false)
})

test('withFileLock 错误路径：fn 抛错 → 错误上抛 + 锁必释放（finally）', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'boom')
  await assert.rejects(withFileLock(target, async () => { throw new Error('boom') }), /boom/)
  assert.equal(fs.existsSync(`${target}.lock`), false, '异常路径也必须释放锁')
  // 锁已释放，后续可正常获取
  const r = await withFileLock(target, () => 42, { waitMs: 200 })
  assert.equal(r, 42)
})

// ── ⑤ realpathGuard ──────────────────────────────────────────────────────────

test('realpathGuard 负例（形式拒）：../ 穿越 / 绝对路径 / 空串 / 反斜杠 / 盘符 / NUL / 空段', () => {
  const dir = mkdtemp()
  for (const bad of [
    '../escape.md', 'a/../../escape.md', 'a/../b.md',
    '/etc/passwd', '', 'a\\b.md', 'C:/win.md', 'nul\u0000.md',
    'a//b.md', './rel.md',
  ]) {
    const out = realpathGuard(dir, bad)
    assert.equal(out.ok, false, `必须拒：${JSON.stringify(bad)}`)
    assert.equal(out.reason, 'unsafe-form')
  }
})

test('realpathGuard 负例（归属/逃逸）：root 缺失 → root-unresolvable；既有 symlink 外逃 → outside-root；dangling 外指 → symlink-escape', () => {
  const dir = mkdtemp()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-outside-'))
  fs.writeFileSync(path.join(outside, 'secret.md'), 'OUT')
  // root 缺失
  assert.deepEqual(realpathGuard(path.join(dir, 'no-root'), 'a.md'),
    { ok: false, reason: 'root-unresolvable' })
  // 既有 symlink：root 内入口指向 root 外文件 → realpath 归一后越 root
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(dir, 'esc.md'))
  assert.deepEqual(realpathGuard(dir, 'esc.md'), { ok: false, reason: 'outside-root' })
  // dangling symlink：root 内入口指向 root 外不存在文件 → 逃逸意图判拒
  fs.symlinkSync(path.join(outside, 'nope.md'), path.join(dir, 'dangle.md'))
  assert.deepEqual(realpathGuard(dir, 'dangle.md'), { ok: false, reason: 'symlink-escape' })
})

test('realpathGuard 正例：普通/嵌套（exists:true）、新建路径（exists:false）、root 内 symlink 归一', () => {
  const dir = mkdtemp()
  const rootReal = fs.realpathSync(dir)
  fs.mkdirSync(path.join(dir, 'sub'))
  fs.writeFileSync(path.join(dir, 'sub', 'ok.md'), 'x')
  // 普通既有文件
  const a = realpathGuard(dir, 'sub/ok.md')
  assert.equal(a.ok, true)
  assert.equal(a.exists, true)
  assert.equal(a.real, path.join(rootReal, 'sub', 'ok.md'))
  // 新建路径（父目录在）：写侧目标可判安全
  const b = realpathGuard(dir, 'sub/new.md')
  assert.deepEqual(b, { ok: true, real: path.join(rootReal, 'sub', 'new.md'), exists: false })
  // root 内 symlink（指向 root 内子目录）：归一后仍属 root → 放行
  fs.symlinkSync(path.join(rootReal, 'sub'), path.join(dir, 'alias'))
  const c = realpathGuard(dir, 'alias/ok.md')
  assert.equal(c.ok, true)
  assert.equal(c.exists, true)
  assert.equal(c.real, path.join(rootReal, 'sub', 'ok.md'), 'symlink 链归一到规范路径')
  // root 自身是 symlink 也归一
  const linkRoot = path.join(path.dirname(dir), `${path.basename(dir)}-link`)
  fs.symlinkSync(rootReal, linkRoot)
  const d = realpathGuard(linkRoot, 'sub/ok.md')
  assert.equal(d.ok, true)
  assert.equal(d.real, path.join(rootReal, 'sub', 'ok.md'))
  fs.rmSync(linkRoot, { recursive: true, force: true })
})

// ── ⑥ journal ────────────────────────────────────────────────────────────────

test('journal 往返：既有文件 save → 改 → rollback 字节还原 + sha256/mode 对账', async () => {
  const dir = mkdtemp()
  const f = path.join(dir, 'page.md')
  const orig = '# 原文\nsha256: aaa\n'
  fs.writeFileSync(f, orig, { mode: 0o640 })
  const snap = await journalSave(f)
  assert.equal(snap.existed, true)
  assert.equal(snap.content.toString('utf8'), orig)
  assert.equal(snap.sha256, sha256(Buffer.from(orig)), '快照记录 sha256（hr98w 对账面）')
  assert.equal(snap.mode & 0o777, 0o640, '快照记录 mode（逆放保权限）')
  // 改动（经 writeAtomic 原子换新）
  await writeAtomic(f, '# 改后\nsha256: bbb\n', { mode: snap.mode })
  assert.notEqual(fs.readFileSync(f, 'utf8'), orig)
  // 逆放
  await journalRollback(snap)
  const back = fs.readFileSync(f, 'utf8')
  assert.equal(back, orig, '字节级还原')
  assert.equal(sha256(Buffer.from(back)), snap.sha256, '还原后 sha256 与快照一致')
  assert.equal(fs.statSync(f).mode & 0o777, 0o640, '权限还原')
})

test('journal 往返：不存在文件 save（existed:false）→ 创建后 rollback 删除；重复 rollback 幂等', async () => {
  const dir = mkdtemp()
  const f = path.join(dir, 'ghost.md')
  const snap = await journalSave(f)
  assert.deepEqual(snap, { file: f, existed: false, content: null, sha256: null, mode: null })
  await writeAtomic(f, '事后创建')
  assert.equal(fs.existsSync(f), true)
  await journalRollback(snap)
  assert.equal(fs.existsSync(f), false, '快照时不存在 → 逆放即删除')
  await journalRollback(snap), await journalRollback(snap)
  assert.equal(fs.existsSync(f), false, '重复逆放幂等（force 忽略 ENOENT）')
})

test('journal 多文件逆放（T12 CRUD 组合范式）：双快照 → 双改 → 逆序回滚全还原', async () => {
  const dir = mkdtemp()
  const f1 = path.join(dir, 'one.md')
  const f2 = path.join(dir, 'two.md')
  fs.writeFileSync(f1, 'ONE-orig')
  fs.writeFileSync(f2, 'TWO-orig')
  const snaps = [await journalSave(f1), await journalSave(f2)]
  await writeAtomic(f1, 'ONE-changed')
  await writeAtomic(f2, 'TWO-changed')
  for (const s of [...snaps].reverse()) await journalRollback(s)
  assert.equal(fs.readFileSync(f1, 'utf8'), 'ONE-orig')
  assert.equal(fs.readFileSync(f2, 'utf8'), 'TWO-orig')
  assert.deepEqual(fs.readdirSync(dir).sort(), ['one.md', 'two.md'], '无残留')
})
