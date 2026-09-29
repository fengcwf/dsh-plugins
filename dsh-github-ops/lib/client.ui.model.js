// lib/client.ui.model.js — dsh-github-ops UI 状态模型层（client.ui.* 兄弟 chunk，F-scan-1 渲染族）。
// 注册形：window.__ModuleLoader__.load({id:'dsh-github-ops', chunk:'client.ui.model.js', factory})（INV-9 id=包名）。
// 职责：经 api.fetch（文档相对 api/github-ops/…）取数 + 组织视图状态；投影纯函数归 client.ui.project.js（同族 chunk，
//   惰性 require.async 取用）。容器与展示分离：本层零 DOM 零 React，client.ui.cards.js 纯渲染消费。
// 显示边界（INV-1 / INV-10 / P-5 / 合同 1）：只读结构化字段（code/status/message/hint/quota/投影数组），
//   绝不读取 stderr 等原始串、不自行拼接任何 URL 或 token 明文（数据面 sendJson 已整树 redact，双保险）。
// HTTP 语义（合同 9）：业务失败=HTTP 200 + ok:false（按 code 归因分级），4xx/5xx 只表达传输/契约违例——分流看 ok/code，不看 HTTP 状态；
//   4xx/5xx 且 body 缺 ok:false（网关/反代自返 JSON）一律合成硬失败形走分级卡，绝不假成功（D2 收口）。
// 「留空=不修改」（INV-4）：空 token 提交不发请求、不触碰既有凭据；保存即清空（INV-1）；保存后立即验证（US-2）。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  chunk: 'client.ui.model.js',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var NOT_CONFIGURED = /-07$/ // 未配置=可展示空态/未配置，非错误卡
    var proj = null // client.ui.project.js 模块（惰性载入，动作开始时就绪）
    function loadProject() {
      if (proj) return Promise.resolve(proj)
      if (typeof require.async !== 'function') return Promise.reject(new Error('require.async 缺位（宿主形不符）'))
      return Promise.resolve().then(function () { return require.async('./client.ui.project.js') }).then(function (m) {
        proj = m
        return m
      })
    }

    /** 请求缝：传输失败→transport 归因；HTTP 4xx/5xx=契约违例，body 交分级投影（只取白名单字段） */
    async function request(api, path, init) {
      var resp
      try { resp = await api.fetch(path, init) } catch (e) { return { transport: true, message: String((e && e.message) || e) } }
      if (!resp) return { transport: true, message: '本地服务无响应' }
      var body = null
      try { body = await resp.json() } catch { body = null }
      if (!resp.ok || resp.status >= 400) {
        // D2 收口（INV-10 邻域）：HTTP≥400 且 body 是 JSON 但缺 ok:false（前置反代/网关自返 {error:…} 401/502 JSON）
        // 不得原样放行——否则 isHardFailure 判成功出假成功卡；显式 ok:false 才按业务分级放行
        if (body && typeof body === 'object' && body.ok === false) return body
        return {
          ok: false,
          code: null,
          status: resp.status,
          message: (body && typeof body === 'object' && body.message != null) ? String(body.message) : 'HTTP ' + resp.status,
          hint: null,
        } // 合成硬失败形（分级卡）：message 取 body.message ?? 'HTTP '+status；非 JSON 4xx/5xx 走同一形（S2），绝不当成功
      }
      return body && typeof body === 'object' ? body : {}
    }
    const isHardFailure = (body) => body.transport === true
      || (body.ok === false && !NOT_CONFIGURED.test(String(body.code ?? '')))

    /** UI 状态模型：{getState, subscribe, actions}（容器组件订阅，cards 纯渲染消费） */
    function createModel(options) {
      var api = options && options.api ? options.api : { fetch: function () { return Promise.reject(new Error('api 缺位')) } }
      var listeners = []
      var accountsBase = []
      var verifyByLogin = {}
      var state = {
        auth: { phase: 'loading', error: null, host: null, login: null, hasToken: false, configured: false, hint: null, quota: null },
        check: { phase: 'idle', error: null, rows: [], quota: null, elapsedMs: null },
        health: { phase: 'loading', error: null, rows: [] },
        accounts: { phase: 'loading', error: null, rows: [], hint: null },
        repo: { phase: 'loading', error: null, branch: null, remotes: [], repo: null, hint: null },
        token: { draft: '', busy: false, notice: null, error: null },
      }
      function notify() {
        for (var i = 0; i < listeners.length; i++) { try { listeners[i]() } catch { /* 订阅者异常不炸模型（INV-6） */ } }
      }
      function rebuildRows() {
        state.accounts.rows = (accountsBase ?? []).map(function (a) {
          var login = String((a && a.login) ?? '')
          var v = verifyByLogin[login]
          return {
            login: login,
            active: Boolean(a && a.active),
            verified: v ? v.verified : Boolean(a && a.verified),
            state: v ? v.state : (a && a.verified ? 'success' : 'missing'),
            busy: false,
          }
        }).filter(function (r) { return r.login })
      }
      function setRowBusy(login, busy) {
        state.accounts.rows = state.accounts.rows.map(function (r) {
          return r.login === login ? Object.assign({}, r, { busy: Boolean(busy) }) : r
        })
      }
      function applyVerify(body) {
        if (body.ok === true && Array.isArray(body.accounts)) {
          body.accounts.forEach(function (a) {
            if (!a || !a.login) return
            verifyByLogin[String(a.login)] = { verified: Boolean(a.verified), state: String(a.state ?? 'missing') }
          })
          state.accounts.error = null
          rebuildRows()
        } else {
          state.accounts.error = proj.gradeFailure(body)
        }
      }

      // —— 取数动作（busy 态同步先行，再 await 取数/投影）——
      async function loadStatus() {
        await loadProject()
        var body = await request(api, 'status')
        if (isHardFailure(body)) {
          state.auth.phase = 'error'
          state.auth.error = proj.gradeFailure(body)
          return
        }
        var hosts = Array.isArray(body.hosts) ? body.hosts : []
        accountsBase = Array.isArray(body.accounts) ? body.accounts : []
        rebuildRows()
        state.auth.phase = 'ready'
        state.auth.error = null
        state.auth.host = hosts.length ? String(hosts[0].host ?? '') : null
        state.auth.login = body.login ? String(body.login) : null
        state.auth.hasToken = hosts.some(function (h) { return Boolean(h && h.hasToken) })
        state.auth.configured = body.ok === true && hosts.length > 0
        state.auth.hint = body.ok === true ? null : String(body.hint ?? '')
        if (!state.auth.configured) {
          state.accounts.phase = 'ready'
          state.accounts.hint = state.auth.hint
        }
      }
      async function loadVerify() {
        await loadProject()
        var body = await request(api, 'accounts/verify', { method: 'POST' })
        if (state.accounts.phase === 'loading') state.accounts.phase = 'ready'
        applyVerify(body)
      }
      async function loadHealth() {
        await loadProject()
        var body = await request(api, 'health')
        if (isHardFailure(body)) {
          state.health.phase = 'error'
          state.health.error = proj.gradeFailure(body)
          return
        }
        state.health.phase = 'ready'
        state.health.error = null
        state.health.rows = proj.healthRows(body.sections)
      }
      async function loadRepo() {
        await loadProject()
        var body = await request(api, 'repo-context')
        if (isHardFailure(body)) {
          state.repo.phase = 'error'
          state.repo.error = proj.gradeFailure(body)
          return
        }
        var git = body.git && typeof body.git === 'object' ? body.git : {}
        state.repo.phase = 'ready'
        state.repo.error = null
        state.repo.branch = git.branch ? String(git.branch) : null
        state.repo.remotes = (Array.isArray(git.remotes) ? git.remotes : []).map(function (r) {
          return { name: String((r && r.name) ?? ''), url: String((r && r.url) ?? '') }
        })
        state.repo.repo = body.repo && typeof body.repo === 'object'
          ? {
              fullName: body.repo.fullName ? String(body.repo.fullName) : null,
              stars: typeof body.repo.stars === 'number' ? body.repo.stars : null,
              issues: typeof body.repo.issues === 'number' ? body.repo.issues : null,
              defaultBranch: body.repo.defaultBranch ? String(body.repo.defaultBranch) : null,
            }
          : null
        state.repo.hint = body.hint ? String(body.hint) : null
      }

      async function boot() {
        state.auth.phase = 'loading'
        state.health.phase = 'loading'
        state.repo.phase = 'loading'
        state.accounts.phase = 'loading'
        state.accounts.hint = null
        notify()
        await Promise.all([loadStatus(), loadVerify(), loadHealth(), loadRepo()])
        notify()
      }

      async function check() {
        state.check.phase = 'loading' // busy 态先行（Loading 三件套）
        state.check.error = null
        notify()
        await loadProject()
        var body = await request(api, 'check', { method: 'POST' })
        var quota = body.quota ? proj.formatQuota(body.quota) : null
        state.check.quota = quota
        state.check.elapsedMs = typeof body.elapsedMs === 'number' ? body.elapsedMs : null
        state.check.rows = proj.checkRows(body, quota)
        state.check.phase = body.ok === true ? 'ready' : 'error'
        state.check.error = body.ok === true ? null : proj.gradeFailure(body)
        state.auth.quota = quota // 限额可视化贯穿（US-6）：认证状态卡同步
        notify()
      }

      async function saveToken(value) {
        var v = typeof value === 'string' ? value : ''
        if (!v.trim()) {
          // 「留空=不修改」（INV-4）：不发请求、不触碰既有凭据
          state.token.draft = ''
          state.token.error = null
          state.token.notice = { kind: 'info', text: '留空=不修改，未触碰既有凭据' }
          notify()
          return
        }
        state.token.busy = true // busy 态先行（保存即清空在终态执行）
        state.token.error = null
        state.token.notice = null
        notify()
        await loadProject()
        var body = await request(api, 'token', { method: 'POST', body: JSON.stringify({ token: v }) })
        state.token.busy = false
        state.token.draft = '' // 保存即清空（INV-1）
        if (body.ok === true) {
          state.token.error = null
          state.token.notice = { kind: 'ok', text: body.noop ? '留空=不修改，未触碰既有凭据' : '已保存并写入 hosts.yml（零明文存储）' }
          notify()
          await check() // 保存后立即验证（US-2）
          await loadStatus()
          notify()
          return
        }
        state.token.notice = null
        state.token.error = proj.gradeFailure(body)
        notify()
      }

      async function verifyAccount(login) {
        setRowBusy(login, true)
        notify()
        await loadProject()
        var body = await request(api, 'accounts/verify', { method: 'POST', body: JSON.stringify({ logins: [String(login)] }) })
        setRowBusy(login, false)
        applyVerify(body)
        notify()
      }

      async function switchAccount(login) {
        setRowBusy(login, true) // busy 态先行（行内 spinner）
        notify()
        await loadProject()
        var body = await request(api, 'accounts/switch', { method: 'POST', body: JSON.stringify({ login: String(login) }) })
        if (body.ok === true) {
          state.accounts.error = null
          await loadStatus()
          await loadVerify()
          notify()
          return
        }
        setRowBusy(login, false)
        state.accounts.error = proj.gradeFailure(body)
        notify()
      }

      function setTokenDraft(value) {
        state.token.draft = typeof value === 'string' ? value : ''
        notify()
      }

      function addAccount() {
        // 添加账号入口（US-4）：与 token 维护同一录入链路（stdin 写入 hosts.yml），数据面无第二录入端点；
        // 行为=录入引导（Token 卡保存）；输入框聚焦增强未实现（deferred，无死计数器）
        state.token.notice = { kind: 'info', text: '粘贴新账号的 PAT 后点「保存并验证」，即可加入 hosts.yml' }
        notify()
      }

      return {
        getState: function getState() { return state },
        subscribe: function subscribe(fn) {
          listeners.push(fn)
          return function unsubscribe() {
            var i = listeners.indexOf(fn)
            if (i >= 0) listeners.splice(i, 1)
          }
        },
        actions: {
          boot: boot, check: check, saveToken: saveToken, setTokenDraft: setTokenDraft,
          verifyAccount: verifyAccount, switchAccount: switchAccount, addAccount: addAccount,
        },
      }
    }

    exports.createModel = createModel
    return module.exports
  },
})
