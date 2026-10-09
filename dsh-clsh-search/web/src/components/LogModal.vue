<script setup>
// LogModal.vue — 触发日志弹层（Task 21 / US-9 / DESIGN.md §5 V2）：640 居中 Modal + 尾部 N 行滚动。
// 范式 = kb-context 触发日志 Modal（kc/lib/client.js:283-296：尾部行 + 滚动 + 清空 + N/容量）。
// INV-11：「不落盘、重启即清空」明示常驻可见。INV-12：条目只渲脱敏摘要 queryDigest{len,first}，零完整查询词。
// R28：「清空日志」只清内存环（api.clearLogs），不动搜索主链。INV-13：logs_unavailable 明示 + hint 可执行下一步。
// K-11/K-22：交互控件禁条件渲染（v-show + class 绑定 + 计算文案）、零自造色、样式全在本组件 <style scoped>。
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps({
  /** 设置读写契约（settings-api createSettingsApi 实例）。 */
  api: { type: Object, default: null },
  /** 弹层开合（装配方控制；打开即拉日志）。 */
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

/** 尾部展示行数（kc 形制：超出滚动）。 */
const TAIL_ROWS = 50

const phase = ref('idle')
const entries = ref([])
const capacity = ref(0)
const errorInfo = reactive({ code: '', message: '', hint: '' })
const clearInfo = reactive({ phase: 'idle', text: '' })

const capacityText = computed(() => `${entries.value.length} / ${capacity.value} 条`)
const tailEntries = computed(() => entries.value.slice(-TAIL_ROWS))
const stateText = computed(() => {
  if (phase.value === 'loading') return '加载中…'
  if (phase.value === 'error') {
    return errorInfo.code === 'logs_unavailable'
      ? '日志不可用（503 logs_unavailable，内存环写失败）'
      : errorInfo.message || '日志读取失败'
  }
  return phase.value === 'ok' ? `尾部 ${tailEntries.value.length} 行 · 按时间倒序` : '尚未加载'
})
const clearText = computed(() => (clearInfo.phase === 'loading' ? '清空中…' : clearInfo.text))

function queryDigestText(item) {
  const digest = item?.queryDigest ?? {}
  return `查询「${digest.first ?? '—'}…」${digest.len ?? 0} 字`
}

function sourceNames(item) {
  return (item?.sources ?? []).map((s) => s?.name ?? '—').join(' / ')
}

function fmtTime(ts) {
  const date = new Date(Number(ts) || 0)
  return date.toTimeString().slice(0, 8)
}

function elapsedText(item) {
  return item?.elapsedMs == null ? '—' : `${item.elapsedMs}ms`
}

/** 拉取日志（GET /logs，本地内存环读面，零出网）；环不可用 → errorInfo.code=logs_unavailable 明示。 */
async function loadLogs() {
  phase.value = 'loading'
  errorInfo.code = ''
  errorInfo.message = ''
  errorInfo.hint = ''
  if (!props.api || typeof props.api.logs !== 'function') {
    phase.value = 'error'
    errorInfo.message = '设置读写契约缺位，无法读取日志'
    errorInfo.hint = '请检查插件 API 注入后点击「重试」'
    return
  }
  try {
    const view = await props.api.logs()
    entries.value = Array.isArray(view?.entries) ? view.entries : []
    capacity.value = view?.capacity ?? 0
    phase.value = 'ok'
  } catch (error) {
    phase.value = 'error'
    errorInfo.code = error?.code ?? ''
    errorInfo.message = error?.message ?? String(error)
    errorInfo.hint = error?.hint ?? '请重试；重启后自愈（INV-13 如实明示，不粉饰）'
  }
}

/** 清空日志（R28）：只清内存环，清后复拉。 */
async function onClearLogs() {
  clearInfo.phase = 'loading'
  clearInfo.text = ''
  try {
    const result = await props.api.clearLogs()
    clearInfo.text = `已清空内存环${typeof result?.cleared === 'number' ? `（${result.cleared} 条）` : ''}`
    clearInfo.phase = 'ok'
    await loadLogs()
  } catch (error) {
    clearInfo.phase = 'error'
    clearInfo.text = error?.message ?? String(error)
  }
}

function onClose() {
  emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) loadLogs()
  },
)
</script>

