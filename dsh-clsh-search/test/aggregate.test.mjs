// aggregate.test.mjs — Task 10：多源聚合器（US-2/US-4，INV-1/INV-4/INV-5，K-1/K-4/K-6）
// 离线：源全为假实现（调用计数/假时钟），不触网；K-1 断言复用 fake-ctx 的 assertContentBlocks（勿另造）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertContentBlocks } from './helpers/fake-ctx.mjs'
import { createAggregator } from '../lib/aggregate.js'
import { createCache } from '../lib/cache.js'
import { BLOCK_CODE } from '../lib/ratelimit.js'

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib')

/** Config.parse 产物形夹具（键面 = W1 Config schema；仅覆盖测试所需键）。 */
function makeConfig(overrides = {}) {
  return {
    sources: { ddg: true, bing: true, so360: true, baidu: true, priority: ['ddg', 'bing', 'so360', 'baidu'], ...(overrides.sources ?? {}) },
    timeoutMs: 12000,
    retries: 3,
    chainBudgetMs: 30000,
    maxResults: 8,
    cacheTtlMs: 600000,
    egoBudget: 15,
    takeOver: 'auto',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'sources')),
  }
}

/** 假源工厂：记录调用（query/signal/次数），impl 决定行为。 */
function makeSource(name, impl, { enabled = true } = {}) {
  const calls = []
  return {
    name,
    enabled,
    calls,
    async search(query, signal) {
      calls.push({ query, signal })
      return impl(query, signal, calls.length)
    },
  }
}

const okResult = (urls) => ({ sources: urls.map((url, i) => ({ url, title: `t${i}`, snippet: `s${i}` })) })

test('优先级顺序：按 Config.sources.priority 依次调用，首个成功即收口（US-2）', async () => {
  const order = []
  const ddg = makeSource('ddg', async () => { order.push('ddg'); throw new Error('ddg 503') })
  const bing = makeSource('bing', async () => { order.push('bing'); return okResult(['https://b.example/1']) })
  const so360 = makeSource('so360', async () => { order.push('so360'); return okResult(['https://360.example/1']) })
  const { aggregate } = createAggregator(makeConfig(), [ddg, bing, so360])
  const outcome = await aggregate('dsh 插件')
  assert.equal(outcome.ok, true)
  assert.deepEqual(order, ['ddg', 'bing'], 'ddg 失败 → 切 bing 成功即收口，不再调 so360')
  assert.equal(outcome.sources.length, 1)
  assert.equal(outcome.failures.length, 1)
  assert.equal(outcome.failures[0].source, 'ddg')
})

test('失败切换与单源开关：disabled 源不被调用（US-2）', async () => {
  const ddg = makeSource('ddg', async () => { throw new Error('boom') })
  const bing = makeSource('bing', async () => okResult(['https://b.example/1']), { enabled: false })
  const so360 = makeSource('so360', async () => okResult(['https://360.example/1']))
  const baidu = makeSource('baidu', async () => okResult(['https://bd.example/1']))
  const { aggregate } = createAggregator(makeConfig({ sources: { baidu: false } }), [ddg, bing, so360, baidu])
  const outcome = await aggregate('q')
  assert.equal(outcome.ok, true)
  assert.equal(outcome.sources[0].url, 'https://360.example/1', 'bing(enabled=false) 与 baidu(config=false) 均跳过')
  assert.equal(bing.calls.length, 0, 'enabled=false 的源零调用')
  assert.equal(baidu.calls.length, 0, 'config.sources.<id>=false 的源零调用')
})

