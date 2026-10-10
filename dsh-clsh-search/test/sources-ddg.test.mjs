// sources-ddg.test.mjs — Task 4：SERP 公共抓取层 + DuckDuckGo 解析
// 断言面：固定样本解析字段齐全 / 无结果空数组不抛 / 统一源接口（{name, enabled, search}→{sources}）/
// K-4 出网 payload 只含查询词（行为 + 静态双断言）/ K-9 超时重试从 Config 读（AbortSignal 生效 + 重试计数）/
// Chrome UA 请求头。离线：globalThis.fetch 打桩，零真网请求、不写盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

// 测试面显式直连（R21 默认 ddg/bing 勾选走代理；本组用例不测代理 → 显式关闭，避免空池明示错误 K-23）
const DIRECT = { sources: { useProxy: { ddg: false, bing: false, so360: false, baidu: false } } }

import { Config } from '../lib/index.js'
import { CHROME_UA } from '../lib/sources/common.js'
import { createSource, parseSerp } from '../lib/sources/ddg.js'
import * as baiduSource from '../lib/sources/baidu.js'
import * as bingSource from '../lib/sources/bing.js'
import * as so360Source from '../lib/sources/so360.js'

const SAMPLE = await readFile(new URL('./fixtures/ddg-sample.html', import.meta.url), 'utf8')
const EMPTY_SAMPLES = ['', '<html><body><div class="feedback">no results</div></body></html>']

/** fetch 打桩：记录调用（url/opts）并按实现返回；node:test mock 在用例结束自动还原。 */
function stubFetch(t, impl) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url: String(url), opts })
    return impl(String(url), opts)
  })
  return calls
}

/** 统一结果形状断言（TECH.md §1：{url, title, snippet, publishedAt?}）。 */
function assertResultShape(items, label) {
  assert.ok(Array.isArray(items), `${label} 必须是数组`)
  for (const [i, item] of items.entries()) {
    const keys = Object.keys(item).sort()
    assert.deepEqual(keys.filter((k) => k !== 'publishedAt'), ['snippet', 'title', 'url'], `${label}[${i}] 键面 = url/title/snippet（publishedAt 可选）`)
    assert.equal(typeof item.url, 'string')
    assert.ok(item.url.startsWith('http'), `${label}[${i}].url 必须是绝对 URL`)
    assert.equal(typeof item.title, 'string')
    assert.ok(item.title.length > 0, `${label}[${i}].title 非空`)
    assert.equal(typeof item.snippet, 'string')
    if ('publishedAt' in item) assert.equal(typeof item.publishedAt, 'string')
  }
}

test('固定样本解析：url/title/snippet 字段齐全，实体与跳转链接解码正确', () => {
  const items = parseSerp(SAMPLE)
  assert.equal(items.length, 3, '三条有效结果（第四块无 result__a 锚点 = 噪声跳过）')
  assertResultShape(items, 'ddg')

  const [first, second, third] = items
  assert.equal(first.url, 'https://example.com/page-one')
  assert.equal(first.title, 'Example Page One', '行内标签剥离 + 空白折叠')
  assert.equal(first.snippet, 'Snippet text with & entity and bold part.', '&amp; 实体解码')
  assert.ok(!('publishedAt' in first), 'DDG html 无日期字段时不臆造 publishedAt')

  assert.equal(second.url, 'https://www.wikipedia.org/wiki/Search', 'uddg 跳转解码为真实 URL（丢弃 rut 跟踪参数）')
  assert.equal(second.title, 'Redirected Result — Wikipedia')
  assert.ok(second.snippet.length > 0)

  assert.equal(third.url, 'https://no-snippet.example.org/')
  assert.equal(third.snippet, '', '缺 snippet 的结果保留为空串（字段在场）')
})

test('无结果样本：空数组不抛异常', () => {
  for (const html of EMPTY_SAMPLES) {
    assert.deepEqual(parseSerp(html), [])
  }
  assert.deepEqual(parseSerp(undefined), [])
  assert.deepEqual(parseSerp(null), [])
})

