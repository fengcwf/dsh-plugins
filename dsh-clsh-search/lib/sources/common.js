// lib/sources/common.js — SERP 公共抓取层（Task 4；TECH.md §3「四源 SERP 抓取解析（裸 fetch + Chrome UA + 正则）」）
// 职责：裸 fetch + Chrome UA 请求头 + AbortSignal 单请求超时/外层中止 + 受控重试 + HTML 取文本；
// 零第三方依赖（正则路线，K-8 零构建 ESM）。
// K-4（隐私红线）：出网只构造「查询词 + 检索参数」的 URL（GET，无 body），不携带任何上下文字段、
// 不含凭据类请求头——本文件不读环境变量、不拼接与查询词无关的任何数据。
// K-9（超时/重试可配）：timeoutMs 与 retries 由调用方从 Config 传入并强制校验，本文件不设数值默认
// （禁止绕过 Config 的硬编码常量）。
// 重试边界：网络错误 / 单请求超时 / 5xx / 408 / body 读失败（W3-2）才重试；其余状态码（含反爬常见码）
// 立即抛出——反爬判定与命中即停归 Task 8（ratelimit.js）；外层 signal 中止（聚合链预算/调用方取消）永不重试。

import net from 'node:net'
import tls from 'node:tls'
import https from 'node:https'
import zlib from 'node:zlib'
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

// ─────────────────────────────────────────────────────────────────────────────
// 出站门禁（INV-15 / K-16）：一切出网（fetchHtml 与后续 CONNECT 隧道目标）前置的不可绕过安全闸。
// 强制 https；拒内网 / 回环 / 链路本地 / 云元数据 / 未指定 / 组播 / 保留段；可注入 DNS 解析器补
// 「解析后 IP 同段核验」（防解析绕过）。纯 JS 字面判定，零第三方依赖（P-4 / K-8）。
// ─────────────────────────────────────────────────────────────────────────────

/** 结构化拒绝错误：code=BAD_TARGET（区别于 ratelimit 的 blocked 类与普通 HTTP 失败，INV-5 类目不混）。 */
function outboundBlockedError(reason, detail) {
  return Object.assign(new Error(`出站门禁拒绝（INV-15）：${detail}`), { code: 'BAD_TARGET', reason })
}

