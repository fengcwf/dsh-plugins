// 分享访问面测试（T8）：checkAccess 校验语义 + 404 不泄露存在性（同形响应）+ 一次性消耗 +
// 每 IP 120/min 限流恰界 + OW-INV-2 角色分级范围模型。/ob_share/ HTTP 直出归 T9，本文件锁模型面。
// 契约锚点（PRODUCT.md 权威编号）：
//   OW-INV-2  分享面=live 受限面：笔记分享（写）=仅内容编辑；文件夹分享（写）=目录内新建/编辑/删除/改名
//   OW-INV-2b 校验失败/过期/撤销→404 不泄露存在性；每 IP 120/min 限流
// 真验零 mock：真 tmp vault、真 scrypt、真 withFileLock 并发（10 并发一次性恰 1 成功）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RATE_LIMIT_PER_MINUTE,
  RATE_WINDOW_MS,
  OPERATIONS,
  createRateLimiter,
  createShare,
  listShares,
  revokeShare,
  checkAccess,
  resolveSharePath,
  shareAllowsOperation,
} from '../lib/share.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-share-access', import.meta.url))

function tmpVault(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  fs.cpSync(path.join(FIXTURES, 'vault'), dir, { recursive: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

// ── 校验成功形 ─────────────────────────────────────────────────────────────
test('checkAccess 成功形：ok:true + share 无 passwordHash 键；密码分享正/误/缺', async (t) => {
  const root = tmpVault(t)
  const { share, password } = await createShare(root, { target: 'notes/a.md', role: 'write', autoPassword: true })
  const ok = await checkAccess(root, { token: share.token, password })
  assert.equal(ok.ok, true)
  assert.ok(!('passwordHash' in ok.share), '成功形绝不外泄 passwordHash')
  assert.equal(ok.share.target, 'notes/a.md')
  assert.equal(ok.share.role, 'write')
  assert.equal(ok.share.hasPassword, true)
  const wrong = await checkAccess(root, { token: share.token, password: 'nope' })
  assert.equal(wrong.ok, false)
  const missing = await checkAccess(root, { token: share.token })
  assert.equal(missing.ok, false)
})

// ── ③ 404 不泄露存在性：全失败形态同形响应 ─────────────────────────────────
test('③ 404 同形矩阵：校验失败/过期/撤销/一次性已消耗/不存在/坏 token 形/配置禁用 全同形', async (t) => {
  const root = tmpVault(t)
  const { share: pwShare, password } = await createShare(root, { target: 'notes/a.md', role: 'read', autoPassword: true })
  const past = Date.now() - 1000
  const { share: expired } = await createShare(root, { target: 'notes/b.md', role: 'read', expiresAt: past })
  const { share: rev } = await createShare(root, { target: 'notes/c.md', role: 'read' })
  await revokeShare(root, rev.token)
  const { share: oneShot } = await createShare(root, { target: 'sub', role: 'read', oneShot: true })
  const first = await checkAccess(root, { token: oneShot.token })
  assert.equal(first.ok, true, '一次性首访成功（供后续同形对比）')

  const denials = {
    wrongPassword: await checkAccess(root, { token: pwShare.token, password: 'wrong' }),
    missingPassword: await checkAccess(root, { token: pwShare.token }),
    expired: await checkAccess(root, { token: expired.token }),
    revoked: await checkAccess(root, { token: rev.token }),
    consumed: await checkAccess(root, { token: oneShot.token }),
    nonexistent: await checkAccess(root, { token: 'x'.repeat(43) }),
    badTokenShape: await checkAccess(root, { token: '../etc/passwd' }),
    emptyToken: await checkAccess(root, { token: '' }),
    disabled: await checkAccess(root, { token: pwShare.token, password }, { config: { share: { enabled: false } } }),
  }
  const shapes = Object.entries(denials)
  const [firstName, firstShape] = shapes[0]
  assert.equal(firstShape.ok, false)
  assert.equal(firstShape.status, 404, '统一定性 404')
  for (const [name, shape] of shapes) {
    assert.deepEqual(shape, firstShape, `${name} 必须与 ${firstName} 深度同形`)
    assert.equal(JSON.stringify(shape), JSON.stringify(firstShape), `${name} 序列化逐字节同（键序一致）`)
    assert.ok(!JSON.stringify(shape).includes(pwShare.token), `${name} 不得回显 token`)
  }
})

test('③ 同形硬断言：失败响应恰为 {ok:false,status:404,code,message} 固定四键、消息常量', async (t) => {
  const root = tmpVault(t)
  const d = await checkAccess(root, { token: 'y'.repeat(43) })
  assert.deepEqual(Object.keys(d), ['ok', 'status', 'code', 'message'])
  assert.deepEqual(d, { ok: false, status: 404, code: 'not_found', message: '分享不存在或已失效' })
  assert.ok(Object.isFrozen(d), '冻结形防调用方篡改同形')
})

// ── 到期恰界 / 撤销即时失效 ────────────────────────────────────────────────
test('到期恰界：now<expiresAt 通过、now≥expiresAt 404 形（注入时钟恰界）', async (t) => {
  const root = tmpVault(t)
  const T = Date.now() + 60_000
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read', expiresAt: T })
  const before = await checkAccess(root, { token: share.token }, { now: T - 1 })
  assert.equal(before.ok, true, '恰界内通过')
  const at = await checkAccess(root, { token: share.token }, { now: T })
  assert.equal(at.ok, false, '恰界点已过期')
  assert.equal(at.status, 404)
})

test('撤销即时失效：revokeShare 返回后同 token 立即 404 形', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  assert.equal((await checkAccess(root, { token: share.token })).ok, true)
  await revokeShare(root, share.token)
  const after = await checkAccess(root, { token: share.token })
  assert.equal(after.ok, false)
  assert.equal(after.status, 404, '撤销即失效，不缓存宽限')
})

// ── ⑤ 一次性消耗语义 ──────────────────────────────────────────────────────
test('⑤ 一次性消耗：首过→二次 404 形；consumedAt 落盘', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read', oneShot: true })
  const first = await checkAccess(root, { token: share.token })
  assert.equal(first.ok, true)
  const entry = JSON.parse(fs.readFileSync(path.join(root, '.ob-share', `${share.token}.json`), 'utf8'))
  assert.equal(typeof entry.consumedAt, 'number', '消耗必须持久化（重启不失效成重放）')
  const second = await checkAccess(root, { token: share.token })
  assert.equal(second.ok, false)
  assert.equal(second.status, 404)
})

test('⑤ 失败校验不消耗：错密码 404 后，正确密码仍可过（一次性只吃成功）', async (t) => {
  const root = tmpVault(t)
  const { share, password } = await createShare(root, { target: 'notes/a.md', role: 'read', oneShot: true, autoPassword: true })
  const wrong = await checkAccess(root, { token: share.token, password: 'wrong' })
  assert.equal(wrong.ok, false)
  const still = await checkAccess(root, { token: share.token, password })
  assert.equal(still.ok, true, '失败尝试不得消耗一次性')
})

test('⑤ 并发一次性：10 并发真锁竞态恰 1 成功（withFileLock 串行化消耗）', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read', oneShot: true })
  const results = await Promise.all(Array.from({ length: 10 }, () => checkAccess(root, { token: share.token })))
  const okCount = results.filter((r) => r.ok).length
  assert.equal(okCount, 1, `恰 1 成功（实得 ${okCount}）`)
})

