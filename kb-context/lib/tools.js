// tools — kb-context defineTool 主动检索工具面：wiki_search / wiki_read（T6；R1 改判 2026-09-24）
// 职责边界：工具定义（name/description/参数与输出 schema/execute）+ wiki_read 软错误读（fs 直读+三态+截断）；
// 检索执行归 lib/search.js（T3，经 search 缝消费）；wiki_read 数据源 = vaultRoot 磁盘现状 fs 直读
//（R1 改判：索引库 chunks 重组方案弃用——未索引误报 (page not found)/内容陈旧/丢尾随换行三坑；
//  '(page not found)' 语义回归真实=「磁盘无此文件」）。
// ⚠️ detpecca 教训（T3 裁定携带入 T6）：score 语义必须写进 description——bm25 归一后是**排序权重非相似度**，
//   纯词法命中 score=+0 不代表不相关；模型按相似度误读会丢真命中。
// ⚠️ R12 JSON 纪律：输出无 -0/NaN——finiteScore 断言层兜（T3 normalizeScore 已结构性防负零，此处双保险）。
// ⚠️ 软错误（detpecca 范式）：部分失败不整体炸——逐路径三态：正文 / '(page not found)'（磁盘无此文件）/
//   '(invalid or unreadable path)'（穿越/绝对/非法形/越 root/symlink 逃逸/读失败同标记，契约值面仅两错误态）。
// ⚠️ 路径解析（R4 安全形 + INV-7 精神）：vaultRoot（Config 键，默认 /mnt/unraid_data/Obsidian）下相对路径，
//   拒绝对/盘符/`..` 段/反斜杠/NUL；fs.realpathSync 归一防 symlink 逃逸（dangling 外指也算逃逸意图）。
// ⚠️ 大文本防爆：每页 ≤MAX_PAGE_CHARS、单次合计 ≤MAX_TOTAL_CHARS，截断处追加 '(truncated)' 文本内标记
//   （不新增 pages 值第三态——契约值面保持 正文 | 两个错误标记）；预算耗尽页值 = '(truncated)'。
// ⚠️ config per-call 热改（T1 语义）：每次 execute 现读 configSource；safeParse 失败 salvage raw 键回退默认
//   （镜像 inject.js salvageNumber / trigger.js salvage，保热改连续性）+ wiki_search 返回 degraded:'config'
//   留痕（INV-15 禁静默；与 lexical/timeout 并存时 'config' 优先——镜像 inject.js 'config' 优先序先例）。
import fs from 'node:fs'
import path from 'node:path'
import { Config, DEFAULT_VAULT_ROOT } from './index.js'

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

/** root 归属判（INV-7）：real 是否落在 rootReal 之内（含 root 自身）——path.relative 形防前缀拼接坑 */
function isInsideRoot(rootReal, real) {
  const rel = path.relative(rootReal, real)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/**
 * symlink 逃逸面检查（INV-7 精神，目标缺失时启用）：现存段逐段 lstat，任一 symlink 的 readlink 解析点
 * 外指 root（dangling 外指也算逃逸意图）判逃逸。已知限：链式 dangling（外指解析点自身又是 dangling
 * symlink）不递归展开——该角由 realpath 主判（文件存在时）兜住。
 */
function symlinksEscape(rootReal, target) {
  let cur = rootReal
  for (const seg of path.relative(rootReal, target).split(path.sep)) {
    if (seg === '') continue
    cur = path.join(cur, seg)
    let st
    try { st = fs.lstatSync(cur) } catch { return false } // 该段起不存在：无外指面（真缺失）
    if (!st.isSymbolicLink()) continue
    let link
    try { link = fs.readlinkSync(cur) } catch { return true } // 读不出链接：按不安全形拒
    const resolved = path.resolve(path.dirname(cur), link)
    if (!isInsideRoot(rootReal, resolved)) return true // 外指（dangling 也算逃逸意图）
    cur = resolved // 单级归一后继续走剩余段
  }
  return false
}

/**
 * 单页 fs 直读（软错误三态底层）：{text} | {marker: PAGE_NOT_FOUND|INVALID_PATH}，读失败不抛。
 * - realpathSync 归一 symlink 链后判 root 归属（防 symlink 逃逸，INV-7）；
 * - ENOENT/ENOTDIR = 磁盘无此文件（真实语义）→ PAGE_NOT_FOUND，但先验逃逸面（外指 symlink 拒）；
 * - EACCES/ELOOP/EISDIR 等读失败/逃逸类 → INVALID_PATH。
 */
function readVaultFile(rootReal, rel) {
  const target = path.resolve(rootReal, rel) // rel 已过 isSafeRelPath：无 `..` 段，lexical 必在 root 下
  let real
  try {
    real = fs.realpathSync(target)
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') {
      return { marker: symlinksEscape(rootReal, target) ? INVALID_PATH : PAGE_NOT_FOUND }
    }
    return { marker: INVALID_PATH }
  }
  if (!isInsideRoot(rootReal, real)) return { marker: INVALID_PATH } // symlink 逃逸（链式归一后判）
  try {
    return { text: fs.readFileSync(real, 'utf8') }
  } catch {
    return { marker: INVALID_PATH } // 读失败软错误：单路径标记，不整体炸
  }
}

