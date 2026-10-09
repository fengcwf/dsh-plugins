// integration.test.mjs — Task 17：假 ctx 真 apply + 真 handler 全链集成测试
// 链路（task-17-brief）：注册 → search 成功 → 全源失败错误块 → 反爬即停 → 预算熔断。
// 覆盖：US-1 / US-4 / US-5 / INV-1 / INV-4 / INV-5 / K-1 / K-5 / K-6（判据矩阵主判据见
// k-constraints.test.mjs 文件头）。
// 离线红线：HTTP 打桩（globalThis.fetch）+ apply options.sources 假源注入——不触网、不写真实 home。
// keep-alive 附注（progress.md carry-in）：guard 预算定时器 unref——挂起形负载保事件环，防提前退出。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { assertContentBlocks, assertSearchProvider, createFakeCtx } from './helpers/fake-ctx.mjs'
import { Config, apply, createSearchRuntime, renderToolBlocks } from '../lib/index.js'
import { createSource as createDdgSource } from '../lib/sources/ddg.js'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

/**
 * 宿主 resolveProvider 抛点语义模拟（dsh-web lib/index.js:120-131 同形；与 provider.test 同源）：
 * 指针显式 → 该 id 必须已注册且 available()；未注册即抛 configured web provider 缺失（US-1 病灶形）。
 */
function resolveProviderLike(fixture) {
  const web = fixture.ctx.web
  const pool = fixture.state.searchProviders
  const configuredId = web.searchProviderId
  if (configuredId) {
    const provider = pool.find((entry) => entry.id === configuredId)
    if (!provider) throw new Error(`configured web provider "${configuredId}" is not registered`)
    if (typeof provider.available === 'function' && !provider.available()) {
      throw new Error(`configured web provider "${configuredId}" is registered but unavailable`)
    }
    return provider
  }
  const usable = pool.filter((entry) => typeof entry.available !== 'function' || entry.available())
  if (usable.length === 0) throw new Error('no usable web provider is registered')
  return usable[0]
}

/**
 * 真 handler 全链（宿主 web_search 工具形）：resolveProvider → provider.search（seam 结果）→
 * output.render 契约投影 [{type:'text', text: ...}]（dsh-tool-web 同契约，K-1 断言面）。
 */
async function webSearchHandler(fixture, request) {
  const provider = resolveProviderLike(fixture)
  return renderToolBlocks(await provider.search(request))
}

/** HTTP 打桩：替换 globalThis.fetch，返回固定响应并计数；用后还原（e2e-blocked 同形）。 */
async function withStubFetch(responder, run) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts })
    return responder(String(url), opts)
  }
  try {
    return await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

/** 假源工厂（W3 统一源形）：记录调用、可编程行为。 */
function fakeSource(name, impl, { enabled = true } = {}) {
  const calls = []
  return {
    name,
    enabled,
    calls,
    async search(query, signal) {
      calls.push({ query, signal })
      return impl(query, signal)
    },
  }
}

const okSource = (name, urls) => fakeSource(name, async () => ({
  sources: urls.map((url, index) => ({ url, title: `页 ${index}`, snippet: `片段 ${index}` })),
}))

const failWith = (name, error) => fakeSource(name, async () => { throw error })

test('K-1：集成全链——注册 → search 成功 → handler 返回 ContentBlock[]（US-1）', async () => {
  // 起手 = 现状病灶形：指针停在 deepseek-official（US-1 报错根源）
  const fixture = createFakeCtx({ searchProviderId: 'deepseek-official' })
  apply(fixture.ctx, { maxResults: 8 }, { sources: [okSource('ddg', ['https://a.example/1', 'https://b.example/2'])] })

  // ① 注册面：provider 就位 + 指针补到本插件（configured web provider is not registered 报错消失）
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  assert.equal(fixture.ctx.web.searchProviderId, 'dsh-clsh-search', '指针补到本插件（US-1）')
  assert.equal(provider.available(), true, '常规接管态 available()=true')

  // ② 真 handler 全链：resolve → search → render 返回守 ContentBlock[]（K-1/INV-1）
  const blocks = await webSearchHandler(fixture, { query: 'dsh 插件开发' })
  assertContentBlocks(blocks, 'handler 返回值')
  assert.equal(blocks.length, 1, '宿主 output.render 契约 = 单文本块')
  assert.equal(blocks[0].type, 'text')
  // 宿主 formatSearchOutput 同输出（W2-RENDER-DRIFT 对齐后的集成面）
  assert.match(blocks[0].text, /^External web content follows\./, '宿主 NOTICE 前置')
  assert.match(blocks[0].text, /Sources:\n- \[页 0\]\(https:\/\/a\.example\/1\)/, '来源清单渲染')
  assert.match(blocks[0].text, /Cite the relevant URLs above as markdown links in your answer\./)
})

test('US-4：全源失败 → 明示错误块含逐源原因、发生时间与降级建议（K-1 载体）', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  const httpError = Object.assign(new Error('fetchHtml: HTTP 503'), { status: 503 })
  apply(fixture.ctx, {}, { sources: [failWith('ddg', httpError), failWith('bing', new Error('解析失败'))] })
  assertSearchProvider(fixture, 'dsh-clsh-search')

  const value = await resolveProviderLike(fixture).search({ query: 'q' })
  // Ruling-7：失败不裸抛，明示面经 seam content 上行
  assert.equal(typeof value.content, 'string', '明示错误文本经 content 字段上行（非裸 throw）')
  assert.deepEqual(value.sources, [])

  const blocks = renderToolBlocks(value)
  assertContentBlocks(blocks, '全源失败错误块')
  const text = blocks[0].text
  assert.match(text, /逐源失败记录/, '错误块主干')
  assert.match(text, /ddg：fetchHtml: HTTP 503/, '逐源原因①（K-1/US-4）')
  assert.match(text, /bing：解析失败/, '逐源原因②（K-1/US-4）')
  assert.match(text, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, '发生时间（US-4）')
  assert.match(text, /code=HTTP_STATUS|code=SOURCE_FAILED|code=Error/, '结构化错误码')
  assert.match(text, /web_fetch/, '降级建议（顺序策略引导）')
  assert.doesNotMatch(text, /No results found\./, '失败明示不叠加空结果行')
})