/** IPv4 字面解析为四段数组；非法返回 null。 */
function parseIpv4(text) {
  const parts = String(text).split('.')
  if (parts.length !== 4) return null
  const octets = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

/**
 * IPv6 字面解析为 16 字节数组；非法返回 null。
 * 支持 :: 压缩、1-4 位十六进制组、内嵌 IPv4 尾段（::ffff:1.2.3.4 形）。
 */
function parseIpv6(text) {
  let raw = String(text).toLowerCase()
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1)
  if (!/^[0-9a-f:.]+$/.test(raw)) return null
  // 内嵌 IPv4 尾段 → 归一为两个十六进制组
  if (raw.includes('.')) {
    const cut = raw.lastIndexOf(':')
    if (cut < 0) return null
    const v4 = parseIpv4(raw.slice(cut + 1))
    if (!v4) return null
    const hi = ((v4[0] << 8) | v4[1]).toString(16)
    const lo = ((v4[2] << 8) | v4[3]).toString(16)
    raw = `${raw.slice(0, cut + 1)}${hi}:${lo}`
  }
  const halves = raw.split('::')
  if (halves.length > 2) return null
  const toGroups = (part) => (part === '' ? [] : part.split(':'))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  for (const group of [...head, ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
  }
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (halves.length === 2 ? fill < 1 : head.length !== 8) return null
  const groups = [...head, ...Array(fill).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const bytes = []
  for (const group of groups) {
    const value = Number.parseInt(group, 16)
    bytes.push((value >> 8) & 0xff, value & 0xff)
  }
  return bytes
}

/** IPv4 段判定：内网 / 回环 / 链路本地（含云元数据 169.254.169.254）/ CGNAT / 保留 / 组播 = 非公网。 */
function isBlockedIpv4(octets) {
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8 本网络
  if (a === 10) return true // 10/8 内网
  if (a === 127) return true // 127/8 回环
  if (a === 169 && b === 254) return true // 169.254/16 链路本地 + 云元数据
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12 内网
  if (a === 192 && b === 168) return true // 192.168/16 内网
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
  if (a === 192 && b === 0 && octets[2] === 0) return true // 192.0.0/24 IETF 协议段
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18/15 基准测试段
  if (a === 198 && b === 51 && octets[2] === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true // TEST-NET-3
  if (a >= 224) return true // 224/4 组播 + 240/4 保留 + 广播
  return false
}

/** IPv6 段判定：未指定 / 回环 / 链路本地 / 唯一本地 / 组播 / 映射与兼容 IPv4（按内嵌 v4 过段）。 */
function isBlockedIpv6(bytes) {
  const allZero = bytes.every((byte) => byte === 0)
  if (allZero) return true // :: 未指定
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return true // ::1 回环
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true // fe80::/10 链路本地
  if ((bytes[0] & 0xfe) === 0xfc) return true // fc00::/7 唯一本地
  if (bytes[0] === 0xff) return true // ff00::/8 组播
  const v4Tail = bytes.slice(12)
  const mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff
  const compatible = bytes.slice(0, 12).every((byte) => byte === 0)
  if (mapped || compatible) return isBlockedIpv4(v4Tail) // ::ffff:a.b.c.d 与 ::a.b.c.d 内嵌 v4 同段核验
  return false
}

/** IP 字面（IPv4 / IPv6 任意形）是否非公网。 */
export function isBlockedIpLiteral(address) {
  const v4 = parseIpv4(address)
  if (v4) return isBlockedIpv4(v4)
  const v6 = parseIpv6(address)
  if (v6) return isBlockedIpv6(v6)
  return true // 解析不出的 IP 字面 = 非法目标，fail-closed
}

/** 主机名静态面判定：localhost 家族 / 内网短名 / IP 字面；公网多级域名放行。 */
function isBlockedHostname(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '')
  if (host === '') return true
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  if (bare.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return isBlockedIpLiteral(bare)
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa') || host.endsWith('.lan')) return true
  if (!host.includes('.')) return true // 单标签内网名（如 intranet），fail-closed
  return false
}

/**
 * 出站门禁（INV-15 / K-16）：强制 https + 拒非公网目标；fetchHtml 与 CONNECT 目标一律必经。
 * @param {string} url - 目标 URL（绝对地址）。
 * @param {{lookup?: (hostname: string, opts: {all: true}) => Promise<Array<{address: string}>>}} [options]
 *   - lookup 可选 DNS 解析器：提供时对解析出的全部 IP 做同段核验（防解析绕过）。缺省 = 只做字面判定
 *     （内置四源为固定公网字面；自定义源与隧道目标在对应卡传真解析器补解析面）。
 * @returns {Promise<void>} 通过则返回；否则抛 code=BAD_TARGET 结构化错误。
 */
export async function assertPublicHttps(url, { lookup } = {}) {
  let parsed
  try {
    parsed = new URL(String(url))
  } catch {
    throw outboundBlockedError('unparsable', 'URL 无法解析')
  }
  if (parsed.protocol !== 'https:') {
    throw outboundBlockedError('scheme', `仅允许 https，实得 ${parsed.protocol}//（禁 http 明文）`)
  }
  // URL 内嵌凭据（userinfo）拒收：authority 段（:// 与下一个 / ? # 之间）出现 @ 即含身份位。
  // 注：K-4 凭据类标识扫描（sources-ddg.test / k-constraints）禁本文件出现相关字样，故走字面判定。
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(String(url)) || parsed.username !== '') {
    throw outboundBlockedError('credentials', 'URL 内嵌凭据被拒（P-5 / K-4：凭据零明文）')
  }
  const hostname = parsed.hostname
  if (isBlockedHostname(hostname)) {
    throw outboundBlockedError('host', `目标主机非公网：${hostname}`)
  }
  if (typeof lookup === 'function') {
    let resolved
    try {
      resolved = await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true })
    } catch (error) {
      throw outboundBlockedError('resolve', `DNS 解析失败：${error && error.message ? error.message : 'unknown'}`)
    }
    for (const entry of resolved ?? []) {
      if (isBlockedIpLiteral(String(entry.address))) {
        throw outboundBlockedError('resolved', `解析到非公网地址：${entry.address}`)
      }
    }
  }
}

