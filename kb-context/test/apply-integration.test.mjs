// apply-integration —— B1/B2 修复波 integration 形回归锁（T8-F1；工作区 2026-09-28 开发自检口径）：
// 假宿主缝最小形（cordis 契约模拟）+ 真 apply() + 真 registerSettingsRoutes + 真 handler 执行——
// 不做纯 mock 空转，锁死的是"真实运行时缝上"的注册面/生命周期面（2026-09-28 e2e 实证 load 冒烟抓不到 B1/B2）。
//
// cordis 宿主契约依据（T8-D1 §2，源码+零落盘实测钉死）：
//  - effect(execute) = 立即执行执行体，返回值若为函数则收作拆除器（cordis:1142-1143）；
//  - inject 声明缺 provider = 延迟激活不炸装载（apply 不执行），provider 到达自动补激活（cordis:1099-1102/1316-1340/837-844）；
//  - 未 inject 的服务在 ctx 上属性访问即抛 `cannot get property "X" without inject`（cordis:676）。
//
// 锁死面：B2 生命周期（注册在 effect 执行体内 / apply 返回后不得自拆 / 返回值=拆除器 / 拆除全撤幂等）、
// 双层子插件形（外层 inject=['tools'] 不动 + 子插件硬 inject ['webServer','connection']）、双缺零告警、
// 半缺 warn 留痕（INV-15 不弱化）、代理抛守卫下 apply 不抛穿、configEditor 惰性后到可见。
import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import('../lib/index.js')
const { apply } = mod

/** 假宿主状态：服务店 + 注册/告警/effect 捕获计数（disposer 计数=零监听泄露判据） */
function mkState({ webServer = true, connection = true } = {}) {
  const state = {
    store: {},
    toolRegs: [],
    onRegs: [],
    pluginCalls: [],
    applied: [],
    effects: [],
    warnings: [],
    registerCalls: [],
    disposerCalls: 0,
  }
  if (webServer) {
    state.store.webServer = {
      register(spec) {
        state.registerCalls.push(spec)
        return () => { state.disposerCalls += 1 }
      },
    }
  }
  if (connection) state.store.connection = { requestRejection: () => undefined }
  return state
}

/** effect 真语义模拟：立即执行执行体，返回值=拆除器（cordis:1142-1143 逐字） */
function mkEffect(state) {
  return (execute, label) => {
    const teardown = execute()
    state.effects.push({ label, teardown })
    return teardown
  }
}

/** 子插件 ctx：inject 声明面服务直取（fiber.store 注入）+ effect 缝 */
function mkChildCtx(state, injectNames, { withEffect = true } = {}) {
  const child = {
    get: (name) => state.store[name],
    logger: { warn: (line) => state.warnings.push(line) },
  }
  if (withEffect) child.effect = mkEffect(state)
  for (const n of injectNames) child[n] = state.store[n]
  return child
}

/** 外层 ctx：工具面 / pre-step 面 / 服务店 get / plugin 子插件缝 / effect 缝 */
function mkCtx(state) {
  return {
    on: (event, handler, opts) => { state.onRegs.push({ event, handler, opts }) },
    tools: { register: (tool) => { state.toolRegs.push(tool) } },
    logger: { warn: (line) => state.warnings.push(line) },
    get: (name) => state.store[name],
    effect: mkEffect(state),
    plugin: (pluginObj) => {
      state.pluginCalls.push(pluginObj)
      // 宿主契约模拟（cordis _refresh/_checkImpl）：inject 必齐才激活；缺 provider=延迟激活（apply 不执行）
      const missing = (pluginObj.inject ?? []).filter((n) => state.store[n] == null)
      if (missing.length === 0) {
        state.applied.push(pluginObj)
        pluginObj.apply(mkChildCtx(state, pluginObj.inject ?? []))
      }
      return {}
    },
  }
}

// ---- handler 执行面（settings-routes.test.mjs 同款最小 req/res 形，真 handler 执行）----
function mkRes() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers ?? {}) },
    setHeader(k, v) { this.headers[k] = v },
    end(body) { if (body !== undefined) this.body = body },
    json() { return this.body === undefined ? null : JSON.parse(this.body) },
  }
}

