<script setup>
// TakeoverCard.vue — 接管与隐私卡（Task 16）：三态 segmented + 隐私提示条。
// 三态映射/默认值/隐私文案在 web/src/lib/takeover-model.js（纯模块），本组件只做展示与事件转发。
// K-10：强制接管（force）只在显式选择时高亮——激活态由 normalizeTakeOver 比对，无默认高亮路径。
import { TAKE_OVER_OPTIONS, isTakeOverActive, PRIVACY_NOTICE } from '../lib/takeover-model.js'

const props = defineProps({
  takeOver: { type: String, default: 'auto' },
})
const emit = defineEmits(['change'])

function onSelect(value) {
  emit('change', { takeOver: value })
}
</script>

<template>
  <section class="cs-card" aria-label="接管与隐私">
    <div class="cs-card-head">
      <h2 class="cs-card-title">接管与隐私</h2>
      <span class="cs-count">默认：让位优先</span>
    </div>
    <p class="cs-card-desc">
      接管语义（INV-10）：profile 显式指定别家 provider 时只警告不接管，强制需显式开启
    </p>
    <div class="cs-rows">
      <div class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">接管开关</div>
          <div class="cs-row-desc">与宿主 deepseek-official provider 的让位/接管行为</div>
        </div>
        <div class="cs-row-control">
          <div class="cs-seg" role="radiogroup" aria-label="接管开关">
            <button
              v-for="opt in TAKE_OVER_OPTIONS"
              :key="opt.value"
              class="cs-seg-item"
              :class="{ 'is-active': isTakeOverActive(props.takeOver, opt.value) }"
              type="button"
              role="radio"
              :aria-checked="String(isTakeOverActive(props.takeOver, opt.value))"
              :title="opt.hint"
              @click="onSelect(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>
      </div>
    </div>
    <div class="cs-tip">
      <svg class="cs-tip-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5 2.5 3.5v4c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9v-4L8 1.5z" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <p>{{ PRIVACY_NOTICE }}</p>
    </div>
    <div class="cs-hint">
      <span>三态映射 Config <code>takeOver</code>：auto=让位优先 · force=强制接管 · off=禁用接管</span>
    </div>
  </section>
</template>
