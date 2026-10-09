// settings-api.js — 设置读写与 Config 同源契约纯模块（Task 13）。
// 契约（计划 T13/T14）：设置值与 Config 同键——sources{ddg,bing,so360,baidu,priority} /
// timeoutMs / retries / chainBudgetMs / maxResults / cacheTtlMs / egoBudget / takeOver。
// 默认值 = R5 确认表（INV-9），与 lib/index.js Config schema 字段默认值逐项一致（测试钉死）。
// 传输缝：createSettingsApi 注入 fetch 实现；服务端路由挂载（lib/ 侧 webServer 静态服务/读写接口）
// 不在 W6 范围，故 endpoint 形为契约占位语义（真实路由落地后同一路径对齐即可）。
import { DEFAULT_SOURCE_FLAGS, SOURCE_IDS, validatePriority, validateSources } from './source-order.js'
import {
  BUDGET_KEYS,
  EXTRA_KEY_DEFAULTS,
  R5_DEFAULTS,
  clampMaxResults,
  extraPatch,
  pickExtraKeys,
  validateBudget,
} from './budget-model.js'
import { TAKE_OVER_DEFAULT, normalizeTakeOver } from './takeover-model.js'

/** 设置面键（与 Config 同键；测试做键面一一对应断言）。 */
export const SETTINGS_KEYS = [
  'sources',
  'priority',
  'timeoutMs',
  'retries',
  'chainBudgetMs',
  'maxResults',
  'cacheTtlMs',
  'egoBudget',
  'takeOver',
]

/** 默认设置（R5 确认表镜像）。 */
export const DEFAULT_SETTINGS = Object.freeze({
  sources: { ...DEFAULT_SOURCE_FLAGS },
  priority: [...SOURCE_IDS],
  ...R5_DEFAULTS,
  takeOver: TAKE_OVER_DEFAULT,
  // 0.2.x 七组新键（平铺承载；写回经 extraPatch 归位 sources 子键）——镜像 = budget-model EXTRA_KEY_DEFAULTS
  ...EXTRA_KEY_DEFAULTS,
})

/** 读接口超时（毫秒）：设置加载为读路径，挂起即可解释失败而非无限等待。 */
export const LOAD_TIMEOUT_MS = 8000

/** 失败信封缺省 hint（kc/gho 先例形：失败必给可执行下一步）：服务端 hint 在场则以服务端为准。 */
export const ERROR_HINTS = Object.freeze({
  logs_unavailable: '日志不可用：内存环写失败——请重试；重启后自愈（INV-13 明示，不粉饰）',
  bad_request: '请检查填写项后重试',
  unauthorized: '请刷新页面重试鉴权',
  write_unavailable: '本部署暂只读：配置写缝缺位，可改 profile 配置后重启生效',
  default: '请稍后重试；若持续失败请在诊断卡运行自检定位',
})

/**
 * Config 原始 config → 设置面模型（缺省回落 R5 默认；数值归一）。
 * @param {unknown} raw - patch 注入的原始 config（未触达键回落默认）。
 */
export function fromConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const rawSources = input.sources && typeof input.sources === 'object' ? input.sources : {}
  const sources = { ...DEFAULT_SOURCE_FLAGS }
  for (const id of SOURCE_IDS) {
    if (typeof rawSources[id] === 'boolean') sources[id] = rawSources[id]
  }
  // priority 双形兼容：Config 原始形在 sources.priority；设置面模型形在顶层 priority。
  const rawPriority = Array.isArray(rawSources.priority) ? rawSources.priority : input.priority
  const priority = Array.isArray(rawPriority) && validatePriority(rawPriority).ok
    ? [...rawPriority]
    : [...SOURCE_IDS]
  const out = { sources, priority }
  for (const key of BUDGET_KEYS) {
    const fallback = R5_DEFAULTS[key]
    const value = Number(input[key])
    if (!Number.isFinite(value)) {
      out[key] = fallback
    } else if (key === 'maxResults') {
      out[key] = clampMaxResults(value)
    } else {
      out[key] = Math.round(value)
    }
  }
  out.takeOver = normalizeTakeOver(input.takeOver)
  // 0.2.x 七组新键透传（T17b）：pickExtraKeys 仅收在场且形状合法的键（缺键不清空不覆写语义在写回面），
  // 缺省回落 EXTRA_KEY_DEFAULTS——平铺承载（settings.custom / settings.useProxy），写回经 extraPatch 归位。
  Object.assign(out, { ...EXTRA_KEY_DEFAULTS, ...pickExtraKeys(input) })
  return out
}

/**
 * 设置面模型 → Config 写回 patch（同键回写：sources 开关 + priority 并入 sources 对象）。
 * @param {object} settings
 */
