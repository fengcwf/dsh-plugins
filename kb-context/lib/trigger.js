// trigger — kb-context 触发判定（T4）：词面窄表 ∪ 索引实体双通道，仅 source.kind==='user'。
// 职责边界：只做「触发判定 + 检索词切取（trigger 剥离）」；检索归 lib/search.js（T3），注入归 lib/inject.js（T5）。
// ⚠️ per-call 读当前 config（T1 验收语义）：每次调用对**当前** raw 值 Config.safeParse——禁启动时冻结捕获；
//   词表/实体表热改后下一次调用即生效（US-4，测试锚定「改配置后下一次调用生效」）。
// ⚠️ recall-loop 防护（INV-3）：触发源仅 source.kind==='user'——plugin 注入消息（kb-context 自己的
//   <kb-context> 文本里全是触发词）/system 一律不触发；source 过滤在任何配置读取之前短路。
// ⚠️ 表语义（Q1 裁决 × T1 schema 默认 [] 的调和）：非空有效表=全量替换；空/缺省/空串脏表=出厂默认——
//   否则出厂配置 words:[] 会让插件永不触发（裁决要求默认窄表生效）。整体关闭单通道暂不支持（拔插件行）。
import { Config } from './index.js'

/** 词面窄表出厂默认（conversation Q1 裁决 2026-09-23：{wiki, obsidian, 索引目录, wiki索引, obsidian索引}） */
export const DEFAULT_TRIGGER_WORDS = ['wiki', 'obsidian', '索引目录', 'wiki索引', 'obsidian索引']

/** 索引实体出厂默认（delta-spec §2 示例：真实路径前缀/文件名——INDEX.md / hot.md） */
export const DEFAULT_ENTITY_PATHS = ['INDEX.md', 'hot.md']

// 匹配边界：标识符内嵌词不触发（kiwiki / xobsidianx / myhot.md 贴字）
const IDENT = 'A-Za-z0-9_'
// 切除边界（比匹配更保守）：路径/标识符内不切（wiki/INDEX.md、foo-wiki-bar 防切碎检索目标）
const CUT_GUARD = 'A-Za-z0-9_./-'
const CUT_GUARD_RE = new RegExp(`[${CUT_GUARD}]`, 'u')

// ⚠️ 全局正则一律现场构造（禁模块级共享 /g 常量）：matchAll 虽克隆、replace 会复位 lastIndex，
//   但共享实例是经典隐性状态 bug 类——此处直接消类。
const wikilinkRe = () => /\[\[([^\[\]]+)\]\]/g
// @ 引用：@ 前贴字是邮箱（foo@bar.com）不识别；token 到空白为止（贴 CJK 由前缀对齐兜住）
const atRefRe = () => /(?<![A-Za-z0-9_])@([^\s@]+)/gu

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 引用名归一（匹配用）：剥 @ 与 [[]]、./ 前缀、.md 后缀、别名/锚点，统一分隔符与大小写 */
function normRef(x) {
  let s = String(x ?? '').trim().replace(/\\/g, '/')
  s = s.split('|')[0].split('#')[0].trim()
  s = s.replace(/^\[\[/, '').replace(/\]\]$/, '')
  s = s.replace(/^\.\//, '').replace(/\/+$/, '')
  s = s.replace(/\.md$/i, '')
  return s.toLowerCase()
}

/**
 * 实体名对齐（索引实体 = entityPaths 的真实路径前缀/文件名）：
 * 全等 / 条目是候选的尾段（wiki/INDEX.md ↔ INDEX.md）/ 候选是条目的尾段（[[hot]] ↔ hot.md 的 stem 对齐）
 * / 候选在条目前缀之下（01-客户资料 ↔ 01-客户资料/合同.md）。
 */
function matchEntityName(name, entry) {
  const n = normRef(name)
  const e = normRef(entry)
  if (!n || !e) return false
  return n === e || n.endsWith(`/${e}`) || e.endsWith(`/${n}`) || n.startsWith(`${e}/`)
}

function basename(p) {
  return String(p).replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
}

/** 表语义：非空有效表=全量替换；空/缺省/空串脏表=出厂默认 */
function pickList(list, fallback) {
  if (!Array.isArray(list)) return fallback
  const cleaned = list.filter((s) => typeof s === 'string' && s.trim() !== '')
  return cleaned.length > 0 ? cleaned : fallback
}

/** 消息文本抽取：字符串 content 容忍；text 部件拼接，非 text 部件忽略 */
function messageText(message) {
  const c = message?.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n')
}

/** 引用 token 尾部句读剥离（@hot.md，在哪 → hot.md） */
function stripTrailPunct(s) {
  return String(s).replace(/[)\]}>"'，。、！？；：,.!?;:]+$/u, '')
}

/** 词面匹配/切除正则：交替支最长优先（obsidian索引 整体压过 obsidian），大小写不敏感 */
function wordsRegex(words, guardClass) {
  const alt = [...words].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
  return new RegExp(`(?<![${guardClass}])(?:${alt})(?![${guardClass}])`, 'giu')
}

