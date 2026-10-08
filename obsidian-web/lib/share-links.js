// share-links — 分享链接生成单一来源 + 外网域名设置持久化（T10 / OW-US-9「根治 URL 拼接坑」）
// 契约（PRODUCT OW-US-9 原文：设置页：外网域名配置→分享链接生成（内外网地址都显示））：
//   - 链接生成=服务端单一来源函数 buildShareLinks：/ob_share/<token> 路径段出自 share.js SHARE_URL_PREFIX
//     唯一字面 + 本函数唯一拼接点；前端零拼接（红线「禁止半路拼分享 URL」——web/src 只渲染服务端下发 links，
//     test/share-links.test.mjs 全树 grep 零命中锁形）。
//   - 内外网地址都显示：internal=内网链接（settings.lanHost 显式覆盖或 os.networkInterfaces
//     自动探测首个非 internal IPv4，全 internal 回落 127.0.0.1）；external=设置页配置的外网域名（未配置=null，
//     UI 显式占位引导设置页）。端口恒取 config.server.sharePort 单一来源（内网 host 禁带端口，防双源漂移）；
//     0.2.4 口径：sharePort=null（同域模式，出厂默认）时 internal **仅下发路径**（零端口）——旧实现在此
//     回落常量 3500，而 3500 在生产拓扑上恰是 login-gate 门禁端口，站外访客点进去必被 302 到登录页。
//   - 外网域名配置=设置页持久化（Ruling 见 task-10-report）：<vaultRoot>/.ob-share/settings.json
//     （0600，writeAtomicFsync 原子写+双 fsync=ARC-4；落分享存储内=内部段围栏天然遮蔽（guest 永不可达）、
//     dot 目录不出树；文件名非 token 形，listShares 串号门（entry.token===token）天然不出列表——测试锁形）。
//   - 输入围栏：外网域名只收 origin 形（域名/端口，禁路径/查询/片段/凭据/非 http(s) scheme——防链接拼接歧义
//     与 javascript: 注入）；lanHost 只收主机形（禁 URL/路径/端口）。归一在写入与读盘两侧同过（fail-loud）。
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { SHARE_DIR, SHARE_URL_PREFIX, TOKEN_RE, ensureShareDir } from './share.js'
import { writeAtomicFsync } from './vault-ops.js'

