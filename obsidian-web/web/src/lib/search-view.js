// search-view — 搜索面板展示纯函数（组件零逻辑，单测锁形）
// score 语义（detpecca 教训）：**score = 排序权重，越大越优，仅用于结果排序；不是匹配概率，也不是百分比**。
// 展示口径：score 数值可随结果展示，但语义句 SCORE_HINT 必须常驻描述位；禁把 score 说成匹配概率/相似百分比。
export const SCORE_HINT = 'score 为排序权重（越大越优），仅用于结果排序；不是匹配概率，也不是百分比。'

/** 降级提示（INV-15 风格留痕）：无降级出空串，有降级出可读提示 */
export function describeDegraded(degraded) {
  if (!degraded) return ''
  return degraded.message || '查询已降级，仅返回部分结果'
}

/** 结果列表 key（path:line:序号，同分同行不撞） */
export function resultKey(item, index) {
  return `${item.path}:${item.line}:${index}`
}
