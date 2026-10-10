// lib/sources/custom.js — 自定义源工厂（T8 / US-12 / INV-15/16，R7/R25/R34 拍板）
// Config 驱动：sources.custom[] 描述项（id/label/urlTemplate/itemSelector/titleSelector/
// linkSelector/snippetSelector?/useProxy）→ 与内置四源同形 {name, enabled, search}（TECH.md §1 统一源接口）。
// 硬约束：
//   INV-15 出站必经 fetchHtml 唯一缝（出站门禁 assertPublicHttps 在其入口，不可绕过）；
//   INV-16 选择器只经 lib/selector.js 受限子集（零脚本能力），超集选择器 factory 期即拒（fail-closed）；
//   K-4 出网只含查询词：URL 模板唯一变量位 = {query}（R34），展开经 encodeURIComponent；
//   R25 混排：自定义源与内置源同形参与优先级链（顺序由 sources.priority 动态全排列承载）。
import { assertConfig, cleanText, fetchHtml, makeResult, pickProxyAddress } from './common.js'
import { SUPPORTED_SELECTOR_SYNTAX, queryAll, validateSelector } from '../selector.js'

/** 查询词占位符（R34 拍板）：URL 模板唯一变量位。 */
export const QUERY_PLACEHOLDER = '{query}'

/**
 * URL 模板展开：{query} → encodeURIComponent(query)（全部出现位置替换）；其余字面原样保留。
 * @param {string} urlTemplate - 含 {query} 占位的 https 模板（Config refine 已挡非 https 与缺占位）。
 * @param {string} query - 查询词。
 * @returns {string} 可出网 URL。
 */
export function buildSearchUrl(urlTemplate, query) {
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length === 0) throw new TypeError('custom.search: query 必须是非空字符串')
  if (typeof urlTemplate !== 'string' || !urlTemplate.includes(QUERY_PLACEHOLDER)) {
    throw new TypeError(`custom: urlTemplate 必须含 ${QUERY_PLACEHOLDER} 占位（R34）`)
  }
  return urlTemplate.split(QUERY_PLACEHOLDER).join(encodeURIComponent(q))
}

