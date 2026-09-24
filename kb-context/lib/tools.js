// tools — kb-context defineTool 主动检索工具面：wiki_search / wiki_read（T6）
// 职责边界：工具定义（name/description/参数与输出 schema/execute）+ wiki_read 软错误读（三态+截断）；
// 检索执行归 lib/search.js（T3，经 search 缝消费）；索引库生命周期归 lib/index.js（resolveIndexDbPath()/
// openReadOnlyDb 只读缝复用——runSearch/runReadPages 在 index.js 接线，本文件不直接开库）。
// ⚠️ detpecca 教训（T3 裁定携带入 T6）：score 语义必须写进 description——bm25 归一后是**排序权重非相似度**，
//   纯词法命中 score=+0 不代表不相关；模型按相似度误读会丢真命中。
// ⚠️ R12 JSON 纪律：输出无 -0/NaN——finiteScore 断言层兜（T3 normalizeScore 已结构性防负零，此处双保险）。
// ⚠️ 软错误（detpecca 范式）：部分失败不整体炸——逐路径三态：正文 / '(page not found)' /
//   '(invalid or unreadable path)'（路径不安全=绝对路径/`..` 穿越/含反斜杠/空段，与读取失败同标记）。
// ⚠️ 大文本防爆：每页 ≤MAX_PAGE_CHARS、单次合计 ≤MAX_TOTAL_CHARS，截断处追加 '(truncated)' 文本内标记
//   （不新增 pages 值第三态——契约值面保持 正文 | 两个错误标记）；预算耗尽页值 = '(truncated)'。
// ⚠️ 页正文来源 = 索引库 chunks 重组（行号映射 + 硬切段同行拼接；R1 裁定 2026-09-24——Config 冻结无
//   vaultRoot，fs 读无根可依，复用只读缝）。chunkText 尾随空行不计 → 重组文本不保尾随 '\n'（已知限）。
// ⚠️ config per-call 热改（T1 语义）：每次 execute 现读 configSource；safeParse 失败 salvage raw 数值键
//   （镜像 inject.js salvageNumber，保热改连续性）——工具有限输出形状无 degraded:'config' 位，报告留档。
import { Config } from './index.js'

// 软错误标记（delta-spec §2 契约字面量，与 detpecca 口径一致）
export const PAGE_NOT_FOUND = '(page not found)'
export const INVALID_PATH = '(invalid or unreadable path)'
// 截断标记（文本内标记，契约值面不新增第三态）
export const TRUNCATED = '(truncated)'
// 大文本防爆上限（R3 裁定 2026-09-24：≈被动注入预算 2k token 的 4-16 倍，主动读取语义；测试锁定）
export const MAX_PAGE_CHARS = 8_000
export const MAX_TOTAL_CHARS = 32_000

/**
 * R12 断言层兜：任何非有限/负值/负零收敛为 +0，正值原样——JSON 序列化永不产出 -0/NaN（NaN 会变 null 丢数据）。
 */
export function finiteScore(n) {
  const s = Number(n)
  return Number.isFinite(s) && s > 0 ? s : 0
}

