// log-view — 设置页签日志视图纯函数（框架无关，.vue 只做展示；容器/展示分离 ARC 纪律）。
// 输入=lib/ingest-log.js 的拼接行形 {source,label,name,line,text,dateKey}；
// 这里只管视图模型：连续段分组、滚动加载拼接（锚点键去重）、来源角标。
export function lineKey(line) {
  return `${line.source}|${line.name}|${line.line}`
}

/** 连续同来源段聚合（跨段重复来源不合并——保时间序） */
export function groupBySource(lines) {
  const groups = []
  for (const line of lines) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.source === line.source) {
      last.lines.push(line)
    } else {
      groups.push({ source: line.source, label: line.label, lines: [line] })
    }
  }
  return groups
}

/** 滚动加载拼接：更早块拼前 + 锚点键去重（不重不漏） */
export function prependChunk(current, older) {
  const seen = new Set(current.map(lineKey))
  const fresh = []
  for (const line of older) {
    const k = lineKey(line)
    if (seen.has(k)) continue
    seen.add(k)
    fresh.push(line)
  }
  return [...fresh, ...current]
}

/** 行首来源角标（三来源各有短标注；未知来源回退 id，不编造） */
export function shortTag(source) {
  if (source === 'cron:wiki-ingest') return '夜间任务'
  if (source === 'manual:scan') return '手动扫描'
  if (source === 'alerts:kb') return '告警账本'
  return source
}
