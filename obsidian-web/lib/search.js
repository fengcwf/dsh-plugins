// search — 全 vault 全文+标题搜索（T3 / OW-US-2）：查询编译纯函数 + 可插拔检索后端缝 + scan 后端
// 契约（键集锁定 test/search.test.mjs + test/web-routes.test.mjs）：
//   compileQuery(raw)  → {ok, reason?, raw, terms:[{text, strategy:'fts'|'like'}], needsFallback, allFts}
//   buildSnippet(line, terms, opts?) → 转义 HTML + <mark> 高亮（唯一标签，ARC-1 消毒口径）
//   deriveTitle(content, relPath) → {title, line}
//   createScanBackend({concurrency, timeoutMs}) → {name:'scan', search({root, plan, limit}) → {hits, degraded}}
//   createSearchService({backends, concurrency, timeoutMs, limit}) → {search(root, query, {limit})}
//     → {backend, degraded, query, results:[{path, line, snippet, score, title}]}（结果项键集锁定）
//     出口强制（I1/ARC-1）：任一后端 hits 的 snippet 必须=已转义形态，不合规拒（assertEscapedSnippet）
//   matchDocs(plan, docs) → hits（T11 add：索引后端复用面——文件级 AND/命中行/score 同口径）
//
// score 语义（detpecca 教训）：**score = 排序权重，越大越优，仅用于结果排序——非匹配概率、非百分比**。
//   本地加权：行内命中词 10/词 + 标题命中词 20/词 + 查询整串入标题 +10（合成标题命中行=20/词+10）。
//   T11 fts 后端（bm25 越小越优）接入时须转成同一约定（如 -bm25 或本地归一化），API 形零变化。
//
// 查询策略（2 字盲区口径，kb-context 同款语义、独立实现勿 import）：FTS5 trigram 下限 3 码点——
//   短词（<3 码点，含 1/2 字）与纯符号词 strategy='like'（SQL LIKE '%q%' 子串语义 + 大小写折叠）；
//   其余 strategy='fts'。service 层结构性兜底：非全 fts 查询一律走 scan 后端，不信任 fts 后端。
//
// scan 后端（本卡实现；T11 索引后端接管后的保底，后端切换零 API 变化）：
//   候选=全 vault `.md` 笔记（dot 条目跳过，与 listTree 同口径）；frontmatter 行不作命中行（title 来源除外）。
//   文件级 AND：每词须命中 标题 或 正文；命中行=含 ≥1 词的正文行；每文件取最优 ≤3 行。
//   并发限流：concurrency（默认 8）worker 池读文件；单查超时 timeoutMs（默认 2000ms）。
//   超时 fail-open：停止扫描、返回已得结果 + degraded={reason:'timeout', message, scanned}（INV-15 风格留痕）。
import fsp from 'node:fs/promises'
import path from 'node:path'
import { escapeHtml } from './render-inline.js'

const DEFAULT_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 2000
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const SNIPPET_MAX = 160
const SNIPPET_HEADROOM = 48
const HITS_PER_FILE = 3

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── 查询编译（纯函数）────────────────────────────────────────────────────────
function strategyOf(token) {
  if (/^[\p{P}\p{S}]+$/u.test(token)) return 'like' // 纯符号词：trigram 不可用 → 兜底
  return [...token].length < 3 ? 'like' : 'fts' // 1/2 字盲区（trigram 下限 3 码点）
}

export function compileQuery(raw) {
  const empty = { ok: false, reason: 'empty', raw: typeof raw === 'string' ? raw : '', terms: [], needsFallback: false, allFts: false }
  if (typeof raw !== 'string') return { ...empty, reason: 'bad_type' }
  const trimmed = raw.trim()
  if (trimmed === '') return empty
  const terms = trimmed.split(/\s+/).map((text) => ({ text, strategy: strategyOf(text) }))
  return {
    ok: true,
    raw,
    terms,
    needsFallback: terms.some((t) => t.strategy === 'like'),
    allFts: terms.every((t) => t.strategy === 'fts'),
  }
}

