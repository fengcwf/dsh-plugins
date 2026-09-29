<script setup>
// NoteEditor — 分屏编辑（源码+预览联动）+工具栏保存（OW-US-3）
// 容器/展示分离：保存状态机/防抖全在 web/src/lib/save-client.js（App 编排），本组件只展示+搬运事件。
// ARC-1：预览 HTML 全出自服务端 /ob/api/render（唯一渲染源），本组件零 markdown 解析。
// ARC-6：单文件 ≤300 行；重交互面（textarea/预览/分隔条）一律 v-show 不 v-if（禁 v-if 重交互）。
// S1（candidate-c 4/5）：面板统一头 PanelHeader + 保存状态徽标 SaveStatusBadge（四态语义在 lib/ui-base.js）。
import { ElButton } from '../element-plus.js'
import { onMounted, ref, watch } from 'vue'
import { loadEditState, saveEditState } from '../lib/view-state.js'
import { noteTitle } from '../lib/ui-base.js'
import PanelHeader from './PanelHeader.vue'
import SaveStatusBadge from './SaveStatusBadge.vue'

const props = defineProps({
  path: { type: String, default: '' },
  draft: { type: String, default: '' },
  status: { type: String, default: 'clean' }, // clean | dirty | saving | conflict
  previewHtml: { type: String, default: '' },
  error: { type: String, default: '' },
  canUndo: { type: Boolean, default: false },
})
const emit = defineEmits(['update:draft', 'save', 'undo'])

// 分屏状态独立持久化（delta-spec §3：与阅读视图互不覆盖，key=ob:edit-state）
const view = ref({ previewVisible: true, splitRatio: 0.5 })

onMounted(() => {
  view.value = loadEditState(window.localStorage)
})
watch(view, (v) => saveEditState(window.localStorage, v), { deep: true })

function onInput(event) {
  emit('update:draft', event.target.value)
}

function togglePreview() {
  view.value = { ...view.value, previewVisible: !view.value.previewVisible }
}

// 分隔条拖拽（splitRatio=源码列占比）
function startDrag(event) {
  event.preventDefault()
  const host = event.currentTarget.parentElement
  const move = (e) => {
    const rect = host.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    view.value = { ...view.value, splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <section class="ob-editor" aria-label="笔记编辑">
    <PanelHeader class="ob-editor-toolbar" :title="noteTitle(props.path) || '编辑'" :sub="props.path">
      <template #status><SaveStatusBadge :status="props.status" /></template>
      <template #actions>
        <el-button size="small" type="primary" :disabled="props.status === 'saving'" @click="emit('save')">保存</el-button>
        <el-button size="small" :disabled="!props.canUndo" @click="emit('undo')">撤销</el-button>
        <el-button size="small" class="ob-btn-ghost" :aria-pressed="String(view.previewVisible)" @click="togglePreview">
          {{ view.previewVisible ? '隐藏预览' : '显示预览' }}
        </el-button>
      </template>
    </PanelHeader>
    <p v-if="props.error" class="ob-empty" role="alert">{{ props.error }}</p>
    <div class="ob-editor-split">
      <textarea
        class="ob-editor-source"
        :style="{ flexBasis: `${(view.previewVisible ? view.splitRatio : 1) * 100}%` }"
        :value="props.draft"
        aria-label="笔记源码"
        spellcheck="false"
        @input="onInput"
      />
      <div
        v-show="view.previewVisible"
        class="ob-editor-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整预览宽度"
        @pointerdown="startDrag"
      />
      <article v-show="view.previewVisible" class="ob-editor-preview" aria-label="笔记预览">
        <div class="ob-prose" v-html="props.previewHtml" />
      </article>
    </div>
  </section>
</template>
