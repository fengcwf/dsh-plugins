// 分享模型测试（T8）：lib/share.js——令牌/密码/敏感清单/创建校验/持久化/管理面数据面（OW-US-8/10）。
// 契约锚点（PRODUCT.md 权威编号）：
//   OW-INV-1 逐条显式生成、默认不对外；写权限必须设访问密码（自动可改）；敏感文件名永不可分享
//   OW-INV-2b 密码可无；设置时自动生成；校验失败/过期/撤销→404 不泄露存在性；每 IP 120/min 限流
// 真验零 mock：真 tmp 文件系统（test/.tmp-share-*）、真 scrypt、真原子写落盘读回。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SENSITIVE_GLOBS,
  TOKEN_BYTES,
  RATE_LIMIT_PER_MINUTE,
  SHARE_DIR,
  generateToken,
  generatePassword,
  hashPassword,
  verifyPassword,
  isSensitiveName,
  isSensitivePath,
  createShare,
  listShares,
  getShare,
  revokeShare,
  updateSharePassword,
  updateShareRole,
  updateShareExpiry,
  checkAccess,
} from '../lib/share.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-share', import.meta.url))

function tmpVault(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  fs.cpSync(path.join(FIXTURES, 'vault'), dir, { recursive: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

// ── ⑥ 令牌不可枚举（长度/熵断言）────────────────────────────────────────────
test('⑥ 令牌不可枚举：base64url 43 字符、解码 32 字节（≥128bit 熵）、字符集锁定', () => {
  const tok = generateToken()
  assert.equal(typeof tok, 'string')
  assert.equal(tok.length, 43, 'randomBytes(32) base64url 恰 43 字符')
  assert.match(tok, /^[A-Za-z0-9_-]+$/, 'base64url 字符集（无 +/= 等文件名/URL 危险字符）')
  assert.equal(Buffer.from(tok, 'base64url').length, TOKEN_BYTES, '解码恰 32 字节 = 256bit ≥ 128bit')
  assert.equal(TOKEN_BYTES, 32, 'TOKEN_BYTES 显式常量=32')
})

test('⑥ 令牌不可枚举：1000 枚零重复 + 非字典序单调（不可由相邻令牌推断）', () => {
  const seen = new Set()
  const order = []
  for (let i = 0; i < 1000; i++) {
    const tok = generateToken()
    seen.add(tok)
    order.push(tok)
  }
  assert.equal(seen.size, 1000, '1000 枚全异')
  const sorted = [...order].sort()
  assert.notDeepEqual(order, sorted, '生成序≠字典序（无单调递增可枚举形态）')
})

// ── ⑦ 密码 hash 非明文 + 加盐 ───────────────────────────────────────────────
test('⑦ 密码 hash：非明文 + 加盐（同密码两次 hash 不同）+ 格式 scrypt$ + 校验正误', () => {
  const pw = generatePassword()
  const h1 = hashPassword(pw)
  const h2 = hashPassword(pw)
  assert.match(h1, /^scrypt\$/, '显式算法前缀（可演进）')
  assert.ok(!h1.includes(pw), '存储绝无明文')
  assert.notEqual(h1, h2, '同密码两次 hash 不同 = 加盐')
  assert.equal(verifyPassword(pw, h1), true)
  assert.equal(verifyPassword(pw + 'x', h1), false)
  assert.equal(verifyPassword('', h1), false, '空密码不算过')
  assert.equal(verifyPassword(pw, 'not-a-hash'), false, '畸形存储→false 非抛')
  assert.equal(verifyPassword(null, h1), false, '非字符串→false')
  assert.throws(() => hashPassword(''), (err) => err.code === 'bad_request', '空密码不可 hash')
})

test('⑦ 自动生成密码：长度/字符集/100 枚零重复（读得出、可改）', () => {
  const seen = new Set()
  for (let i = 0; i < 100; i++) {
    const pw = generatePassword()
    assert.ok(pw.length >= 12, '自动生成密码 ≥12 位')
    assert.match(pw, /^[A-Za-z2-9]+$/, '无易混字符集')
    seen.add(pw)
  }
  assert.equal(seen.size, 100, '100 枚全异')
})

// ── ② 敏感文件名永禁（OW-INV-1）────────────────────────────────────────────
test('② 敏感清单：显式常量清单字面锁定（改清单必须过此测试）', () => {
  assert.deepEqual([...SENSITIVE_GLOBS], [
    '.env*', '*.pem', '*.key', '*.credentials', '.npmrc', '.netrc', '*.p12', '*.pfx',
    'id_rsa*', 'id_dsa*', 'id_ecdsa*', 'id_ed25519*',
  ])
})

test('② 敏感判定：逐类命中 + 大小写 + 精确边界不误杀业务名', () => {
  // 逐类
  for (const name of ['.env', '.env.local', 'server.pem', 'tls.key', 'db.credentials', '.npmrc', '.netrc', 'id_rsa', 'id_rsa.pub', 'id_ed25519', 'a.p12', 'b.pfx']) {
    assert.equal(isSensitiveName(name), true, `必须命中：${name}`)
    assert.equal(isSensitivePath(`notes/${name}`), true, `路径段命中：notes/${name}`)
  }
  assert.equal(isSensitiveName('.ENV'), true, '大小写不敏感（fail-closed）')
  // 精确边界：业务名不误杀
  for (const name of ['notes', 'a.md', 'deep.key.md', 'keyboard.md', 'pemphigus.md', '环境/config.md', '08-unraid.md']) {
    assert.equal(isSensitiveName(name), false, `不得误杀：${name}`)
  }
  assert.equal(isSensitivePath('cert.pem/x.md'), true, '敏感名作目录段同样永禁')
  assert.equal(isSensitivePath('notes/.env/x.md'), true, '中间段命中')
})

test('② createShare 敏感清单逐类负例：全拒 sensitive_name 且零落盘；业务目标照常可分享', async (t) => {
  const root = tmpVault(t)
  const cases = ['.env', 'notes/.env.local', 'x.pem', 'x.key', 'x.credentials', '.npmrc', '.netrc', 'id_rsa', 'id_rsa.pub', 'y.p12', 'z.pfx', 'id_ed25519', 'cert.pem/x.md', 'notes/.env/x.md']
  for (const target of cases) {
    const abs = path.join(root, target)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 's')
    await assert.rejects(() => createShare(root, { target, role: 'read' }), (err) => err.code === 'sensitive_name', `必须拒：${target}`)
    assert.equal(isSensitivePath(target), true, target)
  }
  const ok = await createShare(root, { target: 'notes/a.md', role: 'read' })
  assert.equal(ok.share.target, 'notes/a.md', '业务目标（非敏感名）可分享')
  const { total } = await listShares(root)
  assert.equal(total, 1, '敏感负例零落盘（只余业务目标 1 条）')
})

// ── 显式生成 / 默认不对外（OW-INV-1）───────────────────────────────────────
test('OW-INV-1 逐条显式生成、默认不对外：初始零分享、逐条显式生成互异', async (t) => {
  const root = tmpVault(t)
  const before = await listShares(root)
  assert.equal(before.total, 0, '默认不对外：初始零条')
  const a = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const b = await createShare(root, { target: 'notes', role: 'read' })
  assert.notEqual(a.share.token, b.share.token, '逐条独立令牌')
  const after = await listShares(root)
  assert.equal(after.total, 2, '恰显式生成的两条')
})

// ── ① 写权限必须设访问密码（负例）──────────────────────────────────────────
test('① 写无密码负例：role=write 无密码→拒 password_required+可解释（含 auto 提示）；配置不豁免', async (t) => {
  const root = tmpVault(t)
  await assert.rejects(
    () => createShare(root, { target: 'notes/a.md', role: 'write' }),
    (err) => err.code === 'password_required' && /密码/.test(err.message) && /auto/i.test(err.message),
    '写无密码必须拒且消息可解释（点名密码与 auto 自动生成途径）',
  )
  // OW-INV-1 是不变量级：config.requirePasswordForWrite=false 不豁免
  await assert.rejects(
    () => createShare(root, { target: 'notes/a.md', role: 'write' }, { config: { share: { requirePasswordForWrite: false } } }),
    (err) => err.code === 'password_required',
    '不变量不得被配置关掉',
  )
  const { total } = await listShares(root)
  assert.equal(total, 0, '负例零落盘')
})

test('写权限 + autoPassword：明文恰返回一次；盘上原文零明文；读分享可无密码', async (t) => {
  const root = tmpVault(t)
  const created = await createShare(root, { target: 'notes/a.md', role: 'write', autoPassword: true })
  assert.equal(typeof created.password, 'string', '自动生成明文恰返回一次')
  assert.ok(created.password.length >= 12)
  assert.equal(created.share.hasPassword, true)
  const raw = fs.readFileSync(path.join(root, SHARE_DIR, `${created.share.token}.json`), 'utf8')
  assert.ok(!raw.includes(created.password), '盘上原文绝无明文密码')
  // 密码 + autoPassword 双给 = 形参冲突
  await assert.rejects(() => createShare(root, { target: 'notes/b.md', role: 'read', password: 'x', autoPassword: true }), (err) => err.code === 'bad_request')
  // 读分享无密码（OW-INV-2b 可无密码）
  const read = await createShare(root, { target: 'notes/b.md', role: 'read' })
  assert.equal(read.share.hasPassword, false)
  assert.equal(read.password, null)
  const pass = await checkAccess(root, { token: read.share.token })
  assert.equal(pass.ok, true, '无密码读分享直过')
})

// ── 创建围栏与形参负例 ─────────────────────────────────────────────────────
test('创建围栏负例：穿越/绝对/NUL/盘符 bad_request、不存在 not_found、symlink 拒、内部目录拒', async (t) => {
  const root = tmpVault(t)
  for (const target of ['../outside.md', '/etc/passwd', 'notes/../../x.md', 'a\0b.md', 'C:/win.md', '']) {
    await assert.rejects(() => createShare(root, { target, role: 'read' }), (err) => err.code === 'bad_request', `必须拒：${JSON.stringify(target)}`)
  }
  await assert.rejects(() => createShare(root, { target: 'nope/none.md', role: 'read' }), (err) => err.code === 'not_found')
  fs.symlinkSync(path.join(root, 'notes/a.md'), path.join(root, 'link.md'))
  await assert.rejects(() => createShare(root, { target: 'link.md', role: 'read' }), (err) => err.code === 'bad_request', 'symlink 目标拒（不解引用）')
  fs.mkdirSync(path.join(root, '.trash/notes'), { recursive: true })
  fs.writeFileSync(path.join(root, '.trash/notes/x.md'), 'r')
  await assert.rejects(() => createShare(root, { target: '.trash/notes/x.md', role: 'read' }), (err) => err.code === 'bad_request', '恢复材料不可分享')
  await assert.rejects(() => createShare(root, { target: 'notes', role: 'admin' }), (err) => err.code === 'bad_request', 'role 非法')
  await assert.rejects(() => createShare(root, { role: 'read' }), (err) => err.code === 'bad_request', 'target 缺失')
})

test('形参负例：oneShot/expiresAt/ttlDays 非法值 bad_request', async (t) => {
  const root = tmpVault(t)
  await assert.rejects(() => createShare(root, { target: 'notes/a.md', role: 'read', oneShot: 1 }), (err) => err.code === 'bad_request')
  await assert.rejects(() => createShare(root, { target: 'notes/a.md', role: 'read', expiresAt: 'tomorrow' }), (err) => err.code === 'bad_request')
  await assert.rejects(() => createShare(root, { target: 'notes/a.md', role: 'read', expiresAt: Number.NaN }), (err) => err.code === 'bad_request')
  await assert.rejects(() => createShare(root, { target: 'notes/a.md', role: 'read', ttlDays: 0 }), (err) => err.code === 'bad_request')
  await assert.rejects(() => createShare(root, { target: 'notes/a.md', role: 'read', ttlDays: 'x' }), (err) => err.code === 'bad_request')
})

// ── 持久化（落点/权限/契约键/重载）────────────────────────────────────────
test('持久化：<vaultRoot>/.ob-share/<token>.json 0600、目录 0700、契约键齐备', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const dir = path.join(root, SHARE_DIR)
  const file = path.join(dir, `${share.token}.json`)
  assert.equal(SHARE_DIR, '.ob-share', '落点显式常量')
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700, 'store 目录 0700')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, '条目文件 0600')
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const key of ['token', 'target', 'role', 'expiresAt', 'oneShot', 'revoked', 'createdAt']) {
    assert.ok(key in entry, `契约键缺：${key}`)
  }
  assert.equal(entry.token, share.token)
  assert.equal(entry.target, 'notes/a.md')
  assert.equal(entry.role, 'read')
  assert.equal(entry.oneShot, false)
  assert.equal(entry.revoked, false)
  assert.equal(typeof entry.createdAt, 'number')
})

