// dsh-login-gate — HTTP 匿名放行规则（httpAnonymous）内容治理：**锚定前缀**契约的唯一判据
//
// 为什么必须治理「正则内容」而不只是「正则可编译」（复审 F1 Critical）：
// 规则串最终由 `anonRules.some((re) => re.test(path))` 决定放行面。空串 / 零宽锚点 /
// 纯通配形（''、'^'、'.*'、'^/.*'、'^[a-z]*' …）能通过 zod 与旧写入面预检，
// 但 `re.test(path)` 对任意路径恒真 → 「仅某前缀匿名可达」**反转为「整站匿名免登」**
// （且经 forwarder 注入真原生 DSH 会话 cookie）。一次误配 = 把安全边界变更翻过来。
//
// 本模块把「精确前缀」从**用户正则的偶然产物**变成**强制契约**：
//   ① 必须以 `^` 开头（锚定）——否则语义从「前缀」退化为「路径包含」
//   ② 目标前缀必须是以 `/` 开头的绝对路径（`\/` 转义等价形亦接受）
//   ③ 不得命中探针路径族（根 / 门禁端点 / 不存在的随机路径）= 不得构成通配
//   ④ 不得覆盖 `/__gate/login`（端点锚定守卫）
//   ⑤ 不得命中**前缀伪装族**（目标前缀的正后方接任意字符构成的伪前缀路径）——
//      「锚定但非精确前缀」绕过：`^/ob_share`（少一尾斜杠，一次 typo 的量级）即可
//      放行 `/ob_share_backup/x`、`/ob_shareX/`；`^/x` 放行 `/x/ob_share/`；
//      `^/o`/`^/ob`/`^/ob_[a-z]+`/`^/(?:ob_share)` 等 62 形同族（复审 gate-anon-review2 R1）。
//      这类形字面前缀短于目标契约前缀，`re.test(path)` 命中「前缀匹配」而非「精确前缀」，
//      与合同红线「不得放宽为路径包含即放行」正面冲突（上游 FACE_PREFIX 兜底成 404，
//      但门禁层宣称的精确前缀契约在这一族上不成立）。故把这三形并入**负面探针**：
//      判据语义仍是「不得命中伪装形」，不 micro-manage 具体业务路径。
//
// 双道判据的唯一事实源（杜绝「面A严、面B松」）：
//   - 写入面 settings-write.js#checkPatchValues：坏规则 → 整单拒，**不入库**
//   - 装载层 index.js#normalize + gate.js#compile：坏规则 → **丢该条 + 告警**（不静默、不炸装载）
//
// 刻意不做「必须形如 ^/ob_share/」的 micro-manage：合法锚定前缀（`^/ob_share/[a-z]+`、
// `^/ob/`、`^\/ob_share\/`）一律放行，只否「会退化为通配/包含」的形（复审 §12 口径）。
const ANON_RULE_MAX_COUNT = 32 // 工程上限（防误刷），非安全判据
const ANON_RULE_MAX_LENGTH = 256 // 超长=疑似生成物/误粘贴，拒

