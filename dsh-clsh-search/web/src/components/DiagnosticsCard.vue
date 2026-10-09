<script setup>
// DiagnosticsCard.vue — 诊断卡（Task 19 / DESIGN.md §5 V1）：自检清单 + 指标条 + 按钮组。
// 状态与数据全部走 settings-api 契约（t27）：api.diagnostics() = {items, summary, log, ego, stats}。
// 四态状态机 idle/loading/ok/error（K-11：交互控件禁条件渲染——激活态走 class 绑定与计算文案）。
// INV-14：真联网测试（api.onlineTest）只由按钮 click 触发；onMounted 仅拉本地自检（GET /diagnostics，零出网）。
// INV-11：日志指标区明示「不落盘、重启即清空」。文案唯一事实源在本组件（grep 断言钉关键词）。
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  /** 设置读写契约（settings-api createSettingsApi 实例；缺省=只读展示）。 */
  api: { type: Object, default: null },
})
const emit = defineEmits(['open-log'])

/** 四态状态机（idle → loading → ok | error）。 */
const phase = ref('idle')
const snapshot = ref({ items: [], summary: '尚未检查', log: { available: true, used: 0, capacity: 0 }, ego: { used: 0, limit: 0 }, stats: [] })
const errorText = ref('')
const onlinePhase = ref('idle')
const onlineText = ref('')
const cachePhase = ref('idle')
const cacheText = ref('')

const phaseText = computed(() => {
  if (phase.value === 'loading') return '检查中…'
  if (phase.value === 'error') return '检查失败'
  return phase.value === 'ok' ? snapshot.value.summary : '尚未检查'
})

const onlineTextShown = computed(() => {
  if (onlinePhase.value === 'loading') return '真联网测试中…（会真实出网）'
  return onlineText.value
})

const cacheTextShown = computed(() => {
  if (cachePhase.value === 'loading') return '清空中…'
  return cacheText.value
})

const logMetric = computed(() => `${snapshot.value.log.used} / ${snapshot.value.log.capacity}`)
const egoMetric = computed(() => `${snapshot.value.ego.used} / ${snapshot.value.ego.limit}`)
/** INV-13 诚实态：内存环不可用时明示「日志不可用」，不粉饰数字。 */
const logLabel = computed(() =>
  snapshot.value.log.available ? '触发日志（进程内存环）' : '日志不可用（内存环写失败，INV-13 如实明示）',
)

/** 本地自检（GET /diagnostics，纯本地零出网）：进页自动拉取一次 + 「重新自检」按钮复跑。 */
async function runSelfCheck() {
  phase.value = 'loading'
  errorText.value = ''
  if (!props.api || typeof props.api.diagnostics !== 'function') {
    phase.value = 'error'
    errorText.value = '设置读写契约缺位，无法自检（只读展示）'
    return
  }
  try {
    snapshot.value = await props.api.diagnostics()
    phase.value = 'ok'
  } catch (error) {
    phase.value = 'error'
    errorText.value = error?.message ?? String(error)
  }
}

/** 真联网测试（INV-14：仅按钮触发，绝不自动跑）。 */
async function runOnlineTest() {
  onlinePhase.value = 'loading'
  onlineText.value = ''
  try {
    const result = await props.api.onlineTest()
    const okCount = Array.isArray(result?.results) ? result.results.filter((r) => r?.ok).length : 0
    const total = Array.isArray(result?.results) ? result.results.length : 0
    onlineText.value = `真联网测试完成：${okCount}/${total} 源返回结果 · 总耗时 ${result?.totalMs ?? '—'}ms${result?.truncated ? ' · 未测（超时截断）' : ''}`
    onlinePhase.value = 'ok'
  } catch (error) {
    onlinePhase.value = 'error'
    onlineText.value = error?.message ?? String(error)
  }
}

/** 手动清缓存（US-16 搭车项）：只清结果缓存，不动设置与日志。 */
async function runClearCache() {
  cachePhase.value = 'loading'
  cacheText.value = ''
  try {
    const result = await props.api.clearCache()
    cacheText.value = `已清空结果缓存${typeof result?.cleared === 'number' ? `（${result.cleared} 条）` : ''}`
    cachePhase.value = 'ok'
  } catch (error) {
    cachePhase.value = 'error'
    cacheText.value = error?.message ?? String(error)
  }
}

function onOpenLog() {
  emit('open-log')
}

onMounted(runSelfCheck)
</script>

<template>
  <section class="cs-card" aria-label="诊断">
    <div class="cs-card-head">
      <h2 class="cs-card-title">诊断</h2>
      <span class="cs-count">{{ phaseText }}</span>
    </div>
    <p class="cs-card-desc">
      本地自检不出网（Config 可读、源开关、写缝在场、缓存目录可写等）；「真联网测试」须点击触发，默认测试集离线绿（INV-14）
    </p>
    <div class="cs-rows">
      <div class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">插件自检</div>
          <div class="cs-row-desc">{{ phaseText }}</div>
        </div>
        <div class="cs-row-control">
          <button class="cs-btn-ghost" type="button" @click="runSelfCheck">重新自检</button>
          <button class="cs-btn-ghost" type="button" @click="runOnlineTest">真联网测试</button>
          <button class="cs-btn-tiny" type="button" @click="onOpenLog">查看触发日志</button>
          <button class="cs-btn-tiny" type="button" @click="runClearCache">手动清缓存</button>
        </div>
      </div>
    </div>
    <div class="cs-check-list" :class="{ 'is-loading': phase === 'loading', 'is-error': phase === 'error' }">
      <div v-for="item in snapshot.items" :key="item.id" class="cs-check-row">
        <span class="cs-check-name">{{ item.label }}</span>
        <span class="cs-check-detail">{{ item.detail }}</span>
        <span class="cs-check-status" :class="item.status === 'pass' ? 'is-ok' : 'is-fail'">{{ item.status === 'pass' ? '✓ 正常' : '✗ 失败' }}</span>
      </div>
    </div>
    <div class="cs-metrics">
      <div class="cs-metric">
        <span class="cs-metric-value">{{ egoMetric }}</span>
        <span class="cs-metric-label">ego-browser 已用 / 预算（真实计数，INV-20）</span>
      </div>
      <div class="cs-metric">
        <span class="cs-metric-value">LRU 50 条</span>
        <span class="cs-metric-label">结果缓存（条目上限；TTL 见性能预算卡）</span>
      </div>
      <div class="cs-metric">
        <span class="cs-metric-value">{{ logMetric }}</span>
        <span class="cs-metric-label">{{ logLabel }}</span>
      </div>
    </div>
    <div class="cs-tip">
      <svg class="cs-tip-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <p>
        触发日志仅存进程内存环，<b>不落盘、重启即清空</b>（INV-11）；「真联网测试」会真实出网请求各搜索源，仅按钮点击触发、不进默认测试集（INV-14）。
      </p>
    </div>
    <div class="cs-hint">
      <span>{{ onlineTextShown }}</span>
      <span class="cs-hint-sep">{{ cacheTextShown }}</span>
      <span class="cs-hint-sep cs-error">{{ errorText }}</span>
    </div>
  </section>
</template>
