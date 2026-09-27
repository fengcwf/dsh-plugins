// 分享管理面 HTTP（T10 / OW-US-10 + OW-US-9）：列表/查看计数/撤销/密码与权限调整 + 外网域名设置 + 链接下发。
// 契约锚点：
//   - 鉴权=主 UI 面 requestRejection 缝（T1 惯例/OW-INV-8）：未授权一律 401/403，零副作用。
//   - 管理面错误=可解释（C2① 与 guest 404 冻结形分流）：password_required/sensitive_name/bad_request 细节
//     只走管理面；guest 面一切失败仍是同形 404（④ 跨面实测：管理面撤销 → guest 同形 404）。
//   - 链接=服务端单一来源下发（links:{path,internal,external}，前端零拼接——见 share-links.test.mjs）。
//   - 计数口径（T9 分野）：管理页展示计数=每分享条目查看计数 accessCount（checkAccess 成功次数）；
//     对外脱敏计数恒=痕迹计数（<redacted> 出现处数）——本卡展示层无脱敏计数面，有则照此（报告写明）。
// 真验零 mock：真 node:http 往返 + 真 tmp vault + 真 share-server listener（跨面用例）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'
import { createShareServer } from '../lib/share-server.js'
import { accessDenied, createShare, checkAccess, listShares } from '../lib/share.js'

