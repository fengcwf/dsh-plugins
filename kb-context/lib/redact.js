// redact — 注入前脱敏哨兵（INV-11，delta-spec §4.4）
// 职责边界：纯函数文本中和，零依赖零状态——只认哨兵形态，不做泛化模糊；本文件不碰注入体/索引/会话。
// 三层正则（quqxui secrets.ts 范式）：
//   ① PEM 整块（-----BEGIN<标签>----- … -----END<标签>-----）→ 整块 `<redacted>`
//   ② 赋值形态（key 名白名单 × 分隔符 × 值）→ **只换值保 key 名**（`api_key=…` → `api_key=<redacted>`）
//   ③ token 形态（`sk-` / `gh[pousr]_` / `AKIA` / `xox[baprs]-` / `Bearer <token>`）→ 整段 `<redacted>`
// 占位符 `<redacted>` + 计数返回（count = 中和次数，每次占位符写入计 1）。
// ⚠️ 原则「over-redaction silently destroys memories」：中和面收窄到哨兵正则——非哨兵内容必须原样
//   （disk-usage-20240101 / tokenizer: 词法分析 / task-sku 等不误伤）；②值限 ASCII token 字符（防把中文
//   释义当值吞掉）+ `(?!<redacted>)` 重扫防护（防同一哨兵层间二次计数）+ `(?![\[{])` 不吞列表/映射值。
// ⚠️ 顺序裁定：①→②→③。②在 ③前——`api_key=sk-…` 由 ②按赋值形态计 1 次（保 key 名），③不再重复匹配。
// ⚠️ 已知留白（宁漏不误伤，见 task-5 fix 报告 concerns）：截断 PEM（有 BEGIN 无 END）、裸 base64/高熵段、
//   小写 bearer、`github_pat_`、key 名不在白名单的赋值形态（如 authorization_code=）、③各形态尾长 <6。

/** 中和占位符（字面 `<redacted>`；注入体转义管线对其抽走回填保字面） */
export const REDACTED = '<redacted>'

/** ① PEM 整块：BEGIN/END 标签内为非连字符字符（RSA PRIVATE KEY / PGP PRIVATE KEY BLOCK 等） */
const PEM_BLOCK = /-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g

/** ② key 名白名单（\b 咬合防 my_token/嵌入词误伤）；长名优先（secret_key 先于 secret） */
const ASSIGN_KEY = [
  'api[_-]?keys?', 'apikeys?', 'secrets?[_-]?keys?', 'secrets?',
  'access[_-]?keys?', 'private[_-]?keys?', 'client[_-]?secrets?',
  'access[_-]?tokens?', 'auth[_-]?tokens?', 'refresh[_-]?tokens?', 'tokens?',
  'passwords?', 'passwds?', 'pwds?', 'passphrases?', 'authorization',
].join('|')

/**
 * ② 赋值形态：捕获组 1 = key 名+分隔符（整体保留）；值四选一整体中和——
 * 双引号整体 / 单引号整体 / Bearer 形（scheme 随值一起中和）/ ASCII token 裸值。
 * 防护：`(?!<redacted>)` 占位符不二次计数；`(?![\{|])` 不吞列表/映射；`(?!\bBearer\b)` 防裸值回退吞 scheme 单词。
 */
const ASSIGN = new RegExp(
  String.raw`(\b(?:${ASSIGN_KEY})\b\s*[:=：＝]+\s*)(?:"(?!<redacted>")[^"]*"|'(?!<redacted>')[^']*'|Bearer\s+(?!<redacted>)[A-Za-z0-9_\-./+~=@]{2,}|(?!<redacted>|Bearer\b|[\[{])[A-Za-z0-9_\-./+~=@]{2,})`,
  'gi',
)

/**
 * ③ token 形态（整段中和，含 sk-/ghp_/xox/Bearer 前缀——前缀属哨兵形态非独立内容）。
 * 尾长下限 6（Bearer 4 亦可，取 6 统一）：防 'Bearer of' 类散文短词误吞；更短假样例留白记 concerns。
 */
const TOKEN_FORMS = [
  /\bsk-[A-Za-z0-9_-]{6,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{6,}/g,
  /\bAKIA[0-9A-Za-z_-]{6,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{6,}/g,
  /\bBearer\s+[A-Za-z0-9_\-./+~=@]{6,}/g,
]

/**
 * 脱敏（INV-11 哨兵中和）：三层顺序扫描，占位符 `<redacted>` 写入 + 计数。
 * @param {string} text 原文（调用方在 escapeText 之前的 raw 域调用——转义会黏合词边界导致 `<sk-…` 漏检）
 * @returns {{text: string, count: number}} 中和后文本 + 中和次数（每次占位符写入计 1）
 */
export function redact(text) {
  let count = 0
  const swap = (keep = '') => {
    count += 1
    return keep + REDACTED
  }
  let out = String(text)
  out = out.replace(PEM_BLOCK, () => swap())
  out = out.replace(ASSIGN, (_m, head) => swap(head))
  for (const re of TOKEN_FORMS) out = out.replace(re, () => swap())
  return { text: out, count }
}