// ── snippet 构造（消毒口径：一切用户文本 escapeHtml，唯一标签 <mark>）──────────
function matchRanges(text, terms) {
  const ranges = []
  for (const term of terms) {
    const re = new RegExp(escapeRegExp(term.text), 'gi')
    for (const m of text.matchAll(re)) ranges.push({ start: m.index, end: m.index + m[0].length })
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  return merged
}

export function buildSnippet(text, terms, { maxLen = SNIPPET_MAX } = {}) {
  const line = String(text).replace(/\r$/, '')
  const ranges = matchRanges(line, terms)
  let start = 0
  let end = line.length
  if (line.length > maxLen) {
    const anchor = ranges.length ? ranges[0].start : 0
    start = Math.max(0, Math.min(anchor - SNIPPET_HEADROOM, line.length - maxLen))
    end = start + maxLen
  }
  let out = ''
  let cursor = start
  for (const r of ranges) {
    const rs = Math.max(r.start, start)
    const re = Math.min(r.end, end)
    if (re <= rs) continue
    if (rs > cursor) out += escapeHtml(line.slice(cursor, rs))
    out += `<mark>${escapeHtml(line.slice(rs, re))}</mark>`
    cursor = re
  }
  if (cursor < end) out += escapeHtml(line.slice(cursor, end))
  return (start > 0 ? '…' : '') + out + (end < line.length ? '…' : '')
}

// ── 标题提取：frontmatter title > 首个 H1 > basename（含标题行号）──────────────
function frontmatterEnd(lines) {
  if (lines[0]?.replace(/\r$/, '') !== '---') return 0
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].replace(/\r$/, '') === '---') return i + 1
  }
  return 0 // 未闭合 frontmatter 不剥
}

export function deriveTitle(content, relPath) {
  const lines = String(content).split('\n')
  const fmEnd = frontmatterEnd(lines)
  for (let i = 1; i < fmEnd; i += 1) {
    const m = /^title:\s*(.+?)\s*$/.exec(lines[i].replace(/\r$/, ''))
    if (m) return { title: m[1], line: i + 1 }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (i < fmEnd) continue
    const m = /^#\s+(.+?)\s*$/.exec(lines[i].replace(/\r$/, ''))
    if (m) return { title: m[1], line: i + 1 }
  }
  return { title: path.posix.basename(relPath).replace(/\.md$/i, ''), line: 1 }
}

// ── 单文件匹配（文件级 AND + 命中行 + score 加权）──────────────────────────────
// probes（逐词正则）每次查询编译一次、全文件复用（14K 文件量级不逐文件重编译正则）
function compileProbes(plan) {
  return plan.terms.map((t) => ({ re: new RegExp(escapeRegExp(t.text), 'i') }))
}

function matchFile(rel, content, plan, probes) {
  const lines = String(content).split('\n')
  const fmEnd = frontmatterEnd(lines)
  const { title, line: titleLine } = deriveTitle(content, rel)
  const titleProbes = probes.map((p) => p.re.test(title))
  const bodyHits = []
  const seen = new Set()
  for (let i = fmEnd; i < lines.length; i += 1) {
    const text = lines[i].replace(/\r$/, '')
    const matched = []
    probes.forEach((p, ti) => {
      if (p.re.test(text)) {
        matched.push(ti)
        seen.add(ti)
      }
    })
    if (matched.length) bodyHits.push({ line: i + 1, text, matched })
  }
  // 文件级 AND：每词须在 标题 或 正文 命中，缺词文件整体排除
  for (let ti = 0; ti < probes.length; ti += 1) {
    if (!titleProbes[ti] && !seen.has(ti)) return []
  }
  const wholeInTitle = title.toLowerCase().includes(plan.raw.trim().toLowerCase())
  const titleTermCount = titleProbes.filter(Boolean).length
  const scored = bodyHits.map((h) => ({
    path: rel,
    line: h.line,
    snippet: buildSnippet(h.text, plan.terms),
    score: 10 * h.matched.length + 20 * titleTermCount + (wholeInTitle ? 10 : 0),
    title,
  }))
  if (!scored.length) {
    // 标题命中、正文零命中行 → 合成标题命中行（line=标题行号，snippet=高亮标题）
    scored.push({
      path: rel,
      line: titleLine,
      snippet: buildSnippet(title, plan.terms),
      score: 20 * titleTermCount + (wholeInTitle ? 10 : 0),
      title,
    })
  }
  scored.sort((a, b) => b.score - a.score || a.line - b.line)
  return scored.slice(0, HITS_PER_FILE)
}

