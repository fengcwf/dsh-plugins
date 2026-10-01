// takeover-model.js — 接管开关三态 + 隐私提示纯模块（Task 16；纯函数，node --test 可测）。
// 键面 = Config 面 `takeOver`（lib/index.js TAKE_OVER_MODES 同源同序）：auto=让位优先 | force=强制接管 | off=禁用接管。

/** 三态词汇（与 Config 同源）。 */
export const TAKE_OVER_MODES = ['auto', 'force', 'off']

/** 默认态 = auto（INV-10 让位优先；K-10）。 */
export const TAKE_OVER_DEFAULT = 'auto'

/** segmented 选项（设置页展示序）；force 严禁默认激活（K-10，由 TAKE_OVER_DEFAULT 保证）。 */
export const TAKE_OVER_OPTIONS = [
  { value: 'auto', label: '让位优先', hint: 'profile 显式指定别家 provider 时只警告不接管（默认）' },
  { value: 'force', label: '强制接管', hint: '覆盖别家 provider 强制接管 web_search（需显式选择）' },
  { value: 'off', label: '禁用接管', hint: '不注册 provider、不动指针（K-10 关断态）' },
]

/**
 * 隐私提示文案（US-5 / INV-4 / K-4 文字面）：必须含 credential-ref 与不出网语义。
 * grep 断言（web/test/takeover-model.test.mjs）钉死关键词，防文案回归。
 */
export const PRIVACY_NOTICE =
  '隐私提示：出网请求体只含查询词与必要检索参数；vault / 记忆 / 会话上下文不出网；凭据仅以 env 名（credential-ref）引用，不落明文。'

/**
 * 三态归一：非法值回落默认 auto（fail-open，与 Config resolveConfig 口径一致）。
 * @param {unknown} value
 * @returns {'auto'|'force'|'off'}
 */
export function normalizeTakeOver(value) {
  return TAKE_OVER_MODES.includes(value) ? value : TAKE_OVER_DEFAULT
}

/** 是否选中某态（segmented 激活样式用；强制接管只在显式选择时高亮）。 */
export function isTakeOverActive(current, optionValue) {
  return normalizeTakeOver(current) === optionValue
}

/** 默认态判定（K-10：force 不得默认高亮）。 */
export function isDefaultTakeOver(value) {
  return normalizeTakeOver(value) === TAKE_OVER_DEFAULT
}
