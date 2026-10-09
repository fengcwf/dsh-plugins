// lib/selector.js — 受限 CSS 选择器子集引擎（T7 / INV-16 / K-17）
// 职责：对本地 HTML 字符串做元素匹配，输出元素文本与属性——供自定义源解析（T8）消费。
// 硬约束：
//   1. 零脚本执行能力：无求值、无动态执行；<script>/<style> 内容按原文跳过不解析（INV-16）。
//   2. 受限子集 fail-closed：子集外语法（伪类/伪元素/兄弟组合器/属性运算符等）一律显式抛错拒绝，
//      绝不静默降级为空结果、绝不猜测（K-17）。
//   3. 零第三方依赖（K-8 / P-4）：本文件不引用任何外部模块（含 node 内建），纯字面解析。
//   4. 选择器只用于本地解析：不拼进出网 URL 或请求头（K-17，k-constraints 扫描面把关）。

/** 支持的子集语法清单（错误提示与前端填写引导共用文案源）。 */
export const SUPPORTED_SELECTOR_SYNTAX =
  'tag / .class / #id / [attr] / [attr="value"] / 后代（空格）/ 子代（>）/ 逗号并列'

/** 超集/非法语法统一拒绝错误：code=SELECTOR_UNSUPPORTED（fail-closed，不猜不降级）。 */
function unsupportedSelector(detail) {
  return Object.assign(new Error(`选择器不受支持：${detail}。支持的子集：${SUPPORTED_SELECTOR_SYNTAX}`), {
    code: 'SELECTOR_UNSUPPORTED',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML 解析（容错 tokenizer → 简易元素树）
// ─────────────────────────────────────────────────────────────────────────────

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const RAW_TEXT_TAGS = new Set(['script', 'style'])

/** 解析开标签：返回 { tag, attrs, selfClosing, end }；end 为 '>' 之后的下标。 */
function parseOpenTag(source, start) {
  let i = start + 1
  const nameMatch = /^[a-zA-Z][^\s/>]*/.exec(source.slice(i))
  if (!nameMatch) return null
  const tag = nameMatch[0].toLowerCase()
  i += nameMatch[0].length
  const attrs = {}
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i += 1
    if (i >= source.length) break
    if (source[i] === '>') return { tag, attrs, selfClosing: false, end: i + 1 }
    if (source[i] === '/') {
      i += 1
      if (source[i] === '>') return { tag, attrs, selfClosing: true, end: i + 1 }
      continue
    }
    const attrNameMatch = /^[^\s=/>]+/.exec(source.slice(i))
    if (!attrNameMatch) {
      i += 1
      continue
    }
    const attrName = attrNameMatch[0].toLowerCase()
    i += attrNameMatch[0].length
    while (i < source.length && /\s/.test(source[i])) i += 1
    let value = ''
    if (source[i] === '=') {
      i += 1
      while (i < source.length && /\s/.test(source[i])) i += 1
      const quote = source[i]
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, i + 1)
        value = close < 0 ? source.slice(i + 1) : source.slice(i + 1, close)
        i = close < 0 ? source.length : close + 1
      } else {
        const bareMatch = /^[^\s>]*/.exec(source.slice(i))
        value = bareMatch[0].replace(/\/$/, '')
        i += bareMatch[0].length
      }
    }
    if (!(attrName in attrs)) attrs[attrName] = value
  }
  return { tag, attrs, selfClosing: false, end: source.length }
}

