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
//   ③ 手动 ingest 动作（Task F3）= 设置节内「扫描增量」「触发蒸馏」两按钮，走既有通路
//      POST api/wiki-steward/ingest/{scan,distill}（蒸馏经 headless 任务通道不真跑 LLM）；
//      状态反馈沿 {data}/{error} 契约形如实（data.note 原文=在跑/通道缺文案）。
//   ④ 定时执行控制（Task F3，选项 A 插件自管 timer）= 设置节时间输入 + 启用开关（ingest.schedule
//      白名单双侧一致），双源如实提示（系统 cron 仍在 00:25，flock 防重入）。
//   ⑤ `sidebar.panellist` 行 + `main` 槽页注册已移除（旧面板入口随诉求摘除；其裸 import 说明符
//      =TypeError: Failed to resolve module specifier 根因，诊断 §1.2）。
//   ⑥ 设置节 UI 对齐 dsh 原生设置节契约（Task F2，诊断 §3.2 zGbnIq 契约）：控件用宿主原生
//      primitives（@deepseek-ai/dsh-client-ui-primitives 的 Switch/Button/Input/Modal，经
//      dsh.client.inject 供进 require 表）；自绘布局样式=SETTINGS_CSS 注入（--dsw-alias-*/--dsw-radius-*
//      token 唯一色板，零硬编码色值/零暗色分支——暗色随宿主别名重定义自动适配）。功能面零行为变化：
//      {data}/{error} 契约、timer 语义、白名单、历史入口行为面全保持（只动视觉与结构）。
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
    // 原生控件包（Task F2）：Switch（布尔开关）/Button（36px md 形）/Input（32px 输入壳）/Modal（历史弹层）。
    // require 表语义（dsh-client-modules makeRequire）：包须列进 package.json dsh.client.inject 才会
    // 先行 materialize 供本工厂同步 require；peer+dev 双声明（宿主拦截层供给 + 独立测试面）。
    var ui = require('@deepseek-ai/dsh-client-ui-primitives')

    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基；API 路径同此形
    var PANEL_URL = 'api/wiki-steward/panel.js'
    var SETTINGS_URL = 'api/wiki-steward/settings'
    var INGEST_SCAN_URL = 'api/wiki-steward/ingest/scan'
    var INGEST_DISTILL_URL = 'api/wiki-steward/ingest/distill'
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
      { path: ['ingest', 'schedule', 'enabled'], kind: 'boolean', label: '定时蒸馏开关（启用后每日到点触发 headless 蒸馏任务）', note: '开启后若当日无跑记录会补触发一次（重启/启用即按补跑判据收口）；执行改动约 1 分钟内热生效，无需重启。' },
      { path: ['ingest', 'schedule', 'time'], kind: 'time', label: '定时蒸馏执行时间（HH:MM）', note: '系统 cron 仍在 00:25 触发，flock 防重入；如需单一时间源请运维侧停用该行' },
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

    // —— 设置节样式（Task F2：诊断 §3.2 dsh 原生设置节契约对齐——自绘布局 + dsh token）——
    // 色板唯一来源=--dsw-alias-* 语义别名 + --dsw-radius-* 圆角刻度（宿主暗色态重定义别名即自动暗色
    // 适配，本文件零暗色分支/零硬编码色值）。控件形几何归宿主原生控件自身（Button.module.css .md=36px、
    // Input.module.css .wrap=32px/.5px l4/radius-md/layer-1/focus business-primary），本表只补：
    // 节容器/标题/引言/rows/rowCard/行名/字段/注记分层 + 输入壳 §3.2 剩余项（padding 0 10px/宽度 100%）。
    var STYLE_ID = 'wiki-steward-settings-css'
    var SETTINGS_CSS = [
      '.wiki-steward-settings{max-width:720px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:22px}',
      '.wiki-steward-settings-title{margin:0;font-size:16px;font-weight:500;line-height:24px;color:var(--dsw-alias-label-primary)}',
      '.wiki-steward-settings-intro{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}',
      '.wiki-steward-settings-rows{display:flex;flex-direction:column;gap:8px;margin:12px 0 0;padding:0;list-style:none}',
      '.wiki-steward-settings-rowCard{display:flex;flex-direction:column;gap:12px;padding:12px 14px;border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl)}',
      '.wiki-steward-settings-rowHead{display:flex;align-items:center;gap:10px}',
      '.wiki-steward-settings-rowName{font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.wiki-steward-settings-field{display:flex;flex-direction:column;gap:6px}',
      '.wiki-steward-settings-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.wiki-steward-settings-value{font-family:var(--ds-font-family-code);font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.wiki-steward-settings .wiki-steward-settings-input{width:100%;height:32px;padding:0 10px}',
      '.wiki-steward-settings .wiki-steward-settings-input:has(input:disabled){opacity:.6;cursor:default}',
      '.wiki-steward-settings-textarea{box-sizing:border-box;width:100%;min-height:64px;padding:6px 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.wiki-steward-settings-textarea:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}',
      '.wiki-steward-settings-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.wiki-steward-settings-ok{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}',
      '.wiki-steward-settings-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '.wiki-steward-history-mount{min-height:120px}',
    ].join('')

    /** 样式注入（幂等 + document 守卫）：Node/测试环境无 document 直接跳过，绝不炸模块加载。 */
    function ensureStyles() {
      if (typeof document !== 'undefined') {
        try {
          if (document.getElementById(STYLE_ID)) return
          var el = document.createElement('style')
          el.id = STYLE_ID
          el.setAttribute('data-plugin-css', 'wiki-steward')
          el.textContent = SETTINGS_CSS
          ;(document.head || document.documentElement).appendChild(el)
        } catch { /* 样式注入失败不炸插件（视觉降级=浏览器默认） */ }
      }
    }
    ensureStyles()

    /**
     * 行组件（§3.2 行卡形）：rowCard > 行名（+布尔行内 Switch）> 字段列（控件 + 注记）。
     * 控件形：布尔=原生 Switch（行内形）、数字=原生 Input type=number、时间=原生 Input type=time
     * （原生语义保持：type 透传，改的只是壳）、字符串数组=textarea、其他=只读文本值。
     * 数据契约零变化：onChange(值) → draft 叶子 → 保存 {patch}（与原 checkbox/number/time 同构）。
     */
    function SettingsRow(props) {
      var field = props.field
      var value = props.value
      var readOnly = props.readOnly === true
      var onChange = props.onChange
      var control = null
      if (field.kind === 'boolean') {
        control = react.createElement(ui.Switch, {
          checked: value === true,
          disabled: readOnly,
          label: field.label,
          title: readOnly ? '只读项，不可改' : undefined,
          onChange: function (next) { onChange(next === true) },
        })
      } else if (field.kind === 'number') {
        control = react.createElement(ui.Input, {
          type: 'number',
          className: 'wiki-steward-settings-input',
          value: value === undefined || value === null ? '' : String(value),
          disabled: readOnly,
          onChange: function (e) {
            var n = e.target.value === '' ? undefined : Number(e.target.value)
            onChange(n)
          },
        })
      } else if (field.kind === 'time') {
        control = react.createElement(ui.Input, {
          type: 'time',
          className: 'wiki-steward-settings-input',
          value: typeof value === 'string' ? value : '',
          disabled: readOnly,
          onChange: function (e) { onChange(e.target.value) },
        })
      } else if (field.kind === 'string[]') {
        control = react.createElement('textarea', {
          className: 'wiki-steward-settings-textarea',
          rows: 3,
          value: Array.isArray(value) ? value.join('\n') : '',
          disabled: readOnly,
          onChange: function (e) {
            var lines = e.target.value.split('\n').map(function (s) { return s.trim() }).filter(function (s) { return s !== '' })
            onChange(lines)
          },
        })
      } else {
        control = react.createElement('span', { className: 'wiki-steward-settings-value' }, String(value === undefined ? '' : value))
      }
      var head = field.kind === 'boolean'
        ? react.createElement('div', { className: 'wiki-steward-settings-rowHead' },
            react.createElement('span', { className: 'wiki-steward-settings-rowName' }, field.label),
            control)
        : react.createElement('span', { className: 'wiki-steward-settings-rowName' }, field.label)
      return react.createElement('div', { className: 'wiki-steward-settings-rowCard' },
        head,
        react.createElement('div', { className: 'wiki-steward-settings-field' },
          field.kind === 'boolean' ? null : control,
          field.note ? react.createElement('p', { className: 'wiki-steward-settings-note' }, field.note) : null,
        ),
      )
    }

    /**
     * 设置面贡献组件（settings.section）：配置展示/可改 + 历史记录入口 + 手动 ingest 动作。
     * 载入=GET api/wiki-steward/settings（文档相对）；保存=POST 同址 {patch}（只发变更叶子）。
     * 失败/拒绝=容器内如实报错（not_editable/invalid 服务端判据原文），绝不静默。
     * 结构（Task F2 §3.2）：节容器 > 标题/引言 > 历史入口 > 手动动作 > rows（rowCard 列表）> 保存/提示。
     */
    function WikiStewardSettingsSection() {
      var pair = react.useState({ status: 'loading', data: null, error: null, draft: {}, saving: false, notice: null, historyOpen: false, actions: { scan: { status: 'idle', text: '' }, distill: { status: 'idle', text: '' } } })
      var state = pair[0]
      var setState = pair[1]
      /** 局部更新（函数形 updater：未列键一律沿用——含 historyOpen 开合态，异步回调无陈旧闭包风险） */
      function update(delta) {
        setState(function (prev) { return Object.assign({}, prev, delta) })
      }
      function toggleHistory() {
        setState(function (prev) { return Object.assign({}, prev, { historyOpen: prev.historyOpen !== true }) })
      }
      /** 手动动作状态局部更新（函数形 updater：双按钮并发无陈旧闭包互踩） */
      function updateAction(kind, delta) {
        setState(function (prev) {
          var actions = Object.assign({}, prev.actions)
          var cur = actions[kind] || { status: 'idle', text: '' }
          actions[kind] = Object.assign({}, cur, delta)
          return Object.assign({}, prev, { actions: actions })
        })
      }
      /**
       * 手动动作（Task F3）：POST 既有 ingest 通路（ingest-routes scanPost/distillPost）。
       * 反馈沿 {data}/{error} 契约形如实：{data.note} 原文展示（在跑/通道缺文案不改写）、
       * {error} 原文展示；扫描增量回 {data.ok/exitCode/summary} 组合如实。
       */
      function runAction(kind, url) {
        updateAction(kind, { status: 'running', text: '执行中…' })
        Promise.resolve()
          .then(function () { return exports.__fetch(url, { method: 'POST' }) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (body && body.error) {
              updateAction(kind, { status: 'error', text: String(body.error.message || body.error.code || '触发失败') })
              return
            }
            var data = (body && body.data) || {}
            if (kind === 'distill') {
              updateAction(kind, {
                status: data.started === true ? 'ok' : 'error',
                text: String(data.note || (data.started === true ? '已触发蒸馏任务' : '未触发')),
              })
              return
            }
            var summary = data.summary || {}
            var counts = typeof summary.total === 'number'
              ? '：总 ' + summary.total + ' / 待编译 ' + (typeof summary.pending === 'number' ? summary.pending : '?')
              : ''
            updateAction(kind, {
              status: data.ok === true ? 'ok' : 'error',
              text: (data.ok === true ? '扫描增量完成' : '扫描增量失败') + '（exit ' + String(data.exitCode) + '）' + counts,
            })
          })
          .catch(function (e) {
            updateAction(kind, { status: 'error', text: String((e && e.message) || e) })
          })
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

      /** 草稿叶子更新（函数形 updater：从 prev.draft 重建，同批次连发两变更互不覆盖——T-F2 stale-closure 竞态回归锁见 test/client-face.test.mjs） */
      function onChange(field, value) {
        setState(function (prev) {
          return Object.assign({}, prev, { draft: setPath(JSON.parse(JSON.stringify(prev.draft)), field.path, value), notice: null })
        })
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
        react.createElement('h3', { className: 'wiki-steward-settings-title' }, 'wiki-steward · 设置'),
        react.createElement('p', { className: 'wiki-steward-settings-intro' }, '可改项即时热生效（写路径=官方路由面 api/wiki-steward/settings → configEditor 持久化缝）；只读项语义勿动。'),
        react.createElement(WikiStewardHistoryEntry, { open: state.historyOpen === true, onToggle: toggleHistory }),
        react.createElement(WikiStewardManualActions, {
          scan: state.actions.scan,
          distill: state.actions.distill,
          onScan: function () { runAction('scan', INGEST_SCAN_URL) },
          onDistill: function () { runAction('distill', INGEST_DISTILL_URL) },
        }),
        react.createElement('div', { className: 'wiki-steward-settings-rows' }, rows),
        writable
          ? react.createElement(ui.Button, {
              type: 'button',
              variant: 'primary',
              size: 'md',
              'data-ws-action': 'save',
              disabled: state.saving,
              onClick: save,
            }, state.saving ? '保存中…' : '保存')
          : react.createElement('p', { className: 'wiki-steward-settings-note' }, '本部署配置写入缝缺失（configEditor 未挂载），暂只读展示。'),
        state.notice
          ? react.createElement('p', { className: state.notice.kind === 'ok' ? 'wiki-steward-settings-ok' : 'wiki-steward-settings-error' }, state.notice.text)
          : null,
      )
    }

    /**
     * 手动 ingest 动作（Task F3）：「扫描增量」「触发蒸馏」两按钮走既有通路
     * （POST api/wiki-steward/ingest/{scan,distill}，文档相对——issue #1707 教训）。
     * 蒸馏经 headless 任务通道不真跑 LLM；按钮状态反馈沿 {data}/{error} 契约形：
     * data.note 如实原文（在跑/通道缺文案）、{error} 原文展示，绝不静默。
     * 展示组件（无钩子；状态由设置节持有——历史入口同纪律）；按钮=原生 Button outline（§3.2 secondary 形）。
     */
    function WikiStewardManualActions(props) {
      var scan = props.scan || { status: 'idle', text: '' }
      var distill = props.distill || { status: 'idle', text: '' }
      var busy = scan.status === 'running' || distill.status === 'running'
      return react.createElement('div', { className: 'wiki-steward-settings-actions' },
        react.createElement(ui.Button, {
          type: 'button',
          variant: 'outline',
          size: 'md',
          'data-ws-action': 'scan',
          disabled: busy,
          onClick: function () { if (!busy) props.onScan() },
        }, scan.status === 'running' ? '扫描中…' : '扫描增量'),
        react.createElement(ui.Button, {
          type: 'button',
          variant: 'outline',
          size: 'md',
          'data-ws-action': 'distill',
          disabled: busy,
          onClick: function () { if (!busy) props.onDistill() },
        }, distill.status === 'running' ? '触发中…' : '触发蒸馏'),
        scan.text
          ? react.createElement('p', { className: scan.status === 'ok' ? 'wiki-steward-settings-ok' : 'wiki-steward-settings-error' }, scan.text)
          : null,
        distill.text
          ? react.createElement('p', { className: distill.status === 'ok' ? 'wiki-steward-settings-ok' : 'wiki-steward-settings-error' }, distill.text)
          : null,
      )
    }

    /**
     * 历史记录入口（设置节内，Task F1 面板搬家落点；Task F2 弹层收口原生 Modal）：
     * 「查看历史记录」按钮点开弹层，呈现原面板的 ingest 日志查看能力（来源标注/尾部 N 行/滚动加载——
     * web/dist 日志视图 view:'log'，逻辑复用 web/src/lib/log-view*）。
     * 弹层=原生 Modal（title/closeLabel 契约，遮罩/Escape/关闭钮收口归宿主控件；onClose→onToggle）。
     * 展示组件（无钩子；开合态由设置节持有）。
     */
    function WikiStewardHistoryEntry(props) {
      var open = props.open === true
      var onToggle = props.onToggle
      return react.createElement('div', { className: 'wiki-steward-settings-history' },
        react.createElement(ui.Button, {
          type: 'button',
          variant: 'outline',
          size: 'md',
          'data-ws-action': 'history',
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () { onToggle() },
        }, open ? '收起历史记录' : '查看历史记录'),
        open
          ? react.createElement(ui.Modal, {
              open: true,
              onClose: function () { onToggle() },
              title: 'wiki-steward · 历史记录',
              closeLabel: '关闭',
            }, react.createElement(WikiStewardHistoryMount, null))
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
