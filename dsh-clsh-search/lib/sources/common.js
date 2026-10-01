// lib/sources/common.js — SERP 公共抓取层（Task 4；TECH.md §3「四源 SERP 抓取解析（裸 fetch + Chrome UA + 正则）」）
// 职责：裸 fetch + Chrome UA 请求头 + AbortSignal 单请求超时/外层中止 + 受控重试 + HTML 取文本；
// 零第三方依赖（正则路线，K-8 零构建 ESM）。
// K-4（隐私红线）：出网只构造「查询词 + 检索参数」的 URL（GET，无 body），不携带任何上下文字段、
// 不含凭据类请求头——本文件不读环境变量、不拼接与查询词无关的任何数据。
// K-9（超时/重试可配）：timeoutMs 与 retries 由调用方从 Config 传入并强制校验，本文件不设数值默认
// （禁止绕过 Config 的硬编码常量）。
// 重试边界：网络错误 / 单请求超时 / 5xx / 408 / body 读失败（W3-2）才重试；其余状态码（含反爬常见码）
// 立即抛出——反爬判定与命中即停归 Task 8（ratelimit.js）；外层 signal 中止（聚合链预算/调用方取消）永不重试。

import { classifyBlock, toBlockedError } from '../ratelimit.js'

/** Chrome 桌面 UA：四源共用（免 key 抓取的最低限度请求头，断言见 sources-ddg.test.mjs）。 */
export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 页面类公共请求头（只描述接收能力与语言偏好，不携带任何身份或上下文信息）。 */
const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

/** 可重试状态码：服务端 5xx 与请求超时 408；其余 4xx 一律立即抛出（交 Task 8 分类）。 */
function isRetryableStatus(status) {
  return status >= 500 || status === 408
}

/** 外层中止时的抛出物：优先 signal.reason（宿主/聚合链给出的真实中止原因）。 */
function outerAbortError(signal) {
  return signal.reason ?? Object.assign(new Error('fetchHtml: outer signal aborted'), { name: 'AbortError' })
}

/**
 * 抓取一页 HTML 文本（GET 为唯一默认形；出网内容 = URL 内的查询词与检索参数）。
 * @param {string} url - 已构造好的请求 URL（只含查询词与检索参数）。
 * @param {{timeoutMs: number, retries: number, signal?: AbortSignal, method?: string,
 *          headers?: Record<string, string>, body?: string}} options
 *   - timeoutMs 单请求超时（毫秒，来自 Config.timeoutMs，K-9）
 *   - retries 首次尝试之外的重试次数（来自 Config.retries，总尝试 = 1 + retries，K-9）
 * @returns {Promise<string>} 响应 HTML 文本。
 */
export async function fetchHtml(url, { timeoutMs, retries, signal, method = 'GET', headers = {}, body } = {}) {
  if (typeof url !== 'string' || url.length === 0) throw new TypeError('fetchHtml: url 必须是非空字符串')
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('fetchHtml: timeoutMs 必须是正数（来自 Config.timeoutMs，K-9）')
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new TypeError('fetchHtml: retries 必须是非负整数（来自 Config.retries，K-9）')
  }
  const attemptsAllowed = 1 + retries
  let lastError = null
  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    if (signal && signal.aborted) throw outerAbortError(signal)
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    let response
    try {
      response = await fetch(url, {
        method,
        headers: { 'User-Agent': CHROME_UA, ...PAGE_HEADERS, ...headers },
        body,
        signal: effectiveSignal,
      })
    } catch (error) {
      // 外层中止（链预算耗尽 / 调用方取消）不重试；网络失败与单请求超时重试。
      if (signal && signal.aborted) throw error
      lastError = error
      continue
    }
    if (response.ok) {
      let html
      try {
        html = await response.text()
      } catch (error) {
        // W3-2 关闭：body 读失败（流中断/读超时）与网络失败同口径入重试环；外层中止仍不重试。
        if (signal && signal.aborted) throw error
        lastError = error
        continue
      }
      // 反爬 body 判定（W4-BLOCK-BODY-UNREACHABLE 关闭点）：2xx 响应体命中挑战页/验证码页/
      // 异常页特征即抛 blocked 错误（INV-5 命中即停：调用方不重试、不切源）；classifyBlock
      // 的 body 分支在此可达——202/4xx 状态类判定仍由聚合层读 err.status 兜底。
      const classification = classifyBlock({ status: response.status, body: html })
      if (classification.blocked) {
        throw toBlockedError(classification, { status: response.status })
      }
      return html
    }
    const httpError = Object.assign(new Error(`fetchHtml: HTTP ${response.status}`), { status: response.status })
    if (isRetryableStatus(response.status) && attempt < attemptsAllowed) {
      lastError = httpError
      continue
    }
    throw httpError
  }
  throw lastError ?? new Error('fetchHtml: exhausted attempts without a result')
}

/**
 * 数字实体码点护栏（W3-1 关闭）：合法码点 = 整数、0..0x10FFFF、且排除 UTF-16 代理区
 * （0xD800-0xDFFF——`String.fromCodePoint` 虽不抛但产出孤立代理，解析面按无效实体处理）。
 * 越界值（如 `&#x110000;`、`&#4294967296;`）原实现直接 `String.fromCodePoint` 抛 RangeError
 * 穿透 parseSerp → 本函数返回 null = 保留实体字面原文，绝不抛。
 * @param {number} codePoint - 解析出的码点数值。
 * @returns {string | null} 合法 → 单字符；非法 → null。
 */