function cmpHits(a, b) {
  return b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)
}

// ── T11 复用面（additive，API 形零变化）：索引后端按同一文件级 AND/命中行/score 口径产出 hits ──
// fts 索引后端只做候选选择（FTS MATCH/LIKE 窄化），命中行/score/snippet 一律走本函数——
// 与 scan 后端逐字节同口径（test/index-fts.test.mjs 双后端等价锁）；score=排序权重（越大越优）。
export function matchDocs(plan, docs) {
  const probes = compileProbes(plan)
  const hits = []
  for (const doc of docs) hits.push(...matchFile(doc.path, doc.content, plan, probes))
  return hits.sort(cmpHits)
}

// ── scan 后端：全量扫描 + 并发限流 + 超时 fail-open 降级 ────────────────────────
export function createScanBackend({ concurrency = DEFAULT_CONCURRENCY, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const workers = Math.max(1, Math.floor(concurrency) || DEFAULT_CONCURRENCY)
  return {
    name: 'scan',
    async search({ root, plan, limit = DEFAULT_LIMIT }) {
      const deadline = Date.now() + Math.max(0, timeoutMs)
      let scanned = 0
      let timedOut = false
      const expired = () => {
        if (timedOut) return true
        if (Date.now() >= deadline) {
          timedOut = true
          return true
        }
        return false
      }
      // 1) 收集候选：异步 walk，dot 条目跳过（与 listTree 同口径）
      const files = []
      const walk = async (abs, rel) => {
        if (expired()) return
        let dirents
        try {
          dirents = await fsp.readdir(abs, { withFileTypes: true })
        } catch (err) {
          if (rel === '' && err?.code === 'ENOENT') throw fail('not_found', `vaultRoot 不存在：${root}`)
          return // 子目录读失败 fail-open 跳过（并发变更竞争不阻塞查询）
        }
        for (const d of dirents) {
          if (d.name.startsWith('.')) continue
          const childRel = rel ? `${rel}/${d.name}` : d.name
          if (d.isDirectory()) await walk(path.join(abs, d.name), childRel)
          else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) files.push(childRel)
          if (expired()) return
        }
      }
      await walk(path.resolve(root), '')
      // 2) 并发限流读+匹配（worker 池；超时即停发新活，fail-open 返回已得结果）
      const probes = compileProbes(plan)
      const perFile = []
      let cursor = 0
      const worker = async () => {
        while (!expired()) {
          const idx = cursor
          cursor += 1
          if (idx >= files.length) return
          scanned += 1
          try {
            const content = await fsp.readFile(path.resolve(root, files[idx]), 'utf8')
            perFile.push(...matchFile(files[idx], content, plan, probes))
          } catch {
            // 单文件读失败 fail-open 跳过（中途删除/权限竞争不炸查询）
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(workers, Math.max(1, files.length)) }, worker))
      // 3) 排序+截断（score=排序权重，越大越优）
      const hits = perFile.sort(cmpHits).slice(0, Math.max(1, Math.floor(limit) || DEFAULT_LIMIT))
      return {
        hits,
        degraded: timedOut
          ? {
              reason: 'timeout',
              message: `查询超时，已返回部分结果（已扫描 ${scanned} 个文件）`,
              scanned,
            }
          : null,
      }
    },
  }
}