/**
 * HTML 字符串 → 元素树。容错（真实 SERP HTML 不保证规整），永不因 HTML 形态抛错。
 * 元素节点 = { tag, attrs, children, parent }；文本节点 = { text }。
 */
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null }
  const stack = [root]
  const source = String(html)
  let i = 0
  const pushText = (raw) => {
    if (raw.length === 0) return
    stack[stack.length - 1].children.push({ text: raw })
  }
  while (i < source.length) {
    const lt = source.indexOf('<', i)
    if (lt < 0) {
      pushText(source.slice(i))
      break
    }
    if (lt > i) pushText(source.slice(i, lt))
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      i = end < 0 ? source.length : end + 3
      continue
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt)
      i = end < 0 ? source.length : end + 1
      continue
    }
    if (source.startsWith('</', lt)) {
      const end = source.indexOf('>', lt)
      const name = source
        .slice(lt + 2, end < 0 ? source.length : end)
        .trim()
        .toLowerCase()
        .split(/[\s>]/)[0]
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].tag === name) {
          stack.length = depth
          break
        }
      }
      i = end < 0 ? source.length : end + 1
      continue
    }
    const opened = parseOpenTag(source, lt)
    if (!opened) {
      pushText('<')
      i = lt + 1
      continue
    }
    if (RAW_TEXT_TAGS.has(opened.tag)) {
      // script/style 整体跳过：不建节点、不解析内容（INV-16 零脚本面：不可匹配、不可达求值路径）
      const closeRe = new RegExp(`</\\s*${opened.tag}\\s*>`, 'i')
      const rest = source.slice(opened.end)
      const close = closeRe.exec(rest)
      i = close ? opened.end + close.index + close[0].length : source.length
      continue
    }
    const node = { tag: opened.tag, attrs: opened.attrs, children: [], parent: stack[stack.length - 1] }
    node.parent.children.push(node)
    i = opened.end
    if (opened.selfClosing || VOID_TAGS.has(opened.tag)) continue
    stack.push(node)
  }
  return root
}

/** 树内元素按文档序展平。 */
function collectElements(node, out = []) {
  for (const child of node.children) {
    if (child.tag) {
      out.push(child)
      collectElements(child, out)
    }
  }
  return out
}

/** 命名实体 + 数字实体解码（与 sources/common.js 同口径，码点护栏同形；本文件自包含零引用）。 */
function decodeEntities(text) {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ', '&#39;': "'" }
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const codePoint = Number.parseInt(hex, 16)
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match
      return String.fromCodePoint(codePoint)
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const codePoint = Number(dec)
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match
      return String.fromCodePoint(codePoint)
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (match, named1) => named[match] ?? match)
}

/** 子树文本节点原样拼接（不做中间 trim，避免相邻元素文本被粘连/吞空格）。 */
function collectRawText(node, out) {
  for (const child of node.children) {
    if (child.tag) collectRawText(child, out)
    else out.push(child.text)
  }
}

/** 子树可见文本：拼接文本节点 → 实体解码 → 空白折叠 trim。 */
function elementText(node) {
  const pieces = []
  collectRawText(node, pieces)
  return decodeEntities(pieces.join('')).replace(/\s+/g, ' ').trim()
}

/** 子树原始内层 HTML（供上层做二次局部匹配的输入面）。 */
function elementInner(node) {
  return node.children.map((child) => (child.tag ? serializeNode(child) : child.text)).join('')
}

function serializeNode(node) {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${value}"`))
    .join('')
  return `<${node.tag}${attrs}>${elementInner(node)}</${node.tag}>`
}

// ─────────────────────────────────────────────────────────────────────────────
// 选择器解析（受限子集，超集即抛）
// ─────────────────────────────────────────────────────────────────────────────

const IDENT = '-?[_a-zA-Z][_a-zA-Z0-9-]*'
const IDENT_RE = new RegExp(`^${IDENT}`)

/** 按顶层逗号拆分（引号与方括号内逗号不拆）。 */
function splitGroups(selector) {
  const groups = []
  let current = ''
  let bracket = 0
  let quote = null
  for (const ch of selector) {
    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '[') bracket += 1
    if (ch === ']') bracket -= 1
    if (ch === ',' && bracket === 0) {
      groups.push(current)
      current = ''
      continue
    }
    current += ch
  }
  groups.push(current)
  return groups
}