// ── ④ 每 IP 120/min 限流恰界 ──────────────────────────────────────────────
test('④ 限流恰界：120 过、121 拒、窗口内持续拒、恰界 60000ms 滑出恢复、IP 隔离', () => {
  const rl = createRateLimiter({ limit: RATE_LIMIT_PER_MINUTE, windowMs: RATE_WINDOW_MS })
  assert.equal(RATE_WINDOW_MS, 60_000, '窗口常量=1min')
  for (let i = 0; i < 120; i++) {
    const v = rl.check('1.1.1.1', 1000)
    assert.equal(v.allowed, true, `第 ${i + 1} 次必须过（恰界含）`)
    assert.equal(v.remaining, 119 - i, '剩余数逐次递减')
  }
  assert.equal(rl.check('1.1.1.1', 1000).allowed, false, '第 121 次拒')
  assert.equal(rl.check('1.1.1.1', 59_999).allowed, false, '窗口内持续拒')
  assert.equal(rl.check('1.1.1.1', 60_999).allowed, false, '恰界 60000ms 整仍在窗（1000+59999<60000）')
  assert.equal(rl.check('1.1.1.1', 61_000).allowed, true, '60000ms 滑出（1000+60000 不再 <窗口）恢复')
  assert.equal(rl.check('2.2.2.2', 1000).allowed, true, 'IP 隔离：他 IP 不受累')
})

