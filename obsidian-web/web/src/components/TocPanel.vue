<script setup>
// TocPanel — 大纲面板（右栏 248px）：扁平 TOC → 嵌套树（lib/toc.js 纯函数），点击上抛 heading id。
import { computed } from 'vue'
import { buildTocTree } from '../lib/toc.js'
import TocNode from './TocNode.vue'

const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['jump'])

const tree = computed(() => buildTocTree(props.items))
</script>

<template>
  <nav class="ob-toc" aria-label="大纲">
    <h2 class="ob-toc-title">大纲</h2>
    <ul v-if="tree.length" class="ob-toc-list">
      <TocNode v-for="node in tree" :key="node.id" :node="node" @jump="emit('jump', $event)" />
    </ul>
    <p v-else class="ob-empty">无标题</p>
  </nav>
</template>
