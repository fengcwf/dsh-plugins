<script setup>
// TocNode — 大纲递归节点（展示组件，零逻辑）
defineProps({ node: { type: Object, required: true } })
const emit = defineEmits(['jump'])
</script>

<template>
  <li>
    <button
      type="button"
      class="ob-toc-link"
      :data-level="node.level"
      :style="{ paddingLeft: `${node.indent * 12 + 4}px` }"
      @click="emit('jump', node.id)"
    >
      {{ node.text }}
    </button>
    <ul v-if="node.children.length" class="ob-toc-list">
      <TocNode v-for="child in node.children" :key="child.id" :node="child" @jump="emit('jump', $event)" />
    </ul>
  </li>
</template>
