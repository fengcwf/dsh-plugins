<script setup>
// NoteTree — 目录树（el-tree-v2 虚拟滚动，大目录不掉帧）；展示组件，选择逻辑全在 lib/tree.js 纯函数。
// C2（2026-10-09 改版）：行内三按钮（下载/改名/删除）退役 → 目录操作改右键菜单（TreeContextMenu.vue）。
//   保留：单击选中/双击打开、窄屏「目录」抽屉按钮。上抛缝沿用既有「只上抛」模式（emit('select', {action, data})）。
//   定位/翻转/键盘环全在 lib/context-menu.js 纯函数，本文件只搬运 DOM 事件（ARC-6：.vue 零逻辑）。
import { ElTreeV2 } from '../element-plus.js'
import TreeContextMenu from './TreeContextMenu.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  model: { type: Array, default: () => [] },
  selected: { type: String, default: '' },
  expanded: { type: Array, default: () => [] },
})
// 树事件：select=单击选中/双击打开；download/rename/delete=右键菜单动作；share=分享（C2 只出缝，业务联接归 C3）
const emit = defineEmits(['select', 'delete', 'download', 'rename', 'share'])

const treeRef = ref(null)
const wrapRef = ref(null)
const height = ref(560)
const drawerOpen = ref(false) // 窄屏抽屉态（TECH §3.9.4：目录树→抽屉；宽屏由 CSS 接管不生效）
// 右键菜单态：path/kind=菜单业务载荷，x/y=指针视口坐标（翻转由 lib/context-menu.js 纯函数算）
const menu = ref({ open: false, x: 0, y: 0, path: '', kind: 'file' })
let observer = null

// 展开态与 App 状态同步（selectNode 纯函数为准，组件只搬运）
watch(
  () => props.expanded,
  (keys) => treeRef.value?.setExpandedKeys?.(keys),
  { deep: true },
)

function onResize() {
  height.value = wrapRef.value?.clientHeight ?? 560
}

onMounted(() => {
  onResize()
  observer = new ResizeObserver(onResize)
  if (wrapRef.value) observer.observe(wrapRef.value)
})

onBeforeUnmount(() => observer?.disconnect())

function onNodeClick(data) {
  emit('select', { key: data.key, type: data.type })
}

// 右键唤出（C2）：el-tree-v2 @node-contextmenu（实测 tree-node.vue 原生 contextmenu 面，
// 见 element-plus/es/components/tree-v2/src/tree-node.vue_vue_type_script_setup_true_lang.mjs:59-75）
function onNodeContextMenu(event, data) {
  if (!data) return
  menu.value = { open: true, x: event?.clientX ?? 0, y: event?.clientY ?? 0, path: data.key, kind: data.type }
}

// 菜单项上抛：只上抛（业务=App 编排 + 双确认弹层/下载落盘/改名事务）——菜单本身零业务
function onMenuSelect(payload) {
  menu.value = { ...menu.value, open: false }
  const node = { key: payload.path, type: payload.kind }
  if (payload.action === 'download') emit('download', node)
  else if (payload.action === 'rename') emit('rename', node)
  else if (payload.action === 'delete') emit('delete', node)
  else if (payload.action === 'share') emit('share', node) // C3 接线面（C2 只出缝不接业务）
}

function onMenuClose() {
  menu.value = { ...menu.value, open: false }
}

// 空状态「浏览目录」入口（S1）：窄屏展开抽屉 + 聚焦（宽屏树恒在场，聚焦即可）
function openDrawer() {
  drawerOpen.value = true
  wrapRef.value?.focus?.()
}

defineExpose({ openDrawer })
</script>

<template>
  <aside ref="wrapRef" class="ob-tree" :data-open="String(drawerOpen)" aria-label="笔记目录" tabindex="-1">
    <button
      type="button"
      class="ob-drawer-toggle"
      :aria-expanded="String(drawerOpen)"
      @click="drawerOpen = !drawerOpen"
    >目录</button>
    <el-tree-v2
      ref="treeRef"
      :data="props.model"
      :props="{ value: 'key', label: 'label', children: 'children' }"
      :height="height"
      :item-size="28"
      highlight-current
      :current-node-key="props.selected"
      @node-click="onNodeClick"
      @node-contextmenu="onNodeContextMenu"
    >
      <template #default="{ data }">
        <span class="ob-tree-node" :data-type="data.type">
          <span class="ob-tree-node-label">{{ data.label }}</span>
        </span>
      </template>
    </el-tree-v2>
    <TreeContextMenu
      :open="menu.open"
      :x="menu.x"
      :y="menu.y"
      :path="menu.path"
      :kind="menu.kind"
      @select="onMenuSelect"
      @close="onMenuClose"
    />
  </aside>
</template>