test('④ 限流响应统一形：超限后存在/不存在 token 同 429 形（不泄露存在性）；缺 ip fail-closed', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000 })
  await checkAccess(root, { token: share.token, ip: '9.9.9.9' }, { limiter: rl }) // 消耗配额
  const valid = await checkAccess(root, { token: share.token, ip: '9.9.9.9' }, { limiter: rl })
  const invalid = await checkAccess(root, { token: 'z'.repeat(43), ip: '9.9.9.9' }, { limiter: rl })
  assert.equal(valid.ok, false)
  assert.equal(valid.status, 429, '限流=429（与 404 区分定性）')
  assert.deepEqual(valid, invalid, '存在/不存在 token 的限流响应逐字段同形')
  assert.equal(JSON.stringify(valid), JSON.stringify(invalid))
  assert.equal((await checkAccess(root, { token: share.token }, { limiter: rl })).status, 429, '缺 ip→fail-closed 限流')
  assert.deepEqual(Object.keys(valid), ['ok', 'status', 'code', 'message'])
})

// ── 时序侧信道：一校验恰一次 scrypt（dummy 在场）─────────────────────────
test('时序侧信道：不存在 token 校验耗时 ≥20ms（dummy scrypt 在场，失败路径耗时同量级）', async (t) => {
  const root = tmpVault(t)
  const t0 = performance.now()
  await checkAccess(root, { token: 'q'.repeat(43) })
  const missingMs = performance.now() - t0
  assert.ok(missingMs >= 20, `不存在 token 也要付 scrypt 代价（实得 ${missingMs.toFixed(1)}ms）`)
  const t1 = performance.now()
  await checkAccess(root, { token: '../bad' })
  const badShapeMs = performance.now() - t1
  assert.ok(badShapeMs >= 20, `坏 token 形同款（实得 ${badShapeMs.toFixed(1)}ms）`)
})

test('成功访问计数：accessCount/lastAccessAt 递增（guest 面）', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  await checkAccess(root, { token: share.token })
  const { shares } = await listShares(root)
  assert.equal(shares[0].accessCount, 1)
  assert.equal(typeof shares[0].lastAccessAt, 'number')
})

// ── OW-INV-2 角色分级 + 范围模型 ──────────────────────────────────────────
function shareOf(root, target, role, extra = {}) {
  return createShare(root, { target, role, ...extra }).then((r) => r.share)
}

test('OW-INV-2 笔记分享（写）=仅内容编辑：edit✓、create/delete/rename✗、编辑他文件✗', async (t) => {
  const root = tmpVault(t)
  const fileWrite = await shareOf(root, 'notes/a.md', 'write', { password: 'pw' })
  assert.equal(shareAllowsOperation(fileWrite, 'edit', ''), true, '本体内容编辑')
  assert.equal(shareAllowsOperation(fileWrite, 'edit', 'a.md'), true, '按名寻址同文件')
  assert.equal(shareAllowsOperation(fileWrite, 'read', ''), true)
  assert.equal(shareAllowsOperation(fileWrite, 'create', ''), false, '笔记分享不得新建')
  assert.equal(shareAllowsOperation(fileWrite, 'delete', ''), false, '笔记分享不得删除')
  assert.equal(shareAllowsOperation(fileWrite, 'rename', ''), false, '笔记分享不得改名')
  assert.equal(shareAllowsOperation(fileWrite, 'edit', 'b.md'), false, '范围外文件')
  const fileRead = await shareOf(root, 'notes/b.md', 'read')
  assert.equal(shareAllowsOperation(fileRead, 'read', ''), true)
  assert.equal(shareAllowsOperation(fileRead, 'edit', ''), false, '只读角色禁写')
})

