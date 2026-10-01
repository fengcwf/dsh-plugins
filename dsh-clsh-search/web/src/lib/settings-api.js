// settings-api.js — 设置读写与 Config 同源契约纯模块（Task 13）。
// 契约（计划 T13/T14）：设置值与 Config 同键——sources{ddg,bing,so360,baidu,priority} /
// timeoutMs / retries / chainBudgetMs / maxResults / cacheTtlMs / egoBudget / takeOver。
// 默认值 = R5 确认表（INV-9），与 lib/index.js Config schema 字段默认值逐项一致（测试钉死）。
// 传输缝：createSettingsApi 注入 fetch 实现；服务端路由挂载（lib/ 侧 webServer 静态服务/读写接口）
// 不在 W6 范围，故 endpoint 形为契约占位语义（真实路由落地后同一路径对齐即可）。
import { DEFAULT_SOURCE_FLAGS, SOURCE_IDS, validatePriority, validateSources } from './source-order.js'
import { BUDGET_KEYS, R5_DEFAULTS, clampMaxResults, validateBudget } from './budget-model.js'
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
})

/** 读接口超时（毫秒）：设置加载为读路径，挂起即可解释失败而非无限等待。 */
export const LOAD_TIMEOUT_MS = 8000

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
  return out
}

/**
 * 设置面模型 → Config 写回 patch（同键回写：sources 开关 + priority 并入 sources 对象）。
 * @param {object} settings
 */
export function toConfig(settings) {
  const normalized = fromConfig(settings)
  return {
    sources: { ...normalized.sources, priority: [...normalized.priority] },
    timeoutMs: normalized.timeoutMs,
    retries: normalized.retries,
    chainBudgetMs: normalized.chainBudgetMs,
    maxResults: normalized.maxResults,
    cacheTtlMs: normalized.cacheTtlMs,
    egoBudget: normalized.egoBudget,
    takeOver: normalized.takeOver,
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
      if (!res.ok) throw new Error(body?.error?.message ?? `设置请求失败（HTTP ${res.status}）`)
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
  }
}
