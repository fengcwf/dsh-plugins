<script setup>
// PanelHeader — 面板统一头（candidate-c 5）：标题 + 路径副文 + 状态徽标位 + 动作位，
// 阅读/编辑/搜索/反链/分享共用同一头形状（六个面板共享一个头，状态位有固定家）。
// 只做展示：状态徽标经 #status 插槽（SaveStatusBadge）、动作经 #actions 插槽搬入，事件由父层处理。
defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
})
</script>

<template>
  <header class="ob-pane-head">
    <h2 class="ob-pane-title">{{ title }}</h2>
    <span v-if="sub" class="ob-pane-sub">{{ sub }}</span>
    <slot name="status" />
    <span class="ob-pane-spacer" />
    <div v-if="$slots.actions" class="ob-pane-acts"><slot name="actions" /></div>
  </header>
</template>
