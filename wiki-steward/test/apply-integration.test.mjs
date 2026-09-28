// apply-integration —— B1/B2 修复波 integration 形回归锁（Task 1，changes/2026-09-28-b1b2-service-effect-fix/）：
// 假宿主缝最小形（cordis 契约模拟）+ 真 apply() + 真 registerIngestRoutes + 真 handler 执行——
// 不做纯 mock 空转，锁死的是"真实运行时缝上"的注册面/生命周期面（2026-09-28 e2e 实证 load 冒烟抓不到 B1/B2）。
//
// cordis 宿主契约依据（TECH.md §1，源码+零落盘实测钉死，与 kb-context 0.3.1 同源）：
//  - effect(execute) = 立即执行执行体，返回值若为函数则收作拆除器（cordis:1142-1143）；
//  - inject 声明缺 provider = 延迟激活不炸装载（apply 不执行），provider 到达自动补激活（cordis:1099-1102/1316-1340）；
//  - 未 inject 的服务在 ctx 上属性访问即抛 `cannot get property "X" without inject`（cordis:676）。
//
// 锁死面：B1 双层子插件形（外层 inject=['tools'] 不动 + 子插件硬 inject ['webServer','connection']）、
// B2 生命周期（注册在 effect 执行体内 / apply 返回后不得自拆 / 返回值=拆除器 / 拆除全撤幂等 /
// 注册中途抛错先收敛已注册资源再上抛）、双缺零告警（非 web 部署面正常形态）、半缺 warn 留痕、
// 代理抛守卫下 apply 不抛穿（INV-2 fail-open）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mod = await import('../lib/index.js')
const { apply } = mod

// INV-4 工具注册面名单（名称零变化）
const TOOL_NAMES = ['kb_validate', 'kb_mark', 'wiki_write', 'wiki_delete', 'wiki_rename']

/** 假宿主状态：服务店 + 注册/告警/effect 捕获计数（disposer 计数=零监听泄露判据） */
function mkState({ webServer = true, connection = true, timer = true } = {}) {
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
    intervals: [],
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
  if (timer) state.store.timer = { interval: (cb, ms) => { state.intervals.push({ cb, ms }); return () => {} } }
  return state
}

/** effect 真语义模拟（cordis:1142-1143 逐字）：立即执行执行体，返回值=拆除器 */
function mkEffect(state) {
  return (execute, label) => {
    const teardown = execute()
    state.effects.push({ label, teardown })
    return teardown
  }
}

/** 子插件 ctx：inject 声明面服务直取（fiber.store 注入）+ get/logger/effect 缝 */
function mkChildCtx(state, injectNames, { withEffect = true } = {}) {
  const child = {
    get: (name) => state.store[name],
    logger: { warn: (line) => state.warnings.push(line) },
  }
  if (withEffect) child.effect = mkEffect(state)
  for (const n of injectNames) child[n] = state.store[n]
  return child
}

