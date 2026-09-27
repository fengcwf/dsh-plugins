// vault 目录档案管理面 HTTP（T12 / OW-US-13）：列表/新增/删除/健康检查/切换 + 换 vault 提示（T10）。
// 契约锚点：
//   - 鉴权=主 UI 面 requestRejection 缝（T1 惯例/OW-INV-8）：未授权一律 401/403，零副作用。
//   - 切换语义（T11 交接）：热改可解释拒不冒充——activate 记录选择+restartRequired:true，运行期根不变。
//   - 换 vault 提示（T10）：message 含「重启生效」+「外网域名等各配」。
// 真验零 mock：真 node:http 往返 + 真 tmp vault + 真 .ob-share 落盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'

const TMP = fileURLToPath(new URL('./.tmp-vault-profiles-api', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

function makeVault(tag) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
  fs.writeFileSync(path.join(root, 'INDEX.md'), '# INDEX\n')
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
  return { status: res.status, body: await res.json() }
}

const PROFILE_ROUTES = [
  ['GET', '/ob/api/vault-profiles'],
  ['POST', '/ob/api/vault-profiles/add'],
  ['POST', '/ob/api/vault-profiles/delete'],
  ['POST', '/ob/api/vault-profiles/health'],
  ['POST', '/ob/api/vault-profiles/activate'],
]

test('注册面新增锁定：apply 注册 5 条 exact vault-profile API（OW-US-13 T12 新增面）', () => {
  const { routes, ctx } = makeCtx()
  registerWebRoutes(ctx, () => makeConfig(makeVault('reg')), { distDir: fileURLToPath(new URL('./fixtures/dist', import.meta.url)) })
  for (const [method, route] of PROFILE_ROUTES) {
    assert.ok(routes.has(`exact:${route}`), `缺注册面：${method} ${route}`)
  }
})

test('GET 形状锁定：{data:{profiles,activeProfileId}, total}，默认档案在首', async (t) => {
  const root = makeVault('list')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const out = await getJson(base, '/ob/api/vault-profiles')
    assert.equal(out.status, 200)
    assert.deepEqual(Object.keys(out.body).sort(), ['data', 'total'])
    assert.deepEqual(Object.keys(out.body.data).sort(), ['activeProfileId', 'profiles'])
    assert.equal(out.body.data.profiles[0].id, 'default')
    assert.equal(out.body.data.profiles[0].path, path.resolve(root))
  })
})

test('新增/删除面：add→list 含→delete→list 无；默认档案删除 400 带码带消息（可解释）', async (t) => {
  const root = makeVault('crud')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const add = await postJson(base, '/ob/api/vault-profiles/add', { name: 'SMB 仓', path: '/mnt/smb/vault-2' })
    assert.equal(add.status, 200)
    assert.deepEqual(Object.keys(add.body.data).sort(), ['profile'])
    const id = add.body.data.profile.id
    const list1 = await getJson(base, '/ob/api/vault-profiles')
    assert.equal(list1.body.data.profiles.length, 2)
    const del = await postJson(base, '/ob/api/vault-profiles/delete', { id })
    assert.equal(del.status, 200)
    assert.equal(del.body.data.profiles.length, 1)
    const delDefault = await postJson(base, '/ob/api/vault-profiles/delete', { id: 'default' })
    assert.equal(delDefault.status, 400)
    assert.equal(delDefault.body.error.code, 'bad_request')
    assert.ok(delDefault.body.error.message.length > 0, '可解释带消息')
  })
})

test('健康检查面：{id|path} 双入口 → {data:{health}} 三探针形（可读/可写/延迟）', async (t) => {
  const root = makeVault('health')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const byPath = await postJson(base, '/ob/api/vault-profiles/health', { path: root })
    assert.equal(byPath.status, 200)
    assert.deepEqual(Object.keys(byPath.body.data).sort(), ['health'])
    const health = byPath.body.data.health
    assert.deepEqual(Object.keys(health).sort(), ['latencyMs', 'readable', 'samples', 'status', 'writable'])
    assert.equal(health.status, 'ok')
    const add = await postJson(base, '/ob/api/vault-profiles/add', { name: 'NFS', path: '/mnt/nfs/v' })
    const byId = await postJson(base, '/ob/api/vault-profiles/health', { id: add.body.data.profile.id })
    assert.equal(byId.status, 200)
    assert.equal(byId.body.data.health.status, 'unreachable', '未挂载路径如实报不可读')
  })
})

test('切换面（T11：热改可解释拒不冒充）：activate→restartRequired:true+message（T10 换 vault 提示含「重启/外网域名/各配」）', async (t) => {
  const root = makeVault('activate')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const add = await postJson(base, '/ob/api/vault-profiles/add', { name: 'SMB', path: '/mnt/smb/v' })
    const id = add.body.data.profile.id
    const act = await postJson(base, '/ob/api/vault-profiles/activate', { id })
    assert.equal(act.status, 200)
    assert.deepEqual(Object.keys(act.body.data).sort(), ['activeProfileId', 'message', 'restartRequired'])
    assert.equal(act.body.data.activeProfileId, id)
    assert.equal(act.body.data.restartRequired, true)
    for (const word of ['重启', '外网域名', '各配']) {
      assert.ok(act.body.data.message.includes(word), `换 vault 提示缺「${word}」`)
    }
    // 不冒充热改：切换后树面仍以 config.vaultRoot 服务（运行期根不变）
    const tree = await getJson(base, '/ob/api/tree')
    assert.equal(tree.body.data.root, path.resolve(root), '运行期 vaultRoot 绝不冒充已切换')
    // 未知 id → 404（绝不假切换）
    const bad = await postJson(base, '/ob/api/vault-profiles/activate', { id: 'nope' })
    assert.equal(bad.status, 404)
    assert.equal(bad.body.error.code, 'not_found')
  })
})

test('鉴权面：requestRejection=401 → 5 条档案路由全 401 且零副作用（add 不落盘）', async (t) => {
  const root = makeVault('auth')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    for (const [method, route] of PROFILE_ROUTES) {
      const out = method === 'GET' ? await getJson(base, route) : await postJson(base, route, { name: 'x', path: '/mnt/x', id: 'x' })
      assert.equal(out.status, 401, `${method} ${route} 未授权必须 401`)
      assert.equal(out.body.error.code, 'unauthorized')
    }
    // 零副作用：未授权 add 不得落盘
    const list = await getJson(base, '/ob/api/vault-profiles')
    assert.equal(list.status, 401)
    const file = path.join(root, '.ob-share', 'vault-profiles.json')
    assert.ok(!fs.existsSync(file) || JSON.parse(fs.readFileSync(file, 'utf8')).profiles.length === 0, '未授权 add 零落盘')
  }, { rejection: 401 })
})
