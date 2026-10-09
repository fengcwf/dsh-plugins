// hindsight 数据面 + Config 扩键单测（2026-10-07 波 t9，U2/U3 数据面；LRN-047 真对真）。
// 被测件：lib/hindsight-routes.js（4 端点 handler + createSyncStarter 控制面 + collectStatus 口径采集）
// + lib/index.js Config hindsight 键组 + 四处同步面一致性（EDITABLE_PATHS ↔ client.js EDITABLE_FIELDS）。
// 零 mock 自证：真 handler 走真 registerIngestRoutes 单 prefix 内部分发（ingest-routes.test.mjs 同款姿势）；
// 假缝只承接宿主最小形（webServer.register / connection.requestRejection / configEditor entries+edit）
// 与 I/O 边界（fetch 注入缝、home/vault mkdtemp、同步日志临时文件）——业务控制逻辑/口径映射全真跑。
// 锁面（合同验收逐条）：①Config §5 形+嵌套 .prefault ②EDITABLE_PATHS↔EDITABLE_FIELDS 双侧同集
// （静默缺陷源补锁）③status 官方口径（勿自造字段名）④sync detached+L1 门禁+单飞 ⑤sync-log 日历过滤
// +非法参 400 ⑥toggle roundtrip 判死探针（save→load 回读一致）+editable 同列表回显。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { registerIngestRoutes, API_PREFIX } = await import('../lib/ingest-routes.js')
const { createHindsightHandlers, createSyncStarter, collectStatus, readDiagnoseConfig, readSyncLogLines } = await import('../lib/hindsight-routes.js')
const { EDITABLE_PATHS, HINDSIGHT_EDITABLE_PATHS, createApplyPatch } = await import('../lib/settings-write.js')
const { Config } = await import('../lib/index.js')

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))

function mkTmp(t, prefix = 'wiki-steward-hs-routes-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 假 host 缝（最小形）：register 只记账；connection.requestRejection 缺省放行 */
function mkHost({ rejection } = {}) {
  const routes = []
  const register = (spec) => { routes.push(spec); return () => {} }
  const connection = { requestRejection: typeof rejection === 'function' ? rejection : () => undefined }
  return { routes, register, connection }
}

function mkRes() {
  return {
    status: 0, headers: {}, body: undefined, ended: false,
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers ?? {}) },
    setHeader(k, v) { this.headers[k] = v },
    end(body) { this.ended = true; if (body !== undefined) this.body = body },
    json() { return this.body === undefined ? null : JSON.parse(this.body) },
  }
}