/**
 * 可中止退避等待（C3 / K-6）：外层 signal（聚合链预算 / 调用方取消）触发即刻结束、绝不空等，
 * 等待时长由调用方算好传入（基数与上限只取 Config，K-9 零字面）。
 * @param {number} ms - 本次等待毫秒数。
 * @param {AbortSignal} [signal] - 外层中止信号。
 * @returns {Promise<void>} 等待完成 resolve；外层中止 reject 中止原因。
 */
function backoffWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(outerAbortError(signal))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(outerAbortError(signal))
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 超限错误（W3-3 / R32 拍板）：code=RESPONSE_TOO_LARGE 的**普通失败**——不进 classifyBlock（不入 INV-5 blocked 类）、不入重试环（确定性失败重试无意义）。 */
function tooLargeError(maxResponseBytes) {
  return Object.assign(
    new Error(`fetchHtml: response body exceeds maxResponseBytes (${maxResponseBytes} bytes)`),
    { code: 'RESPONSE_TOO_LARGE', maxResponseBytes },
  )
}

/** 字节拼接（零依赖，不引 node:buffer——导入面白名单测试锁）。 */
function concatChunks(chunks, total) {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * 带体积上限的响应体读取（W3-3 / R32）：
 * ① content-length 预检——声明超限**零读取即中止**（不把大 body 拉进内存）；
 * ② 有流（真 Response）逐块计数，超限即 cancel 流并抛普通失败；
 * ③ 无流（测试桩 / 环境降级）回退 text() 后按实际字节数判。
 * 上限值只取入参 maxResponseBytes（来自 Config.maxResponseBytes，K-9 零字面）；未传 = 不设上限（接线前的既有语义）。
 * @param {Response} response - 2xx 响应。
 * @param {number} [maxResponseBytes] - 字节上限（Config.maxResponseBytes）。
 * @returns {Promise<string>} HTML 文本。
 */
async function readBodyCapped(response, maxResponseBytes) {
  if (maxResponseBytes !== undefined) {
    const declared = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(declared) && declared > maxResponseBytes) throw tooLargeError(maxResponseBytes)
  }
  const reader = typeof response.body?.getReader === 'function' ? response.body.getReader() : null
  if (!reader) {
    const html = await response.text()
    if (maxResponseBytes !== undefined && new TextEncoder().encode(html).length > maxResponseBytes) {
      throw tooLargeError(maxResponseBytes)
    }
    return html
  }
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (maxResponseBytes !== undefined && total > maxResponseBytes) {
      try { await reader.cancel() } catch { /* 流已断不抛（超限才是主错误） */ }
      throw tooLargeError(maxResponseBytes)
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(concatChunks(chunks, total))
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECT 隧道（US-13 / INV-17/18，P-9~P-12）：HTTPS-over-CONNECT，TLS 升级后把隧道 socket 交给
// node:https（createConnection 回填），复用 Node 自带 HTTP 解析器——绝不自写 HTTP/1.1 解析。
// socket 层（node:net / node:tls）与 HTTP 客户端（node:https）只允许出现在本文件（INV-17 白名单单文件）。
// 六坑纪律（t3 Spike 实测）：CONNECT 方法大写（P-9）；407 结构化拒绝零重试（P-10）；三层超时
//（CONNECT 建连 / TLS 握手 / HTTP 响应各一层 + 外层 AbortSignal 桥接，P-11）；双层 socket 显式逐层
// 销毁（P-12，req.destroy 不带下层）；解压后再交 classifyBlock（P-14）。
// ─────────────────────────────────────────────────────────────────────────────

/** 隧道类结构化错误（code 区分于 BAD_TARGET / blocked / 普通 HTTP 失败）。 */
function tunnelError(code, detail, extra = {}) {
  return Object.assign(new Error(`CONNECT 隧道：${detail}`), { code, ...extra })
}

/** 层内中止错误：外层 signal 优先（调用方取消/链预算），否则判层超时。 */
function layerAbortError(layer, outer) {
  if (outer && outer.aborted) return outerAbortError(outer)
  return tunnelError('PROXY_LAYER_TIMEOUT', '隧道层超时（CONNECT / TLS / HTTP 三层之一）', { name: 'TimeoutError' })
}

/** 单层预算信号：外层 AbortSignal 与本层超时合成（P-11 桥接面）。 */
function layerSignal(timeoutMs, outer) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return outer ? AbortSignal.any([outer, timeout]) : timeout
}

/**
 * 层预算执行器：run 在本层预算内竞速，超时/外层中止即走 onFailure（通常=双层销毁）后抛。
 * @param {number} timeoutMs - 本层超时（毫秒，来自 Config.timeoutMs，K-9 零字面）。
 * @param {AbortSignal} [outer] - 外层取消信号。
 * @param {(layer: AbortSignal) => Promise<any>} run - 层内动作。
 * @param {() => void} [onFailure] - 失败收尾（销毁 socket）。
 */
async function guardLayer(timeoutMs, outer, run, onFailure) {
  const layer = layerSignal(timeoutMs, outer)
  try {
    return await Promise.race([
      run(layer),
      new Promise((_, reject) => {
        if (layer.aborted) reject(layerAbortError(layer, outer))
        else layer.addEventListener('abort', () => reject(layerAbortError(layer, outer)), { once: true })
      }),
    ])
  } catch (error) {
    if (typeof onFailure === 'function') onFailure()
    throw error
  }
}

/** 默认建连（node:net）；测试经 seam 注入假 socket（测试文件零 socket 模块字面，INV-17 grep 面）。 */
function defaultDial({ host, port }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

/** 默认 TLS 升级（node:tls，复用同一外层 socket）。 */
function defaultUpgrade({ socket, servername }) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername, ALPNProtocols: ['http/1.1'] })
    secure.once('secureConnect', () => resolve(secure))
    secure.once('error', reject)
  })
}