/**
 * 软错误批量读（detpecca 范式，R1 改判：fs 直读磁盘现状）：逐路径三态，部分失败不整体炸。
 * - 正文 = vaultRoot 磁盘现状（含未索引/新改文件，round-trip 精确含尾随换行）；
 * - 磁盘无此文件（含缺 root 下有效形路径）→ PAGE_NOT_FOUND；vaultRoot 本身解析失败 = 读失败面 → 全 INVALID_PATH
 *   （非页面缺失——root 坏了不能骗模型「页不存在」）；
 * - 路径不安全（isSafeRelPath 拒：穿越/绝对/盘符/反斜杠/空段）或越 root/symlink 逃逸/读失败 → INVALID_PATH；
 * - 防爆：每页 ≤maxPageChars、合计 ≤maxTotalChars，截断追加 '\n'+TRUNCATED；预算耗尽 → TRUNCATED 整值。
 * @param {string} root vault 根路径（Config vaultRoot，per-call 热改）
 * @param {Array<string>} paths
 * @param {{maxPageChars?: number, maxTotalChars?: number}} [opts]
 * @returns {{pages: Object<string, string>}}
 */
export function readPagesFromFs(root, paths, opts = {}) {
  const maxPageChars = opts.maxPageChars ?? MAX_PAGE_CHARS
  const maxTotalChars = opts.maxTotalChars ?? MAX_TOTAL_CHARS
  // ⚠️ 键集安全化（35897db 回归保持）：模型可控路径键可为 '__proto__'——普通对象字面量会命中 __proto__
  //   setter 静默丢键；Map 收集 + Object.fromEntries（CreateDataProperty 语义）安全落 own key。
  const pages = new Map()
  let remaining = Math.max(0, Number(maxTotalChars) || 0)
  const fit = (text) => {
    const cap = Math.min(maxPageChars, remaining)
    if (text.length <= cap) {
      remaining -= text.length
      return text
    }
    if (cap <= 0) return TRUNCATED
    // 只扣本次实际占用（截到 cap + '\n' + 标记）——按 cap==maxPageChars<remaining 的每页截断路径
    // 不得把合计预算整体清零（fix round1 审查 Important：否则后续页被伪装成预算耗尽整值 (truncated)）
    remaining = Math.max(0, remaining - (cap + 1 + TRUNCATED.length))
    return `${text.slice(0, cap)}\n${TRUNCATED}`
  }
  // vaultRoot 现解析（per-call 热改）：canonical root（root 自身 symlink 也归一）；解析失败 = 读失败面
  let rootReal = null
  try { rootReal = fs.realpathSync(String(root ?? '')) } catch { rootReal = null }
  for (const raw of Array.isArray(paths) ? paths : []) {
    const key = String(raw)
    if (!isSafeRelPath(raw) || rootReal === null) {
      pages.set(key, INVALID_PATH)
      continue
    }
    const r = readVaultFile(rootReal, key)
    pages.set(key, r.text !== undefined ? fit(r.text) : r.marker)
  }
  return { pages: Object.fromEntries(pages) }
}