function mkReq({ method = 'GET', url = '/', body } = {}) {
  const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  return {
    method, url,
    headers: { host: '127.0.0.1:3080', ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    on() {},
    async *[Symbol.asyncIterator]() { if (payload !== undefined) yield Buffer.from(payload) },
  }
}

/** 真对真：真 registerIngestRoutes 单 prefix 注册 + 真 hindsight 分发缝 → 打真 handler */
function mkSetup(t, { getConfig = () => Config.parse({}), applyPatch = null, applyHindsightPatch = null, startSync, statusProbe, syncLogFile, rejection } = {}) {
  const host = mkHost({ rejection })
  const dir = mkTmp(t)
  const handlers = createHindsightHandlers({
    connection: host.connection,
    getConfig,
    applyHindsightPatch,
    startSync: startSync ?? (() => ({ started: false, reason: 'noop', note: '' })),
    statusProbe: statusProbe ?? (async () => ({ diagnose: null, sync_status: null, banks: [], warnings: [] })),
    syncLogFile: syncLogFile ?? path.join(dir, 'hindsight-sync-log.jsonl'),
  })
  for (const d of registerIngestRoutes({
    register: host.register,
    connection: host.connection,
    getConfig,
    trigger: { scan: async () => ({ ok: true }), distill: async () => ({ started: true, reason: '', note: '' }), distillStatus: async () => ({ channelAvailable: false, running: false }) },
    sources: [],
    distDir: dir,
    applyPatch,
    hindsight: handlers,
  })) { assert.equal(typeof d, 'function', 'disposer 形保持') }
  return { host, dir }
}

async function call(host, opts) {
  const spec = host.routes.find((x) => x.path === API_PREFIX)
  const res = mkRes()
  await spec.handler(mkReq(opts), res)
  return res
}

/** 假 fetch 注入缝（I/O 边界）：按 URL 分派载荷/报错；记录调用 */
function makeFetch(routes) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    for (const [pat, out] of routes) {
      if (String(url).includes(pat)) return out instanceof Error ? out : { ok: true, status: 200, json: async () => out }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  fn.calls = calls
  return fn
}

// ── ① Config hindsight 键组（solution-design §5 形；嵌套 .prefault——zod v4 坑）──────────
test('① Config hindsight 键组：§5 形默认值 + 嵌套 .prefault 填内层 + HH:MM 真校验', () => {
  const expected = { enabled: false, apiUrl: 'http://127.0.0.1:8888', banks: [], sync: { schedule: { enabled: false, time: '03:25' } } }
  assert.deepEqual(Config.parse({}).hindsight, expected, '顶层 hindsight 缺省=全默认（§5 形）')
  assert.deepEqual(Config.parse(undefined).hindsight, expected, 'rawConfig 缺省同样填默认')
  // .prefault({}) 判死：部分形配置（只给 enabled）必须照样填满内层 schedule 默认——
  // 若误用 zod v4 .default({}) 会短路直返、内层缺失即红
  assert.deepEqual(Config.parse({ hindsight: { enabled: true } }).hindsight.sync.schedule, { enabled: false, time: '03:25' }, '嵌套 prefault 填内层默认（.default({}) 短路坑的判死探针）')
  assert.equal(Config.parse({ hindsight: { enabled: true } }).hindsight.enabled, true, '置位字段如实')
  // HH:MM 真校验（settings-write 同源口径）
  assert.equal(Config.safeParse({ hindsight: { sync: { schedule: { time: '25:00' } } } }).success, false, '非法时间整单拒')
  assert.equal(Config.safeParse({ hindsight: { sync: { schedule: { time: '03:25' } } } }).success, true, '合法 HH:MM 过')
  // 向后兼容：旧配置形（无 hindsight 键）不炸
  assert.deepEqual(Config.parse({ capture: { bufferRounds: 5 } }).hindsight, expected, '旧配置形向后兼容')
})

// ── ② 四处同步面：EDITABLE_PATHS ↔ client.js EDITABLE_FIELDS 双侧同集（静默缺陷源补锁）────
test('② 双侧一致性：settings-write EDITABLE_PATHS ↔ client.js EDITABLE_FIELDS 同集同序（现无测试=静默缺陷源）', () => {
  const src = fs.readFileSync(CLIENT_PATH, 'utf8')
  const block = src.split('var EDITABLE_FIELDS = [')[1]?.split('var READONLY_FIELDS')[0] ?? ''
  assert.ok(block !== '', 'client.js EDITABLE_FIELDS 块可解析')
  const clientPaths = [...block.matchAll(/path:\s*\[([^\]]+)\]/g)].map((m) =>
    [...m[1].matchAll(/'[^']*'/g)].map((s) => s[0].slice(1, -1)).join('.'),
  )
  const serverPaths = EDITABLE_PATHS.map((p) => p.join('.'))
  assert.deepEqual(clientPaths, serverPaths, '双侧同集同序（服务端权威判据 ↔ 客户端表单副本）')
  // 断言修订理由（2026-10-07 波 t19，R-29 P0 双源根治）：hindsight 三叶**随摘**（10→7）——
  // 唯一写入口=面板六控件（HINDSIGHT_EDITABLE_PATHS 专属写缝）；rows/客户端表单副本同摘（双源永存教训）。
  assert.equal(serverPaths.length, 7, '7 叶子（hindsight 三项已摘——R-29）')
  for (const p of ['hindsight.enabled', 'hindsight.sync.schedule.enabled', 'hindsight.sync.schedule.time']) {
    assert.ok(!serverPaths.includes(p), `hindsight 叶已摘（通用面整单拒）：${p}`)
    assert.ok(!clientPaths.includes(p), `client.js EDITABLE_FIELDS 同摘：${p}`)
  }
  assert.deepEqual(HINDSIGHT_EDITABLE_PATHS.map((x) => x.join('.')), ['hindsight.enabled', 'hindsight.sync.schedule.enabled', 'hindsight.sync.schedule.time'], '专属写面白名单 3 叶（面板唯一入口）')
  // cordis.patch.yml 默认值面（四处同步第三处）：hindsight 块在且键齐
  const yml = fs.readFileSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
  for (const key of ['hindsight:', 'enabled: false', "apiUrl: 'http://127.0.0.1:8888'", 'banks: []', 'schedule:', "time: '03:25'"]) {
    assert.ok(yml.includes(key), `cordis.patch.yml 含默认值面：${key}`)
  }
})

// ── ③ GET /hindsight/status：diagnose/sync_status 官方口径聚合（勿自造字段名）────────────
test('③ status 口径：diagnose.config 五字段直读 + sync_status{bank,activeOps,synced} + banks 官方字段（活值）', async (t) => {
  const home = mkTmp(t, 'wiki-steward-hs-home-')
  fs.mkdirSync(path.join(home, '.hindsight'))
  fs.writeFileSync(path.join(home, '.hindsight', 'coding-agent.json'), JSON.stringify({ api_url: 'http://127.0.0.1:8888', api_token: '', disabled: false }))
  const ops = [
    { operation_id: 'o1', status: 'pending' },
    { operation_id: 'o2', status: 'processing' },
    { operation_id: 'o3', status: 'processing' },
    { operation_id: 'o4', status: 'completed' },
    { operation_id: 'o5', status: 'failed' },
  ]
  const fetchImpl = makeFetch([
    ['/operations', { items: ops }], // 细匹配在前（URL 含 /v1/default/banks 前缀，避免被下条 includes 抢先命中）
    ['/v1/default/banks', { items: [{ id: 'coding-agent::dsh-plugins', fact_count: 302, last_write_at: '2026-10-07T09:06:38Z', created_at: '2026-10-07T08:54:00Z' }] }],
  ])
  const { host } = mkSetup(t, {
    statusProbe: () => collectStatus({ fetchImpl, apiUrl: 'http://127.0.0.1:8888', home }),
  })
  const res = await call(host, { url: '/api/wiki-steward/hindsight/status' })
  assert.equal(res.status, 200)
  const data = res.json().data
  // diagnose.config 官方字段名直读（path/exists/api_url/api_token_configured/disabled）——不自造
  assert.deepEqual(data.diagnose.config, {
    path: path.join(home, '.hindsight', 'coding-agent.json'),
    exists: true,
    api_url: 'http://127.0.0.1:8888',
    api_token_configured: false,
    disabled: false,
  }, 'diagnose.config 口径=官方字段名（侦察 A 卡#7 勿自造）')
  // sync_status 官方字段名 {bank, activeOps, synced}；activeOps=pending+processing 计数（3）；
  // synced=activeOps===0（scout 主判据）→ false
  assert.deepEqual(data.sync_status, { bank: 'coding-agent::dsh-plugins', activeOps: 3, synced: false }, 'sync_status 口径=官方字段名+实测计数')
  // banks 官方字段（id/fact_count/last_write_at/created_at）活值不缓存 + 逐 bank activeOps/synced
  assert.equal(data.banks.length, 1)
  assert.equal(data.banks[0].fact_count, 302, 'fact_count 活值直取')
  assert.equal(data.banks[0].last_write_at, '2026-10-07T09:06:38Z')
  assert.equal(data.banks[0].activeOps, 3)
  assert.equal(data.banks[0].synced, false)
  // 插件面（Config 口径名，非 diagnose/sync_status 字段）
  assert.equal(data.enabled, false)
  assert.deepEqual(data.schedule, { enabled: false, time: '03:25' })
  assert.deepEqual(data.warnings, [], '全量取到=零告警（warnings 如实）')
  // 取不到不编造：API 挂 → sync_status null + warnings 留痕（不造数）
  const { host: host2 } = mkSetup(t, {
    statusProbe: () => collectStatus({ fetchImpl: makeFetch([['/v1/default/banks', new Error('conn refused')]]), apiUrl: 'http://127.0.0.1:8888', home }),
  })
  const res2 = await call(host2, { url: '/api/wiki-steward/hindsight/status' })
  assert.equal(res2.json().data.sync_status, null, '取不到=如实 null，绝不编造')
  assert.equal(res2.json().data.warnings.length, 1, '失败留痕（INV-15 禁静默）')
  assert.deepEqual(readDiagnoseConfig({ home: mkTmp(t, 'wiki-steward-hs-empty-') }).exists, false, 'config 缺文件=exists:false 其余不编造')
})

test('③ 鉴权/方法守卫：status 过 authGate + methodGuard（401/405 如实）', async (t) => {
  const { host } = mkSetup(t, { rejection: () => 401 })
  const r1 = await call(host, { url: '/api/wiki-steward/hindsight/status' })
  assert.equal(r1.status, 401, 'authGate 过缝失败直接回拒（绝不进业务面）')
  const { host: host2 } = mkSetup(t)
  const r2 = await call(host2, { method: 'POST', url: '/api/wiki-steward/hindsight/status' })
  assert.equal(r2.status, 405, 'methodGuard：status 仅 GET')
  assert.equal(r2.headers.allow, 'GET')
})

// ── ④ POST /hindsight/sync：L1 门禁 + detached 不阻塞 + 单飞 ───────────────────────────
test('④ sync：L1 未启用回执 disabled；启用=detached 不阻塞 + 单飞 already-running；落地后可再触发', async (t) => {
  // L1 门禁（hindsight.enabled=false 缺省）
  const starterOff = createSyncStarter({ getConfig: () => Config.parse({}), createEngine: () => { throw new Error('不该建引擎') } })
  assert.deepEqual(starterOff(), { started: false, reason: 'disabled', note: 'Hindsight 同步未启用（hindsight.enabled=false）——先在设置面开启 L1 开关' }, 'L1 停=同步行为停（插件自治立即生效）')
  // 启用 + detached 单飞（可控 deferred 引擎）
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let built = 0
  const starter = createSyncStarter({
    getConfig: () => Config.parse({ hindsight: { enabled: true } }),
    createEngine: () => ({ syncAll: async () => { built += 1; await gate; return { ok: true } } }),
  })
  const first = starter()
  assert.deepEqual(first, { started: true, reason: 'started', note: '同步已启动（detached）：机械转录落 raw/06-hindsight/，逐次记同步日志' }, 'detached 回执 started/reason/note')
  assert.equal(built, 1, '引擎已开跑（后台）')
  const second = starter()
  assert.equal(second.started, false, '单飞：进行中不重复触发')
  assert.equal(second.reason, 'already-running')
  // detatched 不阻塞：请求侧已拿到回执（gate 未 resolve 即证）
  release()
  await gate
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
  const third = starter()
  assert.equal(third.started, true, '落地后 running 旗释放，可再触发')
  // 端点形（真 handler 打真路径）
  const { host } = mkSetup(t, { startSync: () => ({ started: true, reason: 'started', note: 'n' }) })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/hindsight/sync' })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json().data, { started: true, reason: 'started', note: 'n' }, '回执 started/reason/note 三键')
})

// ── ⑤ GET /hindsight/sync-log：同步日历数据源（since/until 过滤；非法参 400）─────────────
test('⑤ sync-log：since/until 闭区间过滤 + 缺省全量 + 非法参 400（区间倒置/格式）+ 畸形行留痕', async (t) => {
  const dir = mkTmp(t)
  const logFile = path.join(dir, 'hindsight-sync-log.jsonl')
  const lines = [
    { ts: '2026-10-05T12:00:00Z', bank: 'a', facts: 1 },
    { ts: '2026-10-07T12:00:00Z', bank: 'a', facts: 2 },
    { ts: '2026-10-09T12:00:00Z', bank: 'b', facts: 3 },
  ]
  fs.writeFileSync(logFile, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n{ 坏行\n`, 'utf8')
  const { host } = mkSetup(t, { syncLogFile: logFile })
  // 缺省=全量（畸形行跳过计数如实）
  let res = await call(host, { url: '/api/wiki-steward/hindsight/sync-log' })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.count, 3, '缺省全量')
  assert.equal(res.json().data.skipped, 1, '畸形行跳过留痕（不静默）')
  // since/until 闭区间过滤（同步日历按日聚合的数据源）
  res = await call(host, { url: '/api/wiki-steward/hindsight/sync-log?since=2026-10-06&until=2026-10-08' })
  assert.deepEqual(res.json().data.lines.map((l) => l.ts), ['2026-10-07T12:00:00Z'], '闭区间过滤（含端点日）')
  res = await call(host, { url: '/api/wiki-steward/hindsight/sync-log?since=2026-10-08' })
  assert.deepEqual(res.json().data.lines.map((l) => l.ts), ['2026-10-09T12:00:00Z'], '单边 since')
  // 非法参 400（如实不静默放宽）
  for (const q of ['since=2026/10/06', 'until=abc', 'since=2026-10-09&until=2026-10-01']) {
    res = await call(host, { url: `/api/wiki-steward/hindsight/sync-log?${q}` })
    assert.equal(res.status, 400, `非法参 400：${q}`)
    assert.equal(res.json().error.code, 'bad_request')
  }
  // 日志文件缺=空（如实）
  const { host: host2 } = mkSetup(t, { syncLogFile: path.join(dir, 'nope.jsonl') })
  res = await call(host2, { url: '/api/wiki-steward/hindsight/sync-log' })
  assert.deepEqual(res.json().data, { lines: [], count: 0, skipped: 0 }, '文件缺=空，不造数')
  assert.deepEqual(readSyncLogLines(logFile).skipped, 1, 'readSyncLogLines 畸形行计数')
})

// ── ⑥ POST /hindsight/toggle：L1 写面 roundtrip 判死探针（save→load 回读一致）───────────
test('⑥ toggle roundtrip：真 applyPatch（configEditor 最小缝）→ GET settings 回读一致 + editable 同列表回显', async (t) => {
  // 真持久化缝（宿主最小形 entries/edit）：overlay=当前覆盖层，change 回调真跑 applyEditablePatch
  let overlay = {}
  let editCalls = 0
  const configEditor = {
    entries: () => [{ options: { id: 'wiki-steward' } }],
    edit: async (entry, change) => { editCalls += 1; overlay = change(overlay, {}) },
  }
  // R-29：面板写路径走专属写缝（HINDSIGHT_EDITABLE_PATHS 3 叶）；通用面（EDITABLE_PATHS 7 叶）另注一份做判死
  const applyHindsightPatch = createApplyPatch({ configEditor, entryId: 'wiki-steward', Config, editablePaths: HINDSIGHT_EDITABLE_PATHS })
  const applyPatch = createApplyPatch({ configEditor, entryId: 'wiki-steward', Config })
  const getConfig = () => Config.parse(structuredClone(overlay))
  const { host } = mkSetup(t, { getConfig, applyPatch, applyHindsightPatch })
  // 判死探针：非默认值（enabled:true）save → load 回读一致
  let res = await call(host, { method: 'POST', url: '/api/wiki-steward/hindsight/toggle', body: { enabled: true } })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.ok, true)
  assert.equal(res.json().data.config.hindsight.enabled, true, '写回执带生效 config')
  assert.equal(editCalls, 1, '白名单预检过→真触达持久化缝')
  res = await call(host, { url: '/api/wiki-steward/settings' })
  assert.equal(res.json().data.config.hindsight.enabled, true, 'roundtripPreserved：save→load 回读一致（判死探针）')
  // GET settings 回显 editable 同列表（ingest-routes.test.mjs:249 同款双侧一致）
  assert.deepEqual(res.json().data.editable.map((p) => p.join('.')), EDITABLE_PATHS.map((p) => p.join('.')), 'editable 回显=EDITABLE_PATHS 同列表')
  // 关回去（往返双向）
  res = await call(host, { method: 'POST', url: '/api/wiki-steward/hindsight/toggle', body: { enabled: false } })
  assert.equal(res.status, 200)
  res = await call(host, { url: '/api/wiki-steward/settings' })
  assert.equal(res.json().data.config.hindsight.enabled, false, '回关同样 roundtrip 一致')
  // 非法体 400（enabled 非布尔）
  res = await call(host, { method: 'POST', url: '/api/wiki-steward/hindsight/toggle', body: { enabled: 'yes' } })
  assert.equal(res.status, 400, 'enabled 须为布尔值')
  assert.equal(res.json().error.code, 'bad_request')
  // POST /hindsight/settings（R-29 面板专属写面）：schedule.time 写入 roundtrip 回读一致
  res = await call(host, { method: 'POST', url: '/api/wiki-steward/hindsight/settings', body: { patch: { hindsight: { sync: { schedule: { time: '03:30' } } } } } })
  assert.equal(res.status, 200, '面板专属写面（schedule.time）写入')
  res = await call(host, { url: '/api/wiki-steward/settings' })
  assert.equal(res.json().data.config.hindsight.sync.schedule.time, '03:30', 'schedule.time roundtripPreserved（save→load 回读一致）')
  // 双源根治判死：通用 POST /settings 写 hindsight 键=整单拒（not_editable）——rows/通用面不再可写
  res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { hindsight: { enabled: true } } } })
  assert.equal(res.status, 400, '通用面写 hindsight 键整单拒（R-29 摘叶——后写覆盖先写根除）')
  assert.equal(res.json().error.code, 'not_editable')
  res = await call(host, { url: '/api/wiki-steward/settings' })
  assert.equal(res.json().data.config.hindsight.enabled, false, '被拒写不落盘（roundtrip 判死双侧）')
  // 专属面同样受 3 叶白名单约束（不放大写面）
  res = await call(host, { method: 'POST', url: '/api/wiki-steward/hindsight/settings', body: { patch: { capture: { enabled: false } } } })
  assert.equal(res.status, 400, '专属面 3 叶之外整单拒（写面不放大）')
  // 缺写缝=503 如实（不装可写）
  const { host: host2 } = mkSetup(t, { getConfig })
  res = await call(host2, { method: 'POST', url: '/api/wiki-steward/hindsight/toggle', body: { enabled: true } })
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
  res = await call(host2, { method: 'POST', url: '/api/wiki-steward/hindsight/settings', body: { patch: { hindsight: { sync: { schedule: { time: '03:40' } } } } } })
  assert.equal(res.status, 503, '专属写面缺缝同样 503 如实')
})
