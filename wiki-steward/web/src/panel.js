// panel.js — Vue 面板入口（web/dist 构建物；lib/client.js 页签经动态 import 本模块挂载）。
// 契约：mount(el, {apiBase}) → {unmount()}（清理幂等）。样式=构建产物 style.css，
// 由 mount 就近注入（import.meta.url 定位，不依赖宿主页 head 时序）。
import { createApp } from 'vue'
import './styles.css'
import App from './App.vue'
import { createApi } from './api.js'

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
  const app = createApp(App, { api })
  app.mount(el)
  return {
    unmount() {
      try { app.unmount() } catch { /* 幂等：重复清理不抛 */ }
      try { el.textContent = '' } catch { /* 容器失效不抛 */ }
    },
  }
}
