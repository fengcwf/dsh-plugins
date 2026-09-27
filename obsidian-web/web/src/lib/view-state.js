// view-state — 视图状态持久化（delta-spec §3：分屏编辑与阅读视图状态独立持久化）
// 两把独立 localStorage key，互不覆盖；坏 JSON 容错回默认（web-edit.test.mjs 锁形）。
// T13：敌意值归一（splitRatio 出界夹取/非布尔回默认/未知 panel 回 read）——往返语义
// test/web-split-state.test.mjs 锁形（② 分屏状态持久化）。
export const EDIT_STATE_KEY = 'ob:edit-state'
export const READ_STATE_KEY = 'ob:read-state'

const EDIT_DEFAULT = { previewVisible: true, splitRatio: 0.5 }
const READ_DEFAULT = { panel: 'read' }
// 分隔条夹取区间（NoteEditor 拖拽同值——分屏比例只在可读区间内生效）
export const SPLIT_RATIO_MIN = 0.2
export const SPLIT_RATIO_MAX = 0.8
// 同页面板全集（OW-US-14；未知 panel 回 read，不落死面板）
export const PANELS = Object.freeze(['read', 'edit', 'search', 'backlinks', 'share', 'settings'])

/** 分屏状态归一：previewVisible 必布尔、splitRatio 必有限且夹取 [0.2,0.8] */
export function normalizeEditState(raw, fallback = EDIT_DEFAULT) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const previewVisible = typeof src.previewVisible === 'boolean' ? src.previewVisible : fallback.previewVisible
  const n = Number(src.splitRatio)
  const splitRatio = Number.isFinite(n)
    ? Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, n))
    : fallback.splitRatio
  return { previewVisible, splitRatio }
}

/** 阅读态归一：panel 必在 PANELS 全集内（未知回 read） */
export function normalizeReadState(raw, fallback = READ_DEFAULT) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const panel = PANELS.includes(src.panel) ? src.panel : fallback.panel
  return { panel }
}

function loadState(storage, key, fallback, normalize) {
  try {
    const raw = storage?.getItem?.(key)
    if (!raw) return { ...fallback }
    return normalize({ ...fallback, ...JSON.parse(raw) }, fallback)
  } catch {
    return { ...fallback }
  }
}

function saveState(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value))
  } catch {
    // 持久化失败不阻断编辑（状态是体验件非正确性件）
  }
}

export function loadEditState(storage, fallback = EDIT_DEFAULT) {
  return loadState(storage, EDIT_STATE_KEY, fallback, normalizeEditState)
}

export function saveEditState(storage, state) {
  saveState(storage, EDIT_STATE_KEY, normalizeEditState(state))
}

export function loadReadState(storage, fallback = READ_DEFAULT) {
  return loadState(storage, READ_STATE_KEY, fallback, normalizeReadState)
}

export function saveReadState(storage, state) {
  saveState(storage, READ_STATE_KEY, normalizeReadState(state))
}
