// tree — 目录树纯函数（组件零逻辑，ARC-6：.vue 只做展示，交互状态全在纯函数）
// wire 形（lib/vault-ops.js listTree）→ 组件模型：key=path、label=name、dir 才有 children。

/** wire nodes → 组件模型 */
export function buildTreeModel(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((n) =>
    n?.type === 'dir'
      ? { key: n.path, label: n.name, type: 'dir', children: buildTreeModel(n.children) }
      : { key: n.path, label: n.name, type: 'file' },
  )
}

/** 逐级祖先路径（供选中文件时自动展开定位） */
export function ancestorsOf(key) {
  const parts = String(key ?? '').split('/').filter(Boolean)
  return parts.slice(0, -1).map((_, idx) => parts.slice(0, idx + 1).join('/'))
}

/**
 * 选择状态转移：选文件=选中+祖先自动展开（保留既有展开）；选目录=纯展开切换（不动 selected）。
 * 不可变更新（返回新 state），组件只搬运不计算。
 */
export function selectNode(state, node) {
  const selected = state?.selected ?? null
  const expanded = Array.isArray(state?.expanded) ? state.expanded : []
  const key = node?.key
  if (node?.type === 'dir') {
    return {
      selected,
      expanded: expanded.includes(key) ? expanded.filter((k) => k !== key) : [...expanded, key],
    }
  }
  const add = ancestorsOf(key).filter((k) => !expanded.includes(k))
  return { selected: key, expanded: [...expanded, ...add] }
}

/**
 * wikilink 目标解析（[[Note]] / [[Note#Head]] / [[dir/Note]]）→ 实际文件路径或 null。
 * 口径：显式路径（含 .md 可选）优先，其次 basename 匹配（Obsidian 语义；大小写敏感，T11 归位折叠）。
 */
export function resolveNotePath(filePaths, target) {
  const t = String(target ?? '').split('#')[0].split('|')[0].trim()
  if (!t) return null
  const files = Array.isArray(filePaths) ? filePaths : []
  for (const candidate of [t, `${t}.md`]) {
    if (files.includes(candidate)) return candidate
  }
  const base = t.replace(/\.md$/i, '').split('/').pop()
  if (!base) return null
  return files.find((p) => p.replace(/\.md$/i, '').split('/').pop() === base) ?? null
}
