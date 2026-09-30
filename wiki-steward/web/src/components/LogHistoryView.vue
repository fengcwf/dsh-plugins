<script setup>
// LogHistoryView — 历史记录数据面容器（Task F1 历史入口的日志视图）：尾部 N 行 + 游标滚动加载 + 刷新。
// 展示=IngestLogPanel（时间倒序/来源标注/分组/滚动加载/筛选条），状态机=log-history.js 纯模块（框架无关）。
// 筛选（Phase 8 反馈轮④）：filters 由本容器持有，reload/loadOlder 同参下传（翻旧后过滤仍生效）；
// 筛选变更=从最新页重取（游标重置）。筛选态随组件生命周期（弹层重开=重置为缺省，报告注明）。
import { ref, onMounted } from 'vue'
import IngestLogPanel from './IngestLogPanel.vue'
import { initialHistory, applyLatest, applyOlder, applyError, canLoadOlder, PAGE_SIZE } from '../lib/log-history.js'
import { defaultFilters, toQuery } from '../lib/log-filter.js'

const props = defineProps({ api: { type: Object, required: true } })
const history = ref(initialHistory())
const filters = ref(defaultFilters())

async function reload() {
  try {
    history.value = applyLatest(history.value, await props.api.fetchLogs(PAGE_SIZE, undefined, toQuery(filters.value)))
  } catch (e) {
    history.value = applyError(history.value, e)
  }
}

async function loadOlder() {
  if (!canLoadOlder(history.value)) return
  try {
    history.value = applyOlder(history.value, await props.api.fetchLogs(PAGE_SIZE, history.value.meta.cursor, toQuery(filters.value)))
  } catch (e) {
    history.value = applyError(history.value, e)
  }
}

function onFilterChange(next) {
  filters.value = next
  reload()
}

onMounted(reload)
defineExpose({ reload })
</script>

<template>
  <IngestLogPanel
    :lines="history.lines"
    :meta="history.meta"
    :error="history.error"
    :filters="filters"
    @load-older="loadOlder"
    @reload="reload"
    @filter-change="onFilterChange"
  />
</template>
