<script setup>
// SearchResults — 搜索结果展示（纯展示组件）：标题 / 路径:行号 / score / snippet。
// snippet=服务端消毒 HTML（唯一标签 <mark>，ARC-1 消毒口径），v-html 承接同 ReadingPane（零前端解析）。
// score=排序权重（越大越优），仅随条目展示数值，语义句在面板描述位（search-view SCORE_HINT）。
import { resultKey } from '../lib/search-view.js'

defineProps({ results: { type: Array, default: () => [] } })
const emit = defineEmits(['navigate'])
</script>

<template>
  <ul class="ob-backlinks-list">
    <li v-for="(item, i) in results" :key="resultKey(item, i)">
      <button type="button" class="ob-backlink" @click="emit('navigate', item.path)">
        <span class="ob-backlink-path">{{ item.title }} · {{ item.path }}:{{ item.line }} · score {{ item.score }}</span>
        <span class="ob-backlink-text ob-snippet" v-html="item.snippet"></span>
      </button>
    </li>
  </ul>
</template>
