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

    // 可改白名单（客户端副本，只控表单；服务端 lib/settings-write.js 为权威判据，双侧一致）。
    // hint/placeholder（T9-F1 填写引导）：hint=控件下功能说明（语义源=trigger.js/search.js，不夸大），
    // placeholder=textarea 参考填写示例行（多行灰显示，不替代 label）。
    var EDITABLE_FIELDS = [
      {
        path: ['triggers', 'words'], kind: 'string[]', group: '触发条件', label: '触发词面（一行一词）',
        placeholder: 'wiki\nobsidian\n索引目录',
        hint: '会话消息里出现这些词或短语时，触发 vault 检索并把命中片段注入上下文。只对用户消息生效；留空使用默认表。',
      },
      {
        path: ['triggers', 'entityPaths'], kind: 'string[]', group: '触发条件', label: '索引实体路径（一行一条）',
        placeholder: 'wiki/concepts\nraw/projects/kb-context\nINDEX.md',
        hint: '填 vault 里的路径或文件名（相对 vault 根）。会话里提到这些实体——路径字面、[[wikilink]]、@ 引用——同样触发检索，与触发词面是并集，任一命中即触发。',
      },
      {
        path: ['budget', 'maxSnippets'], kind: 'number', group: '注入预算', label: '注入预算：单次最多片段数',
        hint: '一次最多注入几条命中片段（默认 3）。',
      },
      {
        path: ['budget', 'maxTokens'], kind: 'number', group: '注入预算', label: '注入预算：token 上限',
        hint: '注入片段像对话一样占用会话上下文 token（窗口有限、按量计成本），不设限会挤占正常对话预算、单次检索成本不可控。此项限制单次注入总量（默认 2000，按粗略估算计），超出即停止追加、首条必保。',
      },
      {
        path: ['timeoutMs'], kind: 'number', group: '检索超时', label: '检索总超时（毫秒，超时 fail-open 降级）',
        hint: '默认 1500。超时即放弃本次检索、对话照常继续；填 0 = 立即超时（等于停用自动检索）。',
      },
      {
        path: ['scope', 'indexAll'], kind: 'string[]', group: '作用域', label: '作用域：FTS5 索引目录（相对 vault 根）',
        placeholder: 'wiki\nraw',
        hint: '这些目录的文档进全文索引，是触发检索的主命中面。一行一条，默认 wiki、raw。',
      },
      {
        path: ['scope', 'grepOnDemand'], kind: 'string[]', group: '作用域', label: '作用域：按需 grep 目录（相对 vault 根）',
        placeholder: '01-客户资料\n02-致远OA',
        hint: '只登记路径、不建索引的目录。检索零命中且目标落在此范围时，会提示改用 wiki_read 直读。',
      },
    ]
    var READONLY_FIELDS = [
      {
        path: ['hotMap', 'enabled'], kind: 'boolean', group: '只读展示', label: '热图开关（只读展示）',
        hint: '热图（vault 热点摘要）预留配置，当前版本仅展示。',
      },
      {
        path: ['hotMap', 'maxChars'], kind: 'number', group: '只读展示', label: '热图摘要长度上限（只读展示）',
        hint: '热图（vault 热点摘要）预留配置，当前版本仅展示。',
      },
      {
        path: ['vaultRoot'], kind: 'string', group: '只读展示', label: 'vault 根路径（只读展示）',
        hint: 'wiki_read 直读的根路径（在配置文件中设置）。',
      },
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

    /** 行组件（宿主 settings-form .field 形：label → 控件 → hint 纵向）：
     *  布尔=checkbox、数字=number input、字符串数组=textarea（一行一项，placeholder 放示例行）、其他=只读文本。
     *  无障碍：label htmlFor 与控件 id 关联；placeholder 不替代 label；disabled 真实禁用。 */
    function SettingsRow(props) {
      var field = props.field
      var value = props.value
      var readOnly = props.readOnly === true
      var onChange = props.onChange
      var id = 'kb-context-' + field.path.join('-')
      var input
      if (field.kind === 'boolean') {
        input = react.createElement('input', {
          type: 'checkbox',
          id: id,
          checked: value === true,
          disabled: readOnly,
          onChange: function (e) { onChange(e.target.checked) },
        })
      } else if (field.kind === 'number') {
        input = react.createElement('input', {
          type: 'number',
          id: id,
          className: 'kb-context-settings-input',
          value: value === undefined || value === null ? '' : String(value),
          disabled: readOnly,
          onChange: function (e) {
            var n = e.target.value === '' ? undefined : Number(e.target.value)
            onChange(n)
          },
        })
      } else if (field.kind === 'string[]') {
        input = react.createElement('textarea', {
          id: id,
          className: 'kb-context-settings-textarea',
          rows: 3,
          placeholder: field.placeholder,
          value: Array.isArray(value) ? value.join('\n') : '',
          disabled: readOnly,
          onChange: function (e) {
            var lines = e.target.value.split('\n').map(function (s) { return s.trim() }).filter(function (s) { return s !== '' })
            onChange(lines)
          },
        })
      } else {
        input = react.createElement('span', { id: id, className: 'kb-context-settings-value' }, String(value === undefined ? '' : value))
      }
      return react.createElement('div', { className: 'kb-context-settings-row' },
        react.createElement('label', { className: 'kb-context-settings-label', htmlFor: id }, field.label),
        input,
        field.hint ? react.createElement('p', { className: 'kb-context-settings-hint' }, field.hint) : null,
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
      var lastGroup = null
      function addRow(el, field) {
        if (field.group && field.group !== lastGroup) {
          rows.push(react.createElement('h4', { key: 'g-' + field.group, className: 'kb-context-settings-group' }, field.group))
          lastGroup = field.group
        }
        rows.push(el)
      }
      for (var i = 0; i < EDITABLE_FIELDS.length; i++) {
        addRow(react.createElement(SettingsRow, {
          key: 'e' + i,
          field: EDITABLE_FIELDS[i],
          value: draftValue(EDITABLE_FIELDS[i]),
          readOnly: !writable,
          onChange: (function (f) { return function (v) { onChange(f, v) } })(EDITABLE_FIELDS[i]),
        }), EDITABLE_FIELDS[i])
      }
      for (var j = 0; j < READONLY_FIELDS.length; j++) {
        addRow(react.createElement(SettingsRow, {
          key: 'r' + j,
          field: READONLY_FIELDS[j],
          value: getPath(cfg, READONLY_FIELDS[j].path),
          readOnly: true,
          onChange: function () {},
        }), READONLY_FIELDS[j])
      }
      return react.createElement('div', { className: 'kb-context-settings', 'data-dsh-plugin': 'kb-context' },
        react.createElement('h3', { className: 'kb-context-settings-title' }, 'kb-context · 设置'),
        react.createElement('p', { className: 'kb-context-settings-note' }, '可改项保存即热生效；只读项仅展示。'),
        rows,
        react.createElement('div', { className: 'kb-context-settings-footer' },
          writable
            ? react.createElement('button', { type: 'button', className: 'kb-context-settings-save', disabled: state.saving, onClick: save }, state.saving ? '保存中…' : '保存')
            : react.createElement('p', { className: 'kb-context-settings-note' }, '本部署配置写入缝缺失（configEditor 未挂载），暂只读展示。'),
          state.notice
            ? react.createElement('p', { className: state.notice.kind === 'ok' ? 'kb-context-settings-ok' : 'kb-context-settings-error' }, state.notice.text)
            : null,
        ),
      )
    }

    // —— 设置面样式（T9-F1：自绘 + dsh token，宿主 settings-form .field 形；零第三方 UI 库）——
    // 色板唯一来源=--dsw-alias-* 语义别名：宿主暗色态重定义别名即自动暗色适配，
    // 本文件零暗色 media query / 主题属性分支、零硬编码色值（var() 无值时按 CSS
    // computed-value 语义落 inherit/currentcolor/transparent，可读性不塌）。焦点环引宿主 --dsw-focus-ring-*。
    var STYLE_ID = 'kb-context-settings-css'
    var SETTINGS_CSS = [
      '.kb-context-settings{max-width:760px;font-family:var(--dsw-font-family);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.kb-context-settings-title{margin:0 0 4px;font-size:16px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.kb-context-settings-note{margin:0;padding:0 2px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
      '.kb-context-settings-group{margin:16px 0 0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.kb-context-settings-row{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2)}',
      '.kb-context-settings-group + .kb-context-settings-row,.kb-context-settings-note + .kb-context-settings-row{border-top:none}',
      '.kb-context-settings-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.kb-context-settings-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.kb-context-settings-input{width:96px;height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.kb-context-settings-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
      '.kb-context-settings-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.kb-context-settings-textarea{min-height:96px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);resize:vertical}',
      '.kb-context-settings-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}',
      '.kb-context-settings-textarea:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
      '.kb-context-settings-textarea:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.kb-context-settings-value{font-family:var(--ds-font-family-code);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.kb-context-settings-footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding-top:16px}',
      '.kb-context-settings-save{appearance:none;padding:5px 14px;border:1px solid transparent;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;cursor:pointer}',
      '.kb-context-settings-save:disabled{opacity:.4;cursor:default}',
      '.kb-context-settings-save:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.kb-context-settings-ok{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-success-primary)}',
      '.kb-context-settings-error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}',
    ].join('')

    /** 样式注入（幂等 + document 守卫）：Node/测试环境无 document 直接跳过（R4），绝不炸模块加载。 */
    function ensureStyles() {
      if (typeof document !== 'undefined') {
        try {
          if (document.getElementById(STYLE_ID)) return
          var el = document.createElement('style')
          el.id = STYLE_ID
          el.setAttribute('data-plugin-css', 'kb-context')
          el.textContent = SETTINGS_CSS
          ;(document.head || document.documentElement).appendChild(el)
        } catch { /* 样式注入失败不炸插件（视觉降级=浏览器默认） */ }
      }
    }
    ensureStyles()

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
