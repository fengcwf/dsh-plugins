// main.js — 设置页入口（web/dist 构建物随包分发；lib/ 保持零构建纯 ESM）。
// 挂载契约（wiki-steward web/src/panel.js 同形，Ruling-9）：mount(el, deps) → {unmount()}，清理幂等。
// deps.api 可注入设置读写契约（web/src/lib/settings-api.js 的 createSettingsApi 实例）；
// 宿主静态服务/路由挂载缝在服务端（lib/ 侧）交付，不在 W6 范围。
import { createApp } from 'vue'
import './styles.css'
import App from './App.vue'
import { createSettingsApi } from './lib/settings-api.js'

const STYLE_ATTR = 'data-dsh-clsh-search-style'

/** 构建产物 style.css 就近注入（import.meta.url 定位，不依赖宿主页 head 时序；wiki-steward 同法）。 */
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
  const api = deps.api ?? createSettingsApi({ baseUrl: deps.apiBase })
  const app = createApp(App, { api })
  app.mount(el)
  return {
    unmount() {
      app.unmount()
    },
  }
}

export default { mount }
