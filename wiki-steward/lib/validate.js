// kb_validate — wiki 页机械校验器（Task 10；A2/INV-15 承载，delta-spec §2 契约）
// 职责边界：**只读校验**（零写盘；文件读取经 fs-safe.realpathGuard 围栏语义），输出结构化 JSON：
//   kbValidate(target, {rules?, vaultRoot?}) → {file, findings:[{rule, line?, message, severity}], verdict}
//   目录 target → {file, findings, verdict, results:[{file, findings, verdict}]}（聚合 findings 额带 file 键）
//   quickCheck(path, content?, {vaultRoot?}) → {ok, reasons[]}（T14 pre-execute 快检缝）
// 消费方：T15 欠账修复（findings 驱动）、T14 写入拦截（quickCheck）。勿在消费方重造规则。
//
// 六规则（rule id 稳定面，rules 参数可裁剪；另 'io' 为辅助规则不可选）：
//   ① frontmatter — 六字段内容（title≤50字/date YYYY-MM-DD 真值/tags≥1/status 词表/source/related 必填；
//      solutions 页增 reusability ∈ {cross-project,project-specific,one-time}；项目文档 status 用项目词表）
//   ② index — INDEX 双向：页面须登记 wiki/INDEX.md（漏登 error）；INDEX 条目指向须实存（死链 error 带行号）
//   ③ naming — 类型化命名表（Q13）：硬禁止（`\ / : * ? " < > |`/超 50 字）= error；
//      形态接受=时间戳形（YYYY-MM-DD[-HH-MM]-标题）/ Session 形（标题 - YYYY-MM-DD-HH-MM）/ 含中文名 /
//      基础设施豁免 / 项目文档约定名；裸纯英文非豁免 = warn（形态欠账非硬禁令）
//   ④ placement — 目录归属表（wiki-ingest 口径）+ 禁令：wiki 根放页、solutions 二级嵌套、未归属目录、
//      项目文档缺 projects/<project>/ 层 → error
//   ⑤ structure — 四段（概述→关键点→关联→来源）顺序 + wikilink 语法（代码块内豁免）→ warn
//   ⑥ evidence — 证据清单（INV-15）：调研摘要类文档（判定面=文件名/标题/type 含「调研|盘点|摘要」）必含
//      ERRORS/LEARNINGS 引用行 + 本地文档清单表 → error（缺任一必 FAIL）
//
// verdict 语义（分级判据）：error→'fail'；仅 warn→'warn'；无 finding→'pass'。
// 分级原则：违反必填/禁令/INV 反例矩阵（缺证据清单必 FAIL）= error；命名形态/结构完整性等
// 无 INV 鉴定 FAIL 面的存量欠账 = warn（T15 修复欠账的分级判据）。
//
// 判定面收窄（如实申报，见 task-10 报告）：
//   - 规则①③④⑤只套 wiki/** 页（raw/ 捕获/回写产物不受 wiki 维护指引约束——T14 不得误拦捕获落盘）；
//   - 规则①套全部 wiki 语义页（reference/ 迁移参考件除外；projects/ 用项目 status 词表）；
//   - 规则⑤四段只套 SCHEMA 语义页目录（concepts/entities/topics/sources/syntheses/solutions）；
//     reference/（ERRORS/LEARNINGS/工具清单迁移件）与 projects/（项目文档自有结构）不查四段；
//   - 规则③形态不查 reference/ 与项目文档约定名（overview/proposal/tasks/completion-summary/conversation/solution）；
//   - 规则⑥为调研摘要类专项（INV-15），非调研类文档不查证据清单（零误报）；
//   - 词表对账/全库扫描不在本模块（T2 validateIndex 教训：那是索引层的事）——性能=按 target 范围限定。
// 零第三方依赖（node:fs/node:path）；零构建纯 ESM。
import fs from 'node:fs'
import path from 'node:path'
import { realpathGuard } from './fs-safe.js'

/** 六规则稳定面（rules 参数合法值，顺序=执行序） */
export const RULES = ['frontmatter', 'index', 'naming', 'placement', 'structure', 'evidence']

