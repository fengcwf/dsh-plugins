<script setup>
// IngestLogPanel — ingest 日志只读展示（时间倒序：最新在上，「加载更早」追加于下方）。
// 数据=各来源拼接（ingest-log.js），逐行如实标注来源（禁编造统一日志）；
// 视图模型纯函数在 lib/log-view.js（倒序/连续段分组/角标），筛选模型在 lib/log-filter.js，
// 本组件只做展示（筛选交互经 emit 上交容器，数据面状态机零改动）。
import { computed } from 'vue'
import { groupBySource, shortTag, toDisplayOrder } from '../lib/log-view.js'
import { typeSelection, toggleType, emptyStateMessage, rangeInverted } from '../lib/log-filter.js'

const props = defineProps({
  lines: { type: Array, required: true },
  meta: { type: Object, required: true },
  error: { type: String, default: '' },
  filters: { type: Object, required: true },
})
const emit = defineEmits(['load-older', 'reload', 'filter-change'])

const sourceIds = computed(() => (props.meta.sources ?? []).map((s) => s.id))
const groups = computed(() => groupBySource(toDisplayOrder(props.lines)))
const checked = computed(() => new Set(typeSelection(props.filters, sourceIds.value)))
// 时间筛选按日粒度（日志行仅含日期键）；起止同为 YYYY-MM-DD 可字典序比较（判定单一源=lib/log-filter.rangeInverted）
const rangeEmpty = computed(() => rangeInverted(props.filters))

function onDate(field, e) {
  emit('filter-change', { ...props.filters, [field]: e.target.value })
}
function onToggle(id) {
  emit('filter-change', toggleType(props.filters, sourceIds.value, id))
}
</script>

<template>
  <section class="ws-block" aria-label="ingest 日志">
    <h3 class="ws-title">
      ingest 日志
      <button class="ws-btn ws-btn-ghost" type="button" @click="emit('reload')">刷新</button>
    </h3>
    <div class="ws-filter" role="group" aria-label="日志筛选">
      <label class="ws-filter-item">
        <span class="ws-filter-label">起始日期</span>
        <input
          class="ws-input"
          type="date"
          :value="filters.since"
          aria-label="起始日期"
          @change="onDate('since', $event)"
        />
      </label>
      <label class="ws-filter-item">
        <span class="ws-filter-label">截止日期</span>
        <input
          class="ws-input"
          type="date"
          :value="filters.until"
          aria-label="截止日期"
          @change="onDate('until', $event)"
        />
      </label>
      <label v-for="s in meta.sources" :key="s.id" class="ws-filter-item" :title="s.label">
        <input
          type="checkbox"
          :checked="checked.has(s.id)"
          @change="onToggle(s.id)"
        />
        <span class="ws-filter-label">{{ s.label }}</span>
      </label>
    </div>
    <p class="ws-note">时间筛选按日粒度（日志行仅含日期键）；类型为多选开关，可与时间叠加；「加载更早」翻旧后筛选仍生效。</p>
    <p v-if="rangeEmpty" class="ws-note">起始日期晚于截止日期——当前时间区间为空。</p>
    <p v-if="error" class="ws-error">{{ error }}</p>
    <p v-if="meta.stale" class="ws-note">游标失效（日志已轮转/更新）——已回到最新视图。</p>
    <div class="ws-log" role="log" aria-live="polite">
      <template v-for="g in groups" :key="g.source + g.lines[0]?.name + g.lines[0]?.line">
        <div class="ws-log-group">{{ g.label }}</div>
        <div
          v-for="line in g.lines"
          :key="`${line.source}|${line.name}|${line.line}`"
          class="ws-log-line"
          :title="`${line.name}:${line.line}`"
        >
          <span class="ws-tag">{{ shortTag(line.source) }}</span>
          <span class="ws-log-text">{{ line.text }}</span>
          <span v-if="line.truncated" class="ws-tag ws-tag-dim">截断</span>
        </div>
      </template>
      <!-- N2 互斥渲染：区间倒置时只呈现「当前时间区间为空」（上方 note），空态文案不再并存 -->
      <div v-if="lines.length === 0 && !error && !rangeEmpty" class="ws-note">{{ emptyStateMessage(filters) }}</div>
    </div>
    <div class="ws-actions">
      <button
        v-if="meta.hasMore"
        class="ws-btn"
        type="button"
        @click="emit('load-older')"
      >加载更早</button>
    </div>
  </section>
</template>
