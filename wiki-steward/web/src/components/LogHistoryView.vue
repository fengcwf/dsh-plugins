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
// W1 epoch 守卫（0.7.0 波复审 W1 收口）：请求序号——filter-change/reload 递增，loadOlder 沿用当前序号；
// 响应 epoch 不匹配即丢弃（既不 applyOlder 也不替换当前页，错误同样不落）：晚到的旧筛选响应永不落进新筛选视图。
const epoch = ref(0)

async function reload() {
  const mine = ++epoch.value
  try {
    const data = await props.api.fetchLogs(PAGE_SIZE, undefined, toQuery(filters.value))
    if (mine !== epoch.value) return
    history.value = applyLatest(history.value, data)
  } catch (e) {
    if (mine !== epoch.value) return
    history.value = applyError(history.value, e)
  }
}

async function loadOlder() {
  if (!canLoadOlder(history.value)) return
  const mine = epoch.value
  try {
    const data = await props.api.fetchLogs(PAGE_SIZE, history.value.meta.cursor, toQuery(filters.value))
    if (mine !== epoch.value) return
    history.value = applyOlder(history.value, data)
  } catch (e) {
    if (mine !== epoch.value) return
    history.value = applyError(history.value, e)
  }
}

function onFilterChange(next) {
  filters.value = next
  reload()
}

onMounted(reload)
// epoch 随 reload 一并暴露：集成测试直读请求序号，锁「filter-change/reload 递增、loadOlder 不递增」契约（真实现直测）。
defineExpose({ reload, epoch })
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