const TMP = fileURLToPath(new URL('./.tmp-share-mgmt', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

const NOT_FOUND_BODY = '{"ok":false,"status":404,"code":"not_found","message":"分享不存在或已失效"}'

function makeVault(tag) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
  fs.writeFileSync(path.join(root, 'INDEX.md'), '# INDEX\n')
  fs.writeFileSync(path.join(root, 'notes', 'a.md'), '# A\n')
  fs.writeFileSync(path.join(root, 'secret.pem'), 'PRIVATE\n') // 敏感名负例靶
  return root
}

function makeConfig(vault) {
  return {
    vaultRoot: vault,
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    server: { sharePort: 3500, shareHost: '127.0.0.1', trustProxy: [] },
    ui: { pageSize: 50 },
  }
}

// ── 管理面 harness（web-routes.test.mjs 同款：真 node:http 往返，鉴权缝真过）────────
function makeCtx({ rejection } = {}) {
  const routes = new Map()
  return {
    routes,
    ctx: {
      logger: { warn: () => {} },
      webServer: {
        register(route) {
          const key = `${route.kind}:${route.path}`
          if (routes.has(key)) throw new Error(`duplicate route ${key}`)
          routes.set(key, route)
          return () => routes.delete(key)
        },
      },
      connection: { requestRejection: () => rejection },
    },
  }
}

function dispatch(routes, req, res) {
  const pathname = new URL(req.url, 'http://x').pathname
  for (const [, route] of routes) {
    if (route.kind === 'exact' && route.path === pathname) return route.handler(req, res)
  }
  let best
  for (const [, route] of routes) {
    if (route.kind !== 'prefix') continue
    if (pathname !== route.path && !pathname.startsWith(`${route.path}/`)) continue
    if (best === undefined || route.path.length > best.path.length) best = route
  }
  if (best !== undefined) return best.handler(req, res)
  res.writeHead(404)
  res.end()
}

async function withApi(config, fn, opts = {}) {
  const { routes, ctx } = makeCtx(opts)
  registerWebRoutes(ctx, () => config, { distDir: fileURLToPath(new URL('./fixtures/dist', import.meta.url)) })
  const server = http.createServer((req, res) => {
    Promise.resolve(dispatch(routes, req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function postJson(base, route, payload) {
  const res = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  return { status: res.status, body: await res.json() }
}

async function getJson(base, route) {
  const res = await fetch(`${base}${route}`)
  return { status: res.status, body: await res.json(), raw: await res.text().catch(() => '') }
}

const MGMT_ROUTES = [
  ['GET', '/ob/api/shares'],
  ['POST', '/ob/api/shares/create'],
  ['POST', '/ob/api/shares/revoke'],
  ['POST', '/ob/api/shares/role'],
  ['GET', '/ob/api/share-settings'],
  ['POST', '/ob/api/share-settings'],
]

// ── ① 管理面鉴权（未授权拒 + 零副作用）────────────────────────────────────────
test('① 管理面鉴权：requestRejection=401 → 全部管理路由 401 且零副作用', async (t) => {
  const root = makeVault('auth401')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await createShare(root, { target: 'notes/a.md', role: 'read' })
  await withApi(makeConfig(root), async (base) => {
    for (const [method, route] of MGMT_ROUTES) {
      const out = method === 'GET' ? await getJson(base, route) : await postJson(base, route, { token: 'x'.repeat(43), target: 'INDEX.md', role: 'read', externalBaseUrl: 'share.example.com' })
      assert.equal(out.status, 401, `${method} ${route} 未授权必须 401`)
      assert.equal(out.body.error.code, 'unauthorized')
    }
    // 零副作用：unauthorized revoke 不得撤销、unauthorized create 不得落盘
    const list = await getJson(base, '/ob/api/shares')
    assert.equal(list.status, 401)
  }, { rejection: 401 })
  const { shares } = await listShares(root)
  assert.equal(shares.length, 1, '未授权 create 零落盘')
  assert.equal(shares[0].revoked, false, '未授权 revoke 零副作用（分享仍生效）')
})

test('① 管理面鉴权：requestRejection=403 → 全部管理路由 403（forbidden）', async (t) => {
  const root = makeVault('auth403')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    for (const [method, route] of MGMT_ROUTES) {
      const out = method === 'GET' ? await getJson(base, route) : await postJson(base, route, {})
      assert.equal(out.status, 403, `${method} ${route} 拒绝必须 403`)
      assert.equal(out.body.error.code, 'forbidden')
    }
  }, { rejection: 403 })
})

// ── ③⑥ 列表 + 内外网地址同显 + 查看计数展示口径 ───────────────────────────────
test('③ 创建与列表：links.path/internal/external 三线下发（内外网地址都显示），密码 hash 零外泄', async (t) => {
  const root = makeVault('list')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = makeConfig(root)
  await withApi(config, async (base) => {
    const saved = await postJson(base, '/ob/api/share-settings', { externalBaseUrl: 'https://share.example.com', lanHost: '192.168.1.10' })
    assert.equal(saved.status, 200)
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read' })
    assert.equal(created.status, 200)
    const token = created.body.data.share.token
    assert.deepEqual(created.body.data.share.links, {
      path: `/ob_share/${token}`,
      internal: `http://192.168.1.10:3500/ob_share/${token}`,
      external: `https://share.example.com/ob_share/${token}`,
    }, '创建响应即带内外网双地址（服务端拼接）')
    const list = await getJson(base, '/ob/api/shares')
    assert.equal(list.status, 200)
    assert.equal(list.body.total, 1)
    assert.equal(list.body.data.total, 1)
    const entry = list.body.data.shares[0]
    assert.equal(entry.accessCount, 0, '⑥ 查看计数初值 0')
    assert.equal(entry.hasPassword, false)
    assert.equal(entry.links.external, `https://share.example.com/ob_share/${token}`, '③ 外网地址显示')
    assert.equal(entry.links.internal, `http://192.168.1.10:3500/ob_share/${token}`, '③ 内网地址显示')
    assert.ok(!JSON.stringify(list.body).includes('scrypt$'), '密码 hash（scrypt$）零外泄')
    assert.ok(!JSON.stringify(list.body).includes('passwordHash'), 'passwordHash 字段零外泄（只有 hasPassword）')
    assert.deepEqual(list.body.data.settings, { externalBaseUrl: 'https://share.example.com', lanHost: '192.168.1.10' })
    assert.equal(list.body.data.sharePort, 3500, '端口=配置单一来源')
  })
})

test('③ 外网域名未配置：external=null 显式占位、internal 照发（内外网口径：内网恒有）', async (t) => {
  const root = makeVault('list-bare')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const created = await postJson(base, '/ob/api/shares/create', { target: 'INDEX.md', role: 'read' })
    const links = created.body.data.share.links
    assert.equal(links.external, null, '未配置外网域名 → external=null')
    assert.match(links.internal, /^http:\/\/.+:\d+\/ob_share\/[A-Za-z0-9_-]{43}$/, 'internal 恒有（内网 host 自动探测）')
  })
})

test('⑥ 计数展示口径：guest 访问 N 次 → 管理面 accessCount=N、lastAccessAt 随行（计数=checkAccess 成功次数）', async (t) => {
  const root = makeVault('count')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = makeConfig(root)
  await withApi(config, async (base) => {
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read' })
    const token = created.body.data.share.token
    // guest 面真访问（share-server 真 listener）×3
    const handle = createShareServer({ getConfig: () => config, port: 0, host: '127.0.0.1', syncIntervalMs: 0 })
    await handle.start()
    t.after(() => handle.close())
    const guestBase = `http://127.0.0.1:${handle.address().port}`
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${guestBase}/ob_share/${token}`)
      assert.equal(res.status, 200, `guest 第 ${i + 1} 次访问应 200`)
    }
    const list = await getJson(base, '/ob/api/shares')
    const entry = list.body.data.shares[0]
    assert.equal(entry.accessCount, 3, '⑥ 查看计数=访问成功次数（每分享条目访问计数）')
    assert.equal(typeof entry.lastAccessAt, 'number', '最近访问时间随行')
    // 密码分享的访问计数同样累计（校验成功后计数）
    const pw = await postJson(base, '/ob/api/shares/create', { target: 'INDEX.md', role: 'read', autoPassword: true })
    const pwToken = pw.body.data.share.token
    assert.equal(typeof pw.body.data.password, 'string', 'autoPassword 明文恰一次返回')
    const res = await fetch(`${guestBase}/ob_share/${pwToken}`) // 无密码 → 同形 404，不计数
    assert.equal(res.status, 404)
    const list2 = await getJson(base, '/ob/api/shares')
    const pwEntry = list2.body.data.shares.find((s) => s.token === pwToken)
    assert.equal(pwEntry.accessCount, 0, '失败访问不计数（计数=校验成功次数）')
  })
})

// ── ④ 撤销即时失效（管理面撤销 → guest 面同形 404）────────────────────────────
test('④ 撤销即时失效：管理面 revoke → guest 面同形 404（与不存在 token 逐字节同体）', async (t) => {
  const root = makeVault('revoke')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = makeConfig(root)
  await withApi(config, async (base) => {
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read' })
    const token = created.body.data.share.token
    const handle = createShareServer({ getConfig: () => config, port: 0, host: '127.0.0.1', syncIntervalMs: 0 })
    await handle.start()
    t.after(() => handle.close())
    const guestBase = `http://127.0.0.1:${handle.address().port}`
    const before = await fetch(`${guestBase}/ob_share/${token}`)
    assert.equal(before.status, 200, '撤销前 guest 200')
    const revoked = await postJson(base, '/ob/api/shares/revoke', { token })
    assert.equal(revoked.status, 200)
    assert.equal(revoked.body.data.share.revoked, true, '撤销态即时可见')
    const afterRes = await fetch(`${guestBase}/ob_share/${token}`)
    assert.equal(afterRes.status, 404, '撤销后 guest 404（即时失效）')
    const afterBody = await afterRes.text()
    assert.equal(afterBody, NOT_FOUND_BODY, '撤销后响应体=同形 404 冻结四键形（逐字节）')
    const ghostRes = await fetch(`${guestBase}/ob_share/${'z'.repeat(43)}`)
    assert.equal(await ghostRes.text(), afterBody, '与不存在 token 的 404 逐字节同形（不泄露存在性）')
    // 模型层同形分流：管理面可解释（getShare 出 revoked 态）、guest 面冻结
    const denied = await checkAccess(root, { token })
    assert.deepEqual(denied, accessDenied(), 'checkAccess 撤销=同形 404 形')
    const list = await getJson(base, '/ob/api/shares')
    assert.equal(list.body.data.shares[0].revoked, true)
    assert.equal(typeof list.body.data.shares[0].revokedAt, 'number', '撤销时间随行（管理面可解释）')
    // 幂等：再撤一次仍 200
    const again = await postJson(base, '/ob/api/shares/revoke', { token })
    assert.equal(again.status, 200)
  })
})

// ── ⑤ 密码/权限调整语义（写升级强制密码——T8 不变量复用）──────────────────────
test('⑤ 权限调整：read→write 无密码 400 password_required（不变量）；autoPassword 升级成功且带密码', async (t) => {
  const root = makeVault('role')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read' })
    const token = created.body.data.share.token
    const denied = await postJson(base, '/ob/api/shares/role', { token, role: 'write' })
    assert.equal(denied.status, 400, '升写无密码必拒')
    assert.equal(denied.body.error.code, 'password_required')
    assert.match(denied.body.error.message, /密码/, '管理面可解释（点名密码要求）')
    const list0 = await getJson(base, '/ob/api/shares')
    assert.equal(list0.body.data.shares[0].role, 'read', '拒后角色不变')
    const upgraded = await postJson(base, '/ob/api/shares/role', { token, role: 'write', autoPassword: true })
    assert.equal(upgraded.status, 200)
    assert.equal(upgraded.body.data.share.role, 'write')
    assert.equal(upgraded.body.data.share.hasPassword, true, '升写必带密码')
    assert.equal(typeof upgraded.body.data.password, 'string', '自动生成明文恰一次返回')
    // 写权限清密码必拒（OW-INV-1；T13 concern④ 收口后单一来源=role 载荷合流三态）
    const clearDenied = await postJson(base, '/ob/api/shares/role', { token, role: 'write', password: null })
    assert.equal(clearDenied.status, 400)
    assert.equal(clearDenied.body.error.code, 'password_required')
    // 降 read 后允许清密码
    const down = await postJson(base, '/ob/api/shares/role', { token, role: 'read' })
    assert.equal(down.status, 200)
    assert.equal(down.body.data.share.role, 'read')
    assert.equal(down.body.data.share.hasPassword, true, '降级保留密码')
    const cleared = await postJson(base, '/ob/api/shares/role', { token, role: 'read', password: null })
    assert.equal(cleared.status, 200, '读角色允许清密码')
    assert.equal(cleared.body.data.share.hasPassword, false)
  })
})

