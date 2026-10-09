// settings-api.test.mjs — Task 13：设置读写契约纯模块单测（web/ 树内）。
// 覆盖：设置键与 Config 同键（无遗漏、无多余）/ 回显=R5 / toConfig 同键写回 / 传输缝可注入（离线）。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { Config } from '../../lib/index.js'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  createSettingsApi,
  fromConfig,
  toConfig,
  validateSettings,
} from '../src/lib/settings-api.js'
import { EXTRA_KEY_DEFAULTS, pickExtraKeys } from '../src/lib/budget-model.js'

test('设置键与 Config 同键：sources/priority + 预算键 + takeOver，无遗漏无多余', () => {
  assert.deepEqual(SETTINGS_KEYS, [
    'sources', 'priority', 'timeoutMs', 'retries', 'chainBudgetMs', 'maxResults', 'cacheTtlMs', 'egoBudget', 'takeOver',
  ])
  const patch = toConfig(DEFAULT_SETTINGS)
  assert.deepEqual(Object.keys(patch).sort(), [
    'cacheTtlMs', 'chainBudgetMs', 'egoBudget', 'healthTimeoutMs', 'logCapacity', 'maxResponseBytes',
    'maxResults', 'proxies', 'retries', 'retryBackoffMs', 'sources', 'takeOver', 'timeoutMs',
  ], '顶层键 = 0.1.0 八键 + 五组新键（T17b 透传）')
  for (const key of Object.keys(patch)) assert.ok(key in Config.parse({}), `Config 无键 ${key}`)
  assert.deepEqual(Object.keys(patch.sources).sort(), ['baidu', 'bing', 'custom', 'ddg', 'priority', 'so360', 'useProxy'],
    'sources 子键 = 四开关 + priority + custom/useProxy 归位（T17b）')
})

test('回显 = R5 确认表：未改动时 fromConfig 全默认一致', () => {
  assert.deepEqual(fromConfig({}), DEFAULT_SETTINGS)
  assert.equal(fromConfig({}).timeoutMs, 12000)
  assert.equal(fromConfig({}).retries, 3)
  assert.equal(fromConfig({}).chainBudgetMs, 30000)
  assert.equal(fromConfig({}).maxResults, 8)
  assert.equal(fromConfig({}).cacheTtlMs, 600000)
  assert.equal(fromConfig({}).egoBudget, 15)
  assert.equal(fromConfig({}).takeOver, 'auto')
})

test('fromConfig：缺省/非法值回落默认，越界条数 clamp，非法 priority 回默认序', () => {
  assert.equal(fromConfig({ maxResults: 99 }).maxResults, 10)
  assert.equal(fromConfig({ timeoutMs: 'x' }).timeoutMs, 12000)
  assert.equal(fromConfig({ takeOver: 'x' }).takeOver, 'auto')
  assert.deepEqual(fromConfig({ sources: { priority: ['ddg'] } }).priority, DEFAULT_SETTINGS.priority)
  assert.deepEqual(fromConfig(null), DEFAULT_SETTINGS)
})

test('toConfig：同键写回（sources 开关与 priority 并入 sources 对象）', () => {
  const patch = toConfig({
    ...DEFAULT_SETTINGS,
    sources: { ...DEFAULT_SETTINGS.sources, ddg: false },
    priority: ['baidu', 'bing', 'so360', 'ddg'],
    maxResults: 10,
    takeOver: 'force',
  })
  assert.equal(patch.sources.ddg, false)
  assert.deepEqual(patch.sources.priority, ['baidu', 'bing', 'so360', 'ddg'])
  assert.equal(patch.maxResults, 10)
  assert.equal(patch.takeOver, 'force')
})

test('validateSettings：全关/非法值给出字段提示；合法设置 ok', () => {
  const bad = validateSettings({
    ...DEFAULT_SETTINGS,
    sources: { ddg: false, bing: false, so360: false, baidu: false },
  })
  assert.equal(bad.ok, false)
  assert.match(bad.errors.sources, /至少启用一个搜索源/)
  assert.equal(validateSettings(DEFAULT_SETTINGS).ok, true)
})

test('createSettingsApi：传输缝可注入（离线假 fetch），load/save 走同键契约', async () => {
  const calls = []
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { config: { sources: { ddg: false } } } }),
    }
  }
  const api = createSettingsApi({ baseUrl: '/api/dsh-clsh-search', fetchImpl: fakeFetch, timeoutMs: 0 })
  const loaded = await api.load()
  assert.equal(loaded.sources.ddg, false)
  assert.equal(calls[0].url, '/api/dsh-clsh-search/settings')

  await api.save(DEFAULT_SETTINGS)
  assert.equal(calls[1].init.method, 'POST')
  const sent = JSON.parse(calls[1].init.body)
  assert.equal(sent.egoBudget, 15)
  assert.deepEqual(sent.sources.priority, DEFAULT_SETTINGS.priority)
})