test('OW-INV-2 文件夹分享（写）=目录内新建/编辑/删除/改名：内部四操作✓、目录本体改删✗', async (t) => {
  const root = tmpVault(t)
  const dirWrite = await shareOf(root, 'notes', 'write', { password: 'pw' })
  assert.equal(shareAllowsOperation(dirWrite, 'create', 'new.md'), true, '目录内新建')
  assert.equal(shareAllowsOperation(dirWrite, 'edit', 'a.md'), true, '目录内编辑')
  assert.equal(shareAllowsOperation(dirWrite, 'delete', 'a.md'), true, '目录内删除')
  assert.equal(shareAllowsOperation(dirWrite, 'rename', 'a.md'), true, '目录内改名')
  assert.equal(shareAllowsOperation(dirWrite, 'read', ''), true, '目录本体可读（列表）')
  assert.equal(shareAllowsOperation(dirWrite, 'delete', ''), false, '目录本体不可删（范围=目录内）')
  assert.equal(shareAllowsOperation(dirWrite, 'rename', ''), false, '目录本体不可改名')
  assert.equal(shareAllowsOperation(dirWrite, 'create', ''), false, '目录本体不是新建落点')
  assert.equal(shareAllowsOperation(dirWrite, 'create', 'sub/x.md'), true, '范围含子层级（存在性另管）')
  const dirRead = await shareOf(root, 'sub', 'read')
  for (const op of OPERATIONS) {
    if (op === 'read') continue
    assert.equal(shareAllowsOperation(dirRead, op, 'deep.md'), false, `只读角色禁 ${op}`)
  }
  assert.equal(shareAllowsOperation(dirRead, 'read', 'deep.md'), true)
})

test('OW-INV-2 越范围/穿越负例：../、绝对、NUL、反斜杠、越目录全拒（两类型×两角色矩阵）', async (t) => {
  const root = tmpVault(t)
  const shares = [
    await shareOf(root, 'notes/a.md', 'read'),
    await shareOf(root, 'notes/a.md', 'write', { password: 'pw' }),
    await shareOf(root, 'notes', 'read'),
    await shareOf(root, 'notes', 'write', { password: 'pw' }),
  ]
  const bads = ['../x.md', '..', 'notes/../../x.md', '/etc/passwd', 'C:/win.md', 'a\\b.md', 'a\0b.md', '../notes']
  for (const s of shares) {
    for (const bad of bads) {
      for (const op of OPERATIONS) {
        assert.equal(shareAllowsOperation(s, op, bad), false, `${s.target}[${s.role}] ${op} ${JSON.stringify(bad)} 必须拒`)
      }
    }
    assert.equal(resolveSharePath(s, '../x.md').ok, false, 'resolveSharePath 同围栏')
    assert.equal(shareAllowsOperation(s, 'read', 42), false, '非字符串 subPath fail-closed')
    assert.equal(resolveSharePath(42, 'x').ok, false, '坏 share 形 fail-closed')
  }
})

test('resolveSharePath 形：file 空/basename/自身路径→目标本体；dir 子路径→target/sub；范围外 {ok:false}', async (t) => {
  const root = tmpVault(t)
  const fileShare = await shareOf(root, 'notes/a.md', 'read')
  assert.deepEqual(resolveSharePath(fileShare, ''), { ok: true, path: 'notes/a.md' })
  assert.deepEqual(resolveSharePath(fileShare, 'a.md'), { ok: true, path: 'notes/a.md' })
  assert.deepEqual(resolveSharePath(fileShare, 'notes/a.md'), { ok: true, path: 'notes/a.md' }, '自身 vault 路径同指一文件')
  assert.equal(resolveSharePath(fileShare, 'b.md').ok, false)
  assert.equal(resolveSharePath(fileShare, 'notes/b.md').ok, false)
  const dirShare = await shareOf(root, 'notes', 'read')
  assert.deepEqual(resolveSharePath(dirShare, 'x.md'), { ok: true, path: 'notes/x.md' })
  assert.deepEqual(resolveSharePath(dirShare, 'sub/x.md'), { ok: true, path: 'notes/sub/x.md' })
  assert.deepEqual(resolveSharePath(dirShare, ''), { ok: true, path: 'notes' })
  assert.equal(resolveSharePath(dirShare, '../sub/deep.md').ok, false)
  // share-root-relative 语义：guest 子路径永在分享根内——'notes2/x.md' 是根内子名（落 notes/notes2/x.md），
  // 绝不落到 notes2 兄弟目录（含入性由构造保证）
  assert.deepEqual(resolveSharePath(dirShare, 'notes2/x.md'), { ok: true, path: 'notes/notes2/x.md' })
})

