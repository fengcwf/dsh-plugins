// source-order.js — 源开关与优先级排序纯模块（Task 14；纯函数，node --test 可测）。
// 键面 = Config 面 `sources`（lib/index.js）：四源开关 + priority（失败切换顺序）。
// 排序交互走 DESIGN.md §5 降级路径「上移/下移按钮」，故这里只做顺序代数，不含拖拽库。

/** 免 key 四源词汇（与 Config SOURCE_IDS 同源同序 = R5 默认优先级）。 */
export const SOURCE_IDS = ['ddg', 'bing', 'so360', 'baidu']

/** 源展示名（设置页行标题）。 */
export const SOURCE_LABELS = {
  ddg: 'DuckDuckGo',
  bing: 'Bing',
  so360: '360 搜索',
  baidu: '百度',
}

/** 源说明（设置页行说明，端点事实见 research-01）。 */
export const SOURCE_DESCS = {
  ddg: 'html/lite 端点 · 免 key · 基础回退源',
  bing: 'cn.bing.com · 免 key · CJK 查询优先',
  so360: 'so.com · 免 key',
  baidu: 'baidu.com · 免 key · CJK 回退源',
}

/** 全开默认（R1 四源全开）。 */
export const DEFAULT_SOURCE_FLAGS = Object.fromEntries(SOURCE_IDS.map((id) => [id, true]))

/**
 * priority 全排列校验：长度=4、每源恰好一次、无未知 id（US-2 设置面）。
 * @param {unknown} priority
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validatePriority(priority) {
  const errors = []
  if (!Array.isArray(priority)) {
    return { ok: false, errors: ['priority 必须是数组'] }
  }
  if (priority.length !== SOURCE_IDS.length) {
    errors.push(`priority 长度必须为 ${SOURCE_IDS.length}（四源全排列）`)
  }
  for (const id of priority) {
    if (!SOURCE_IDS.includes(id)) errors.push(`priority 含未知源：${String(id)}`)
    else if (priority.filter((x) => x === id).length !== 1) errors.push(`priority 重复源：${id}`)
  }
  return { ok: errors.length === 0, errors }
}

/**
 * 上移/下移（delta = -1 | +1）：返回新数组，越界为无操作（原序拷贝）。
 * @param {readonly string[]} order
 * @param {string} id
 * @param {-1|1} delta
 * @returns {string[]}
 */
export function moveSource(order, id, delta) {
  const next = [...order]
  const from = next.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= next.length) return next
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * 单源开关写回：返回新对象（不可变），未知 id 为无操作。
 * @param {Record<string, boolean>} flags
 * @param {string} id
 * @returns {Record<string, boolean>}
 */
export function toggleSource(flags, id) {
  if (!SOURCE_IDS.includes(id)) return { ...flags }
  return { ...flags, [id]: !flags[id] }
}

/** 已启用源数。 */
export function enabledCount(flags) {
  return SOURCE_IDS.filter((id) => flags[id]).length
}

/**
 * 开关校验：单源全关（= 四源全部关闭）时给出校验提示（US-2 设置面）。
 * @param {Record<string, boolean>} flags
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateSources(flags) {
  if (enabledCount(flags ?? {}) > 0) return { ok: true, errors: [] }
  return { ok: false, errors: ['至少启用一个搜索源（当前四源全关，web_search 将无源可用）'] }
}
