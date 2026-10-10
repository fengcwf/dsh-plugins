// sources-custom.test.mjs — T8 自定义源工厂单测（US-12 / INV-15/16，R7/R25/R34）
// 离线：HTTP 打桩（globalThis.fetch）+ 本地 HTML 解析；零真实网络。
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  QUERY_PLACEHOLDER,
  buildSearchUrl,
  createCustomSource,
  parseCustomSerp,
  proxyStatusForItem,
  resolveProxyForItem,
} from '../lib/sources/custom.js'
import { createSource as createDdgSource } from '../lib/sources/ddg.js'
import { Config } from '../lib/index.js'

const ITEM = {
  id: 'my-source',
  label: '我的源',
  urlTemplate: 'https://search.example.com/?q={query}',
  itemSelector: '.result-item',
  titleSelector: 'h3 a',
  linkSelector: 'h3 a',
  snippetSelector: '.snippet',
  useProxy: false,
}

const HTML = `<html><body>
<div class="results">
  <div class="result-item"><h3><a href="https://a.example/1">标题一</a></h3><span class="snippet">摘要一</span></div>
  <div class="result-item"><h3><a href="/rel/2">标题二</a></h3><span class="snippet">摘要二</span></div>
  <div class="result-item"><h3><a href="javascript:void(0)">坏链</a></h3><span class="snippet">跳过</span></div>
  <div class="result-item"><span class="snippet">无题链块</span></div>
</div>
</body></html>`

/** HTTP 打桩：替换 globalThis.fetch 并计数，用后还原。 */
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

test('统一源接口同形：createCustomSource 与内置四源同构 {name, enabled, search}（TECH.md §1）', () => {
  const source = createCustomSource(ITEM, Config.parse({}))
  const ddg = createDdgSource(Config.parse({}))
  assert.equal(typeof source.name, 'string')
  assert.equal(typeof source.enabled, 'boolean')
  assert.equal(typeof source.search, 'function')
  assert.deepEqual(Object.keys(source).sort(), Object.keys(ddg).sort(), '键面与内置源逐键同形')
  assert.equal(source.name, 'my-source')
  assert.equal(source.enabled, true, '列于 sources.custom[] 即启用（删除项=停用）')
})

test('URL 模板 {query} 占位替换（R34）：全部出现位置替换 + 查询词编码', () => {
  assert.equal(QUERY_PLACEHOLDER, '{query}')
  assert.equal(buildSearchUrl('https://s.example/?q={query}', 'test'), 'https://s.example/?q=test')
  assert.equal(buildSearchUrl('https://s.example/?q={query}', '深度学习 入门'), 'https://s.example/?q=%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%20%E5%85%A5%E9%97%A8', 'CJK 与空格编码')
  assert.equal(buildSearchUrl('https://s.example/?q={query}&x={query}', 'a&b=c'), 'https://s.example/?q=a%26b%3Dc&x=a%26b%3Dc', '特殊字符编码且多占位全替换')
  assert.throws(() => buildSearchUrl('https://s.example/?q=test', 'x'), /占位/, '缺占位即拒')
  assert.throws(() => buildSearchUrl('https://s.example/?q={query}', '   '), TypeError, '空查询词拒')
})

test('三项选择器解析（R7）：item/title/link + 可选 snippet 出结构化结果', () => {
  const results = parseCustomSerp(HTML, ITEM, { baseUrl: 'https://search.example.com/?q=test' })
  assert.equal(results.length, 2, '四块中：1 空链跳过、1 javascript: 链拒收，余 2 条')
  assert.deepEqual(results[0], { url: 'https://a.example/1', title: '标题一', snippet: '摘要一' })
  assert.equal(results[1].url, 'https://search.example.com/rel/2', '相对链接按页面 URL 补全')
  assert.equal(results[1].title, '标题二')
  // 无 snippetSelector 时摘要为空串
  const noSnippet = parseCustomSerp(HTML, { ...ITEM, snippetSelector: undefined }, { baseUrl: 'https://search.example.com/' })
  assert.equal(noSnippet[0].snippet, '')
  // 无结果恒 [] 不抛
  assert.deepEqual(parseCustomSerp('<html></html>', ITEM), [])
  assert.deepEqual(parseCustomSerp('', ITEM), [])
})

