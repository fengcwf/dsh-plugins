// log-filter — 历史日志视图筛选模型纯函数（框架无关，.vue 只做展示；容器/展示分离 ARC 纪律）。
// 三能力（Phase 8 反馈轮④）：①时间倒序展示（log-view.toDisplayOrder）②时间区间筛选 ③类型多选；
// 本模块只管筛选态模型：默认态/类型多选开关/日期输入/查询串投影/空态文案（如实，不伪造条目）。
// 与 lib/ingest-log.js 的口径契约：dateKey=YYYYMMDD（日粒度——日志行仅含日期键，不编造行内时刻）；
// 查询参 since/until 原样透传（服务端归一+校验），type=选中来源 id 逗串（缺省缺席=现状行为）。

/** 缺省筛选态：时间空界 + types=null（全选=不过滤，API 缺省同款语义） */
export function defaultFilters() {
  return { since: '', until: '', types: null }
}

/** 勾选态投影：types=null=全选；显式集合=逐 id 勾选 */
export function typeSelection(filters, sourceIds) {
  if (filters.types === null) return [...sourceIds]
  return sourceIds.filter((id) => filters.types.includes(id))
}

/**
 * 类型多选开关：全选态去一 / 显式集加一去一往返；全选自动归一 types=null（回缺省形）。
 * 未知 id 不入集合（不编造来源）。
 */
export function toggleType(filters, sourceIds, id) {
  if (!sourceIds.includes(id)) return { since: filters.since, until: filters.until, types: filters.types }
  const selected = typeSelection(filters, sourceIds)
  const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
  const full = sourceIds.every((x) => next.includes(x))
  return { since: filters.since, until: filters.until, types: full ? null : next }
}

/** 时间输入置位（since/until 互不干扰；值原样保留，归一与校验在服务端——单一口径） */
export function setDate(filters, field, value) {
  return { ...filters, [field]: String(value ?? '') }
}

/** 是否带筛选（时间界或类型收窄任一置位） */
export function filtersActive(filters) {
  return filters.since !== '' || filters.until !== '' || filters.types !== null
}

/**
 * 查询串投影：仅发置位参（缺省缺席=API 现状行为）。
 * type：全选（null）不发；显式集合=逗串；全不选=显式空串（与缺席可区分）。
 */
export function toQuery(filters) {
  const q = {}
  if (filters.since !== '') q.since = filters.since
  if (filters.until !== '') q.until = filters.until
  if (filters.types !== null) q.type = filters.types.join(',')
  return q
}

/** 空结果态文案（如实三分：全不选 / 有筛选无匹配 / 无筛选无记录，各说各话不冒充） */
export function emptyStateMessage(filters) {
  if (filters.types !== null && filters.types.length === 0) return '未选任何来源类型——勾选来源后显示对应日志。'
  if (filtersActive(filters)) return '所选筛选条件下无日志条目。'
  return '暂无日志（各来源均无记录）。'
}