export function toConfig(settings) {
  const normalized = fromConfig(settings)
  // 七组新键写回增量（T17b）：顶层 5 键平铺；custom/useProxy 经 extraPatch 归位 sources 子键（非平铺）
  const extras = extraPatch(normalized)
  return {
    sources: {
      ...normalized.sources,
      priority: [...normalized.priority],
      custom: extras.sources.custom,
      useProxy: extras.sources.useProxy,
    },
    timeoutMs: normalized.timeoutMs,
    retries: normalized.retries,
    chainBudgetMs: normalized.chainBudgetMs,
    maxResults: normalized.maxResults,
    cacheTtlMs: normalized.cacheTtlMs,
    egoBudget: normalized.egoBudget,
    takeOver: normalized.takeOver,
    retryBackoffMs: extras.retryBackoffMs,
    maxResponseBytes: extras.maxResponseBytes,
    logCapacity: extras.logCapacity,
    healthTimeoutMs: extras.healthTimeoutMs,
    proxies: extras.proxies,
  }
}

/**
 * 全量校验（三卡校验纯模块汇合）：返回 {ok, errors:{字段: 提示}}。
 * @param {object} settings
 */
export function validateSettings(settings) {
  const errors = {}
  const sourcesCheck = validateSources(settings?.sources)
  if (!sourcesCheck.ok) errors.sources = sourcesCheck.errors[0]
  const priorityCheck = validatePriority(settings?.priority)
  if (!priorityCheck.ok) errors.priority = priorityCheck.errors[0]
  for (const key of BUDGET_KEYS) {
    const check = validateBudget(key, settings?.[key])
    if (!check.ok) errors[key] = check.message
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * 设置读写客户端（传输缝可注入，离线单测注入假 fetch）。
 * @param {{baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number}} [opts]
 * @returns {{load: () => Promise<object>, save: (settings: object) => Promise<object>}}
 */
export function createSettingsApi(opts = {}) {
  const {
    // 相对路径（无前导斜杠）：与静态服务同基解析——前导斜杠会逃出 <base href="./"> 前缀
    // 成为生产 404 根因（skill-explorer issue #1707 教训；W6.5 endpoint 对齐）。
    baseUrl = 'api/dsh-clsh-search',
    fetchImpl = typeof fetch === 'function' ? fetch : undefined,
    timeoutMs = LOAD_TIMEOUT_MS,
  } = opts

  async function request(path, init = {}, read = true) {
    if (typeof fetchImpl !== 'function') throw new Error('设置接口不可用（未注入 fetch 实现）')
    const ctrl = new AbortController()
    const timer = read && timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { accept: 'application/json', ...init.headers },
        signal: ctrl.signal,
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // 信封形制统一（kc/gho 先例形）：{error:{code,message,hint?}} → 上抛带 code/hint 的可解释错误
        const code = typeof body?.error?.code === 'string' ? body.error.code : `http_${res.status}`
        const error = new Error(body?.error?.message ?? `设置请求失败（HTTP ${res.status}）`)
        error.code = code
        error.hint = typeof body?.error?.hint === 'string' && body.error.hint.length > 0
          ? body.error.hint
          : ERROR_HINTS[code] ?? ERROR_HINTS.default
        throw error
      }
      if (body == null) throw new Error(`设置响应不是有效 JSON（HTTP ${res.status}）`)
      return body
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return {
    /** 读设置：规范信封 {data:{config}}（W65-B1 归一，与服务端 GET 同形），返回设置面模型。 */
    async load() {
      const body = await request('/settings')
      return fromConfig(body?.data?.config)
    },
    /** 写设置：同键 patch 回写；回显读 data.config（缺省回落本次 patch），返回设置面模型。 */
    async save(settings) {
      const patch = toConfig(settings)
      const body = await request('/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }, false)
      return fromConfig(body?.data?.config ?? patch)
    },

    // ── T13 诊断/日志/缓存面封装（与服务端六端点逐一对应，信封 {data} 统一解出）──

    /** 诊断快照（GET /diagnostics）：{items, summary, log, ego, stats}。 */
    async diagnostics() {
      const body = await request('/diagnostics')
      return body?.data
    },
    /** 单源探针（POST /diagnostics/probe；仅按钮触发，INV-14）：{source, ok, elapsedMs, resultCount, detail}。 */
    async probe(source) {
      const body = await request('/diagnostics/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source }),
      }, false)
      return body?.data
    },
    /** 真联网测试（POST /diagnostics/online；仅按钮触发）：{results, totalMs, truncated, budgetMs}。 */
    async onlineTest() {
      const body = await request('/diagnostics/online', { method: 'POST' }, false)
      return body?.data
    },
    /** 触发日志读面（GET /logs）：{entries, capacity, enabled, available}；环不可用抛 logs_unavailable。 */
    async logs() {
      const body = await request('/logs')
      return body?.data
    },
    /** 清空触发日志（POST /logs/clear）：{cleared}——只清内存环。 */
    async clearLogs() {
      const body = await request('/logs/clear', { method: 'POST' }, false)
      return body?.data
    },
    /** 清空缓存（POST /cache/clear）：{cleared}——只清缓存面。 */
    async clearCache() {
      const body = await request('/cache/clear', { method: 'POST' }, false)
      return body?.data
    },
  }
}
