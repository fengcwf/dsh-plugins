<script setup>
// App — 布局容器：状态编排 + 同页面板切换（OW-US-14），展示全在子组件。
// T4：分屏编辑（OW-US-3）+ 安全保存（OW-US-4/OW-INV-3）——保存状态机/防抖/对比全在
//     web/src/lib/save-client.js 纯函数（单测锁形），本文件只编排 I/O 与面板。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchTree, fetchFile, fetchBacklinks, fetchRender, saveFile } from './api.js'
import { buildTreeModel, selectNode, resolveNotePath } from './lib/tree.js'
import { extractToc } from './lib/toc.js'
import {
  createEditorSession, reduceSession, lockParamsFor, createDebouncer, SAVE_DEBOUNCE_MS, PREVIEW_DEBOUNCE_MS,
} from './lib/save-client.js'
import { loadReadState, saveReadState } from './lib/view-state.js'
import SideMenu from './components/SideMenu.vue'
import NoteTree from './components/NoteTree.vue'
import ReadingPane from './components/ReadingPane.vue'
import NoteEditor from './components/NoteEditor.vue'
import ConflictDialog from './components/ConflictDialog.vue'
import SearchPanel from './components/SearchPanel.vue'
import BacklinksPanel from './components/BacklinksPanel.vue'
import TocPanel from './components/TocPanel.vue'

const PANELS = { read: ReadingPane, search: SearchPanel, backlinks: BacklinksPanel }

const nodes = ref([])
const state = ref({ selected: null, expanded: [] })
const activePanel = ref('read')
const file = ref(null)
const backlinks = ref([])
const error = ref('')
const busy = ref(false)
const centerRef = ref(null)

// ── 编辑会话（T4）：状态机纯函数在 lib/save-client.js，这里只编排 I/O ────────────
const session = ref(null)
const previewHtml = ref('')
const saveDebouncer = createDebouncer(() => triggerSave(), SAVE_DEBOUNCE_MS)
const previewDebouncer = createDebouncer((content) => refreshPreview(content), PREVIEW_DEBOUNCE_MS)

const treeModel = computed(() => buildTreeModel(nodes.value))
const tocItems = computed(() => extractToc(file.value?.rendered))
const filePaths = computed(() => {
  const out = []
  const walk = (list) => {
    for (const n of list ?? []) {
      if (n.type === 'file') out.push(n.path)
      else walk(n.children)
    }
  }
  walk(nodes.value)
  return out
})

function ensureSession() {
  if (!file.value || session.value?.path === file.value.path) return
  session.value = createEditorSession({
    path: file.value.path,
    content: file.value.content,
    mtime: file.value.mtime,
    etag: file.value.etag,
  })
  previewHtml.value = file.value.rendered?.html ?? ''
}

async function refreshPreview(content) {
  try {
    const r = await fetchRender(content)
    previewHtml.value = r.data.html
  } catch (e) {
    error.value = e.message
  }
}

async function triggerSave() {
  const current = session.value
  if (!current) return
  saveDebouncer.cancel()
  const savedDraft = current.draft
  session.value = reduceSession(session.value, { type: 'save_start' })
  try {
    const r = await saveFile(current.path, savedDraft, lockParamsFor(current))
    if (r.data.conflict) {
      // 冲突（OW-INV-3）：零写入，转三选弹层（覆盖/重载/对比）
      session.value = reduceSession(session.value, { type: 'conflict', result: r.data })
      return
    }
    session.value = reduceSession(session.value, { type: 'save_ok', result: r.data })
    if (session.value.draft !== savedDraft) saveDebouncer.schedule() // 保存期间又改了 → 再存
    const f = await fetchFile(current.path)
    if (file.value?.path === current.path) file.value = f.data
  } catch (e) {
    session.value = reduceSession(session.value, { type: 'save_error', message: e.message })
  }
}

function onEdit(content) {
  session.value = reduceSession(session.value, { type: 'edit', content })
  previewDebouncer.schedule(content) // 预览联动（服务端唯一渲染源）
  saveDebouncer.schedule() // 保存防抖（delta-spec §3：≥500ms）
}