// ── 常量表（规则源：Q13/Q15 裁决 + wiki-ingest 口径 + vault-health-inventory 基础设施豁免） ──

/** 基础设施/机器产物豁免（纯英文名合法 + 不查六字段/四段/证据清单/漏登） */
const INFRA_STEMS = new Set(['INDEX', 'SCHEMA', 'ERRORS', 'LEARNINGS', 'lint-report', 'log', 'hot'])
/** 项目文档约定名（归属表直接钦定文件名，豁免③形态） */
const PROJECT_DOC_STEMS = new Set(['overview', 'proposal', 'tasks', 'completion-summary', 'conversation', 'solution'])
/** 归属表目录（wiki-ingest 口径 + topics/ 主题页实况承载） */
const KNOWN_TOPS = new Set(['concepts', 'entities', 'topics', 'sources', 'syntheses', 'diagrams', 'reference', 'projects', 'solutions'])
/** ⑤ 四段适用目录（图页/参考件/项目文档/根层违规页不适用四段） */
const STRUCTURE_TOPS = new Set(['concepts', 'entities', 'topics', 'sources', 'syntheses', 'solutions'])
/** status 词表：通用（wiki-ingest 状态流转）+ 项目文档独立词表 */
const STATUS_VOCAB = ['draft', 'active', 'archived']
const PROJECT_STATUS_VOCAB = {
  overview: ['active', 'paused', 'completed'],
  proposal: ['draft', 'approved', 'rejected'],
  tasks: ['in_progress', 'done'],
  'completion-summary': ['archived'],
}
const REUSABILITY = ['cross-project', 'project-specific', 'one-time']
/** 文件名硬禁止字符（wiki-ingest 禁止行 + NUL） */
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000]/
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
/** 素材/报告时间戳形：YYYY-MM-DD[-HH-MM]-描述 */
const RE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(-\d{2}-\d{2})?-.+$/
/** Session 产物形：标题 - YYYY-MM-DD-HH-MM */
const RE_SESSION = /^.+ - \d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/
/** ⑥ 证据清单判定面（收窄）：调研摘要类标记 */
const EVIDENCE_MARKER = /(调研|盘点|摘要)/
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const RE_LOCAL_DOC = /(?:raw|wiki|changes|delta-specs|research)\/[\w\u4e00-\u9fff./-]+|[\w\u4e00-\u9fff./-]+\.(?:md|json|py|sh|yml|yaml|txt|js|mjs|sql)|\[\[[^\]]+\]\]/

// ── 最小 YAML 子集解析（零依赖；覆盖六字段所需形态：标量/引号/内联数组/块数组/行尾注释） ──

const unquote = (s) => {
  let t = s.trim()
  const m = /^(["'])([\s\S]*)\1$/.exec(t)
  if (m) return m[2]
  t = t.replace(/\s+#.*$/, '') // 未加引号标量的行尾注释
  return t.trim()
}

const splitTopCommas = (s) => {
  const out = []
  let cur = ''
  let quote = null
  for (const ch of s) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

const parseValue = (raw) => {
  const t = raw.trim()
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim()
    return { kind: 'array', items: inner === '' ? [] : splitTopCommas(inner).map(unquote) }
  }
  return { kind: 'scalar', value: unquote(t) }
}

/**
 * frontmatter 解析：首行 '---' 至下一行 '---'（或 '...'）为块；返回字段表（key→{kind,value,items,line}）、
 * 正文（不含 frontmatter）与行号基。无 frontmatter → null（调用方报「frontmatter 缺失」）。
 */
function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---' || t === '...') {
      end = i
      break
    }
  }
  if (end === -1) return null // 未闭合块：按缺失处理（机械判据，宁严勿漏）
  const fields = new Map()
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const key = m[1]
    const rest = m[2]
    if (rest.trim() === '') {
      // 块数组：后续缩进 `- item`
      const items = []
      let j = i + 1
      while (j < end) {
        const bm = /^\s+-\s*(.*)$/.exec(lines[j])
        if (!bm) break
        items.push(unquote(bm[1]))
        j++
      }
      if (!fields.has(key)) fields.set(key, { kind: 'array', items, line: i + 1 })
      i = j - 1
      continue
    }
    const v = parseValue(rest)
    if (!fields.has(key)) fields.set(key, { ...v, line: i + 1 })
  }
  return { fields, body: lines.slice(end + 1).join('\n'), fmStart: 1 }
}