/**
 * CONNECT 握手（P-9：方法 token 必须大写 CONNECT——实测小写被代理 502 拒）。
 * @returns {Promise<{line: string, rest: Buffer}>} 状态行 + 响应头之后的残留字节。
 */
function connectHandshake(raw, target) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const cleanup = () => {
      raw.removeListener('data', onData)
      raw.removeListener('error', onError)
      raw.removeListener('close', onClose)
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    const onClose = () => {
      cleanup()
      reject(tunnelError('PROXY_CONNECT_FAILED', '代理在 CONNECT 握手期间关闭连接'))
    }
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      const sep = buffer.indexOf('\r\n\r\n')
      if (sep === -1) return
      cleanup()
      const head = buffer.subarray(0, sep).toString('latin1')
      const lineBreak = head.indexOf('\r\n')
      resolve({ line: lineBreak === -1 ? head : head.slice(0, lineBreak), rest: buffer.subarray(sep + 4) })
    }
    raw.on('data', onData)
    raw.once('error', onError)
    raw.once('close', onClose)
    // P-9：CONNECT 为大写字面量；请求行 = `CONNECT host:port HTTP/1.1`
    raw.write(`CONNECT ${target.host}:${target.port} HTTP/1.1\r\nHost: ${target.host}:${target.port}\r\nProxy-Connection: keep-alive\r\n\r\n`)
  })
}

