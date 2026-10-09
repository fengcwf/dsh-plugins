// lib/client.js — dsh-clsh-search 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS）。
//
// 形制严格对照 wiki-steward/lib/client.js（settings.section 贡献 + safeRegister + __panelLoader
// 测试缝）与 obsidian-web/lib/client.js（exports.apply(客户端根 ctx) + exports.inject 契约）。
// 宿主按 dsh.client 声明自动服务 /plugins/dsh-clsh-search/client.js（dsh-client-modules 扫入
// 浏览器花名册）；设置页=唯一入口：settings.section 注册（dsh-better-sidebar 路线，navLabel
// 自动进设置页）→ 贡献组件挂载 Vue 面板（web/dist/main.js，mount(el,deps)→{unmount()}，Ruling-9）。
// 动态 import 说明符经 new URL(url, document.baseURI).href 转真 URL：文档相对形（禁前导斜杠，
// skill-explorer #1707——前导斜杠逃出 <base href="./"> 前缀=生产 404 根因）。
// 静态前缀定案（C-W65-2）：面板与设置接口同基 'api/dsh-clsh-search'（与 wiki-steward 的
// 'api/wiki-steward/panel.js' 同形），由服务端 prefix /api/dsh-clsh-search 静态面服务。
window.__ModuleLoader__.load({
  id: 'dsh-clsh-search',
  factory: function factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // react 走装载器基座 require 表（wiki-steward 同款：不进包依赖，K-8 依赖归类不变）
    var react = require('react')
    var PANEL_URL = 'api/dsh-clsh-search/main.js'
    var API_BASE = 'api/dsh-clsh-search'

    /**
     * 面板载入缝（测试可替换 exports.__panelLoader）：文档相对说明符 → 真 URL → 动态 import。
     * @returns {Promise<{mount: Function}>} 面板模块（mount(el, deps) → {unmount()}）。
     */
    exports.__panelLoader = function loadPanel(url) {
      return import(new URL(url, document.baseURI).href)
    }

    /**
     * 设置节贡献组件：容器 div + 动态 import Vue 面板挂载；卸载对称（unmount + 容器清空，幂等）。
     * 面板载入失败=容器内如实报错（绝不静默、不炸设置页）。
     */
    function DshClshSearchSettingsSection() {
      var holder = react.useRef(null)
      react.useEffect(function effect() {
        var el = holder.current
        if (!el) return undefined
        var handle = null
        var cancelled = false
        exports.__panelLoader(PANEL_URL).then(function mount(mod) {
          if (cancelled || !el) return
          if (!mod || typeof mod.mount !== 'function') {
            el.textContent = 'dsh-clsh-search 设置面板载入失败：构建物缺 mount 导出'
            return
          }
          handle = mod.mount(el, { apiBase: API_BASE })
        }).catch(function fail(error) {
          if (cancelled || !el) return
          el.textContent = 'dsh-clsh-search 设置面板载入失败：' + ((error && error.message) || error)
        })
        return function cleanup() {
          cancelled = true
          try {
            if (handle && typeof handle.unmount === 'function') handle.unmount()
          } catch { /* 清理不抛 */ }
          handle = null
          while (el && el.firstChild) el.removeChild(el.firstChild)
        }
      }, [])
      return react.createElement('div', { ref: holder, className: 'dsh-clsh-search-settings-host' })
    }

    /**
     * 客户端根 apply：注册 settings.section 贡献（safeRegister：槽位方缺席=该面缺席，绝不炸插件）。
     * @param {object} ctx - 客户端根 ctx（slots 注入面，见 exports.inject）。
     * @returns {Function} dispose（注册面收敛，逐个不抛）。
     */
    function apply(ctx) {
      var slots = ctx.slots
      var disposers = []
      function safeRegister(slotName, decl, component) {
        return slots.inject(slotName, function setup() {
          try {
            return slots.register(decl, component)
          } catch (e) {
            try {
              if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-clsh-search] ' + slotName + ' 注册失败（缺槽位方？）：' + ((e && e.message) || e))
            } catch { /* 日志缺位不抛 */ }
            return function noop() {}
          }
        })
      }
      try {
        disposers.push(safeRegister('settings.section', {
          name: 'settings.section',
          id: 'dsh-clsh-search',
          // W66-N1 关闭：取独占 order（仓库实测已占位 30=github-ops/kb-context/wiki-steward、
          // 31=login-gate、40=rtk-kit → 50 无并列），同值并列会让两插件共存次序不被钉死。
          order: 50,
          label: function label() { return '搜索设置' },
        }, DshClshSearchSettingsSection))
      } catch (e) {
        try {
          if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-clsh-search] 客户端面注册失败：' + ((e && e.message) || e))
        } catch { /* 日志缺位不抛 */ }
      }
      return function dispose() {
        for (var i = 0; i < disposers.length; i += 1) {
          try {
            if (typeof disposers[i] === 'function') disposers[i]()
          } catch { /* 收敛不抛 */ }
        }
        disposers.length = 0
      }
    }

    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