/** 外层 ctx：工具面 / 捕获三缝 / timer 软取得 / 服务店 get / plugin 子插件缝（宿主 _refresh/_checkImpl 模拟） */
function mkCtx(state) {
  return {
    on: (event, handler, opts) => { state.onRegs.push({ event, handler, opts }) },
    tools: { register: (tool) => { state.toolRegs.push(tool) } },
    logger: { warn: (line) => state.warnings.push(line) },
    get: (name) => state.store[name],
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

/** 测试期一切落点进 mkdtemp（INV-9：绝不碰真 HOME/真 vault）+ 假 trigger/sources（零外部副作用） */
function mkOpts(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-steward-b1b2-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  return {
    paths: {
      queueDir: path.join(home, 'queue'),
      ledgerFile: path.join(home, 'schedule-ledger.json'),
      alertFile: path.join(home, 'kb-alerts.md'),
    },
    web: {
      home,
      logDir: path.join(home, 'logs'),
      trigger: {
        scan: async () => ({ ok: true, exitCode: 0, summary: { total: 0, skipped: 0, pending: 0, pendingFiles: [] }, output: '', logFile: path.join(home, 'scan.log'), argv: [] }),
        distill: async () => ({ started: true, reason: 'started', note: '蒸馏由任务执行', logFile: path.join(home, 'distill.log') }),
        distillStatus: async () => ({ running: false, channelAvailable: true, logFile: path.join(home, 'distill.log'), lockFile: path.join(home, 'distill.log.lock') }),
      },
      sources: [],
    },
  }
}

function mkTmp(t, prefix = 'wiki-steward-b1b2-root-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

// ---- handler 执行面（真 handler 执行，最小 req/res 形）----
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

test('B2 生命周期锁：注册在 effect 执行体内当场跑（真 handler 200 成立）；apply 返回后零自拆；返回值=拆除器（拆除全撤、幂等零泄露）', async (t) => {
  const state = mkState()
  apply(mkCtx(state), { vaultRoot: mkTmp(t) }, mkOpts(t))
  // 注册面：单 prefix /api/wiki-steward（真 registerIngestRoutes → 真 register 调用）
  assert.equal(state.registerCalls.length, 1)
  assert.equal(state.registerCalls[0].kind, 'prefix')
  assert.equal(state.registerCalls[0].path, '/api/wiki-steward')
  // 真 handler 执行：注册即活（B2 缺陷下=装载瞬间自拆，GET 必死）
  const res = await call(state.registerCalls[0].handler, { url: '/api/wiki-steward/settings' })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.json().data).sort(), ['config', 'editable', 'readOnly', 'writable'])
  // ⚠️ B2 核心断言（修复前必红：effect 拆除器语义误写 = 注册完即自拆）
  assert.equal(state.disposerCalls, 0, 'B2：apply 返回后 register 的 disposer 绝不能被调用（注册完即自拆=缺陷）')
  // effect 契约：执行体=注册（已发生）、返回值=拆除器、label 留痕
  assert.equal(state.effects.length, 1)
  assert.equal(state.effects[0].label, 'wiki-steward: ingest-routes')
  assert.equal(typeof state.effects[0].teardown, 'function')
  // 拆除期：全部已注册资源收敛（register 返回的 disposer 恰 1 次）+ 幂等（二次调用不重复拆除）
  state.effects[0].teardown()
  assert.equal(state.disposerCalls, 1, '拆除器覆盖全部已注册资源（零监听泄露）')
  state.effects[0].teardown()
  assert.equal(state.disposerCalls, 1, '拆除器幂等：二次调用不得重复拆除')
})

test('inject 契约锁：外层 inject=[\'tools\']（default 同形，R13）；子插件硬 inject 含 webServer/connection（服务齐=注册回调被调用）', (t) => {
  assert.deepEqual(mod.inject, ['tools'])
  assert.equal(typeof mod.default, 'object')
  assert.notEqual(typeof mod.default, 'function')
  assert.equal(mod.default.inject, mod.inject)
  assert.equal(typeof mod.default.apply, 'function')
  const state = mkState()
  apply(mkCtx(state), { vaultRoot: mkTmp(t) }, mkOpts(t))
  assert.equal(state.pluginCalls.length, 1)
  assert.deepEqual(state.pluginCalls[0].inject, ['webServer', 'connection'])
  assert.equal(state.applied.length, 1, '服务齐：子插件注册回调（apply）被调用（B1 子插件注册回调锁）')
  assert.equal(state.registerCalls.length, 1)
})

test('B1 缺服务 fail-open 锁（双缺=非 web 部署面正常形态）：装载不抛、零注册零告警、工具/捕获/队列/写入拦截面照常、子插件延迟激活', (t) => {
  const state = mkState({ webServer: false, connection: false })
  assert.doesNotThrow(() => apply(mkCtx(state), { vaultRoot: mkTmp(t) }, mkOpts(t)), 'INV-2：装载绝不抛穿')
  assert.deepEqual(state.registerCalls, [])
  assert.deepEqual(state.warnings, [], '双缺=非 web 部署面正常形态，零告警（既有告警计数契约零改动）')
  // 工具面照常（INV-4 名单零变化）
  assert.deepEqual(state.toolRegs.map((x) => x.name).sort(), [...TOOL_NAMES].sort())
  // 捕获三缝 + 写入拦截缝照常（fail-open 承诺）
  for (const ev of ['session/event', 'agent/turn-stopping', 'session/disposed', 'tools/pre-execute']) {
    const reg = state.onRegs.find((r) => r.event === ev)
    assert.equal(typeof reg?.handler, 'function', `缺 web 缝：${ev} 照常注册`)
  }
  // 队列/timer 轻活面照常（interval 接线恰一次）
  assert.equal(state.intervals.length, 1, '缺 web 缝：队列/timer 面照常')
  // 子插件已声明但 provider 缺位=延迟激活（apply 不执行、装载不炸）
  assert.equal(state.pluginCalls.length, 1)
  assert.equal(state.applied.length, 0, 'inject 缺 provider：子插件延迟激活（apply 未执行）')
})

test('半缺 warn 锁：仅 webServer 或仅 connection 在场 → 告警恰 1 条（留痕如实）+ 零注册（子插件不激活）', (t) => {
  for (const missing of ['connection', 'webServer']) {
    const state = mkState({ webServer: missing !== 'webServer', connection: missing !== 'connection' })
    apply(mkCtx(state), { vaultRoot: mkTmp(t) }, mkOpts(t))
    assert.deepEqual(state.registerCalls, [], `缺 ${missing}：数据面不注册`)
    assert.equal(state.applied.length, 0, `缺 ${missing}：子插件不激活`)
    assert.equal(state.warnings.length, 1, `缺 ${missing}：半缺缝留痕恰 1 条`)
    assert.match(state.warnings[0], /半缺/)
  }
})

test('B2 防御：注册中途抛错 → 先收敛已注册资源再上抛（effect 执行体不吞错、label 留痕、零悬挂）', (t) => {
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
  assert.doesNotThrow(() => apply(ctx, { vaultRoot: mkTmp(t) }, mkOpts(t)), '宿主兜底语义：装载不抛穿（等价 cordis _reload 收错）')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].label, 'wiki-steward: ingest-routes', 'label 留痕')
  // 执行体语义：注册抛错 → 已注册资源先收敛（本例 0 条）→ 错误上抛（绝不吞）
  assert.throws(() => captured[0].execute(), /register boom/)
  assert.equal(state.registerCalls.length, 1, '注册尝试留痕')
  assert.equal(state.disposerCalls, 0, '失败注册零悬挂（无半拉资源）')

  // 真 effect 语义模拟（立即执行）下同样不抛穿装载：错误由外层 fail-open 边界收敛，注册面零悬挂
  const s2 = mkState()
  s2.store.webServer = { register(spec) { s2.registerCalls.push(spec); throw new Error('register boom 2') } }
  assert.doesNotThrow(() => apply(mkCtx(s2), { vaultRoot: mkTmp(t) }, mkOpts(t)))
  assert.equal(s2.registerCalls.length, 1, '注册尝试留痕')
  assert.equal(s2.disposerCalls, 0, '失败注册零悬挂')
  assert.equal(s2.effects.length, 0, 'effect 未收下拆除器（执行体抛错）')
})