/**
 * 打开 HTTPS-over-CONNECT 隧道（T5 主体：建连 / TLS / 407 / 三层超时 / 双层销毁）。
 * @param {{proxy: {address: string}, target: {host: string, port: number}, timeoutMs: number,
 *          signal?: AbortSignal, lookup?: Function, dial?: Function, upgrade?: Function}} options
 *   - proxy.address 代理地址（scheme://host:port 或 host:port；INV-18 禁凭据形态由 Config 校验兜底）
 *   - timeoutMs 单层超时（CONNECT / TLS / HTTP 各一层，来自 Config.timeoutMs，K-9）
 *   - dial / upgrade 测试 seam（缺省 node:net / node:tls 真实现）
 * @returns {Promise<{socket: object, rawSocket: object, destroy: Function}>} 隧道句柄（destroy 幂等、逐层显式销毁，P-12）。
 */
export async function openConnectTunnel({ proxy, target, timeoutMs, signal, lookup, dial = defaultDial, upgrade = defaultUpgrade } = {}) {
  const address = proxy && typeof proxy.address === 'string' ? proxy.address : ''
  const hostPort = /^(?:https?:\/\/)?([A-Za-z0-9.-]+):(\d{1,5})$/.exec(address)
  if (!hostPort) throw tunnelError('PROXY_ADDRESS_INVALID', '代理地址形如 host:port 或 http://host:port（INV-18 禁凭据形态）')
  if (!target || typeof target.host !== 'string' || !Number.isInteger(target.port)) {
    throw tunnelError('TARGET_INVALID', '隧道目标须为 {host, port}')
  }
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('openConnectTunnel: timeoutMs 必须是正数（来自 Config.timeoutMs，K-9）')
  }
  // INV-15：CONNECT 目标必经出站门禁（与 fetchHtml 同口径，不可绕过）
  await assertPublicHttps(`https://${target.host}:${target.port}/`, { lookup })

  let raw = null
  let secure = null
  // P-12：双层 socket 显式逐层销毁（先 TLS 后 raw）；req.destroy 不带下层（t3 实测）——幂等。
  const destroy = () => {
    if (secure && secure.destroyed !== true) secure.destroy()
    if (raw && raw.destroyed !== true) raw.destroy()
  }

  // 第 1 层：TCP 建连 + CONNECT 握手
  const handshake = await guardLayer(
    timeoutMs,
    signal,
    async () => {
      raw = await dial({ host: hostPort[1], port: Number(hostPort[2]) })
      return connectHandshake(raw, target)
    },
    destroy,
  )
  const statusLine = handshake.line
  if (/\s407(\s|$)/.test(statusLine)) {
    // P-10：407 = 结构化 proxy_auth_unsupported，命中即停——不重试、不静默回落直连（INV-18）
    destroy()
    throw tunnelError('proxy_auth_unsupported', '代理要求认证：本插件不支持代理认证（INV-18，凭据零明文）', { status: 407 })
  }
  if (!/^HTTP\/\d\.\d 200(\s|$)/i.test(statusLine)) {
    destroy()
    throw tunnelError('PROXY_CONNECT_FAILED', `代理 CONNECT 未放行：${statusLine}`, { statusLine })
  }

  // 第 2 层：TLS 升级（复用外层 socket；残留字节 rest 由 TLS 层自然消费前置缓冲场景见 T6）
  secure = await guardLayer(
    timeoutMs,
    signal,
    () => upgrade({ socket: raw, servername: target.host }),
    destroy,
  )
  return { socket: secure, rawSocket: raw, destroy }
}

