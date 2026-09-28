// wiki-steward 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS——lib/ 不引构建器、React 无 JSX）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory(require) 只登记模块体（副作用全在 apply）；
// 宿主自动服务 /plugins/wiki-steward/client.js（dsh.client 声明被 dsh-client-modules 扫入浏览器花名册）。
//
// 设置菜单=正确两面（裁定 2026-09-28，参考实现照抄不猜缝）：
//   ① 配置展示/可改 = `settings.section` 命名空间注册（dsh-better-sidebar 路线：
//      {name:'settings.section', id, order, label} → 设置页 navLabel 自动进设置页）；
//      读写走官方路由面 api/wiki-steward/settings（文档相对形——skill-explorer issue #1707 教训：
//      **无前导斜杠/相对 base**；站内绝对 '/…' 会逃出 <base href="./"> 前缀=生产 404 根因）。
//   ② ingest 日志/触发面板 = `sidebar.panellist` 行 + `main` 槽页（slots.register 形照 skill-explorer）。
// 弃自造 `settings.plugins.tab` 页签 + 站内绝对 '/wiki-steward/panel.js' 动态 import（旧 404 面）；
// panel.js 改由 ctx.webServer prefix /api/wiki-steward 官方路由面静态服务，import 路径文档相对。
// root 壳槽位禁注册（其 chrome 归壳）：settings.launcher/trigger/header/close/action/onboarding。
// ⚠️ settings.section 不在禁注册列（better-sidebar 实证注册 + settings-general 壳 renderSlot("settings.section")
//    渲染贡献组件——上一波『root 禁注册含 settings.section』系误读，本波按参考实现纠正）。
window.__ModuleLoader__.load({
  id: 'wiki-steward',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基；API 路径同此形
    var PANEL_URL = 'api/wiki-steward/panel.js'
    var SETTINGS_URL = 'api/wiki-steward/settings'
    var API_BASE = 'api/wiki-steward'

    /** 面板加载缝（测试注入；默认浏览器动态 import 构建物） */
    exports.__panelLoader = function loadPanel(url) {
      return import(url)
    }

    /** fetch 缝（测试注入；默认全局 fetch） */
    exports.__fetch = function doFetch(url, init) {
      return fetch(url, init)
    }

    // 可改白名单（客户端副本，只控表单；服务端 lib/settings-write.js 为权威判据，双侧一致）
    var EDITABLE_FIELDS = [
      { path: ['capture', 'enabled'], kind: 'boolean', label: '捕获开关（turn-stopping 双轨落盘）' },
      { path: ['capture', 'bufferRounds'], kind: 'number', label: '缓冲轮数（每 N 轮强制 flush）' },
      { path: ['queue', 'maxRetries'], kind: 'number', label: '队列重试上限' },
      { path: ['queue', 'ttlDays'], kind: 'number', label: '队列条目 TTL（天）' },
      { path: ['secrets', 'enabled'], kind: 'boolean', label: '脱敏开关（落盘/注入前哨兵中和）' },
    ]
    var READONLY_FIELDS = [
      { path: ['vaultRoot'], kind: 'string', label: 'vault 根路径（只读展示）' },
      { path: ['write', 'readOnly'], kind: 'boolean', label: '写侧只读（INV-7：语义勿动，动手需显式开启）' },
    ]

    function getPath(obj, path) {
      var cur = obj
      for (var i = 0; i < path.length; i++) {
        if (cur === null || typeof cur !== 'object') return undefined
        cur = cur[path[i]]
      }
      return cur
    }

    function setPath(obj, path, value) {
      var node = obj
      for (var i = 0; i < path.length - 1; i++) {
        if (node[path[i]] === null || typeof node[path[i]] !== 'object') node[path[i]] = {}
        node = node[path[i]]
      }
      node[path[path.length - 1]] = value
      return obj
    }

    /** 行组件：布尔=checkbox、数字=number input、字符串数组=textarea（一行一项）、其他=只读文本 */
    function SettingsRow(props) {
      var field = props.field
      var value = props.value
      var readOnly = props.readOnly === true
      var onChange = props.onChange
      var input
      if (field.kind === 'boolean') {
        input = react.createElement('input', {
          type: 'checkbox',
          checked: value === true,
          disabled: readOnly,
          onChange: function (e) { onChange(e.target.checked) },
        })
      } else if (field.kind === 'number') {
        input = react.createElement('input', {
          type: 'number',
          value: value === undefined || value === null ? '' : String(value),
          disabled: readOnly,
          onChange: function (e) {
            var n = e.target.value === '' ? undefined : Number(e.target.value)
            onChange(n)
          },
        })
      } else if (field.kind === 'string[]') {
        input = react.createElement('textarea', {
          rows: 3,
          value: Array.isArray(value) ? value.join('\n') : '',
          disabled: readOnly,
          onChange: function (e) {
            var lines = e.target.value.split('\n').map(function (s) { return s.trim() }).filter(function (s) { return s !== '' })
            onChange(lines)
          },
        })
      } else {
        input = react.createElement('span', { className: 'wiki-steward-settings-value' }, String(value === undefined ? '' : value))
      }
      return react.createElement('div', { className: 'wiki-steward-settings-row' },
        react.createElement('label', { className: 'wiki-steward-settings-label' }, field.label),
        input,
        field.note ? react.createElement('p', { className: 'wiki-steward-settings-note' }, field.note) : null,
      )
    }

    /**
     * 设置面贡献组件（settings.section）：配置展示/可改。
     * 载入=GET api/wiki-steward/settings（文档相对）；保存=POST 同址 {patch}（只发变更叶子）。
     * 失败/拒绝=容器内如实报错（not_editable/invalid 服务端判据原文），绝不静默。
     */
    function WikiStewardSettingsSection() {
      var pair = react.useState({ status: 'loading', data: null, error: null, draft: {}, saving: false, notice: null })
      var state = pair[0]
      var setState = pair[1]

      react.useEffect(function load() {
        var alive = true
        Promise.resolve()
          .then(function () { return exports.__fetch(SETTINGS_URL) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (!alive) return
            if (body && body.error) {
              setState({ status: 'error', data: null, error: String(body.error.message || body.error.code || '读取失败'), draft: {}, saving: false, notice: null })
              return
            }
            setState({ status: 'ready', data: body.data, error: null, draft: {}, saving: false, notice: null })
          })
          .catch(function (e) {
            if (!alive) return
            setState({ status: 'error', data: null, error: String((e && e.message) || e), draft: {}, saving: false, notice: null })
          })
        return function cleanup() { alive = false }
      }, [])

      function draftValue(field) {
        var v = getPath(state.draft, field.path)
        return v !== undefined ? v : getPath((state.data && state.data.config) || {}, field.path)
      }

      function onChange(field, value) {
        var next = setPath(JSON.parse(JSON.stringify(state.draft)), field.path, value)
        setState({ status: state.status, data: state.data, error: state.error, draft: next, saving: state.saving, notice: null })
      }

      function save() {
        if (state.saving || state.status !== 'ready') return
        if (Object.keys(state.draft).length === 0) {
          setState({ status: state.status, data: state.data, error: state.error, draft: state.draft, saving: false, notice: { kind: 'error', text: '没有待保存的变更' } })
          return
        }
        setState({ status: state.status, data: state.data, error: state.error, draft: state.draft, saving: true, notice: null })
        Promise.resolve()
          .then(function () {
            return exports.__fetch(SETTINGS_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ patch: state.draft }),
            })
          })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (body && body.error) {
              setState({ status: 'ready', data: state.data, error: null, draft: state.draft, saving: false, notice: { kind: 'error', text: String(body.error.message || body.error.code || '保存失败') } })
              return
            }
            var data = body && body.data && body.data.config ? Object.assign({}, state.data, { config: body.data.config }) : state.data
            setState({ status: 'ready', data: data, error: null, draft: {}, saving: false, notice: { kind: 'ok', text: '已保存（热生效）' } })
          })
          .catch(function (e) {
            setState({ status: 'ready', data: state.data, error: null, draft: state.draft, saving: false, notice: { kind: 'error', text: String((e && e.message) || e) } })
          })
      }

      if (state.status === 'loading') {
        return react.createElement('div', { className: 'wiki-steward-settings', 'data-dsh-plugin': 'wiki-steward' }, '设置载入中…')
      }
      if (state.status === 'error') {
        return react.createElement('div', { className: 'wiki-steward-settings', 'data-dsh-plugin': 'wiki-steward' },
          react.createElement('p', { className: 'wiki-steward-settings-error' }, 'wiki-steward 设置载入失败：' + state.error))
      }
      var cfg = (state.data && state.data.config) || {}
      var writable = state.data && state.data.writable === true
      var rows = []
      for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
        rows.push(react.createElement(SettingsRow, {
          key: 'e' + i,
          field: EDITABLE_FIELDS[i],
          value: draftValue(EDITABLE_FIELDS[i]),
          readOnly: !writable,
          onChange: (function (f) { return function (v) { onChange(f, v) } })(EDITABLE_FIELDS[i]),
        }))
      }
      for (var j = 0; j < READONLY_FIELDS.length; j++) {
        rows.push(react.createElement(SettingsRow, {
          key: 'r' + j,
          field: READONLY_FIELDS[j],
          value: getPath(cfg, READONLY_FIELDS[j].path),
          readOnly: true,
          onChange: function () {},
        }))
      }
      return react.createElement('div', { className: 'wiki-steward-settings', 'data-dsh-plugin': 'wiki-steward' },
        react.createElement('h3', null, 'wiki-steward · 设置'),
        react.createElement('p', { className: 'wiki-steward-settings-note' }, '可改项即时热生效（写路径=官方路由面 api/wiki-steward/settings → configEditor 持久化缝）；只读项语义勿动。'),
        rows,
        writable
          ? react.createElement('button', { type: 'button', className: 'wiki-steward-settings-save', disabled: state.saving, onClick: save }, state.saving ? '保存中…' : '保存')
          : react.createElement('p', { className: 'wiki-steward-settings-note' }, '本部署配置写入缝缺失（configEditor 未挂载），暂只读展示。'),
        state.notice
          ? react.createElement('p', { className: state.notice.kind === 'ok' ? 'wiki-steward-settings-ok' : 'wiki-steward-settings-error' }, state.notice.text)
          : null,
      )
    }

    /**
     * 侧栏行 glyph（壳管按钮/label/几何，本组件只画 glyph）；
     * data-dsh-panel-entry=插件自有 DOM 锚（L2 契约，skins 归属判据）。
     */
    function WikiStewardPanelIcon(props) {
      var size = props && props.size ? props.size : 16
      return react.createElement('svg', {
        'data-dsh-panel-entry': 'wiki-steward',
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '1.3',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
      react.createElement('path', { d: 'M3 2.5h7l3 3v8h-10z' }),
      react.createElement('path', { d: 'M5.5 8.5h5M5.5 11h5' }))
    }

    /**
     * main 槽页：ingest 日志/触发面板（web/dist 的 Vue 面板挂进容器）。
     * 挂载契约：mount(el, {apiBase}) → {unmount()}；清理=unmount+容器清空，幂等。
     * panel.js 走文档相对路径（api/wiki-steward/panel.js，官方 prefix 路由面服务）。
     */
    function WikiStewardPanelPage() {
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
      return react.createElement('div', {
        ref: elRef,
        className: 'wiki-steward-ingest-panel',
        'data-dsh-plugin': 'wiki-steward',
        'data-dsh-wiki-steward-view': '',
      })
    }

    /**
     * 注册三面：①settings.section（设置菜单配置面）②sidebar.panellist（侧栏行）③main（面板页）。
     * 每面注册包 ctx.slots.inject：槽位方缺席=该面缺席，绝不炸插件（skill-explorer 同款纪律）。
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
              if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[wiki-steward] ' + slotName + ' 注册失败（缺槽位方？）：' + ((e && e.message) || e))
            } catch { /* 日志缺位不抛 */ }
            return function noop() {}
          }
        })
      }
      try {
        // ① 设置菜单（dsh-better-sidebar 路线）：navLabel 自动进设置页
        disposers.push(safeRegister('settings.section', {
          name: 'settings.section',
          id: 'wiki-steward',
          order: 30,
          label: function label() { return 'wiki-steward' },
        }, WikiStewardSettingsSection))
        // ② ingest 面板（skill-explorer 形）：sidebar.panellist 行 + main 槽页
        disposers.push(safeRegister('sidebar.panellist', {
          name: 'sidebar.panellist',
          id: 'wiki-steward',
          order: 30,
          label: function label() { return 'wiki-steward · Ingest' },
        }, WikiStewardPanelIcon))
        disposers.push(safeRegister('main', {
          name: 'main',
          key: 'wiki-steward',
          inject: function inject() { return { apiBase: API_BASE } },
        }, WikiStewardPanelPage))
      } catch (e) {
        try {
          if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[wiki-steward] 客户端面注册失败：' + ((e && e.message) || e))
        } catch { /* 同上 */ }
      }
      return function dispose() {
        for (var i = 0; i < disposers.length; i++) {
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
