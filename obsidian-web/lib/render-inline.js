// render-inline — 实体口径与 URL 消毒（渲染管线与 search 共用的唯一文本出口）
// ARC-1：本文件是「escapeHtml 唯一口径」的实体工具件，不再是 markdown 行内解析器——
//       行内/块级解析全归 unified 管线（lib/render.js + lib/render-flavor.js）。
// 口径（T2 锁定，search.js snippet 门同款）：& < > " ' 全实体化，实体仅限
//       &amp; &lt; &gt; &quot; &#39;（T2 render.test.mjs 字节级断言）。
// 安全面（OW-INV-6）：URL 检查前先实体解码+去空白（拦 javascript&#58;/&#x3a;/&colon;/java\tscript 变形），
//       非法 scheme 一律不出 href（调用方输出时再过 escapeHtml/序列化实体）。

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
 * 覆盖变形向量：&#58;/&#x3a;/&colon; 冒号实体、&#9;/NUL/制表插穿（T4 负例锁形）。
 */
export function safeHref(rawUrl) {
  const probe = decodeEntities(rawUrl).replace(/[\s\u0000-\u001f\u007f]/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)
  if (scheme && !SCHEME_OK.has(scheme[1].toLowerCase())) return null
  return String(rawUrl)
}