<template>
  <div v-show="props.open" class="lm-scrim" role="dialog" aria-modal="true" aria-label="触发日志">
    <div class="lm-modal">
      <div class="lm-head">
        <span class="lm-title">触发日志</span>
        <div class="lm-head-right">
          <span class="lm-capacity">{{ capacityText }}</span>
          <button class="lm-close" type="button" aria-label="关闭" @click="onClose">✕</button>
        </div>
      </div>
      <div class="lm-tip">
        <svg class="lm-tip-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <p>
          仅存进程内存环（超出丢最旧），<b>不落盘、重启即清空</b>（INV-11）；条目只记脱敏摘要（长度 + 首词），不含完整查询词与响应正文（INV-12）。
        </p>
      </div>
      <div class="lm-body">
        <div v-for="(item, index) in tailEntries" :key="`${item.ts}-${index}`" class="lm-row">
          <span class="lm-time">{{ fmtTime(item.ts) }}</span>
          <span class="lm-query">{{ queryDigestText(item) }}</span>
          <span class="lm-src">{{ sourceNames(item) }}</span>
          <span class="lm-count">{{ item.resultCount ?? 0 }} 条</span>
          <span class="lm-ms">{{ elapsedText(item) }}</span>
          <span class="lm-status" :class="item.ok ? 'is-ok' : 'is-fail'">{{ item.ok ? '✓ 成功' : '✗ 失败' }}</span>
        </div>
        <div class="lm-empty" :class="{ 'is-error': phase === 'error' }">
          <span>{{ stateText }}</span>
          <span class="lm-empty-sep">{{ errorInfo.hint }}</span>
          <button class="lm-btn" type="button" @click="loadLogs">重试</button>
        </div>
      </div>
      <div class="lm-foot">
        <button class="lm-btn-wide" type="button" @click="onClearLogs">清空日志</button>
        <span class="lm-note">{{ clearText }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 样式全落组件内（不碰 web/src/styles.css）；零自造色——只引 dsh token（K-11/K-22）。 */
.lm-scrim {
  position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-start; justify-content: center;
  padding-top: 10vh; background: color-mix(in srgb, var(--dsw-alias-label-primary), transparent 45%);
}
.lm-modal {
  width: 640px; max-width: calc(100vw - 48px); max-height: 72vh; display: flex; flex-direction: column;
  background: var(--dsw-alias-settings-card-fill);
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-lg);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary), transparent 82%);
}
.lm-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.lm-head-right { display: flex; align-items: center; gap: 12px; }
.lm-title { font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.lm-capacity { color: var(--dsw-alias-label-caption); font-size: var(--cs-fs-note, 12px); font-variant-numeric: tabular-nums; }
.lm-close { border: 0; background: transparent; color: var(--dsw-alias-label-tertiary); font-size: 14px; cursor: pointer; }
.lm-tip {
  display: flex; align-items: flex-start; gap: 8px; margin: 12px 16px 4px; padding: 10px 12px;
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-label-secondary); font-size: var(--cs-fs-desc, 12px); line-height: 18px;
}
.lm-tip-icon { color: var(--dsw-alias-state-warn-primary); flex: none; margin-top: 2px; }
.lm-tip p { margin: 0; }
.lm-body { flex: 1; min-height: 120px; overflow: auto; padding: 4px 16px 8px; }
.lm-row {
  display: flex; align-items: center; gap: 12px; padding: 9px 2px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  font-size: var(--cs-fs-desc, 12px); line-height: 18px; color: var(--dsw-alias-label-primary);
}
.lm-time { flex: none; width: 62px; color: var(--dsw-alias-label-caption); font-variant-numeric: tabular-nums; }
.lm-query { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lm-src { flex: none; width: 110px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lm-count, .lm-ms { flex: none; width: 52px; text-align: right; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.lm-status { flex: none; width: 56px; text-align: right; }
.lm-status.is-ok { color: var(--dsw-alias-state-success-primary); }
.lm-status.is-fail { color: var(--dsw-alias-state-error-primary); }
.lm-empty { display: flex; align-items: center; gap: 12px; padding: 12px 2px; color: var(--dsw-alias-label-tertiary); font-size: var(--cs-fs-note, 12px); line-height: 18px; }
.lm-empty.is-error { color: var(--dsw-alias-state-error-primary); }
.lm-empty-sep { flex: 1; min-width: 0; color: var(--dsw-alias-label-caption); }
.lm-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px 14px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.lm-note { color: var(--dsw-alias-label-caption); font-size: var(--cs-fs-note, 12px); line-height: 18px; }
.lm-btn, .lm-btn-wide {
  height: 24px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-family);
  font-size: var(--cs-fs-note, 12px); line-height: 18px; cursor: pointer; flex: none;
}
.lm-btn-wide { height: 32px; padding: 0 12px; border-radius: var(--dsw-radius-md); font-size: var(--cs-fs-intro, 13px); line-height: 20px; }
.lm-btn:hover, .lm-btn-wide:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.lm-btn:focus-visible, .lm-btn-wide:focus-visible, .lm-close:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
</style>