test('持久化重载：真实落盘（新 listShares 读回同条，非内存态）', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes', role: 'read' })
  const { shares, total } = await listShares(root)
  assert.equal(total, 1)
  assert.equal(shares[0].token, share.token)
  assert.equal(shares[0].target, 'notes')
  assert.equal(shares[0].targetType, 'dir')
  const got = await getShare(root, share.token)
  assert.deepEqual(got, shares[0], 'getShare 与 listShares 同形')
  assert.ok(!('passwordHash' in got), '管理面回读绝不外泄 passwordHash')
})

// ── 到期（默认 TTL / 显式形态）─────────────────────────────────────────────
test('到期参数：缺省=defaultTtlDays 7；ttlDays 3；expiresAt number/ISO/null 三形态', async (t) => {
  const root = tmpVault(t)
  const dflt = await createShare(root, { target: 'notes/a.md', role: 'read' })
  assert.equal(dflt.share.expiresAt, dflt.share.createdAt + 7 * 86_400_000, '缺省 TTL=7 天（config defaultTtlDays）')
  const three = await createShare(root, { target: 'notes/b.md', role: 'read', ttlDays: 3 })
  assert.equal(three.share.expiresAt, three.share.createdAt + 3 * 86_400_000)
  const ms = Date.now() + 60_000
  const num = await createShare(root, { target: 'notes/c.md', role: 'read', expiresAt: ms })
  assert.equal(num.share.expiresAt, ms, 'number 原样')
  const iso = await createShare(root, { target: 'sub', role: 'read', expiresAt: '2030-01-02T03:04:05.000Z' })
  assert.equal(iso.share.expiresAt, Date.parse('2030-01-02T03:04:05.000Z'), 'ISO 归一为 epoch ms')
  const never = await createShare(root, { target: 'INDEX.md', role: 'read', expiresAt: null })
  assert.equal(never.share.expiresAt, null, '显式 null = 永不过期')
  const cfg = await createShare(root, { target: 'notes/a.md', role: 'read' }, { config: { share: { defaultTtlDays: 30 } } })
  assert.equal(cfg.share.expiresAt, cfg.share.createdAt + 30 * 86_400_000, 'config TTL 生效')
})

