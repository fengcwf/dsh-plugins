<script setup>
// ReadingPane — Markdown 阅读面：只展示服务端 render.js 输出（ARC-1 零前端解析，v-html 受控 HTML）。
import { ref } from 'vue'

const props = defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['navigate'])

const root = ref(null)

// wikilink/embed 链接卡点击 → 上抛目标（data-target），路由解析在 App（纯函数 resolveNotePath）
function onClick(event) {
  const link = event.target.closest?.('a.ob-wikilink, a.ob-embed')
  if (!link) return
  event.preventDefault()
  emit('navigate', link.dataset.target ?? link.textContent)
}

// TOC 跳转：滚动到服务端生成的 heading id（历史坑：id 必须服务端生成）
function scrollToHeading(id) {
  const el = root.value?.querySelector?.(`#${CSS.escape(id)}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

defineExpose({ scrollToHeading })
</script>

<template>
  <article ref="root" class="ob-prose" aria-label="笔记阅读" @click="onClick">
    <p v-if="!props.rendered" class="ob-empty">
      {{ props.busy ? '加载中…' : '从左侧目录树选择一篇笔记' }}
    </p>
    <div v-else v-html="props.rendered.html" />
  </article>
</template>
