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

// —— 0.2.x 扩键词汇（T18 / INV-19）：Config 七组新键的前端词汇表与写回面 ——
// 镜像纪律（K-9 豁免③）：默认值与 lib/index.js Config schema 逐字一致，
// web/test/budget-model.test.mjs 用 Config.parse({}) 钉死防漂移（三面一致：Config ↔ 词汇表 ↔ 锁）。
// 形状注记：custom / useProxy 在 Config 挂 sources 子键（sources.custom / sources.useProxy），
// 设置面模型平铺承载（settings.custom / settings.useProxy），写回时经 extraPatch 归位。

/** 七组新键默认值（= Config schema 默认；custom/useProxy 平铺，写回时归位 sources 子键）。 */
export const EXTRA_KEY_DEFAULTS = {
  retryBackoffMs: 300,
  maxResponseBytes: 1048576,
  logCapacity: 200,
  healthTimeoutMs: 5000,
  proxies: [],
  useProxy: { ddg: true, bing: true, so360: false, baidu: false },
  custom: [],
}

/** 七组新键词汇（设置面/未来卡片渲染用：label / 说明 / 形状）。 */
export const EXTRA_KEY_FIELDS = [
  { key: 'retryBackoffMs', label: '重试退避基数', desc: '可重试瞬态重试前的指数退避基数，单次等待不外溢单查询超时', unit: 'ms', shape: 'number' },
  { key: 'maxResponseBytes', label: '响应体上限', desc: '单响应读取字节上限，超限按普通失败处理（不入反爬类目）', unit: 'B', shape: 'number' },
  { key: 'logCapacity', label: '触发日志容量', desc: '进程内存环条数上限，超出丢最旧；不落盘、重启即清空', unit: '条', shape: 'number' },
  { key: 'healthTimeoutMs', label: '健康测试超时', desc: '单源健康探针超时，短于主链超时以快速反馈', unit: 'ms', shape: 'number' },
  { key: 'proxies', label: '代理地址池', desc: 'https 代理地址列表（host:port，禁凭据），空 = 全直连', unit: '', shape: 'array' },
  { key: 'useProxy', label: '每源代理开关', desc: '境外源默认走代理、国内源默认直连（按源勾选）', unit: '', shape: 'object' },
  { key: 'custom', label: '自定义源', desc: '自定义搜索源列表（https + {query} 占位，id 唯一）', unit: '', shape: 'array' },
]

/** 数字键（其余为 proxies/custom 数组与 useProxy 对象）。 */
const EXTRA_SCALAR_KEYS = ['retryBackoffMs', 'maxResponseBytes', 'logCapacity', 'healthTimeoutMs']

/**
 * 从 Config 形对象取**在场**的新键（不做默认回填——merge 场景防把已载入值重置回默认）。
 * 兼容两形：Config 形（custom/useProxy 在 sources 子键）与设置面平铺形。
 * @param {unknown} raw - Config 或 settings 形对象。
 * @returns {Partial<typeof EXTRA_KEY_DEFAULTS>} 仅含在场且形状合法的键。
 */
export function pickExtraKeys(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const src = input.sources && typeof input.sources === 'object' ? input.sources : {}
  const out = {}
  for (const key of EXTRA_SCALAR_KEYS) {
    const value = Number(input[key])
    if (Number.isFinite(value) && value >= 0) out[key] = Math.round(value)
  }
  const proxies = Array.isArray(input.proxies) ? input.proxies : Array.isArray(src.proxies) ? src.proxies : null
  if (proxies) out.proxies = [...proxies]
  const useProxy = input.useProxy && typeof input.useProxy === 'object' && !Array.isArray(input.useProxy)
    ? input.useProxy
    : (src.useProxy && typeof src.useProxy === 'object' && !Array.isArray(src.useProxy) ? src.useProxy : null)
  if (useProxy) out.useProxy = { ...useProxy }
  const custom = Array.isArray(input.custom) ? input.custom : Array.isArray(src.custom) ? src.custom : null
  if (custom) out.custom = [...custom]
  return out
}

/**
 * 设置面模型 → Config 写回增量（A2：不含新键则保存即丢）。
 * 顶层 5 键平铺；custom / useProxy 归位 sources 子键（调用方与 base.sources 合并）。
 * 缺值回落 EXTRA_KEY_DEFAULTS（保存前未加载到的服务端值不致被清空）。
 * @param {object} settings - 设置面模型（平铺承载新键）。
 * @returns {{retryBackoffMs: number, maxResponseBytes: number, logCapacity: number,
 *   healthTimeoutMs: number, proxies: string[], sources: {custom: Array, useProxy: object}}}
 */
export function extraPatch(settings) {
  const flat = settings && typeof settings === 'object' ? settings : {}
  const merged = { ...EXTRA_KEY_DEFAULTS, ...pickExtraKeys(flat) }
  return {
    retryBackoffMs: merged.retryBackoffMs,
    maxResponseBytes: merged.maxResponseBytes,
    logCapacity: merged.logCapacity,
    healthTimeoutMs: merged.healthTimeoutMs,
    proxies: merged.proxies,
    sources: { custom: merged.custom, useProxy: merged.useProxy },
  }
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
