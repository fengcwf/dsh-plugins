<script setup>
// SourceHealthRow.vue — 源健康行组件（Task 20 / US-11）：每源状态 + 耗时 + 单源探针 + 真联网测试。
// INV-14 铁律：api.probe / api.onlineTest 只由按钮 click 触发，绝不进自动路径（测试 grep 钉死）。
// R23：单源探针超时 5s（Config.healthTimeoutMs 默认 5000，服务端裁决）；R30：online 总上限 10s 截断。
// K-11/K-22：交互控件禁条件渲染（class 绑定 + 计算文案）、零自造色（只引 --dsw-* / --ds-* token）、样式全在本组件 <style scoped>。
import { computed, onMounted, reactive } from 'vue'
import { SOURCE_IDS, SOURCE_LABELS } from '../lib/source-order.js'

const props = defineProps({
  /** 设置读写契约（settings-api createSettingsApi 实例）。 */
  api: { type: Object, default: null },
  /** 源清单 [{id,label}]；缺省=内置四源（自定义源由装配方传入）。 */
  sources: { type: Array, default: () => SOURCE_IDS.map((id) => ({ id, label: SOURCE_LABELS[id] })) },
})

/** 行级状态（四态：idle 未测 / loading 测试中 / ok / error）。 */
const rows = reactive({})
/** 全局真联网测试状态（四态同构）。 */
const online = reactive({ phase: 'idle', text: '', truncated: false })
const statsNote = reactive({ text: '', error: false })

function rowOf(id) {
  if (!rows[id]) rows[id] = { phase: 'idle', ok: false, elapsedMs: null, detail: '', count: null }
  return rows[id]
}

const onlineText = computed(() => {
  if (online.phase === 'loading') return '真联网测试中…（10s 总上限，会真实出网）'
  return online.text
})

function statusText(row) {
  if (row.phase === 'loading') return '测试中…'
  if (row.phase === 'idle') return '未测'
  return row.ok ? '✓ 成功' : '✗ 失败'
}

function statusClass(row) {
  if (row.phase === 'ok') return row.ok ? 'is-ok' : 'is-fail'
  if (row.phase === 'error') return 'is-fail'
  return 'is-idle'
}

function elapsedText(row) {
  return row.elapsedMs == null ? '—' : `${row.elapsedMs}ms`
}

/** 本地统计（GET /diagnostics，纯本地零出网，非探针）：取 trigger-log 逐源 stats 的最近耗时/成败。 */
async function loadStats() {
  if (!props.api || typeof props.api.diagnostics !== 'function') return
  try {
    const snapshot = await props.api.diagnostics()
    for (const stat of snapshot?.stats ?? []) {
      const row = rowOf(stat.name)
      if (row.phase === 'idle') {
        row.elapsedMs = stat.lastMs
        row.ok = stat.lastOk === true
        row.detail = `近 ${stat.count} 次 · ${stat.okCount} 成功`
        row.count = stat.count
      }
    }
    statsNote.text = '最近耗时/成败来自触发日志统计（重启即归零）'
    statsNote.error = false
  } catch (error) {
    statsNote.text = error?.message ?? String(error)
    statsNote.error = true
  }
}

/** 单源探针（INV-14：仅按钮触发）：绕过缓存与 guard，超时 = Config.healthTimeoutMs（R23 5s）。 */
async function onProbe(id) {
  const row = rowOf(id)
  row.phase = 'loading'
  try {
    const result = await props.api.probe(id)
    row.ok = result?.ok === true
    row.elapsedMs = result?.elapsedMs ?? null
    row.count = result?.resultCount ?? null
    row.detail = result?.detail ?? ''
    row.phase = 'ok'
  } catch (error) {
    row.phase = 'error'
    row.ok = false
    row.detail = error?.message ?? String(error)
  }
}

/** 真联网测试（INV-14：仅按钮触发）：10s 总上限（R30），超时源带「未测（超时截断）」如实展示。 */
async function onOnlineTest() {
  online.phase = 'loading'
  online.text = ''
  online.truncated = false
  try {
    const result = await props.api.onlineTest()
    for (const item of result?.results ?? []) {
      const row = rowOf(item.source)
      row.phase = 'ok'
      row.ok = item.ok === true
      row.elapsedMs = item.elapsedMs ?? null
      row.count = item.resultCount ?? null
      row.detail = item.detail ?? ''
    }
    online.truncated = result?.truncated === true
    online.text = `真联网测试完成：${(result?.results ?? []).filter((r) => r?.ok).length}/${(result?.results ?? []).length} 源返回结果 · 总耗时 ${result?.totalMs ?? '—'}ms · 预算 ${result?.budgetMs ?? '—'}ms`
    online.phase = 'ok'
  } catch (error) {
    online.phase = 'error'
    online.text = error?.message ?? String(error)
  }
}

