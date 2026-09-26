// render-inline — 行内级解析（render.js 的唯一行内实现，ARC-1 唯一渲染源内部件）
// 管线顺序（占位符保护是关键，历史坑）：
//   1) code span 提取（内部零解析、内容转义）
//   2) wikilink/embed 提取 → 3) 图片/链接提取（URL 过 scheme 白名单）
//   4) 剩余全文转义 → 5) 强调（strong/em/del）→ 6) 软换行 → 7) 占位符回填
// 安全面（OW-INV-6 雏形）：用户文本永远经 escapeHtml，raw HTML 零透传；
// URL 检查前先实体解码+去空白（拦 javascript&#58;/java\tscript 变形），非法 scheme 直接不出 href。

const SCHEME_OK = new Set(['http', 'https', 'mailto'])

/** 全实体转义：& < > " ' —— 唯一文本出口，禁止绕过 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fromCodePointSafe(n) {
  return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

/** 最小实体解码（仅用于 scheme 探测，绝不回写输出） */
function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => fromCodePointSafe(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => fromCodePointSafe(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
}

/**
 * URL 白名单消毒（OW-INV-6）：返回原 URL（调用方输出时再转义）或 null（拦掉）。
 * 探测口径：实体解码 + 去全部空白/控制符后取 scheme —— javascript:/data:/vbscript: 一律拒。
 */
export function safeHref(rawUrl) {
  const probe = decodeEntities(rawUrl).replace(/[\s\u0000-\u001f\u007f]/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)
  if (scheme && !SCHEME_OK.has(scheme[1].toLowerCase())) return null
  return String(rawUrl)
}

/** 渲染后 HTML → 展示纯文本（TOC 文本与 slug 单一来源，避免二次解析漂移） */
export function plainFromHtml(html) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#61;/g, '=')
    .replace(/&amp;/g, '&')
}

// 一级嵌套括号 URL：[x](javascript:alert(1)) 这类嵌套必须整体吃掉（漏匹配会把 URL 当正文漏出）
const LINK_RE = /(!?)\[([^\]]*)\]\(((?:[^()]|\([^()]*\))*)\)/g
const CODE_RE = /(`+)([\s\S]*?)\1/g
const WIKI_RE = /(!?)\[\[([^\[\]]+)\]\]/g

/** 行内级 markdown → 受控 HTML（内部无状态，可递归处理链接文本） */
export function renderInline(src) {
  const tokens = []
  const token = (html) => {
    const marker = `\u0000${tokens.length}\u0000`
    tokens.push(html)
    return marker
  }
  let text = String(src ?? '')

  // 1) code span：占位保护，内容原样转义、内部零解析
  text = text.replace(CODE_RE, (_m, _ticks, code) => token(`<code>${escapeHtml(code)}</code>`))

  // 2) wikilink / embed（![[Note]] = 链接卡形态，不渲染画布——TECH.md §3.7 同语义）
  text = text.replace(WIKI_RE, (_m, bang, inner) => {
    const pipe = inner.indexOf('|')
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
    const display = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim()
    const cls = bang ? 'ob-embed' : 'ob-wikilink'
    return token(`<a class="${cls}" data-target="${escapeHtml(target)}" href="#">${escapeHtml(display)}</a>`)
  })

  // 3) 图片/链接：label 递归行内解析，URL 过白名单；拦掉的 URL 不出 href 不漏字面
  text = text.replace(LINK_RE, (_m, bang, label, url) => {
    const href = safeHref(url)
    const inner = renderInline(label)
    if (href === null) return token(`<span class="ob-link-blocked">${inner}</span>`)
    const cls = bang ? 'ob-image-link' : 'ob-link'
    return token(`<a class="${cls}" href="${escapeHtml(href)}">${inner}</a>`)
  })

  // 4) 全文转义（占位符 \u0000N\u0000 不受影响）→ 5) 强调 → 6) 软换行 → 7) 回填
  let out = escapeHtml(text)
  out = out.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+?)\*/g, '<em>$1</em>')
  out = out.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
  out = out.replace(/\n/g, '<br />')
  return out.replace(/\u0000(\d+)\u0000/g, (_m, n) => tokens[Number(n)] ?? '')
}
