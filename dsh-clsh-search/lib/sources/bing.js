// lib/sources/bing.js — Bing 源（Task 5；免 key 四源之一，复用 common.js 抓取层）
// 解析形（research-01：GET cn.bing.com/search → 切 `li.b_algo` 块 → `<h2><a>` 取题链 →
// 首个 `<p>` 取摘要；`div.b_tptn` 抓取日期作 publishedAt）。
// 异常页/挑战页判定不在本卡（统一交 Task 8 ratelimit.js），本卡只保证正常 SERP 解析与空结果兜底。
// 统一源接口（TECH.md §1）：createSource(config) → {name, enabled, search(query, signal)} → {sources}。
import { assertConfig, cleanText, fetchHtml, firstAnchor, firstTagInner, firstTagOfAnyClass, makeResult, normalizeHref } from './common.js'

/** 源 id：与 Config.sources.bing 键同源。 */
export const name = 'bing'

/** 检索端点（GET；出网 payload = 仅查询词参数 q，K-4）。 */
const ENDPOINT = 'https://cn.bing.com/search'

function buildUrl(query) {
  return `${ENDPOINT}?q=${encodeURIComponent(query)}`
}

/**
 * 解析 Bing SERP HTML 为结果数组。
 * @param {string} html - 页面 HTML。
 * @returns {Array<{url: string, title: string, snippet: string, publishedAt?: string}>} 无结果恒 [] 不抛。
 */
export function parseSerp(html) {
  const results = []
  if (typeof html !== 'string' || html.length === 0) return results
  const segments = html.split(/<li[^>]*class="[^"]*\bb_algo\b/)
  for (const segment of segments.slice(1)) {
    const heading = firstTagOfAnyClass(segment, 'h2')
    const anchor = heading ? firstAnchor(heading) : null
    if (!anchor) continue
    const paragraph = firstTagOfAnyClass(segment, 'p')
    const date = firstTagInner(segment, 'div', 'b_tptn')
    const item = makeResult({
      url: normalizeHref(anchor.href),
      title: cleanText(anchor.inner),
      snippet: paragraph ? cleanText(paragraph) : '',
      publishedAt: date ? cleanText(date) : '',
    })
    if (item) results.push(item)
  }
  return results
}

/**
 * 源工厂：enabled 与超时/重试全部读 Config（K-9 单一事实源 = Config schema 默认值）。
 * @param {object} config - Config.parse(config) 的完整产物（含 sources 组）。
 * @returns {{name: string, enabled: boolean, search: (query: string, signal?: AbortSignal) => Promise<{sources: Array}>}}
 */
export function createSource(config) {
  assertConfig(config)
  return {
    name,
    enabled: config.sources.bing,
    async search(query, signal) {
      const q = typeof query === 'string' ? query.trim() : ''
      if (q.length === 0) throw new TypeError('bing.search: query 必须是非空字符串')
      const html = await fetchHtml(buildUrl(q), { timeoutMs: config.timeoutMs, retries: config.retries, signal })
      return { sources: parseSerp(html) }
    },
  }
}
