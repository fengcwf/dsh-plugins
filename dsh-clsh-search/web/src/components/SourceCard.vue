<script setup>
// SourceCard.vue — 源管理卡（Task 14）：四源开关 + 优先级排序。
// 排序控件 = DESIGN.md §5 降级路径「上移/下移按钮」（不引 element-plus，K-8）；
// 顺序代数/校验在 web/src/lib/source-order.js（纯模块），本组件只做展示与事件转发。
import { computed } from 'vue'
import {
  SOURCE_DESCS,
  SOURCE_IDS,
  SOURCE_LABELS,
  enabledCount,
  moveSource,
  toggleSource,
} from '../lib/source-order.js'

const props = defineProps({
  sources: { type: Object, required: true },
  priority: { type: Array, required: true },
  error: { type: String, default: '' },
})
const emit = defineEmits(['change'])

const countText = computed(() => `${SOURCE_IDS.length} 源 · 已启用 ${enabledCount(props.sources)}`)

function onToggle(id) {
  emit('change', { sources: toggleSource(props.sources, id) })
}

function onMove(id, delta) {
  emit('change', { priority: moveSource(props.priority, id, delta) })
}
</script>

<template>
  <section class="cs-card" aria-label="源管理">
    <div class="cs-card-head">
      <h2 class="cs-card-title">源管理</h2>
      <span class="cs-count">{{ countText }}</span>
    </div>
    <p class="cs-card-desc">
      按优先级自上而下回退；单源失败自动切换下一家，反爬/验证码命中即停不重试
    </p>
    <div class="cs-rows">
      <div v-for="(id, index) in priority" :key="id" class="cs-row">
        <span class="cs-order">{{ index + 1 }}</span>
        <div class="cs-row-main">
          <div class="cs-row-label">{{ SOURCE_LABELS[id] }}</div>
          <div class="cs-row-desc">{{ SOURCE_DESCS[id] }}</div>
        </div>
        <div class="cs-row-control">
          <button
            class="cs-step-btn"
            type="button"
            :disabled="index === 0"
            aria-label="上移一位"
            @click="onMove(id, -1)"
          >▲</button>
          <button
            class="cs-step-btn"
            type="button"
            :disabled="index === priority.length - 1"
            aria-label="下移一位"
            @click="onMove(id, 1)"
          >▼</button>
          <button
            class="cs-switch"
            :class="{ 'is-off': !sources[id] }"
            type="button"
            role="switch"
            :aria-checked="String(Boolean(sources[id]))"
            :aria-label="`${SOURCE_LABELS[id]} 开关`"
            @click="onToggle(id)"
          ><span class="cs-thumb"></span></button>
        </div>
      </div>
    </div>
    <div class="cs-hint">
      <span>▲▼ 调整优先级顺序（<code>sources.priority</code>）；开关对应 <code>sources.&lt;id&gt;</code>（ddg/bing/so360/baidu），任一源关闭即跳过</span>
    </div>
    <div class="cs-hint cs-error">{{ error }}</div>
  </section>
</template>
