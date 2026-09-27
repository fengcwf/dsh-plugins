// wiki-steward 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS——lib/ 不引构建器）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory 只登记模块体（副作用全在 apply）。
// 职责：向 dsh 设置面注册 **settings.plugins.tab 页签**（settings 子面；root 壳槽位
// launcher/trigger/header/close/action/section/onboarding 一律禁注册），页签内容 =
// web/dist 的 Vue 面板（最小构建 vite lib 形，与 kb/obsidian-web web/ 惯例对齐：
// web/ 源码 → web/dist 构建物随包分发；面板 mount/unmount 契约见 web/src/panel.js）。
// 面板加载走 exports.__panelLoader 注入缝（插桩非 mock；默认=浏览器动态 import 面板模块）。
window.__ModuleLoader__.load({
  id: 'wiki-steward',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    var PANEL_URL = '/wiki-steward/panel.js'
    var API_BASE = '/wiki-steward/api'

    /** 面板加载缝（测试注入；默认浏览器动态 import 构建物） */
    exports.__panelLoader = function loadPanel(url) {
      return import(url)
    }

    /**
     * 页签组件：槽位容器=单 div，Vue 面板挂进 ref 节点。
     * 挂载契约：mount(el, {apiBase}) → {unmount()}；清理=unmount+容器清空，幂等。
     */
    function WikiStewardIngestTab() {
      var elRef = react.useRef(null)
      react.useEffect(function effect() {
        var el = elRef.current
        if (!el) return function noop() {}
        var alive = true
        var handle = null
        Promise.resolve()
          .then(function load() { return exports.__panelLoader(PANEL_URL) })
          .then(function mount(mod) {
            if (!alive) return
            if (!mod || typeof mod.mount !== 'function') throw new Error('面板模块缺 mount 导出')
            handle = mod.mount(el, { apiBase: API_BASE })
          })
          .catch(function onFail(e) {
            if (!alive) return
            try {
              el.textContent = 'wiki-steward 面板加载失败：' + ((e && e.message) || e)
            } catch { /* 容器失效不抛 */ }
          })
        return function cleanup() {
          alive = false
          try {
            if (handle && typeof handle.unmount === 'function') handle.unmount()
          } catch { /* 清理不抛 */ }
          handle = null
          try { el.textContent = '' } catch { /* 同上 */ }
        }
      }, [])
      return react.createElement('div', { ref: elRef, className: 'wiki-steward-ingest-panel' })
    }

    /** 只注册 settings.plugins.tab（settings 子面页签；root 壳槽位禁注册——边界见头注） */
    function apply(ctx) {
      ctx.slots.inject('settings.plugins.tab', function setup() {
        try {
          return ctx.slots.register({
            name: 'settings.plugins.tab',
            id: 'wiki-steward',
            order: 30,
            label: function label() { return 'wiki-steward · Ingest' },
          }, WikiStewardIngestTab)
        } catch (e) {
          try {
            if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[wiki-steward] settings.plugins.tab 注册失败（缺槽位方？）：' + ((e && e.message) || e))
          } catch { /* 日志缺位不抛 */ }
          return function noop() {}
        }
      })
    }

    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
