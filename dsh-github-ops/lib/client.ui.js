// lib/client.ui.js — dsh-github-ops 客户端 UI 兄弟 chunk 入口（render* 接口面，T14 真 UI）。
// 注册形：window.__ModuleLoader__.load({id:'dsh-github-ops', chunk:'client.ui.js', factory})——
// chunk 名过宿主 CLIENT_CHUNK 白名单（/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/），
// 由 lib/client.js 经 require.async('./client.ui.js') 惰性取用（挂载生命周期归壳）。
// render* 接口面：renderSettingsSection(props) —— 设置面整体（props = { api, ownerProps }，api.fetch 文档相对 api/github-ops/…）
//                renderSummary(props)     —— bundle 页一行摘要（无 api 面=回 null）
// 结构（F-scan-1 渲染族 ≤300 行/文件）：本文件=容器（chunk 装载 + 模型订阅 + 生命周期）；
//   client.ui.model.js=状态模型（取数/投影）；client.ui.cards.js=纯渲染（双栏六节卡片）；client.ui.styles.js=token 样式。
// fail-open（INV-6）：兄弟 chunk 不可取/挂载异常=降级提示，绝不炸插件；副作用全在 useEffect（工厂零副作用）。
// UI 零明文（INV-1/P-5）：本文件不拼接任何凭据/URL 明文；显示边界见 model/cards 层。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  chunk: 'client.ui.js',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    var PARTS = ['./client.ui.styles.js', './client.ui.model.js', './client.ui.cards.js']
    var partsPromise = null
    function loadParts() {
      if (partsPromise !== null) return partsPromise
      if (typeof require.async !== 'function') return Promise.reject(new Error('require.async 缺位（宿主形不符）'))
      partsPromise = Promise.all(PARTS.map(function (spec) { return require.async(spec) })).then(function (mods) {
        return { styles: mods[0], model: mods[1], cards: mods[2] }
      })
      return partsPromise
    }

    function describe(e) {
      return String((e && e.message) || e)
    }

    /** 设置面容器：载入渲染族 chunk → 建模型 → 订阅刷新 → boot 取数（Loading=骨架，失败=降级提示） */
    function SettingsSection(props) {
      var pair = react.useState({ parts: null, model: null, error: null, version: 0 })
      var state = pair[0]
      var setState = pair[1]
      react.useEffect(function () {
        var alive = true
        var unsubscribe = null
        loadParts().then(function (parts) {
          if (!alive) return
          try {
            var model = parts.model.createModel({ api: props.api })
            unsubscribe = model.subscribe(function () {
              if (alive) setState({ parts: parts, model: model, error: null, version: Date.now() })
            })
            setState({ parts: parts, model: model, error: null, version: Date.now() })
            var booting = model.actions.boot()
            if (booting && typeof booting.catch === 'function') booting.catch(function () { /* 模型层已归因（fail-open） */ })
          } catch (e) {
            if (alive) setState({ parts: parts, model: null, error: describe(e), version: Date.now() })
          }
        }, function (e) {
          if (alive) setState({ parts: null, model: null, error: describe(e), version: Date.now() })
        })
        return function onUnmount() {
          alive = false
          if (unsubscribe) { try { unsubscribe() } catch { /* 收敛不抛（INV-6） */ } }
        }
      }, [])
      if (state.model && state.parts) {
        return state.parts.cards.renderSettingsView(state.model.getState(), state.model.actions)
      }
      if (state.error) {
        return react.createElement('div', { className: 'gho-page' },
          react.createElement('div', { className: 'gho-error-card', role: 'status' },
            react.createElement('div', { className: 'gho-error-title' }, '界面组件不可用'),
            react.createElement('p', { className: 'gho-error-hint' }, '设置面组件载入失败：请刷新页面后重试；若持续失败请查看 dsh 日志')))
      }
      return react.createElement('div', { className: 'gho-page' },
        react.createElement('div', { className: 'gho-skeleton gho-skeleton-line' }),
        react.createElement('div', { className: 'gho-skeleton gho-skeleton-line' }),
        react.createElement('div', { className: 'gho-skeleton gho-skeleton-line' }))
    }

    /** bundle 页一行摘要：登录名 + token 是否在位（零明文） */
    function SummaryLine(props) {
      var pair = react.useState({ phase: 'loading', login: null, hasToken: false })
      var state = pair[0]
      var setState = pair[1]
      react.useEffect(function () {
        var alive = true
        props.api.fetch('status').then(function (r) { return r.json() }).then(function (b) {
          if (!alive) return
          var hosts = b && Array.isArray(b.hosts) ? b.hosts : []
          setState({
            phase: b && b.ok === true ? 'ready' : 'error',
            login: b && b.login ? String(b.login) : null,
            hasToken: hosts.some(function (h) { return Boolean(h && h.hasToken) }),
          })
        }, function () {
          if (alive) setState({ phase: 'error', login: null, hasToken: false })
        })
        return function onUnmount() { alive = false }
      }, [])
      if (state.phase === 'loading') return react.createElement('div', { className: 'gho-summary' }, 'GitHub 集成：载入中')
      if (state.phase === 'error') return react.createElement('div', { className: 'gho-summary' }, 'GitHub 集成：状态暂不可用')
      return react.createElement('div', { className: 'gho-summary' },
        'GitHub · ' + (state.login === null ? '未登录' : state.login) + ' · ' + (state.hasToken ? 'token 已配置' : 'token 未配置'))
    }

    /** 设置面整体渲染（壳的 render* 分发点）：root div + 容器组件（hooks 在组件内，不进壳渲染） */
    exports.renderSettingsSection = function renderSettingsSection(props) {
      return react.createElement('div', { className: 'gho-root', 'data-dsh-plugin': 'dsh-github-ops' },
        react.createElement(SettingsSection, { api: props ? props.api : null, ownerProps: props ? props.ownerProps : null }))
    }

    /** bundle 页一行摘要（无 api 面=不渲染） */
    exports.renderSummary = function renderSummary(props) {
      if (!props || !props.api || typeof props.api.fetch !== 'function') return null
      return react.createElement('div', { className: 'gho-root', 'data-dsh-plugin': 'dsh-github-ops' },
        react.createElement(SummaryLine, { api: props.api }))
    }

    return module.exports
  },
})
