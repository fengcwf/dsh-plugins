// panel.js — Vue 面板入口（web/dist 构建物；lib/client.js 历史弹层经动态 import 本模块挂载）。
// 契约：mount(el, {apiBase, view}) → {unmount()}（清理幂等）；view='log' 只挂日志视图
// （Task F1 历史入口，不暴露手动 ingest 动作），缺省=全量面板（契约向后兼容）。
// 样式=构建产物 style.css，由 mount 就近注入（import.meta.url 定位，不依赖宿主页 head 时序）。
import { createApp } from 'vue'
import './styles.css'
import App from './App.vue'
import LogHistoryView from './components/LogHistoryView.vue'
import { createApi } from './api.js'
import { resolveView } from './lib/view-model.js'

const STYLE_ATTR = 'data-wiki-steward-panel-style'

function ensureStyles(doc) {
  if (doc.querySelector(`link[${STYLE_ATTR}]`)) return
  const link = doc.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('./style.css', import.meta.url).href
  link.setAttribute(STYLE_ATTR, '')
  doc.head.appendChild(link)
}

export function mount(el, deps = {}) {
  ensureStyles(el.ownerDocument ?? document)
  const api = createApi(deps.apiBase ?? '/wiki-steward/api')
  const resolved = resolveView(deps.view)
  // view 分叉：'log'=日志视图（历史入口）；'hindsight'/'full'=App——App 按 view prop 决定
  // 是否只渲染 Hindsight 同步节（六控件），LogHistoryView 不接 view prop（避免属性透传落 DOM）。
  const isLog = resolved === 'log'
  const app = isLog
    ? createApp(LogHistoryView, { api })
    : createApp(App, { api, view: resolved })
  app.mount(el)
  return {
    unmount() {
      try { app.unmount() } catch { /* 幂等：重复清理不抛 */ }
      try { el.textContent = '' } catch { /* 容器失效不抛 */ }
    },
  }
}