onMounted(loadStats)
</script>

<template>
  <section class="sh-card" aria-label="源健康测试">
    <div class="sh-head">
      <h2 class="sh-title">源健康测试</h2>
      <span class="sh-count">{{ onlineText }}</span>
    </div>
    <p class="sh-desc">
      单源探针：绕过缓存与 guard，只测该源真实可达与耗时（超时 5s，R23）；「真联网测试」总上限 10s（R30），超时源如实标「未测（超时截断）」。真联网仅按钮点击触发（INV-14），不进默认测试集。
    </p>
    <div class="sh-rows">
      <div v-for="source in props.sources" :key="source.id" class="sh-row">
        <span class="sh-name">{{ source.label }}</span>
        <span class="sh-status" :class="statusClass(rowOf(source.id))">{{ statusText(rowOf(source.id)) }}</span>
        <span class="sh-elapsed">{{ elapsedText(rowOf(source.id)) }}</span>
        <span class="sh-detail">{{ rowOf(source.id).detail }}</span>
        <button class="sh-btn" type="button" @click="onProbe(source.id)">测试</button>
      </div>
    </div>
    <div class="sh-foot">
      <button class="sh-btn-wide" type="button" @click="onOnlineTest">真联网测试</button>
      <span class="sh-note" :class="{ 'is-error': statsNote.error }">
        {{ statsNote.text }}<span class="sh-note-sep">{{ online.truncated ? '未测（超时截断）：部分源超出 10s 总上限未及测试' : '' }}</span>
      </span>
    </div>
  </section>
</template>

<style scoped>
/* 样式全落组件内（Task 20 纪律：不碰 web/src/styles.css）；零自造色——只引 dsh token（K-11/K-22）。 */
.sh-card {
  box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;
  background: var(--dsw-alias-settings-card-fill);
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl); padding: 20px 20px 12px;
}
.sh-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.sh-title { margin: 0; font-size: var(--cs-fs-group, 14px); font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary); }
.sh-count { color: var(--dsw-alias-label-caption); font-size: var(--cs-fs-note, 12px); font-variant-numeric: tabular-nums; }
.sh-desc { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: var(--cs-fs-desc, 12px); line-height: 18px; }
.sh-rows { display: flex; flex-direction: column; }
.sh-row {
  display: flex; align-items: center; gap: 12px; min-height: 44px;
  padding: 8px 2px; border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  font-size: var(--cs-fs-desc, 12px); line-height: 18px;
}
.sh-row:last-child { border-bottom: 0; }
.sh-name { flex: none; min-width: 120px; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; }
.sh-status { flex: none; min-width: 56px; }
.sh-status.is-ok { color: var(--dsw-alias-state-success-primary); }
.sh-status.is-fail { color: var(--dsw-alias-state-error-primary); }
.sh-status.is-idle { color: var(--dsw-alias-label-caption); }
.sh-elapsed { flex: none; min-width: 56px; text-align: right; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.sh-detail { flex: 1; min-width: 0; color: var(--dsw-alias-label-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sh-btn, .sh-btn-wide {
  height: 24px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-family);
  font-size: var(--cs-fs-note, 12px); line-height: 18px; cursor: pointer; flex: none;
}
.sh-btn-wide { height: 32px; padding: 0 12px; border-radius: var(--dsw-radius-md); font-size: var(--cs-fs-intro, 13px); line-height: 20px; }
.sh-btn:hover, .sh-btn-wide:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sh-btn:focus-visible, .sh-btn-wide:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sh-foot { display: flex; align-items: center; gap: 12px; padding: 8px 2px 4px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.sh-note { color: var(--dsw-alias-label-tertiary); font-size: var(--cs-fs-note, 12px); line-height: 18px; }
.sh-note.is-error { color: var(--dsw-alias-state-error-primary); }
.sh-note-sep { margin-left: 12px; }
</style>
