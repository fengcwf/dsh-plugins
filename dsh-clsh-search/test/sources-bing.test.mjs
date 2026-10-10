// sources-bing.test.mjs — Task 5：Bing 源解析（复用 common.js 抓取层）
// 断言面：固定样本字段齐全 / 无结果空数组 / 返回形状与 ddg.js 同构（{url,title,snippet,publishedAt?}）/
// K-4 grep 口径覆盖 bing.js（见 sources-ddg.test.mjs 的静态断言，扫全 lib/sources/*.js）。
// 离线：globalThis.fetch 打桩，零真网请求、不写盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// 测试面显式直连（R21 默认 ddg/bing 勾选走代理；本组用例不测代理 → 显式关闭，避免空池明示错误 K-23）
const DIRECT = { sources: { useProxy: { ddg: false, bing: false, so360: false, baidu: false } } }

import { Config } from '../lib/index.js'
import { CHROME_UA } from '../lib/sources/common.js'
import { createSource, parseSerp } from '../lib/sources/bing.js'

const SAMPLE = await readFile(new URL('./fixtures/bing-sample.html', import.meta.url), 'utf8')
const EMPTY_SAMPLES = ['', '<html><body><ol id="b_results"></ol></body></html>']

function stubFetch(t, impl) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url: String(url), opts })
    return impl(String(url), opts)
  })
  return calls
}

test('固定样本解析：b_algo 块字段齐全，抓取日期作 publishedAt，无日期不臆造', () => {
  const items = parseSerp(SAMPLE)
  assert.equal(items.length, 2, '两条有效结果（无 h2 锚点块与 b_attribution 噪声跳过）')

  const [first, second] = items
  assert.deepEqual(Object.keys(first).sort(), ['publishedAt', 'snippet', 'title', 'url'], '与 ddg.js 同构 + 可选 publishedAt')
  assert.deepEqual(Object.keys(second).sort(), ['snippet', 'title', 'url'], '无日期项键面与 ddg.js 完全同构')

  assert.equal(first.url, 'https://example.org/bing-one')
  assert.equal(first.title, 'Bing Result One', 'h2 内 a 标签取题 + 行内标签剥离')
  assert.equal(first.snippet, 'Snippet from Bing with highlight & entity decoded.', '&amp; 实体解码')
  assert.equal(first.publishedAt, '2025年9月28日', 'b_tptn 抓取日期')

  assert.equal(second.url, 'https://second.example.net/page')
  assert.equal(second.title, 'Second hit')
  assert.equal(second.snippet, 'Second snippet without a crawled date.')
  assert.ok(!('publishedAt' in second), '无 b_tptn 时不带 publishedAt 键')
})

test('无结果样本：空数组不抛异常', () => {
  for (const html of EMPTY_SAMPLES) {
    assert.deepEqual(parseSerp(html), [])
  }
  assert.deepEqual(parseSerp(undefined), [])
  assert.deepEqual(parseSerp(null), [])
})

test('统一源接口：{name, enabled, search} 与 Config 开关联动', () => {
  const source = createSource(Config.parse({ ...DIRECT }))
  assert.equal(source.name, 'bing')
  assert.equal(source.enabled, true, '默认四源全开（R1）')
  assert.equal(typeof source.search, 'function')
  assert.equal(createSource(Config.parse({ ...DIRECT, sources: { ...DIRECT.sources, bing: false } })).enabled, false, '开关从 Config.sources 读')
  assert.throws(() => createSource({}), TypeError, '裸对象必须拒（未经 Config.parse，K-9）')
})

test('search：payload 只含查询词 q + Chrome UA，返回 {sources}（K-4 行为断言）', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({ ...DIRECT, timeoutMs: 5000, retries: 1 }))
  const out = await source.search('bing 测试')

  assert.deepEqual(Object.keys(out), ['sources'])
  assert.equal(out.sources.length, 2)
  assert.equal(calls.length, 1)
  const url = new URL(calls[0].url)
  assert.deepEqual([...url.searchParams.keys()], ['q'], '出网参数键面 = 仅查询词（K-4）')
  assert.equal(url.searchParams.get('q'), 'bing 测试')
  assert.equal(calls[0].opts.method, 'GET')
  assert.equal(calls[0].opts.body, undefined)
  assert.equal(calls[0].opts.headers['User-Agent'], CHROME_UA, 'Chrome UA')
  assert.ok(calls[0].opts.signal instanceof AbortSignal)
})

test('空查询与缺配置：TypeError 即刻拒绝（不触网）', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({ ...DIRECT }))
  await assert.rejects(() => source.search('   '), TypeError)
  await assert.rejects(() => source.search(undefined), TypeError)
  assert.equal(calls.length, 0, '非法查询词不发起任何出网请求')
})
