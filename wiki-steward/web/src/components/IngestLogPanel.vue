<script setup>
// IngestLogPanel — ingest 日志只读展示（尾部 N 行 + 滚动加载更早）。
// 数据=各来源拼接（ingest-log.js），逐行如实标注来源（禁编造统一日志）；
// 视图模型纯函数在 lib/log-view.js（连续段分组/角标），本组件只做展示。
import { computed } from 'vue'
import { groupBySource, shortTag } from '../lib/log-view.js'

const props = defineProps({
  lines: { type: Array, required: true },
  meta: { type: Object, required: true },
  error: { type: String, default: '' },
})
const emit = defineEmits(['load-older', 'reload'])

const groups = computed(() => groupBySource(props.lines))
</script>

<template>
  <section class="ws-block" aria-label="ingest 日志">
    <h3 class="ws-title">
      ingest 日志
      <button class="ws-btn ws-btn-ghost" type="button" @click="emit('reload')">刷新</button>
    </h3>
    <p class="ws-note">
      来源拼接（无统一日志文件）：
      <template v-for="s in meta.sources" :key="s.id">
        <span class="ws-src">{{ s.label }}</span>
      </template>
    </p>
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
      <div v-if="lines.length === 0 && !error" class="ws-note">暂无日志（各来源均无记录）。</div>
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
