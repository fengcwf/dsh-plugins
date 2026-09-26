<script setup>
// NoteTree — 目录树（el-tree-v2 虚拟滚动，大目录不掉帧）；展示组件，选择逻辑全在 lib/tree.js 纯函数。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  model: { type: Array, default: () => [] },
  selected: { type: String, default: '' },
  expanded: { type: Array, default: () => [] },
})
const emit = defineEmits(['select'])

const treeRef = ref(null)
const wrapRef = ref(null)
const height = ref(560)
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
</script>

<template>
  <aside ref="wrapRef" class="ob-tree" aria-label="笔记目录">
    <el-tree-v2
      ref="treeRef"
      :data="props.model"
      :props="{ value: 'key', label: 'label', children: 'children' }"
      :height="height"
      :item-size="28"
      highlight-current
      :current-node-key="props.selected"
      @node-click="onNodeClick"
    >
      <template #default="{ data }">
        <span class="ob-tree-node" :data-type="data.type">{{ data.label }}</span>
      </template>
    </el-tree-v2>
  </aside>
</template>