/** 解析单个复合选择器（tag/.class/#id/[attr...]，无组合器）。 */
function parseCompound(text) {
  const compound = { tag: null, id: null, classes: [], attrs: [] }
  let rest = text
  const tagMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(rest)
  if (tagMatch) {
    compound.tag = tagMatch[0].toLowerCase()
    rest = rest.slice(tagMatch[0].length)
  }
  while (rest.length > 0) {
    const marker = rest[0]
    if (marker === '#' || marker === '.') {
      const nameMatch = IDENT_RE.exec(rest.slice(1))
      if (!nameMatch) throw unsupportedSelector(`标识符非法：${text}`)
      if (marker === '#') {
        if (compound.id !== null) throw unsupportedSelector(`多个 #id：${text}`)
        compound.id = nameMatch[0]
      } else {
        compound.classes.push(nameMatch[0])
      }
      rest = rest.slice(1 + nameMatch[0].length)
      continue
    }
    if (marker === '[') {
      const close = rest.indexOf(']')
      if (close < 0) throw unsupportedSelector(`方括号未闭合：${text}`)
      const inner = rest.slice(1, close)
      rest = rest.slice(close + 1)
      const eq = inner.indexOf('=')
      if (eq < 0) {
        const name = inner.trim().toLowerCase()
        if (!/^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(name)) throw unsupportedSelector(`属性名非法：${text}`)
        compound.attrs.push({ name, op: 'presence', value: null })
        continue
      }
      const name = inner.slice(0, eq).trim().toLowerCase()
      const rawValue = inner.slice(eq + 1).trim()
      if (!/^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(name)) throw unsupportedSelector(`属性名非法：${text}`)
      let value = rawValue
      if ((rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) || (rawValue.startsWith("'") && rawValue.endsWith("'") && rawValue.length >= 2)) {
        value = rawValue.slice(1, -1)
      } else if (rawValue === '' || /[\s\]"'^$*|~]/.test(rawValue)) {
        throw unsupportedSelector(`属性运算符或取值不受支持（只支持 [attr] 与 [attr="value"]）：${text}`)
      }
      compound.attrs.push({ name, op: 'exact', value })
      continue
    }
    if (marker === ':') throw unsupportedSelector(`伪类/伪元素不支持：${text}`)
    if (marker === '*') throw unsupportedSelector(`通配 * 不支持：${text}`)
    throw unsupportedSelector(`无法解析的片段：${rest}`)
  }
  return compound
}

/** 把单组选择器切成 [{ compound, combinatorToNext }] 序列；组合器只许空格（后代）与 >（子代）。 */
function parseChain(text) {
  const trimmed = text.trim()
  if (trimmed === '') throw unsupportedSelector('空选择器')
  // 第一步：切成 compound 文本与组合器片段（引号/方括号内不动；+ ~ 显式拒）
  const parts = []
  let buf = ''
  let bracket = 0
  let quote = null
  let pendingDescendant = false
  const pushBuffer = () => {
    if (buf !== '') {
      parts.push({ type: 'compound', text: buf })
      buf = ''
    }
  }
  for (const ch of trimmed) {
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '[') bracket += 1
    if (ch === ']') bracket -= 1
    if (bracket === 0 && (ch === '+' || ch === '~')) {
      throw unsupportedSelector(`兄弟组合器（${ch}）不支持，只支持空格（后代）与 >（子代）`)
    }
    if (bracket === 0 && ch === '>') {
      pushBuffer()
      pendingDescendant = false
      parts.push({ type: 'combinator', value: 'child' })
      continue
    }
    if (bracket === 0 && /\s/.test(ch)) {
      if (buf !== '') pendingDescendant = true
      pushBuffer()
      continue
    }
    if (pendingDescendant && parts.length > 0 && parts[parts.length - 1].type === 'compound') {
      parts.push({ type: 'combinator', value: 'descendant' })
    }
    pendingDescendant = false
    buf += ch
  }
  pushBuffer()
  // 第二步：compound / combinator 必须严格交替且以 compound 开头收尾
  if (parts.length === 0) throw unsupportedSelector('空选择器')
  if (parts.length % 2 === 0) throw unsupportedSelector(`组合器收尾（悬空组合器）：${trimmed}`)
  const chain = []
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    const expectCompound = index % 2 === 0
    if (part.type !== (expectCompound ? 'compound' : 'combinator')) {
      throw unsupportedSelector(`组合器位置非法（连续/打头/收尾均不支持）：${trimmed}`)
    }
    if (expectCompound) {
      chain.push({ compound: parseCompound(part.text), combinatorToNext: null })
    } else {
      chain[chain.length - 1].combinatorToNext = part.value
    }
  }
  return chain
}

