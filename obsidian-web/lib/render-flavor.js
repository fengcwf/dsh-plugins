// render-flavor — Obsidian flavor 语法扩展（TECH.md §2 裁定：自研 flavor 插件=语法扩展，非 regex 渲染器）
// 承载（ARC-1：解析/渲染全走 unified 管线，本文件只做 mdast 变换与 hast 句柄定制，零自研解析循环）：
//   1) wikilink/embed 文本拆分 → 链接卡 link 节点（data-target + ob-wikilink/ob-embed，不渲染画布）
//   2) raw HTML 节点 → 文本（OW-INV-6「转义原始 HTML」：可见为转义文本，零透传零消隐；
//      块级语境包 paragraph 保持 T2 可见形状）
//   3) link/image URL 白名单（safeHref 同 search 口径）：拦 → span.ob-link-blocked 且 URL 字面不漏；
//      autolink（label===url）标签一并压制；image 出 <a class="ob-image-link">（T2 形：不渲染画布）
import { safeHref } from './render-inline.js'

const WIKI_RE = /(!?)\[\[([^\[\]]+)\]\]/g

/** 块级语境（html 节点在此类父级下需包 paragraph，其余为行内语境直接转文本） */
const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition'])

/** 文本节点 → 文本 + wikilink 链接卡节点序列 */
function splitWikilinks(value) {
  const out = []
  let last = 0
  for (const m of value.matchAll(WIKI_RE)) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    const inner = m[2]
    const pipe = inner.indexOf('|')
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
    const display = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim()
    out.push({
      type: 'link',
      url: '#',
      title: null,
      children: [{ type: 'text', value: display }],
      data: { hProperties: { className: [m[1] ? 'ob-embed' : 'ob-wikilink'], 'data-target': target } },
    })
    last = m.index + m[0].length
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

/** mdast 深变换：html→文本 + wikilink 拆分（就地替换 children） */
function walkTransform(node) {
  if (!node.children) return
  const next = []
  for (const child of node.children) {
    if (child.type === 'html') {
      const text = { type: 'text', value: child.value }
      next.push(FLOW_PARENTS.has(node.type) ? { type: 'paragraph', children: [text] } : text)
      continue
    }
    if (child.type === 'text') {
      next.push(...splitWikilinks(child.value))
      continue
    }
    walkTransform(child)
    next.push(child)
  }
  node.children = next
}

/** Obsidian flavor mdast 插件：wikilink/embed + raw HTML 转义面 */
export function remarkObsidianFlavor() {
  return (tree) => walkTransform(tree)
}

/** mdast 节点的展示纯文本（TOC 文本口径：去行内标记、保展示文本） */
export function plainTextOf(node) {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'html') return node.value ?? ''
  if (node.type === 'image') return node.alt ?? ''
  if (node.type === 'break') return ''
  return (node.children ?? []).map(plainTextOf).join('')
}

/** link 句柄：URL 白名单（拦=span 不漏字面）；wikilink 链接卡属性经 hProperties 并入 */
export function obLinkHandler(state, node) {
  const url = node.url ?? ''
  const href = safeHref(url)
  const label = plainTextOf(node)
  if (href === null) {
    // 拦掉的 URL 不出 href 不漏字面（autolink label===url 时标签一并压制）
    const children = label === url ? [] : state.all(node)
    const result = { type: 'element', tagName: 'span', properties: { className: ['ob-link-blocked'] }, children }
    state.patch(node, result)
    return state.applyData(node, result)
  }
  const properties = { href: url, className: ['ob-link'] }
  const result = { type: 'element', tagName: 'a', properties, children: state.all(node) }
  state.patch(node, result)
  return state.applyData(node, result)
}

/** image 句柄：T2 形=链接卡（<a class="ob-image-link">alt</a>，不渲染画布）；拦同 link */
export function obImageHandler(state, node) {
  const url = node.url ?? ''
  const href = safeHref(url)
  const alt = node.alt ?? ''
  if (href === null) {
    const children = alt === url ? [] : [{ type: 'text', value: alt }]
    const result = { type: 'element', tagName: 'span', properties: { className: ['ob-link-blocked'] }, children }
    state.patch(node, result)
    return state.applyData(node, result)
  }
  const result = {
    type: 'element',
    tagName: 'a',
    properties: { href: url, className: ['ob-image-link'] },
    children: [{ type: 'text', value: alt }],
  }
  state.patch(node, result)
  return state.applyData(node, result)
}