/** 数值列守卫：有限正整数原样，其余（NaN/±Inf/-0/负/小数）收敛为 +0 整数 */
function finiteInt(n) {
  const v = Math.trunc(Number(n))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * 路径安全形（R4 裁定）：vault 相对路径——非空串、无 NUL/反斜杠、非绝对（POSIX `/` 或 Windows 盘符）、
 * 每段非空且非 '.'/'..'。不安全 = 拒（防 `../` 穿越与绝对路径负例，delta-spec §4.2 同族纪律）。
 */
export function isSafeRelPath(p) {
  if (typeof p !== 'string' || p === '') return false
  if (p.includes('\0') || p.includes('\\')) return false
  if (p.startsWith('/')) return false
  if (/^[A-Za-z]:/.test(p)) return false
  return p.split('/').every((s) => s !== '' && s !== '.' && s !== '..')
}

/**
 * 页正文重组（chunks 行号映射，R1 裁定）：
 * - 多行块（start<end）：content 按 '\n' 切开逐行写入（行粒度重叠块内容全等 → 覆盖幂等）；
 * - 单行游程（连续同 start==end 的块 = 超长单行硬切段）：按 chunk_idx 拼接还原本行，整行单块同样覆盖写；
 *   ⚠️ 只覆盖不追加——单行整块与多行块重叠同行时追加会重复（TDD 预判雷）；
 * - 已知限：chunkText 尾随空行不计 → 重组文本不保尾随 '\n'。
 * @param {Array<{chunk_idx:number, start_line:number, end_line:number, content:string}>} chunks 按 chunk_idx 升序
 */
export function reassemblePage(chunks) {
  const list = [...chunks].sort((a, b) => a.chunk_idx - b.chunk_idx)
  const lines = new Map()
  let i = 0
  while (i < list.length) {
    const c = list[i]
    if (c.start_line < c.end_line) {
      const parts = String(c.content).split('\n')
      for (let k = 0; k < parts.length; k++) lines.set(c.start_line + k, parts[k])
      i++
      continue
    }
    let text = ''
    const n = c.start_line
    while (i < list.length && list[i].start_line === n && list[i].end_line === n) {
      text += String(list[i].content)
      i++
    }
    lines.set(n, text) // 覆盖写（幂等），禁追加
  }
  return [...lines.keys()].sort((a, b) => a - b).map((n) => lines.get(n)).join('\n')
}

/**
 * 软错误批量读（detpecca 范式）：逐路径三态，部分失败不整体炸。
 * - 正文 = 索引库 chunks 重组（R1 裁定）；缺失（无 docs 行/缺库）→ PAGE_NOT_FOUND；
 * - 路径不安全（isSafeRelPath 拒）或读取异常 → INVALID_PATH（同标记，契约值面仅两态）；
 * - 防爆：每页 ≤maxPageChars、合计 ≤maxTotalChars，截断追加 '\n'+TRUNCATED；预算耗尽 → TRUNCATED 整值。
 * @param {import('node:sqlite').DatabaseSync|null} db 只读索引库（null=缺库：不建库零副作用，全缺失态）
 * @param {Array<string>} paths
 * @param {{maxPageChars?: number, maxTotalChars?: number}} [opts]
 * @returns {{pages: Object<string, string>}}
 */
export function readPagesFromDb(db, paths, opts = {}) {
  const maxPageChars = opts.maxPageChars ?? MAX_PAGE_CHARS
  const maxTotalChars = opts.maxTotalChars ?? MAX_TOTAL_CHARS
  const pages = {}
  let remaining = Math.max(0, Number(maxTotalChars) || 0)
  const fit = (text) => {
    const cap = Math.min(maxPageChars, remaining)
    if (text.length <= cap) {
      remaining -= text.length
      return text
    }
    if (cap <= 0) return TRUNCATED
    remaining = 0
    return `${text.slice(0, cap)}\n${TRUNCATED}`
  }
  let docStmt = null
  let chunkStmt = null
  for (const raw of Array.isArray(paths) ? paths : []) {
    const key = String(raw)
    if (!isSafeRelPath(raw)) {
      pages[key] = INVALID_PATH
      continue
    }
    try {
      if (db != null && docStmt == null) {
        docStmt = db.prepare(`SELECT 1 AS ok FROM docs WHERE path = ?`)
        chunkStmt = db.prepare(
          `SELECT c.chunk_idx AS chunk_idx, c.start_line AS start_line, c.end_line AS end_line, c.content AS content
           FROM chunks c JOIN docs d ON d.id = c.doc_id WHERE d.path = ? ORDER BY c.chunk_idx`)
      }
      if (db == null || docStmt.get(raw) === undefined) {
        pages[key] = PAGE_NOT_FOUND
        continue
      }
      pages[key] = fit(reassemblePage(chunkStmt.all(raw)))
    } catch {
      pages[key] = INVALID_PATH // 读取失败软错误：单路径标记，不整体炸
    }
  }
  return { pages }
}

/** config 现读 + salvage（镜像 inject.js salvageNumber 语义）：合法走 zod 数据，坏键回退默认 */
function currentConfig(configSource) {
  const raw = typeof configSource === 'function' ? configSource() : configSource
  const parsed = Config.safeParse(raw)
  if (parsed.success) return parsed.data
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)
  return {
    budget: {
      maxSnippets: num(raw?.budget?.maxSnippets, 3),
      maxTokens: num(raw?.budget?.maxTokens, 2000),
    },
    timeoutMs: num(raw?.timeoutMs, 1500),
  }
}

/**
 * 工具面构造（宿主缝位注入，T5 同款姿势）：
 * @param {object} deps
 * @param {Function} deps.defineTool 宿主缝（@deepseek-ai/dsh-tools，index.js 静态导入真件传入）
 * @param {(query: string, opts: object) => {hits: Array, degraded?: string}} deps.search T3 检索缝
 *   （index.js runSearch 真件；opts.signal=exec.signal 前瞻给 T3/T5 消费缝）
 * @param {(paths: string[], opts?: object) => {pages: object}} deps.readPages 软错误读缝（index.js runReadPages）
 * @param {object|Function} [deps.configSource] 当前 raw 配置（getter 形式，per-call 热改）
 * @returns {object[]} [wiki_search, wiki_read] 定义数组（apply 逐个 ctx.tools.register）
 */
