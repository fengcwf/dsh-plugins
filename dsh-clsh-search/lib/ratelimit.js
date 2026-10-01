// lib/ratelimit.js — 反爬/验证码检测与命中即停错误（Task 8；K-5 / INV-5）
//
// 判定输入面（W3 消费事实）：W3 源解析层把 HTML 消化为结构化结果/错误（4xx/202 立即抛、
// err.status 在场），聚合层只见 err.status 与错误对象——状态类判定直接读 err.status（勿重复
// 判 HTML）；body 类判定（挑战页/验证码页/异常 HTML）为独立 API，供持有原始 body 的调用方
// （抓取层 / Task 11 熔断 / 测试）复用。
//
// INV-5 类目封顶 = 202 状态 / 挑战页 / 验证码页 / 异常 HTML 四类「命中即停」信号；
// 403/429 等其余 4xx 属普通失败（US-2 切换下一家，W3 已零重试立即抛），不进即停类目——
// 切换到别家源不构成对拦截方的「硬刚」，硬刚风险由零重试 + 整链预算（K-6）承载。

/** 反爬/验证码命中的错误码（结构化可判别，调用方禁止重试/切源）。 */
export const BLOCK_CODE = 'SEARCH_BLOCKED_SUSPECTED'

/** 挑战页特征（Cloudflare / 反爬墙 / 网关挑战）。 */
const CHALLENGE_PATTERNS = [
  /cf-challenge/i,
  /challenge-platform/i,
  /checking your browser/i,
  /just a moment/i,
  /attention required/i,
  /security check/i,
  /unusual traffic/i,
  /检测到异常流量/,
  /安全检查/,
]

/** 验证码页特征。 */
const CAPTCHA_PATTERNS = [
  /g-recaptcha/i,
  /h-captcha/i,
  /hcaptcha/i,
  /recaptcha/i,
  /captcha/i,
  /verify you are human/i,
  /人机验证/,
  /验证码/,
]

/** 异常 HTML 特征（网关错误页 / 非 HTML 根形的错误体）。 */
const ANOMALY_PATTERNS = [
  /bad gateway/i,
  /service unavailable/i,
  /upstream (error|timeout)/i,
  /<h1>\s*(4|5)\d{2}[^<]*<\/h1>/i,
]

/** HTML 根形（doctype / <html> / <body> 任一在场视为 HTML 文档）。 */
const HTML_ROOT = /<!doctype html|<html[\s>]|<body[\s>]/i

const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/**
 * 反爬/验证码分类判定（K-5 判定面）。
 * @param {{status?: number, body?: string}} [input] - HTTP 状态（err.status）与可选响应体 HTML。
 * @returns {{blocked: boolean, kind?: string, reason?: string}} 命中即停类目与原因；未命中 {blocked:false}。
 */
export function classifyBlock(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`classifyBlock 入参必须是对象，got ${typeName(input)}`)
  }
  const { status, body } = input
  if (status !== undefined && typeof status !== 'number') {
    throw new TypeError(`classifyBlock: status 必须是数字，got ${typeName(status)}`)
  }
  if (body !== undefined && typeof body !== 'string') {
    throw new TypeError(`classifyBlock: body 必须是字符串，got ${typeName(body)}`)
  }
  // ① 202 状态：接受但未产出（反爬等待/挑战的经典信号）
  if (status === 202) {
    return { blocked: true, kind: 'status-202', reason: 'HTTP 202 接受但未产出结果（疑似反爬等待/挑战）' }
  }
  const html = typeof body === 'string' ? body : ''
  if (html.length > 0) {
    // ② 验证码页
    for (const pattern of CAPTCHA_PATTERNS) {
      if (pattern.test(html)) {
        return { blocked: true, kind: 'captcha-page', reason: `响应体命中验证码页特征（${pattern}）` }
      }
    }
    // ③ 挑战页
    for (const pattern of CHALLENGE_PATTERNS) {
      if (pattern.test(html)) {
        return { blocked: true, kind: 'challenge-page', reason: `响应体命中挑战页特征（${pattern}）` }
      }
    }
    // ④ 异常 HTML：网关错误页特征，或非 HTML 根形的错误体
    for (const pattern of ANOMALY_PATTERNS) {
      if (pattern.test(html)) {
        return { blocked: true, kind: 'anomaly-html', reason: `响应体命中异常页特征（${pattern}）` }
      }
    }
    if (!HTML_ROOT.test(html)) {
      return { blocked: true, kind: 'anomaly-html', reason: '响应体非 HTML 根形（疑似错误体/劫持页）' }
    }
  }
  return { blocked: false }
}

/** 便捷判定：是否命中即停类目。 */
export function isBlocked(input) {
  return classifyBlock(input).blocked === true
}

/**
 * 产出命中即停错误（K-5 明示面）：code 明确、文案含「疑似反爬/验证码」、携带分类明细。
 * 调用方纪律：此错误必须直接上抛/收口——不重试、不切换源硬刚、不静默吞掉（INV-5）。
 * @param {{blocked: true, kind: string, reason: string}} classification - classifyBlock 命中结果。
 * @param {{source?: string, status?: number}} [context] - 源名与 HTTP 状态（可选，进错误留痕）。
 * @returns {Error & {code: string, kind: string, blocked: true, source?: string, status?: number}}
 */
export function toBlockedError(classification, context = {}) {
  if (!classification || classification.blocked !== true || typeof classification.kind !== 'string') {
    throw new TypeError('toBlockedError: 需要 classifyBlock 的命中结果（blocked:true + kind）')
  }
  const where = context.source ? `（源 ${context.source}）` : ''
  const statusPart = typeof context.status === 'number' ? `，HTTP ${context.status}` : ''
  const error = new Error(
    `疑似反爬/验证码拦截${where}${statusPart}：${classification.reason}。` +
      '命中即停：不重试、不再切换源；请降级 web_fetch 定点抓取或按顺序策略转 ego-browser/人工处理。',
  )
  error.code = BLOCK_CODE
  error.kind = classification.kind
  error.blocked = true
  if (context.source) error.source = context.source
  if (typeof context.status === 'number') error.status = context.status
  return error
}

/** 判别错误对象是否为命中即停错误（调用方收口判据）。 */
export function isBlockedError(error) {
  return Boolean(error) && (error.blocked === true || error.code === BLOCK_CODE)
}
