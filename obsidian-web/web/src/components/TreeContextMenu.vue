<script setup>
// TreeContextMenu — 树行右键菜单（C2 卡，2026-10-09）：纯展示 + DOM 级可达性，决策全在纯函数
//   （web/src/lib/context-menu.js：菜单项集 menuItemsFor / 键盘环 nextFocusIndex / 定位翻转 placeMenu）。
// 契约：只上抛（emit('select', {action, path, kind})）——业务=App 编排（沿用 NoteTree 既有「只上抛」模式）；
//   本组件不读数据、不发请求、不改树状态。
// 可达性（WCAG）：role=menu/menuitem、打开即聚焦首项（当前项高亮）、方向键/Home/End 环移、Enter/Space 触发、
//   Escape/点击外部/Tab 关闭且焦点归位、焦点环可见。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { menuItemsFor, nextFocusIndex, placeMenu } from '../lib/context-menu.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  path: { type: String, default: '' },
  kind: { type: String, default: 'file' }, // 'file' | 'dir'（改名项仅 file：服务端 renameNote 契约同界）
})
const emit = defineEmits(['select', 'close'])

const rootRef = ref(null)
const activeIndex = ref(0)
const pos = ref({ left: 0, top: 0 })
const items = computed(() => menuItemsFor(props.kind))
let lastFocused = null
let restoreFocus = false // 仅键盘关闭（Escape/Tab）才把焦点还回原处；点外部不抢用户新落点
let wasOpen = false

// 菜单项 DOM 实时查询（bugfix 2026-10-09）：**不用索引闭包型函数 ref**——项集长度随 kind 变
// （file 四项 → dir 三项），卸载项以旧下标回调 null 会把 itemRefs[0] 清成 null，
// 二次打开 focusIndex(0) 静默失效 → 焦点留在树行 → Escape 走 document 捕获器时 target 不在菜单内
// 被放行 → 菜单关不掉（二次打开必现，实测复现链见 reports/c2a-context-menu.md §5）。
// 根元素内 querySelectorAll 的顺序=渲染顺序（v-for 源序），零闭包陈旧风险。
function itemEls() {
  return [...(rootRef.value?.querySelectorAll?.('[role="menuitem"]') ?? [])]
}

function place() {
  const el = rootRef.value
  if (!el) return
  pos.value = placeMenu({
    x: props.x,
    y: props.y,
    width: el.offsetWidth ?? 0,
    height: el.offsetHeight ?? 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })
}

function focusIndex(idx) {
  if (idx < 0) return
  activeIndex.value = idx
  itemEls()[idx]?.focus?.()
}

function fire(item) {
  if (!item) return
  emit('select', { action: item.action, path: props.path, kind: props.kind })
}

// 键盘（焦点在菜单内时）：Enter/Space 触发、方向键/Home/End 环移。
// Escape/Tab 不在此处理——收口在 onDocKeyDown（焦点漂出菜单时也必须关得掉，见下方 bugfix 注释）。
function onKeydown(e) {
  const key = e.key
  if (key === 'Enter' || key === ' ') {
    e.preventDefault()
    fire(items.value[activeIndex.value])
    return
  }
  const next = nextFocusIndex(items.value, activeIndex.value, key)
  if (next !== activeIndex.value) {
    e.preventDefault() // 方向键/Home/End：只在本菜单内环移，不滚页面
    focusIndex(next)
  }
}

function onDocMouseDown(e) {
  if (rootRef.value?.contains(e.target)) return
  restoreFocus = false // 点外部不抢用户新落点（焦点归原处会把用户点走的目标抢回来）
  emit('close')
}

// Escape/Tab 收口在 document 捕获层（bugfix 2026-10-09）：旧实现加「target 不在菜单内就不关」的
// 守卫，遇上焦点未落到菜单项（见 itemEls bugfix）时 Escape 直接失效=菜单关不掉。
// 守卫本意是防误关，但本监听器**只在菜单打开期间挂载**（attach/detach 与 open 同步），
// 打开期间 Escape/Tab 一律=关本菜单，语义正确且零误关面。
function onDocKeyDown(e) {
  if (e.key !== 'Escape' && e.key !== 'Tab') return
  restoreFocus = true
  emit('close')
}