test('⑤ 密码调整：自定义/自动生成/清除三态 + 创建面写权限强制密码（T8 不变量 HTTP 面复用）', async (t) => {
  const root = makeVault('pw')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const noPw = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'write' })
    assert.equal(noPw.status, 400, '创建写分享无密码必拒')
    assert.equal(noPw.body.error.code, 'password_required')
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'write', password: 'custom-pass-123' })
    assert.equal(created.status, 200)
    const token = created.body.data.share.token
    assert.equal(created.body.data.share.hasPassword, true)
    assert.equal(created.body.data.password, null, '自定义密码不回显明文')
    const custom = await postJson(base, '/ob/api/shares/role', { token, role: 'write', password: 'new-pass-456' })
    assert.equal(custom.status, 200)
    assert.equal(custom.body.data.share.hasPassword, true)
    assert.equal(custom.body.data.password, null, '自定义改密不回显')
    const auto = await postJson(base, '/ob/api/shares/role', { token, role: 'write', autoPassword: true })
    assert.equal(auto.status, 200)
    assert.equal(typeof auto.body.data.password, 'string')
    assert.equal(auto.body.data.password.length, 16, 'autoPassword=16 位（PW_LENGTH）')
    // 管理面错误=可解释：sensitive_name 细节只走管理面（C2① 分流）
    const sensitive = await postJson(base, '/ob/api/shares/create', { target: 'secret.pem', role: 'read' })
    assert.equal(sensitive.status, 400)
    assert.equal(sensitive.body.error.code, 'sensitive_name')
    const missing = await postJson(base, '/ob/api/shares/create', { target: 'nope.md', role: 'read' })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'not_found')
  })
})

