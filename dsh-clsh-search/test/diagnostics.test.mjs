// diagnostics.test.mjs — T13 诊断面单测（US-10/11/16，INV-13/14/15/20）
// 离线：假源/假 guard/假缓存 + mkdtemp 落点；自检纯本地零出网（探针走假源）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { ONLINE_TOTAL_BUDGET_MS, createDiagnostics } from '../lib/diagnostics.js'
import { createGuard } from '../lib/guard.js'
import { createTriggerLog } from '../lib/trigger-log.js'
import { Config } from '../lib/index.js'

/** 装置：mkdtemp cacheDir + 真 triggerLog/guard + 可编程假源表。 */
async function setup({ sources = [], writeSeam = true, capacity = 200 } = {}) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'clsh-diag-'))
  const config = Config.parse({ cacheDir, healthTimeoutMs: 300, logCapacity: capacity })
  const triggerLog = createTriggerLog({ capacity })
  const guard = createGuard(config)
  let cacheCleared = 0
  const diagnostics = createDiagnostics({
    config,
    validateConfig: (candidate) => Config.safeParse(candidate),
    triggerLog,
    getGuard: () => guard,
    clearCache: async () => {
      cacheCleared += 1
      return 7
    },
    sourcesById: () => new Map(sources.map((source) => [source.name, source])),
    hasWriteSeam: () => writeSeam,
  })
  return {
    config,
    diagnostics,
    triggerLog,
    guard,
    cacheDir,
    cacheClearedCount: () => cacheCleared,
    cleanup: () => rm(cacheDir, { recursive: true, force: true }),
  }
}

function fakeSource(name, impl) {
  return {
    name,
    enabled: true,
    calls: [],
    async search(query, signal) {
      this.calls.push({ query, signal })
      return impl(query, signal)
    },
  }
}

test('自检清单形制：{id,label,status,detail} + summary「N 项 · X 通过 / Y 失败」（rtk doctor 形）', async () => {
  const s = await setup({
    sources: [fakeSource('ddg', async () => ({ sources: [] }))],
  })
  try {
    const report = await s.diagnostics.selfCheck()
    assert.ok(Array.isArray(report.items) && report.items.length >= 6, '自检项 ≥6')
    for (const item of report.items) {
      assert.deepEqual(Object.keys(item).sort(), ['detail', 'id', 'label', 'status'], '项键恰四枚')
      assert.ok(['pass', 'fail'].includes(item.status))
    }
    assert.match(report.summary, /^\d+ 项 · \d+ 通过 \/ \d+ 失败$/, 'summary 计数形制')
    const passed = report.items.filter((item) => item.status === 'pass').length
    assert.equal(report.summary, `${report.items.length} 项 · ${passed} 通过 / ${report.items.length - passed} 失败`)
    // 运行时读数面（INV-20 真实计数 + 日志环 + 逐源统计）
    assert.deepEqual(report.ego, { used: s.guard.egoUsed(), limit: s.guard.egoLimit() })
    assert.equal(report.log.available, true)
    assert.equal(report.log.capacity, 200)
    assert.ok(Array.isArray(report.stats))
    // 全项本地自检（缓存目录探针用 mkdtemp，成功即回收）
    const ids = report.items.map((item) => item.id)
    for (const id of ['config', 'sources', 'write-seam', 'cache-dir', 'trigger-log', 'outbound-gate']) {
      assert.ok(ids.includes(id), `自检项含 ${id}`)
    }
  } finally {
    await s.cleanup()
  }
})

test('自检如实失败面：写缝缺位与日志不可用标 fail（不粉饰）', async () => {
  const s = await setup({ writeSeam: false, sources: [fakeSource('ddg', async () => ({ sources: [] }))] })
  try {
    s.triggerLog.record({ ts: 1 })
    // 让环不可用：喂一个读取即抛的条目（T9 fail-open 语义）
    const trap = {}
    Object.defineProperty(trap, 'ts', { get() { throw new Error('boom') } })
    s.triggerLog.record(trap)
    assert.equal(s.triggerLog.available(), false)
    const report = await s.diagnostics.selfCheck()
    const byId = new Map(report.items.map((item) => [item.id, item]))
    assert.equal(byId.get('write-seam').status, 'fail', '写缝缺位如实标 fail')
    assert.equal(byId.get('trigger-log').status, 'fail', '日志不可用如实标 fail')
    assert.equal(report.log.available, false)
  } finally {
    await s.cleanup()
  }
})

