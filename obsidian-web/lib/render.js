// render — live 渲染管线（笔记渲染唯一源，OW-INV-6 消毒面）
// T4 unified 管线归位（2026-09-26 白名单裁定续：渲染管线族 remark/unified/rehype/micromark
// 及必要插件=显式白名单运行时依赖；ARC-1 精神=唯一源非自研）——去 T2 最小解析器限期停站。
// 出口形状 {html, toc} 不变（T2 回归网 test/render.test.mjs 零改动，字节级实体口径同锁）。
// 管线顺序（顺序敏感，历史坑都在注释里）：
//   remark-parse → frontmatter（YAML 不进渲染面）→ gfm（表格/脚注/任务清单/删除线）
//   → flavor（wikilink/embed 链接卡 + raw HTML→文本=转义原始 HTML）
//   → breaks（软换行→<br>，Obsidian 断行语义）
//   → heading toc（id 服务端 slugify+去重——历史坑：id 必须服务端生成；toc 形 {id,text,level} 锁定）
//   → remark-rehype（link/image 句柄=URL 白名单 safeHref；clobberPrefix ''）
//   → 形状归一（blockquote/li 内 <p> 解包、pre[data-lang]>code——T2 字节形）
//   → rehype-sanitize 白名单消毒层（OW-INV-6 第二道：标签+属性+协议白名单，raw 节点剥除）
//   → 实体口径占位回填（&gt; &quot; &#39;——escapeHtml 字节口径，search snippet 门同款）
//   → 事件属性中和（on*= 的 = 出实体，防属性注入字面漏出）
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkRehype from 'remark-rehype'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { remarkObsidianFlavor, plainTextOf, obLinkHandler, obImageHandler } from './render-flavor.js'

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

// ── 实体口径占位（hast-util-to-html 文本子集硬编码 ['<','&']——源码实测 textEntitySubset；
//    '>' '\"' \"'\" 会裸出，与 escapeHtml 口径不符。输入端已 strip 控制符，占位零碰撞）────────
const MASK = { '>': '\u0001', '"': '\u0002', "'": '\u0003' }
const UNMASK = { '\u0001': '&gt;', '\u0002': '&quot;', '\u0003': '&#39;' }
const maskValue = (s) => s.replace(/[>"']/g, (c) => MASK[c])
const unmaskHtml = (html) => html.replace(/[\u0001\u0002\u0003]/g, (c) => UNMASK[c])

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

// ── heading toc（mdast 级：id 落 hProperties，toc 形 {id,text,level} 锁定）────────
function remarkHeadingToc(toc) {
  return function headingTocAttacher() {
    return (tree) => {
      const seen = new Map()
      const walk = (node) => {
        if (node.type === 'heading') {
          const text = plainTextOf(node)
          const id = uniqueSlug(slugify(text), seen)
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
          toc.push({ id, text, level: node.depth })
        }
        for (const child of node.children ?? []) walk(child)
      }
      walk(tree)
    }
  }
}

// ── 形状归一（hast 级，T2 字节形）────────────────────────────────────────────────
/** blockquote/li 内 <p> 解包为行内流（T2 形：引文/列表项零 <p> 包裹）；段落间以 <br><br> 续 */
function unwrapParas(children) {
  const out = []
  let paras = 0
  for (const child of children) {
    if (child.type === 'element' && child.tagName === 'p') {
      if (paras > 0) {
        out.push({ type: 'element', tagName: 'br', properties: {}, children: [] })
        out.push({ type: 'element', tagName: 'br', properties: {}, children: [] })
      }
      paras += 1
      out.push(...child.children)
    } else {
      out.push(child)
    }
  }
  return out
}

/** 代码块出 T2 形：<pre data-lang="lang"><code>（lang 从 language-* 类名归位，code 零属性） */
function normalizePre(el) {
  const code = el.children.find((c) => c.type === 'element' && c.tagName === 'code')
  if (!code) return
  const cls = code.properties?.className
  const item = Array.isArray(cls) ? cls.find((x) => String(x).startsWith('language-')) : undefined
  el.properties = { 'data-lang': item === undefined ? '' : String(item).slice('language-'.length) }
  code.properties = {}
}

function rehypeNormalizeShape() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element') {
        if (node.tagName === 'blockquote' || node.tagName === 'li') node.children = unwrapParas(node.children)
        if (node.tagName === 'pre') normalizePre(node)
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}

/** 实体口径占位（序列化前）：文本值与属性值里 > \" ' 换占位（控制符），序列化后回填规范实体 */
function rehypeEntityPlaceholders() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'text') node.value = maskValue(node.value)
      if (node.properties) {
        for (const [key, value] of Object.entries(node.properties)) {
          if (typeof value === 'string') node.properties[key] = maskValue(value)
          else if (Array.isArray(value)) node.properties[key] = value.map((v) => (typeof v === 'string' ? maskValue(v) : v))
        }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}

// ── 消毒层（OW-INV-6 第二道：rehype-sanitize 白名单——标签/属性/协议，raw 剥除）────────
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  clobberPrefix: '', // id 服务端 slug 生成（字符集受控），保留字节形 id="hello-world"
  tagNames: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'em', 'strong', 'del', 'hr', 'br', 'a', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'sup', 'sub', 'section', 'input',
  ],
  attributes: {
    '*': ['id'],
    a: ['className', 'href', 'data-target', 'dataTarget', 'data-footnote-ref', 'dataFootnoteRef', 'data-footnote-backref', 'dataFootnoteBackref', 'ariaDescribedBy', 'ariaLabel'],
    span: ['className', 'data-target', 'dataTarget'],
    pre: ['data-lang', 'dataLang'],
    ul: ['className'],
    ol: ['start', 'type'], // 有序列表起始编号/编号形（CommonMark 合法形；fix#1：曾被白名单剥掉静默丢号）
    li: ['id', 'className'],
    section: ['className', 'data-footnotes', 'dataFootnotes'],
    h2: ['id', 'className'],
    th: ['align'],
    td: ['align'],
    input: [['type', 'checkbox'], ['disabled', true], 'checked'],
  },
  protocols: { href: ['http', 'https', 'mailto'] },
}

function buildProcessor(toc) {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkObsidianFlavor)
    .use(remarkBreaks)
    .use(remarkHeadingToc(toc))
    .use(remarkRehype, {
      clobberPrefix: '',
      handlers: { link: obLinkHandler, image: obImageHandler },
    })
    .use(rehypeNormalizeShape)
    .use(rehypeSanitize, SANITIZE_SCHEMA)
    .use(rehypeEntityPlaceholders)
    .use(rehypeStringify, { characterReferences: { useNamedReferences: true } })
}

/**
 * markdown → 受控 HTML + TOC（唯一渲染源出口，形不变）
 * @returns {{html: string, toc: Array<{id: string, text: string, level: number}>}}
 */
export function renderMarkdown(markdown) {
  const source = typeof markdown === 'string' ? markdown.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '') : ''
  const toc = []
  const processor = buildProcessor(toc)
  const mdast = processor.parse(source)
  const hast = processor.runSync(mdast)
  const html = unmaskHtml(String(processor.stringify(hast)))
  return { html: neutralizeEventAttrs(html), toc }
}