// ── T13 concern④ 收口：/ob/api/shares/password 服务端面下线（密码调整单一来源=role 载荷合流）────
test('⑤ password 服务端面已下线：POST /ob/api/shares/password → 404 + lib/·web/src 全树零残留（路由字面与 updateSharePassword）', async (t) => {
  const root = makeVault('pw-offline')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read', password: 'pw-1' })
    const token = created.body.data.share.token
    const gone = await postJson(base, '/ob/api/shares/password', { token, password: 'pw-2' })
    // 未注册 exact 路由落到 prefix /ob 静态面的方法门（405）——语义=面已下线、零业务处理
    assert.ok([404, 405].includes(gone.status), `服务端面下线（未注册路由应 404/405 拒），实际 ${gone.status}——外部调用方零冒充`)
    assert.equal((await checkAccess(root, { token, password: 'pw-1' })).ok, true, '下线面零副作用（密码未被改）')
    // 零残留锁（T13「真死摘除」同款）：路由字面/模型导出全树零命中
    const offenders = []
    for (const dir of [fileURLToPath(new URL('../lib', import.meta.url)), fileURLToPath(new URL('../web/src', import.meta.url))]) {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const abs = path.join(d, e.name)
          if (e.isDirectory()) { walk(abs); continue }
          if (!/\.(js|vue|css)$/.test(abs)) continue
          const raw = fs.readFileSync(abs, 'utf8')
          if (/shares\/password/.test(raw)) offenders.push(`${abs}: shares/password 路由字面残留`)
          if (/\bupdateSharePassword\b/.test(raw)) offenders.push(`${abs}: updateSharePassword 死导出残留`)
        }
      }
      walk(dir)
    }
    assert.deepEqual(offenders, [], `password 面下线不彻底：\n${offenders.join('\n')}`)
  })
})

