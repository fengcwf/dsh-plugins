// dsh-rtk-kit/lib/client.install.js —— 设置页「重新安装」控件 + 状态机（兄弟 chunk，Task 4）。
// 依据：changes/2026-10-03-rtk-reinstall/DESIGN.md「新控件与状态语义」1-6 逐字 + token 表逐字（零新增色板）；
//      task-4-brief 实现要点；跨卡契约（Task 2/3 复审核实源码真实形）。
// 注册形：window.__ModuleLoader__.load({id:'dsh-rtk-kit', chunk:'client.install.js', factory})——
//   chunk 名过宿主 CLIENT_CHUNK 白名单 /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/；由 lib/client.js 经
//   require.async('./client.install.js') 惰性取用（零构建多 chunk 先例= dsh-github-ops lib/client.ui.*）。
// 数据面（跨卡契约 2）：POST api/rtk-kit/install（INSTALL_URL 与 lib/doctor-routes.js 导出常量锁等值，
//   文档相对无前导斜杠——issue 1707 生产 404 教训）；成功信封恰读 {data:{record,verify}}；失败信封
//   {error:{code,message[,hint],verify?,record?,backupPath?}}；code 分派**单源**=本文件 CODE_STAGE +
//   classifyInstallError（INSTALL_ERROR_STATUS 6 分类码 + reinstall-in-progress→409 静默），禁第二份映射表。
// 状态机（跨卡契约 4，DESIGN 2）：idle → running → ok | fail。
//   idle=故障条（✗ + 「rtk 不可用（缺失或损坏）」+「重新安装」）；running=「安装中…」+阶段小字（下载 / 校验 / 落盘）
//   +按钮禁用；ok=绿 ✓「重装完成 · rtk x.y.z」；fail=红条分类文案（下载/校验/落盘）+「重试」+可展开 <details>
//   （错误详情 12px mono，含 .verify/.record/backupPath——R-3 义务）；409 重入静默（不重复弹错）。
// 触发面（US-1/D7，installNeeded）：真缺失/损坏/不可执行三态出故障条+按钮；「在位但看不见」（version 面错误
//   信封）不出按钮；正常态（rtk 在位可用）零故障条零按钮；installSupported=false（INV-6）按钮不出 + --warning；
//   installTargetMatch=false（F-FINAL-1(ii)）按钮不出 + --warning 手动安装提示（装了也不满足配置位，防误导成功）。
// 记录行（US-5/P1）：版本区底部 12px --text-secondary「最近重装：<时间> · <版本> · 成功/失败」（读 version 面 lastInstall）。
// token（DESIGN 增量逐字）：--danger/--accent/--warning/--success/--text-primary/--text-secondary/--border 变量引用
//   + 故障条底 rgba(216,57,49,0.08)（唯一新增值）+ 按钮底白字；字号 13/12（图标复用基表 14px 类）、间距 4/8/12px、
//   圆角 6px、按钮高 28px 禁用 50% 透明度、记录行零阴影；零第三方 UI 库（require 白名单仅 react）。
window.__ModuleLoader__.load({
  id: 'dsh-rtk-kit',
  chunk: 'client.install.js',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var h = require('react').createElement // 简写（React 无 JSX，零构建）
    var INSTALL_URL = 'api/rtk-kit/install' // 文档相对（与 doctor-routes 常量锁等值，测试锁）
    var UNSUPPORTED_TEXT = '当前平台不支持一键重装，请按 README 手动安装'
    var TARGET_MISMATCH_TEXT = 'rtkBin 指向自定义路径且该路径缺失，一键重装只落 ~/.local/bin/rtk（不满足配置位），请手动安装到该路径'
    var BAR_TEXT = 'rtk 不可用（缺失或损坏）'
    var STAGE_TEXT = '下载 / 校验 / 落盘'

    /** 安装面分类码 → 阶段桶（单源映射，键=lib/install.js 分类码；平台/重入单独分派）。 */
    var CODE_STAGE = {
      DOWNLOAD_FAILED: '下载',
      CHECKSUM_MISMATCH: '校验',
      EXTRACT_FAILED: '落盘',
      WRITE_FAILED: '落盘',
      VERIFY_FAILED: '落盘',
    }

    // ── 样式（token 全取 DESIGN 基表；故障条底=唯一派生值） ──
    var STYLE_ID = 'rtk-kit-install-css'
    var CSS = [
      '.rtk-kit .rtk-install-bar{box-sizing:border-box;display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:rgba(216,57,49,0.08)}',
      '.rtk-kit .rtk-install-bar.rtk-plain{background:transparent;border-color:transparent}.rtk-kit .rtk-install-main{font-size:13px;color:var(--text-primary)}',
      '.rtk-kit .rtk-install-fail-text{font-size:13px;color:var(--danger)}.rtk-kit .rtk-install-run-text{font-size:13px;font-weight:500;color:var(--accent)}.rtk-kit .rtk-install-ok-text{font-size:13px;color:var(--success)}',
      '.rtk-kit .rtk-install-stage{margin-top:4px;font-size:12px;color:var(--text-secondary)}.rtk-kit .rtk-install-warn{margin-top:4px;font-size:12px;color:var(--warning)}',
      '.rtk-kit .rtk-install-btn{height:28px;padding:0 12px;border:0;border-radius:6px;background:var(--accent);color:#ffffff;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer}',
      '.rtk-kit .rtk-install-btn:disabled{opacity:.5;cursor:default}',
      '.rtk-kit .rtk-install-record{margin-top:8px;line-height:1.5;font-size:12px;color:var(--text-secondary)}',
      '.rtk-kit .rtk-install-details{margin-top:4px;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:12px;color:var(--text-secondary)}',
    ].join('')

    /** 样式注入（幂等 + document 守卫）：Node/测试环境无 document 直接跳过，绝不炸模块加载。 */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      try {
        if (document.getElementById(STYLE_ID)) return
        var el = document.createElement('style')
        el.id = STYLE_ID
        el.setAttribute('data-plugin-css', 'dsh-rtk-kit')
        el.textContent = CSS
        ;(document.head || document.documentElement).appendChild(el)
      } catch { /* 样式注入失败不炸插件（视觉降级=浏览器默认） */ }
    }
    ensureStyles()

    /**
     * code 分派（单源，跨卡契约 2）：6 分类码 → 下载/校验/落盘三桶 + 平台/重入/通用。
     * @returns {{silent:boolean, stage:string|null, label:string, unsupported:boolean}}
     */
    function classifyInstallError(error) {
      var code = error && typeof error.code === 'string' ? error.code : ''
      if (code === 'reinstall-in-progress') return { silent: true, stage: null, label: '', unsupported: false }
      if (code === 'PLATFORM_UNSUPPORTED') return { silent: false, stage: '平台', label: '平台不支持一键重装', unsupported: true }
      var stage = Object.hasOwn(CODE_STAGE, code) ? CODE_STAGE[code] : null
      return { silent: false, stage: stage, label: stage ? '重装失败（' + stage + '）' : '重装失败', unsupported: false }
    }

    /**
     * D7 触发面（US-1）：真缺失/损坏/不可执行三态出故障条；「在位但看不见」不出按钮。
     * version 面裁定优先（available:false=缺失/损坏/不可执行归一；version 不可解析=损坏窗口）；
     * version 未裁定（idle/loading）时看 gain 自动面 spawn 级缺失（error.kind='missing'）；
     * version 面错误信封=「在位但看不见」→ 不出按钮（可见性归解析器，物理性归重装）。
     */
    function installNeeded(versionState, gainState) {
      var vs = versionState && typeof versionState === 'object' ? versionState : {}
      var v = vs.status === 'ok' && vs.data && typeof vs.data === 'object' ? vs.data : null
      if (v && (v.available === true || v.available === false)) return v.available === false || v.version == null
      if (vs.status === 'error') return false
      var g = gainState && typeof gainState === 'object' ? gainState : {}
      return !!(g.status === 'error' && g.error && g.error.kind === 'missing')
    }

    /**
     * 安装执行（状态机迁移源）：POST install 一次，按信封产出三态结论。
     * @param {{fetch:Function, url?:string}} deps - fetch 缝（client.js exports.__fetch 注入）；url 缺省本文件常量
     * @returns {Promise<{outcome:'ok'|'fail'|'silent', record?:object|null, verify?:object|null, error?:object}>}
     *   重入（409 reinstall-in-progress）回 silent（不重复弹错）；网络异常合成 {code:null,message} 走 fail。
     */
    function runInstall(deps) {
      var fetchFn = deps && typeof deps.fetch === 'function' ? deps.fetch : null
      if (!fetchFn) return Promise.resolve({ outcome: 'fail', error: { code: null, message: 'runInstall: fetch 缺位' } })
      var url = deps && typeof deps.url === 'string' && deps.url ? deps.url : INSTALL_URL
      return Promise.resolve()
        .then(function () { return fetchFn(url, { method: 'POST', body: '{}' }) })
        .then(function (res) { return res && typeof res.json === 'function' ? res.json() : null })
        .then(function (body) {
          if (body && body.error && typeof body.error === 'object') {
            if (classifyInstallError(body.error).silent) return { outcome: 'silent' }
            return { outcome: 'fail', error: body.error }
          }
          var data = body && body.data && typeof body.data === 'object' ? body.data : {}
          return { outcome: 'ok', record: data.record != null ? data.record : null, verify: data.verify != null ? data.verify : null }
        })
        .catch(function (e) {
          return { outcome: 'fail', error: { code: null, message: String((e && e.message) || e) } }
        })
    }

    /** 失败详情 <details>（R-3 义务：含 .verify/.record/旧版 .bak 位置 backupPath；错误详情 12px mono）。 */
    function detailsNode(error) {
      var e = error && typeof error === 'object' ? error : {}
      var lines = []
      if (e.code !== undefined) lines.push('code: ' + String(e.code))
      if (e.message !== undefined) lines.push('message: ' + String(e.message))
      if (e.hint !== undefined && e.hint !== null) lines.push('hint: ' + String(e.hint))
      if (e.backupPath !== undefined) lines.push('backupPath: ' + (e.backupPath === null ? 'null' : String(e.backupPath)))
      if (e.verify !== undefined) lines.push('verify: ' + safeJson(e.verify))
      if (e.record !== undefined) lines.push('record: ' + safeJson(e.record))
      if (lines.length === 0) lines.push('message: ' + String(e))
      var kids = [h('summary', null, '错误详情')]
      for (var i = 0; i < lines.length; i++) kids.push(h('div', null, lines[i]))
      return h('details', { className: 'rtk-install-details', 'data-rtk-install': 'details' }, kids)
    }

    /** JSON 序列化兜底（详情展示用，绝不抛）。 */
    function safeJson(v) {
      try { return JSON.stringify(v) } catch { return String(v) }
    }

    /**
     * 安装控件（DESIGN 1-3/5 逐字）：按状态机 phase 渲染故障条 / running / ok / fail / 平台不支持。
     * 纯渲染零钩子（状态全在 client.js 根组件）。
     * @param {{phase:string, needed:boolean, supported:boolean|undefined, targetMatch:boolean|undefined, error:object|null, version:string|null, onInstall:Function}} view（supported=undefined=installSupported 未裁定 → 按钮保守不出，T4-F-1；targetMatch=false → 按钮改手动提示，F-FINAL-1(ii)）
     */
    function renderInstallRow(view) {
      var v = view && typeof view === 'object' ? view : {}
      var phase = typeof v.phase === 'string' ? v.phase : 'idle'
      var onInstall = typeof v.onInstall === 'function' ? v.onInstall : function () {}
      if (phase === 'running') {
        return h('div', { 'data-rtk-install': 'running' },
          h('div', { className: 'rtk-install-bar rtk-plain' },
            h('span', { className: 'rtk-install-run-text' }, '安装中…'),
            h('button', { type: 'button', className: 'rtk-install-btn', 'data-rtk-action': 'install', disabled: true }, '安装中…')),
          h('div', { className: 'rtk-install-stage', 'data-rtk-install': 'stage' }, STAGE_TEXT))
      }
      if (phase === 'ok') {
        return h('div', { className: 'rtk-install-bar rtk-plain', 'data-rtk-install': 'ok' },
          h('span', { className: 'rtk-ok-mark' }, '✓'),
          h('span', { className: 'rtk-install-ok-text' }, '重装完成 · rtk ' + String(v.version || '-')))
      }
      if (phase === 'fail') {
        var cls = classifyInstallError(v.error)
        var msg = v.error && v.error.message ? String(v.error.message) : ''
        return h('div', { 'data-rtk-install': 'fail' },
          h('div', { className: 'rtk-install-bar' },
            h('span', { className: 'rtk-fail-mark' }, '✗'),
            h('span', { className: 'rtk-install-fail-text' }, cls.label + (msg ? '：' + msg : '')),
            h('button', { type: 'button', className: 'rtk-install-btn', 'data-rtk-action': 'install-retry', onClick: onInstall }, '重试')),
          detailsNode(v.error))
      }
      if (v.supported === false) {
        // INV-6：他平台按钮不出（提示手动安装）；故障条照出（主文案仍如实），--warning 替代按钮
        var kids = []
        if (v.needed) {
          kids.push(h('div', { className: 'rtk-install-bar' },
            h('span', { className: 'rtk-fail-mark' }, '✗'),
            h('span', { className: 'rtk-install-main' }, BAR_TEXT)))
        }
        kids.push(h('div', { className: 'rtk-install-warn' }, UNSUPPORTED_TEXT))
        return h('div', { 'data-rtk-install': 'unsupported' }, kids)
      }
      if (v.targetMatch === false) {
        // F-FINAL-1(ii)（Ruling 2026-10-04）：种子=显式自定义路径且缺失且≠引擎落点（installTargetMatch:false）——
        // 装了也不满足配置位（INV-7 写面限制），按钮不出（防误导成功），改手动安装提示；故障条照出（needed 如实）。
        // 门控只收窄误导窗口：true/未裁定（undefined）按钮照 T4-F-1 既有门槛语义出（undefined≠false，防误伤主场景）。
        var kidsM = []
        if (v.needed) {
          kidsM.push(h('div', { className: 'rtk-install-bar' },
            h('span', { className: 'rtk-fail-mark' }, '✗'),
            h('span', { className: 'rtk-install-main' }, BAR_TEXT)))
        }
        kidsM.push(h('div', { className: 'rtk-install-warn' }, TARGET_MISMATCH_TEXT))
        return h('div', { 'data-rtk-install': 'manual' }, kidsM)
      }
      if (!v.needed) return null // 正常态（US-1）：零故障条零按钮
      return h('div', { className: 'rtk-install-bar', 'data-rtk-install': 'idle' },
        h('span', { className: 'rtk-fail-mark' }, '✗'),
        h('span', { className: 'rtk-install-main' }, BAR_TEXT),
        v.supported === true ? h('button', { type: 'button', className: 'rtk-install-btn', 'data-rtk-action': 'install', onClick: onInstall }, '重新安装') : null) // T4-F-1：installSupported 未裁定（supported 非 true）保守不出按钮；裁定 false 走上面 INV-6 警示行
    }

    /** 记录行（US-5/P1，DESIGN 4）：版本区底部 12px --text-secondary「最近重装：<时间> · <版本> · 成功/失败」。 */
    function renderRecordRow(record) {
      if (!record || typeof record !== 'object') return null
      var time = record.time == null ? '-' : String(record.time)
      var ver = record.version == null ? '-' : String(record.version)
      return h('div', { className: 'rtk-install-record', 'data-rtk-install': 'record' },
        '最近重装：' + time + ' · ' + ver + ' · ' + (record.ok === true ? '成功' : '失败'))
    }

    exports.INSTALL_URL = INSTALL_URL
    exports.classifyInstallError = classifyInstallError
    exports.installNeeded = installNeeded
    exports.runInstall = runInstall
    exports.renderInstallRow = renderInstallRow
    exports.renderRecordRow = renderRecordRow
    return module.exports
  },
})