/** 结果链接归一：相对链接按页面 URL 补全；非 http(s)（javascript:/mailto: 等）一律拒收（返回空串）。 */
function resolveLink(href, baseUrl) {
  const raw = String(href ?? '').trim()
  if (raw.length === 0) return ''
  try {
    const resolved = new URL(raw, baseUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return ''
    return resolved.href
  } catch {
    return ''
  }
}

/** 校验一项选择器（fail-closed：超集/非法即抛，错误含支持列表）。 */
function assertSelector(selector, field) {
  const checked = validateSelector(selector)
  if (!checked.ok) {
    throw Object.assign(new Error(`custom: ${field} 选择器不受支持（${checked.errors[0]}）支持的子集：${SUPPORTED_SELECTOR_SYNTAX}`), {
      code: 'SELECTOR_UNSUPPORTED',
      field,
    })
  }
}

/**
 * 解析自定义源 SERP（本地解析，绝不触网）：itemSelector 切块 → 逐块取标题/链接/可选摘要。
 * @param {string} html - 本地 HTML。
 * @param {{itemSelector: string, titleSelector: string, linkSelector: string, snippetSelector?: string}} item - 描述项。
 * @param {{baseUrl?: string}} [options] - baseUrl 相对链接补全基准（通常为本次请求 URL）。
 * @returns {Array<{url: string, title: string, snippet: string}>} 无结果恒 []；选择器超集直接抛（不静默）。
 */
export function parseCustomSerp(html, item, { baseUrl = 'https://invalid.example/' } = {}) {
  const results = []
  if (typeof html !== 'string' || html.length === 0) return results
  for (const entry of queryAll(html, item.itemSelector)) {
    const titleMatch = queryAll(entry.inner, item.titleSelector)[0]
    const linkMatch = queryAll(entry.inner, item.linkSelector)[0]
    if (!titleMatch || !linkMatch) continue
    const snippetMatch = item.snippetSelector ? queryAll(entry.inner, item.snippetSelector)[0] : null
    const result = makeResult({
      url: resolveLink(linkMatch.attrs.href, baseUrl),
      title: cleanText(titleMatch.text),
      snippet: snippetMatch ? cleanText(snippetMatch.text) : '',
    })
    if (result) results.push(result)
  }
  return results
}

/** 代理解析（US-13，T-A2 修订）：勾选开 + 池非空 → 池首项；池空 → undefined（自动直连，
 *  降级态经 proxyStatusForItem 可探测——明示降级非静默）。池语义单源 = common.pickProxyAddress。 */
export function resolveProxyForItem(item, config) {
  if (item.useProxy !== true) return undefined
  // 「走哪套」的逐源下拉面留 B2（backlog）；当前口径 = 主力代理（池首项）
  const address = pickProxyAddress(config)
  return address ? { address } : undefined
}

/** 自定义源代理降级态（T-A2，可被 UI 与 diagnostics probe 探测）：勾选开 + 池空 = 直连 + degraded。 */
export function proxyStatusForItem(item, config) {
  const wantProxy = item?.useProxy === true
  if (!wantProxy) return { wantProxy: false, active: false, degraded: false }
  return pickProxyAddress(config)
    ? { wantProxy: true, active: true, degraded: false }
    : { wantProxy: true, active: false, degraded: true, reason: 'proxy-pool-empty' }
}

/**
 * 自定义源工厂（与内置四源同形；config 必须是 Config.parse 完整产物）。
 * @param {{id: string, label: string, urlTemplate: string, itemSelector: string, titleSelector: string,
 *          linkSelector: string, snippetSelector?: string, useProxy?: boolean}} item - sources.custom[] 描述项。
 * @param {object} config - Config.parse 产物。
 * @returns {{name: string, enabled: boolean, search: (query: string, signal?: AbortSignal) => Promise<{sources: Array}>}}
 */
export function createCustomSource(item, config) {
  assertConfig(config)
  const shape = item && typeof item === 'object' ? item : {}
  for (const field of ['id', 'label', 'urlTemplate', 'itemSelector', 'titleSelector', 'linkSelector']) {
    if (typeof shape[field] !== 'string' || shape[field].length === 0) {
      throw new TypeError(`custom: 描述项缺 ${field}（Config sources.custom[] 项校验面，R7）`)
    }
  }
  // INV-16 fail-closed：factory 期即验选择器子集（超集/非法不进运行期）
  assertSelector(shape.itemSelector, 'itemSelector')
  assertSelector(shape.titleSelector, 'titleSelector')
  assertSelector(shape.linkSelector, 'linkSelector')
  if (shape.snippetSelector !== undefined) assertSelector(shape.snippetSelector, 'snippetSelector')
  return {
    name: shape.id,
    // 列于 sources.custom[] 即启用（删除描述项 = 停用）；顺序语义由 sources.priority 动态全排列承载（R25）
    enabled: true,
    async search(query, signal) {
      const url = buildSearchUrl(shape.urlTemplate, query)
      const proxy = resolveProxyForItem(shape, config)
      const html = await fetchHtml(url, {
        timeoutMs: config.timeoutMs,
        retries: config.retries,
        retryBackoffMs: config.retryBackoffMs,
        maxResponseBytes: config.maxResponseBytes,
        signal,
        ...(proxy ? { proxy } : {}),
        tunnelSeams: config.tunnelSeams,
        // 202 条件化（INV-24）：注入本源解析器（闭包捕获 shape/baseUrl），fetchHtml 零反向依赖（P-17）
        probeParse: (page) => parseCustomSerp(page, shape, { baseUrl: url }),
      })
      return { sources: parseCustomSerp(html, shape, { baseUrl: url }) }
    },
  }
}