test('范围≠存在：范围内不存在路径仍判在范围（存在性/405 定性归 T9）', async (t) => {
  const root = tmpVault(t)
  const dirShare = await shareOf(root, 'notes', 'read')
  assert.equal(shareAllowsOperation(dirShare, 'read', 'ghost/never.md'), true, 'scope 只判范围不判存在')
})

// ── T8 fix r1：C-1 自指围栏 / I-1 fail-open 复断言 / I-2 限流信封 ─────────────
test('C-1 自指围栏负例矩阵：任意分享 × .ob-share/*/.trash/*/敏感名 subPath × 5 操作全拒', async (t) => {
  const root = tmpVault(t)
  const shares = [
    await shareOf(root, 'notes/a.md', 'read'),
    await shareOf(root, 'notes/a.md', 'write', { password: 'pw' }),
    await shareOf(root, 'notes', 'read'),
    await shareOf(root, 'notes', 'write', { password: 'pw' }),
    await shareOf(root, 'INDEX.md', 'read'),
    await shareOf(root, 'sub', 'write', { password: 'pw' }),
  ]
  const forbidden = [
    '.ob-share', '.ob-share/anything.json', '.OB-SHARE/x.json', 'sub/.ob-share/y.json',
    '.trash', '.trash/x.md', '.TRASH/notes/x.md', 'a/.trash/b.md',
    'x.pem', '.env', 'notes/.env/z.md', 'deep.key.backup', 'secrets.pem.', ' id_rsa',
  ]
  for (const s of shares) {
    for (const sub of forbidden) {
      assert.equal(resolveSharePath(s, sub).ok, false, `${s.target}[${s.role}] resolve ${JSON.stringify(sub)} 必须拒`)
      for (const op of OPERATIONS) {
        assert.equal(shareAllowsOperation(s, op, sub), false, `${s.target}[${s.role}] ${op} ${JSON.stringify(sub)} 必须拒`)
      }
    }
  }
})

test('C-1 篡改条目纵深：target=. 或 .ob-share 的手写条目→resolveSharePath/shareAllowsOperation 全拒', async (t) => {
  const root = tmpVault(t)
  const tampered = [
    { token: 'x'.repeat(43), target: '.', targetType: 'dir', role: 'write' },
    { token: 'y'.repeat(43), target: '.ob-share', targetType: 'dir', role: 'write' },
    { token: 'z'.repeat(43), target: '.trash', targetType: 'dir', role: 'write' },
    { token: 'w'.repeat(43), target: 'x.pem', targetType: 'file', role: 'write' },
  ]
  for (const s of tampered) {
    for (const sub of ['', '.ob-share/t.json', 'x.md']) {
      assert.equal(resolveSharePath(s, sub).ok, false, `篡改条目 ${s.target} ${JSON.stringify(sub)} 必须拒`)
      for (const op of OPERATIONS) {
        assert.equal(shareAllowsOperation(s, op, sub), false, `篡改条目 ${s.target} ${op} ${JSON.stringify(sub)} 必须拒`)
      }
    }
  }
  assert.equal(resolveSharePath(42, 'x').ok, false, '坏 share 形仍 fail-closed')
})

test('I-1 fail-open 复断言：盘上手写 role=write 无 passwordHash→同形 404（绝不免密放行）', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const file = path.join(root, '.ob-share', `${share.token}.json`)
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
  entry.role = 'write'
  delete entry.passwordHash
  fs.writeFileSync(file, JSON.stringify(entry))
  const res = await checkAccess(root, { token: share.token })
  assert.deepEqual(res, { ok: false, status: 404, code: 'not_found', message: '分享不存在或已失效' }, 'write 无密码=不变量破坏，同形 404')
  const ref = await checkAccess(root, { token: 'x'.repeat(43) })
  assert.equal(JSON.stringify(res), JSON.stringify(ref), '与不存在 token 逐字节同形')
})

test('I-2 限流 fail-closed 信封：limiter.check 抛异常→同形 404（绝不外抛）；缺 ip 仍 429 统一形', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const throwing = { check() { throw new Error('limiter boom') } }
  const res = await checkAccess(root, { token: share.token, ip: '1.2.3.4' }, { limiter: throwing })
  assert.deepEqual(res, { ok: false, status: 404, code: 'not_found', message: '分享不存在或已失效' }, 'limiter.check 异常落同形 404')
  const ref = await checkAccess(root, { token: 'x'.repeat(43) })
  assert.equal(JSON.stringify(res), JSON.stringify(ref), '与不存在 token 逐字节同形')
  const noIp = await checkAccess(root, { token: share.token }, { limiter: throwing })
  assert.equal(noIp.status, 429, '缺 ip 先判 fail-closed 限流（429 统一形，口径不变）')
})