test('logsView：环不可用抛 503 logs_unavailable；可用时回 entries/capacity（INV-13）', async () => {
  const s = await setup()
  try {
    s.triggerLog.record({ ts: 1, via: 'search', ok: true })
    const view = s.diagnostics.logsView()
    assert.equal(view.entries.length, 1)
    assert.equal(view.capacity, 200)
    assert.equal(view.available, true)
    const trap = {}
    Object.defineProperty(trap, 'ts', { get() { throw new Error('boom') } })
    s.triggerLog.record(trap)
    assert.throws(
      () => s.diagnostics.logsView(),
      (error) => error.code === 'logs_unavailable' && error.status === 503,
      '环不可用 = 503 logs_unavailable',
    )
  } finally {
    await s.cleanup()
  }
})

test('clearLogs 与 clearCache 分离：各清各面互不越界', async () => {
  const s = await setup()
  try {
    s.triggerLog.record({ ts: 1 })
    s.triggerLog.record({ ts: 2 })
    const clearedLogs = s.diagnostics.clearLogs()
    assert.equal(clearedLogs.cleared, 2, 'logs/clear 只清内存环')
    assert.equal(s.triggerLog.size(), 0)
    assert.equal(s.cacheClearedCount(), 0, 'logs/clear 不碰缓存面')
    const clearedCache = await s.diagnostics.clearCache()
    assert.equal(clearedCache.cleared, 7, 'cache/clear 只清缓存面')
    assert.equal(s.cacheClearedCount(), 1)
  } finally {
    await s.cleanup()
  }
})

test('probe 单源探针：直调源 search 绕过缓存与 guard（task-A D16 形）', async () => {
  const source = fakeSource('ddg', async () => ({ sources: [{ url: 'https://a.example/1', title: 't', snippet: '' }] }))
  const s = await setup({ sources: [source] })
  try {
    const result = await s.diagnostics.probe('ddg')
    assert.equal(result.source, 'ddg')
    assert.equal(result.ok, true)
    assert.equal(result.resultCount, 1)
    assert.ok(result.elapsedMs >= 0)
    assert.equal(source.calls.length, 1, '直调源工厂 search（不经聚合器）')
    assert.ok(source.calls[0].signal instanceof AbortSignal, '单源超时信号 = Config.healthTimeoutMs 桥接')
    // 绕过 guard：ego/chain 零消耗
    assert.equal(s.guard.egoUsed(), 0)
    // 未知源如实报
    const unknown = await s.diagnostics.probe('ghost')
    assert.equal(unknown.ok, false)
    assert.match(unknown.detail, /未知源/)
    // 失败路径如实（错误码进 detail）
    const bad = fakeSource('bing', async () => {
      const error = new Error('boom')
      error.code = 'SEARCH_BLOCKED_SUSPECTED'
      throw error
    })
    const s2 = await setup({ sources: [bad] })
    const failed = await s2.diagnostics.probe('bing')
    assert.equal(failed.ok, false)
    assert.equal(failed.detail, 'SEARCH_BLOCKED_SUSPECTED')
    await s2.cleanup()
  } finally {
    await s.cleanup()
  }
})

test('online 真联网测试：总上限截断标注「未测（超时截断）」不空等（R30）', async () => {
  const slow = fakeSource('ddg', () => new Promise(() => {})) // 永不完成（忽略 signal）
  const quick = fakeSource('bing', async () => ({ sources: [{ url: 'https://b.example/', title: 't', snippet: '' }] }))
  const s = await setup({ sources: [slow, quick] })
  try {
    const started = Date.now()
    const report = await s.diagnostics.online({ budgetMs: 60 })
    const elapsed = Date.now() - started
    assert.ok(elapsed < 2000, '绝不空等（总上限 60ms 级收口）')
    assert.equal(report.results.length, 2)
    assert.equal(report.results[0].source, 'ddg')
    assert.equal(report.results[0].detail, '未测（超时截断）', '挂死源被预算截断并标注')
    assert.equal(report.truncated, true)
    assert.equal(report.budgetMs, 60)
    // 预算耗尽后余源直接标未测（不发起）
    assert.equal(report.results[1].detail, '未测（超时截断）', '预算尽后余源不发起（标未测）')
    assert.equal(quick.calls.length, 0, '截断后不发起新源请求（不空等不硬跑）')
  } finally {
    await s.cleanup()
  }
})