// ── 规则纯函数（findings 形状：{rule, line?, message, severity}；line 缺省=文件级问题） ──

const finding = (rule, severity, message, line) =>
  line === undefined ? { rule, message, severity } : { rule, line, message, severity }

/** ① 六字段内容（+solutions reusability；项目文档 status 词表） */
function checkFrontmatter(fm, { stem, isSolutions, isProject }) {
  const out = []
  if (fm === null) return [finding('frontmatter', 'error', 'frontmatter 缺失或未闭合（六字段必填）', 1)]
  const { fields } = fm
  const miss = (key) => finding('frontmatter', 'error', `frontmatter 缺必填字段: ${key}`, 1)
  for (const key of ['title', 'date', 'tags', 'status', 'source', 'related']) {
    if (!fields.has(key)) out.push(miss(key))
  }
  const title = fields.get('title')
  if (title) {
    if (title.kind !== 'scalar' || title.value.trim() === '') {
      out.push(finding('frontmatter', 'error', 'frontmatter 字段 title 非法：须非空标量', title.line))
    } else if ([...title.value].length > 50) {
      out.push(finding('frontmatter', 'error', `frontmatter 字段 title 超 50 字（${[...title.value].length} 字）`, title.line))
    }
  }
  const date = fields.get('date')
  if (date) {
    const ok = date.kind === 'scalar' && /^\d{4}-\d{2}-\d{2}$/.test(date.value) && isRealDate(date.value)
    if (!ok) out.push(finding('frontmatter', 'error', `frontmatter 字段 date 非法：须 YYYY-MM-DD 真实日期（得 ${date.kind === 'scalar' ? date.value : '数组'}）`, date.line))
  }
  const tags = fields.get('tags')
  if (tags) {
    const ok = tags.kind === 'array' && tags.items.length >= 1 && tags.items.every((t) => t.trim() !== '')
    if (!ok) out.push(finding('frontmatter', 'error', 'frontmatter 字段 tags 非法：须数组且 ≥1 个非空标签', tags.line))
  }
  const status = fields.get('status')
  if (status) {
    const vocab = isProject ? PROJECT_STATUS_VOCAB[stem] ?? STATUS_VOCAB : STATUS_VOCAB
    const ok = status.kind === 'scalar' && vocab.includes(status.value)
    if (!ok) out.push(finding('frontmatter', 'error', `frontmatter 字段 status 非法：须 ∈ {${vocab.join(',')}}`, status.line))
  }
  const source = fields.get('source')
  if (source) {
    const ok = source.kind === 'scalar' && source.value.trim() !== ''
    if (!ok) out.push(finding('frontmatter', 'error', 'frontmatter 字段 source 非法：须非空（素材路径或链接）', source.line))
  }
  const related = fields.get('related')
  if (related && related.kind !== 'array') {
    out.push(finding('frontmatter', 'error', 'frontmatter 字段 related 非法：须数组（可为空 []）', related.line))
  }
  if (isSolutions) {
    const re = fields.get('reusability')
    if (!re) {
      out.push(miss('reusability'))
    } else {
      const ok = re.kind === 'scalar' && REUSABILITY.includes(re.value)
      if (!ok) out.push(finding('frontmatter', 'error', `frontmatter 字段 reusability 非法：须 ∈ {${REUSABILITY.join(',')}}`, re.line))
    }
  }
  return out
}

const isRealDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** ③ 类型化命名表（硬禁止=error；形态欠账=warn；形态接受面见头注释） */
function checkNaming(stem) {
  const out = []
  if (FORBIDDEN_CHARS.test(stem)) {
    out.push(finding('naming', 'error', `文件名含非法字符（禁止 \\ / : * ? " < > |）：${stem}`, undefined))
  }
  if ([...stem].length > 50) {
    out.push(finding('naming', 'error', `文件名超 50 字（${[...stem].length} 字）`, undefined))
  }
  return out
}

