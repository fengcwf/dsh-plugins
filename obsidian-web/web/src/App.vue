<script setup>
// App — 布局容器：状态编排 + 同页面板切换（OW-US-14），展示全在子组件。
import { computed, onMounted, ref } from 'vue'
import { fetchTree, fetchFile, fetchBacklinks } from './api.js'
import { buildTreeModel, selectNode, resolveNotePath } from './lib/tree.js'
import { extractToc } from './lib/toc.js'
import SideMenu from './components/SideMenu.vue'
import NoteTree from './components/NoteTree.vue'
import ReadingPane from './components/ReadingPane.vue'
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

async function openPath(path) {
  busy.value = true
  error.value = ''
  try {
    const [f, b] = await Promise.all([fetchFile(path), fetchBacklinks(path)])
    file.value = f.data
    backlinks.value = b.data.backlinks
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function onSelect(node) {
  state.value = selectNode(state.value, node)
  if (node.type === 'file') openPath(node.key)
}

function onNavigate(target) {
  const path = resolveNotePath(filePaths.value, target)
  if (!path) {
    error.value = `找不到笔记：${target}`
    return
  }
  state.value = selectNode(state.value, { key: path, type: 'file' })
  openPath(path)
}

function onJump(id) {
  activePanel.value = 'read'
  requestAnimationFrame(() => centerRef.value?.scrollToHeading?.(id))
}

onMounted(async () => {
  try {
    const tree = await fetchTree()
    nodes.value = tree.data.nodes
  } catch (e) {
    error.value = e.message
  }
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
      <component
        :is="PANELS[activePanel]"
        ref="centerRef"
        :path="file?.path"
        :rendered="file?.rendered"
        :backlinks="backlinks"
        :busy="busy"
        @navigate="onNavigate"
      />
    </main>
    <TocPanel :items="tocItems" @jump="onJump" />
  </div>
</template>
