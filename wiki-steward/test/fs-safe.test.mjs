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
  writeAtomic, withFileLock, withLeaseLock, realpathGuard, journalSave, journalRollback,
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

test('realpathGuard 负例（链式 symlink 逃逸，审查 Important #1）：两跳链末段缺失必拒 + 单跳/自环/深链；链全在 root 内不误拒', () => {
  const dir = mkdtemp()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-outside-'))
  const rootReal = fs.realpathSync(dir)
  try {
    // 两跳链（审查同款探针）：a -> b（b 也在 root 内）、b -> root 外目录；末段缺失（outside/f.md 不存在）
    fs.symlinkSync('b', path.join(dir, 'a'))
    fs.symlinkSync(outside, path.join(dir, 'b'))
    assert.deepEqual(realpathGuard(dir, 'a/f.md'), { ok: false, reason: 'symlink-escape' },
      '两跳链围栏必须拒（修复前 {ok:true, exists:false} → 消费者按 real 写穿 root 外）')
    // 同布景但末段存在：realpath 主判归一后越 root
    fs.writeFileSync(path.join(outside, 'g.md'), 'OUT')
    assert.deepEqual(realpathGuard(dir, 'a/g.md'), { ok: false, reason: 'outside-root' })
    // 单跳：root 内 link -> root 外目录、末段缺失
    fs.symlinkSync(outside, path.join(dir, 'one'))
    assert.deepEqual(realpathGuard(dir, 'one/f.md'), { ok: false, reason: 'symlink-escape' })
    // 自环：self -> self（与主判 ELOOP 同语义拒）
    fs.symlinkSync('self', path.join(dir, 'self'))
    assert.deepEqual(realpathGuard(dir, 'self/f.md'), { ok: false, reason: 'symlink-escape' })
    assert.deepEqual(realpathGuard(dir, 'self'), { ok: false, reason: 'symlink-escape' })
    // 深链（三跳）：x -> y -> z -> root 外目录、末段缺失
    fs.symlinkSync('y', path.join(dir, 'x'))
    fs.symlinkSync('z', path.join(dir, 'y'))
    fs.symlinkSync(outside, path.join(dir, 'z'))
    assert.deepEqual(realpathGuard(dir, 'x/f.md'), { ok: false, reason: 'symlink-escape' })
    // 正例对照：链全在 root 内（p -> q -> sub）且末段缺失 → 放行 exists:false（fallback 不误拒）
    fs.mkdirSync(path.join(dir, 'sub'))
    fs.writeFileSync(path.join(dir, 'sub', 'ok.md'), 'x')
    fs.symlinkSync('q', path.join(dir, 'p'))
    fs.symlinkSync('sub', path.join(dir, 'q'))
    assert.deepEqual(realpathGuard(dir, 'p/new.md'),
      { ok: true, real: path.join(rootReal, 'p', 'new.md'), exists: false })
    // 正例对照：链全在 root 内且末段存在 → 归一到真实路径
    const e = realpathGuard(dir, 'p/ok.md')
    assert.equal(e.ok, true)
    assert.equal(e.exists, true)
    assert.equal(e.real, path.join(rootReal, 'sub', 'ok.md'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

// ── ⑥ journal ────────────────────────────────────────────────────────────────

test('journal 往返：既有文件 save → 改 → rollback 字节还原 + sha256/mode 对账', async () => {
  const dir = mkdtemp()
  const f = path.join(dir, 'page.md')
  const orig = '# 原文\nsha256: aaa\n'
  fs.writeFileSync(f, orig, { mode: 0o640 })
  fs.chmodSync(f, 0o640) // 模式钉定（终审 fix-wave ④）：writeFileSync 的 mode 过 umask 截损（0077 下成 0o600），chmod 不受 umask 影响——fixture 摆脱 umask 环境依赖
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
  // 期望按当前 umask 计算（终审 fix-wave ④）：逆放经 writeAtomic=「mode 经 umask 生效」
  // （T8 挂账 deferred minor，journal 同面，triage 结论不动）——022 下=0o640，0077 下=0o600，全套摆脱 umask 环境依赖
  assert.equal(fs.statSync(f).mode & 0o777, 0o640 & ~process.umask(), '权限还原（经 umask 生效）')
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

// ── ⑦ realpathGuard 多段中间链拓扑（T12 围栏加固：全链逐段解引用至真实节点或越 root 即拒） ──
// 拓扑：链接目标本身是多段路径（a -> 'sub/b'），中间段又是 symlink（sub -> root 外）。
// 修复前 symlinksEscape 对归一目标整路径 lstat（中间段被内核静默解引用）→ 末段缺失时 ENOENT
// 被误判「真缺失」放行 → 围栏写穿（消费方按 real 写到 root 外）。以下负例必须全拒。

test('realpathGuard 负例（多段中间链）：a→sub/b + sub→outside + 末段缺失必拒（修复前 {ok:true,exists:false} 写穿）', () => {
  const dir = mkdtemp()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-outside-'))
  try {
    fs.symlinkSync(outside, path.join(dir, 'sub')) // 中间段外指
    fs.symlinkSync(path.join('sub', 'b'), path.join(dir, 'a')) // 多段链接目标：a -> sub/b
    // 末段缺失（outside/b 不存在）：目标自身 / 写侧新文件都必须拒
    assert.deepEqual(realpathGuard(dir, 'a'), { ok: false, reason: 'symlink-escape' },
      '多段链接目标中间段外指：目标自身必须拒（修复前 fallback 放行）')
    assert.deepEqual(realpathGuard(dir, 'a/new.md'), { ok: false, reason: 'symlink-escape' },
      '多段链接目标中间段外指：写侧新文件必须拒')
    // 末段存在：realpath 主判归一后越 root
    fs.writeFileSync(path.join(outside, 'b'), 'OUT')
    assert.deepEqual(realpathGuard(dir, 'a'), { ok: false, reason: 'outside-root' })
    // 穿越 root 外文件之下的路径：realpath ENOTDIR → fallback 逐段解引用在中间段即拒
    // （symlink-escape；与主判 outside-root 双码同效——判据=必拒，不锁具体码）
    const deep = realpathGuard(dir, 'a/new.md')
    assert.equal(deep.ok, false, '末段存在后穿越路径同样必拒')
    assert.ok(deep.reason === 'outside-root' || deep.reason === 'symlink-escape')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

test('realpathGuard 负例（多段中间链深/间接变体）：a→s1/s2/b + s1→outside；a→sub/b + sub→sub2→outside 都拒', () => {
  const dir = mkdtemp()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-outside-'))
  try {
    // 变体①：多段目标更深（s1/s2/b），中间段 s1 外指
    fs.symlinkSync(outside, path.join(dir, 's1'))
    fs.symlinkSync(path.join('s1', 's2', 'b'), path.join(dir, 'a'))
    assert.deepEqual(realpathGuard(dir, 'a/new.md'), { ok: false, reason: 'symlink-escape' },
      '三段链接目标中间段外指必拒')
    assert.deepEqual(realpathGuard(dir, 'a'), { ok: false, reason: 'symlink-escape' })
    // 变体②：中间段自身又是链（sub → sub2 → outside），多段目标 a→sub/b
    fs.symlinkSync('sub2', path.join(dir, 'sub'))
    fs.symlinkSync(outside, path.join(dir, 'sub2'))
    fs.symlinkSync(path.join('sub', 'b'), path.join(dir, 'c'))
    assert.deepEqual(realpathGuard(dir, 'c/new.md'), { ok: false, reason: 'symlink-escape' },
      '中间段链式外指（sub→sub2→outside）同样必须逐段解引用后拒')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

test('realpathGuard 正例（多段链全在 root 内不误拒）：a→sub/b 归一 real、末段缺失放行 exists:false', () => {
  const dir = mkdtemp()
  const rootReal = fs.realpathSync(dir)
  try {
    fs.mkdirSync(path.join(dir, 'sub'))
    fs.mkdirSync(path.join(dir, 'sub', 'b'))
    fs.writeFileSync(path.join(dir, 'sub', 'b', 'ok.md'), 'x')
    fs.symlinkSync(path.join('sub', 'b'), path.join(dir, 'a'))
    const e = realpathGuard(dir, 'a/ok.md')
    assert.equal(e.ok, true)
    assert.equal(e.exists, true)
    assert.equal(e.real, path.join(rootReal, 'sub', 'b', 'ok.md'), '多段链归一到真实路径')
    // 末段缺失（sub/b 存在、new.md 不在）：真缺失放行（不误拒）
    assert.deepEqual(realpathGuard(dir, 'a/new.md'),
      { ok: true, real: path.join(rootReal, 'a', 'new.md'), exists: false })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ── ⑧ withLeaseLock（T12 锁 stale 自愈：lease 时间戳 + 超时接管 + owner token 释放守卫） ──

test('withLeaseLock 互斥 + fresh 锁超时不接管：ELOCKTIMEOUT 且 fn 绝不执行', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'page.md')
  let ran = 0
  await withLeaseLock(target, async () => {
    ran++
    // 持锁期间第二把锁（fresh，未超 lease）必须等到超时且不接管
    await assert.rejects(
      withLeaseLock(target, () => { ran++ }, { waitMs: 120, pollMs: 10, leaseMs: 60_000 }),
      (e) => e?.code === 'ELOCKTIMEOUT',
    )
    assert.equal(fs.existsSync(`${target}.lock`), true, '持锁期间锁目录在场')
  }, { leaseMs: 60_000 })
  assert.equal(ran, 1, 'fn 绝不执行')
  assert.equal(fs.existsSync(`${target}.lock`), false, '释放后锁目录移除')
})

test('withLeaseLock stale 接管：lease 超龄 → 接管成功 + meta.tookOver 留痕 + onTakeover 回调', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'page.md')
  const lockDir = `${target}.lock`
  fs.mkdirSync(lockDir)
  // 陈旧持锁者残迹：lease 时间戳超龄 10 倍
  fs.writeFileSync(path.join(lockDir, 'lease.json'),
    JSON.stringify({ owner: 'dead-owner', at: Date.now() - 600_000 }))
  const takeovers = []
  const r = await withLeaseLock(target, (meta) => {
    assert.equal(meta.tookOver, true, '接管必须留痕（meta.tookOver）')
    assert.ok(meta.staleAgeMs >= 600_000 - 5_000, `staleAgeMs 量级正确（${meta.staleAgeMs}）`)
    return 'ran'
  }, { waitMs: 200, pollMs: 10, leaseMs: 60_000, onTakeover: (m) => takeovers.push(m) })
  assert.equal(r, 'ran')
  assert.equal(takeovers.length, 1, 'onTakeover 留痕回调恰一次')
  assert.equal(takeovers[0].tookOver, true)
  assert.equal(fs.existsSync(lockDir), false, '接管后正常释放')
})

test('withLeaseLock 释放守卫：接管发生后旧持有者 finally 不拆新持有者的锁（owner token）', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'page.md')
  const lockDir = `${target}.lock`
  let releaseA
  const aDone = new Promise((r) => { releaseA = r })
  let gateB
  const bHolds = new Promise((r) => { gateB = r })
  // A 持锁（其临界区挂起），模拟崩溃残留：把 lease 改旧 → B 接管
  const pA = withLeaseLock(target, async () => {
    fs.writeFileSync(path.join(lockDir, 'lease.json'),
      JSON.stringify({ owner: 'whatever', at: Date.now() - 600_000 }))
    await aDone // A 迟迟不释放
  }, { waitMs: 50, pollMs: 5, leaseMs: 60_000 })
  await sleep(30) // 让 A 先拿稳
  const pB = withLeaseLock(target, async (meta) => {
    assert.equal(meta.tookOver, true)
    gateB()
    await new Promise((r) => { setTimeout(r, 120) }) // B 仍在临界区
  }, { waitMs: 500, pollMs: 5, leaseMs: 60_000 })
  await bHolds // B 已接管并持锁
  releaseA() // A 此刻才 finally 释放——绝不能拆掉 B 的锁
  await pA
  assert.equal(fs.existsSync(lockDir), true, 'A 的迟到释放不得移除 B 的锁')
  await pB
  assert.equal(fs.existsSync(lockDir), false, 'B 正常释放后锁移除')
})

test('withLeaseLock 保守语义：无 lease.json 的锁目录（他原语产物）不接管，等待超时', async () => {
  const dir = mkdtemp()
  const target = path.join(dir, 'page.md')
  fs.mkdirSync(`${target}.lock`) // withFileLock 风格残锁（无 lease 文件）
  let ran = false
  await assert.rejects(
    withLeaseLock(target, () => { ran = true }, { waitMs: 100, pollMs: 5, leaseMs: 60_000 }),
    (e) => e?.code === 'ELOCKTIMEOUT',
  )
  assert.equal(ran, false)
  assert.equal(fs.existsSync(`${target}.lock`), true, '无 lease 文件不判 stale、不误删他人锁')
  fs.rmSync(`${target}.lock`, { recursive: true, force: true })
})
