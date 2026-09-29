<script setup>
// NoteHeader — S2 阅读头（candidate-a 4）：路径 + 页题（×1.75 档）+ 元信息（更新时间/字数/标题数）+
// 动作（专注/编辑/分享）。只做展示：模型全在 web/src/lib/read-view.js（readHeadModel），
// 按钮四档语义=样式层（styles.css：专注=主档、编辑/分享=次档）；专注=阅读视图态（无快捷键无持久化）。
import { ElButton } from '../element-plus.js'

defineProps({
  model: { type: Object, default: null }, // {title, path, meta[], focus, focusLabel}
})
const emit = defineEmits(['toggle-focus', 'edit', 'share'])
</script>

<template>
  <header v-if="model" class="ob-note-head">
    <p v-if="model.path" class="ob-note-path">{{ model.path }}</p>
    <h1 class="ob-note-title">{{ model.title }}</h1>
    <p v-if="model.meta.length" class="ob-note-meta">
      <span v-for="item in model.meta" :key="item">{{ item }}</span>
    </p>
    <div class="ob-note-acts">
      <el-button type="primary" :aria-pressed="String(model.focus)" @click="emit('toggle-focus')">
        {{ model.focusLabel }}
      </el-button>
      <el-button @click="emit('edit')">编辑</el-button>
      <el-button @click="emit('share')">分享</el-button>
    </div>
  </header>
</template>
