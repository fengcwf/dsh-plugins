<script setup>
// IngestTriggerPanel — 手动触发 ingest 双动作（展示层；状态机在 lib/trigger-model.js）。
// 裁定语义：「扫描增量」=机械面；「触发蒸馏」=呼叫任务通道（蒸馏由任务执行，按钮不做 LLM 蒸馏）；
// 通道不可用则不渲染蒸馏按钮（不造按钮），面板写明蒸馏走夜间任务/手动会话。
import { computed } from 'vue'

const props = defineProps({
  state: { type: Object, required: true },
  channel: { type: Object, default: null },
})
const emit = defineEmits(['scan', 'distill'])

const distillAvailable = computed(() => props.channel?.available === true)
const scanRunning = computed(() => props.state.scan.status === 'running')
const distillRunning = computed(() => props.state.distill.status === 'running')
</script>

<template>
  <section class="ws-block" aria-label="手动触发 ingest">
    <h3 class="ws-title">手动触发 ingest</h3>
    <p class="ws-note">
      双动作：「扫描增量」只跑机械面（ingest-pipeline.py scan，只读）；「触发蒸馏」呼叫
      headless 任务通道（dsh-cron wiki-ingest），<strong>蒸馏由任务执行</strong>（本面板不做 LLM 蒸馏）。
    </p>
    <div class="ws-actions">
      <button
        class="ws-btn"
        type="button"
        :disabled="scanRunning"
        @click="emit('scan')"
      >扫描增量</button>
      <button
        v-if="distillAvailable"
        class="ws-btn ws-btn-primary"
        type="button"
        :disabled="distillRunning"
        @click="emit('distill')"
      >触发蒸馏</button>
    </div>
    <p v-if="channel && !distillAvailable" class="ws-note">
      蒸馏通道不可用：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill。
    </p>
    <p v-if="state.scan.message" class="ws-status" role="status">{{ state.scan.message }}</p>
    <p v-if="state.distill.message" class="ws-status" role="status">{{ state.distill.message }}</p>
  </section>
</template>
