<script setup>
// SourceCard.vue — 源管理大卡（Task 5 / T-E 合并，视觉定稿候选 2「行式两段」）。
// 收编面：源管理（T14）+ 每源代理勾选（原代理卡）+ 源健康行（R14 并入本卡后删除原独立组件）。
// 一源一行 = SourceRow 子组件（上排源名+代理勾选+启停，下排缩进测试+最近结果）；排序 = ⠿ 把手拖拽（R25 混排统一）。
// INV-14：api.probe / api.onlineTest 只由按钮触发；onMounted 只拉本地 diagnostics() 统计（非探针，零出网）。
// K-11/K-22：交互控件禁条件渲染（class 绑定 + 计算文案）、零自造色；注释避开字面锁扫描词。
import { computed, onMounted, reactive, ref } from 'vue'
import SourceRow from './SourceRow.vue'
import { SOURCE_LABELS, enabledCount, toggleSource } from '../lib/source-order.js'

const props = defineProps({
  api: { type: Object, default: null },
  sources: { type: Object, required: true },
  priority: { type: Array, required: true },
  /** 自定义源列表（settings.custom；行内显示徽标/域名小字与逐项代理勾选）。 */
  custom: { type: Array, default: () => [] },
  /** 每源走代理勾选（settings.useProxy，内置四源）。 */
  useProxy: { type: Object, default: () => ({}) },
  error: { type: String, default: '' },
})
const emit = defineEmits(['change'])

/** 行状态（最近结果 + 探针 busy）：{state:'idle'|'ok'|'fail', text, busy}。 */
const last = reactive({})
const onlineText = ref('')
const statsNote = ref('')

function rowState(id) {
  if (!last[id]) last[id] = { state: 'idle', text: '— 未测', busy: false }
  return last[id]
}

const rows = computed(() =>
  props.priority.map((id, index) => {
    const item = props.custom.find((entry) => entry.id === id)
    return {
      id,
      order: index + 1,
      label: item ? item.label : SOURCE_LABELS[id] ?? id,
      sub: item ? '' : id === 'ddg' || id === 'bing' ? '境外源' : '国内源',
      custom: Boolean(item),
      enabled: props.sources[id] !== false,
      proxy: item ? item.useProxy === true : props.useProxy[id] === true,
      proxyNote: item ? '自定义 · 默认直连' : id === 'ddg' || id === 'bing' ? '境外 · 默认走代理' : '国内 · 默认直连',
      last: rowState(id),
      canUp: index > 0,
      canDown: index < props.priority.length - 1,
    }
  }),
)

const countText = computed(() => {
  const base = `已启用 ${enabledCount(props.sources)}`
  return props.custom.length > 0
    ? `${props.priority.length} 源（含 ${props.custom.length} 自定义） · ${base}`
    : `${props.priority.length} 源 · ${base}`
})

/** 本地统计（GET /diagnostics，非探针零出网）：逐源 stats 的最近耗时/成败填行。 */
async function loadStats() {
  if (!props.api || typeof props.api.diagnostics !== 'function') return
  try {
    const snapshot = await props.api.diagnostics()
    for (const stat of snapshot?.stats ?? []) {
      const row = rows.value.find((entry) => entry.id === stat.name || entry.label === stat.name)
      if (!row) continue
      const state = rowState(row.id)
      if (state.state === 'idle' && stat.lastMs != null) {
        state.state = stat.lastOk === true ? 'ok' : 'fail'
        state.text = `${stat.lastOk === true ? '✓' : '✗'} ${stat.lastMs}ms · 近 ${stat.count} 次 ${stat.okCount} 成功`
      }
    }
    statsNote.value = '最近结果来自触发日志统计（重启即归零）'
  } catch {
    statsNote.value = ''
  }
}

/** 单源探针（INV-14 仅按钮）：结果回填行（成败+耗时+条数）。 */
async function onProbe(id) {
  const state = rowState(id)
  state.busy = true
  try {
    const result = await props.api.probe(id)
    state.state = result?.ok === true ? 'ok' : 'fail'
    state.text = result?.ok === true
      ? `✓ ${result?.elapsedMs ?? '—'}ms · ${result?.resultCount ?? 0} 条`
      : `✗ ${result?.elapsedMs ?? '—'}ms · ${result?.detail ?? '失败'}`
  } catch (error) {
    state.state = 'fail'
    state.text = `✗ ${error?.message ?? String(error)}`
  }
  state.busy = false
}

