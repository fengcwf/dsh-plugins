<script setup>
// BacklinksPanel — 反链面板（中央列可切换，OW-US-14）：列表展示，点击上抛源笔记路径。
defineProps({
  path: { type: String, default: '' },
  backlinks: { type: Array, default: () => [] },
})
const emit = defineEmits(['navigate'])
</script>

<template>
  <section class="ob-prose" aria-label="反链">
    <h2>反链</h2>
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
