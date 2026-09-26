// search — kb-context 查询编译与检索执行（T3）
// 职责边界：查询词编译（FTS5 短语逐词引号 OR + 短词 LIKE 兜底）+ 命中组装（出处/snippet/预算截断）
// + SQL 内置 deadline 守卫；索引库归 lib/index-db.js（T2），词项判定复用其 trigramTerms（严禁重实现折叠）。
// ⚠️ 三雷（调研裁定 R11/R12 + 本机实测 /tmp/kbprobe-t3-1/2/3，Node v24.14.1 内置 SQLite）：
//   ① `MATCH ''` 是语法错误（实测 fts5: syntax error near ""）→ 空查询整查询走 LIKE；
//   ② LIKE 转义用 `ESCAPE '!'`（R11：`'\\'` 三层转义失效），`%`/`_`/`!` 逐个前缀 `!`；
//   ③ bm25() 无 MATCH 时返回 -0（实测）→ score 归一必须防 -0/NaN（R12）。
// ⚠️ DatabaseSync 同步阻塞事件循环，AbortSignal/timer 无法中止运行中的语句（且 strftime('now')
//   语句内恒定——实测单语句 distinct 值=1，做不了 SQL 时间谓词）→ deadline 守卫内置 SQL：
//   `WHERE ... AND kb_deadline_ok()`（UDF 非 deterministic 逐行评估，过期抛错即刻中止语句，
//   iterate 已产出的行保留）。probe 实证：守卫抛错经 all()/iterate() 原样传播，连接不受损。
import { trigramTerms } from './index-db.js'

// 守卫 UDF 名（与 search SQL 内联引用同名，契约字面量）
export const DEADLINE_GUARD_FN = 'kb_deadline_ok'

const DEADLINE_MSG = 'kb-context: search deadline exceeded'

// snippet 口径（调研裁定）：查询词位置前 80 / 后 220 字符，边界钳制不补齐
const SNIPPET_BEFORE_CHARS = 80
const SNIPPET_AFTER_CHARS = 220

// 截断默认值与 Config budget/timeoutMs 契约一致（截断参数由调用方经 opts 传入）
const DEFAULT_MAX_SNIPPETS = 3
const DEFAULT_MAX_TOKENS = 2000
const DEFAULT_TIMEOUT_MS = 1500

/** 查询词切分：空白分隔、丢空段（空查询 → []，由 compileQuery 路由 LIKE） */
function tokenize(query) {
  return String(query ?? '').trim().split(/\s+/).filter(Boolean)
}