/** 响应体解压（P-14：解压后才是 classifyBlock 的输入；content-encoding 未识别原样返回）。 */
function decompressBody(buffer, encoding) {
  const normalized = String(encoding ?? '').toLowerCase()
  if (normalized === 'br') return zlib.brotliDecompressSync(buffer)
  if (normalized === 'gzip' || normalized === 'x-gzip') return zlib.gunzipSync(buffer)
  if (normalized === 'deflate') return zlib.inflateSync(buffer)
  return buffer
}

/** 重定向跳数上限（P-13：限跳数 + 循环检测，禁无限跟随；独立小上限，非 Config 管控键）。 */
const MAX_REDIRECTS = 5

/** 可跟随的重定向状态码（P-13 自实现语义；303 后续跳改 GET 丢 body）。 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** 隧道请求协商的压缩面（P-14）：显式 Accept-Encoding，解压后才是 classifyBlock 输入。 */
const TUNNEL_ACCEPT_ENCODING = 'gzip, br, deflate'

/**
 * 单跳隧道请求（P-13 的每跳动作；复用 Node 自带 HTTP 解析器：https.request + createConnection 回填隧道 socket）。
 * 请求显式协商 Accept-Encoding（P-14）；响应体按 content-encoding 解压后才成为 text()。
 * 返回 Response-like（{ok, status, headers.get, text}）——让 fetchHtml 的 readBodyCapped / classifyBlock
 * 后处理链路零改动复用（T3 退避与上限不被本卡破坏）。
 * @returns {Promise<{ok: boolean, status: number, headers: {get: Function}, text: Function}>}
 */
async function requestViaTunnelOnce(url, { proxy, timeoutMs, method = 'GET', headers = {}, body, signal, lookup, dial, upgrade, requestImpl } = {}) {
  const parsed = new URL(String(url))
  const target = { host: parsed.hostname, port: Number(parsed.port || 443) }
  const tunnel = await openConnectTunnel({
    proxy,
    target,
    timeoutMs,
    signal,
    lookup,
    ...(typeof dial === 'function' ? { dial } : {}),
    ...(typeof upgrade === 'function' ? { upgrade } : {}),
  })
  const requestHeaders = { 'Accept-Encoding': TUNNEL_ACCEPT_ENCODING, ...headers, Connection: 'close' }
  // 第 3 层：HTTP 响应（Node 解析器）；结束/失败一律双层销毁（P-12）
  return guardLayer(
    timeoutMs,
    signal,
    () =>
      new Promise((resolve, reject) => {
        const send = typeof requestImpl === 'function'
          ? requestImpl
          : (options, callback) =>
              https.request(
                {
                  host: target.host,
                  port: target.port,
                  path: `${parsed.pathname}${parsed.search}`,
                  method,
                  agent: false,
                  servername: target.host,
                  createConnection: () => tunnel.socket,
                  headers: requestHeaders,
                  timeout: timeoutMs,
                },
                callback,
              )
        const req = send({ url, method, headers: requestHeaders, body, timeoutMs, createConnection: () => tunnel.socket }, (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            const rawBody = Buffer.concat(chunks)
            const plain = decompressBody(rawBody, res.headers && res.headers['content-encoding'])
            const headerMap = new Map(Object.entries(res.headers ?? {}))
            tunnel.destroy() // P-12：成功路径同样双层显式销毁（不留给 GC / 下层关闭时机）
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: { get: (name) => headerMap.get(String(name).toLowerCase()) ?? null },
              text: async () => plain.toString('utf8'),
            })
          })
          res.on('error', reject)
        })
        req.on('error', reject)
        if (typeof req.setTimeout === 'function') {
          req.setTimeout(timeoutMs, () => req.destroy(tunnelError('PROXY_LAYER_TIMEOUT', 'HTTP 响应层超时', { name: 'TimeoutError' })))
        }
        if (body !== undefined && body !== null) req.write(body)
        req.end()
      }),
    tunnel.destroy,
  )
}