/**
 * config 现读 + salvage（镜像 inject.js salvageNumber / trigger.js salvage 语义）：合法走 zod 数据，
 * 坏键回退默认（含 vaultRoot）并置 salvaged 标记——调用方按 INV-15 留痕（wiki_search degraded:'config'）。
 */
export function currentConfig(configSource) {
  const raw = typeof configSource === 'function' ? configSource() : configSource
  const parsed = Config.safeParse(raw)
  if (parsed.success) return { cfg: parsed.data, salvaged: false }
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)
  const str = (v, fallback) => (typeof v === 'string' && v !== '' ? v : fallback)
  return {
    cfg: {
      budget: {
        maxSnippets: num(raw?.budget?.maxSnippets, 3),
        maxTokens: num(raw?.budget?.maxTokens, 2000),
      },
      timeoutMs: num(raw?.timeoutMs, 1500),
      vaultRoot: str(raw?.vaultRoot, DEFAULT_VAULT_ROOT),
    },
    salvaged: true,
  }
}

/**
 * 工具面构造（宿主缝位注入，T5 同款姿势）：
 * @param {object} deps
 * @param {Function} deps.defineTool 宿主缝（@deepseek-ai/dsh-tools，index.js 静态导入真件传入）
 * @param {(query: string, opts: object) => {hits: Array, degraded?: string}} deps.search T3 检索缝
 *   （index.js runSearch 真件；opts.signal=exec.signal 前瞻给 T3/T5 消费缝）
 * @param {(paths: string[], opts: {root: string}) => {pages: object}} deps.readPages 软错误读缝
 *   （index.js runReadPages → readPagesFromFs 真件；opts.root=config vaultRoot，per-call 热改）
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
      + 'degraded:"config"=配置热改值非法、salvage 回退默认（降级留痕，与其余标记并存时优先）；'
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
            enum: ['config', 'lexical', 'timeout'],
            description:
              "降级标记：'config'=配置校验失败 salvage 回退默认（INV-15 留痕，优先）；"
              + "'lexical'=纯词法路径（短词/空查询）；'timeout'=超时降级",
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const { cfg, salvaged } = currentConfig(configSource)
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
      // degraded 单值携带位（R8 裁定 2026-09-24）：config salvage（INV-15 留痕）优先于检索路径态
      //（镜像 inject.js 'config' 优先序先例）——salvage 污染本次调用全部派生参数，不可被内层标记掩盖
      const degraded = salvaged ? 'config' : r?.degraded
      if (degraded === 'config' || degraded === 'lexical' || degraded === 'timeout') out.degraded = degraded
      return out
    },
  })

  const wikiRead = defineTool({
    name: 'wiki_read',
    description:
      '按路径批量读取 vault 页面全文（paths 用 wiki_search 返回的 path，vault 相对路径，如 wiki/cost.md）。'
      + '返回 pages：path → 正文文本。正文直读 vault 磁盘现状（含未索引/新改文件，root 取配置 vaultRoot）。'
      + '软错误不整体炸（逐路径三态）：磁盘无此文件 → "(page not found)"；'
      + '路径不安全（绝对路径 / ../ 穿越 / 反斜杠 / 非法形式 / 越 root / symlink 逃逸）或读取失败 → "(invalid or unreadable path)"。'
      + `大文本防爆：每页 ≤${MAX_PAGE_CHARS} 字符、单次合计 ≤${MAX_TOTAL_CHARS} 字符，截断处追加 "${TRUNCATED}" 标记（预算耗尽的页整值为 "${TRUNCATED}"）。`,
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
      const { cfg } = currentConfig(configSource)
      return readPages(Array.isArray(args?.paths) ? args.paths : [], { root: cfg.vaultRoot })
    },
  })

  return [wikiSearch, wikiRead]
}
