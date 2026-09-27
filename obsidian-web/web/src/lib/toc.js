// toc — TOC 面板纯函数（组件零逻辑）：render 结果 → 面板模型 → 嵌套树。
// 服务端（lib/render.js）已生成 heading id；此处只做展示夹取/过滤/去重，零第二套 markdown 解析（ARC-1）。

function clampLevel(level) {
  const n = Number.parseInt(level, 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(6, Math.max(1, n))
}

/** {html, toc} → [{id, text, level, indent}]：滤空文本、夹取 level、id 去重（保留先者） */
export function extractToc(rendered) {
  const toc = rendered?.toc
  if (!Array.isArray(toc)) return []
  const seen = new Set()
  const items = []
  for (const t of toc) {
    if (!t || typeof t !== 'object') continue
    const id = typeof t.id === 'string' ? t.id : ''
    const text = typeof t.text === 'string' ? t.text.trim() : ''
    if (!id || !text || seen.has(id)) continue
    seen.add(id)
    const level = clampLevel(t.level)
    items.push({ id, text, level, indent: level - 1 })
  }
  return items
}

/** 扁平 TOC → 嵌套树（children 逐级挂载；level 回退即挂上级） */
export function buildTocTree(items) {
  const roots = []
  const stack = []
  for (const item of Array.isArray(items) ? items : []) {
    const node = { ...item, children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}
