<script setup>
// BudgetCard.vue — 性能预算卡（Task 15）：行内数字输入 + 结果条数滑杆 + 缓存 TTL 下拉。
// 校验/换算/clamp 在 web/src/lib/budget-model.js（纯模块），本组件只做展示与事件转发。
import { computed } from 'vue'
import {
  BUDGET_FIELDS,
  CACHE_TTL_OPTIONS,
  MAX_RESULTS_RANGE,
  clampMaxResults,
  msToSeconds,
  secondsToMs,
  validateBudget,
} from '../lib/budget-model.js'

const props = defineProps({
  /** 设置面模型（budget 键 + 值）。 */
  values: { type: Object, required: true },
  /** 字段校验提示（App 汇合 validateSettings）。 */
  errors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['change'])

const numberRows = computed(() => BUDGET_FIELDS.filter((f) => f.key === 'timeoutMs' || f.key === 'retries' || f.key === 'chainBudgetMs' || f.key === 'egoBudget'))

function displayValue(key) {
  return key === 'timeoutMs' || key === 'chainBudgetMs' ? msToSeconds(props.values[key]) : props.values[key]
}

function onNumberInput(key, raw) {
  const check = validateBudget(key, key === 'timeoutMs' || key === 'chainBudgetMs' ? secondsToMs(raw) : raw)
  if (!check.ok) {
    emit('change', { [key]: props.values[key], fieldError: { [key]: check.message } })
    return
  }
  emit('change', { [key]: check.value, fieldError: { [key]: '' } })
}

function onSlider(raw) {
  emit('change', { maxResults: clampMaxResults(raw), fieldError: { maxResults: '' } })
}

function onTtlSelect(raw) {
  emit('change', { cacheTtlMs: Number(raw), fieldError: { cacheTtlMs: '' } })
}
</script>

<template>
  <section class="cs-card" aria-label="性能预算">
    <div class="cs-card-head">
      <h2 class="cs-card-title">性能预算</h2>
      <span class="cs-count">默认值 = R5 确认值</span>
    </div>
    <p class="cs-card-desc">超时/重试/整链预算为单调熔断守卫：整链超预算即中止并明示失败原因</p>
    <div class="cs-rows">
      <div v-for="field in numberRows" :key="field.key" class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">{{ field.label }}</div>
          <div class="cs-row-desc">{{ field.desc }}</div>
        </div>
        <div class="cs-row-control">
          <input
            class="cs-num"
            type="number"
            :min="field.key === 'timeoutMs' || field.key === 'chainBudgetMs' ? 1 : field.min"
            :value="displayValue(field.key)"
            :aria-label="field.label"
            @change="onNumberInput(field.key, $event.target.value)"
          >
          <span class="cs-unit">{{ field.unit }}</span>
          <span class="cs-row-note">{{ field.key === 'egoBudget' ? '上限守卫' : '' }}</span>
          <span class="cs-row-note cs-error">{{ errors[field.key] || '' }}</span>
        </div>
      </div>

      <div class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">结果条数</div>
          <div class="cs-row-desc">返回给模型的结果条数，clamp 1–10</div>
        </div>
        <div class="cs-row-control cs-slider-wrap">
          <input
            class="cs-range"
            type="range"
            :min="MAX_RESULTS_RANGE.min"
            :max="MAX_RESULTS_RANGE.max"
            :step="MAX_RESULTS_RANGE.step"
            :value="values.maxResults"
            aria-label="结果条数"
            @change="onSlider($event.target.value)"
          >
          <input
            class="cs-num"
            type="number"
            :min="MAX_RESULTS_RANGE.min"
            :max="MAX_RESULTS_RANGE.max"
            :value="values.maxResults"
            aria-label="结果条数（数字）"
            @change="onSlider($event.target.value)"
          >
          <span class="cs-unit">条</span>
          <span class="cs-row-note">1–10</span>
          <span class="cs-row-note cs-error">{{ errors.maxResults || '' }}</span>
        </div>
      </div>

      <div class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">缓存 TTL</div>
          <div class="cs-row-desc">LRU 50 条；命中缓存不发起网络请求</div>
        </div>
        <div class="cs-row-control">
          <select
            class="cs-select"
            :value="values.cacheTtlMs"
            aria-label="缓存 TTL"
            @change="onTtlSelect($event.target.value)"
          >
            <option v-for="opt in CACHE_TTL_OPTIONS" :key="opt.valueMs" :value="opt.valueMs">{{ opt.label }}</option>
          </select>
          <span class="cs-row-note cs-error">{{ errors.cacheTtlMs || '' }}</span>
        </div>
      </div>
    </div>
    <div class="cs-hint">
      <span>键面与 Config 一一对应：<code>timeoutMs / retries / chainBudgetMs / maxResults / cacheTtlMs / egoBudget</code></span>
    </div>
  </section>
</template>