function entityChar(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return null
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null
  return String.fromCodePoint(codePoint)
}

/** HTML 实体解码：命名五件套 + 数字实体（十六进制/十进制，带码点护栏 W3-1）。 */
export function decodeEntities(text) {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ', '&#39;': "'" }
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => entityChar(Number.parseInt(hex, 16)) ?? match)
    .replace(/&#(\d+);/g, (match, dec) => entityChar(Number(dec)) ?? match)
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => named[match] ?? match)
}

/** 去标签：标签直接剥除（浏览器内联语义——`与<b>加粗</b>片段` 渲染即 `与加粗片段`，不补空格）。 */
export function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, '')
}

/** 片段归一：去标签 → 实体解码 → 空白折叠与 trim（snippet/title 统一出口）。 */
export function cleanText(fragment) {
  return decodeEntities(stripTags(fragment)).replace(/\s+/g, ' ').trim()
}

/**
 * 在块内按 class 词定位第一个 <a>（正则路线的通用取锚器；attr 顺序无关）。
 * @param {string} html - 片段。
 * @param {string} token - class 词面（调用方字面量，非外部输入）。
 * @returns {{href: string, inner: string} | null}
 */
export function findAnchorByClass(html, token) {
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g
  const classRe = new RegExp(`class="[^"]*\\b${token}\\b`)
  let match = anchorRe.exec(html)
  while (match !== null) {
    const attrs = match[1]
    if (classRe.test(attrs)) {
      const href = /\bhref="([^"]*)"/.exec(attrs)?.[1] ?? ''
      return { href, inner: match[2] }
    }
    match = anchorRe.exec(html)
  }
  return null
}

/**
 * 取块内第一个指定标签的 inner HTML（可选 class 词面过滤）。
 * @param {string} html - 片段。
 * @param {'h2'|'h3'|'p'|'span'|'div'} tag - 标签名。
 * @param {string} [token] - 可选 class 词面。
 * @returns {string | null}
 */
export function firstTagInner(html, tag, token) {
  // class 匹配用「词首 + 前缀」口径：SERP class 常带混淆后缀（如 content-right_8SvXq），
  // 尾随 \b 会把 `content-right` 挡在门外；前缀误合风险由各源块边界兜底。
  const re = token
    ? new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${token}[^"]*"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
    : new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = re.exec(html)
  return match ? match[1] : null
}

/**
 * 取块内第一个指定标签的 inner HTML（无视 class；h2/h3 内容常包一层 <a>）。
 * @param {string} html - 片段。
 * @param {string} tag - 标签名。
 * @returns {string | null}
 */
export function firstTagOfAnyClass(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = re.exec(html)
  return match ? match[1] : null
}

/**
 * 取块内第一个带 href 的 <a>（无视 class；h2/h3 内容常包一层 <a>）。
 * @param {string} html - 片段。
 * @returns {{href: string, inner: string} | null}
 */
export function firstAnchor(html) {
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g
  let match = anchorRe.exec(html)
  while (match !== null) {
    const href = /\bhref="([^"]*)"/.exec(match[1])?.[1]
    if (href !== undefined) return { href, inner: match[2] }
    match = anchorRe.exec(html)
  }
  return null
}

/**
 * URL 字面归一：实体解码 + 协议相对链接补 https:（绝对/相对字面原样保留）。
 * @param {string} href - 链接字面。
 * @returns {string}
 */
export function normalizeHref(href) {
  const raw = decodeEntities(String(href ?? '').trim())
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

/**
 * Config 结构守卫：源工厂必须吃 Config.parse 的完整产物（K-9：默认值只在 Config schema 一处）。
 * 不检具体数值——数值合法性由 Config schema 与 fetchHtml 各自把关。
 * @param {object} config - 待校验配置。
 * @returns {object} 原配置（便于 createSource 内联使用）。
 */
export function assertConfig(config) {
  if (!config || typeof config !== 'object' || !config.sources || typeof config.sources !== 'object') {
    throw new TypeError('sources: createSource 需要 Config.parse(config) 的完整产物（含 sources 组，K-9 单一事实源）')
  }
  if (typeof config.timeoutMs !== 'number' || !Number.isInteger(config.retries)) {
    throw new TypeError('sources: config 缺 timeoutMs/retries 数值键（须经 Config.parse 回填，K-9）')
  }
  return config
}

/**
 * 结果项构造：统一出口形状 {url, title, snippet, publishedAt?}（TECH.md §1，聚合器统一消费）。
 * 无效项（缺 url 或 title）直接丢弃——SERP 常混排噪声块，宁缺毋滥。
 * @param {{url?: string, title?: string, snippet?: string, publishedAt?: string}} fields
 * @returns {{url: string, title: string, snippet: string, publishedAt?: string} | null}
 */
export function makeResult({ url, title, snippet, publishedAt }) {
  const cleanUrl = String(url ?? '').trim()
  const cleanTitle = String(title ?? '').trim()
  if (cleanUrl.length === 0 || cleanTitle.length === 0) return null
  const result = { url: cleanUrl, title: cleanTitle, snippet: String(snippet ?? '').trim() }
  const date = String(publishedAt ?? '').trim()
  if (date.length > 0) result.publishedAt = date
  return result
}
