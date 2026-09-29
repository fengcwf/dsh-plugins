<script setup>
// StateError — 内联可解释错误卡（candidate-c 8）：错误线 + 标题 + 原因 + 指引 + 路径 + 动作，role=alert。
// 文案模型在 web/src/lib/ui-base.js（stateErrorModel 纯函数，含 S2 预置 timeout 形）；动作经 #actions 插槽。
import { computed } from 'vue'
import { stateErrorModel } from '../lib/ui-base.js'

const props = defineProps({
  kind: { type: String, default: 'notice' }, // notice | load | timeout
  message: { type: String, default: '' },
  path: { type: String, default: '' },
})
const model = computed(() => stateErrorModel(props.kind, { message: props.message, path: props.path }))
</script>

<template>
  <div class="ob-error-card" role="alert">
    <h2 class="ob-error-title">{{ model.title }}</h2>
    <p class="ob-error-why">{{ model.why }}</p>
    <p v-if="model.guidance" class="ob-error-guidance">{{ model.guidance }}</p>
    <p v-if="model.path" class="ob-error-path">{{ model.path }}</p>
    <div v-if="$slots.actions" class="ob-error-actions"><slot name="actions" :model="model" /></div>
  </div>
</template>