export function buildTools({ defineTool, search, readPages, configSource = () => ({}) }) {
  const wikiSearch = defineTool({
    name: 'wiki_search',
    description:
      '检索 Obsidian vault 知识库（wiki/raw 已索引面；FTS5 trigram + BM25，短词自动 LIKE 兜底）。'
      + '返回 hits 按相关序排列，每条含出处 path（vault 相对路径）+ lines（行号区间 [起,止]）'
      + '+ snippet（查询词附近片段）+ score。'
      + 'score 分数是排序权重非相似度：bm25 归一后取 [0,1) 越大越优；纯词法（LIKE 兜底）命中 score=+0 不代表不相关。'
      + 'limit 为最多返回条数，默认 3（取配置 budget.maxSnippets，可热改）。'
      + 'degraded:"lexical"=纯词法检索路径（短词/空查询）；degraded:"timeout"=超时降级（fail-open，不阻塞会话）。'
      + '典型用法：先 wiki_search 找页，再 wiki_read 读全文。',
    parameters: {
      query: { type: 'string', required: true, description: '检索词（空白切词；短词自动走 LIKE 兜底）' },
      limit: { type: 'number', description: '最多返回命中条数（默认 3，取配置 budget.maxSnippets）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          hits: {
            type: 'array',
            required: true,
            description: '命中列表（相关序）：每条含出处 path + 行号区间 lines',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true, description: '出处：vault 相对路径' },
                lines: { type: 'array', required: true, description: '出处行号区间 [起, 止]', items: { type: 'integer' } },
                score: { type: 'number', required: true, description: '排序权重 [0,1) 越大越优（纯词法命中=+0）' },
                snippet: { type: 'string', required: true, description: '查询词附近片段' },
              },
            },
          },
          degraded: {
            type: 'string',
            enum: ['lexical', 'timeout'],
            description: "降级标记：'lexical'=纯词法路径（短词/空查询）；'timeout'=超时降级",
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const cfg = currentConfig(configSource)
      const rawLimit = Number(args?.limit)
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : cfg.budget.maxSnippets
      const r = search(String(args?.query ?? ''), {
        maxSnippets: limit,
        maxTokens: cfg.budget.maxTokens,
        timeoutMs: cfg.timeoutMs,
        signal: exec?.signal,
      })
      const hits = (Array.isArray(r?.hits) ? r.hits : []).map((h) => ({
        path: String(h?.path ?? ''),
        lines: [finiteInt(h?.lines?.[0]), finiteInt(h?.lines?.[1])],
        score: finiteScore(h?.score),
        snippet: String(h?.snippet ?? ''),
      }))
      const out = { hits }
      if (r?.degraded === 'lexical' || r?.degraded === 'timeout') out.degraded = r.degraded
      return out
    },
  })

  const wikiRead = defineTool({
    name: 'wiki_read',
    description:
      '按路径批量读取 vault 页面全文（paths 用 wiki_search 返回的 path，vault 相对路径，如 wiki/cost.md）。'
      + '返回 pages：path → 正文文本。软错误不整体炸（逐路径三态）：页面不存在 → "(page not found)"；'
      + '路径不安全（绝对路径 / ../ 穿越 / 反斜杠 / 非法形式）或读取失败 → "(invalid or unreadable path)"。'
      + `大文本防爆：每页 ≤${MAX_PAGE_CHARS} 字符、单次合计 ≤${MAX_TOTAL_CHARS} 字符，截断处追加 "${TRUNCATED}" 标记（预算耗尽的页整值为 "${TRUNCATED}"）。`
      + '正文来自已索引面（wiki/raw），未索引页面报 "(page not found)"。',
    parameters: {
      paths: {
        type: 'array',
        required: true,
        description: '要读取的页面路径列表（vault 相对路径，取 wiki_search 命中的 path）',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pages: {
            type: 'object',
            required: true,
            additionalProperties: true,
            description: `path → 正文 | "${PAGE_NOT_FOUND}" | "${INVALID_PATH}"（截断正文含 "${TRUNCATED}" 标记）`,
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return readPages(Array.isArray(args?.paths) ? args.paths : [])
    },
  })

  return [wikiSearch, wikiRead]
}