test('K-5/INV-5：集成链反爬命中即停——不重试不切源，明示块上行', async () => {
  const challenge = await readFile(path.join(FIXTURES, 'challenge-sample.html'), 'utf8')
  const fixture = createFakeCtx({ searchProviderId: '' })
  const ddg = createDdgSource(Config.parse({}))
  const bing = fakeSource('bing', async () => ({ sources: [{ url: 'https://bing.example/1', title: 't' }] }))
  apply(fixture.ctx, {}, { sources: [ddg, bing] })
  assertSearchProvider(fixture, 'dsh-clsh-search')

  await withStubFetch(
    async () => ({ ok: true, status: 200, text: async () => challenge }),
    async (calls) => {
      const blocks = await webSearchHandler(fixture, { query: 'dsh 插件' })
      assertContentBlocks(blocks, '反爬即停错误块')
      const text = blocks[0].text
      assert.equal(calls.length, 1, '命中即停：零重试（INV-5 禁硬刚）')
      assert.equal(bing.calls.length, 0, '命中即停：零切换源（INV-5）')
      assert.match(text, /疑似反爬\/验证码/, '明示疑似反爬/验证码')
      assert.match(text, /命中即停/, '明示即停')
      assert.match(text, /不重试/, '明示不重试')
    },
  )
})