// 「探针路径」：任何合法锚定前缀都不应命中的路径族。用**实证**而非黑名单判据。
// 只放「定义上不属于任何前缀」的路径：根路径、门禁自身端点、一个不可能存在的随机路径。
const ANON_PROBE_PATHS = Object.freeze([
  '/',
  '/__gate/login',
  '/__gate/status',
  '/__gate/health',
  '/@anon-probe-nonexistent-path',
  // 随机化探针：防止「针对固定探针串特判」的构造规则（如 `^/(?!@anon-probe-nonexistent-path).*）
  // 以此绕过固定探针。每次调用换一个随机串，构造者无法预知要排除哪个字面量。
  '/@anon-probe-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2),
  // 已知业务面之外的「第二段」路径：门禁上唯一该匿名可达的面是既定的分享面，其余一律不放行。
  // 用来否「第一段精确、第二段任意」的宽规则（如 `^/[a-z]`、`^/[^@]`、`^/api/[^/]+$` 之类
  // 把整层目录放开的形）——这不是 micro-manage 具体路径，而是「必须锚到第三段」的必然要求。
  '/anon-probe-2nd-segment/deep/deeper',
  // 前缀伪装族负面探针（合同 R3 红线三形）：任何「锚定但非精确前缀」的规则都会命中它们。
  //   - `/ob_share_backup/x`：少尾斜杠/字符类等价形（`^/ob_share`、`^/ob_share[a-z]*`、`^/ob_s[a-z]+`）放行
  //   - `/ob_shareX/`：连写伪装形（`^/ob_share`、`^/ob_share.*`、`^/(?:ob_share)`）放行
  //   - `/x/ob_share/`：目标前缀出现在**第二段**（`^/x`、`^/x/[a-z]+`、`^/[a-z]*/ob_share`）放行
  // 三者都是「目标前缀的正后方接任意字符」构成的形——精确前缀（`^/ob_share/`）不会命中。
  '/ob_share_backup/x',
  '/x/ob_share/',
  '/ob_shareX/',
])

/**
 * 单条规则的拒绝原因（null = 合法）。纯函数，绝不抛。
 * @param {unknown} rule 配置里的单条规则（应为字符串）
 * @returns {string|null} 拒绝原因（可读，进错误消息/告警行）；合法返回 null
 */
export function anonRuleRejection(rule) {
  if (typeof rule !== 'string') return '不是字符串'
  if (rule === '') return '空串'
  if (rule.length > ANON_RULE_MAX_LENGTH) return `超长（>${ANON_RULE_MAX_LENGTH} 字符）`
  if (!rule.startsWith('^')) return '未锚定（须以 ^ 开头，否则语义从「精确前缀」退化为「路径包含」）'
  const body = rule.slice(1)
  if (body === '' || body === '$') return '只含锚点、没有目标前缀（零宽规则，匹配任意路径）'
  // 目标前缀必须是站内绝对路径：`^/...`（`\/` 转义等价形亦接受）
  if (!/^(?:\/|\\\/)/.test(body)) return '目标前缀不是以 / 开头的绝对路径'
  let re
  try {
    re = new RegExp(rule) // eslint-disable-line no-new
  } catch (e) {
    return `不是合法正则（${e?.message ?? e}）`
  }
  // 纯通配 / 近通配实证：编译后不得命中探针路径族（命中任一 = 匹配面失控）
  for (const p of ANON_PROBE_PATHS) {
    if (re.test(p)) return `通配形：命中探针路径 ${p}（匹配任意路径形）`
  }
  // 端点锚定守卫：任何以 /__gate/login 结尾的串都不得被该规则覆盖
  try {
    if (new RegExp(rule + '$').test('/__gate/login')) return '通配形：可覆盖 /__gate/login' // eslint-disable-line no-new
  } catch (e) {
    return `不是合法正则（${e?.message ?? e}）`
  }
  return null
}

/**
 * 过滤规则清单：分出「合法锚定前缀」与「被丢弃项（含原因）」。
 * 纯函数、绝不抛：非数组输入按空表收敛（fail-closed = 零开口）。
 * @param {unknown} list 配置值（预期 string[]）
 * @returns {{rules: string[], dropped: {rule: unknown, reason: string}[]}}
 */
export function filterAnonymousRules(list) {
  const rules = []
  const dropped = []
  const arr = Array.isArray(list) ? list : []
  for (const rule of arr) {
    const why = anonRuleRejection(rule)
    if (why) dropped.push({ rule, reason: why })
    else rules.push(rule)
  }
  return { rules, dropped }
}

/** 规则条数/长度上限（写入面用；装载层同款收敛） */
export const ANON_RULE_LIMITS = Object.freeze({ maxCount: ANON_RULE_MAX_COUNT, maxLength: ANON_RULE_MAX_LENGTH })
