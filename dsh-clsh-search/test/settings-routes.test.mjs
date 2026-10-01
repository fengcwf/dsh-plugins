// settings-routes.test.mjs — W6.5：settings 服务端缝（读写路由往返 + 静态服务 + 挂载契约 + P-5/INV-4）
// 离线：fake register/req/res + configEditor 桩 + mkdtemp dist，不触网不写真实 home。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import {
  API_PREFIX,
  applyEditablePatch,
  checkPatchEditable,
  createApplyPatch,
  EDITABLE_PATHS,
  registerSettingsRoutes,
} from '../lib/settings-routes.js'
import { Config } from '../lib/index.js'

const WEB_DIST = fileURLToPath(new URL('../web/dist', import.meta.url))

/** 记录型 res 桩：writeHead/end 捕获（状态/头/体）。 */
function makeRes() {
  const rec = { status: null, headers: null, body: null }
  return {
    rec,
    writeHead(status, headers) {
      rec.status = status
      rec.headers = headers ?? {}
    },
    end(body) {
      rec.body = body ?? null
    },
  }
}

/** req 桩：方法/URL/头 + 可读体（Readable 形，readJsonBody 直接消费）。 */
function makeReq({ method = 'GET', url = `${API_PREFIX}/settings`, body = null, headers = {} } = {}) {
  const req = Readable.from(body === null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = headers
  return req
}

/**
 * 路由装置：fake register 捕获 spec + configEditor 桩（entries/edit 同宿主形）+ 内存 current 面。
 * applyPatch 缺省=createApplyPatch（真白名单/校验/持久化缝语义）；传 null 模拟写缝缺位。
 */
function setupRoutes({ current = {}, patchResult = null, applyPatchMode = 'editor', rejection = null } = {}) {
  const state = {
    registered: [],
    disposed: 0,
    edits: 0,
    current: structuredClone(current),
  }
  const register = (spec) => {
    state.registered.push(spec)
    return () => { state.disposed += 1 }
  }
  const configEditor = {
    entries: () => [{ options: { id: 'dsh-clsh-search' } }],
    async edit(entry, fn) {
      state.edits += 1
      const next = fn(structuredClone(state.current), {})
      state.current = structuredClone(next)
    },
  }
  const applyPatch = applyPatchMode === 'editor'
    ? createApplyPatch({ configEditor, entryId: 'dsh-clsh-search', Config })
    : applyPatchMode === 'custom' ? patchResult : null
  const disposers = registerSettingsRoutes({
    register,
    connection: rejection === null ? { requestRejection: () => null } : { requestRejection: () => rejection },
    getConfig: () => structuredClone(state.current),
    applyPatch,
    distDir: WEB_DIST,
    warn: () => {},
  })
  const spec = state.registered[0]
  assert.ok(spec, '必须注册路由 spec')
  assert.equal(spec.kind, 'prefix')
  assert.equal(spec.path, API_PREFIX)
  return { state, handler: spec.handler, disposers }
}

test('GET/PUT /api/dsh-clsh-search/settings 往返闭环：UI 保存真落 Config 面、读回一致（US-3 闭环）', async () => {
  const { state, handler } = setupRoutes({ current: { timeoutMs: 12000 } })

  // GET 初始面
  const getRes1 = makeRes()
  await handler(makeReq({ method: 'GET' }), getRes1)
  assert.equal(getRes1.rec.status, 200)
  const getBody1 = JSON.parse(getRes1.rec.body)
  assert.equal(getBody1.data.config.timeoutMs, 12000)
  assert.equal(getBody1.data.writable, true, '写缝在场如实')
  assert.ok(Array.isArray(getBody1.data.editable) && getBody1.data.editable.length === EDITABLE_PATHS.length)

  // PUT 保存（契约形：method=PUT）
  const putRes = makeRes()
  await handler(makeReq({ method: 'PUT', body: { patch: { timeoutMs: 5000, sources: { ddg: false } } } }), putRes)
  assert.equal(putRes.rec.status, 200)
  const putBody = JSON.parse(putRes.rec.body)
  assert.equal(putBody.data.ok, true)
  assert.equal(putBody.data.config.timeoutMs, 5000, '写入回显')
  assert.equal(state.edits, 1, '持久化缝恰触达一次')

  // GET 读回一致（落 Config 面，非内存幻影）
  const getRes2 = makeRes()
  await handler(makeReq({ method: 'GET' }), getRes2)
  const getBody2 = JSON.parse(getRes2.rec.body)
  assert.equal(getBody2.data.config.timeoutMs, 5000, '读回一致')
  assert.equal(getBody2.data.config.sources.ddg, false, 'sources 开关读回一致')

  // POST 兼容（客户端 save() 现用 POST；两法并列）
  const postRes = makeRes()
  await handler(makeReq({ method: 'POST', body: { maxResults: 3 } }), postRes)
  assert.equal(postRes.rec.status, 200)
  assert.equal(JSON.parse(postRes.rec.body).data.config.maxResults, 3)
})

test('白名单纪律：落点目录键只读拒改、空 patch 拒、非法值 invalid（K-7/P-5）', async () => {
  // 落点目录键（dataDir/cacheDir/logDir）不在白名单 → 整单拒 not_editable（绝不静默丢键）
  const pre = checkPatchEditable({ dataDir: '/tmp/evil' })
  assert.equal(pre.ok, false)
  assert.equal(pre.code, 'not_editable')

  assert.equal(checkPatchEditable({}).code, 'bad_patch', '空 patch 拒')
  assert.equal(checkPatchEditable('x').code, 'bad_patch', '形非法拒')

  // 白名单外叶子混入 → 整单拒
  const mixed = checkPatchEditable({ timeoutMs: 1000, cacheDir: '/tmp/x' })
  assert.equal(mixed.code, 'not_editable')

  // 真 zod 校验：生效面非法 → invalid
  const invalid = applyEditablePatch({ current: {}, patch: { maxResults: 'x' } }, Config)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.code, 'invalid')

  // 路由层：not_editable → 400
  const { handler } = setupRoutes()
  const res = makeRes()
  await handler(makeReq({ method: 'PUT', body: { patch: { dataDir: '/tmp/evil' } } }), res)
  assert.equal(res.rec.status, 400)
  assert.equal(JSON.parse(res.rec.body).error.code, 'not_editable')
})