test('条数 clamp：越界截断非放行，默认 maxResults=8、可配（US-2 / K-9）', async () => {
  const many = okResult(Array.from({ length: 12 }, (_, i) => `https://x.example/${i}`))
  const ddg = makeSource('ddg', async () => many)
  const def = createAggregator(makeConfig(), [ddg])
  const outcome = await def.aggregate('q')
  assert.equal(outcome.sources.length, 8, '默认 8 条')
  assert.equal(outcome.truncated, true)

  const ddg2 = makeSource('ddg', async () => many)
  const tight = createAggregator(makeConfig({ maxResults: 3 }), [ddg2])
  const tightOutcome = await tight.aggregate('q')
  assert.equal(tightOutcome.sources.length, 3, 'maxResults 可配生效')
  assert.equal(tightOutcome.truncated, true)

  const ddg3 = makeSource('ddg', async () => okResult(['https://x.example/1']))
  const exact = createAggregator(makeConfig(), [ddg3])
  assert.equal((await exact.aggregate('q')).truncated, false, '未截断时 truncated=false')
})

test('全源失败错误块：含逐源失败原因与发生时间，返回形状断言 ContentBlock[]（K-1/INV-1/US-4）', async () => {
  const ddg = makeSource('ddg', async () => { const e = new Error('HTTP 503'); e.status = 503; throw e })
  const bing = makeSource('bing', async () => { throw new Error('解析失败') })
  const { aggregate } = createAggregator(makeConfig(), [ddg, bing])
  const outcome = await aggregate('dsh 查询')
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'all-failed')
  assertContentBlocks(outcome.blocks, '全源失败错误块')
  assert.equal(outcome.blocks.length, 1)
  const text = outcome.blocks[0].text
  assert.match(text, /ddg：HTTP 503/, '逐源失败原因①')
  assert.match(text, /bing：解析失败/, '逐源失败原因②')
  assert.match(text, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, '含发生时间（ISO 形）')
  assert.match(text, /web_fetch/, '含降级建议（US-4 引导面）')
  assert.equal(outcome.failures.length, 2)
  assert.match(outcome.failures[0].at, /\d{4}-\d{2}-\d{2}T/)
})

test('反爬命中即停：不重试不切源，直接明示错误块（K-5/INV-5）', async () => {
  const ddg = makeSource('ddg', async () => { const e = new Error('fetchHtml: HTTP 202'); e.status = 202; throw e })
  const bing = makeSource('bing', async () => okResult(['https://b.example/1']))
  const { aggregate } = createAggregator(makeConfig(), [ddg, bing])
  const outcome = await aggregate('q')
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'blocked')
  assert.equal(ddg.calls.length, 1, '调用方 retry 计数=0（不重试）')
  assert.equal(bing.calls.length, 0, '不切换源硬刚（命中即停）')
  assert.equal(outcome.error.code, BLOCK_CODE)
  assertContentBlocks(outcome.blocks, '命中即停错误块')
  assert.match(outcome.blocks[0].text, /疑似反爬\/验证码/, '明示疑似反爬/验证码')
  assert.match(outcome.blocks[0].text, /不重试/, '明示不重试')
})

test('整链预算：chainBudgetMs 耗尽后不再发起新源请求（K-6）', async () => {
  let clock = 1000000
  const now = () => clock
  const ddg = makeSource('ddg', async () => {
    clock += 40000 // 假时钟推进：单源耗时越过 30s 整链预算
    const e = new Error('慢响应超时')
    throw e
  })
  const bing = makeSource('bing', async () => okResult(['https://b.example/1']))
  const { aggregate } = createAggregator(makeConfig({ chainBudgetMs: 30000 }), [ddg, bing], { now })
  const outcome = await aggregate('q')
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'chain-budget')
  assert.equal(bing.calls.length, 0, '预算耗尽后不再发起新源请求')
  assertContentBlocks(outcome.blocks, '预算耗尽错误块')
  assert.match(outcome.blocks[0].text, /整链预算/, '明示预算耗尽')
  assert.equal(outcome.failures.length, 1, '已发生的失败留痕')
})

