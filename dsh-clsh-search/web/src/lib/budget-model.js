// budget-model.js — 性能预算设置纯模块（Task 15；纯函数，node --test 可测）。
// 键面 = Config 面预算类字段（lib/index.js）；默认值 = R5 确认表（INV-9），与 Config schema
// 字段默认值逐项一致（web/test/budget-model.test.mjs 用 ../../lib/index.js 的 Config.parse({}) 钉死，禁止漂移）。

/** 预算类字段键（与 Config 一一对应：无遗漏、无多余）。 */
export const BUDGET_KEYS = ['timeoutMs', 'retries', 'chainBudgetMs', 'maxResults', 'cacheTtlMs', 'egoBudget']

/** R5 确认表默认值（= Config schema 字段默认值）。 */
export const R5_DEFAULTS = {
  timeoutMs: 12000,
  retries: 3,
  chainBudgetMs: 30000,
  maxResults: 8,
  cacheTtlMs: 600000,
  egoBudget: 15,
}

/** 字段元数据（设置页行展示：label / 说明 / 单位 / 值域）。 */
export const BUDGET_FIELDS = [
  { key: 'timeoutMs', label: '单查询超时', desc: '单个搜索源请求超时，超时即切换下一家', unit: 's', min: 1, integer: true },
  { key: 'retries', label: '失败重试', desc: '单源失败重试次数，重试间隔 1.5s', unit: '次', min: 0, integer: true },
  { key: 'chainBudgetMs', label: '整链预算', desc: '四源聚合总预算（AbortSignal.any 熔断）', unit: 's', min: 1, integer: true },
  { key: 'maxResults', label: '结果条数', desc: '返回给模型的结果条数，clamp 1–10', unit: '条', min: 1, max: 10, integer: true },
  { key: 'cacheTtlMs', label: '缓存 TTL', desc: 'LRU 50 条；命中缓存不发起网络请求', unit: '分钟', min: 0, integer: true },
  { key: 'egoBudget', label: 'ego-browser 兜底预算', desc: '单任务工具调用上限，超限即熔断明示', unit: '次', min: 0, integer: true },
]

/** maxResults clamp 1-10（与 Config transform 同式：Math.min(10, Math.max(1, v))）。 */
export function clampMaxResults(value) {
  return Math.min(10, Math.max(1, Number(value)))
}

/** 结果条数滑杆值域。 */
export const MAX_RESULTS_RANGE = { min: 1, max: 10, step: 1 }

/** 缓存 TTL 下拉候选（分钟 → 毫秒；含 R5 默认 10 分钟）。 */
export const CACHE_TTL_OPTIONS = [
  { valueMs: 60000, label: '1 分钟' },
  { valueMs: 300000, label: '5 分钟' },
  { valueMs: 600000, label: '10 分钟' },
  { valueMs: 1800000, label: '30 分钟' },
]

/** 毫秒 → 秒（超时/整链预算展示）。 */
export function msToSeconds(ms) {
  return Math.round(ms / 1000)
}

/** 秒 → 毫秒（行内数字输入写回）。 */
export function secondsToMs(seconds) {
  return Math.round(Number(seconds) * 1000)
}

/**
 * 正整数（含 0 上界字段）校验：空/非数字/非整数/越界 → 错误提示。
 * @param {unknown} value
 * @param {{min?: number, max?: number, integer?: boolean, label?: string}} spec
 * @returns {{ok: boolean, message: string, parsed: number|null}}
 */
export function validateNumber(value, spec = {}) {
  const { min = 1, max = Infinity, integer = true, label = '值' } = spec
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return { ok: false, message: `${label}必须是数字`, parsed: null }
  if (integer && !Number.isInteger(n)) return { ok: false, message: `${label}必须是整数`, parsed: null }
  if (n < min) return { ok: false, message: `${label}不得小于 ${min}`, parsed: null }
  if (n > max) return { ok: false, message: `${label}不得大于 ${max}`, parsed: null }
  return { ok: true, message: '', parsed: n }
}

/**
 * 按 BUDGET_FIELDS 元数据校验一个预算值；maxResults 越界采用 clamp（与 Config 同式，非报错）。
 * @param {string} key
 * @param {unknown} value
 * @returns {{ok: boolean, message: string, value: number|null}}
 */
export function validateBudget(key, value) {
  const field = BUDGET_FIELDS.find((f) => f.key === key)
  if (!field) return { ok: false, message: `未知预算字段：${key}`, value: null }
  if (key === 'maxResults') {
    // 与 Config 同式：整数合法即接受，越界 clamp 1-10（非报错）——故此处放开 max 上界再 clamp。
    const result = validateNumber(value, { ...field, max: Infinity, label: field.label })
    if (!result.ok) return { ok: false, message: result.message, value: null }
    return { ok: true, message: '', value: clampMaxResults(result.parsed) }
  }
  const result = validateNumber(value, { ...field, label: field.label })
  return { ok: result.ok, message: result.message, value: result.parsed }
}
