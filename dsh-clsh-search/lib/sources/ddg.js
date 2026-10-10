// lib/sources/ddg.js — DuckDuckGo 源（Task 4；免 key 四源之一）
// 解析形（research-01-reference-plugins.md：切 `result results_links` 块 → `result__a` 取题链 →
// `result__snippet` 取摘要 → 跳转链接 `uddg` 参数解码为真实 URL）。
// 统一源接口（TECH.md §1，供 Task 10 聚合器消费）：createSource(config) → {name, enabled, search(query, signal)}。
import { assertConfig, cleanText, decodeEntities, fetchHtml, findAnchorByClass, makeResult, resolveProxyFor } from './common.js'

/** 源 id：与 Config.sources.ddg 键同源。 */
export const name = 'ddg'

/** 检索端点（GET；出网 payload = 仅查询词参数 q，K-4）。 */
const ENDPOINT = 'https://html.duckduckgo.com/html/'

function buildUrl(query) {
  return `${ENDPOINT}?q=${encodeURIComponent(query)}`
}

/** 跳转链接解码：`//duckduckgo.com/l/?uddg=<enc>` → 真实目标；其余协议相对链接补 https:。 */
function resolveDdgHref(href) {
  const raw = decodeEntities(String(href ?? '').trim())
  if (raw.length === 0) return ''
  try {
    const target = new URL(raw, 'https://duckduckgo.com').searchParams.get('uddg')
    if (target) return target
  } catch {
    // 非法 URL 保底走下方字面规则
  }
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

/**
 * 解析 DDG html SERP 为结果数组。
 * @param {string} html - 页面 HTML。
 * @returns {Array<{url: string, title: string, snippet: string, publishedAt?: string}>} 无结果恒 [] 不抛。
 */
export function parseSerp(html) {
  const results = []
  if (typeof html !== 'string' || html.length === 0) return results
  const segments = html.split(/<div[^>]*class="[^"]*\bresult results_links\b/)
  for (const segment of segments.slice(1)) {
    const anchor = findAnchorByClass(segment, 'result__a')
    if (!anchor) continue
    const snippetAnchor = findAnchorByClass(segment, 'result__snippet')
    const item = makeResult({
      url: resolveDdgHref(anchor.href),
      title: cleanText(anchor.inner),
      snippet: snippetAnchor ? cleanText(snippetAnchor.inner) : '',
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
    enabled: config.sources.ddg,
    async search(query, signal) {
      const q = typeof query === 'string' ? query.trim() : ''
      if (q.length === 0) throw new TypeError('ddg.search: query 必须是非空字符串')
      const html = await fetchHtml(buildUrl(q), { timeoutMs: config.timeoutMs, retries: config.retries, retryBackoffMs: config.retryBackoffMs, maxResponseBytes: config.maxResponseBytes, signal, proxy: resolveProxyFor(config, name), tunnelSeams: config.tunnelSeams, probeParse: parseSerp })
      return { sources: parseSerp(html) }
    },
  }
}
