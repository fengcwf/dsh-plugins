// dsh-login-gate 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS——lib/ 不引构建器、React 无 JSX）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory(require) 只登记模块体（副作用全在 apply）；
// 宿主自动服务 /plugins/dsh-login-gate/client.js（dsh.client 声明被 dsh-client-modules 扫入浏览器花名册）。
//
// 设置菜单（changes/2026-09-29-login-gate-settings US-1~4 + task-12-context.md）：
//   `settings.section` 命名空间注册（照 kb-context 形：{name:'settings.section', id, order, label}
//   → 设置页 navLabel 自动进设置页）；数据走文档相对 api/login-gate/settings 与
//   api/login-gate/settings/users（无前导斜杠=生产 404 教训，与宿主 base 同基）。
//   栏目四区一段：端口区（可改+重启提示+联动清单四行，INV-7）/参数区（5 可改+3 只读）/
//   账号区（增/改密/删表单，列表仅名字永无哈希，INV-3）/说明段（N 天免登录动态+机制说明）。
// 保存语义（R-11/R-12）：空 draft 拒保存；任一保存成功=合并回显+字面「已保存，需重启生效」（G1）；
// 失败=服务端 message 原文回显，绝不静默；writable:false=全部只读+注记；载入失败容器内如实。
// 删除契约（R-10）：{action:'delete', name, currentName}，currentName 取自 __gate/status 的 user；
// 取不到→禁用删除按钮+提示（fail-closed 同步）；当前登录账号行禁删（防自锁）。
// 样式：--dsw-alias-* 宿主语义别名为唯一色板（暗色随宿主别名重定义自动适配）；零第三方 UI 库、零网络外呼。
// root 壳槽位禁注册（其 chrome 归壳）：settings.launcher/trigger/header/close/action/onboarding。
window.__ModuleLoader__.load({
  id: 'dsh-login-gate',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基
    var SETTINGS_URL = 'api/login-gate/settings'
    var USERS_URL = 'api/login-gate/settings/users'
    var STATUS_URL = '__gate/status'

    /** fetch 缝（测试注入；默认全局 fetch） */
    exports.__fetch = function doFetch(url, init) {
      return fetch(url, init)
    }

    // 字段表（客户端副本，只控表单；服务端 lib/settings-write.js 白名单为权威判据，双侧一致）。
    // 可改=port/sessionDays/maxFailures/secureCookie/wsAllow/gzipPass（EDITABLE_KEYS）；
    // 只读展示=listenHost/upstreamPort/rewriteHost（枚举外，配置文件中设置）。
    var PORT_FIELD = {
      key: 'port', kind: 'number', min: 1, max: 65535,
      label: '门禁端口（默认 3500，1-65535）',
      hint: '门禁监听端口（Lucky 反代目标）。保存后需重启生效，且下方联动面需人工同步。',
    }
    var PARAM_FIELDS = [
      {
        key: 'sessionDays', kind: 'number', min: 1, max: 3650,
        label: '登录会话有效期（天，1~3650）',
        hint: '决定「登录后约 N 天内免登录」的 N。固定过期、不续期（活跃不顺延）。',
      },
      {
        key: 'maxFailures', kind: 'number', min: 1,
        label: '每 IP 连续登录失败上限',
        hint: '连续失败达到上限后按指数退避锁定该 IP（30 秒起、上限 300 秒）；登录成功清零。',
      },
      {
        key: 'secureCookie', kind: 'boolean',
        label: '会话 Cookie Secure',
        hint: 'HTTPS 部署（Lucky 反代之后）保持开启；纯局域网 HTTP 调试时关闭。',
      },
      {
        key: 'wsAllow', kind: 'string[]',
        label: 'WebSocket 放行路径（一行一条正则）',
        hint: '这些路径的 WebSocket 升级直接放行（正则匹配请求路径）；特殊值 any = 全部放行。DSH 实时事件走 api 目录下，按需收紧。',
      },
      {
        key: 'gzipPass', kind: 'boolean',
        label: '大响应透明 gzip',
        hint: '手机端拉大会话历史时省流量；上游已压缩时自动跳过。',
      },
    ]
    var READONLY_FIELDS = [
      {
        key: 'listenHost', kind: 'string',
        label: '监听地址（只读展示）',
        hint: '门禁监听地址（默认仅本机；公网由 Lucky/Nginx 反代进入）。在配置文件中设置。',
      },
      {
        key: 'upstreamPort', kind: 'number',
        label: '上游 DSH 端口（只读展示）',
        hint: '转发目标 dsh web 端口（保持 loopback 暴露）。在配置文件中设置。',
      },
      {
        key: 'rewriteHost', kind: 'boolean',
        label: '转发改写 Host/Origin（只读展示）',
        hint: '转发时把 Host/Origin 改写为 loopback 形式，保证会话 cookie 权威一致。在配置文件中设置。',
      },
    ]
    // 端口联动清单四行（INV-7：改端口漏联动的防线，仅提示不自动改——用户裁定）
    var LINK_ITEMS = [
      'gate-watchdog：探活地址与端口需同步',
      'start-dsh.sh：监听检查与端口需同步',
      'obsidian-web：3500 分享契约需同步核对',
      'Lucky 外网反代：目标端口需人工同步',
    ]

    /** 值等价（数组逐项，防 wsAllow 引用比较误报） */
    function sameValue(a, b) {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false
        for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
        return true
      }
      return a === b
    }

    /** 草稿推进（纯函数）：改回原值=移出草稿 → 空 draft 拒保存语义闭环 */
    function nextDraft(draft, saved, key, value) {
      var next = {}
      for (var k in draft) if (Object.hasOwn(draft, k)) next[k] = draft[k]
      if (sameValue(value, saved ? saved[key] : undefined)) delete next[key]
      else next[key] = value
      return next
    }

    /** 行组件（宿主 settings-form .field 形：label → 控件 → hint 纵向）：
     *  布尔=checkbox、数字=number input、字符串数组=textarea（一行一项）、其他=只读文本。
     *  无障碍：label htmlFor 与控件 id 关联；disabled 真实禁用。 */
    function SettingsRow(props) {
      var field = props.field
      var value = props.value
      var readOnly = props.readOnly === true
      var onChange = props.onChange
      var id = 'login-gate-' + field.key
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
          className: 'login-gate-settings-input',
          value: value === undefined || value === null ? '' : String(value),
          min: field.min,
          max: field.max,
          disabled: readOnly,
          onChange: function (e) {
            onChange(e.target.value === '' ? null : Number(e.target.value))
          },
        })
      } else if (field.kind === 'string[]') {
        input = react.createElement('textarea', {
          id: id,
          className: 'login-gate-settings-textarea',
          rows: 3,
          placeholder: '一行一条，例如：^/api/',
          value: Array.isArray(value) ? value.join('\n') : '',
          disabled: readOnly,
          onChange: function (e) {
            var lines = e.target.value.split('\n').map(function (s) { return s.trim() }).filter(function (s) { return s !== '' })
            onChange(lines)
          },
        })
      } else {
        input = react.createElement('span', { id: id, className: 'login-gate-settings-value' }, String(value === undefined || value === null ? '' : value))
      }
      return react.createElement('div', { className: 'login-gate-settings-row' },
        react.createElement('label', { className: 'login-gate-settings-label', htmlFor: id }, field.label),
        input,
        field.hint ? react.createElement('p', { className: 'login-gate-settings-hint' }, field.hint) : null,
      )
    }

    /** 账号行：名字（永无哈希，INV-3）+ 改密表单 + 删除按钮（防自锁/fail-closed 禁用态） */
    function UserRow(props) {
      var isCurrent = props.currentName !== null && props.currentName === props.name
      var children = [
        react.createElement('span', { key: 'n', className: 'login-gate-settings-value' }, props.name),
        react.createElement('input', {
          key: 'p', type: 'password', className: 'login-gate-settings-input',
          placeholder: '新密码', value: props.pw, 'aria-label': props.name + ' 新密码',
          disabled: props.disabled === true || props.busy === true,
          onChange: function (e) { props.onPassword(e.target.value) },
        }),
        react.createElement('button', {
          key: 'u', type: 'button', className: 'login-gate-settings-button',
          disabled: props.disabled === true || props.busy === true,
          onClick: props.onUpdate,
        }, '改密'),
        react.createElement('button', {
          key: 'd', type: 'button', className: 'login-gate-settings-button login-gate-settings-delete',
          disabled: props.canDelete !== true || props.busy === true,
          onClick: props.onDelete,
        }, '删除'),
      ]
      if (isCurrent) {
        children.push(react.createElement('p', { key: 'h', className: 'login-gate-settings-hint' }, '当前登录账号不能删除（防自锁）。'))
      }
      return react.createElement('div', { className: 'login-gate-settings-user-row' }, children)
    }

    /** 新增账号表单 */
    function AccountAddForm(props) {
      return react.createElement('div', {
        className: 'login-gate-settings-user-form',
        'data-login-gate-form': props['data-login-gate-form'], // 测试钩子真落 DOM（非寄生 props）
      },
        react.createElement('input', {
          type: 'text', className: 'login-gate-settings-input', placeholder: '用户名',
          value: props.name, disabled: props.disabled === true || props.busy === true,
          onChange: function (e) { props.onName(e.target.value) },
        }),
        react.createElement('input', {
          type: 'password', className: 'login-gate-settings-input', placeholder: '密码',
          value: props.password, disabled: props.disabled === true || props.busy === true,
          onChange: function (e) { props.onPassword(e.target.value) },
        }),
        react.createElement('button', {
          type: 'button', className: 'login-gate-settings-button',
          disabled: props.disabled === true || props.busy === true,
          onClick: props.onAdd,
        }, '新增账号'),
      )
    }

    /**
     * 设置面贡献组件（settings.section）：端口/参数/账号/说明四区一段。
     * 载入=GET 文档相对 api/login-gate/settings + __gate/status（取当前登录名，删除防自锁）；
     * 保存=POST 同址 {patch}（只发变更叶子）；账号=POST api/login-gate/settings/users。
     * 失败/拒绝=服务端判据原文展示，绝不静默。
     */
    function LoginGateSettingsSection() {
      var pair = react.useState({
        status: 'loading', data: null, error: null, draft: {}, saving: false, notice: null,
        currentName: null, userBusy: false, userNotice: null, form: { addName: '', addPass: '', pw: {} },
      })
      var state = pair[0]
      var setState = pair[1]
      // 卸载守卫（与 load effect 的 alive 同纪律）：save/userAction 在途请求的迟到回调卸载后零 setState
      var aliveRef = react.useRef(true)

      /** 状态合并（纯函数）：基于 prev 而非闭包快照（防连发更新丢字段） */
      function mergeState(prev, patch) {
        var next = {}
        for (var k in prev) if (Object.hasOwn(prev, k)) next[k] = prev[k]
        for (var p in patch) if (Object.hasOwn(patch, p)) next[p] = patch[p]
        return next
      }
      /** 函数式 setState 包装（React updater 形：以最新 prev 为基准）；卸载守卫单点强制 */
      function update(fn) {
        if (!aliveRef.current) return // 卸载后异步回调不落 setState（React 卸载更新=无效+告警）
        setState(function (prev) { return fn(prev) })
      }

      react.useEffect(function load() {
        var alive = true
        aliveRef.current = true
        Promise.resolve()
          .then(function () { return exports.__fetch(SETTINGS_URL) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (!alive) return
            if (body && body.error) {
              update(function (prev) { return mergeState(prev, { status: 'error', data: null, error: String(body.error.message || body.error.code || '读取失败') }) })
              return
            }
            // 当前登录名（删除防自锁身份源）：__gate/status 失败=按无身份收敛（fail-closed，非错误）
            return Promise.resolve()
              .then(function () { return exports.__fetch(STATUS_URL) })
              .then(function (res) { return res.json() })
              .catch(function () { return null })
              .then(function (st) {
                if (!alive) return
                var me = (st && st.ok && typeof st.user === 'string' && st.user.trim()) ? st.user.trim() : null
                update(function (prev) {
                  return mergeState(prev, {
                    status: 'ready', data: body.data, error: null, draft: {}, saving: false, notice: null,
                    currentName: me, userBusy: false, userNotice: null, form: { addName: '', addPass: '', pw: {} },
                  })
                })
              })
          })
          .catch(function (e) {
            if (!alive) return
            update(function (prev) { return mergeState(prev, { status: 'error', data: null, error: String((e && e.message) || e) }) })
          })
        return function cleanup() { alive = false; aliveRef.current = false }
      }, [])

      function draftValue(key) {
        return state.draft[key] !== undefined ? state.draft[key] : ((state.data && state.data.config) || {})[key]
      }

      function onChange(key, value) {
        update(function (prev) {
          return mergeState(prev, { draft: nextDraft(prev.draft, (prev.data && prev.data.config) || {}, key, value), notice: null })
        })
      }

      /** 保存：空 draft 拒；成功=合并回显+「已保存，需重启生效」（G1）；失败=服务端原文 */
      function save() {
        if (state.saving || state.status !== 'ready') return
        if (Object.keys(state.draft).length === 0) {
          update(function (prev) { return mergeState(prev, { notice: { kind: 'error', text: '没有待保存的变更' } }) })
          return
        }
        update(function (prev) { return mergeState(prev, { saving: true, notice: null }) })
        Promise.resolve()
          .then(function () {
            return exports.__fetch(SETTINGS_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ patch: state.draft }),
            })
          })
          .then(function (res) { return res.json() })
          .then(function (r) {
            if (r && r.error) {
              update(function (prev) { return mergeState(prev, { saving: false, notice: { kind: 'error', text: String(r.error.message || r.error.code || '保存失败') } }) })
              return
            }
            update(function (prev) {
              var merged = prev.data || {}
              if (r && r.data && r.data.config) merged = Object.assign({}, merged, { config: r.data.config })
              if (r && r.data && typeof r.data.restartRequired === 'boolean') merged = Object.assign({}, merged, { restartRequired: r.data.restartRequired })
              return mergeState(prev, { status: 'ready', data: merged, draft: {}, saving: false, notice: { kind: 'ok', text: '已保存，需重启生效' } })
            })
          })
          .catch(function (e) {
            update(function (prev) { return mergeState(prev, { saving: false, notice: { kind: 'error', text: String((e && e.message) || e) } }) })
          })
      }

      /** 账号动作（add/update/delete）：delete 必带 currentName（R-10）；失败=服务端原文 */
      function userAction(action, name, password) {
        if (state.status !== 'ready' || state.userBusy) return
        if (state.data && state.data.writable !== true) return
        var body = { action: action, name: name }
        if (action === 'delete') {
          if (!state.currentName) {
            update(function (prev) { return mergeState(prev, { userNotice: { kind: 'error', text: '无法确定当前登录账号名（未取到 __gate/status），删除已禁用（fail-closed 防自锁）。' } }) })
            return
          }
          if (state.currentName === name) {
            update(function (prev) { return mergeState(prev, { userNotice: { kind: 'error', text: '不能删除当前登录账号（防自锁）。' } }) })
            return
          }
          body.currentName = state.currentName
        } else {
          if (typeof password !== 'string' || password === '') {
            update(function (prev) { return mergeState(prev, { userNotice: { kind: 'error', text: action === 'add' ? '请输入用户名与密码。' : '请输入新密码。' } }) })
            return
          }
          body.password = password
        }
        update(function (prev) { return mergeState(prev, { userBusy: true, userNotice: null }) })
        Promise.resolve()
          .then(function () {
            return exports.__fetch(USERS_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            })
          })
          .then(function (res) { return res.json() })
          .then(function (r) {
            if (r && r.error) {
              update(function (prev) { return mergeState(prev, { userBusy: false, userNotice: { kind: 'error', text: String(r.error.message || r.error.code || '账号操作失败') } }) })
              return
            }
            update(function (prev) {
              var merged = prev.data || {}
              if (r && r.data && Array.isArray(r.data.users)) merged = Object.assign({}, merged, { users: r.data.users })
              var form = { addName: prev.form.addName, addPass: prev.form.addPass, pw: Object.assign({}, prev.form.pw) }
              if (action === 'add') form = { addName: '', addPass: '', pw: form.pw }
              if (action === 'update') form.pw[name] = ''
              var okText = action === 'add' ? '账号已新增' : action === 'update' ? '密码已修改' : '账号已删除'
              return mergeState(prev, { data: merged, userBusy: false, userNotice: { kind: 'ok', text: okText }, form: form })
            })
          })
          .catch(function (e) {
            update(function (prev) { return mergeState(prev, { userBusy: false, userNotice: { kind: 'error', text: String((e && e.message) || e) } }) })
          })
      }

      if (state.status === 'loading') {
        return react.createElement('div', { className: 'login-gate-settings', 'data-dsh-plugin': 'dsh-login-gate' }, '设置载入中…')
      }
      if (state.status === 'error') {
        return react.createElement('div', { className: 'login-gate-settings', 'data-dsh-plugin': 'dsh-login-gate' },
          react.createElement('p', { className: 'login-gate-settings-error' }, 'dsh-login-gate 设置载入失败：' + state.error))
      }
      var cfg = (state.data && state.data.config) || {}
      var writable = state.data && state.data.writable === true
      var restartRequired = state.data && state.data.restartRequired === true
      var days = Number(draftValue('sessionDays')) || 30
      var users = (state.data && Array.isArray(state.data.users)) ? state.data.users : []

      var paramRows = []
      for (var i = 0; i < PARAM_FIELDS.length; i++) {
        paramRows.push(react.createElement(SettingsRow, {
          key: 'p' + i,
          field: PARAM_FIELDS[i],
          value: draftValue(PARAM_FIELDS[i].key),
          readOnly: !writable,
          onChange: (function (f) { return function (v) { onChange(f.key, v) } })(PARAM_FIELDS[i]),
        }))
      }
      for (var j = 0; j < READONLY_FIELDS.length; j++) {
        paramRows.push(react.createElement(SettingsRow, {
          key: 'r' + j,
          field: READONLY_FIELDS[j],
          value: cfg[READONLY_FIELDS[j].key],
          readOnly: true,
          onChange: function () {},
        }))
      }

      var userRows = []
      for (var u = 0; u < users.length; u++) {
        var uname = String(users[u] && users[u].name)
        userRows.push(react.createElement(UserRow, {
          key: 'u' + u,
          name: uname,
          currentName: state.currentName,
          canDelete: writable && !!state.currentName && state.currentName !== uname,
          disabled: !writable,
          busy: state.userBusy,
          pw: (state.form.pw && state.form.pw[uname]) || '',
          onPassword: (function (n) { return function (v) {
            update(function (prev) {
              var pw = Object.assign({}, prev.form.pw)
              pw[n] = v
              return mergeState(prev, { form: Object.assign({}, prev.form, { pw: pw }) })
            })
          } })(uname),
          onUpdate: (function (n) { return function () { userAction('update', n, (state.form.pw && state.form.pw[n]) || '') } })(uname),
          onDelete: (function (n) { return function () {
            if (!writable || !state.currentName || state.currentName === n) return
            userAction('delete', n)
          } })(uname),
        }))
      }

      return react.createElement('div', { className: 'login-gate-settings', 'data-dsh-plugin': 'dsh-login-gate' },
        react.createElement('h3', { className: 'login-gate-settings-title' }, 'dsh-login-gate · 设置'),
        react.createElement('p', { className: 'login-gate-settings-note' }, '可改项保存后需重启生效（不热生效）；只读项仅展示。'),
        // —— 端口区 ——
        react.createElement('h4', { className: 'login-gate-settings-group' }, '端口'),
        react.createElement(SettingsRow, {
          field: PORT_FIELD,
          value: draftValue('port'),
          readOnly: !writable,
          onChange: function (v) { onChange('port', v) },
        }),
        restartRequired
          ? react.createElement('p', { className: 'login-gate-settings-restart' }, '已保存，需重启生效（重启 dsh 服务前运行面不变）。')
          : null,
        react.createElement('p', { className: 'login-gate-settings-hint' }, '端口变更需人工同步以下四处（联动清单）：'),
        react.createElement('ul', { className: 'login-gate-settings-link-list' },
          LINK_ITEMS.map(function (t, idx) {
            return react.createElement('li', { key: 'l' + idx, className: 'login-gate-settings-link-item' }, t)
          }),
        ),
        // —— 参数区 ——
        react.createElement('h4', { className: 'login-gate-settings-group' }, '参数'),
        paramRows,
        // —— 账号区 ——
        react.createElement('h4', { className: 'login-gate-settings-group' }, '登录账号'),
        state.userNotice
          ? react.createElement('p', { className: state.userNotice.kind === 'ok' ? 'login-gate-settings-ok' : 'login-gate-settings-error' }, state.userNotice.text)
          : null,
        react.createElement('div', { className: 'login-gate-settings-users' }, userRows),
        state.currentName
          ? null
          : react.createElement('p', { className: 'login-gate-settings-hint' }, '无法确定当前登录账号名（未取到 __gate/status），删除已禁用（fail-closed 防自锁）。'),
        react.createElement(AccountAddForm, {
          'data-login-gate-form': 'add',
          disabled: !writable,
          busy: state.userBusy,
          name: state.form.addName,
          password: state.form.addPass,
          onName: function (v) { update(function (prev) { return mergeState(prev, { form: Object.assign({}, prev.form, { addName: v }) }) }) },
          onPassword: function (v) { update(function (prev) { return mergeState(prev, { form: Object.assign({}, prev.form, { addPass: v }) }) }) },
          onAdd: function () { userAction('add', state.form.addName, state.form.addPass) },
        }),
        // —— 说明段 ——
        react.createElement('h4', { className: 'login-gate-settings-group' }, '登录会话机制'),
        react.createElement('p', { className: 'login-gate-settings-note' }, '登录后约 ' + days + ' 天内免登录（N = sessionDays，随配置动态）。'),
        react.createElement('p', { className: 'login-gate-settings-hint' }, '登录会话固定过期、不续期（活跃不顺延）；到期后任意页面 302 跳转重新登录；执行 logout-all 立即全员下线。'),
        // —— 保存区 ——
        react.createElement('div', { className: 'login-gate-settings-footer' },
          writable
            ? react.createElement('button', { type: 'button', className: 'login-gate-settings-save', disabled: state.saving, onClick: save }, state.saving ? '保存中…' : '保存')
            : react.createElement('p', { className: 'login-gate-settings-note' }, '本部署配置写入缝缺失（configEditor 未挂载），暂只读展示。'),
          state.notice
            ? react.createElement('p', { className: state.notice.kind === 'ok' ? 'login-gate-settings-ok' : 'login-gate-settings-error' }, state.notice.text)
            : null,
        ),
      )
    }

    // —— 设置面样式（自绘 + dsh token，宿主 settings-form .field 形；零第三方 UI 库）——
    // 色板唯一来源=--dsw-alias-* 语义别名（均带 fallback）：宿主暗色态重定义别名即自动暗色适配，
    // 本文件零暗色 media query / 主题属性分支、零硬编码色值。焦点环引宿主 --dsw-focus-ring-*。
    var STYLE_ID = 'login-gate-settings-css'
    var SETTINGS_CSS = [
      '.login-gate-settings{max-width:760px;font-family:var(--dsw-font-family, sans-serif);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary, currentColor)}',
      '.login-gate-settings-title{margin:0 0 4px;font-size:16px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary, currentColor)}',
      '.login-gate-settings-note{margin:0;padding:0 2px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary, currentColor)}',
      '.login-gate-settings-group{margin:16px 0 0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary, currentColor)}',
      '.login-gate-settings-row{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2, transparent)}',
      '.login-gate-settings-group + .login-gate-settings-row,.login-gate-settings-note + .login-gate-settings-row{border-top:none}',
      '.login-gate-settings-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary, currentColor)}',
      '.login-gate-settings-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary, currentColor)}',
      '.login-gate-settings-restart{margin:0;padding:0 2px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warning-primary, currentColor)}',
      '.login-gate-settings-input{width:220px;max-width:100%;height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4, transparent);border-radius:var(--dsw-radius-md, 6px);background:var(--dsw-alias-bg-layer-3, transparent);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary, currentColor)}',
      '.login-gate-settings-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary, currentColor)}',
      '.login-gate-settings-input:disabled{color:var(--dsw-alias-label-tertiary, currentColor);cursor:default}',
      '.login-gate-settings-textarea{min-height:72px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2, transparent);border-radius:var(--dsw-radius-md, 6px);background:var(--dsw-alias-bg-layer-3, transparent);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary, currentColor);resize:vertical}',
      '.login-gate-settings-textarea::placeholder{color:var(--dsw-alias-label-dimmed, currentColor)}',
      '.login-gate-settings-textarea:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary, currentColor)}',
      '.login-gate-settings-textarea:disabled{color:var(--dsw-alias-label-tertiary, currentColor);cursor:default}',
      '.login-gate-settings-value{font-family:var(--ds-font-family-code, monospace);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary, currentColor);word-break:break-all}',
      '.login-gate-settings-link-list{margin:4px 0 0;padding:0 2px 0 20px;font-size:12px;line-height:1.8;color:var(--dsw-alias-label-secondary, currentColor)}',
      '.login-gate-settings-link-item{margin:0}',
      '.login-gate-settings-users{display:flex;flex-direction:column;gap:8px;padding:8px 0}',
      '.login-gate-settings-user-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}',
      '.login-gate-settings-user-form{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 0}',
      '.login-gate-settings-button{appearance:none;padding:5px 14px;border:1px solid var(--dsw-alias-border-l4, transparent);border-radius:var(--dsw-radius-md, 6px);background:var(--dsw-alias-bg-layer-3, transparent);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary, currentColor);cursor:pointer}',
      '.login-gate-settings-button:disabled{opacity:.4;cursor:default}',
      '.login-gate-settings-button:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, currentColor));outline-offset:1px}',
      '.login-gate-settings-delete{color:var(--dsw-alias-state-error-primary, currentColor)}',
      '.login-gate-settings-footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding-top:16px}',
      '.login-gate-settings-save{appearance:none;padding:5px 14px;border:1px solid transparent;border-radius:var(--dsw-radius-md, 6px);background:var(--dsw-alias-label-primary, currentColor);color:var(--dsw-alias-bg-layer-3, currentColor);font:inherit;font-size:13px;line-height:1.5;cursor:pointer}',
      '.login-gate-settings-save:disabled{opacity:.4;cursor:default}',
      '.login-gate-settings-save:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, currentColor));outline-offset:1px}',
      '.login-gate-settings-ok{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-success-primary, currentColor)}',
      '.login-gate-settings-error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary, currentColor)}',
    ].join('')

    /** 样式注入（幂等 + document 守卫）：Node/测试环境无 document 直接跳过，绝不炸模块加载。 */
    function ensureStyles() {
      if (typeof document !== 'undefined') {
        try {
          if (document.getElementById(STYLE_ID)) return
          var el = document.createElement('style')
          el.id = STYLE_ID
          el.setAttribute('data-plugin-css', 'dsh-login-gate')
          el.textContent = SETTINGS_CSS
          ;(document.head || document.documentElement).appendChild(el)
        } catch { /* 样式注入失败不炸插件（视觉降级=浏览器默认） */ }
      }
    }
    ensureStyles()

    /**
     * 注册设置面：settings.section（设置菜单配置面）。
     * 注册包 ctx.slots.inject：槽位方缺席=该面缺席，绝不炸插件（kb-context 同款纪律）。
     * 纯设置无面板行（不注册 sidebar.panellist / main）。
     */
    function apply(ctx) {
      var disposers = []
      try {
        disposers.push(ctx.slots.inject('settings.section', function setup() {
          try {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'login-gate',
              order: 31,
              label: function label() { return 'dsh-login-gate' },
            }, LoginGateSettingsSection)
          } catch (e) {
            try {
              if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-login-gate] settings.section 注册失败（缺槽位方？）：' + ((e && e.message) || e))
            } catch { /* 日志缺位不抛 */ }
            return function noop() {}
          }
        }))
      } catch (e) {
        try {
          if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-login-gate] 客户端面注册失败：' + ((e && e.message) || e))
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
