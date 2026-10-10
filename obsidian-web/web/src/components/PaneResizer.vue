<template>
  <!-- C1 分隔条（国标 GB/T 37835-2019）：条宽 6px、命中区 24px（光标区内扩）、col-resize 光标 -->
  <!-- 键盘：tabindex=0 + role=separator + aria-valuenow/min/max；方向键 ±16px（Shift ±64px）、Home/End 极值 -->
  <div
    class="ob-pane-resizer"
    :class="{ 'is-dragging': dragging, 'is-hidden': hidden }"
    role="separator"
    :aria-orientation="'vertical'"
    :aria-valuenow="model"
    :aria-valuemin="min"
    :aria-valuemax="max"
    tabindex="0"
    @pointerdown="onDown"
    @dblclick="onReset"
    @keydown="onKey"
    @focus="onFocus"
    @blur="onBlur"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { resizePair, keyStep, canDrag } from '../lib/pane-resize.js'

const props = defineProps({
  modelValue: { type: Number, required: true }, // 当前左侧栏宽（px）
  pairTotal: { type: Number, required: true }, // 本轮拖拽影响的两栏总宽（守恒基准）
  min: { type: Number, default: 200 },
  max: { type: Number, default: 640 },
  hidden: { type: Boolean, default: false }, // narrow 模式（栏进抽屉）时禁用
})
const emit = defineEmits(['update:modelValue', 'reset'])
const model = computed(() => props.modelValue)

const dragging = ref(false)
const focused = ref(false)
let startX = 0
let startA = 0

function emitWidth(a) { emit('update:modelValue', a) }

function onDown(e) {
  if (props.hidden || !canDrag(e)) return
  dragging.value = true
  startX = e.clientX
  startA = props.modelValue
  e.target.setPointerCapture?.(e.pointerId)
  e.preventDefault()
}
const onMove = (e) => {
  if (!dragging.value) return
  const next = resizePair({ a: startA, b: props.pairTotal - startA }, e.clientX - startX, { min: props.min, max: props.max })
  if (next) emitWidth(next.a)
}
const onUp = () => { dragging.value = false }
const onKey = (e) => {
  if (props.hidden) return
  const d = keyStep(e.key, { shift: e.shiftKey })
  if (d === 0) return
  const next = resizePair({ a: props.modelValue, b: props.pairTotal - props.modelValue }, d, { min: props.min, max: props.max })
  if (next) emitWidth(next.a)
  else if (e.key === 'Home') emitWidth(props.min)
  else if (e.key === 'End') emitWidth(props.max)
  e.preventDefault()
}
const onReset = () => emit('reset')
const onFocus = () => { focused.value = true }
const onBlur = () => { focused.value = false }
// 拖拽中禁选文本 + 指针事件监听（组件级，卸载随组件销毁）
document.addEventListener('pointermove', onMove)
document.addEventListener('pointerup', onUp)
document.addEventListener('pointercancel', onUp)
</script>

<style scoped>
.ob-pane-resizer {
  width: 6px;                /* 国标条宽 4-8px */
  background: transparent;
  cursor: col-resize;
  position: relative;
  touch-action: none;
}
/* 命中区：上下拉开成内扩 24px（sticky 无副作用） */
.ob-pane-resizer::before {
  content: '';
  position: absolute;
  inset: 0 -9px;             /* 6 + 18 = 24px 命中区 */
}
.ob-pane-resizer.is-dragging,
.ob-pane-resizer:hover {
  background: var(--ow-accent-tint);
}
.ob-pane-resizer:focus-visible {
  outline: 2px solid var(--ow-ring-accent, ButtonBorder);
  outline-offset: 2px;
}
.ob-pane-resizer.is-hidden {
  display: none;
}
</style>