test('createSettingsApi：错误信封可解释上抛', async () => {
  const api = createSettingsApi({
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: '保存失败（服务端）' } }) }),
    timeoutMs: 0,
  })
  await assert.rejects(() => api.load(), /保存失败（服务端）/)
})

// ─────────────────────────────────────────────────────────────────────────────
// T17 真对真集成（LRN-047）：真客户端（settings-api + 真 fetch/TCP）打真端点
// （registerSettingsRoutes 真 handler + 真 diagnostics/trigger-log）——禁两侧 mock。
// configEditor 为持久化服务依赖（内存实现，同 settings-routes 既有测试口径），非配对面 mock。
// ─────────────────────────────────────────────────────────────────────────────
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createApplyPatch, registerSettingsRoutes } from '../../lib/settings-routes.js'
import { createDiagnostics } from '../../lib/diagnostics.js'
import { createGuard } from '../../lib/guard.js'
import { createTriggerLog } from '../../lib/trigger-log.js'

const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url))

/** 真对真装置：node:http 真服务（handler=真 registerSettingsRoutes）+ 真客户端（global fetch）。 */
async function startPair({ sources = [] } = {}) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'clsh-pair-'))
  const triggerLog = createTriggerLog({ capacity: 50 })
  const guard = createGuard(Config.parse({}))
  let cacheCleared = 0
  const diagnostics = createDiagnostics({
    config: Config.parse({ cacheDir, healthTimeoutMs: 300 }),
    validateConfig: (candidate) => Config.safeParse(candidate),
    triggerLog,
    getGuard: () => guard,
    clearCache: async () => {
      cacheCleared += 1
      return 3
    },
    sourcesById: () => new Map(sources.map((source) => [source.name, source])),
    hasWriteSeam: () => true,
  })
  const state = { current: {} }
  const configEditor = {
    entries: () => [{ options: { id: 'dsh-clsh-search' } }],
    async edit(entry, fn) {
      state.current = fn(structuredClone(state.current), {})
    },
  }
  const registered = []
  registerSettingsRoutes({
    register: (spec) => {
      registered.push(spec)
      return () => {}
    },
    connection: { requestRejection: () => null },
    getConfig: () => structuredClone(state.current),
    applyPatch: createApplyPatch({ configEditor, entryId: 'dsh-clsh-search', Config }),
    distDir: WEB_DIST,
    warn: () => {},
    diagnostics,
  })
  const server = createServer((req, res) => registered[0].handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const api = createSettingsApi({ baseUrl: `http://127.0.0.1:${port}/api/dsh-clsh-search`, fetchImpl: fetch })
  return {
    api,
    state,
    triggerLog,
    guard,
    diagnostics,
    cacheClearedCount: () => cacheCleared,
    close: async () => {
      await new Promise((resolve) => server.close(resolve))
      await rm(cacheDir, { recursive: true, force: true })
    },
  }
}

function fakeSource(name, impl) {
  return { name, enabled: true, search: impl }
}

test('T17 六端点封装逐一对应（真客户端打真端点）', async () => {
  const sources = [
    fakeSource('ddg', async () => ({ sources: [{ url: 'https://a.example/1', title: 't', snippet: '' }] })),
    fakeSource('bing', async () => ({ sources: [] })),
    fakeSource('so360', async () => ({ sources: [] })),
    fakeSource('baidu', async () => ({ sources: [] })),
  ]
  const pair = await startPair({ sources })
  try {
    const snapshot = await pair.api.diagnostics()
    assert.ok(Array.isArray(snapshot.items) && snapshot.items.length >= 6, 'GET /diagnostics：自检清单')
    assert.match(snapshot.summary, /^\d+ 项 · \d+ 通过 \/ \d+ 失败$/)

    const probe = await pair.api.probe('ddg')
    assert.equal(probe.source, 'ddg')
    assert.equal(probe.ok, true, 'POST /diagnostics/probe：单源探针')
    assert.equal(probe.resultCount, 1)

    const online = await pair.api.onlineTest()
    assert.ok(Array.isArray(online.results) && online.results.length === 4, 'POST /diagnostics/online：逐源结果')
    assert.equal(online.budgetMs, 10000)

    const logs = await pair.api.logs()
    assert.equal(logs.capacity, 50, 'GET /logs')

    const clearedLogs = await pair.api.clearLogs()
    assert.deepEqual(Object.keys(clearedLogs), ['cleared'], 'POST /logs/clear')
    const clearedCache = await pair.api.clearCache()
    assert.equal(clearedCache.cleared, 3, 'POST /cache/clear')
    assert.equal(pair.cacheClearedCount(), 1, '两清分离：cache/clear 只动缓存面')
  } finally {
    await pair.close()
  }
})

