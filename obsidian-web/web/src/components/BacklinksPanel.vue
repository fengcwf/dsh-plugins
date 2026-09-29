<script setup>
// BacklinksPanel — 反链面板（中央列可切换，OW-US-14）：列表展示，点击上抛源笔记路径。
// S1（candidate-c 5）：面板统一头（标题 + 路径副文）。
import PanelHeader from './PanelHeader.vue'

defineProps({
  path: { type: String, default: '' },
  backlinks: { type: Array, default: () => [] },
  recents: { type: Array, default: () => [] }, // 未用 props 仅吸收防落 DOM 属性（同页面板接口统一）
  readView: { type: Object, default: null }, // 同上吸收
})
const emit = defineEmits(['navigate'])
</script>

<template>
  <section class="ob-prose" aria-label="反链">
    <PanelHeader title="反链" :sub="path" />
    <p v-if="!backlinks.length" class="ob-empty">暂无反链</p>
    <ul v-else class="ob-backlinks-list">
      <li v-for="(item, i) in backlinks" :key="`${item.path}:${item.line}:${i}`">
        <button type="button" class="ob-backlink" @click="emit('navigate', item.path)">
          <span class="ob-backlink-path">{{ item.path }}:{{ item.line }}</span>
          <span class="ob-backlink-text">{{ item.text }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
