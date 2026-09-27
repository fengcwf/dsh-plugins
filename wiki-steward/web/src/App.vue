<script setup>
// App — 面板容器（编排层）：数据获取 + 状态编排；展示全在子组件，逻辑全在 lib/ 纯模块
// （容器/展示分离，组件 ≤300 行）。
import { ref, onMounted } from 'vue'
import IngestTriggerPanel from './components/IngestTriggerPanel.vue'
import IngestLogPanel from './components/IngestLogPanel.vue'
import IngestSettingsPanel from './components/IngestSettingsPanel.vue'
import { initialTriggerState, beginTrigger, finishTrigger } from './lib/trigger-model.js'
import { prependChunk } from './lib/log-view.js'

const props = defineProps({ api: { type: Object, required: true } })

const PAGE = 200
const settings = ref(null)
const settingsError = ref('')
const logLines = ref([])
const logMeta = ref({ hasMore: false, cursor: null, sources: [], stale: false })
const logError = ref('')
const triggerState = ref(initialTriggerState())

async function reloadLogs() {
  try {
    const data = await props.api.fetchLogs(PAGE)
    logLines.value = data.lines
    logMeta.value = { hasMore: data.hasMore, cursor: data.cursor, sources: data.sources, stale: data.stale === true }
    logError.value = ''
  } catch (e) {
    logError.value = String(e?.message ?? e)
  }
}

async function loadOlder() {
  if (!logMeta.value.hasMore) return
  try {
    const data = await props.api.fetchLogs(PAGE, logMeta.value.cursor)
    logLines.value = prependChunk(logLines.value, data.lines)
    logMeta.value = { ...logMeta.value, hasMore: data.hasMore, cursor: data.cursor, stale: data.stale === true }
    logError.value = ''
  } catch (e) {
    logError.value = String(e?.message ?? e)
  }
}

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
    await reloadLogs() // 增量清单写日志面板 → 触发后立即可见
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

onMounted(() => {
  loadSettings()
  reloadLogs()
})
</script>

<template>
  <div class="ws-root">
    <IngestTriggerPanel
      :state="triggerState"
      :channel="settings?.channel ?? null"
      @scan="runScan"
      @distill="runDistill"
    />
    <IngestLogPanel
      :lines="logLines"
      :meta="logMeta"
      :error="logError"
      @load-older="loadOlder"
      @reload="reloadLogs"
    />
    <IngestSettingsPanel :settings="settings" :error="settingsError" />
  </div>
</template>
