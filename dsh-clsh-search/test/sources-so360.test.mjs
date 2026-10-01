// sources-so360.test.mjs — Task 6：360 搜索源解析（复用 common.js 抓取层）
// 断言面：固定样本字段齐全 / 无结果空数组 / 返回形状与 ddg.js 同构（{url,title,snippet,publishedAt?}）/
// K-4 grep 口径覆盖 so360.js（见 sources-ddg.test.mjs 的静态断言，扫全 lib/sources/*.js）。
// 离线：globalThis.fetch 打桩，零真网请求、不写盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { Config } from '../lib/index.js'
import { CHROME_UA } from '../lib/sources/common.js'
import { createSource, parseSerp } from '../lib/sources/so360.js'

const SAMPLE = await readFile(new URL('./fixtures/so360-sample.html', import.meta.url), 'utf8')
const EMPTY_SAMPLES = ['', '<html><body><ol class="res-list-wrapper"></ol></body></html>']

function stubFetch(t, impl) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url: String(url), opts })
    return impl(String(url), opts)
  })
  return calls
}

test('固定样本解析：res-list 块字段齐全，协议相对链接归一，无 h3 锚点块跳过', () => {
  const items = parseSerp(SAMPLE)
  assert.equal(items.length, 2, '两条有效结果（无 h3 题链块跳过）')

  const [first, second] = items
  assert.deepEqual(Object.keys(first).sort(), ['snippet', 'title', 'url'], '与 ddg.js 完全同构（360 无日期字段）')
  assert.deepEqual(Object.keys(second).sort(), ['snippet', 'title', 'url'])

  assert.equal(first.url, 'https://example.edu.cn/360-one')
  assert.equal(first.title, '360 Result One', 'h3.res-title 内 a 标签取题 + 行内标签剥离')
  assert.equal(first.snippet, '360 摘要文本带 & 实体与加粗片段。', '&amp; 实体解码')

  assert.equal(second.url, 'https://cn.example.cn/path/two', '协议相对链接补 https:')
  assert.equal(second.title, '协议相对链接第二条')
  assert.equal(second.snippet, '第二条摘要，无站点信息。')
  assert.ok(!('publishedAt' in first), '360 SERP 无日期字段时不臆造 publishedAt')
})

test('无结果样本：空数组不抛异常', () => {
  for (const html of EMPTY_SAMPLES) {
    assert.deepEqual(parseSerp(html), [])
  }
  assert.deepEqual(parseSerp(undefined), [])
  assert.deepEqual(parseSerp(null), [])
})

test('统一源接口：{name, enabled, search} 与 Config 开关联动', () => {
  const source = createSource(Config.parse({}))
  assert.equal(source.name, 'so360')
  assert.equal(source.enabled, true, '默认四源全开（R1）')
  assert.equal(typeof source.search, 'function')
  assert.equal(createSource(Config.parse({ sources: { so360: false } })).enabled, false, '开关从 Config.sources 读')
  assert.throws(() => createSource(undefined), TypeError, '缺 Config 必须拒（K-9）')
})

test('search：payload 只含查询词 q + Chrome UA，返回 {sources}（K-4 行为断言）', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({ timeoutMs: 5000, retries: 1 }))
  const out = await source.search('360 测试')

  assert.deepEqual(Object.keys(out), ['sources'])
  assert.equal(out.sources.length, 2)
  assert.equal(calls.length, 1)
  const url = new URL(calls[0].url)
  assert.deepEqual([...url.searchParams.keys()], ['q'], '出网参数键面 = 仅查询词（K-4）')
  assert.equal(url.searchParams.get('q'), '360 测试')
  assert.equal(calls[0].opts.method, 'GET')
  assert.equal(calls[0].opts.body, undefined)
  assert.equal(calls[0].opts.headers['User-Agent'], CHROME_UA, 'Chrome UA')
  assert.ok(calls[0].opts.signal instanceof AbortSignal)
})

test('空查询：TypeError 即刻拒绝（不触网）', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({}))
  await assert.rejects(() => source.search(''), TypeError)
  assert.equal(calls.length, 0, '非法查询词不发起任何出网请求')
})