/** ③ 形态面（引用/项目约定名豁免） */
function checkNamingForm(stem, top) {
  if (top === 'reference' || PROJECT_DOC_STEMS.has(stem)) return []
  const ok =
    INFRA_STEMS.has(stem) ||
    RE_TIMESTAMP.test(stem) ||
    RE_SESSION.test(stem) ||
    CJK.test(stem)
  return ok ? [] : [finding('naming', 'warn', `文件名不合类型化命名表（纯英文/纯符号非豁免，INV-10）：${stem}`, undefined)]
}

/** ④ 目录归属 + 禁令 */
function checkPlacement(wikiRel, stem) {
  const segs = wikiRel.split('/')
  const top = segs[0]
  if (segs.length === 1) {
    return INFRA_STEMS.has(stem)
      ? []
      : [finding('placement', 'error', `禁止 wiki 根放页：${wikiRel}（页面必须落归属目录）`)]
  }
  if (!KNOWN_TOPS.has(top)) {
    return [finding('placement', 'error', `目录不在归属表：wiki/${top}/（concepts/entities/topics/sources/syntheses/diagrams/reference/projects/solutions）`)]
  }
  if (top === 'solutions' && segs.length > 2) {
    return [finding('placement', 'error', `solutions 禁止二级嵌套（须单层平铺）：${wikiRel}`)]
  }
  if (top === 'projects' && segs.length < 3) {
    return [finding('placement', 'error', `项目文档须落在 wiki/projects/<project>/ 之下：${wikiRel}`)]
  }
  return []
}