test('缓存接入：同查询同源命中缓存即收口、不再触源（US-3/K-9 键面=查询词+源名）', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-agg-'))
  try {
    const cache = await createCache({ dir, ttlMs: 600000 })
    const ddg = makeSource('ddg', async () => okResult(['https://a.example/1']))
    const { aggregate } = createAggregator(makeConfig(), [ddg], { cache })
    const first = await aggregate('缓存查询')
    assert.equal(first.fromCache, false)
    assert.equal(ddg.calls.length, 1)
    const second = await aggregate('缓存查询')
    assert.equal(second.fromCache, true, '命中缓存')
    assert.equal(ddg.calls.length, 1, '命中缓存不再触源')
    assert.deepEqual(second.sources, first.sources)
    // 键隔离：同查询词、不同源名 = 不同缓存键（单源聚合器验证不串数据）
    const bing = makeSource('bing', async () => okResult(['https://b.example/1']))
    const bingOnly = createAggregator(makeConfig(), [bing], { cache })
    const viaBing = await bingOnly.aggregate('缓存查询')
    assert.equal(viaBing.fromCache, false, '查询词同、源名不同 = 不同缓存键')
    assert.equal(bing.calls.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('K-4 隐私红线：源调用只传查询词与 signal，无本地上下文注入', async () => {
  const seen = []
  const ddg = makeSource('ddg', async (query, signal) => {
    seen.push([query, signal])
    return okResult(['https://a.example/1'])
  })
  const { aggregate } = createAggregator(makeConfig(), [ddg])
  await aggregate('  dsh 插件开发  ')
  assert.equal(seen.length, 1)
  assert.equal(seen[0][0], 'dsh 插件开发', '出网 payload = 查询词（trim 后），零附加字段')
  assert.equal(seen[0].length, 2, '调用形参恰为 (query, signal)')
  assert.ok(seen[0][1] instanceof AbortSignal, '第二参为取消信号（非上下文对象）')

  // grep 断言：聚合/缓存实现内无本地知识面注入标识（K-4 机械面）
  for (const file of ['aggregate.js', 'cache.js']) {
    const source = await readFile(path.join(LIB, file), 'utf8')
    assert.doesNotMatch(source, /vault|hindsight|memory|session|conversation/i, `${file} 不得出现本地上下文注入标识`)
  }
})

test('signal 消费（W2-SIGNAL-DANGLING 接通）：外层中止上抛、在途源收到合成信号', async () => {
  let received
  const ddg = makeSource('ddg', async (query, signal) => {
    received = signal
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    })
  })
  const bing = makeSource('bing', async () => okResult(['https://b.example/1']))
  const { aggregate } = createAggregator(makeConfig(), [ddg, bing])
  const controller = new AbortController()
  const pending = aggregate('q', controller.signal)
  controller.abort(new Error('用户取消'))
  await assert.rejects(pending, /用户取消/, '外层中止必须上抛（协作取消语义）')
  assert.ok(received instanceof AbortSignal, '在途源收到合成 signal')
  assert.equal(received.aborted, true, '外层中止传导到在途源')
  assert.equal(bing.calls.length, 0, '中止后不再发起新源')

  // 已中止的 signal：零源调用即上抛
  const aborted = new AbortController()
  aborted.abort(new Error('预先取消'))
  const ddg2 = makeSource('ddg', async () => okResult(['https://a.example/1']))
  const { aggregate: aggregate2 } = createAggregator(makeConfig(), [ddg2])
  await assert.rejects(() => aggregate2('q', aborted.signal), /预先取消/)
  assert.equal(ddg2.calls.length, 0)
})

test('aggregate 入参校验：query 空/非串与非法 config 即拒（P-6 零占位、K-9 键面）', async () => {
  const { aggregate } = createAggregator(makeConfig(), [])
  await assert.rejects(() => aggregate(''), /query/)
  await assert.rejects(() => aggregate('   '), /query/)
  await assert.rejects(() => aggregate(undefined), /query/)
  assert.throws(() => createAggregator({}, []), /config/)
  assert.throws(() => createAggregator(makeConfig({ chainBudgetMs: '30s' }), []), /chainBudgetMs/)
  assert.throws(() => createAggregator(makeConfig(), 'not-array'), /sourceList/)
})

test('W4-EMPTY-CUTOFF：单源 0 条继续下一家；全源皆空（零失败）才收空结果', async () => {
  // （a）单源空集 → 续试下一家并以后者收口
  const ddgEmpty = makeSource('ddg', async () => okResult([]))
  const bing = makeSource('bing', async () => okResult(['https://b.example/1']))
  const first = createAggregator(makeConfig(), [ddgEmpty, bing])
  const outcomeA = await first.aggregate('q')
  assert.equal(outcomeA.ok, true, '空集不收口，续试下一家')
  assert.equal(ddgEmpty.calls.length, 1)
  assert.equal(bing.calls.length, 1, '下一家被发起')
  assert.equal(outcomeA.sources[0].url, 'https://b.example/1')

  // （b）全源皆空（零失败）→ 空结果块（渲染面 No results found.）
  const allEmpty = createAggregator(makeConfig(), [
    makeSource('ddg', async () => okResult([])),
    makeSource('bing', async () => ({ sources: [] })),
  ])
  const outcomeB = await allEmpty.aggregate('q')
  assert.equal(outcomeB.ok, true, '全空=空结果（非错误块）')
  assert.deepEqual(outcomeB.sources, [])
  assert.equal(outcomeB.truncated, false)
  assert.equal(outcomeB.failures.length, 0)

  // （c）空集 + 失败混合（非「皆空」）→ 仍走失败错误块（明示逐源原因）
  const mixed = createAggregator(makeConfig(), [
    makeSource('ddg', async () => okResult([])),
    makeSource('bing', async () => { throw new Error('解析失败') }),
  ])
  const outcomeC = await mixed.aggregate('q')
  assert.equal(outcomeC.ok, false)
  assert.equal(outcomeC.reason, 'all-failed')
  assert.match(outcomeC.blocks[0].text, /bing：解析失败/, '失败原因必须明示')
})

test('W4-CACHE-TRUNCATED-LOST：缓存存原始截断标志，二次查询 truncated 不丢', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-agg2-'))
  try {
    const cache = await createCache({ dir, ttlMs: 600000 })
    const many = okResult(Array.from({ length: 12 }, (_, i) => `https://x.example/${i}`))
    const ddg = makeSource('ddg', async () => many)
    const { aggregate } = createAggregator(makeConfig({ maxResults: 8 }), [ddg], { cache })
    const first = await aggregate('截断查询')
    assert.equal(first.truncated, true, '首发截断')
    assert.equal(first.sources.length, 8)
    const second = await aggregate('截断查询')
    assert.equal(second.fromCache, true)
    assert.equal(second.truncated, true, '缓存命中的截断标志不丢（W4-CACHE-TRUNCATED-LOST）')
    assert.equal(second.sources.length, 8)
    assert.equal(ddg.calls.length, 1, '二次命中缓存')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('W4-OUTCOME-ADAPTER：成功 outcome.result=seam 封闭形 [sources,truncated]（接线适配点锁定）', async () => {
  const ddg = makeSource('ddg', async () => okResult(['https://a.example/1', 'https://a.example/2']))
  const { aggregate } = createAggregator(makeConfig(), [ddg])
  const outcome = await aggregate('q')
  assert.deepEqual(Object.keys(outcome.result).sort(), ['sources', 'truncated'], 'result 键面封闭（W2 断言同口径）')
  assert.deepEqual(outcome.result.sources, outcome.sources, '扁平键=兼容别名（t15 接线不破）')
  assert.equal(outcome.result.truncated, outcome.truncated)

  // 空结果分支同样投影
  const empty = createAggregator(makeConfig(), [makeSource('ddg', async () => okResult([]))])
  const emptyOutcome = await empty.aggregate('q')
  assert.deepEqual(Object.keys(emptyOutcome.result).sort(), ['sources', 'truncated'])
})

test('W4-CACHE-FAIL-OPEN：cache.set 抛错不炸已成功结果', async () => {
  const brokenCache = {
    async get() { return undefined },
    async set() { throw new Error('disk full') },
  }
  const ddg = makeSource('ddg', async () => okResult(['https://a.example/1']))
  const { aggregate } = createAggregator(makeConfig(), [ddg], { cache: brokenCache })
  const outcome = await aggregate('q')
  assert.equal(outcome.ok, true, '缓存故障不得炸掉已成功结果')
  assert.equal(outcome.sources.length, 1)
})