test('effect 缺缝防御：子 ctx 无 effect 缝 → 跳过注册不告警（INV-3 零残留：无拆除器路径不悬挂注册）', (t) => {
  const state = mkState()
  const ctx = mkCtx(state)
  ctx.plugin = (pluginObj) => {
    state.pluginCalls.push(pluginObj)
    state.applied.push(pluginObj)
    pluginObj.apply(mkChildCtx(state, pluginObj.inject ?? [], { withEffect: false }))
    return {}
  }
  apply(ctx, { vaultRoot: mkTmp(t) }, mkOpts(t))
  assert.deepEqual(state.registerCalls, [])
  assert.deepEqual(state.warnings, [])
})

test('B1 地基锁：未 inject 服务属性访问即抛（cordis:676 代理语义）→ apply 不抛穿；数据面由子插件承载', (t) => {
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
  assert.doesNotThrow(() => apply(ctx, { vaultRoot: mkTmp(t) }, mkOpts(t)), 'apply 绝不抛穿（fail-open 收敛）')
  // 工具面照常
  assert.equal(state.toolRegs.length, TOOL_NAMES.length)
  // 数据面注册由子插件完成（子 ctx 上 webServer/connection 为 inject 声明面，属性访问合法）
  assert.equal(state.applied.length, 1, '子插件承载数据面注册（外层 ctx 从不直取 webServer）')
  assert.equal(state.registerCalls.length, 1)
})

test('真 handler 执行面：注册后 settings/ingest 面 200 + POST scan/distill 动作通路可达（integration 真验）', async (t) => {
  const state = mkState()
  apply(mkCtx(state), { vaultRoot: mkTmp(t) }, mkOpts(t))
  const handler = state.registerCalls[0].handler
  // GET settings：{data:{config,readOnly,editable,writable}} 契约形
  let res = await call(handler, { url: '/api/wiki-steward/settings' })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.json().data).sort(), ['config', 'editable', 'readOnly', 'writable'])
  assert.equal(res.json().data.writable, false, 'configEditor 缺位=只读如实')
  // GET ingest/settings：200 {data}
  res = await call(handler, { url: '/api/wiki-steward/ingest/settings' })
  assert.equal(res.status, 200)
  assert.ok(res.json().data, 'ingest settings 响应 {data} 契约形')
  // POST scan/distill：动作通路可达（非 404/405）
  for (const p of ['/api/wiki-steward/ingest/scan', '/api/wiki-steward/ingest/distill']) {
    res = await call(handler, { method: 'POST', url: p })
    assert.equal(res.status, 200, p)
  }
})
