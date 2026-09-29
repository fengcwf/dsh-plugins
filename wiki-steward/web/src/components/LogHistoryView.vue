<script setup>
// LogHistoryView — 历史记录数据面容器（Task F1 历史入口的日志视图）：尾部 N 行 + 游标滚动加载 + 刷新。
// 展示=IngestLogPanel（来源标注/分组/滚动加载），状态机=log-history.js 纯模块（框架无关）。
// 语义与原面板数据面一致（来源拼接如实、游标失效回最新视图）。
import { ref, onMounted } from 'vue'
import IngestLogPanel from './IngestLogPanel.vue'
import { initialHistory, applyLatest, applyOlder, applyError, canLoadOlder, PAGE_SIZE } from '../lib/log-history.js'

const props = defineProps({ api: { type: Object, required: true } })
const history = ref(initialHistory())

async function reload() {
  try {
    history.value = applyLatest(history.value, await props.api.fetchLogs(PAGE_SIZE))
  } catch (e) {
    history.value = applyError(history.value, e)
  }
}

async function loadOlder() {
  if (!canLoadOlder(history.value)) return
  try {
    history.value = applyOlder(history.value, await props.api.fetchLogs(PAGE_SIZE, history.value.meta.cursor))
  } catch (e) {
    history.value = applyError(history.value, e)
  }
}

onMounted(reload)
defineExpose({ reload })
</script>

<template>
  <IngestLogPanel
    :lines="history.lines"
    :meta="history.meta"
    :error="history.error"
    @load-older="loadOlder"
    @reload="reload"
  />
</template>