/**
 * 触发元素收集（文本序去重后排序）：词面命中 + 实体三形态候选。
 * 实体三形态：①裸路径/文件名字面（条目与其 basename，含 @hot.md 引用字面）②wikilink 目标（stem/前缀对齐）
 * ③@ 引用 token 最长前缀对齐（@hot 这类无 .md stem 引用、@hot.md的更新 贴 CJK 不断词）。
 */
function collectElements(text, words, entities) {
  const elements = []
  const push = (idx, name, kind) => { if (name) elements.push({ idx, name, kind }) }
  const hit = (name) => entities.some((e) => matchEntityName(name, e))

  if (words.length > 0) {
    for (const m of text.matchAll(wordsRegex(words, IDENT))) push(m.index, m[0], 'word')
  }
  for (const m of text.matchAll(wikilinkRe())) {
    const target = m[1].split('|')[0].split('#')[0].trim()
    if (hit(target)) push(m.index, target, 'entity')
  }
  for (const e of entities) {
    for (const p of new Set([e, basename(e)])) {
      if (!p) continue
      for (const m of text.matchAll(new RegExp(`(?<![${IDENT}])${escapeRe(p)}(?![${IDENT}])`, 'giu'))) {
        push(m.index, m[0], 'entity')
      }
    }
  }
  for (const m of text.matchAll(atRefRe())) {
    const token = stripTrailPunct(m[1])
    // 最长前缀对齐（'hotel' 不会以 'hot' 误命中：前缀后贴标识符/路径字符即弃）
    for (let len = token.length; len >= 1; len--) {
      const next = token[len]
      if (next !== undefined && CUT_GUARD_RE.test(next)) continue
      const cand = token.slice(0, len)
      if (hit(cand)) {
        push(m.index + 1, cand, 'entity')
        break
      }
    }
  }

  const seen = new Set()
  return elements
    .filter((el) => {
      const k = `${el.idx}:${el.name}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a.idx - b.idx || b.name.length - a.name.length || (a.kind === 'entity' ? -1 : 1))
}

/**
 * 判定 + 检索词切取。
 * query 切法（trigger 剥离）：@引用/wikilink 剥装饰留目标名（目标=检索对象，保留）→ 词面触发词切除
 * （最长优先、路径/标识符内不切）→ 空白折叠；切空回退首个命中触发元素名（文本序）——去重键/检索输入非空。
 */
function decide(text, words, entities) {
  const miss = { matched: false, query: '' }
  if (text.trim() === '') return miss
  const elements = collectElements(text, words, entities)
  const hasWord = elements.some((e) => e.kind === 'word')
  const hasEntity = elements.some((e) => e.kind === 'entity')
  if (!hasWord && !hasEntity) return miss

  let q = text
    .replace(wikilinkRe(), (_, inner) => inner.split('|')[0].split('#')[0].trim())
    .replace(atRefRe(), (_, token) => stripTrailPunct(token))
  if (words.length > 0) q = q.replace(wordsRegex(words, CUT_GUARD), '')
  q = q.split(/\s+/).filter(Boolean).join(' ')
  if (q === '') q = elements[0].name
  return { matched: true, query: q, channel: hasWord ? 'words' : 'entity' }
}

/**
 * 触发判定（供 T5 pre-step 注入消费）。
 * @param {{content?: Array<{type?: string, text?: string}>|string, source?: {kind?: string}}} message
 *   待判定消息（delta-spec §2 消息形状）；触发源仅 source.kind==='user'（INV-3）。
 * @param {object|() => object} [configSource] 当前 raw 配置（或取当前配置的 getter）——每次调用读当前值。
 * @returns {{matched: boolean, query: string, channel?: 'words'|'entity', degraded?: 'config'}}
 *   未命中恒为 `{matched:false, query:''}`；命中带 `channel`（双通道同文命中时 words 优先，契约①→②判定序）；
 *   `query` = 检索词文本（T5 去重键 + 检索输入）；`degraded:'config'` = 本次 Config.safeParse 失败、
 *   fail-open 回退默认表的留痕（INV-15 禁静默）。
 */
export function matchTrigger(message, configSource) {
  // ① source 过滤最先：recall-loop 防护不依赖任何配置（INV-3）
  if (message?.source?.kind !== 'user') return { matched: false, query: '' }

  const text = messageText(message)
  // ② per-call 读当前 config：safeParse 当前值，禁启动时冻结捕获（T1 验收语义）
  const raw = typeof configSource === 'function' ? configSource() : configSource
  const parsed = Config.safeParse(raw)
  let words
  let entities
  let degraded = null
  if (parsed.success) {
    words = pickList(parsed.data.triggers.words, DEFAULT_TRIGGER_WORDS)
    entities = pickList(parsed.data.triggers.entityPaths, DEFAULT_ENTITY_PATHS)
  } else {
    words = pickList(raw?.triggers?.words, DEFAULT_TRIGGER_WORDS)
    entities = pickList(raw?.triggers?.entityPaths, DEFAULT_ENTITY_PATHS)
    degraded = 'config'
  }

  const out = decide(text, words, entities)
  if (degraded !== null) out.degraded = degraded
  return out
}
