<script setup>
// App — 面板容器（编排层）：数据获取 + 状态编排；展示全在子组件，逻辑全在 lib/ 纯模块
// （容器/展示分离，组件 ≤300 行）。日志面=LogHistoryView（Task F1 历史入口同款复用，
// 数据面状态机在 lib/log-history.js 纯模块）；Hindsight 同步节（t12 六控件）挂载位在此，
// 状态模型/日历聚合/时间校验在 lib/hindsight-model.js 纯模块。
import { ref, onMounted } from 'vue'
import IngestTriggerPanel from './components/IngestTriggerPanel.vue'
import LogHistoryView from './components/LogHistoryView.vue'
import IngestSettingsPanel from './components/IngestSettingsPanel.vue'
import HindsightSyncPanel from './components/HindsightSyncPanel.vue'
import { initialTriggerState, beginTrigger, finishTrigger } from './lib/trigger-model.js'
import {
  initialActionState, beginAction, finishAction, aggregateSyncCalendar, normalizeHhmm,
} from './lib/hindsight-model.js'

const props = defineProps({
  api: { type: Object, required: true },
  // 面板面形（t14 挂载缝）：'full'=全量面板（缺省，契约向后兼容）；'hindsight'=只渲染
  // Hindsight 同步节（设置节挂载缝消费——六控件可见可达，不与设置节既有内容重叠）。
  view: { type: String, default: 'full' },
})
const onlyHindsight = () => props.view === 'hindsight'

const settings = ref(null)
const settingsError = ref('')
const triggerState = ref(initialTriggerState())
const logView = ref(null)

// ── Hindsight 同步节（六控件数据编排）：status/sync-log 两路加载各报各错，失败如实不白屏 ──
const hsStatus = ref(null)
const hsStatusError = ref('')
const hsCalendar = ref(null)
const hsCalendarError = ref('')
const hsActions = ref(initialActionState())
const hsTime = ref('')

async function loadHindsight() {
  try {
    hsStatus.value = await props.api.fetchHindsightStatus()
    hsStatusError.value = ''
    hsTime.value = String(hsStatus.value?.schedule?.time ?? '')
  } catch (e) {
    hsStatus.value = null
    hsStatusError.value = `Hindsight 状态加载失败：${String(e?.message ?? e)}`
  }
  try {
    const log = await props.api.fetchHindsightSyncLog()
    hsCalendar.value = aggregateSyncCalendar(log?.lines ?? [])
    hsCalendarError.value = ''
  } catch (e) {
    hsCalendar.value = null
    hsCalendarError.value = `同步日历加载失败：${String(e?.message ?? e)}`
  }
}

async function runHindsightSync() {
  hsActions.value = beginAction(hsActions.value, 'sync')
  try {
    const r = await props.api.syncHindsight()
    hsActions.value = finishAction(hsActions.value, 'sync', {
      ok: r?.started === true,
      message: String(r?.note ?? ''),
    })
  } catch (e) {
    hsActions.value = finishAction(hsActions.value, 'sync', { ok: false, message: String(e?.message ?? e) })
  }
}

async function toggleHindsightL1(enabled) {
  hsActions.value = beginAction(hsActions.value, 'toggle')
  try {
    await props.api.toggleHindsight(enabled)
    hsActions.value = finishAction(hsActions.value, 'toggle', {
      ok: true,
      message: `L1 同步已${enabled ? '启用' : '停用'}（热改立即生效）`,
    })
    await loadHindsight()
  } catch (e) {
    hsActions.value = finishAction(hsActions.value, 'toggle', { ok: false, message: String(e?.message ?? e) })
  }
}

async function saveHindsightTime(value) {
  const v = normalizeHhmm(value)
  if (v === null) {
    hsActions.value = finishAction(hsActions.value, 'time', { ok: false, message: '时间须为 HH:MM（00:00–23:59）' })
    return
  }
  hsActions.value = beginAction(hsActions.value, 'time')
  try {
    await props.api.saveSettings({ hindsight: { sync: { schedule: { time: v } } } })
    hsActions.value = finishAction(hsActions.value, 'time', { ok: true, message: `同步时间已保存：${v}（热改立即生效）` })
    await loadHindsight()
  } catch (e) {
    hsActions.value = finishAction(hsActions.value, 'time', { ok: false, message: String(e?.message ?? e) })
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

onMounted(() => {
  loadSettings()
  loadHindsight()
})
</script>

<template>
  <div class="ws-root" :data-ws-panel-view="view" :class="onlyHindsight() ? 'ws-root--hindsight' : 'ws-root--full'">
    <HindsightSyncPanel
      :status="hsStatus"
      :status-error="hsStatusError"
      :calendar="hsCalendar"
      :calendar-error="hsCalendarError"
      :actions="hsActions"
      :time-value="hsTime"
      @sync="runHindsightSync"
      @toggle="toggleHindsightL1"
      @save-time="saveHindsightTime"
      @update:time-value="hsTime = $event"
      @reload="loadHindsight"
    />
    <template v-if="!onlyHindsight()">
      <IngestTriggerPanel
        :state="triggerState"
        :channel="settings?.channel ?? null"
        @scan="runScan"
        @distill="runDistill"
      />
      <LogHistoryView ref="logView" :api="props.api" />
      <IngestSettingsPanel :settings="settings" :error="settingsError" />
    </template>
  </div>
</template>
