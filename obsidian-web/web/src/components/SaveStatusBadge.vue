<script setup>
// SaveStatusBadge — 保存状态徽标四态（candidate-c 4 → UI-C dir-c .badge 带对勾形）：已保存/未保存/
// 保存中/保存冲突，文字在场 + 语义底色，无装饰色点；saved 态带对勾（mock .badge .tick，装饰字形 aria-hidden）。
// 状态语义与文案在 web/src/lib/ui-base.js（saveBadge 纯函数），本组件只展示。
import { computed } from 'vue'
import { saveBadge } from '../lib/ui-base.js'

const props = defineProps({ status: { type: String, default: 'clean' } })
const badge = computed(() => saveBadge(props.status))
</script>

<template>
  <span class="ob-chip" :class="`ob-chip-${badge.tone}`" role="status"><span
    v-if="badge.tone === 'saved'"
    class="ob-chip-tick"
    aria-hidden="true"
  >✓</span>{{ badge.text }}</span>
</template>