/** LIKE 参数转义（R11）：`ESCAPE '!'` 下 `%`/`_`/`!` 逐个前缀 `!` */
function escapeLike(term) {
  return String(term).replace(/[!%_]/g, (c) => `!${c}`)
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 查询编译（逐词引号 OR + 短词/空词 LIKE 兜底路由）：
 * - 词项判定复用 index-db.trigramTerms：非空 = FTS5 trigram 可检索（≥3 码点），空 = 短词盲区 → LIKE；
 *   遗留清障⑩：**单遍分区**——每词恰探测一次（旧码 fts/like 双 filter=每词双调 trigramTerms）；
 *   `_probe` 为故障/计数注入缝（插桩非 mock，缺省=真 trigramTerms 判定）；
 * - MATCH 表达式逐词 `"term"` 引号化、词内 `"` 加倍，OR 连接——FTS 语法关键字/通配/括号全部中和为字面；
 * - 空查询（零词）match=null + 占位空词走 LIKE（`MATCH ''` 是语法错误，实测）。
 * @param {string} query 查询串（空白切词）
 * @param {{_probe?: (w: string) => boolean}} [opts] _probe=词项探测缝（测试插桩；缺省 trigramTerms(w).size > 0）
 * @returns {{words: string[], ftsWords: string[], likeWords: string[], match: string|null, likePatterns: string[]}}
 */
export function compileQuery(query, { _probe = (w) => trigramTerms(w).size > 0 } = {}) {
  const words = tokenize(query)
  const ftsWords = []
  const likeWords = []
  for (const w of words) {
    if (_probe(w)) ftsWords.push(w)
    else likeWords.push(w)
  }
  if (words.length === 0) likeWords.push('') // 空查询：整查询走 LIKE（browse 全量）
  const match = ftsWords.length > 0
    ? ftsWords.map((w) => `"${w.replace(/"/g, '""')}"`).join(' OR ')
    : null
  return { words, ftsWords, likeWords, match, likePatterns: likeWords.map((w) => `%${escapeLike(w)}%`) }
}

/**
 * bm25 归一（R12 防负零）：bm25() 越小越优且 ≤0（无 MATCH 时实测返回 -0）→ [0,1) 越大越优。
 * -0/NaN/±Inf/正值全部收敛为 +0；负值 n/(1+n) 恒在 (0,1)，不可能产出 -0。
 */
export function normalizeScore(bm25) {
  const b = Number(bm25)
  if (!Number.isFinite(b) || b >= 0) return 0 // -0 >= 0 → 收敛 +0
  const n = -b // b < 0 且有限 → n > 0
  return n / (1 + n)
}

/**
 * 预算截断用粗口径（非 tokenizer 精度）：CJK/假名/谚文/兼容表意 ≈1 token 每码点，其余 ≈4 字符 1 token。
 */
export function estimateTokens(text) {
  let cjk = 0
  let other = 0
  for (const ch of String(text ?? '')) {
    const cp = ch.codePointAt(0)
    const isCjk = (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
      (cp >= 0x3040 && cp <= 0x30FF) || (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xF900 && cp <= 0xFAFF)
    if (isCjk) cjk++
    else other++
  }
  return cjk + Math.ceil(other / 4)
}

/**
 * SQL 内置 deadline 守卫：注册逐行评估的 UDF（非 deterministic → 不被常量折叠），
 * 过期即抛错中止语句。DatabaseSync 阻塞事件循环，这是唯一可行的中止缝（AbortSignal 无效）。
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} deadlineMs 绝对 deadline（Date.now() 坐标系，含）
 */
export function installDeadlineGuard(db, deadlineMs) {
  db.function(DEADLINE_GUARD_FN, () => {
    if (Date.now() >= deadlineMs) throw new Error(DEADLINE_MSG)
    return 1
  })
}

function isDeadlineError(e) {
  return typeof e?.message === 'string' && e.message.includes(DEADLINE_MSG)
}

/** 词位锚点：最早出现的查询词下标（-1 = 未出现，snippet 取开头） */
function findAnchor(content, words) {
  let best = -1
  for (const w of words) {
    if (!w) continue
    let idx = content.indexOf(w)
    if (idx < 0) {
      // 大小写不敏感回退：正则 i 标志 match.index 仍在原文坐标系（禁 toLowerCase 后 indexOf——İ 扩散错位）
      try {
        idx = new RegExp(escapeRegExp(w), 'iu').exec(content)?.index ?? -1
      } catch { idx = -1 }
    }
    if (idx >= 0 && (best < 0 || idx < best)) best = idx
  }
  return best
}

function makeSnippet(content, anchor) {
  const pos = anchor < 0 ? 0 : anchor
  const start = Math.max(0, pos - SNIPPET_BEFORE_CHARS)
  const end = Math.min(content.length, pos + SNIPPET_AFTER_CHARS)
  return content.slice(start, end)
}

const FTS_SQL = `
  SELECT c.fts_rowid AS rid, d.path AS path, c.start_line AS start_line, c.end_line AS end_line,
         c.content AS content, bm25(chunks_fts) AS rank
  FROM chunks_fts
  JOIN chunks c ON c.fts_rowid = chunks_fts.rowid
  JOIN docs d ON d.id = c.doc_id
  WHERE chunks_fts MATCH ? AND ${DEADLINE_GUARD_FN}()
  ORDER BY bm25(chunks_fts) ASC
  LIMIT ?`

function likeSql(patternCount) {
  const conds = Array.from({ length: patternCount }, () => `c.content LIKE ? ESCAPE '!'`).join(' OR ')
  return `
  SELECT c.fts_rowid AS rid, d.path AS path, c.start_line AS start_line, c.end_line AS end_line, c.content AS content
  FROM chunks c
  JOIN docs d ON d.id = c.doc_id
  WHERE (${conds}) AND ${DEADLINE_GUARD_FN}()
  ORDER BY d.path ASC, c.start_line ASC, c.chunk_idx ASC
  LIMIT ?`
}

/**
 * 检索（消费 T2 索引库）：FTS5 BM25 命中 + 短词/空词 LIKE 兜底，OR 语义合并（FTS 序在前）。
 * - 输出契约（delta-spec §2）：`{hits:[{path, lines:[start,end], score, snippet}], degraded?}`；
 *   score = bm25 归一 [0,1) 越大越优（纯词法命中 = +0）；snippet = 查询词位置前 80/后 220 字符；
 *   JSON 序列化无 -0/NaN（R12）。
 * - 截断（截断参数由调用方传入）：≤maxSnippets 片段 / ≤maxTokens token（estimateTokens 粗口径，首条必保）。
 * - degraded：'lexical' = 整查询未走 BM25（短词/空词纯 LIKE 路径）；'timeout' = deadline 超时
 *   （fail-open 返回已有命中，不阻塞会话——DatabaseSync 阻塞下走 SQL 内置守卫中止）。
 * - 超时/意外 SQLite 错误不静默：超时走 degraded 标记（INV-15），其余原样抛出由调用方 fail-open。
 * @param {import('node:sqlite').DatabaseSync} db openDb() 产物
 * @param {string} query 查询串（空白切词）
 * @param {{maxSnippets?: number, maxTokens?: number, timeoutMs?: number}} [opts]
 *   timeoutMs 语义（Ruling「timeoutMs<=0=立即超时」，与 T5 inject 注记同语义）：deadline 预算毫秒；
 *   **0/负/NaN 归零 = 立即超时**（返回 {hits:[], degraded:'timeout'}）而**非不限时**——`Math.max(0, Number||0)`
 *   把负/非数收敛为 0，deadline 即刻过期。缺省 DEFAULT_TIMEOUT_MS。
 */
export function search(db, query, opts = {}) {
  const maxSnippets = opts.maxSnippets ?? DEFAULT_MAX_SNIPPETS
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0)
  if (Date.now() >= deadline) return { hits: [], degraded: 'timeout' }

  const { words, match, likePatterns } = compileQuery(query)
  installDeadlineGuard(db, deadline)

  let timedOut = false
  const entries = [] // {row, score}——FTS 序 + LIKE 兜底序

  if (match !== null) {
    try {
      for (const row of db.prepare(FTS_SQL).iterate(match, maxSnippets)) {
        entries.push({ row, score: normalizeScore(row.rank) })
      }
    } catch (e) {
      if (isDeadlineError(e)) timedOut = true
      else throw e
    }
  }
  if (!timedOut && likePatterns.length > 0) {
    try {
      for (const row of db.prepare(likeSql(likePatterns.length)).iterate(...likePatterns, maxSnippets)) {
        entries.push({ row, score: 0 }) // 纯词法命中无 BM25：score = +0（禁 bm25() 无 MATCH 的 -0）
      }
    } catch (e) {
      if (isDeadlineError(e)) timedOut = true
      else throw e
    }
  }

  // 合并去重（FTS 命中优先）+ 预算截断（≤maxSnippets / ≤maxTokens，首条必保）
  const hits = []
  const seen = new Set()
  let tokens = 0
  for (const entry of entries) {
    if (seen.has(entry.row.rid)) continue
    seen.add(entry.row.rid)
    if (hits.length >= maxSnippets) break
    const snippet = makeSnippet(entry.row.content, findAnchor(entry.row.content, words))
    const cost = estimateTokens(snippet)
    if (hits.length > 0 && tokens + cost > maxTokens) break
    hits.push({
      path: entry.row.path,
      lines: [entry.row.start_line, entry.row.end_line],
      score: entry.score,
      snippet,
    })
    tokens += cost
  }

  const out = { hits }
  if (timedOut) out.degraded = 'timeout'
  else if (match === null) out.degraded = 'lexical'
  return out
}