export const SETTINGS_FILE = 'settings.json'

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/** 外网域名归一 → origin 形（'https://host[:port]'）；null/''=清除。非法形一律 bad_request（可解释，管理面）。 */
export function normalizeExternalBaseUrl(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw fail('bad_request', '外网域名必须是字符串')
  const v = value.trim()
  if (v === '') return null
  let url
  try {
    url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) ? v : `http://${v}`)
  } catch {
    throw fail('bad_request', `外网域名非法：${value}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw fail('bad_request', `外网域名只收 http(s)：${value}`)
  if (url.username !== '' || url.password !== '') throw fail('bad_request', '外网域名不得含凭据')
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw fail('bad_request', '外网域名只收域名/origin（不含路径/查询/片段）')
  }
  if (url.hostname === '') throw fail('bad_request', `外网域名非法：${value}`)
  return url.origin
}

/** 内网 host 归一 → 主机形（hostname/IPv4/IPv6，IPv6 括号形剥括号）。端口禁带（=config.server.sharePort 单一来源）。 */
export function normalizeLanHost(value) {
  if (typeof value !== 'string') throw fail('bad_request', '内网 host 必须是字符串')
  const v = value.trim()
  if (v === '') throw fail('bad_request', '内网 host 不能为空')
  if (/\s/.test(v) || v.includes('/') || v.includes('?') || v.includes('#') || v.includes('://')) {
    throw fail('bad_request', `内网 host 非法（只收主机形）：${value}`)
  }
  let host = v
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host.includes(':')) {
    // 含冒号：只认 IPv6 字面形（net.isIP===6）；host:port 形拒（端口恒取 config.server.sharePort，防双源漂移）
    if (net.isIP(host) !== 6) throw fail('bad_request', `内网 host 非法（端口请配 server.sharePort）：${value}`)
  } else if (net.isIP(host) === 0 && !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) {
    throw fail('bad_request', `内网 host 非法（只收主机形）：${value}`)
  }
  return host
}

/** 内网 host 自动探测：首个非 internal IPv4；全 internal/无接口回落 127.0.0.1（形参可注入=纯判定锁形）。 */
export function detectLanHost(interfaces) {
  const ifaces = interfaces ?? os.networkInterfaces()
  for (const list of Object.values(ifaces ?? {})) {
    for (const item of list ?? []) {
      if (item?.internal) continue
      const family = item?.family
      if (family !== 'IPv4' && family !== 4) continue
      const addr = String(item?.address ?? '')
      if (addr !== '') return addr
    }
  }
  return '127.0.0.1'
}

function settingsFileAbs(root) {
  return path.join(path.resolve(root), SHARE_DIR, SETTINGS_FILE)
}

/** 读设置（缺文件=全默认；坏 JSON/盘上坏值=可解释抛错 fail-loud，读侧不静默放行——INV-15）。 */
export function readShareSettings(root) {
  const file = settingsFileAbs(root)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { externalBaseUrl: null, lanHost: null } // 未配置（默认不对外）
    throw fail('io_error', `读取分享设置失败：${err.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw fail('bad_request', '分享设置文件损坏（非合法 JSON）：.ob-share/settings.json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw fail('bad_request', '分享设置文件非法（须为对象）：.ob-share/settings.json')
  }
  return {
    externalBaseUrl: normalizeExternalBaseUrl(parsed.externalBaseUrl ?? null),
    lanHost: parsed.lanHost == null ? null : normalizeLanHost(parsed.lanHost),
  }
}

/** 写设置（补丁合并：未给键保留现值；归一后原子写 0600+双 fsync）。返回全量归一形。 */
export async function writeShareSettings(root, patch) {
  const p = patch ?? {}
  const current = readShareSettings(root)
  const next = {
    externalBaseUrl: p.externalBaseUrl === undefined ? current.externalBaseUrl : normalizeExternalBaseUrl(p.externalBaseUrl),
    lanHost: p.lanHost === undefined ? current.lanHost : (p.lanHost == null ? null : normalizeLanHost(p.lanHost)),
  }
  await ensureShareDir(root)
  await writeAtomicFsync(settingsFileAbs(root), JSON.stringify(next, null, 2), 0o600)
  return next
}

/**
 * 分享链接生成（唯一拼接点）：{path, internal, external}——内外网地址都显示（OW-US-9）。
 * @param token 分享令牌（TOKEN_RE 形围栏）
 * @param config 配置（port=server.sharePort 单一来源）
 * @param settings readShareSettings 形（externalBaseUrl/lanHost）
 * @param lanHost 显式内网 host（缺省=settings.lanHost ?? 自动探测）
 *
 * 链接口径（0.2.4 修订——原 3500 回落即本处 bug，见 §附）：
 *   sharePort=合法端口 → internal=`http://<host>:<port><path>`（独立 listener 模式，端口真实存在）；
 *   sharePort=null/缺省/非法 → internal=`<path>`（仅路径，**绝不拼端口**）。
 *   后者=(server.sharePort 默认 null) 同域模式：面挂 ctx.webServer.register，与 dsh 主 UI 同源同端口
 *   （OW-INV-2「PATH 契约非端口契约」）——此模式下任何具体端口都不成立；旧实现回落常量 3500，而 3500
 *   在生产拓扑上是 login-gate 门禁端口，站外访客点开必被 302 到登录页。故退化到路径形：由访问者当前
 *   使用的入口（主 UI 同源）补出完整 URL，插件侧绝不臆造 host:port 双源之一。
 *   端口来源仍是 config.server.sharePort 单一来源：非法/缺失时**不再有常量兜底**（fail-路径形，不 fail-3500）。
 */
export function buildShareLinks({ token, config, settings, lanHost } = {}) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw fail('bad_request', 'token 形非法')
  const urlPath = SHARE_URL_PREFIX + token
  const portRaw = config?.server?.sharePort
  const host = normalizeLanHost(lanHost ?? settings?.lanHost ?? detectLanHost())
  const bracketed = host.includes(':') ? `[${host}]` : host
  const externalBaseUrl = settings?.externalBaseUrl ? normalizeExternalBaseUrl(settings.externalBaseUrl) : null
  return {
    path: urlPath,
    internal: Number.isInteger(portRaw) && portRaw >= 1 && portRaw <= 65535
      ? `http://${bracketed}:${portRaw}${urlPath}`
      : urlPath, // 同域模式（sharePort=null）：仅路径，零端口臆造
    external: externalBaseUrl === null ? null : `${externalBaseUrl}${urlPath}`,
  }
}
