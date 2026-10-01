<script setup>
// App.vue — 设置页外壳（DESIGN.md §1 定稿 A：页头 / 三卡片纵向 gap 32 / 页脚）。
// 只做展示与事件转发：状态归一与校验全部走 web/src/lib 纯模块（K-11：交互控件禁条件渲染）。
import { onMounted, reactive, ref, computed } from 'vue'
import SourceCard from './components/SourceCard.vue'
import BudgetCard from './components/BudgetCard.vue'
import TakeoverCard from './components/TakeoverCard.vue'
import { DEFAULT_SETTINGS, fromConfig, toConfig, validateSettings } from './lib/settings-api.js'

const props = defineProps({
  /** 设置读写契约（settings-api createSettingsApi 实例；缺省=只读默认值展示）。 */
  api: { type: Object, default: null },
})

const settings = reactive(fromConfig(DEFAULT_SETTINGS))
const errors = reactive({})
const saved = ref(true)
const errorText = ref('')

const chipText = computed(() => (saved.value ? '已保存' : '未保存更改'))

function applyPatch(patch) {
  const { fieldError, ...rest } = patch
  Object.assign(settings, fromConfig({ ...toConfig(settings), ...rest }))
  const check = validateSettings(settings)
  for (const key of Object.keys(errors)) delete errors[key]
  Object.assign(errors, check.errors, fieldError ?? {})
  saved.value = false
  errorText.value = ''
}

function refreshErrors() {
  const check = validateSettings(settings)
  for (const key of Object.keys(errors)) delete errors[key]
  Object.assign(errors, check.errors)
  return check
}

async function loadSettings() {
  if (!props.api || typeof props.api.load !== 'function') return
  try {
    Object.assign(settings, fromConfig(await props.api.load()))
    saved.value = true
    refreshErrors()
  } catch (error) {
    errorText.value = error?.message ?? '设置加载失败'
  }
}

async function saveSettings() {
  const check = refreshErrors()
  if (!check.ok) {
    errorText.value = '设置有校验错误，未保存'
    return
  }
  if (props.api && typeof props.api.save === 'function') {
    try {
      Object.assign(settings, fromConfig(await props.api.save(toConfig(settings))))
    } catch (error) {
      errorText.value = error?.message ?? '设置保存失败'
      return
    }
  }
  saved.value = true
  errorText.value = ''
}

onMounted(loadSettings)
</script>

<template>
  <main class="cs-page">
    <header class="cs-page-head">
      <div>
        <h1 class="cs-page-title">dsh-clsh-search · 搜索设置</h1>
        <p class="cs-page-intro">
          免 key 四源聚合（DDG → Bing → 360 → 百度）· 工具调用顺序：vault+记忆 → web_search → web_fetch → ego-browser 兜底
        </p>
      </div>
      <div class="cs-toolbar">
        <span class="cs-chip">{{ chipText }}</span>
        <button class="cs-btn-primary" type="button" @click="saveSettings">保存更改</button>
      </div>
    </header>

    <p class="cs-page-foot cs-error">{{ errorText }}</p>

    <SourceCard
      :sources="settings.sources"
      :priority="settings.priority"
      :error="errors.sources || errors.priority || ''"
      @change="applyPatch"
    />
    <BudgetCard :values="settings" :errors="errors" @change="applyPatch" />
    <TakeoverCard :take-over="settings.takeOver" @change="applyPatch" />

    <p class="cs-page-foot">
      配置持久化：profile <code>cordis.patch.yml</code>（config 整行替换）· 数据落点
      <code>~/.dsh/cache/dsh-clsh-search/</code>
    </p>
  </main>
</template>