/**
 * 解析选择器为链组：[[{combinator, compound}]]。
 * @throws {Error} code=SELECTOR_UNSUPPORTED —— 超集/非法语法 fail-closed 显式拒绝。
 */
export function parseSelector(selector) {
  if (typeof selector !== 'string') throw unsupportedSelector('选择器必须是字符串')
  const trimmed = selector.trim()
  if (trimmed === '') throw unsupportedSelector('空选择器')
  return splitGroups(trimmed).map(parseChain)
}

/**
 * 选择器校验（不抛形，供 schema refine 与前端填写引导用）。
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateSelector(selector) {
  try {
    parseSelector(selector)
    return { ok: true, errors: [] }
  } catch (error) {
    return { ok: false, errors: [error && error.message ? error.message : '选择器不受支持'] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 匹配
// ─────────────────────────────────────────────────────────────────────────────

function matchesCompound(element, compound) {
  if (compound.tag !== null && element.tag !== compound.tag) return false
  if (compound.id !== null && element.attrs.id !== compound.id) return false
  const classAttr = element.attrs.class ?? ''
  const classList = classAttr.split(/\s+/).filter(Boolean)
  for (const name of compound.classes) {
    if (!classList.includes(name)) return false
  }
  for (const attr of compound.attrs) {
    const value = element.attrs[attr.name]
    if (value === undefined) return false
    if (attr.op === 'exact' && value !== attr.value) return false
  }
  return true
}

function matchesChain(element, chain) {
  if (!matchesCompound(element, chain[chain.length - 1].compound)) return false
  let matchedNode = element
  for (let index = chain.length - 2; index >= 0; index -= 1) {
    const combinator = chain[index].combinatorToNext
    const compound = chain[index].compound
    if (combinator === 'child') {
      const parent = matchedNode.parent
      if (!parent || parent.tag === '#root' || !matchesCompound(parent, compound)) return false
      matchedNode = parent
    } else {
      let walker = matchedNode.parent
      let found = null
      while (walker && walker.tag !== '#root') {
        if (matchesCompound(walker, compound)) {
          found = walker
          break
        }
        walker = walker.parent
      }
      if (!found) return false
      matchedNode = found
    }
  }
  return true
}

/**
 * 在本地 HTML 上执行选择器匹配（INV-16：只做本地解析，绝不触网、绝不求值）。
 * @param {string} html - 本地 HTML 文本。
 * @param {string} selector - 受限子集选择器（超集即抛 SELECTOR_UNSUPPORTED）。
 * @returns {Array<{tag: string, attrs: Record<string,string>, text: string, inner: string}>}
 *   文档序、组间去重（同一元素只出现一次）；无匹配 = 空数组（选择器合法时的正常结果）。
 * @throws {Error} code=SELECTOR_UNSUPPORTED —— 选择器超集/非法（fail-closed，绝不静默返回空数组）。
 */
export function queryAll(html, selector) {
  const groups = parseSelector(selector)
  const elements = collectElements(parseHtml(html))
  const seen = new Set()
  const results = []
  for (const element of elements) {
    if (seen.has(element)) continue
    const matched = groups.some((chain) => matchesChain(element, chain))
    if (!matched) continue
    seen.add(element)
    results.push({ tag: element.tag, attrs: { ...element.attrs }, text: elementText(element), inner: elementInner(element) })
  }
  return results
}