test('统一源接口：{name, enabled, search} 形状与 Config 开关联动（K-9 源开关面）', () => {
  const source = createSource(Config.parse({ ...DIRECT }))
  assert.equal(source.name, 'ddg')
  assert.equal(source.enabled, true, '默认四源全开（R1）')
  assert.equal(typeof source.search, 'function')

  const disabled = createSource(Config.parse({ ...DIRECT, sources: { ...DIRECT.sources, ddg: false } }))
  assert.equal(disabled.enabled, false, '单源开关从 Config.sources 读')

  assert.throws(() => createSource(undefined), TypeError, '缺 Config 必须拒（K-9 单一事实源）')
  assert.throws(() => createSource({}), TypeError, '裸对象必须拒（未经 Config.parse 回填）')
  assert.throws(() => createSource(Config.parse({ ...DIRECT }).sources), TypeError, '缺 timeoutMs/retries 必须拒')
})

test('search：payload 只含查询词 + Chrome UA + GET（K-4 行为断言），返回 {sources}', async (t) => {
  const calls = stubFetch(t, () => new Response(SAMPLE, { status: 200 }))
  const source = createSource(Config.parse({ ...DIRECT, timeoutMs: 5000, retries: 1 }))
  const out = await source.search('测试 query & more')

  assert.deepEqual(Object.keys(out), ['sources'], '统一返回 {sources}（TECH.md §1）')
  assert.equal(out.sources.length, 3)
  assertResultShape(out.sources, 'ddg.search')

  assert.equal(calls.length, 1)
  const url = new URL(calls[0].url)
  assert.deepEqual([...url.searchParams.keys()], ['q'], '出网参数键面 = 仅查询词（K-4）')
  assert.equal(url.searchParams.get('q'), '测试 query & more', '查询词完整往返（encodeURIComponent）')
  assert.equal(calls[0].opts.method, 'GET', 'GET 无 body（K-4：无附加上下文载荷）')
  assert.equal(calls[0].opts.body, undefined)
  assert.equal(calls[0].opts.headers['User-Agent'], CHROME_UA, 'Chrome UA（K-9/抓取层断言）')
  assert.deepEqual(
    Object.keys(calls[0].opts.headers).sort(),
    ['Accept', 'Accept-Language', 'User-Agent'],
    '请求头只有接收能力/语言/UA，无凭据与上下文头（K-4）',
  )
  assert.ok(calls[0].opts.signal instanceof AbortSignal, '超时经 AbortSignal 生效')
})

test('超时经 AbortSignal 生效：timeoutMs 从 Config 读且单次尝试（K-9）', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', (url, opts) => {
    calls.push({ url: String(url), opts })
    return new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true })
    })
  })
  const source = createSource(Config.parse({ ...DIRECT, timeoutMs: 30, retries: 0 }))
  const started = Date.now()
  await assert.rejects(() => source.search('timeout probe'), (error) => error.name === 'TimeoutError')
  assert.ok(Date.now() - started < 3000, '超时应在 timeoutMs 量级触发，而非挂死')
  assert.equal(calls.length, 1, 'retries=0 → 恰一次尝试（重试次数从 Config 读）')
})

test('网络失败重试：总尝试 = 1 + Config.retries（K-9 重试面）', async (t) => {
  const calls = stubFetch(t, () => {
    throw new TypeError('fetch failed')
  })
  const source = createSource(Config.parse({ ...DIRECT, timeoutMs: 1000, retries: 2 }))
  await assert.rejects(() => source.search('probe'), (error) => error.message === 'fetch failed')
  assert.equal(calls.length, 3, '1 次首发 + retries=2 次重试')
})

test('4xx 不重试：反爬类状态码立即抛（交 Task 8 ratelimit 分类）', async (t) => {
  const calls = stubFetch(t, () => new Response('blocked', { status: 403 }))
  const source = createSource(Config.parse({ ...DIRECT, timeoutMs: 1000, retries: 3 }))
  await assert.rejects(() => source.search('probe'), (error) => error.status === 403)
  assert.equal(calls.length, 1, '403 立即抛，不消耗重试次数')
})

