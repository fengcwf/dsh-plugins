// pane-resize.js — 三栏拖拽分隔条纯逻辑（C1，国标 GB/T 37835-2019 六要素的可测核心）
// 只做「宽度分配」这一件事：clamp/守恒/键盘步进。DOM/事件在 PaneResizer.vue。
// 契约：宽度的单位是 px 数字；调用方负责把它写进 CSS 变量。

/**
 * 拖拽/键盘后的宽度分配（守恒：相邻两栏此消彼长，总量不变）。
 * min/max 是对「目标宽度」的钳位（不是把当前值钳回 min）——A 增长为正。
 * 返回 null 表示已达守恒饱和（B 无法再让），调用方应保持原宽不变。
 */
export function resizePair(state, delta, opts = {}) {
  const min = opts.min ?? 200
  const max = opts.max ?? 640
  if (!state || typeof state.a !== 'number' || typeof state.b !== 'number') return null
  if (!Number.isFinite(delta)) return null
  // NaN/Infinity 保护
  if (!Number.isFinite(state.a + state.b)) return null
  if (delta === 0) return state
  const target = state.a + delta
  // 钳位：min/max 夹住目标；同时 B 不得低于 min（守恒饱和判据）
  const a = Math.min(max, Math.max(min, target))
  const b = state.a + state.b - a
  if (b < min) return null
  return { a, b }
}

/** 键盘步进（Shift=加速）；返回新 delta 而非绝对宽度（组件侧累加） */
export function keyStep(key, { shift = false } = {}) {
  const step = shift ? 64 : 16
  if (key === 'ArrowLeft' || key === 'Home') return -step
  if (key === 'ArrowRight' || key === 'End') return step
  return 0
}

/** 是否可发起拖拽（鼠标左键/任一指针；`touch-action:none` 使触屏 pointer 可捕获） */
export function canDrag(event) {
  return !!event && (event.pointerType === 'mouse' ? event.button === 0 : true)
}

/** 命中区判定：光标距分隔条中线 ≤ zone/2（zone=24 → ±12px，命中区全宽 24px 达国标） */
export function inHitZone(pointer, rect, zone = 24) {
  if (!pointer || !rect) return false
  const mid = rect.left + rect.width / 2
  return Math.abs(pointer - mid) <= zone / 2
}