// ── 检索服务：可插拔后端缝（T11 fts 索引后端即插即用，后端切换零 API 变化）────────
// 后端契约：{name, search({root, plan, limit}) → {hits, degraded}}；hits=结果项形（键集锁定）。
//   查询串转义义务（fts 后端，M4）：plan.terms 词面进 FTS MATCH / LIKE 之前必须逐词加引号
//   或转义符号（如 MATCH "C++"）——防 MATCH 'C++' 类符号查询炸 SQL 语法（ERR-004 同类事故）；
//   snippet 义务：必须=已转义形态（escapeHtml 口径，见下方出口强制，违反即拒）。
// 选择语义：plan.allFts 且已注册 fts → fts 后端；否则 scan（短词/纯符号盲区结构性走 LIKE 兜底）。
function clampLimit(value) {
  const n = Math.floor(value)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, n))
}

// ── ARC-1 出口消毒强制（I1）：任一后端 hits 的 snippet 必须=已转义形态 ───────────
// 已转义形态（render-inline escapeHtml 唯一口径：& < > " ' 全实体化，实体仅限
//   &amp;/&lt;/&gt;/&quot;/&#39;）+ 唯一标签 <mark> 且严格交替（先开后合、零嵌套零游离）。
// 选型=结构断言+拒（fail-closed 抛 bad_backend → HTTP 500），不静默再消毒：
//   ① 再消毒会二次转义合规 snippet（&lt; → &amp;lt;）破坏显示与高亮对齐；
//   ② 拒让违约后端在其测试里立刻炸出，转义义务违约不可被掩盖；
//   ③ v-html 承接面（SearchResults）宁可 500 也绝不落脏 HTML（ARC-1）。
function assertEscapedText(text, where) {
  if (/[<>]/.test(text)) throw fail('bad_backend', `${where}：文本含裸 < 或 >（未转义）`)
  if (text.replace(/&(?:amp|lt|gt|quot|#39);/g, '').includes('&')) {
    throw fail('bad_backend', `${where}：文本含裸 & 或非 escapeHtml 实体（非已转义形态）`)
  }
}

function assertEscapedSnippet(snippet, where) {
  if (typeof snippet !== 'string') throw fail('bad_backend', `${where}：snippet 非字符串（${typeof snippet}）`)
  let opened = false
  let cursor = 0
  for (const m of snippet.matchAll(/<\/?mark>/g)) {
    const isClose = m[0] === '</mark>'
    if (isClose !== opened) throw fail('bad_backend', `${where}：<mark> 非严格交替（游离/嵌套/乱序）`)
    assertEscapedText(snippet.slice(cursor, m.index), where)
    cursor = m.index + m[0].length
    opened = !isClose
  }
  if (opened) throw fail('bad_backend', `${where}：<mark> 未闭合`)
  assertEscapedText(snippet.slice(cursor), where)
}

export function createSearchService({ backends = {}, concurrency, timeoutMs, limit = DEFAULT_LIMIT } = {}) {
  const scan = createScanBackend({ concurrency, timeoutMs })
  const registry = { scan }
  for (const [name, backend] of Object.entries(backends ?? {})) {
    if (backend && typeof backend.search === 'function') registry[name] = backend
  }
  return {
    async search(root, query, { limit: reqLimit } = {}) {
      const plan = compileQuery(query)
      if (!plan.ok) throw fail('bad_request', plan.reason === 'empty' ? 'q 参数缺失' : 'q 参数非法')
      const backend = plan.allFts && registry.fts ? registry.fts : registry.scan
      const { hits, degraded } = await backend.search({ root, plan, limit: clampLimit(reqLimit ?? limit) })
      // ARC-1 出口强制（I1）：任一后端（含 scan）hits 一律过已转义形态结构断言，不合规拒
      if (!Array.isArray(hits)) throw fail('bad_backend', `后端 ${backend.name} 返回 hits 非数组（契约违约）`)
      hits.forEach((hit, i) => assertEscapedSnippet(hit?.snippet, `后端 ${backend.name} 第 ${i} 条 hit`))
      return { backend: backend.name, degraded, query: plan.raw, results: hits }
    },
  }
}
