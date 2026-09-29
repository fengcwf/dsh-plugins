// log-history — 历史记录数据面纯状态机（框架无关，.vue 只做展示；容器/展示分离 ARC 纪律）。
// 语义与原面板 App.vue 数据面一致（尾部 N 行 + 游标滚动加载 + 错误留痕），拼接/去重复用 log-view.js。
// 输入=lib/ingest-routes.js logsGet 载荷 {lines, hasMore, cursor, sources, stale?}。
import { prependChunk } from './log-view.js'

/** 单页行数（尾部 N 行语义——与原面板分页一致） */
export const PAGE_SIZE = 200

/** 空态起点（无行/无游标/无来源/无错） */
export function initialHistory() {
  return { lines: [], meta: { hasMore: false, cursor: null, sources: [], stale: false }, error: '' }
}

/** 最新页整页替换（尾部 N 行）+ 清错；meta 归一（stale 必布尔） */
export function applyLatest(h, data) {
  return {
    lines: Array.isArray(data.lines) ? data.lines : [],
    meta: {
      hasMore: data.hasMore === true,
      cursor: data.cursor ?? null,
      sources: Array.isArray(data.sources) ? data.sources : [],
      stale: data.stale === true,
    },
    error: '',
  }
}

/** 更早页拼前（prependChunk 锚点键去重——不重不漏）；来源标注沿用既有 meta（与原面板语义一致） */
export function applyOlder(h, data) {
  return {
    lines: prependChunk(h.lines, Array.isArray(data.lines) ? data.lines : []),
    meta: {
      hasMore: data.hasMore === true,
      cursor: data.cursor ?? null,
      sources: h.meta.sources,
      stale: data.stale === true,
    },
    error: '',
  }
}

/** 失败如实留痕（不吞不编造）；已载行保留 */
export function applyError(h, e) {
  return { lines: h.lines, meta: h.meta, error: String((e && e.message) || e) }
}

/** 滚动加载闸门：仅 hasMore 才翻更早 */
export function canLoadOlder(h) {
  return h.meta.hasMore === true
}