// ── 管理面数据面（OW-US-10：列表/计数/撤销/密码与权限调整）─────────────────
test('管理面计数：初始 accessCount=0/lastAccessAt=null；成功访问后递增（失败不计）', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  assert.equal(share.accessCount, 0)
  assert.equal(share.lastAccessAt, null)
  await checkAccess(root, { token: share.token })
  await checkAccess(root, { token: share.token })
  await checkAccess(root, { token: 'x'.repeat(43), password: 'wrong' })
  const got = await getShare(root, share.token)
  assert.equal(got.accessCount, 2, '恰成功两次')
  assert.equal(typeof got.lastAccessAt, 'number')
})

test('管理面改密：显式/auto/清除（清除仅读角色）；旧密码失效、新密码可用', async (t) => {
  const root = tmpVault(t)
  const { share, password } = await createShare(root, { target: 'notes/a.md', role: 'read', autoPassword: true })
  const old = await checkAccess(root, { token: share.token, password })
  assert.equal(old.ok, true, '初始密码可用')
  const changed = await updateSharePassword(root, share.token, { password: 'new-pw-1' })
  assert.equal(changed.password, null, '显式密码不回显')
  assert.equal((await checkAccess(root, { token: share.token, password })).ok, false, '旧密码即时失效（404 形）')
  assert.equal((await checkAccess(root, { token: share.token, password: 'new-pw-1' })).ok, true, '新密码可用')
  const auto = await updateSharePassword(root, share.token, { autoPassword: true })
  assert.equal(typeof auto.password, 'string', 'auto 改密返回新明文一次')
  assert.equal((await checkAccess(root, { token: share.token, password: 'new-pw-1' })).ok, false, 'auto 改密后旧密码失效')
  assert.equal((await checkAccess(root, { token: share.token, password: auto.password })).ok, true)
  const cleared = await updateSharePassword(root, share.token, { password: null })
  assert.equal(cleared.share.hasPassword, false)
  assert.equal((await checkAccess(root, { token: share.token })).ok, true, '清除后可无密码访问')
  // 写角色不可清除密码（OW-INV-1）
  const { share: w } = await createShare(root, { target: 'notes/b.md', role: 'write', password: 'wpw' })
  await assert.rejects(() => updateSharePassword(root, w.token, { password: null }), (err) => err.code === 'password_required', '写角色清密码=违不变量必拒')
  await assert.rejects(() => updateSharePassword(root, w.token, {}), (err) => err.code === 'bad_request', '空操作拒')
})