// ── 设置端点（OW-US-9：外网域名配置）──────────────────────────────────────────
test('设置端点：GET 默认形（含 sharePort/自动探测 host）；POST 归一落盘；非法值 400 且盘上不变；null 清除', async (t) => {
  const root = makeVault('settings')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const defaults = await getJson(base, '/ob/api/share-settings')
    assert.equal(defaults.status, 200)
    assert.deepEqual(defaults.body.data.externalBaseUrl, null)
    assert.deepEqual(defaults.body.data.lanHost, null)
    assert.equal(defaults.body.data.sharePort, 3500)
    assert.equal(typeof defaults.body.data.effectiveLanHost, 'string', '自动探测内网 host 随行')
    const saved = await postJson(base, '/ob/api/share-settings', { externalBaseUrl: 'share.example.com' })
    assert.equal(saved.body.data.externalBaseUrl, 'http://share.example.com', '裸域名归一 http://')
    const bad = await postJson(base, '/ob/api/share-settings', { externalBaseUrl: 'javascript:alert(1)' })
    assert.equal(bad.status, 400, '非法外网域名拒')
    assert.equal(bad.body.error.code, 'bad_request')
    const reread = await getJson(base, '/ob/api/share-settings')
    assert.equal(reread.body.data.externalBaseUrl, 'http://share.example.com', '非法写入零落盘')
    const cleared = await postJson(base, '/ob/api/share-settings', { externalBaseUrl: null, lanHost: 'nas.local' })
    assert.equal(cleared.body.data.externalBaseUrl, null, 'null 清除')
    assert.equal(cleared.body.data.lanHost, 'nas.local')
  })
})

// ── T13 载荷合流：/ob/api/shares/role 单调承载密码三态（postSharePassword 面不再需要）────
test('⑤ T13 载荷合流：shares/role 单调承载改密三态（auto/custom/clear），写+clear=400 不冒充', async (t) => {
  const root = makeVault('role-merge')
  fs.writeFileSync(path.join(root, 'notes', 'b.md'), '# B\n') // 写分享靶（makeVault 只备 a.md）
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const created = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read', password: 'pw-old' })
    const token = created.body.data.share.token
    const custom = await postJson(base, '/ob/api/shares/role', { token, role: 'read', password: 'pw-new' })
    assert.equal(custom.status, 200)
    assert.equal(custom.body.data.share.hasPassword, true)
    const auto = await postJson(base, '/ob/api/shares/role', { token, role: 'read', autoPassword: true })
    assert.equal(auto.status, 200)
    assert.equal(typeof auto.body.data.password, 'string', '自动生成明文恰一次返回')
    const clear = await postJson(base, '/ob/api/shares/role', { token, role: 'read', password: null })
    assert.equal(clear.status, 200, '读角色清除密码（载荷合流三态闭合）')
    assert.equal(clear.body.data.share.hasPassword, false)
    // 写+清=不变量拒（显式可解释）
    const w = await postJson(base, '/ob/api/shares/create', { target: 'notes/b.md', role: 'write', password: 'wpw-1' })
    const wtok = w.body.data.share.token
    const denied = await postJson(base, '/ob/api/shares/role', { token: wtok, role: 'write', password: null })
    assert.equal(denied.status, 400)
    assert.equal(denied.body.error.code, 'password_required')
  })
})
