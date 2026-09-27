// redact — 脱敏哨兵（T9 实现；「INV-11 同款三层」范式 = kb-context/lib/redact.js 同核、独立实现不 import——
// bundle 独立性同 ARC-4 先例）。分享内容渲染/导出前过哨兵（sk-/PEM/ghp_/Bearer 中和+计数），
// 分享页与导出共用。分享面口径：宁可误伤不可漏放（哨兵形态命中即中和，计数如实）。
// ⚠️ 编号注记（T9 报告 concerns）：delta-specs/占位注释称本面 OW-INV-11，PRODUCT.md 权威编号
//   OW-INV-11=索引三保险（tasks.md 映射 OW-INV-11→T11）；本文件=「INV-11 同款三层」的脱敏面。
// 三层正则（顺序敏感 ①→②→③，② 在 ③ 前——`api_key=sk-…` 由 ② 按赋值形态计 1 次，③ 不再重复匹配）：
//   ① PEM 整块（-----BEGIN<标签>----- … -----END<标签>-----）→ 整块 `<redacted>`
//   ② 赋值形态（高危 key 白名单 × 分隔符 × 值）→ 只换值保 key 名（`api_key=…` → `api_key=<redacted>`）；
//      白名单高危 key 值段贪心吃至空白边界 `\S+`（密码含 !/& 极常见，删一半+谎报 count=假安全）
//   ③ token 形态（`sk-` / `gh[pousr]_` / `AKIA` / `xox[baprs]-` / `Bearer <token>`）→ 整段 `<redacted>`
// 占位符 `<redacted>` + 计数（count = 中和次数，每次占位符写入计 1）。
// ⚠️ 防二次计数：`(?!<redacted>)`；不吞列表/映射结构值：`(?![\[{])`。
// ⚠️ 已知留白（同款范式声明过）：截断 PEM（有 BEGIN 无 END）、裸 base64/高熵段、小写 bearer、
//   `github_pat_`、白名单外 key 的赋值形态——宁漏不误伤面；分享面残余风险记 T9 报告 concerns。

/** 中和占位符（字面 `<redacted>`；渲染管线 raw HTML→文本转义后以 `&lt;redacted&gt;` 可见） */
export const REDACTED = '<redacted>'

/** ① PEM 整块：BEGIN/END 标签内为非连字符字符（RSA PRIVATE KEY / PGP PRIVATE KEY BLOCK 等） */
const PEM_BLOCK = /-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g

/** ② 高危 key 白名单（显式常量；`\b` 咬合防 my_token/嵌入词误伤；长名优先） */
const ASSIGN_KEY = [
  'api[_-]?keys?', 'apikeys?', 'secrets?[_-]?keys?', 'secrets?',
  'access[_-]?keys?', 'private[_-]?keys?', 'client[_-]?secrets?', 'credentials?',
  'access[_-]?tokens?', 'auth[_-]?tokens?', 'refresh[_-]?tokens?', 'tokens?',
  'passwords?', 'passwds?', 'pwds?', 'passphrases?', 'authorization',
].join('|')

/**
 * ② 赋值形态：捕获组 1 = key 名+分隔符（整体保留）；值四选一——双引号整体 / 单引号整体 /
 * Bearer 形（scheme 随值一起中和）/ 裸值；白名单 key 的值一律贪心吃至空白边界 `\S+`。
 */
const ASSIGN = new RegExp(
  String.raw`(\b(?:${ASSIGN_KEY})\b\s*[:=：＝]+\s*)(?:"(?!<redacted>")[^"]*"|'(?!<redacted>')[^']*'|Bearer\s+(?!<redacted>|["'])\S+|(?!<redacted>|Bearer\b|[\[{])\S+)`,
  'gi',
)

/**
 * ③ token 形态（整段中和，含前缀——前缀属哨兵形态非独立内容）。尾长下限 6：
 * 防 'Bearer of' 类散文短词误吞。
 */
const TOKEN_FORMS = [
  /\bsk-[A-Za-z0-9_-]{6,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{6,}/g,
  /\bAKIA[0-9A-Za-z_-]{6,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{6,}/g,
  /\bBearer\s+[A-Za-z0-9_\-./+~=@]{6,}/g,
]

/**
 * 脱敏（哨兵三层中和）：①→②→③ 顺序扫描，占位符写入 + 计数。
 * @param {string} text 原文（调用方在渲染/转义之前的 raw 域调用——转义会黏合词边界导致漏检）
 * @returns {{text: string, count: number}} 中和后文本 + 中和次数（每次占位符写入计 1）
 */
export function redact(text) {
  const src = text == null ? '' : String(text)
  let count = 0
  const swap = (keep = '') => {
    count += 1
    return keep + REDACTED
  }
  let out = src
  out = out.replace(PEM_BLOCK, () => swap())
  out = out.replace(ASSIGN, (_m, head) => swap(head))
  for (const re of TOKEN_FORMS) out = out.replace(re, () => swap())
  return { text: out, count }
}
