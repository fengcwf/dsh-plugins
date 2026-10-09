// sources-baidu.test.mjs — Task 7：百度源解析（复用 common.js 抓取层）
// 断言面：固定样本字段齐全 / 无结果空数组 / 返回形状与 ddg.js 同构（{url,title,snippet,publishedAt?}）/
// mu 属性优先（百度题链 /link?url= 是站内跳转，mu 才是落地页）+ c-abstract / content-right* 双摘要路径 /
// K-4 grep 口径覆盖 baidu.js（见 sources-ddg.test.mjs 的静态断言，扫全 lib/sources/*.js）。
// 离线：globalThis.fetch 打桩，零真网请求、不写盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { Config } from '../lib/index.js'
import { CHROME_UA } from '../lib/sources/common.js'
import { createSource, parseSerp } from '../lib/sources/baidu.js'

const SAMPLE = await readFile(new URL('./fixtures/baidu-sample.html', import.meta.url), 'utf8')
const EMPTY_SAMPLES = ['', '<html><body><div id="content_left"></div></body></html>']

function stubFetch(t, impl) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url: String(url), opts })
    return impl(String(url), opts)
  })
  return calls
}

test('固定样本解析：c-container 块字段齐全，mu 优先落地页，双摘要路径可用', () => {
  const items = parseSerp(SAMPLE)
  assert.equal(items.length, 2, '两条有效结果（无 h3 题链块跳过）')

  const [first, second] = items
  assert.deepEqual(Object.keys(first).sort(), ['snippet', 'title', 'url'], '与 ddg.js 完全同构（百度无日期字段）')
  assert.deepEqual(Object.keys(second).sort(), ['snippet', 'title', 'url'])

  assert.equal(first.url, 'https://real.example.cn/baidu-one', 'mu 属性优先于 /link?url= 站内跳转题链')
  assert.equal(first.title, '百度结果 一', 'h3 内 a 标签取题 + 行内标签剥离')
  assert.equal(first.snippet, '百度摘要带 & 实体与加粗片段，mu 属性优先为落地页。', 'div.c-abstract 路径 + 实体解码')

  assert.equal(second.url, 'https://direct.example.org/baidu-two', '无 mu 时回退题链 href')
  assert.equal(second.title, '第二条百度结果')
  assert.equal(second.snippet, '新式摘要类名带混淆后缀。', 'span.content-right* 前缀匹配路径（混淆后缀不挡路）')
  assert.ok(!('publishedAt' in first), '百度 SERP 无日期字段时不臆造 publishedAt')
})

test('W3-5 回归锁：data-mu 不被误配为 mu，data-mu 与 mu 并存时 URL 与 mu 属性一致', () => {
  // data-mu 与真 mu 并存：旧 \b 正则会先命中 data-mu 值（- 非 \w 也算词边界）造成候选污染。
  const both = `
    <div class="result c-container" data-mu="https://tracker.example.net/pixel?sid=1" mu="https://real.example.cn/baidu-land">
      <h3 class="t"><a href="https://www.baidu.com/link?url=zzz999" target="_blank">并存样本</a></h3>
      <div class="c-abstract">并存摘要</div>
    </div>`
  const [item] = parseSerp(both)
  assert.equal(item.url, 'https://real.example.cn/baidu-land', '解析出的 URL 与 mu 属性一致，data-mu 不参与')

  // 仅 data-mu、无真 mu：必须回退题链 href，不被 data-mu 值污染。
  const onlyDataMu = `
    <div class="result c-container" data-mu="https://tracker.example.net/pixel?sid=2">
      <h3 class="t"><a href="https://www.baidu.com/link?url=yyy888" target="_blank">仅 data-mu 样本</a></h3>
      <div class="c-abstract">回退摘要</div>
    </div>`
  const [fallback] = parseSerp(onlyDataMu)
  assert.equal(fallback.url, 'https://www.baidu.com/link?url=yyy888', '无真 mu 时回退题链 href（data-mu 不落地）')
})

test('无结果样本：空数组不抛异常', () => {
  for (const html of EMPTY_SAMPLES) {
    assert.deepEqual(parseSerp(html), [])
  }
  assert.deepEqual(parseSerp(undefined), [])
  assert.deepEqual(parseSerp(null), [])
})

test('统一源接口：{name, enabled, search} 与 Config 开联动', () => {
  const source = createSource(Config.parse({}))
  assert.equal(source.name, 'baidu')
  assert.equal(source.enabled, true, '默认四源全开（R1）')
  assert.equal(typeof source.search, 'function')
  assert.equal(createSource(Config.parse({ sources: { baidu: false } })).enabled, false, '开关从 Config.sources 读')
  assert.throws(() => createSource({}), TypeError, '裸对象必须拒（未经 Config.parse，K-9）')
})

test('search：payload 只含查询词 wd + Chrome UA，返回 {sources}（K-4 行为断言）', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({ timeoutMs: 5000, retries: 1 }))
  const out = await source.search('百度 测试')

  assert.deepEqual(Object.keys(out), ['sources'])
  assert.equal(out.sources.length, 2)
  assert.equal(calls.length, 1)
  const url = new URL(calls[0].url)
  assert.deepEqual([...url.searchParams.keys()], ['wd'], '出网参数键面 = 仅查询词（K-4，百度参数名 wd）')
  assert.equal(url.searchParams.get('wd'), '百度 测试')
  assert.equal(calls[0].opts.method, 'GET')
  assert.equal(calls[0].opts.body, undefined)
  assert.equal(calls[0].opts.headers['User-Agent'], CHROME_UA, 'Chrome UA')
  assert.ok(calls[0].opts.signal instanceof AbortSignal)
})

test('空查询：TypeError 即刻拒绝（不触网）', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({}))
  await assert.rejects(() => source.search('  '), TypeError)
  assert.equal(calls.length, 0, '非法查询词不发起任何出网请求')
})