test('INV-6：集成链整链预算熔断 → 明示块，预算后零新源请求', async () => {
  const keepAlive = setInterval(() => {}, 5) // guard 预算定时器 unref：保事件环
  try {
    const fixture = createFakeCtx({ searchProviderId: '' })
    const hanging = fakeSource('ddg', (query, signal) => new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error('aborted'))
        return
      }
      signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    }))
    const bing = fakeSource('bing', async () => ({ sources: [{ url: 'https://bing.example/1', title: 't' }] }))
    apply(fixture.ctx, { chainBudgetMs: 30 }, { sources: [hanging, bing] })
    assertSearchProvider(fixture, 'dsh-clsh-search')

    const blocks = await webSearchHandler(fixture, { query: 'q' })
    assertContentBlocks(blocks, '预算熔断错误块')
    const text = blocks[0].text
    assert.match(text, /整链预算/, '预算耗尽明示（K-6/INV-6）')
    assert.match(text, /30ms/, '明示预算值（K-9 文案如实）')
    assert.match(text, /web_fetch/, '降级建议')
    assert.equal(bing.calls.length, 0, '预算耗尽后不再发起新源请求')
  } finally {
    clearInterval(keepAlive)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T13 装配面收口（B/C/D）：自定义源端到端混排 + guard 单实例 + trigger-log 埋点 + 诊断同源
// ─────────────────────────────────────────────────────────────────────────────

/** 记录型 res 桩（诊断端点集成面）。 */
function makeRes() {
  const rec = { status: null, body: null }
  return {
    rec,
    writeHead(status) {
      rec.status = status
    },
    end(body) {
      rec.body = body ?? null
    },
  }
}

function makeReq({ method = 'GET', url = '/api/dsh-clsh-search/diagnostics', body = null } = {}) {
  const req = Readable.from(body === null ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = {}
  return req
}

test('T13 装配面：自定义源进 sourceList + priority 动态词表——端到端混排生效（B 收口）', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'clsh-asm-'))
  try {
    const config = Config.parse({
      cacheDir,
      sources: {
        custom: [{
          id: 'my-src',
          label: '我的源',
          urlTemplate: 'https://search.example.com/?q={query}',
          itemSelector: '.r',
          titleSelector: 'a',
          linkSelector: 'a',
        }],
        priority: ['my-src', 'ddg'],
      },
    })
    // 动态词表边界：未知 id 仍拒（superRefine），自定义 id 放行
    assert.throws(() => Config.parse({ sources: { custom: [], priority: ['ghost'] } }), '未知 id 拒')
    const runtime = createSearchRuntime(config, {})
    assert.deepEqual([...runtime.sourcesById().keys()], ['ddg', 'bing', 'so360', 'baidu', 'my-src'], '内置四源 + 自定义源同表（R25 混排）')
    // 端到端：真装配（无注入）→ 混排首源（my-src）真出网命中
    await withStubFetch(
      async () => ({ ok: true, status: 200, text: async () => '<html><body><div class="r"><a href="https://hit.example/1">命中</a></div></body></html>' }),
      async (calls) => {
        const aggregator = await runtime.getAggregator()
        const outcome = await aggregator.aggregate('probe')
        assert.equal(outcome.ok, true, '自定义源在生产装配里真参与聚合')
        assert.equal(outcome.sources[0].url, 'https://hit.example/1')
        assert.equal(calls.length, 1, 'priority 首源命中即收口（混排顺序生效）')
        assert.ok(calls[0].url.startsWith('https://search.example.com/?q=probe'), '自定义源模板展开真出网')
      },
    )
  } finally {
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('T13 guard 单实例 + trigger-log 埋点 + 诊断同源（C/D 收口）', async () => {
  const fixture = createFakeCtx({ searchProviderId: 'deepseek-official' })
  const registered = []
  fixture.ctx.webServer = {
    register(spec) {
      registered.push(spec)
      return () => {
        const index = registered.indexOf(spec)
        if (index >= 0) registered.splice(index, 1)
      }
    },
  }
  fixture.ctx.connection = { requestRejection: () => null }
  apply(fixture.ctx, {}, { sources: [okSource('ddg', ['https://a.example/1'])] })
  const spec = registered.find((entry) => entry.kind === 'prefix')
  assert.ok(spec, '诊断/设置路由已挂载')
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')

  // 真检索一次（runSearch 收口埋点）
  const result = await provider.search({ query: '深度学习 入门' })
  assert.ok(result.sources.length > 0)

  // 诊断面读同一 runtime：log.used=1（trigger-log 埋点恰一条）+ ego.used=1（策略 spendEgo 同 guard 单实例）
  const diagRes = makeRes()
  await spec.handler(makeReq({ method: 'GET' }), diagRes)
  assert.equal(diagRes.rec.status, 200)
  const diag = JSON.parse(diagRes.rec.body).data
  assert.equal(diag.log.used, 1, '触发日志收口埋点恰一条（T9 seam）')
  assert.equal(diag.ego.used, 1, '策略 spendEgo 与诊断读数同一 guard（双实例消除）')
  assert.equal(diag.ego.limit, 15)

  // 日志条目脱敏摘要（INV-12）：queryDigest 只留 len+首词，零 query 明文
  const logsRes = makeRes()
  await spec.handler(makeReq({ method: 'GET', url: '/api/dsh-clsh-search/logs' }), logsRes)
  const entries = JSON.parse(logsRes.rec.body).data.entries
  assert.equal(entries.length, 1)
  assert.equal(entries[0].via, 'search')
  assert.equal(entries[0].queryDigest.first, '深度学习', '首词脱敏')
  assert.equal(entries[0].queryDigest.len, '深度学习 入门'.length)
  assert.equal('query' in entries[0], false, '零查询词明文（K-13 闭集）')
  assert.ok(entries[0].sources.some((item) => item.name === 'ddg' && item.ok === true), '逐源明细进条目')
  fixture.runTeardowns()
})
