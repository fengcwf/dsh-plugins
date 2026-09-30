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
//   ⑥ 触发日志（0.4.0，A-TL5/A-TL6）：设置节「触发日志」组 kill switch（triggerLog.enabled，白名单可改）
//   +「查看触发日志」按钮 → 弹层（形制沿 wiki-steward/lib/client.js:424-476 历史记录先例：原生 Modal
//   title/closeLabel/onClose 契约、尾部 50 行+滚动加载+清空按钮+条数 N/200）；数据面=api/kb-context/logs
//   双端点（文档相对）。日志=进程内存环（重启清空、不落盘，文案如实——INV-TL4）。
// root 壳槽位禁注册（其 chrome 归壳）：settings.launcher/trigger/header/close/action/onboarding。
window.__ModuleLoader__.load({
  id: 'kb-context',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基
    var SETTINGS_URL = 'api/kb-context/settings'
    // 触发日志数据面（0.4.0）：GET 环条目 / POST 清空（lib/settings-routes.js，TECH 实现面 3 同源）
    var LOGS_URL = 'api/kb-context/logs'
    var LOGS_CLEAR_URL = 'api/kb-context/logs/clear'
    var LOG_TAIL_ROWS = 50 // 尾部行数初始（滚动加载增量同值，A-TL6）

    // 宿主原生控件（wiki-steward lib/client.js:443 同款 require 表语义）：primitives 包在场=原生 Modal
    // （遮罩/Escape/关闭钮收口归宿主控件）；缺席（本包 dsh.client.inject 未列该包）=同契约自绘 Modal
    // （零第三方库、token 同源）。require 失败静默收敛，绝不炸模块加载。
    var ui = null
    try { ui = require('@deepseek-ai/dsh-client-ui-primitives') } catch (e) { ui = null }

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
      {
        // 0.4.0（A-TL5 kill switch）：triggerLog.enabled 可改热生效；triggerLog.capacity 不可改（环容量读侧恒钳 ≤200）
        path: ['triggerLog', 'enabled'], kind: 'boolean', group: '触发日志', label: '启用触发日志（kill switch）',
        hint: '默认开启。每次触发评估记一条判定摘要（时间/命中与否/通道/命中词或路径/片段数/token 估算/耗时/原因），不含消息正文；仅存进程内存环（最多 200 条，超出丢最旧），重启即清空、不落盘。字段口径以 changes/2026-09-30-kb-context-trigger-log/TECH.md 为准。关闭后零记录零开销。',
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

    // ===== 触发日志弹层（0.4.0，A-TL6；形制沿 wiki-steward/lib/client.js:424-476 历史记录先例）=====
    // reason 闭集中文标签（lib/trigger-log.js ENTRY_REASONS 同源；自由文本绝不入日志——INV-TL1）
    var REASON_LABELS = {
      'hit': '命中并注入', 'no-user-source': '非用户消息', 'no-trigger-match': '未命中触发',
      'no-hits': '触发命中但零检索命中', 'timeout': '检索超时', 'error': '评估异常',
    }

    /** 判定摘要行文案（INV-TL1 白名单 8 键直读，零消息正文；matched=配置词表/实体路径成员） */
    function logLineText(e) {
      if (!e || typeof e !== 'object') return ''
      var t = typeof e.ts === 'number' ? new Date(e.ts).toLocaleString() : ''
      var hit = e.hit ? '命中' : '未命中'
      var channel = e.channel === 'words' ? '词面' : e.channel === 'entity' ? '实体' : '无'
      var matched = Array.isArray(e.matched) && e.matched.length > 0 ? e.matched.join('、') : '—'
      var reason = REASON_LABELS[e.reason] || String(e.reason === undefined ? '' : e.reason)
      return t + '｜' + hit + '｜通道:' + channel + '｜命中词/路径:' + matched + '｜片段:' + String(e.snippets) + '｜token~' + String(e.tokenEst) + '｜' + String(e.elapsedMs) + 'ms｜' + reason
    }

    /**
     * 触发日志弹层体（展示组件，无钩子；状态由设置节持有）：条数 N/C + 清空按钮 + 尾部 50 行滚动加载。
     * 数据形=GET api/kb-context/logs {entries,capacity,enabled}（lib/settings-routes.js，TECH 实现面 3 同源）。
     */
    function KbContextLogBody(props) {
      var log = props.log || {}
      var entries = Array.isArray(log.entries) ? log.entries : []
      var capacity = Number.isInteger(log.capacity) && log.capacity > 0 ? log.capacity : 200
      var visible = Number.isInteger(log.visible) && log.visible > 0 ? log.visible : LOG_TAIL_ROWS
      var shown = entries.slice(0, visible) // list() 时间倒序（最新在前）→ slice(0,50)=日志尾部 50 行
      var lineEls = []
      for (var i = 0; i < shown.length; i++) {
        var e = shown[i]
        lineEls.push(react.createElement('div', {
          key: 'kb-log-' + i,
          className: 'kb-context-log-line' + (e && e.hit === true ? ' kb-context-log-line-hit' : ''),
          'data-hit': e && e.hit === true ? 'hit' : 'miss',
        }, logLineText(e)))
      }
      return react.createElement('div', { className: 'kb-context-log-body' },
        react.createElement('div', { className: 'kb-context-log-toolbar' },
          react.createElement('span', { className: 'kb-context-settings-note' }, '条数 ' + entries.length + '/' + capacity),
          react.createElement('button', {
            type: 'button', className: 'kb-context-settings-save', disabled: log.busy === true,
            onClick: function () { if (log.busy !== true) props.onClear() },
          }, log.busy === true ? '清空中…' : '清空日志'),
        ),
        react.createElement('p', { className: 'kb-context-settings-hint' },
          '触发日志仅存进程内存环（最多 ' + capacity + ' 条，超出丢最旧），重启即清空、不落盘；记录不含消息正文，字段口径以 changes/2026-09-30-kb-context-trigger-log/TECH.md 为准。' +
          (log.enabled === false ? '（kill switch 已关闭，当前零记录）' : '')),
        log.notice
          ? react.createElement('p', { className: log.notice.kind === 'ok' ? 'kb-context-settings-ok' : 'kb-context-settings-error' }, log.notice.text)
          : null,
        log.status === 'error'
          ? react.createElement('p', { className: 'kb-context-settings-error' }, '触发日志载入失败：' + String(log.error || '未知错误'))
          : null,
        react.createElement('div', {
          className: 'kb-context-log-list',
          onScroll: function (e) {
            var t = e && e.target
            if (!t) return
            if (t.scrollHeight - t.scrollTop - t.clientHeight < 24) props.onLoadMore() // 到底 24px 内=加载下一段
          },
        }, ...lineEls),
        entries.length === 0
          ? react.createElement('p', { className: 'kb-context-settings-hint' }, '暂无触发日志（内存环为空）')
          : null,
      )
    }

    /**
     * 触发日志弹层（0.4.0）：宿主 ui.Modal 在场=原生 Modal（title/closeLabel/onClose 契约，遮罩/Escape/
     * 关闭钮收口归宿主控件——wiki-steward lib/client.js:443 同形）；缺席=同契约自绘（role=dialog +
     * 遮罩 + Escape 收口，零第三方库、token 同源）。
     */
    function KbContextLogModal(props) {
      var body = react.createElement(KbContextLogBody, { log: props.log, onClear: props.onClear, onLoadMore: props.onLoadMore })
      if (ui && typeof ui.Modal === 'function') {
        return react.createElement(ui.Modal, {
          open: props.open !== false, onClose: props.onClose, title: props.title, closeLabel: props.closeLabel,
        }, body)
      }
      return react.createElement('div', { className: 'kb-context-log-overlay' },
        react.createElement('div', { className: 'kb-context-log-backdrop', onClick: props.onClose }),
        react.createElement('div', {
          className: 'kb-context-log-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title,
          tabIndex: -1,
          onKeyDown: function (e) { if (e && e.key === 'Escape') props.onClose() },
        },
          react.createElement('div', { className: 'kb-context-log-modal-head' },
            react.createElement('h4', { className: 'kb-context-settings-label' }, props.title),
            react.createElement('button', {
              type: 'button', className: 'kb-context-log-close', 'aria-label': props.closeLabel, onClick: props.onClose,
            }, '✕'),
          ),
          body,
        ),
      )
    }

    /**
     * 触发日志入口（设置节内，0.4.0 A-TL6）：「查看触发日志」按钮点开弹层，看每次触发评估的判定摘要
     * （回答"为什么没触发/触发了什么"，PRODUCT US-1）。展示组件（无钩子；开合态由设置节持有）。
     */
    function KbContextTriggerLogEntry(props) {
      var open = props.open === true
      var onToggle = props.onToggle
      return react.createElement('div', { className: 'kb-context-log-entry' },
        react.createElement('button', {
          type: 'button', className: 'kb-context-log-open', 'data-kb-action': 'trigger-log',
          'aria-expanded': open ? 'true' : 'false', onClick: function () { onToggle() },
        }, open ? '收起触发日志' : '查看触发日志'),
        open
          ? react.createElement(KbContextLogModal, {
              open: true, title: 'kb-context · 触发日志', closeLabel: '关闭',
              onClose: function () { onToggle() }, log: props.log, onClear: props.onClear, onLoadMore: props.onLoadMore,
            })
          : null,
      )
    }

    /**
     * 设置面贡献组件（settings.section）：配置展示/可改。
     * 载入=GET api/kb-context/settings（文档相对）；保存=POST 同址 {patch}（只发变更叶子）。
     * 失败/拒绝=容器内如实报错（not_editable/invalid 服务端判据原文），绝不静默。
     */
    function KbContextSettingsSection() {
      var pair = react.useState({
        status: 'loading', data: null, error: null, draft: {}, saving: false, notice: null,
        // 触发日志弹层态（0.4.0）：展示组件无钩子，开合/条目态由设置节持有（wiki-steward 历史记录同纪律）
        log: { open: false, status: 'idle', entries: [], capacity: 200, enabled: true, visible: LOG_TAIL_ROWS, busy: false, notice: null, error: null },
      })
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
              setState({ status: 'error', data: null, error: String(body.error.message || body.error.code || '读取失败'), draft: {}, saving: false, notice: null , log: state.log })
              return
            }
            setState({ status: 'ready', data: body.data, error: null, draft: {}, saving: false, notice: null , log: state.log })
          })
          .catch(function (e) {
            if (!alive) return
            setState({ status: 'error', data: null, error: String((e && e.message) || e), draft: {}, saving: false, notice: null , log: state.log })
          })
        return function cleanup() { alive = false }
      }, [])

      function draftValue(field) {
        var v = getPath(state.draft, field.path)
        return v !== undefined ? v : getPath((state.data && state.data.config) || {}, field.path)
      }

      function onChange(field, value) {
        var next = setPath(JSON.parse(JSON.stringify(state.draft)), field.path, value)
        setState({ status: state.status, data: state.data, error: state.error, draft: next, saving: state.saving, notice: null , log: state.log })
      }

      function save() {
        if (state.saving || state.status !== 'ready') return
        if (Object.keys(state.draft).length === 0) {
          setState({ status: state.status, data: state.data, error: state.error, draft: state.draft, saving: false, notice: { kind: 'error', text: '没有待保存的变更' } , log: state.log })
          return
        }
        setState({ status: state.status, data: state.data, error: state.error, draft: state.draft, saving: true, notice: null , log: state.log })
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
              setState({ status: 'ready', data: state.data, error: null, draft: state.draft, saving: false, notice: { kind: 'error', text: String(body.error.message || body.error.code || '保存失败') } , log: state.log })
              return
            }
            var data = body && body.data && body.data.config ? Object.assign({}, state.data, { config: body.data.config }) : state.data
            setState({ status: 'ready', data: data, error: null, draft: {}, saving: false, notice: { kind: 'ok', text: '已保存（热生效，per-call 读即刻可见）' } , log: state.log })
          })
          .catch(function (e) {
            setState({ status: 'ready', data: state.data, error: null, draft: state.draft, saving: false, notice: { kind: 'error', text: String((e && e.message) || e) } , log: state.log })
          })
      }

      // ---- 触发日志弹层态（0.4.0，A-TL6；状态由设置节持有）----
      /** 合并更新 log 子态（显式整块形——与本文件 setState 全字面量惯例一致，不吃闭包陈态） */
      function setLog(log) {
        setState({ status: state.status, data: state.data, error: state.error, draft: state.draft, saving: state.saving, notice: state.notice, log: log })
      }

      function toggleLog() {
        if (state.log && state.log.open === true) {
          setLog(Object.assign({}, state.log, { open: false }))
          return
        }
        setLog({ open: true, status: 'loading', entries: [], capacity: 200, enabled: true, visible: LOG_TAIL_ROWS, busy: false, notice: null, error: null })
        loadLogs()
      }

      /** 载入环条目：GET api/kb-context/logs（文档相对）→ {entries,capacity,enabled}（TECH 实现面 3） */
      function loadLogs() {
        Promise.resolve()
          .then(function () { return exports.__fetch(LOGS_URL) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (body && body.error) {
              setLog({ open: true, status: 'error', entries: [], capacity: 200, enabled: true, visible: LOG_TAIL_ROWS, busy: false, notice: null, error: String(body.error.message || body.error.code || '读取失败') })
              return
            }
            setLog({
              open: true, status: 'ready',
              entries: Array.isArray(body && body.entries) ? body.entries : [],
              capacity: body && Number.isInteger(body.capacity) && body.capacity > 0 ? body.capacity : 200,
              enabled: !(body && body.enabled === false),
              visible: LOG_TAIL_ROWS, busy: false, notice: null, error: null,
            })
          })
          .catch(function (e) {
            setLog({ open: true, status: 'error', entries: [], capacity: 200, enabled: true, visible: LOG_TAIL_ROWS, busy: false, notice: null, error: String((e && e.message) || e) })
          })
      }

      /** 清空环：POST api/kb-context/logs/clear → {cleared:n}（US-2；清后本地置空+如实 notice） */
      function clearLog() {
        if (state.log && state.log.busy === true) return
        setLog(Object.assign({}, state.log, { busy: true, notice: null }))
        Promise.resolve()
          .then(function () { return exports.__fetch(LOGS_CLEAR_URL, { method: 'POST' }) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (body && body.error) {
              setLog(Object.assign({}, state.log, { busy: false, notice: { kind: 'error', text: String(body.error.message || body.error.code || '清空失败') } }))
              return
            }
            var n = body && Number.isInteger(body.cleared) ? body.cleared : 0
            setLog(Object.assign({}, state.log, { busy: false, entries: [], visible: LOG_TAIL_ROWS, notice: { kind: 'ok', text: '已清空 ' + n + ' 条（内存环，重启本就清空）' } }))
          })
          .catch(function (e) {
            setLog(Object.assign({}, state.log, { busy: false, notice: { kind: 'error', text: String((e && e.message) || e) } }))
          })
      }

      /** 滚动加载：到底再放 50 行（A-TL6 尾部 50 行+滚动加载） */
      function loadMoreLog() {
        var log = state.log
        var total = Array.isArray(log.entries) ? log.entries.length : 0
        if (log.visible >= total) return
        setLog(Object.assign({}, log, { visible: log.visible + LOG_TAIL_ROWS }))
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
          // 触发日志入口（0.4.0 A-TL6）：保存按钮之后（R2「不前置 button」保持），开合弹层见 KbContextTriggerLogEntry
          react.createElement(KbContextTriggerLogEntry, {
            open: state.log && state.log.open === true,
            log: state.log || {},
            onToggle: toggleLog,
            onClear: clearLog,
            onLoadMore: loadMoreLog,
          }),
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
      // —— 触发日志弹层（0.4.0）：零新增 token（只复用上表既有变量名）、零硬编码色值、零暗色分支 ——
      '.kb-context-log-entry{display:inline-flex;align-items:center}',
      '.kb-context-log-open{appearance:none;padding:5px 14px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5;cursor:pointer}',
      '.kb-context-log-open:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.kb-context-log-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center}',
      '.kb-context-log-backdrop{position:absolute;inset:0;background:var(--dsw-alias-bg-layer-3);opacity:.55}',
      '.kb-context-log-modal{position:relative;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;width:min(680px,92vw);max-height:80vh;padding:16px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font-family:var(--dsw-font-family);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.kb-context-log-modal:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.kb-context-log-modal-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.kb-context-log-close{appearance:none;padding:2px 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:1.5;cursor:pointer}',
      '.kb-context-log-close:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.kb-context-log-body{display:flex;flex-direction:column;gap:8px;min-height:0}',
      '.kb-context-log-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px}',
      '.kb-context-log-list{overflow-y:auto;max-height:52vh;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}',
      '.kb-context-log-line{font-family:var(--ds-font-family-code);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);word-break:break-all;border-top:0.5px solid var(--dsw-alias-border-l2)}',
      '.kb-context-log-line:first-child{border-top:none}',
      '.kb-context-log-line-hit{color:var(--dsw-alias-state-success-primary)}',
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