test('选择器 fail-closed（INV-16）：超集/非法选择器 factory 期即拒，错误含支持列表', () => {
  for (const [field, selector] of [
    ['itemSelector', 'div:nth-child(1)'],
    ['titleSelector', ':not(.x)'],
    ['linkSelector', 'a + b'],
    ['snippetSelector', '::before'],
  ]) {
    assert.throws(
      () => createCustomSource({ ...ITEM, [field]: selector }, Config.parse({})),
      (error) => error.code === 'SELECTOR_UNSUPPORTED' && /支持的子集/.test(error.message),
      `${field} 超集必须 fail-closed 拒绝`,
    )
  }
  // parse 面同样不静默（超集直接抛，不返回空数组）
  assert.throws(() => parseCustomSerp(HTML, { ...ITEM, itemSelector: 'div:nth-child(1)' }), (error) => error.code === 'SELECTOR_UNSUPPORTED')
})

test('描述项形状校验：缺字段即拒（R7 描述项面）', () => {
  for (const field of ['id', 'label', 'urlTemplate', 'itemSelector', 'titleSelector', 'linkSelector']) {
    const bad = { ...ITEM }
    delete bad[field]
    assert.throws(() => createCustomSource(bad, Config.parse({})), TypeError, `缺 ${field} 必须拒`)
  }
  assert.throws(() => createCustomSource(ITEM, { timeoutMs: 1000 }), TypeError, '裸 config 拒（assertConfig，K-9 单一事实源）')
})

test('search 全链（打桩）：出网 URL 只含查询词参数 + 结构化结果收口（K-4）', async () => {
  const source = createCustomSource(ITEM, Config.parse({}))
  await withStubFetch(
    async () => ({ ok: true, status: 200, text: async () => HTML }),
    async (calls) => {
      const outcome = await source.search('深度学习', undefined)
      assert.equal(calls.length, 1, '恰一次出网')
      assert.equal(calls[0].url, 'https://search.example.com/?q=%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0', '模板展开 + 编码')
      assert.ok(!calls[0].url.includes('深度学习'), '出网 URL 无查询词明文（编码面）')
      assert.deepEqual(outcome.sources.map((r) => r.title), ['标题一', '标题二'])
    },
  )
})

test('INV-15 门禁必经：内网/明文模板目标被拒且零出网（fetchHtml 门禁兜底）', async () => {
  for (const urlTemplate of ['http://search.example.com/?q={query}', 'https://127.0.0.1/?q={query}', 'https://169.254.169.254/?q={query}']) {
    const source = createCustomSource({ ...ITEM, urlTemplate }, Config.parse({}))
    await withStubFetch(
      async () => {
        throw new Error('stub：门禁拒绝后不应出网')
      },
      async (calls) => {
        await assert.rejects(() => source.search('probe', undefined), (error) => error.code === 'BAD_TARGET', `${urlTemplate} 必须被出站门禁拒`)
        assert.equal(calls.length, 0, '零出网（INV-15 不可绕过）')
      },
    )
  }
})

test('代理解析（US-13，T-A2 修订）：useProxy 缺省直连；勾选无池自动直连 + 降级标志；有池取主力', () => {
  assert.equal(resolveProxyForItem(ITEM, Config.parse({})), undefined, '默认直连')
  assert.equal(resolveProxyForItem({ ...ITEM, useProxy: undefined }, Config.parse({})), undefined)
  // T-A2（产品裁定 2026-10-10）：空池勾选 = 自动直连 + 可探测降级标志（不再抛错，开箱即用不破）
  assert.equal(resolveProxyForItem({ ...ITEM, useProxy: true }, Config.parse({})), undefined, '勾选无池 = 自动直连（不抛）')
  assert.deepEqual(
    proxyStatusForItem({ ...ITEM, useProxy: true }, Config.parse({})),
    { wantProxy: true, active: false, degraded: true, reason: 'proxy-pool-empty' },
    '降级标志可探测（明示非静默）',
  )
  const config = Config.parse({ proxies: [{ id: 'main', label: '主力', address: '192.168.0.41:7890' }, { id: 'bak', label: '备用', address: '192.168.0.41:7891' }] })
  assert.deepEqual(resolveProxyForItem({ ...ITEM, useProxy: true }, config), { address: '192.168.0.41:7890' }, '主力代理=池首项（逐源下拉留 T23）')
})

test('零第三方依赖 + 零脚本能力复用（K-8/P-4，INV-16 走 T7 引擎）', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../lib/sources/custom.js', import.meta.url), 'utf8')
  const specs = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
  for (const spec of specs) {
    assert.ok(spec === './common.js' || spec === '../selector.js', `只允许相对内部引用：${spec}`)
  }
  assert.equal(/eval\s*\(|new\s+Function/.test(source), false, '零求值面')
  assert.match(source, /queryAll\(/, '解析面复用 T7 selector 引擎（INV-16）')
})