test('写缝缺位=503 如实（只读部署）；no_entry=409；鉴权拒=401', async () => {
  // applyPatch 缺位 → 503 write_unavailable
  const ro = setupRoutes({ applyPatchMode: null })
  const res503 = makeRes()
  await ro.handler(makeReq({ method: 'PUT', body: { timeoutMs: 1 } }), res503)
  assert.equal(res503.rec.status, 503)
  assert.equal(JSON.parse(res503.rec.body).error.code, 'write_unavailable')
  // 展示面照常（写缝缺位不影响 GET）
  const resGet = makeRes()
  await ro.handler(makeReq({ method: 'GET' }), resGet)
  assert.equal(resGet.rec.status, 200)
  assert.equal(JSON.parse(resGet.rec.body).data.writable, false)

  // no_entry → 409
  const ne = setupRoutes({ applyPatchMode: 'custom', patchResult: async () => ({ ok: false, code: 'no_entry', message: '配置入口不在活动表' }) })
  const res409 = makeRes()
  await ne.handler(makeReq({ method: 'PUT', body: { timeoutMs: 1 } }), res409)
  assert.equal(res409.rec.status, 409)

  // 鉴权拒 → 401（connection.requestRejection 缝）
  const denied = setupRoutes({ rejection: { code: 'unauthorized' } })
  const res401 = makeRes()
  await denied.handler(makeReq({ method: 'GET' }), res401)
  assert.equal(res401.rec.status, 401)
})

test('route spec 契约与释放成对：prefix 注册、disposer 回收（W6.5 接线面）', () => {
  const { state, disposers } = setupRoutes()
  assert.equal(state.registered.length, 1, '单 prefix 注册（官方路由形）')
  assert.equal(disposers.length, 1)
  disposers[0]()
  assert.equal(state.disposed, 1, '拆除成对')
})

