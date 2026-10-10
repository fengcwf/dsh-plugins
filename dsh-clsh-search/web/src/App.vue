<script setup>
// App.vue — 设置页外壳（DESIGN.md §1 定稿 A：页头 / 三卡片纵向 gap 32 / 页脚）。
// 只做展示与事件转发：状态归一与校验全部走 web/src/lib 纯模块（K-11：交互控件禁条件渲染）。
import { onMounted, reactive, ref, computed } from 'vue'
import SourceCard from './components/SourceCard.vue'
import BudgetCard from './components/BudgetCard.vue'
import TakeoverCard from './components/TakeoverCard.vue'
import DiagnosticsCard from './components/DiagnosticsCard.vue'
import LogModal from './components/LogModal.vue'
import CustomSourceCard from './components/CustomSourceCard.vue'
import ProxyCard from './components/ProxyCard.vue'
import { DEFAULT_SETTINGS, fromConfig, toConfig, validateSettings } from './lib/settings-api.js'
import { extraPatch, pickExtraKeys } from './lib/budget-model.js'

const props = defineProps({
  /** 设置读写契约（settings-api createSettingsApi 实例；缺省=只读默认值展示）。 */
  api: { type: Object, default: null },
})

const settings = reactive(fromConfig(DEFAULT_SETTINGS))
const errors = reactive({})
const saved = ref(true)
const errorText = ref('')
/** 触发日志弹层开合态（Task 21 LogModal 接线位）：DiagnosticsCard「查看触发日志」→ open-log → 置真。 */
const logOpen = ref(false)

function onOpenLog() {
  logOpen.value = true
}

const chipText = computed(() => (saved.value ? '已保存' : '未保存更改'))
/** 自定义源数（0.2.x sources.custom；接 SourceCard 计数面，R25 混排词汇见 allSourceIds）。 */
const customCount = computed(() => (Array.isArray(settings.custom) ? settings.custom.length : 0))
/**
 * 空池降级清单（T-G / K-23：明示降级，禁止无标志静默回落；T-A2 产品裁定口径）：
 * 勾选走代理但代理池为空 → 列出该源，源管理卡下方出「已勾选但未配代理地址，当前直连」提示。
 * 口径 = lib/sources/common.js 的 proxyStatus / proxyStatusForItem 镜像——common.js 顶层含原生
 * socket 层静态导入（K-18 白名单文件专属面）不可进浏览器包，故在 App 侧镜像；口径断言由 web/test/source-card.test 钉住。
 */
const degradedSources = computed(() => {
  const pool = Array.isArray(settings.proxies) ? settings.proxies : []
  if (pool.length > 0) return []
  const ids = ['ddg', 'bing', 'so360', 'baidu'].filter((id) => settings.useProxy?.[id] === true)
  for (const item of settings.custom ?? []) {
    if (item?.useProxy === true) ids.push(item.label ?? item.id)
  }
  return ids
})

function applyPatch(patch) {
  const { fieldError, ...rest } = patch
  // 0.2.x 扩键写回面：fromConfig 只认旧键，新键须经 pickExtraKeys 透传（否则卡片编辑一次即丢）。
  const merged = { ...toConfig(settings), ...rest }
  Object.assign(settings, fromConfig(merged), pickExtraKeys(merged))
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
    const loaded = await props.api.load()
    // 0.2.x 扩键读取面：fromConfig 丢新键，pickExtraKeys 补齐（Config 形 sources.custom/useProxy 兼容）。
    Object.assign(settings, fromConfig(loaded), pickExtraKeys(loaded))
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
      // 0.2.x 扩键写回面（A2）：toConfig 只回旧键，extraPatch 补七组新键（custom/useProxy 归位 sources 子键）。
      const base = toConfig(settings)
      const extra = extraPatch(settings)
      const payload = { ...base, ...extra, sources: { ...base.sources, ...extra.sources } }
      Object.assign(settings, fromConfig(await props.api.save(payload)))
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
        <h1 class="cs-page-title">搜索设置</h1>
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
      :api="props.api"
      :sources="settings.sources"
      :priority="settings.priority"
      :custom="settings.custom"
      :use-proxy="settings.useProxy"
      :error="errors.sources || errors.priority || ''"
      @change="applyPatch"
    />
    <!-- T-G/K-23 空池降级明示：紧贴源管理卡，勾选开而池空时可见（v-show 零条件渲染重交互）。 -->
    <p v-show="degradedSources.length > 0" class="cs-hint cs-error">
      已勾选但未配代理地址，当前直连：{{ degradedSources.join('、') }}（在「代理配置」卡添加地址即恢复走代理）
    </p>
    <!-- 自定义源编辑器（Task 22）：置源管理卡之后（V4 行内展开形制），混排序号取统一 priority（R25）。 -->
    <CustomSourceCard :custom="settings.custom" :priority="settings.priority" @change="applyPatch" />
    <BudgetCard :values="settings" :errors="errors" @change="applyPatch" />
    <TakeoverCard :take-over="settings.takeOver" @change="applyPatch" />
    <!-- 代理配置卡（Task 23）：五卡序 = 源管理→性能预算→接管与隐私→代理配置→诊断（INV-21）。 -->
    <ProxyCard :proxies="settings.proxies" @change="applyPatch" />
    <!-- 诊断卡（Task 19）：INV-21 置三卡与代理配置之后、不前置保存按钮。 -->
    <DiagnosticsCard :api="props.api" @open-log="onOpenLog" />
    <!-- 触发日志弹层（Task 21）：DiagnosticsCard「查看触发日志」→ logOpen 开合；v-show 零条件渲染。 -->
    <LogModal :api="props.api" :open="logOpen" @close="logOpen = false" />

    <p class="cs-page-foot">
      配置持久化：profile <code>cordis.patch.yml</code>（config 整行替换）· 数据落点
      <code>~/.dsh/cache/dsh-clsh-search/</code>
    </p>
  </main>
</template>