/**
 * 经隧道请求 + 自控重定向（P-13）：逐跳解析 Location——禁盲目自动跟随；限跳数 MAX_REDIRECTS；
 * 访问集防环（成环即 REDIRECT_LOOP 快拒）；跨 host 重定向逐跳**重建隧道**（每跳独立 CONNECT、目标换新
 * host；同 host 重建即 Connection: close 语义）。重定向目标同样过出站门禁（INV-15：防 redirect 绕门禁）。
 * 解压每跳各自进行（P-14 一致性：text() 恒为解压后 HTML）。
 * @returns {Promise<{ok: boolean, status: number, headers: {get: Function}, text: Function}>} 终跳响应。
 */
export async function requestViaTunnel(url, options = {}) {
  let current = String(url)
  let requestOptions = { ...options }
  const visited = new Set()
  for (let hop = 0; ; hop += 1) {
    if (visited.has(current)) {
      throw tunnelError('REDIRECT_LOOP', `重定向成环：${current}`, { url: current })
    }
    visited.add(current)
    const response = await requestViaTunnelOnce(current, requestOptions)
    const location = response.headers.get('location')
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response
    if (hop >= MAX_REDIRECTS) {
      throw tunnelError('TOO_MANY_REDIRECTS', `重定向超过上限 ${MAX_REDIRECTS} 跳`, { url: current })
    }
    const next = new URL(String(location), current).href
    // 重定向目标必经出站门禁（INV-15：http 降级 / 内网目标即拒，防 redirect 绕过）
    await assertPublicHttps(next, { lookup: requestOptions.lookup })
    current = next
    // 303 语义：后续跳改 GET 丢 body（本插件出网仅 GET，K-4）；301/302/307/308 保持 method
    if (response.status === 303) requestOptions = { ...requestOptions, method: 'GET', body: undefined }
    else requestOptions = { ...requestOptions, body: undefined }
  }
}

/**
 * 抓取一页 HTML 文本（GET 为唯一默认形；出网内容 = URL 内的查询词与检索参数）。
 * @param {string} url - 已构造好的请求 URL（只含查询词与检索参数）。
 * @param {{timeoutMs: number, retries: number, retryBackoffMs?: number, maxResponseBytes?: number,
 *          signal?: AbortSignal, method?: string,
 *          headers?: Record<string, string>, body?: string, lookup?: Function}} options
 *   - timeoutMs 单请求超时（毫秒，来自 Config.timeoutMs，K-9）
 *   - retries 首次尝试之外的重试次数（来自 Config.retries，总尝试 = 1 + retries，K-9）
 *   - retryBackoffMs 重试退避基数（毫秒，指数退避；来自 Config.retryBackoffMs，K-9；未传 = 无退避）
 *   - maxResponseBytes 响应体上限（字节，超限=普通失败；来自 Config.maxResponseBytes，K-9；未传 = 不设上限）
 *   - lookup 可选 DNS 解析器（透传给出站门禁的解析后 IP 同段核验，INV-15）
 *   - proxy 可选代理（{address}）：在场即走 HTTPS-over-CONNECT 隧道（INV-17/18，P-9~P-12）
 *   - tunnelSeams 测试 seam（{dial, upgrade, requestImpl}，缺省真 net/tls/https；测试文件零 socket 模块字面）
 * @returns {Promise<string>} 响应 HTML 文本。
 */
