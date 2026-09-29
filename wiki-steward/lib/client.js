// wiki-steward 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS——lib/ 不引构建器、React 无 JSX）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory(require) 只登记模块体（副作用全在 apply）；
// 宿主自动服务 /plugins/wiki-steward/client.js（dsh.client 声明被 dsh-client-modules 扫入浏览器花名册）。
//
// 设置页=唯一入口（裁定 2026-09-29 Task F1「面板搬家」，用户诉求=不在 dsh 首页显示面板行）：
//   ① 配置展示/可改 = `settings.section` 命名空间注册（dsh-better-sidebar 路线：
//      {name:'settings.section', id, order, label} → 设置页 navLabel 自动进设置页）；
//      读写走官方路由面 api/wiki-steward/settings（文档相对形——skill-explorer issue #1707 教训：
//      **无前导斜杠/相对 base**；站内绝对 '/…' 会逃出 <base href="./"> 前缀=生产 404 根因）。
//   ② ingest 日志查看 = 设置节内「查看历史记录」按钮 → 弹层挂 web/dist 日志视图（view:'log'），
//      来源标注/尾部 N 行/滚动加载语义保持（逻辑复用 web/src/lib/log-view*）。
//   ③ `sidebar.panellist` 行 + `main` 槽页注册已移除（旧面板入口随诉求摘除；其裸 import 说明符
//      =TypeError: Failed to resolve module specifier 根因，诊断 §1.2）。
// 弃自造 `settings.plugins.tab` 页签 + 站内绝对 '/wiki-steward/panel.js' 动态 import（旧 404 面）；
// panel.js 改由 ctx.webServer prefix /api/wiki-steward 官方路由面静态服务，动态 import 说明符经
// new URL(url, document.baseURI).href 转真 URL 再 import（与 fetch 同基解析，<base> 有无两口径均正确）。
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

    /**
     * 面板加载缝（测试注入；默认浏览器动态 import 构建物）。
     * 说明符必须先转真 URL（new URL(url, document.baseURI).href）：裸 `import(url)` 的 'api/…' 形
     * 既无 ./ ../ 前缀也无 scheme，按 ESM 规范=bare specifier（包名）→ 浏览器直接抛
     * TypeError: Failed to resolve module specifier（诊断 §1.2 根因）；转绝对 URL 后与 fetch 同基
     * 解析（document.baseURI 自动反映 <base> 有无两口径），.test 里真 ESM 动态 import 回归锁锁死。
     */
    exports.__panelLoader = function loadPanel(url) {
      return import(new URL(url, document.baseURI).href)
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
     * 设置面贡献组件（settings.section）：配置展示/可改 + 历史记录入口。
     * 载入=GET api/wiki-steward/settings（文档相对）；保存=POST 同址 {patch}（只发变更叶子）。
     * 失败/拒绝=容器内如实报错（not_editable/invalid 服务端判据原文），绝不静默。
     */
    function WikiStewardSettingsSection() {
      var pair = react.useState({ status: 'loading', data: null, error: null, draft: {}, saving: false, notice: null, historyOpen: false })
      var state = pair[0]
      var setState = pair[1]
      /** 局部更新（函数形 updater：未列键一律沿用——含 historyOpen 开合态，异步回调无陈旧闭包风险） */
      function update(delta) {
        setState(function (prev) { return Object.assign({}, prev, delta) })
      }
      function toggleHistory() {
        update({ historyOpen: state.historyOpen !== true })
      }

      react.useEffect(function load() {
        var alive = true
        Promise.resolve()
          .then(function () { return exports.__fetch(SETTINGS_URL) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (!alive) return
            if (body && body.error) {
              update({ status: 'error', data: null, error: String(body.error.message || body.error.code || '读取失败'), draft: {}, saving: false, notice: null })
              return
            }
            update({ status: 'ready', data: body.data, error: null, draft: {}, saving: false, notice: null })
          })
          .catch(function (e) {
            if (!alive) return
            update({ status: 'error', data: null, error: String((e && e.message) || e), draft: {}, saving: false, notice: null })
          })
        return function cleanup() { alive = false }
      }, [])

      function draftValue(field) {
        var v = getPath(state.draft, field.path)
        return v !== undefined ? v : getPath((state.data && state.data.config) || {}, field.path)
      }

      function onChange(field, value) {
        var next = setPath(JSON.parse(JSON.stringify(state.draft)), field.path, value)
        update({ draft: next, notice: null })
      }

      function save() {
        if (state.saving || state.status !== 'ready') return
        if (Object.keys(state.draft).length === 0) {
          update({ saving: false, notice: { kind: 'error', text: '没有待保存的变更' } })
          return
        }
        update({ saving: true, notice: null })
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
              update({ saving: false, notice: { kind: 'error', text: String(body.error.message || body.error.code || '保存失败') } })
              return
            }
            var data = body && body.data && body.data.config ? Object.assign({}, state.data, { config: body.data.config }) : state.data
            update({ data: data, error: null, draft: {}, saving: false, notice: { kind: 'ok', text: '已保存（热生效）' } })
          })
          .catch(function (e) {
            update({ saving: false, notice: { kind: 'error', text: String((e && e.message) || e) } })
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
        react.createElement(WikiStewardHistoryEntry, { open: state.historyOpen === true, onToggle: toggleHistory }),
        rows,
        writable
          ? react.createElement('button', { type: 'button', className: 'wiki-steward-settings-save', disabled: state.saving, onClick: save }, state.saving ? '保存中…' : '保存')
          : react.createElement('p', { className: 'wiki-steward-settings-note' }, '本部署配置写入缝缺失（configEditor 未挂载），暂只读展示。'),
        state.notice
          ? react.createElement('p', { className: state.notice.kind === 'ok' ? 'wiki-steward-settings-ok' : 'wiki-steward-settings-error' }, state.notice.text)
          : null,
      )
    }

    // 弹层壳仅最小结构样式（fixed 覆盖 + 限高滚动——功能必需）；视觉/token 对齐留 F2 收口（本波不越界改样式）。
    var HISTORY_OVERLAY_STYLE = { position: 'fixed', inset: '0', zIndex: '1000', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
    var HISTORY_PANEL_STYLE = { background: 'var(--dsw-alias-bg-layer-2, #fff)', color: 'var(--dsw-alias-label-primary, inherit)', borderRadius: 'var(--dsw-radius-panel, 8px)', width: 'min(760px, 92vw)', maxHeight: '80vh', overflow: 'auto', padding: '12px 14px' }

    /**
     * 历史记录入口（设置节内，Task F1 面板搬家落点）：「查看历史记录」按钮点开弹层，呈现原面板的
     * ingest 日志查看能力（来源标注/尾部 N 行/滚动加载——web/dist 日志视图 view:'log'，
     * 逻辑复用 web/src/lib/log-view*）。展示组件（无钩子；开合态由设置节持有）。
     */
    function WikiStewardHistoryEntry(props) {
      var open = props.open === true
      var onToggle = props.onToggle
      return react.createElement('div', { className: 'wiki-steward-settings-history' },
        react.createElement('button', {
          type: 'button',
          className: 'wiki-steward-settings-history-toggle',
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () { onToggle() },
        }, open ? '收起历史记录' : '查看历史记录'),
        open
          ? react.createElement('div', {
              className: 'wiki-steward-settings-history-overlay',
              role: 'dialog',
              'aria-label': 'wiki-steward · 历史记录',
              style: HISTORY_OVERLAY_STYLE,
            },
            react.createElement('div', { className: 'wiki-steward-settings-history-panel', style: HISTORY_PANEL_STYLE },
              react.createElement('div', { className: 'wiki-steward-settings-history-head' },
                react.createElement('h4', null, 'wiki-steward · 历史记录'),
                react.createElement('button', { type: 'button', className: 'wiki-steward-settings-history-close', onClick: function () { onToggle() } }, '关闭')),
              react.createElement(WikiStewardHistoryMount, null)))
          : null,
      )
    }

    /**
     * 历史弹层挂载缝：web/dist 日志视图挂进容器。
     * 挂载契约：mount(el, {apiBase, view:'log'}) → {unmount()}；清理=unmount+容器清空，幂等。
     * panel.js 走文档相对路径（api/wiki-steward/panel.js，官方 prefix 路由面服务）；
     * 加载失败=容器内如实报错（不白屏不吞不留裸文本）。
     */
    function WikiStewardHistoryMount() {
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
            if (!mod || typeof mod.mount !== 'function') throw new Error('日志视图模块缺 mount 导出')
            handle = mod.mount(el, { apiBase: API_BASE, view: 'log' })
          })
          .catch(function onFail(e) {
            if (!alive) return
            try {
              el.textContent = 'wiki-steward 历史记录加载失败：' + ((e && e.message) || e)
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
        className: 'wiki-steward-history-mount',
        'data-dsh-plugin': 'wiki-steward',
        'data-dsh-wiki-steward-view': 'history',
      })
    }

    /**
     * 注册一面：①settings.section（设置菜单配置面 + 历史记录入口）。
     * sidebar.panellist 行 + main 槽页已随「面板搬家」移除（用户诉求=不在 dsh 首页显示）。
     * 注册包 ctx.slots.inject：槽位方缺席=该面缺席，绝不炸插件（skill-explorer 同款纪律）。
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
        // ① 设置菜单（dsh-better-sidebar 路线）：navLabel 自动进设置页；历史入口在节内
        disposers.push(safeRegister('settings.section', {
          name: 'settings.section',
          id: 'wiki-steward',
          order: 30,
          label: function label() { return 'wiki-steward' },
        }, WikiStewardSettingsSection))
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