/** 真联网测试（INV-14 仅按钮；R30 10s 总上限截断如实标注）。 */
async function onOnlineTest() {
  onlineText.value = '真联网测试中…（10s 总上限，会真实出网）'
  try {
    const result = await props.api.onlineTest()
    for (const item of result?.results ?? []) {
      const state = rowState(item.source)
      if (item.detail === '未测（超时截断）') {
        state.state = 'idle'
        state.text = '— 未测（超时截断）'
      } else {
        state.state = item.ok === true ? 'ok' : 'fail'
        state.text = item.ok === true
          ? `✓ ${item.elapsedMs ?? '—'}ms · ${item.resultCount ?? 0} 条`
          : `✗ ${item.elapsedMs ?? '—'}ms · ${item.detail ?? '失败'}`
      }
    }
    onlineText.value = `真联网测试完成：总耗时 ${result?.totalMs ?? '—'}ms · 预算 ${result?.budgetMs ?? '—'}ms`
  } catch (error) {
    onlineText.value = error?.message ?? String(error)
  }
}

function onToggle(id) {
  emit('change', { sources: toggleSource(props.sources, id) })
}

function onProxy(row) {
  if (row.custom) {
    emit('change', {
      custom: props.custom.map((item) => (item.id === row.id ? { ...item, useProxy: !(item.useProxy === true) } : item)),
    })
    return
  }
  emit('change', { useProxy: { ...props.useProxy, [row.id]: !(props.useProxy[row.id] === true) } })
}

/** 排序唯一路径（T-E2）：拖拽 drop 与上移/下移降级按钮共用——fromIndex → toIndex 重排并整替写回。 */
function reorder(fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
  const order = [...props.priority]
  const [moved] = order.splice(fromIndex, 1)
  order.splice(toIndex, 0, moved)
  emit('change', { priority: order })
}
/** ⠿ 把手拖拽（R25 主交互）。 */
const dragId = ref('')
function onDragStart(id, event) {
  dragId.value = id
  event.dataTransfer.effectAllowed = 'move'
}
function onDragOver(event) {
  event.preventDefault()
}
function onDrop(id) {
  const from = dragId.value
  dragId.value = ''
  if (!from || from === id) return
  reorder(props.priority.indexOf(from), props.priority.indexOf(id))
}
/** 上移/下移降级按钮（键盘可达，与拖拽同一 reorder 路径）。 */
function onMove(id, delta) {
  const index = props.priority.indexOf(id)
  reorder(index, index + delta)
}

onMounted(loadStats)
</script>

<template>
  <section class="cs-card" aria-label="源管理">
    <div class="cs-card-head">
      <h2 class="cs-card-title">源管理</h2>
      <div class="cs-row-control">
        <span class="cs-count">{{ countText }}</span>
        <button class="cs-btn-ghost" type="button" @click="onOnlineTest">真联网测试</button>
      </div>
    </div>
    <p class="cs-card-desc">
      一源一行：源名 · 启停 · 代理勾选（境外源默认走代理/国内源默认直连，R21）· 健康测试 · 最近结果；⠿ 拖拽调整优先级
    </p>
    <div class="cs-rows">
      <div
        v-for="row in rows"
        :key="row.id"
        class="sc-drag-row"
        draggable="true"
        @dragstart="onDragStart(row.id, $event)"
        @dragover="onDragOver"
        @drop="onDrop(row.id)"
      >
        <SourceRow
          :order="row.order"
          :label="row.label"
          :sub="row.sub"
          :custom="row.custom"
          :enabled="row.enabled"
          :proxy="row.proxy"
          :proxy-note="row.proxyNote"
          :last-state="row.last.state"
          :last-text="row.last.text"
          :busy="row.last.busy"
          :can-up="row.canUp"
          :can-down="row.canDown"
          @toggle="onToggle(row.id)"
          @proxy="onProxy(row)"
          @probe="onProbe(row.id)"
          @move="onMove(row.id, $event)"
        />
      </div>
    </div>
    <div class="cs-hint">
      <span>「测试」= 单源探针（点击触发，超时 5s，INV-14/R23）；「真联网测试」总上限 10s，超时源标「未测（超时截断）」（R30）；代理勾选生效于搜索与探针出站（US-21/23）。{{ onlineText }}{{ statsNote }}</span>
    </div>
    <div class="cs-hint cs-error">{{ error }}</div>
  </section>
</template>

<style scoped>
.sc-drag-row { cursor: grab; }
.sc-drag-row:active { cursor: grabbing; }
</style>