test('管理面调权：read→write 无密码拒 password_required+可解释；带 auto 成功；write→read 允许', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  await assert.rejects(
    () => updateShareRole(root, share.token, 'write'),
    (err) => err.code === 'password_required' && /密码/.test(err.message),
    '升写权限必须先有密码',
  )
  const up = await updateShareRole(root, share.token, 'write', { autoPassword: true })
  assert.equal(up.share.role, 'write')
  assert.equal(typeof up.password, 'string', 'auto 补密码返回明文一次')
  assert.equal((await checkAccess(root, { token: share.token, password: up.password })).ok, true)
  const down = await updateShareRole(root, share.token, 'read')
  assert.equal(down.share.role, 'read')
  assert.equal(down.share.hasPassword, true, '降权保留密码')
  await assert.rejects(() => updateShareRole(root, share.token, 'root'), (err) => err.code === 'bad_request')
})

test('管理面撤销：revoked=true+revokedAt 落盘、幂等、不存在 not_found', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const r1 = await revokeShare(root, share.token)
  assert.equal(r1.share.revoked, true)
  assert.equal(typeof r1.share.revokedAt, 'number')
  const r2 = await revokeShare(root, share.token)
  assert.equal(r2.share.revoked, true, '幂等')
  await assert.rejects(() => revokeShare(root, 'x'.repeat(43)), (err) => err.code === 'not_found')
  await assert.rejects(() => revokeShare(root, '../etc'), (err) => err.code === 'bad_request', 'token 形参围栏（防借 token 穿越）')
})

test('管理面改到期：updateShareExpiry 设/清/非法拒', async (t) => {
  const root = tmpVault(t)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const ms = Date.now() + 123_000
  const set = await updateShareExpiry(root, share.token, ms)
  assert.equal(set.share.expiresAt, ms)
  const cleared = await updateShareExpiry(root, share.token, null)
  assert.equal(cleared.share.expiresAt, null, '显式清=永不过期')
  await assert.rejects(() => updateShareExpiry(root, share.token, 'soon'), (err) => err.code === 'bad_request')
  await assert.rejects(() => updateShareExpiry(root, 'x'.repeat(43), ms), (err) => err.code === 'not_found')
})

test('管理面：share.enabled=false → 创建拒 share_disabled（默认不对外 fail-closed）', async (t) => {
  const root = tmpVault(t)
  await assert.rejects(
    () => createShare(root, { target: 'notes/a.md', role: 'read' }, { config: { share: { enabled: false } } }),
    (err) => err.code === 'share_disabled',
  )
  const { total } = await listShares(root)
  assert.equal(total, 0)
})

test('限流常量口径字面锁定：120/min（显式常量非幻数）', () => {
  assert.equal(RATE_LIMIT_PER_MINUTE, 120)
})
