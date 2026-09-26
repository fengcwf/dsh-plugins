// render — live 渲染管线（笔记渲染唯一源，OW-INV-6 消毒面雏形）
// ARC-1：前端零第二套 markdown 实现/零自研 regex 渲染——web/ 只展示本模块输出的受控 HTML。
// T2 最小版契约（renderMarkdown(md) → {html, toc}）：
//   - 一切用户文本过 escapeHtml；输出只由白名单标签构成，raw HTML 零透传（<script> 注入负例必测）
//   - heading id 服务端 slugify+去重（历史坑：id 必须服务端生成）；toc 形状锁定 {id,text,level}
//   - YAML frontmatter 不进渲染面；wikilink/embed 出 data-target 龙链接卡（不渲染画布）
// ⚠️ 最小面 = T2 停站：块级支持 heading/段落/软换行/列表/引用/围栏代码/hr/强调/链接/wikilink。
//    unified/remark/rehype 管线与 callout/highlight/Excalidraw 等 Obsidian flavor 由 T4+ 归位扩展，
//    出口形状 {html, toc} 保持不变（替换内部实现不破坏前端与分享页契约）。
import { renderInline, escapeHtml, plainFromHtml } from './render-inline.js'

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_RE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/
const QUOTE_RE = /^\s*>/
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

/** 事件型属性串中和（OW-INV-6）：on*= 的 = 出实体，正文与属性值都防属性注入（幂等） */
function neutralizeEventAttrs(html) {
  return html.replace(/\bon[a-z]+\s*=/gi, (m) => `${m.slice(0, -1)}&#61;`)
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** slug 兜底非空 + 同名标题 -1/-2 去重 */
function uniqueSlug(base, seen) {
  const first = base || 'section'
  if (!seen.has(first)) {
    seen.set(first, 1)
    return first
  }
  let n = seen.get(first)
  let candidate
  do {
    candidate = `${first}-${n}`
    n += 1
  } while (seen.has(candidate))
  seen.set(first, n - 1)
  seen.set(candidate, 1)
  return candidate
}

/** YAML frontmatter（首行 --- 且有闭合 ---）整体不进渲染面 */
function stripFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return lines
  for (let j = 1; j < lines.length; j += 1) {
    if (lines[j].trim() === '---') return lines.slice(j + 1)
  }
  return lines
}

function serializeList(list) {
  const tag = list.ordered ? 'ol' : 'ul'
  const items = list.items.map((it) => `<li>${it.inline}${it.subs.map(serializeList).join('')}</li>`).join('')
  return `<${tag}>${items}</${tag}>`
}

/** 缩进栈建嵌套列表（ul/ol/嵌套，li 内零 <p> 包裹） */
function renderList(items) {
  const root = { ordered: items[0].ordered, items: [] }
  const stack = [{ indent: items[0].indent, list: root }]
  for (const it of items) {
    while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) stack.pop()
    const top = stack[stack.length - 1]
    const node = { inline: it.inline, subs: [] }
    if (it.indent > top.indent) {
      const lastItem = top.list.items[top.list.items.length - 1]
      const sub = { ordered: it.ordered, items: [node] }
      lastItem.subs.push(sub)
      stack.push({ indent: it.indent, list: sub })
    } else {
      top.list.items.push(node)
    }
  }
  return serializeList(root)
}

function isBlockStart(line) {
  return HR_RE.test(line) || HEADING_RE.test(line) || FENCE_RE.test(line) || QUOTE_RE.test(line) || LIST_ITEM_RE.test(line)
}

function renderBlocks(lines, toc, seenSlugs) {
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }

    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[1]
      const lang = fence[2] || ''
      const body = []
      i += 1
      while (i < lines.length && lines[i].trim() !== marker) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // 闭合围栏（缺闭合吃到文件尾，不越界）
      out.push(`<pre data-lang="${escapeHtml(lang)}"><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = heading[1].length
      const inner = renderInline(heading[2])
      const text = plainFromHtml(inner)
      const id = uniqueSlug(slugify(text), seenSlugs)
      toc.push({ id, text, level })
      out.push(`<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`)
      i += 1
      continue
    }

    if (HR_RE.test(line)) {
      out.push('<hr />')
      i += 1
      continue
    }

    if (QUOTE_RE.test(line)) {
      const quote = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      out.push(`<blockquote>${renderInline(quote.join('\n'))}</blockquote>`)
      continue
    }

    if (LIST_ITEM_RE.test(line)) {
      const items = []
      while (i < lines.length) {
        const m = LIST_ITEM_RE.exec(lines[i])
        if (!m) break
        items.push({
          indent: m[1].replace(/\t/g, '  ').length,
          ordered: /\d/.test(m[2][0]),
          inline: renderInline(m[3]),
        })
        i += 1
      }
      out.push(renderList(items))
      continue
    }

    const para = []
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    out.push(`<p>${renderInline(para.join('\n'))}</p>`)
  }
  return out.join('\n')
}

/**
 * markdown → 受控 HTML + TOC（唯一渲染源出口）
 * @returns {{html: string, toc: Array<{id: string, text: string, level: number}>}}
 */
export function renderMarkdown(markdown) {
  const source = typeof markdown === 'string' ? markdown.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '') : ''
  const lines = stripFrontMatter(source.split('\n'))
  const toc = []
  const html = renderBlocks(lines, toc, new Map())
  return { html: neutralizeEventAttrs(html), toc }
}
