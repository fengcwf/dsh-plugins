<script setup>
// App — 面板容器（编排层）：数据获取 + 状态编排；展示全在子组件，逻辑全在 lib/ 纯模块
// （容器/展示分离，组件 ≤300 行）。日志面=LogHistoryView（Task F1 历史入口同款复用，
// 数据面状态机在 lib/log-history.js 纯模块）。
import { ref, onMounted } from 'vue'
import IngestTriggerPanel from './components/IngestTriggerPanel.vue'
import LogHistoryView from './components/LogHistoryView.vue'
import IngestSettingsPanel from './components/IngestSettingsPanel.vue'
import { initialTriggerState, beginTrigger, finishTrigger } from './lib/trigger-model.js'

const props = defineProps({ api: { type: Object, required: true } })

const settings = ref(null)
const settingsError = ref('')
const triggerState = ref(initialTriggerState())
const logView = ref(null)

async function loadSettings() {
  try {
    settings.value = await props.api.fetchSettings()
    settingsError.value = ''
  } catch (e) {
    settingsError.value = String(e?.message ?? e)
  }
}

async function runScan() {
  triggerState.value = beginTrigger(triggerState.value, 'scan')
  try {
    const r = await props.api.scan()
    triggerState.value = finishTrigger(triggerState.value, 'scan', r)
    await logView.value?.reload() // 增量清单写日志面板 → 触发后立即可见
  } catch (e) {
    triggerState.value = finishTrigger(triggerState.value, 'scan', {
      ok: false, exitCode: null, summary: {}, output: String(e?.message ?? e), logFile: null,
    })
  }
}

async function runDistill() {
  triggerState.value = beginTrigger(triggerState.value, 'distill')
  try {
    const r = await props.api.distill()
    triggerState.value = finishTrigger(triggerState.value, 'distill', r)
  } catch (e) {
    triggerState.value = finishTrigger(triggerState.value, 'distill', {
      started: false, reason: 'request-failed', note: `触发失败：${String(e?.message ?? e)}`, logFile: null,
    })
  }
}

onMounted(loadSettings)
</script>

<template>
  <div class="ws-root">
    <IngestTriggerPanel
      :state="triggerState"
      :channel="settings?.channel ?? null"
      @scan="runScan"
      @distill="runDistill"
    />
    <LogHistoryView ref="logView" :api="props.api" />
    <IngestSettingsPanel :settings="settings" :error="settingsError" />
  </div>
</template>