test('T17 roundtripPreserved 判死探针：预置非默认值 → save → load 回读一致（LRN-047）', async () => {
  const pair = await startPair()
  try {
    const preset = {
      ...DEFAULT_SETTINGS,
      sources: { ...DEFAULT_SETTINGS.sources, ddg: false, baidu: false },
      priority: ['baidu', 'bing', 'so360', 'ddg'],
      timeoutMs: 5000,
      retries: 1,
      chainBudgetMs: 12345,
      maxResults: 3,
      cacheTtlMs: 111000,
      egoBudget: 7,
      takeOver: 'off',
    }
    const saved = await pair.api.save(preset)
    const loaded = await pair.api.load()
    assert.deepEqual(loaded, saved, 'save 回显 = load 回读（判死探针：任一字段漂移即红）')
    // 非默认值逐项判死（默认值镜像相同不算数）
    assert.equal(loaded.timeoutMs, 5000)
    assert.equal(loaded.retries, 1)
    assert.equal(loaded.chainBudgetMs, 12345)
    assert.equal(loaded.maxResults, 3)
    assert.equal(loaded.cacheTtlMs, 111000)
    assert.equal(loaded.egoBudget, 7)
    assert.equal(loaded.takeOver, 'off')
    assert.deepEqual(loaded.priority, ['baidu', 'bing', 'so360', 'ddg'])
    assert.equal(loaded.sources.ddg, false)
    assert.equal(loaded.sources.baidu, false)
    assert.equal(loaded.sources.bing, true)
  } finally {
    await pair.close()
  }
})

test('T17 诊断快照 roundtrip：自检结果读写一致（真 GET 对读 + 稳定面复读）', async () => {
  const sources = ['ddg', 'bing', 'so360', 'baidu'].map((name) => fakeSource(name, async () => ({ sources: [] })))
  const pair = await startPair({ sources })
  try {
    const viaClient = await pair.api.diagnostics()
    // 真对真读写一致：客户端解出的快照 == 服务端 selfCheck 原始产物（序列化 roundtrip 无损）
    const serverSide = await pair.diagnostics.selfCheck()
    assert.deepEqual(viaClient, serverSide, '自检结果读写一致（服务端原物 → JSON → 客户端解析，无损）')
    const again = await pair.api.diagnostics()
    assert.deepEqual(again, viaClient, '自检快照复读一致')
    assert.deepEqual(Object.keys(viaClient).sort(), ['ego', 'items', 'log', 'stats', 'summary'], '快照键面封闭')
    assert.equal(viaClient.items.length, 7, '七项自检')
    // 活动后快照如实变化（写面反映到读面）：record 一条 → log.used 上行
    pair.triggerLog.record({ ts: 1, via: 'probe', ok: true, sources: [] })
    const after = await pair.api.diagnostics()
    assert.equal(after.log.used, viaClient.log.used + 1, '写→读 roundtrip：日志环计数上行')
  } finally {
    await pair.close()
  }
})

test('T17 logs roundtrip：record → GET /logs 回读一致 + clear 后为空', async () => {
  const pair = await startPair()
  try {
    pair.triggerLog.record({ ts: 11, via: 'search', ok: true, elapsedMs: 5, resultCount: 2, queryDigest: { len: 6, first: '深度学习' }, sources: [{ name: 'ddg', elapsedMs: 5, ok: true }] })
    pair.triggerLog.record({ ts: 12, via: 'probe', ok: false, elapsedMs: 9, resultCount: 0, queryDigest: { len: 3, first: 'test' }, sources: [{ name: 'bing', elapsedMs: 9, ok: false, code: 'boom' }] })
    const view = await pair.api.logs()
    assert.equal(view.entries.length, 2, 'record → GET /logs 回读条数一致')
    assert.deepEqual(view.entries[0].queryDigest, { len: 6, first: '深度学习' }, '脱敏摘要 roundtrip 无损')
    assert.equal(view.entries[1].sources[0].code, 'boom', '逐源明细 roundtrip 无损')
    assert.deepEqual(view.entries, pair.triggerLog.list(), '客户端解出 = 环内原样（读写一致）')
    const cleared = await pair.api.clearLogs()
    assert.equal(cleared.cleared, 2)
    const after = await pair.api.logs()
    assert.deepEqual(after.entries, [], 'clear 后为空')
  } finally {
    await pair.close()
  }
})

