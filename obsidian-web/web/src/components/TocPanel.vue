<script setup>
// TocPanel — 大纲面板（右栏 248px）：扁平 TOC → 嵌套树（lib/toc.js 纯函数），点击上抛 heading id。
import { computed, ref } from 'vue'
import { buildTocTree } from '../lib/toc.js'
import TocNode from './TocNode.vue'

const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['jump'])

const tree = computed(() => buildTocTree(props.items))
const drawerOpen = ref(false) // 窄屏抽屉态（TECH §3.9.4：TOC→收抽屉；宽屏由 CSS 接管不生效）
</script>

<template>
  <nav class="ob-toc" :data-open="String(drawerOpen)" aria-label="大纲">
    <button
      type="button"
      class="ob-drawer-toggle"
      :aria-expanded="String(drawerOpen)"
      @click="drawerOpen = !drawerOpen"
    >大纲</button>
    <h2 class="ob-toc-title">大纲</h2>
    <ul v-if="tree.length" class="ob-toc-list">
      <TocNode v-for="node in tree" :key="node.id" :node="node" @jump="emit('jump', $event)" />
    </ul>
    <p v-else class="ob-empty">无标题</p>
  </nav>
</template>
