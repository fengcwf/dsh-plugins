// kb-context 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS——lib/ 不引构建器、React 无 JSX）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory(require) 只登记模块体（副作用全在 apply）；
// 宿主自动服务 /plugins/kb-context/client.js（dsh.client 声明被 dsh-client-modules 扫入浏览器花名册）。
//
// 设置菜单（裁定 2026-09-28「kb-context 插件也在设置菜单添加相关设置配置」）：
//   `settings.section` 命名空间注册（dsh-better-sidebar 路线：{name:'settings.section', id, order, label}
//   → 设置页 navLabel 自动进设置页）；配置展示/可改走官方路由面 api/kb-context/settings
//   （文档相对形——skill-explorer issue #1707 教训：无前导斜杠/相对 base）。
//   可改=triggers.words/entityPaths、budget、timeoutMs、scope（热改语义本就支持 per-call 读）；
//   hotMap/vaultRoot 只读展示（裁定枚举外）。纯设置无面板行（不注册 sidebar.panellist / main）。
// root 壳槽位禁注册（其 chrome 归壳）：settings.launcher/trigger/header/close/action/onboarding。
window.__ModuleLoader__.load({
  id: 'kb-context',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基
    var SETTINGS_URL = 'api/kb-context/settings'

    /** fetch 缝（测试注入；默认全局 fetch） */
    exports.__fetch = function doFetch(url, init) {
      return fetch(url, init)
    }

    // 可改白名单（客户端副本，只控表单；服务端 lib/settings-write.js 为权威判据，双侧一致）
    var EDITABLE_FIELDS = [
      { path: ['triggers', 'words'], kind: 'string[]', label: '触发词面（一行一词）' },
      { path: ['triggers', 'entityPaths'], kind: 'string[]', label: '索引实体路径（一行一条）' },
      { path: ['budget', 'maxSnippets'], kind: 'number', label: '注入预算：单次最多片段数' },
      { path: ['budget', 'maxTokens'], kind: 'number', label: '注入预算：token 上限' },
      { path: ['timeoutMs'], kind: 'number', label: '检索总超时（毫秒，超时 fail-open 降级）' },
      { path: ['scope', 'indexAll'], kind: 'string[]', label: '作用域：FTS5 索引目录（相对 vault 根）' },
      { path: ['scope', 'grepOnDemand'], kind: 'string[]', label: '作用域：按需 grep 目录（相对 vault 根）' },
    ]
    var READONLY_FIELDS = [
      { path: ['hotMap', 'enabled'], kind: 'boolean', label: '热图开关（只读展示）' },
      { path: ['hotMap', 'maxChars'], kind: 'number', label: '热图摘要长度上限（只读展示）' },
      { path: ['vaultRoot'], kind: 'string', label: 'vault 根路径（只读展示）' },
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
        input = react.createElement('span', { className: 'kb-context-settings-value' }, String(value === undefined ? '' : value))
      }
      return react.createElement('div', { className: 'kb-context-settings-row' },
        react.createElement('label', { className: 'kb-context-settings-label' }, field.label),
        input,
      )
    }

    /**
     * 设置面贡献组件（settings.section）：配置展示/可改。
     * 载入=GET api/kb-context/settings（文档相对）；保存=POST 同址 {patch}（只发变更叶子）。
     * 失败/拒绝=容器内如实报错（not_editable/invalid 服务端判据原文），绝不静默。
     */
    function KbContextSettingsSection() {
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
            setState({ status: 'ready', data: data, error: null, draft: {}, saving: false, notice: { kind: 'ok', text: '已保存（热生效，per-call 读即刻可见）' } })
          })
          .catch(function (e) {
            setState({ status: 'ready', data: state.data, error: null, draft: state.draft, saving: false, notice: { kind: 'error', text: String((e && e.message) || e) } })
          })
      }

      if (state.status === 'loading') {
        return react.createElement('div', { className: 'kb-context-settings', 'data-dsh-plugin': 'kb-context' }, '设置载入中…')
      }
      if (state.status === 'error') {
        return react.createElement('div', { className: 'kb-context-settings', 'data-dsh-plugin': 'kb-context' },
          react.createElement('p', { className: 'kb-context-settings-error' }, 'kb-context 设置载入失败：' + state.error))
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
      return react.createElement('div', { className: 'kb-context-settings', 'data-dsh-plugin': 'kb-context' },
        react.createElement('h3', null, 'kb-context · 设置'),
        react.createElement('p', { className: 'kb-context-settings-note' }, '可改项即时热生效（写路径=官方路由面 api/kb-context/settings → configEditor 持久化缝；检索/注入 per-call 读）；只读项仅展示。'),
        rows,
        writable
          ? react.createElement('button', { type: 'button', className: 'kb-context-settings-save', disabled: state.saving, onClick: save }, state.saving ? '保存中…' : '保存')
          : react.createElement('p', { className: 'kb-context-settings-note' }, '本部署配置写入缝缺失（configEditor 未挂载），暂只读展示。'),
        state.notice
          ? react.createElement('p', { className: state.notice.kind === 'ok' ? 'kb-context-settings-ok' : 'kb-context-settings-error' }, state.notice.text)
          : null,
      )
    }

    /**
     * 注册设置面：settings.section（设置菜单配置面）。
     * 注册包 ctx.slots.inject：槽位方缺席=该面缺席，绝不炸插件（skill-explorer 同款纪律）。
     * 纯设置无面板行（不注册 sidebar.panellist / main——裁定 B：client.js 只注册设置贡献）。
     */
    function apply(ctx) {
      var disposers = []
      try {
        disposers.push(ctx.slots.inject('settings.section', function setup() {
          try {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'kb-context',
              order: 30,
              label: function label() { return 'kb-context' },
            }, KbContextSettingsSection)
          } catch (e) {
            try {
              if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[kb-context] settings.section 注册失败（缺槽位方？）：' + ((e && e.message) || e))
            } catch { /* 日志缺位不抛 */ }
            return function noop() {}
          }
        }))
      } catch (e) {
        try {
          if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[kb-context] 客户端面注册失败：' + ((e && e.message) || e))
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