// ── T8 fix r2：C-1 同类残余（CIFS/SMB 别名归一缺口——guest 面/篡改面）──────────
test('C-1 fix r2 篡改矩阵（别名形）：.ob-share./.trash./根 target × <token>.json subPath 全拒', async (t) => {
  const tok = 'A'.repeat(43)
  const entrySub = `${tok}.json`
  const tampered = [
    { target: '.ob-share.', targetType: 'dir', role: 'write', subs: [entrySub] },
    { target: ' .trash.', targetType: 'dir', role: 'write', subs: [entrySub] },
    { target: '. ', targetType: 'dir', role: 'write', subs: [`.ob-share./${entrySub}`, entrySub] },
    { target: ' .', targetType: 'dir', role: 'write', subs: [`.ob-share./${entrySub}`, entrySub] },
    { target: '.trash.', targetType: 'dir', role: 'write', subs: [entrySub] },
  ]
  for (const s of tampered) {
    const share = { token: tok, ...s, oneShot: false, revoked: false }
    for (const sub of s.subs) {
      assert.equal(resolveSharePath(share, sub).ok, false, `篡改条目 ${JSON.stringify(s.target)} × ${JSON.stringify(sub)} resolve 必须拒`)
      for (const op of OPERATIONS) {
        assert.equal(shareAllowsOperation(share, op, sub), false, `篡改条目 ${JSON.stringify(s.target)} ${op} × ${JSON.stringify(sub)} 必须拒`)
      }
    }
  }
})

test('C-1 fix r2 guest subPath 别名残余：.ob-share./.trash. 尾随 [. ]/前导空格形经 subPath 全拒（合法分享同判）', async (t) => {
  const root = tmpVault(t)
  const tok = 'A'.repeat(43)
  const entrySub = `${tok}.json`
  const shares = [
    await shareOf(root, 'notes/a.md', 'read'),
    await shareOf(root, 'notes/a.md', 'write', { password: 'pw' }),
    await shareOf(root, 'notes', 'read'),
    await shareOf(root, 'notes', 'write', { password: 'pw' }),
    await shareOf(root, 'sub', 'write', { password: 'pw' }),
  ]
  const forbidden = [
    `.ob-share./${entrySub}`, ` .ob-share./${entrySub}`, '.ob-share. ', '.OB-SHARE./x.json',
    `.trash./${entrySub}`, ' .trash./x.md', 'sub/.ob-share./y.json', '.trash. ',
    '. /.. ', '.. /x.md', ' .. /x.md', 'x.md/.. /y.md',
  ]
  for (const s of shares) {
    for (const sub of forbidden) {
      assert.equal(resolveSharePath(s, sub).ok, false, `${s.target}[${s.role}] resolve ${JSON.stringify(sub)} 必须拒`)
      for (const op of OPERATIONS) {
        assert.equal(shareAllowsOperation(s, op, sub), false, `${s.target}[${s.role}] ${op} ${JSON.stringify(sub)} 必须拒`)
      }
    }
  }
})

test('C-1 fix r2 正例不回退：subPath 中文/点文件显式正例仍可达（别名归一不误杀）', async (t) => {
  const root = tmpVault(t)
  const dirShare = await shareOf(root, 'notes', 'read')
  assert.deepEqual(resolveSharePath(dirShare, '中文/今日.md'), { ok: true, path: 'notes/中文/今日.md' }, '中文 subPath 正例')
  assert.deepEqual(resolveSharePath(dirShare, '.hidden-note.md'), { ok: true, path: 'notes/.hidden-note.md' }, '点文件 subPath 正例')
  assert.equal(shareAllowsOperation(dirShare, 'read', '中文/今日.md'), true, '中文 subPath read 放行')
  assert.equal(shareAllowsOperation(dirShare, 'read', '.hidden-note.md'), true, '点文件 subPath read 放行')
  assert.deepEqual(resolveSharePath(dirShare, '. /x.md'), { ok: true, path: 'notes/x.md' }, '根族别名段（. ）归一≡./ 同义，不误拒')
})