function onChoose(choice) {
  session.value = reduceSession(session.value, { type: 'choose', choice })
  if (choice === 'overwrite') triggerSave()
  else if (choice === 'reload') refreshPreview(session.value.draft)
}

function onUndo() {
  session.value = reduceSession(session.value, { type: 'undo' })
  previewDebouncer.schedule(session.value.draft)
  triggerSave() // 一键还原=立即落盘（内存级 undo，持久化 undo 归后续）
}

async function openPath(path) {
  if (session.value && session.value.path !== path && session.value.status !== 'clean') {
    await triggerSave() // 切换前尽力保存（防丢稿）
    if (session.value.status !== 'clean') return false // 冲突/保存失败未决：先解决再切换
  }
  busy.value = true
  error.value = ''
  try {
    const [f, b] = await Promise.all([fetchFile(path), fetchBacklinks(path)])
    file.value = f.data
    backlinks.value = b.data.backlinks
    session.value = null
    previewHtml.value = ''
    if (activePanel.value === 'edit') ensureSession()
  } catch (e) {
    error.value = e.message
    return false
  } finally {
    busy.value = false
  }
  return true
}

async function onSelect(node) {
  const prev = state.value
  state.value = selectNode(state.value, node)
  if (node.type === 'file' && (await openPath(node.key)) === false) state.value = prev // 切换被阻：选中态回退
}

function onNavigate(target) {
  const path = resolveNotePath(filePaths.value, target)
  if (!path) {
    error.value = `找不到笔记：${target}`
    return
  }
  const prev = state.value
  state.value = selectNode(state.value, { key: path, type: 'file' })
  openPath(path).then((ok) => {
    if (ok === false) state.value = prev
  })
}

function onJump(id) {
  activePanel.value = 'read'
  requestAnimationFrame(() => centerRef.value?.scrollToHeading?.(id))
}

// 阅读视图状态独立持久化（delta-spec §3：与分屏编辑互不覆盖，key=ob:read-state）
watch(activePanel, (panel) => {
  if (panel === 'edit') ensureSession()
  saveReadState(window.localStorage, { panel })
})

onMounted(async () => {
  activePanel.value = loadReadState(window.localStorage).panel
  try {
    const tree = await fetchTree()
    nodes.value = tree.data.nodes
  } catch (e) {
    error.value = e.message
  }
})

onBeforeUnmount(() => {
  previewDebouncer.cancel()
  if (session.value && session.value.status !== 'clean') triggerSave()
  saveDebouncer.cancel()
})
</script>

<template>
  <div class="ob-shell">
    <SideMenu :active="activePanel" @select="activePanel = $event" />
    <NoteTree
      :model="treeModel"
      :selected="state.selected"
      :expanded="state.expanded"
      @select="onSelect"
    />
    <main class="ob-center">
      <p v-if="error" class="ob-empty" role="alert">{{ error }}</p>
      <NoteEditor
        v-show="activePanel === 'edit'"
        :path="session?.path ?? ''"
        :draft="session?.draft ?? ''"
        :status="session?.status ?? 'clean'"
        :preview-html="previewHtml"
        :error="session?.error ?? ''"
        :can-undo="Boolean(session?.diffUndo)"
        @update:draft="onEdit"
        @save="triggerSave"
        @undo="onUndo"
      />
      <component
        :is="PANELS[activePanel]"
        v-show="activePanel !== 'edit'"
        ref="centerRef"
        :path="file?.path"
        :rendered="file?.rendered"
        :backlinks="backlinks"
        :busy="busy"
        @navigate="onNavigate"
      />
    </main>
    <TocPanel :items="tocItems" @jump="onJump" />
    <ConflictDialog
      :visible="session?.status === 'conflict'"
      :conflict="session?.conflict ?? null"
      :comparing="Boolean(session?.comparing)"
      @choose="onChoose"
    />
  </div>
</template>
