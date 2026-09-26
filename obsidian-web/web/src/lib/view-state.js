// view-state — 视图状态持久化（delta-spec §3：分屏编辑与阅读视图状态独立持久化）
// 两把独立 localStorage key，互不覆盖；坏 JSON 容错回默认（web-edit.test.mjs 锁形）。
export const EDIT_STATE_KEY = 'ob:edit-state'
export const READ_STATE_KEY = 'ob:read-state'

const EDIT_DEFAULT = { previewVisible: true, splitRatio: 0.5 }
const READ_DEFAULT = { panel: 'read' }

function loadState(storage, key, fallback) {
  try {
    const raw = storage?.getItem?.(key)
    if (!raw) return { ...fallback }
    return { ...fallback, ...JSON.parse(raw) }
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
  return loadState(storage, EDIT_STATE_KEY, fallback)
}

export function saveEditState(storage, state) {
  saveState(storage, EDIT_STATE_KEY, state)
}

export function loadReadState(storage, fallback = READ_DEFAULT) {
  return loadState(storage, READ_STATE_KEY, fallback)
}

export function saveReadState(storage, state) {
  saveState(storage, READ_STATE_KEY, state)
}