/** ⑤ 四段（顺序固定）+ wikilink 语法（围栏代码块豁免） */
function checkStructure(body) {
  const out = []
  const lines = body.split('\n')
  const want = ['概述', '关键点', '关联', '来源']
  const found = new Map()
  let fence = null
  const bodyLines = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceM = /^\s{0,3}(```|~~~)/.exec(line)
    if (fenceM) {
      if (fence === null) fence = fenceM[1]
      else if (fence === fenceM[1]) fence = null
      continue
    }
    if (fence !== null) continue
    bodyLines.push({ line, n: i + 1 })
    const hm = /^\s{0,3}##\s+(.+?)\s*$/.exec(line)
    if (hm && want.includes(hm[1]) && !found.has(hm[1])) found.set(hm[1], i + 1)
  }
  const missing = want.filter((h) => !found.has(h))
  if (missing.length > 0) {
    out.push(finding('structure', 'warn', `缺四段：${missing.map((h) => `## ${h}`).join(' / ')}（概述→关键点→关联→来源）`))
  } else {
    const seq = want.map((h) => found.get(h))
    if (seq.some((v, i) => i > 0 && v < seq[i - 1])) {
      out.push(finding('structure', 'warn', '四段顺序不符（期望概述→关键点→关联→来源）', seq[0]))
    }
  }
  for (const { line, n } of bodyLines) {
    let idx = line.indexOf('[[')
    while (idx !== -1) {
      const close = line.indexOf(']]', idx + 2)
      if (close === -1) {
        out.push(finding('structure', 'warn', 'wikilink 未闭合（[[ 缺 ]]）', n))
        break
      }
      const target = line.slice(idx + 2, close).split('|')[0].trim()
      if (target === '') out.push(finding('structure', 'warn', 'wikilink 目标为空（[[]]）', n))
      idx = line.indexOf('[[', close + 2)
    }
  }
  return out
}

/** ⑥ 证据清单（INV-15）：ERRORS/LEARNINGS 引用行 + 本地文档清单表 */
function checkEvidence(body) {
  const out = []
  const lines = body.split('\n')
  const hasErrors = lines.some((l) => l.includes('ERRORS'))
  const hasLearnings = lines.some((l) => l.includes('LEARNINGS'))
  if (!hasErrors) out.push(finding('evidence', 'error', '证据清单缺 ERRORS 引用行（INV-15：阶段产物必含 ERRORS/LEARNINGS 引用）'))
  if (!hasLearnings) out.push(finding('evidence', 'error', '证据清单缺 LEARNINGS 引用行（INV-15：阶段产物必含 ERRORS/LEARNINGS 引用）'))
  if (!hasLocalDocTable(lines)) out.push(finding('evidence', 'error', '证据清单缺本地文档清单表（INV-15：markdown 表列出所据本地文档）'))
  return out
}

const hasLocalDocTable = (lines) => {
  for (let i = 1; i < lines.length; i++) {
    if (!RE_TABLE_SEP.test(lines[i])) continue
    if (!lines[i - 1].includes('|')) continue
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].includes('|')) break
      if (RE_LOCAL_DOC.test(lines[j])) return true
    }
  }
  return false
}

// ── 路径/围栏/INDEX 上下文 ──────────────────────────────────────────────────

/** vaultRoot 推断：向上找含 wiki/INDEX.md 的祖先；退化=祖先目录名为 wiki 时取其父 */
function findVaultRoot(from) {
  let dir = path.resolve(from)
  let wikiFallback = null
  for (;;) {
    if (fs.existsSync(path.join(dir, 'wiki', 'INDEX.md'))) return dir
    if (path.basename(dir) === 'wiki' && wikiFallback === null) wikiFallback = path.dirname(dir)
    const parent = path.dirname(dir)
    if (parent === dir) return wikiFallback
    dir = parent
  }
}

const readUtf8 = (p) => {
  try {
    return { ok: true, text: fs.readFileSync(p, 'utf8') }
  } catch (e) {
    return { ok: false, error: e }
  }
}

/** INDEX 双向上下文：一次校验一份（target 范围限定，不做全库词表对账） */
function loadIndex(vaultRoot) {
  const idxAbs = path.join(vaultRoot, 'wiki', 'INDEX.md')
  const r = readUtf8(idxAbs)
  if (!r.ok) return { exists: false, links: [], targets: new Set() }
  const links = []
  const targets = new Set()
  r.text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    const re = /\[\[([^\]\[]+?)\]\]/g
    let m
    while ((m = re.exec(line)) !== null) {
      const target = m[1].split('|')[0].trim()
      if (target === '') continue
      links.push({ target, line: i + 1 })
      targets.add(target)
    }
  })
  return { exists: true, links, targets }
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

const normalizeRules = (rules) => {
  if (rules === undefined) return [...RULES]
  if (!Array.isArray(rules) || rules.length === 0) throw new TypeError('kbValidate: rules 必须是非空规则名数组')
  for (const r of rules) {
    if (!RULES.includes(r)) throw new TypeError(`kbValidate: 未知规则名 ${r}（合法：${RULES.join('/')}）`)
  }
  return [...rules]
}

const verdictOf = (findings) => {
  if (findings.some((f) => f.severity === 'error')) return 'fail'
  if (findings.length > 0) return 'warn'
  return 'pass'
}

/**
 * 机械校验（只读）。
 * @param {string} target 文件或目录（绝对/相对 cwd）
 * @param {{rules?: string[], vaultRoot?: string}} [opts] rules 裁剪执行面；vaultRoot 缺省自动推断
 * @returns {Promise<{file: string, findings: Array<{rule: string, line?: number, message: string, severity: 'error'|'warn'}>, verdict: 'pass'|'warn'|'fail'}>}
 *          目录 target 另带 results（逐文件同形），聚合 findings 额带 file 键
 */
export async function kbValidate(target, opts = {}) {
  const rulesSel = normalizeRules(opts.rules)
  const abs = path.resolve(target)
  let st
  try {
    st = await fs.promises.stat(abs)
  } catch (e) {
    return { file: abs, findings: [finding('io', 'error', `目标不可读：${e?.code ?? e?.message ?? e}`)], verdict: 'fail' }
  }
  const vaultRoot = opts.vaultRoot ? path.resolve(opts.vaultRoot) : findVaultRoot(st.isDirectory() ? abs : path.dirname(abs))
  if (st.isDirectory()) {
    const files = collectMd(abs)
    const results = []
    const agg = []
    for (const f of files) {
      const sub = await validateOne(f, vaultRoot, rulesSel)
      results.push(sub)
      for (const x of sub.findings) agg.push({ file: sub.file, ...x })
    }
    return { file: abs, findings: agg, verdict: verdictOf(agg), results }
  }
  return validateOne(abs, vaultRoot, rulesSel)
}

const collectMd = (dir) => {
  const out = []
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && e.name.endsWith('.md')) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

/** 单文件校验：realpathGuard 围栏内读 → 按范围判定 → 六规则（顺序稳定） */
async function validateOne(abs, vaultRoot, rulesSel) {
  const find = []
  if (vaultRoot === null) {
    // 无 vault 上下文：仅 ⑥ 证据清单可判定（文件名/正文自含）
    const r = readUtf8(abs)
    if (!r.ok) return { file: abs, findings: [finding('io', 'error', `目标不可读：${r.error?.code ?? r.error?.message}`)], verdict: 'fail' }
    const fm = parseFrontmatter(r.text)
    const stem = path.basename(abs, '.md')
    if (rulesSel.includes('evidence') && isEvidenceDoc(stem, fm)) find.push(...checkEvidence(fm?.body ?? r.text))
    return { file: abs, findings: find, verdict: verdictOf(find) }
  }

  const rel = path.relative(vaultRoot, abs)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { file: abs, findings: [finding('io', 'error', `目标不在 vaultRoot 围栏内：${abs}`)], verdict: 'fail' }
  }
  const relPosix = rel.split(path.sep).join('/')
  // 读侧围栏四步（fs-safe.realpathGuard）：拒 symlink 逃逸/越界，读文件本身不再旁逸
  const guard = realpathGuard(vaultRoot, relPosix)
  if (!guard.ok) {
    return { file: abs, findings: [finding('io', 'error', `realpathGuard 拒绝读取（${guard.reason}）：${relPosix}`)], verdict: 'fail' }
  }
  const r = readUtf8(abs)
  if (!r.ok) return { file: abs, findings: [finding('io', 'error', `目标不可读：${r.error?.code ?? r.error?.message}`)], verdict: 'fail' }

  const fm = parseFrontmatter(r.text)
  const stem = path.basename(abs, '.md')
  const isInfra = INFRA_STEMS.has(stem)
  const wikiRel = relPosix.startsWith('wiki/') ? relPosix.slice('wiki/'.length) : null
  const segs = wikiRel === null ? [] : wikiRel.split('/')
  const top = segs.length > 1 ? segs[0] : '' // 根层页无目录段：''（内容检查仍适用，放置检查另判）
  const isSolutions = top === 'solutions'
  const isProject = top === 'projects'

  for (const rule of rulesSel) {
    if (rule === 'frontmatter') {
      if (wikiRel !== null && !isInfra && top !== 'reference') {
        find.push(...checkFrontmatter(fm, { stem, isSolutions, isProject }))
      }
    } else if (rule === 'naming') {
      if (wikiRel !== null && !isInfra) {
        find.push(...checkNaming(stem), ...checkNamingForm(stem, top))
      }
    } else if (rule === 'placement') {
      if (wikiRel !== null) find.push(...checkPlacement(wikiRel, stem))
    } else if (rule === 'structure') {
      if (wikiRel !== null && !isInfra && STRUCTURE_TOPS.has(top)) find.push(...checkStructure(fm?.body ?? r.text))
    } else if (rule === 'evidence') {
      if (!isInfra && isEvidenceDoc(stem, fm)) find.push(...checkEvidence(fm?.body ?? r.text))
    } else if (rule === 'index') {
      // INDEX.md 自身走后向死链检查（infra 豁免面不挡它）；其余非 infra 页查漏登
      if (wikiRel !== null && (wikiRel === 'INDEX.md' || !isInfra)) find.push(...checkIndex(abs, vaultRoot, wikiRel, stem))
    }
  }
  return { file: abs, findings: find, verdict: verdictOf(find) }
}

/** ⑥ 判定面（收窄）：文件名/标题/frontmatter type 含「调研|盘点|摘要」 */
const isEvidenceDoc = (stem, fm) => {
  const title = fm?.fields.get('title')?.value ?? ''
  const type = fm?.fields.get('type')?.value ?? ''
  return EVIDENCE_MARKER.test(stem) || EVIDENCE_MARKER.test(title) || EVIDENCE_MARKER.test(type)
}

/** ② INDEX 双向：非 INDEX 页查漏登；wiki/INDEX.md 查死链（带行号） */
function checkIndex(abs, vaultRoot, wikiRel, stem) {
  const idx = loadIndex(vaultRoot)
  if (!idx.exists) {
    return [finding('index', 'error', 'wiki/INDEX.md 不存在/不可读：无法核对登记（漏登）')]
  }
  if (wikiRel === 'INDEX.md') {
    const out = []
    for (const { target, line } of idx.links) {
      const g = realpathGuard(vaultRoot, `wiki/${target}.md`)
      if (!g.ok || !g.exists) {
        out.push(finding('index', 'error', `INDEX 死链：[[${target}]] 指向的页面不存在`, line))
      }
    }
    return out
  }
  const relNoExt = wikiRel.replace(/\.md$/, '')
  if (idx.targets.has(relNoExt) || idx.targets.has(stem)) return []
  return [finding('index', 'error', `页面未登记 wiki/INDEX.md（漏登）：${wikiRel}`)]
}

/**
 * 快检缝（T14 pre-execute 消费）：**秒级子集**，不跑全量六规则。
 * 只查 ①六字段形态 + ③命名（硬禁止+形态）+ ④放置禁令——纯内容/路径判定，零 INDEX/结构/证据扫描。
 * raw/ 侧路径不套 wiki 维护指引（捕获/回写落盘不得被误拦）。
 * @param {string} filePath 目标路径
 * @param {string} [content] 已知内容（pre-execute 提供则零 IO）；缺省真读盘
 * @returns {Promise<{ok: boolean, reasons: string[]}>}
 */
export async function quickCheck(filePath, content, opts = {}) {
  const abs = path.resolve(filePath)
  const reasons = []
  let text = content
  if (text === undefined) {
    const r = readUtf8(abs)
    if (!r.ok) return { ok: false, reasons: [`[io] 目标不可读：${r.error?.code ?? r.error?.message}`] }
    text = r.text
  }
  const vaultRoot = opts.vaultRoot ? path.resolve(opts.vaultRoot) : findVaultRoot(path.dirname(abs))
  const rel = vaultRoot === null ? null : path.relative(vaultRoot, abs).split(path.sep).join('/')
  if (rel === null || rel.startsWith('..')) return { ok: true, reasons: [] } // vault 外/raw 侧：不套 wiki 维护指引
  const wikiRel = rel.startsWith('wiki/') ? rel.slice('wiki/'.length) : null
  if (wikiRel === null) return { ok: true, reasons: [] }

  const stem = path.basename(abs, '.md')
  const isInfra = INFRA_STEMS.has(stem)
  const segs = wikiRel.split('/')
  const top = segs.length > 1 ? segs[0] : ''
  const fm = parseFrontmatter(text)
  if (!isInfra && top !== 'reference') {
    for (const f of checkFrontmatter(fm, { stem, isSolutions: top === 'solutions', isProject: top === 'projects' })) {
      reasons.push(`[${f.rule}] ${f.message}`)
    }
  }
  if (!isInfra) {
    for (const f of checkNaming(stem)) reasons.push(`[${f.rule}] ${f.message}`)
    for (const f of checkNamingForm(stem, top)) reasons.push(`[${f.rule}] ${f.message}`)
  }
  for (const f of checkPlacement(wikiRel, stem)) reasons.push(`[${f.rule}] ${f.message}`)
  return { ok: reasons.length === 0, reasons }
}