test('web/dist 静态服务接通：真构建物可取、MIME 正确、穿越围栏拒', async () => {
  const { handler } = setupRoutes()

  // 真构建物接通（W6 交付的 web/dist 入库件）
  const resJs = makeRes()
  await handler(makeReq({ method: 'GET', url: `${API_PREFIX}/main.js` }), resJs)
  assert.equal(resJs.rec.status, 200, 'web/dist/main.js 可取')
  assert.match(resJs.rec.headers['content-type'], /javascript/)
  assert.match(String(resJs.rec.body), /mount/, '构建物含 mount 导出面')

  const resCss = makeRes()
  await handler(makeReq({ method: 'GET', url: `${API_PREFIX}/style.css` }), resCss)
  assert.equal(resCss.rec.status, 200, 'web/dist/style.css 可取')
  assert.match(resCss.rec.headers['content-type'], /css/)

  // 穿越围栏：../ 逃逸与缺文件全不 200
  for (const bad of [`${API_PREFIX}/../../../etc/passwd`, `${API_PREFIX}/..%2f..%2fetc/passwd`, `${API_PREFIX}/no-such-file.js`]) {
    const resBad = makeRes()
    await handler(makeReq({ method: 'GET', url: bad }), resBad)
    assert.notEqual(resBad.rec.status, 200, `围栏必须拦：${bad}`)
  }
})

test('mount(el,deps)→{unmount()} 契约实证：构建物导出面 + 源契约形状（Ruling-9）', async () => {
  // ① 构建物导出面（真 import web/dist/main.js）
  const mod = await import('../web/dist/main.js')
  assert.equal(typeof mod.mount, 'function', 'dist 导出 mount')
  assert.equal(mod.default?.mount, mod.mount, 'default 契约同引')
  // ② 源契约形状：mount(el, deps = {}) → { unmount() }
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../web/src/main.js', import.meta.url), 'utf8',
  )
  assert.match(source, /export function mount\(el, deps = \{\}\)/, 'mount 形参契约')
  assert.match(source, /return \{\s*unmount\(\)/, '返回 {unmount()} 契约')
  assert.match(source, /app\.unmount\(\)/, 'unmount 清理实义')
})

test('P-5/INV-4 文字面：路由读写无明文凭据落盘、日志无查询词外本地内容', async () => {
  const files = ['settings-routes.js', 'index.js']
  const libDir = new URL('../lib/', import.meta.url)
  for (const file of files) {
    const source = await (await import('node:fs/promises')).readFile(new URL(file, libDir), 'utf8')
    assert.doesNotMatch(source, /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/i, `${file} 不得含凭据键值明文（P-5）`)
    assert.doesNotMatch(source, /console\.log\(/, `${file} 不得裸打日志（INV-4：日志面收敛到 warn 缝）`)
    assert.doesNotMatch(source, /\/root\/|\/home\/[a-z]/, `${file} 不得含本机绝对路径（K-4 文字面）`)
  }
  // warn 面结构断言：settings-routes 的 warn 调用只串接 error.message（不落请求体/查询词）
  const routesSource = await (await import('node:fs/promises')).readFile(new URL('settings-routes.js', libDir), 'utf8')
  const warnCalls = [...routesSource.matchAll(/warn\(`[^`]*`\)/g)]
  assert.ok(warnCalls.length >= 2, 'warn 只以错误消息为料')
  assert.ok(warnCalls.every((m) => m[0].includes('${error?.message ?? error}')), 'warn 料仅错误消息（INV-4）')
  assert.equal(/warn\([^\)]*(body|query|patch)/.test(routesSource), false, 'warn 不得携带请求体/查询词（INV-4）')
})

test('集成：index.js apply 在 webServer 缝上挂载 settings 路由（接线实证）', async () => {
  const { apply } = await import('../lib/index.js')
  const { createFakeCtx } = await import('./helpers/fake-ctx.mjs')
  const fixture = createFakeCtx()
  const registered = []
  fixture.ctx.webServer = { register: (spec) => { registered.push(spec); return () => registered.splice(registered.indexOf(spec), 1) } }
  apply(fixture.ctx, {})
  assert.equal(registered.length, 1, 'apply 后 settings 路由已挂载')
  assert.equal(registered[0].path, API_PREFIX)
  fixture.runTeardowns()
  assert.equal(registered.length, 0, '拆除成对（路由随生命周期回收）')

  // 缺 webServer 缝=静默跳过（软缺位，既有 W1/W2 断言面不破）
  const bare = createFakeCtx()
  apply(bare.ctx, {})
  assert.equal(bare.state.warnings.length, 0)
  assert.equal(bare.state.effects.length, 1, '仍守单 effect 生命周期缝')
})