function mkReq({ method = 'GET', url = '/', body } = {}) {
  const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  return {
    method,
    url,
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    on() {},
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield Buffer.from(payload)
    },
  }
}

const call = async (handler, { method = 'GET', url, body } = {}) => {
  const res = mkRes()
  await handler(mkReq({ method, url, body }), res)
  return res
}

test('B2 生命周期锁：注册在 effect 执行体内；apply 返回后 disposer 未被调用；返回值=拆除器（拆除全撤、幂等零泄露）', () => {
  const state = mkState()
  apply(mkCtx(state), {})
  // 注册面：单 prefix /api/kb-context（真 registerSettingsRoutes → 真 register 调用）
  assert.equal(state.registerCalls.length, 1)
  assert.equal(state.registerCalls[0].kind, 'prefix')
  assert.equal(state.registerCalls[0].path, '/api/kb-context')
  // ⚠️ B2 核心断言（修复前必红：effect 拆除器语义误写 = 注册完即自拆）
  assert.equal(state.disposerCalls, 0, 'B2：apply 返回后 register 的 disposer 绝不能被调用（注册完即自拆=缺陷）')
  // effect 契约：执行体=注册（已发生）、返回值=拆除器、label 留痕
  assert.equal(state.effects.length, 1)
  assert.equal(state.effects[0].label, 'kb-context: settings-routes')
  assert.equal(typeof state.effects[0].teardown, 'function')
  // 拆除期：全部已注册资源收敛（register 返回的 disposer 恰 1 次）+ 幂等（二次调用不重复拆除）
  state.effects[0].teardown()
  assert.equal(state.disposerCalls, 1, '拆除器覆盖全部已注册资源（零监听泄露）')
  state.effects[0].teardown()
  assert.equal(state.disposerCalls, 1, '拆除器幂等：二次调用不得重复拆除')
})

test('B1/非 web 面契约：双缺（webServer/connection 全缺）→ 零注册零告警；工具面 + pre-step 照常（装载不炸）', () => {
  const state = mkState({ webServer: false, connection: false })
  apply(mkCtx(state), { timeoutMs: 900 })
  assert.deepEqual(state.registerCalls, [])
  assert.deepEqual(state.warnings, [], '双缺=非 web 部署面正常形态，零告警（告警计数契约零弱化）')
  // 工具面照常（wiki_search / wiki_read）
  assert.deepEqual(state.toolRegs.map((t) => t.name).sort(), ['wiki_read', 'wiki_search'])
  // pre-step 注入面照常
  assert.equal(state.onRegs.length, 1)
  assert.equal(state.onRegs[0].event, 'agent/pre-step')
  assert.equal(state.onRegs[0].opts.prepend, true)
  // 子插件已声明但 provider 缺位=延迟激活（apply 不执行、装载不炸）
  assert.equal(state.pluginCalls.length, 1)
  assert.equal(state.applied.length, 0, 'inject 缺 provider：子插件延迟激活（apply 未执行）')
})

test('inject 契约锁：外层 inject=[\'tools\']（default 同形，R13）；子插件硬 inject 含 webServer/connection', () => {
  assert.deepEqual(mod.inject, ['tools'])
  assert.equal(typeof mod.default, 'object')
  assert.notEqual(typeof mod.default, 'function')
  assert.equal(mod.default.inject, mod.inject)
  assert.equal(typeof mod.default.apply, 'function')
  const state = mkState()
  apply(mkCtx(state), {})
  assert.equal(state.pluginCalls.length, 1)
  assert.deepEqual(state.pluginCalls[0].inject, ['webServer', 'connection'])
})

test('B1 地基锁：未 inject 服务属性访问即抛（cordis:676 代理语义）→ apply 不抛穿；设置面由子插件承载', () => {
  const state = mkState()
  const base = mkCtx(state)
  const ctx = new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver)
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  // 模拟保真自证：未声明服务属性访问确实抛（逐字 cordis:676）
  assert.throws(() => ctx.webServer, /cannot get property "webServer" without inject/)
  assert.doesNotThrow(() => apply(ctx, {}), 'apply 绝不抛穿（fail-open 收敛）')
  // 工具面 + pre-step 照常
  assert.equal(state.toolRegs.length, 2)
  assert.equal(state.onRegs.length, 1)
  // 设置面注册由子插件完成（子 ctx 上 webServer/connection 为 inject 声明面，属性访问合法）
  assert.equal(state.applied.length, 1, '子插件承载设置面数据注册（外层 ctx 从不直取 webServer）')
  assert.equal(state.registerCalls.length, 1)
})

