<script setup>
// ReadingPane — Markdown 阅读面：只展示服务端 render.js 输出（ARC-1 零前端解析，v-html 受控 HTML）。
// S2（candidate-a 1-6）：阅读头 NoteHeader（路径/页题/元信息/动作）+ 加载状态机展示面——
// loading=贴布局骨架（StateSkeleton）、timeout/error=错误卡由 App 中央列承载（本面不重复画，
// 旧内容同步让位）、空=构图（StateEmpty）；视图模型全在 web/src/lib/read-view.js + load-state.js。
import { computed, ref } from 'vue'
import NoteHeader from './NoteHeader.vue'
import StateSkeleton from './StateSkeleton.vue'
import StateEmpty from './StateEmpty.vue'

const props = defineProps({
  path: { type: String, default: '' }, // 未用 props 仅吸收防落 DOM 属性（同页面板接口统一；路径在 readView.head.path）
  rendered: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  recents: { type: Array, default: () => [] }, // [{path, at}]（空状态构图数据面）
  readView: { type: Object, default: null }, // {status,busy,failed,kind,head}（load-view + read-head 视图模型）
})
const emit = defineEmits(['navigate', 'browse-tree', 'search', 'open', 'toggle-focus', 'edit', 'share'])

const root = ref(null)
const failed = computed(() => props.readView?.failed === true)
const head = computed(() => props.readView?.head ?? null)

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
  <section class="ob-reading">
    <NoteHeader
      v-if="head && props.rendered && !props.busy && !failed"
      :model="head"
      @toggle-focus="emit('toggle-focus')"
      @edit="emit('edit')"
      @share="emit('share')"
    />
    <StateSkeleton v-if="props.busy" />
    <StateEmpty
      v-else-if="!failed && !props.rendered"
      :recents="props.recents"
      @browse-tree="emit('browse-tree')"
      @search="emit('search')"
      @open="emit('open', $event)"
    />
    <article v-else-if="!failed" ref="root" class="ob-prose" aria-label="笔记阅读" @click="onClick">
      <div v-html="props.rendered.html" />
    </article>
  </section>
</template>