function attach() {
  document.addEventListener('mousedown', onDocMouseDown, true)
  document.addEventListener('keydown', onDocKeyDown, true)
}

function detach() {
  document.removeEventListener('mousedown', onDocMouseDown, true)
  document.removeEventListener('keydown', onDocKeyDown, true)
}

async function focusOpen() {
  activeIndex.value = 0
  pos.value = { left: props.x, top: props.y } // 先落指针处（零尺寸抖动），nextTick 实测尺寸后翻转/夹紧
  await nextTick()
  place()
  focusIndex(0)
}

watch(
  () => [props.open, props.x, props.y, props.path, props.kind],
  async () => {
    if (props.open === wasOpen) {
      if (props.open) await focusOpen() // 同一次打开中换了行/位置：重定位并重聚焦
      return
    }
    wasOpen = props.open
    if (props.open) {
      lastFocused = document.activeElement
      restoreFocus = false
      attach()
      await focusOpen()
      return
    }
    detach()
    if (restoreFocus) lastFocused?.focus?.()
    lastFocused = null
  },
  // immediate：挂载即裁决一次（挂载时已 open 的场景——如父级重挂载/路由回切——也照常定位与聚焦，
  // 否则 pos 停在 {0,0}、焦点不落菜单项，菜单「开在左上角且键盘无响应」）。
  { immediate: true },
)

onBeforeUnmount(detach)
</script>

<template>
  <Teleport to="body">
    <div
      v-show="props.open"
      ref="rootRef"
      class="ob-cm"
      role="menu"
      :aria-label="`节点操作：${props.path}`"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
      @keydown="onKeydown"
      @contextmenu.prevent
    >
      <button
        v-for="(item, idx) in items"
        :key="item.action"
        type="button"
        role="menuitem"
        class="ob-cm-item"
        :class="{ 'is-active': idx === activeIndex }"
        :title="item.hint"
        tabindex="-1"
        @click="fire(item)"
        @mouseenter="focusIndex(idx)"
      >{{ item.label }}</button>
    </div>
  </Teleport>
</template>

<style>
/* TreeContextMenu 浮层（C2）：随组件走（红线「不动 styles.css 视觉层」，故样式落本组件的 <style> 块）；
   色板= dsh token（--dsw-*）+ 既有派生档（--ow-*），零色值字面量（web-composition ⑥ 同纪律）。
   定位：position:fixed（永不占树行标签宽=永不压字），left/top 由 lib/context-menu.js placeMenu 翻转/夹紧，
   CSS 零 right/bottom 硬值。 */
.ob-cm {
  position: fixed;
  z-index: 30; /* 高于窄屏抽屉（styles.css:1236 z-index:20） */
  min-width: 148px;
  padding: var(--ow-sp-1) 0;
  border: 1px solid var(--dsw-alias-border-l2, ButtonBorder);
  border-radius: var(--ow-radius-control);
  background: var(--dsw-alias-bg-layer-1, Canvas);
  box-shadow: var(--ow-shadow-btn);
  font-family: var(--dsw-font-family, sans-serif);
  font-size: var(--dsw-font-xs-13-font-size, 13px);
  line-height: 1.6;
}

.ob-cm-item {
  display: block;
  width: 100%;
  padding: var(--ow-sp-1) var(--ow-sp-3);
  border: 0;
  background: none;
  color: var(--dsw-alias-label-primary, CanvasText);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.ob-cm-item.is-active {
  background: var(--ow-accent-tint);
  color: var(--ow-accent-text);
}

/* 焦点环（键盘可达性的机械面）：程序化聚焦也要看得见（:focus-visible 对脚本聚焦不保证命中） */
.ob-cm-item:focus {
  outline: 2px solid var(--dsw-alias-state-business-primary, Highlight);
  outline-offset: -2px;
}
</style>