test('configEditor 惰性后到可见锁：缺位 GET writable:false + POST 503 write_unavailable；后到 → 同 handler 转可写 200', async () => {
  const state = mkState() // configEditor 缺位
  apply(mkCtx(state), {})
  const handler = state.registerCalls[0].handler
  // GET 缺位：writable:false 如实 + 响应形 {config, editable, writable}
  let res = await call(handler, { url: '/api/kb-context/settings' })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.json().data).sort(), ['config', 'editable', 'writable'])
  assert.equal(res.json().data.writable, false)
  // POST 缺位：503 write_unavailable 如实（不许 500/404）
  res = await call(handler, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800 } } })
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
  // 运行中 configEditor 后到（per-request 惰性求值，同一 handler 不重注册）
  const editCalls = []
  state.store.configEditor = {
    entries: () => [{ options: { id: 'kb-context' } }],
    edit: async (entry, change) => { editCalls.push(change({ triggers: { words: [] } }, {})) },
  }
  res = await call(handler, { url: '/api/kb-context/settings' })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.writable, true, '后到可见：writable 反映当下可写性')
  res = await call(handler, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800 } } })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.ok, true)
  assert.deepEqual(editCalls, [{ triggers: { words: [] }, timeoutMs: 800 }])
})

test('半缺 warn 锁（INV-15）：仅 webServer 或仅 connection 在场 → 半缺告警恰 1 条 + 零注册（子插件不激活）', () => {
  for (const missing of ['connection', 'webServer']) {
    const state = mkState({ webServer: missing !== 'webServer', connection: missing !== 'connection' })
    apply(mkCtx(state), {})
    assert.deepEqual(state.registerCalls, [], `缺 ${missing}：设置面不注册`)
    assert.equal(state.applied.length, 0, `缺 ${missing}：子插件不激活`)
    assert.equal(state.warnings.length, 1, `缺 ${missing}：半缺缝留痕恰 1 条`)
    assert.match(state.warnings[0], /半缺/)
  }
})

test('effect 缺缝防御：子 ctx 无 effect 缝 → 跳过注册不告警（假 ctx 面契约，告警计数零弱化）', () => {
  const state = mkState()
  const ctx = mkCtx(state)
  ctx.plugin = (pluginObj) => {
    state.pluginCalls.push(pluginObj)
    state.applied.push(pluginObj)
    pluginObj.apply(mkChildCtx(state, pluginObj.inject ?? [], { withEffect: false }))
    return {}
  }
  apply(ctx, {})
  assert.deepEqual(state.registerCalls, [])
  assert.deepEqual(state.warnings, [])
})

test('B2 防御：注册中途抛错 → 先收敛已注册资源再上抛（effect 执行体不吞错、label 留痕、零悬挂）', () => {
  const state = mkState()
  state.store.webServer = {
    register(spec) {
      state.registerCalls.push(spec)
      throw new Error('register boom')
    },
  }
  // effect 缝改为捕获执行体（不立即跑）：逐条断言执行体语义；外层 apply 面=宿主兜底不抛穿
  const captured = []
  const ctx = mkCtx(state)
  ctx.plugin = (pluginObj) => {
    const child = mkChildCtx(state, pluginObj.inject ?? [], { withEffect: false })
    child.effect = (execute, label) => { captured.push({ execute, label }); return () => {} }
    pluginObj.apply(child)
    return {}
  }
  assert.doesNotThrow(() => apply(ctx, {}), '宿主兜底语义：装载不抛穿（等价 cordis _reload 收错）')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].label, 'kb-context: settings-routes', 'label 留痕')
  // 执行体语义：注册抛错 → 已注册资源先收敛（本例 0 条）→ 错误上抛（绝不吞）
  assert.throws(() => captured[0].execute(), /register boom/)
  assert.equal(state.registerCalls.length, 1, '注册尝试留痕')
  assert.equal(state.disposerCalls, 0, '失败注册零悬挂（无半拉资源）')
})
