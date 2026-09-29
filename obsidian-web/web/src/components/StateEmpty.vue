<script setup>
// StateEmpty — 空状态构图（candidate-c 8）：下一步动作 + 最近打开，与骨架/错误同构图族。
// 文案在 web/src/lib/ui-base.js（EMPTY_MODEL）、时间文案 formatRecentTime（纯函数），本组件只展示。
// 动作按钮复用既有 ElButton（按钮四档归 candidate-c 7，不在 S1 面；本波零新增按钮体系）。
import { ElButton } from '../element-plus.js'
import { EMPTY_MODEL, formatRecentTime } from '../lib/ui-base.js'

defineProps({
  recents: { type: Array, default: () => [] }, // [{path, at}]
})
const emit = defineEmits(['browse-tree', 'search', 'open'])
</script>

<template>
  <div class="ob-empty-state">
    <h2 class="ob-empty-title">{{ EMPTY_MODEL.title }}</h2>
    <p class="ob-empty-body">{{ EMPTY_MODEL.body }}</p>
    <div class="ob-empty-actions">
      <el-button type="primary" @click="emit('browse-tree')">{{ EMPTY_MODEL.browseLabel }}</el-button>
      <el-button @click="emit('search')">{{ EMPTY_MODEL.searchLabel }}</el-button>
    </div>
    <template v-if="recents.length">
      <p class="ob-empty-recent-title">{{ EMPTY_MODEL.recentTitle }}</p>
      <ul class="ob-recent-list">
        <li v-for="item in recents" :key="item.path">
          <button type="button" class="ob-recent-link" @click="emit('open', item.path)">{{ item.path }}</button>
          <time class="ob-recent-time">{{ formatRecentTime(item.at) }}</time>
        </li>
      </ul>
    </template>
  </div>
</template>