test('online 正常面：预算内逐源出结果（默认总上限 = R30 的 10s）', async () => {
  const quick = fakeSource('ddg', async () => ({ sources: [{ url: 'https://a.example/1', title: 't', snippet: '' }, { url: 'https://a.example/2', title: 't2', snippet: '' }] }))
  const empty = fakeSource('bing', async () => ({ sources: [] }))
  const s = await setup({ sources: [quick, empty] })
  try {
    const report = await s.diagnostics.online()
    assert.equal(report.budgetMs, ONLINE_TOTAL_BUDGET_MS, '默认总上限 10s（R30）')
    assert.equal(report.truncated, false)
    assert.deepEqual(report.results.map((r) => [r.source, r.ok, r.resultCount]), [['ddg', true, 2], ['bing', true, 0]])
  } finally {
    await s.cleanup()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T10 补强面：七项齐面 / 缓存探针如实失败 / stats() 逐源聚合 / t16 真页 fixture 回归
// ─────────────────────────────────────────────────────────────────────────────

const SEVEN_IDS = ['config', 'sources', 'priority', 'write-seam', 'cache-dir', 'trigger-log', 'outbound-gate']

test('T10 自检七项齐面：缓存目录可写 / 出站门禁在场 / 路由写缝在场逐项在位（齐配全 pass）', async () => {
  const sources = ['ddg', 'bing', 'so360', 'baidu'].map((name) => fakeSource(name, async () => ({ sources: [] })))
  const s = await setup({ sources })
  try {
    const report = await s.diagnostics.selfCheck()
    assert.deepEqual(report.items.map((item) => item.id).sort(), [...SEVEN_IDS].sort(), '七项恰齐（T10 补强面）')
    assert.equal(report.summary, '7 项 · 7 通过 / 0 失败', '齐配面全 pass')
    const byId = new Map(report.items.map((item) => [item.id, item]))
    assert.equal(byId.get('cache-dir').status, 'pass', 'mkdtemp 探针在位且通过')
    assert.match(byId.get('cache-dir').detail, /mkdtemp 探针已回收/, '探针测后清理（不写真 home 残留）')
    assert.equal(byId.get('outbound-gate').status, 'pass', 'assertPublicHttps 可调用且行为正确')
    assert.match(byId.get('outbound-gate').detail, /https 放行 \/ http 拒收/)
    assert.equal(byId.get('write-seam').status, 'pass', 'softService 写缝读数在位')
  } finally {
    await s.cleanup()
  }
})

test('T10 缓存目录探针失败如实 fail 不抛；探针零残留（不写真 home）', async () => {
  const sources = ['ddg', 'bing', 'so360', 'baidu'].map((name) => fakeSource(name, async () => ({ sources: [] })))
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'clsh-diag2-'))
  try {
    const config = Config.parse({ cacheDir: path.join(cacheDir, 'not-exist', 'nested'), healthTimeoutMs: 300 })
    const triggerLog = createTriggerLog({ capacity: 200 })
    const diagnostics = createDiagnostics({
      config,
      validateConfig: (candidate) => Config.safeParse(candidate),
      triggerLog,
      getGuard: () => createGuard(Config.parse({})),
      clearCache: async () => 0,
      sourcesById: () => new Map(sources.map((source) => [source.name, source])),
      hasWriteSeam: () => true,
    })
    const report = await diagnostics.selfCheck()
    const byId = new Map(report.items.map((item) => [item.id, item]))
    assert.equal(byId.get('cache-dir').status, 'fail', '不可写如实 fail')
    assert.match(byId.get('cache-dir').detail, /不可写/, 'fail 明细不粉饰')
    assert.ok(report.items.every((item) => item.status === 'pass' || item.status === 'fail'), '不抛、清单完整')
    // 正常目录下探针零残留
    const okDiag = createDiagnostics({
      config: Config.parse({ cacheDir, healthTimeoutMs: 300 }),
      validateConfig: (candidate) => Config.safeParse(candidate),
      triggerLog,
      getGuard: () => createGuard(Config.parse({})),
      clearCache: async () => 0,
      sourcesById: () => new Map(sources.map((source) => [source.name, source])),
      hasWriteSeam: () => true,
    })
    await okDiag.selfCheck()
    const { readdir } = await import('node:fs/promises')
    assert.deepEqual(await readdir(cacheDir), [], '探针目录测后即清（零残留）')
  } finally {
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('T10 stats() 逐源聚合：{count,okCount,failCount,lastMs,lastOk}（R29 复用日志环）', async () => {
  const s = await setup()
  try {
    s.triggerLog.record({ ts: 1, sources: [{ name: 'ddg', elapsedMs: 10, ok: true }] })
    s.triggerLog.record({ ts: 2, sources: [{ name: 'ddg', elapsedMs: 30, ok: false, code: 'boom' }] })
    s.triggerLog.record({ ts: 3, sources: [{ name: 'bing', elapsedMs: 7, ok: true }] })
    const report = await s.diagnostics.selfCheck()
    assert.deepEqual(report.stats.map((stat) => stat.name), ['bing', 'ddg'], '按源名稳定排序')
    for (const stat of report.stats) {
      assert.deepEqual(Object.keys(stat).sort(), ['count', 'failCount', 'lastMs', 'lastOk', 'name', 'okCount'], '逐源统计键面恰闭集')
    }
    const ddg = report.stats.find((stat) => stat.name === 'ddg')
    assert.deepEqual({ count: ddg.count, okCount: ddg.okCount, failCount: ddg.failCount, lastMs: ddg.lastMs, lastOk: ddg.lastOk },
      { count: 2, okCount: 1, failCount: 1, lastMs: 30, lastOk: false }, '逐源计数与最近读数如实')
  } finally {
    await s.cleanup()
  }
})

test('T10 真页 fixture 回归面（t16 真页库）：解析结果接进日志环 → stats() 逐源聚合', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { parseSerp: parseDdg } = await import('../lib/sources/ddg.js')
  const { parseSerp: parseBing } = await import('../lib/sources/bing.js')
  const { parseSerp: parseSo360 } = await import('../lib/sources/so360.js')
  const REAL = new URL('./fixtures/real/', import.meta.url)
  const files = readdirSync(REAL).filter((name) => name.endsWith('.html'))
  assert.deepEqual(files.sort(), ['bing-kubernetes.html', 'bing-postgresql.html', 'ddg-kubernetes.html', 'ddg-postgresql.html', 'so360-kubernetes.html'], 't16 真页 5 件在场（baidu 缺，README 注明，不臆造）')
  const cases = [
    ['ddg-kubernetes.html', parseDdg, 'ddg'],
    ['ddg-postgresql.html', parseDdg, 'ddg'],
    ['bing-kubernetes.html', parseBing, 'bing'],
    ['bing-postgresql.html', parseBing, 'bing'],
    ['so360-kubernetes.html', parseSo360, 'so360'],
  ]
  const s = await setup()
  try {
    for (const [file, parse, sourceName] of cases) {
      const html = readFileSync(new URL(file, REAL), 'utf8')
      const items = parse(html)
      assert.ok(items.length >= 1, `${file} 真页解析非空（回归锚）`)
      // 真页回归读数接进诊断面：每次回归恰一条记录（via:'probe'）+ 逐源明细
      s.triggerLog.record({ ts: Date.now(), via: 'probe', ok: true, elapsedMs: 12, resultCount: items.length, sources: [{ name: sourceName, elapsedMs: 12, ok: true }] })
    }
    s.triggerLog.record({ ts: Date.now(), via: 'probe', ok: false, elapsedMs: 5, resultCount: 0, sources: [{ name: 'so360', elapsedMs: 5, ok: false, code: 'boom' }] })
    const report = await s.diagnostics.selfCheck()
    const byName = new Map(report.stats.map((stat) => [stat.name, stat]))
    assert.equal(byName.get('ddg').count, 2, 'ddg 两真页计数')
    assert.equal(byName.get('bing').count, 2, 'bing 两真页计数')
    assert.equal(byName.get('so360').count, 2, 'so360 真页 + 失败面计数')
    assert.equal(byName.get('so360').failCount, 1)
    assert.equal(byName.get('so360').lastOk, false)
    assert.equal(report.log.used, 6, '回归读数恰 6 条进日志环（5 真页 + 1 失败面）')
  } finally {
    await s.cleanup()
  }
})
