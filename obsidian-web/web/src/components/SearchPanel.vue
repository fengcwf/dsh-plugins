<script setup>
// SearchPanel — 搜索面板（中央列同页面板一格，OW-US-2/OW-US-14）：
// 容器=查询态 + /ob/api/search 调用；展示在 SearchResults（组件零逻辑）。
// score 语义句常驻描述位（detpecca 教训）：score=排序权重（越大越优）非匹配概率/百分比；
// 降级（超时 fail-open 部分结果）提示进界面（INV-15 风格留痕）。
// 同页面板接口统一：App 容器统一传参，未用 props 仅吸收防落 DOM 属性。
import { ElButton, ElInput } from '../element-plus.js'
import { ref } from 'vue'
import { fetchSearch } from '../api.js'
import { SCORE_HINT, describeDegraded } from '../lib/search-view.js'
import SearchResults from './SearchResults.vue'

defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  backlinks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['navigate'])

const query = ref('')
const results = ref([])
const degraded = ref(null)
const error = ref('')
const searching = ref(false)
const searched = ref(false)

async function runSearch() {
  const q = query.value.trim()
  if (!q) {
    error.value = '请输入查询词'
    results.value = []
    degraded.value = null
    searched.value = false
    return
  }
  searching.value = true
  error.value = ''
  try {
    const body = await fetchSearch(q)
    results.value = body.data.results
    degraded.value = body.data.degraded
    searched.value = true
  } catch (e) {
    error.value = e.message
    results.value = []
    degraded.value = null
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <section class="ob-prose ob-search" aria-label="搜索">
    <h2>搜索</h2>
    <form class="ob-search-bar" @submit.prevent="runSearch">
      <el-input v-model="query" aria-label="搜索词" placeholder="全 vault 全文 + 标题搜索" clearable />
      <el-button type="primary" native-type="submit" :loading="searching">搜索</el-button>
    </form>
    <p class="ob-hint">{{ SCORE_HINT }}</p>
    <p v-if="error" class="ob-empty" role="alert">{{ error }}</p>
    <p v-else-if="degraded" class="ob-hint" role="status">{{ describeDegraded(degraded) }}</p>
    <p v-if="searched && !results.length" class="ob-empty">无匹配结果</p>
    <SearchResults :results="results" @navigate="emit('navigate', $event)" />
  </section>
</template>