test('K-4 静态断言：lib/sources/*.js 无凭据/上下文注入标识，且超时重试无字面硬编码（K-9）', async () => {
  const dir = new URL('../lib/sources/', import.meta.url)
  const files = (await readdir(dir)).filter((file) => file.endsWith('.js')).sort()
  // 源文件清单锁（W3-6 脆性即把关力）：增删 lib/sources 文件必须显式登记——T8 自定义源工厂 custom.js 落地登记
  assert.deepEqual(files, ['bing.js', 'common.js', 'custom.js', 'ddg.js', 'so360.js', 'baidu.js'].sort(), '公共层 + 四源 + 自定义源工厂齐')
  const forbidden = [
    /process\.env/i,
    /api[_-]?key/i,
    /access[_-]?token/i,
    /\bbearer\b/i,
    /authorization/i,
    /password/i,
    /\bsecret\b/i,
    /obsidian/i,
    /\bvault\b/i,
    /记忆/,
    /会话/,
    /\bsession\b/i,
    /conversation/i,
  ]
  for (const file of files) {
    const content = await readFile(new URL(file, dir), 'utf8')
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(content), `${file} 命中 K-4 禁忌标识 ${pattern}`)
    }
    assert.ok(!/timeoutMs\s*[:=]\s*\d/.test(content), `${file} timeoutMs 不得出现字面数值（K-9：从 Config 读）`)
    assert.ok(!/retries\s*[:=]\s*\d/.test(content), `${file} retries 不得出现字面数值（K-9：从 Config 读）`)
    // 0.2.x 扩面（INV-19/K-20）：新管控键同样只许从 Config 读，源文件零字面
    for (const key of ['retryBackoffMs', 'maxResponseBytes', 'logCapacity', 'healthTimeoutMs']) {
      assert.ok(!new RegExp(`\\b${key}\\s*[:=]\\s*\\d`).test(content), `${file} ${key} 不得出现字面数值（K-9 扩面：从 Config 读）`)
    }
    if (file !== 'common.js') {
      assert.ok(content.includes('config.timeoutMs'), `${file} 超时从 Config 读（K-9）`)
      assert.ok(content.includes('config.retries'), `${file} 重试从 Config 读（K-9）`)
    }
  }
})

test('同形批统一源接口契约：四源 {name, enabled, search}→{sources} 逐源一致（TECH.md §1，供 T10 聚合器消费）', async (t) => {
  const modules = { ddg: { createSource, parseSerp }, bing: bingSource, so360: so360Source, baidu: baiduSource }
  const config = Config.parse({ ...DIRECT })
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url: String(url), opts })
    return new Response('<html><body>empty serp</body></html>', { status: 200 })
  })
  for (const [id, mod] of Object.entries(modules)) {
    const source = mod.createSource(config)
    assert.equal(source.name, id, `${id}: name 与模块导出一致`)
    assert.equal(source.enabled, true, `${id}: 默认开启（R1 四源全开）`)
    assert.equal(typeof source.search, 'function', `${id}: search 在场`)
    assert.deepEqual(mod.parseSerp(''), [], `${id}: 空 HTML 恒空数组不抛`)

    const out = await source.search('契约 probe')
    assert.deepEqual(Object.keys(out), [ 'sources' ], `${id}: search 统一返回 {sources}`)
    assert.deepEqual(out.sources, [], `${id}: 空 SERP → 空数组`)
    const url = new URL(calls.at(-1).url)
    assert.equal(url.searchParams.size, 1, `${id}: 出网参数只有一项查询词（K-4）`)
    assert.ok(['q', 'wd'].includes([...url.searchParams.keys()][0]), `${id}: 查询词参数名为 q/wd`)
  }
  // 独立开关：关一家不影响其余三家（聚合层按 enabled 跳过的输入面）
  const withOff = Config.parse({ ...DIRECT, sources: { ...DIRECT.sources, so360: false } })
  assert.deepEqual(
    Object.entries(modules).map(([id, mod]) => [id, mod.createSource(withOff).enabled]),
    [['ddg', true], ['bing', true], ['so360', false], ['baidu', true]],
    '四源 enabled 独立取自 Config.sources',
  )
})
