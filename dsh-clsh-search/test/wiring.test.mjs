// wiring.test.mjs — W5 接线面（Ruling-7 失败路径口径 + W2-SIGNAL-DANGLING 闭合实证）
// 离线：假源注入（apply options.sources 测试缝），不触网不写真实 home。
import test from 'node:test'
import assert from 'node:assert/strict'

import { assertContentBlocks, assertSearchProvider, createFakeCtx } from './helpers/fake-ctx.mjs'
import { apply, renderToolBlocks } from '../lib/index.js'
import { BLOCK_CODE } from '../lib/ratelimit.js'

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

const okSource = (urls) => async () => ({ sources: urls.map((url) => ({ url, title: 't', snippet: 's' })) })

test('Ruling-7 ok:true → seam 键面封闭 [sources, truncated] 交回 provider.search', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  const ddg = fakeSource('ddg', okSource(['https://a.example/1', 'https://a.example/2']))
  apply(fixture.ctx, { maxResults: 8 }, { sources: [ddg] })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  const value = await provider.search({ query: 'q', maxResults: 8 })
  assert.deepEqual(Object.keys(value).sort(), ['sources', 'truncated'], '成功形键面封闭（Ruling-5）')
  assert.equal(value.sources.length, 2)
  assert.equal(value.truncated, false)
})

test('Ruling-7 ok:false → 明示错误块给 LLM（content 上行，非裸 throw）', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  const ddg = fakeSource('ddg', async () => { const e = new Error('HTTP 503'); e.status = 503; throw e })
  const bing = fakeSource('bing', async () => { throw new Error('解析失败') })
  apply(fixture.ctx, {}, { sources: [ddg, bing] })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  // 不裸抛（Ruling-7）：search 正常 resolve 出明示面
  const value = await provider.search({ query: 'q' })
  assert.equal(value.truncated, false)
  assert.deepEqual(value.sources, [])
  assert.equal(typeof value.content, 'string', '明示块文本经 seam content 字段上行')
  assert.match(value.content, /ddg：HTTP 503/, '逐源失败原因①')
  assert.match(value.content, /bing：解析失败/, '逐源失败原因②')
  assert.match(value.content, /\d{4}-\d{2}-\d{2}T/, '发生时间')
  assert.match(value.content, /web_fetch/, '降级建议')
  // handler render 面以 text 块呈现明示内容（K-1）
  const blocks = renderToolBlocks(value)
  assertContentBlocks(blocks, '失败明示块')
  assert.match(blocks[0].text, /逐源失败记录/, 'render 面含明示正文')
  assert.doesNotMatch(blocks[0].text, /No results found\./, '失败明示不再叠加空结果行')
})

test('Ruling-7 blocked 即停：反爬明示块上行（疑似反爬/验证码 + 不重试）', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  const ddg = fakeSource('ddg', async () => { const e = new Error('fetchHtml: HTTP 202'); e.status = 202; throw e })
  const bing = fakeSource('bing', okSource(['https://b.example/1']))
  apply(fixture.ctx, {}, { sources: [ddg, bing] })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  const value = await provider.search({ query: 'q' })
  assert.equal(ddg.calls.length, 1, '不重试')
  assert.equal(bing.calls.length, 0, '不切源硬刚')
  assert.match(value.content, /疑似反爬\/验证码/, '明示疑似反爬/验证码')
  assert.match(value.content, /命中即停/, '明示命中即停')
  assert.match(value.content, /不重试/, '明示不重试（INV-5）')
})

test('W2-SIGNAL-DANGLING 闭合：外层 signal 经 guard.chain 合成传到源调用', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  let received
  let markStarted
  const started = new Promise((resolve) => { markStarted = resolve })
  const ddg = fakeSource('ddg', async (query, signal) => {
    received = signal
    markStarted()
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    })
  })
  apply(fixture.ctx, {}, { sources: [ddg] })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  const controller = new AbortController()
  const pending = provider.search({ query: 'q' }, controller.signal)
  await started // 源调用在途后再中止（验证在途切断传导）
  controller.abort(new Error('用户取消'))
  await assert.rejects(pending, /用户取消/, '外层中止上抛（协作取消语义）')
  assert.ok(received instanceof AbortSignal, '源调用收到合成 signal')
  assert.equal(received.aborted, true, '外层中止传导到在途源')

  // 起链前已中止：零源调用（中止后不发起新请求）
  const pre = new AbortController()
  pre.abort(new Error('预先取消'))
  const ddg2 = fakeSource('ddg', async () => ({ sources: [] }))
  const fixture2 = createFakeCtx({ searchProviderId: '' })
  apply(fixture2.ctx, {}, { sources: [ddg2] })
  const provider2 = assertSearchProvider(fixture2, 'dsh-clsh-search')
  await assert.rejects(() => provider2.search({ query: 'q' }, pre.signal), /预先取消/)
  assert.equal(ddg2.calls.length, 0, '中止后零源调用')
})

test('apply 注入缝校验：options.sources / options.cache 类型非法即拒', () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  assert.throws(() => apply(fixture.ctx, {}, { sources: 'ddg' }), /options\.sources/)
  assert.throws(() => apply(fixture.ctx, {}, { cache: {} }), /options\.cache/)
})