export async function fetchHtml(url, { timeoutMs, retries, retryBackoffMs, maxResponseBytes, signal, method = 'GET', headers = {}, body, lookup, proxy, tunnelSeams = {} } = {}) {
  if (typeof url !== 'string' || url.length === 0) throw new TypeError('fetchHtml: url 必须是非空字符串')
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('fetchHtml: timeoutMs 必须是正数（来自 Config.timeoutMs，K-9）')
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new TypeError('fetchHtml: retries 必须是非负整数（来自 Config.retries，K-9）')
  }
  if (retryBackoffMs !== undefined && (typeof retryBackoffMs !== 'number' || !Number.isFinite(retryBackoffMs) || retryBackoffMs < 0)) {
    throw new TypeError('fetchHtml: retryBackoffMs 必须是非负有限数（来自 Config.retryBackoffMs，K-9）')
  }
  if (maxResponseBytes !== undefined && (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0)) {
    throw new TypeError('fetchHtml: maxResponseBytes 必须是正整数（来自 Config.maxResponseBytes，K-9）')
  }
  if (proxy !== undefined && proxy !== null) {
    // 确定性校验失败不进重试环（INV-18：代理地址形制由 Config 校验兜底，此处再挡一次）
    if (typeof proxy.address !== 'string' || !/^(?:https?:\/\/)?[A-Za-z0-9.-]+:\d{1,5}$/.test(proxy.address)) {
      throw new TypeError('fetchHtml: proxy.address 形如 host:port 或 http://host:port（INV-18 禁凭据形态）')
    }
  }
  // 出站门禁（INV-15 / K-16）：任何 fetch 发出之前必经，不可绕过；被拒即抛 BAD_TARGET，零出网。
  await assertPublicHttps(url, { lookup })
  const attemptsAllowed = 1 + retries
  let lastError = null
  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    if (signal && signal.aborted) throw outerAbortError(signal)
    if (attempt > 1 && retryBackoffMs > 0) {
      // C3 指数退避：第 n 次重试前等 基数×2^(n-1)（attempt=2 → 基数），单次等待 clamp 到 timeoutMs 不外溢；
      // 基数只取 Config.retryBackoffMs（K-9 零字面）。走到循环顶 = 上一轮判了可重试瞬态
      //（5xx/408/网络失败/body 读失败）——4xx 与超限在下方直接抛，永不进退避。
      const delay = Math.min(retryBackoffMs * 2 ** (attempt - 2), timeoutMs)
      await backoffWait(delay, signal)
    }
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    let response
    try {
      response = proxy
        ? await requestViaTunnel(url, {
            proxy,
            timeoutMs,
            method,
            headers: { 'User-Agent': CHROME_UA, ...PAGE_HEADERS, ...headers },
            body,
            signal: effectiveSignal,
            lookup,
            ...tunnelSeams,
          })
        : await fetch(url, {
            method,
            headers: { 'User-Agent': CHROME_UA, ...PAGE_HEADERS, ...headers },
            body,
            signal: effectiveSignal,
          })
    } catch (error) {
      // P-10：407（proxy_auth_unsupported）命中即停——不重试、不静默回落直连（INV-18）。
      // 确定性失败同口径零重试：出站门禁拒绝（BAD_TARGET）、重定向成环/超限（P-13）。
      if (error && (error.code === 'proxy_auth_unsupported' || error.code === 'BAD_TARGET'
        || error.code === 'REDIRECT_LOOP' || error.code === 'TOO_MANY_REDIRECTS')) throw error
      // 外层中止（链预算耗尽 / 调用方取消）不重试；网络失败与单请求超时重试。
      if (signal && signal.aborted) throw error
      lastError = error
      continue
    }
    if (response.ok) {
      let html
      try {
        html = await readBodyCapped(response, maxResponseBytes)
      } catch (error) {
        // W3-2 关闭：body 读失败（流中断/读超时）与网络失败同口径入重试环；外层中止仍不重试。
        // W3-3/R32：超限（code=RESPONSE_TOO_LARGE）是普通失败——不重试、不入 INV-5 blocked 类，直接抛。
        if (error && error.code === 'RESPONSE_TOO_LARGE') throw error
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
  if (typeof config.timeoutMs !== 'number' || !Number.isInteger(config.retries)
    || typeof config.retryBackoffMs !== 'number' || typeof config.maxResponseBytes !== 'number') {
    throw new TypeError('sources: config 缺 timeoutMs/retries/retryBackoffMs/maxResponseBytes 数值键（须经 Config.parse 回填，K-9）')
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