test('T17 信封形制：{data} / {error:{code,message,hint?}}——失败必有 hint（kc/gho 先例形）', async () => {
  const pair = await startPair()
  try {
    // 400 bad_request：服务端 code + 客户端缺省 hint 回填
    await assert.rejects(
      () => pair.api.probe(''),
      (error) => error.code === 'bad_request' && typeof error.hint === 'string' && error.hint.length > 0,
      'bad_request 带 hint（可执行下一步）',
    )
    // 503 logs_unavailable：环写失败语义 + hint 明示重启自愈
    const trap = {}
    Object.defineProperty(trap, 'ts', { get() { throw new Error('boom') } })
    pair.triggerLog.record(trap)
    await assert.rejects(
      () => pair.api.logs(),
      (error) => error.code === 'logs_unavailable' && /重启后自愈/.test(error.hint),
      'logs_unavailable 带 hint（INV-13 明示）',
    )
    // 405 方法不符：同样可解释（code + hint）
    const wrong = createSettingsApi({ baseUrl: 'unused', fetchImpl: async () => ({ ok: false, status: 405, json: async () => null }), timeoutMs: 0 })
    await assert.rejects(
      () => wrong.diagnostics(),
      (error) => error.code === 'http_405' && error.hint.length > 0,
      '无 code 的失败也回填可解释 hint',
    )
  } finally {
    await pair.close()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T17b 七键透传（补 t28 跨卡缺口）：fromConfig/toConfig ↔ Config 七组新键
// ─────────────────────────────────────────────────────────────────────────────

const SEVEN_PRESET = {
  retryBackoffMs: 250,
  maxResponseBytes: 2048,
  logCapacity: 33,
  healthTimeoutMs: 1500,
  proxies: [{ id: 'main', label: '主力', address: '192.168.0.41:7890' }],
  useProxy: { ddg: false, bing: false, so360: true, baidu: true },
  custom: [{
    id: 'my-src',
    label: '我的源',
    urlTemplate: 'https://search.example.com/?q={query}',
    itemSelector: '.r',
    titleSelector: 'a',
    linkSelector: 'a',
    useProxy: true,
  }],
}

test('T17b roundtripPreserved 判死探针：七键全预置非默认值 → save → load 逐字段 deepEqual（真对真）', async () => {
  const pair = await startPair()
  try {
    const preset = { ...DEFAULT_SETTINGS, ...SEVEN_PRESET }
    const saved = await pair.api.save(preset)
    const loaded = await pair.api.load()
    assert.deepEqual(loaded, saved, 'save 回显 = load 回读（七键判死：任一漂移即红）')
    assert.equal(loaded.retryBackoffMs, 250)
    assert.equal(loaded.maxResponseBytes, 2048)
    assert.equal(loaded.logCapacity, 33)
    assert.equal(loaded.healthTimeoutMs, 1500)
    assert.deepEqual(loaded.proxies, SEVEN_PRESET.proxies, '代理池 roundtrip 无损')
    assert.deepEqual(loaded.useProxy, SEVEN_PRESET.useProxy, '每源勾选 roundtrip 无损')
    assert.deepEqual(loaded.custom, SEVEN_PRESET.custom, '自定义源 roundtrip 无损')
  } finally {
    await pair.close()
  }
})

test('T17b custom/useProxy 正确归位 sources 子键（非平铺）', () => {
  const patch = toConfig({ ...DEFAULT_SETTINGS, ...SEVEN_PRESET })
  assert.ok(Array.isArray(patch.sources.custom), 'custom 落 sources.custom（数组叶子）')
  assert.equal(patch.sources.custom[0].id, 'my-src')
  assert.deepEqual(patch.sources.useProxy, SEVEN_PRESET.useProxy, 'useProxy 落 sources.useProxy（逐源布尔）')
  assert.equal('custom' in patch, false, '顶层不平铺 custom')
  assert.equal('useProxy' in patch, false, '顶层不平铺 useProxy')
  assert.equal(patch.retryBackoffMs, 250, '顶层五键平铺（retryBackoffMs/maxResponseBytes/logCapacity/healthTimeoutMs/proxies）')
  assert.equal(patch.proxies.length, 1)
})

test('T17b pickExtraKeys 仅在场键：缺键不清空不覆写（消费 t28 契约不重做）', () => {
  // 仅在场键出场（不带默认值兜底噪声）
  assert.deepEqual(pickExtraKeys({ retryBackoffMs: 400 }), { retryBackoffMs: 400 })
  assert.deepEqual(pickExtraKeys({}), {}, '空输入零键（缺键不臆造）')
  assert.deepEqual(pickExtraKeys({ sources: { custom: [{ id: 'x' }] } }).custom, [{ id: 'x' }], 'sources 子键位同样抽取')
  // fromConfig 缺键回落默认（模型面完整），在场键原样透传
  const model = fromConfig({ logCapacity: 7 })
  assert.equal(model.logCapacity, 7, '在场键透传')
  assert.equal(model.retryBackoffMs, EXTRA_KEY_DEFAULTS.retryBackoffMs, '缺键回落镜像默认（不清空语义由写回面 extraPatch 保证）')
  assert.deepEqual(model.custom, [], '缺 custom 回落空数组')
})
