// lib/sources/baidu.js — 百度源（Task 7；免 key 四源之一，复用 common.js 抓取层）
// 解析形（research-01 参考实现 cinob baidu.ts:47：GET www.baidu.com/s → 切 `div.c-container` 块 →
// `h3 > a` 取题链 → `div.c-abstract` / `span.content-right*` 取摘要；
// 结果 URL 优先取容器 `mu="…"` 真实地址——百度题链是 `/link?url=` 站内跳转，mu 才是落地页）。
// 统一源接口（TECH.md §1）：createSource(config) → {name, enabled, search(query, signal)} → {sources}。
import { assertConfig, cleanText, fetchHtml, firstAnchor, firstTagInner, firstTagOfAnyClass, makeResult, normalizeHref } from './common.js'

/** 源 id：与 Config.sources.baidu 键同源。 */
export const name = 'baidu'

/** 检索端点（GET；出网 payload = 仅查询词参数 wd，K-4）。 */
const ENDPOINT = 'https://www.baidu.com/s'

function buildUrl(query) {
  return `${ENDPOINT}?wd=${encodeURIComponent(query)}`
}

/**
 * 解析百度 SERP HTML 为结果数组。
 * @param {string} html - 页面 HTML。
 * @returns {Array<{url: string, title: string, snippet: string, publishedAt?: string}>} 无结果恒 [] 不抛。
 */
export function parseSerp(html) {
  const results = []
  if (typeof html !== 'string' || html.length === 0) return results
  // 切点停在 class 属性内（不吞闭合引号）：mu 属性位于 class 之后，须保留在段首可取。
  const segments = html.split(/<div[^>]*class="[^"]*\bc-container/)
  for (const segment of segments.slice(1)) {
    const tagEnd = segment.indexOf('>')
    const openingTag = tagEnd >= 0 ? segment.slice(0, tagEnd + 1) : ''
    // W3-5：属性名 mu 的边界形 = 前置字符非 \w 且非 '-'（lookbehind 排除 data-mu 前缀吞并）。
    const mu = /(?<![\w-])mu="([^"]*)"/.exec(openingTag)?.[1] ?? ''
    const heading = firstTagOfAnyClass(segment, 'h3')
    const anchor = heading ? firstAnchor(heading) : null
    if (!anchor) continue
    const abstract =
      firstTagInner(segment, 'div', 'c-abstract') ?? firstTagInner(segment, 'span', 'content-right')
    const item = makeResult({
      url: normalizeHref(mu || anchor.href),
      title: cleanText(anchor.inner),
      snippet: abstract ? cleanText(abstract) : '',
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
    enabled: config.sources.baidu,
    async search(query, signal) {
      const q = typeof query === 'string' ? query.trim() : ''
      if (q.length === 0) throw new TypeError('baidu.search: query 必须是非空字符串')
      const html = await fetchHtml(buildUrl(q), { timeoutMs: config.timeoutMs, retries: config.retries, retryBackoffMs: config.retryBackoffMs, maxResponseBytes: config.maxResponseBytes, signal })
      return { sources: parseSerp(html) }
    },
  }
}
