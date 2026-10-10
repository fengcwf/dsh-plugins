<script setup>
// App — 布局容器：状态编排 + 同页面板切换（OW-US-14），展示全在子组件。
// T4：分屏编辑（OW-US-3）+ 安全保存（OW-US-4/OW-INV-3）——状态机/防抖/对比全在 lib/save-client.js 纯函数，本文件只编排 I/O 与面板。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElButton } from './element-plus.js'
import { fetchTree, fetchFile, fetchBacklinks, fetchRender, saveFile, deleteFile, fetchDownload, postRename } from './api.js'
import { runDownload, saveBlob } from './lib/download.js'
import { buildTreeModel, selectNode, resolveNotePath, collectFilePaths } from './lib/tree.js'
import { extractToc } from './lib/toc.js'
import { loadRecents, recordRecent, saveRecents } from './lib/ui-base.js'
import { LOAD_INITIAL, createLoadController, loadView } from './lib/load-state.js'
import { readHeadModel, loadNoteUnit } from './lib/read-view.js'
import { createEditorSession, reduceSession, createSaveCoordinator, createDebouncer, PREVIEW_DEBOUNCE_MS } from './lib/save-client.js'
import { loadReadState, saveReadState } from './lib/view-state.js'
import { createNodeActions } from './lib/node-actions.js'
import { createShareActions } from './lib/share-actions.js' // C3：树右键「分享」（文件/目录同路）
import SideMenu from './components/SideMenu.vue'
import NoteTree from './components/NoteTree.vue'
import ReadingPane from './components/ReadingPane.vue'
import NoteEditor from './components/NoteEditor.vue'
import ConflictDialog from './components/ConflictDialog.vue'
import DeleteConfirmDialog from './components/DeleteConfirmDialog.vue'
import RenameDialog from './components/RenameDialog.vue'
import SearchPanel from './components/SearchPanel.vue'
import BacklinksPanel from './components/BacklinksPanel.vue'
import SharePanel from './components/SharePanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TocPanel from './components/TocPanel.vue'
import StateError from './components/StateError.vue'
// T10（OW-US-9/10）：分享管理 + 设置面板同页一格（OW-US-14），activePanel 随 prop 下发供面板激活即刷新
const PANELS = { read: ReadingPane, search: SearchPanel, backlinks: BacklinksPanel, share: SharePanel, settings: SettingsPanel }
const nodes = ref([])
const state = ref({ selected: null, expanded: [] })
const activePanel = ref('read')
const file = ref(null)
const backlinks = ref([])
const error = ref('') // 通用内联提示（操作留痕/找不到笔记等）
const recents = ref([]) // 最近打开（空状态构图数据面）
const centerRef = ref(null)
const treeRef = ref(null)
// ── S2 加载状态机（candidate-a 6/A5）：idle/loading/timeout/error + 8 秒超时；计时/中止/请求身份全在 lib/load-state.js ──
const loadState = ref(LOAD_INITIAL)
const load = createLoadController({ onState: (s) => { loadState.value = s } })
const focusMode = ref(false) // 专注模式（candidate-a 5 最小面：收起三侧，无快捷键无持久化）
const onToggleFocus = () => { focusMode.value = !focusMode.value }
// ── 编辑会话（T4）：状态机纯函数在 lib/save-client.js，这里只编排 I/O ────────────
const session = ref(null)
const previewHtml = ref('')
const previewDebouncer = createDebouncer((content) => refreshPreview(content), PREVIEW_DEBOUNCE_MS)
// 保存时序（fix#2 在途守卫+排队重存）锁形于 createSaveCoordinator（test/save-inflight.test.mjs 真验），这里只接线
const saveCoordinator = createSaveCoordinator({
  getSession: () => session.value,
  setSession: (next) => { session.value = next },
  saveFile,
  fetchFile,
  onFileSaved: (path, data) => { if (file.value?.path === path) file.value = data },
  onSaveError: () => reloadTree().catch(() => {}), // F-3：写失败/超时后自动 reloadTree() 兜底（对齐服务端事实）
})
const triggerSave = () => saveCoordinator.triggerSave()
const treeModel = computed(() => buildTreeModel(nodes.value))
const tocItems = computed(() => extractToc(file.value?.rendered))
const filePaths = computed(() => collectFilePaths(nodes.value))
// 阅读头/阅读面视图模型（candidate-a 4/5）：纯函数在 web/src/lib/read-view.js，展示在 NoteHeader/ReadingPane
const readHead = computed(() => readHeadModel({
  path: file.value?.path, mtime: file.value?.mtime, content: file.value?.content,
  headings: tocItems.value.length, focus: focusMode.value,
}))
const readView = computed(() => ({ ...loadView(loadState.value), head: readHead.value }))
function ensureSession() {
  if (!file.value || session.value?.path === file.value.path) return
  session.value = createEditorSession({
    path: file.value.path, content: file.value.content, mtime: file.value.mtime, etag: file.value.etag,
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

function onEdit(content) {
  session.value = reduceSession(session.value, { type: 'edit', content })
  previewDebouncer.schedule(content) // 预览联动（服务端唯一渲染源）
  saveCoordinator.scheduleSave() // 保存防抖（delta-spec §3：≥500ms）
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

// 打开笔记（S2/A5）：fetchFile+fetchBacklinks 两条请求=同一加载单元；8 秒无响应升级 timeout 态
//（可解释错误+重试，旧请求迟到响应一律丢弃）。返回 'ok'|'error'|'timeout'|'stale'|'blocked' 供选中态决策。
async function openPath(path) {
  if (session.value && session.value.path !== path && session.value.status !== 'clean') {
    await triggerSave() // 切换前尽力保存（防丢稿）
    if (session.value.status !== 'clean') return 'blocked' // 冲突/保存失败未决：先解决再切换
  }
  error.value = ''
  const res = await load.run(path, () => loadNoteUnit({ fetchFile, fetchBacklinks }, path)) // F-1：信封校验收敛 lib（坏信封→error 态，零 unhandled）
  if (res.status !== 'ok') return res.status
  file.value = res.value.file
  backlinks.value = res.value.backlinks
  session.value = null
  previewHtml.value = ''
  if (activePanel.value === 'edit') ensureSession()
  recents.value = recordRecent(recents.value, path) // 空状态「最近打开」数据面（S1 构图）
  saveRecents(window.localStorage, recents.value)
  return 'ok'
}

async function onSelect(node) {
  const prev = state.value
  state.value = selectNode(state.value, node)
  const r = node.type === 'file' ? await openPath(node.key) : 'ok'
  if (r === 'error' || r === 'blocked') state.value = prev // 找不到/被阻：选中态回退
}

function onNavigate(target) {
  const path = resolveNotePath(filePaths.value, target)
  if (!path) {
    error.value = `找不到笔记：${target}`
    return
  }
  const prev = state.value
  state.value = selectNode(state.value, { key: path, type: 'file' })
  openPath(path).then((r) => {
    if (r === 'error' || r === 'blocked') state.value = prev
  })
}

function onJump(id) {
  activePanel.value = 'read'
  requestAnimationFrame(() => centerRef.value?.scrollToHeading?.(id))
}
// ── 树节点操作（T6 删除 / T13 改名移动）：编排全在 lib/node-actions.js（载荷/结果决策=rename-view.js 纯函数锁形），本文件只接线 ──
async function reloadTree() {
  const tree = await fetchTree()
  nodes.value = tree.data.nodes
}

const { deleteTarget, deleteBusy, deleteError, onDeleteNode, onDeleteCancel, onDeleteConfirm,
  renameTarget, renameBusy, renameError, renameWarnings, onRenameNode, onRenameCancel, onRenameSubmit } = createNodeActions({
  deleteFile,
  renameFile: postRename, // /ob/api/rename 事务面（T5 交接：warnings/rolledBack 如实上抛）
  refreshTree: reloadTree,
  clearOpenPaths: (deletedPath) => {
    const prefix = `${deletedPath}/`
    const openNow = file.value?.path ?? ''
    if (openNow === deletedPath || openNow.startsWith(prefix)) {
      file.value = null
      backlinks.value = []
      session.value = null
      previewHtml.value = ''
    }
    const sel = state.value.selected ?? ''
    state.value = {
      selected: sel === deletedPath || sel.startsWith(prefix) ? null : sel,
      expanded: state.value.expanded.filter((k) => k !== deletedPath && !k.startsWith(prefix)),
    }
  },
  onRenameApplied: (from, to) => {
    if (file.value?.path === from) openPath(to) // 打开中的文件改名后跟到新路径
    const sel = state.value.selected ?? ''
    state.value = {
      selected: sel === from ? to : sel,
      expanded: state.value.expanded.map((k) => (k === from ? to : k)),
    }
  },
  onNotice: (text) => { error.value = text }, // 留痕展示（T5 warnings 面 / INV-15 风格）
})

// ── 下载（T7/OW-US-7、OW-INV-9）：单 md 流/目录 zip——落盘与域拒分流全在 lib/download.js，这里只接线 ──
function onDownloadNode(node) {
  error.value = ''
  runDownload(node.key, { fetchDownload, saveBlob, onError: (m) => { error.value = m } })
}
// 状态面动作（S1/S2）：超时/失败重试（重发两条请求，幂等）/ 空状态「浏览目录」「搜索笔记」「最近打开」
const retryLoad = () => (loadState.value.path ? onSelect({ key: loadState.value.path, type: 'file' }) : load.retry())
const onBrowseTree = () => treeRef.value?.openDrawer?.()
const onSearchPanel = () => { activePanel.value = 'search' }
const onOpenRecent = (path) => void onSelect({ key: path, type: 'file' })
// 阅读头动作（candidate-a 4）：编辑/分享=既有面板切换（零 IA 变更），专注=阅读视图态；切面板退出专注（F-4：阅读列独占语义不被稀释）
const onEditPanel = () => { activePanel.value = 'edit'; focusMode.value = false }
const onSharePanel = () => { activePanel.value = 'share'; focusMode.value = false }
// ── 分享（C3）：树右键「分享」→ 切分享面板 + 目标下发（编排在 lib/share-actions.js）──
const { shareTarget, onShareFrom, onShareClear } = createShareActions({
  onNotice: (t) => { error.value = t }, goSharePanel: onSharePanel,
})
// 阅读视图持久化（delta-spec §3）。C3 清目标只在**切离**分享面板时做：树右键「置目标 + 切面板」
// 同 tick 发生，无条件清会抹掉目标（面板收不到 path → 弹层空目标，锁在 web-share-panel-behavior）。
watch(activePanel, (panel) => {
  if (panel === 'edit') ensureSession()
  if (panel !== 'share') onShareClear()
  saveReadState(window.localStorage, { panel })
})

onMounted(async () => {
  activePanel.value = loadReadState(window.localStorage).panel
  recents.value = loadRecents(window.localStorage)
  await load.run('', () => reloadTree()) // 树初载同走状态机（失败=可解释错误+重试，path='' 走树重拉）
})

onBeforeUnmount(() => {
  previewDebouncer.cancel()
  if (session.value && session.value.status !== 'clean') triggerSave()
  saveCoordinator.cancelScheduled()
  load.dispose() // 了结在途加载计时（卸载防悬挂）
})
</script>

<template>
  <div class="ob-shell" :class="{ 'is-focus': focusMode }"
    :style="shellStyle">
    <SideMenu :active="activePanel" @select="activePanel = $event" />
    <PaneResizer v-model="menuW" :hidden="layoutMode === 'narrow'" :pair-total="menuW + treeW" :min="48" :max="160" class="ob-resizer-1" @reset="menuW = 72" />
    <NoteTree
      ref="treeRef"
      :model="treeModel"
      :selected="state.selected"
      :expanded="state.expanded"
      @select="onSelect"
      @delete="onDeleteNode"
      @download="onDownloadNode"
      @rename="onRenameNode"
      @share="onShareFrom"
    />
    <PaneResizer v-model="treeW" :hidden="true" :pair-total="treeW" :min="200" :max="640" class="ob-resizer-2" @reset="treeW = 300" />
    <main class="ob-center">
      <StateError v-if="readView.failed" :kind="readView.kind" :message="readView.message" :path="readView.path">
        <template #actions><el-button type="primary" @click="retryLoad">重试</el-button></template>
      </StateError>
      <StateError v-else-if="error" kind="notice" :message="error" />
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
        :busy="readView.busy"
        :recents="recents"
        :active-panel="activePanel"
        :read-view="readView"
        :share-request="shareTarget"
        @navigate="onNavigate" @browse-tree="onBrowseTree" @search="onSearchPanel" @open="onOpenRecent"
        @toggle-focus="onToggleFocus" @edit="onEditPanel" @share="onSharePanel"
      />
    </main>
    <PaneResizer v-model="tocW" :hidden="layoutMode === 'narrow'" :pair-total="tocW" :min="180" :max="420" class="ob-resizer-3" @reset="tocW = 248" />
    <TocPanel :items="tocItems" @jump="onJump" />
    <ConflictDialog
      :visible="session?.status === 'conflict'"
      :conflict="session?.conflict ?? null"
      :comparing="Boolean(session?.comparing)"
      @choose="onChoose"
    />
    <DeleteConfirmDialog
      :visible="deleteTarget !== null"
      :path="deleteTarget?.path ?? ''"
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />
    <RenameDialog
      :visible="renameTarget !== null"
      :target="renameTarget"
      :busy="renameBusy"
      :error="renameError"
      :warnings="renameWarnings"
      @submit="onRenameSubmit"
      @cancel="onRenameCancel"
    />
  </div>
</template>
