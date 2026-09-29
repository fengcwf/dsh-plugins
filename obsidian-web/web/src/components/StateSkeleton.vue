<script setup>
// StateSkeleton — 加载骨架（candidate-c 8 + S2 candidate-a 6 文案）：贴布局形状（标题条 + 段落条 + 代码块形），
// 非圆圈 spinner、无渐变闪动。骨架形在 web/src/lib/ui-base.js（SKELETON_SHAPE 纯常量），本组件只展示。
import { SKELETON_SHAPE } from '../lib/ui-base.js'
</script>

<template>
  <div class="ob-state-wrap" aria-busy="true">
    <div class="ob-sk ob-sk-title" :style="{ width: `${SKELETON_SHAPE.titleWidthPct}%` }" />
    <div
      v-for="w in SKELETON_SHAPE.lineWidthsPct"
      :key="w"
      class="ob-sk ob-sk-line"
      :style="{ width: `${w}%` }"
    />
    <div class="ob-sk ob-sk-code" />
    <p class="ob-state-note" role="status">正在读取笔记，8 秒内无响应会自动给出错误与重试入口。</p>
  </div>
</template>
