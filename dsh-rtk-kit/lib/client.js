// dsh-rtk-kit 客户端面（dsh-client-modules 工厂形 bundle，零构建纯 JS——lib/ 不引构建器、React 无 JSX）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory(require) 只登记模块体（副作用全在 apply）；
// exports.apply(ctx) + exports.inject=['slots']（宿主 dsh.client 声明被扫入浏览器花名册，Task 8 接线）。
// 设置页入口（INV-1/ADR-001）：settings.section 独立菜单项「RTK Kit」（id: rtk-kit）一页三区块——
//   RTK 版本 / 节省统计 / 功能健康；行式堆叠（visual/final.png 定稿，DOM 结构照 visual/candidate-a.html）。
// 数据面（文档相对 URL，无前导斜杠——issue #1707 生产 404 教训，禁 '/api/...'）：GET api/rtk-kit/version
//   | GET api/rtk-kit/gain | POST api/rtk-kit/health（body '{}'，服务端不读）。信封：成功 {data}；
//   失败 {error:{code,message[,hint]}}。状态机按 error.code 分派（勿只看 res.ok）：RTK_TIMEOUT→超时态
//   +重试按钮（INV-5）；RTK_UNAVAILABLE→rtk 缺失（读 error.hint 安装提示）；version 缺失态读 data.hint
//   （available:false=软数据态，Ruling A）；失败→红叉+原因小字（--danger，不吞错）。
// 触发方式（INV-11）：进页自动拉统计恰一次（加载中指标「-」占位）；版本检查与健康七项仅按钮点击；
//   周期切换 日|周|月|全部（缺省「全部」）纯客户端切片、零新请求（INV-3；「全部」=summary 聚合）。
// 视觉（DESIGN.md token 逐字）：9 色彩 CSS 变量 + 字阶 15/14/13/20/12 + 间距 4/8/12/16/24 + 圆角 6px；
//   细横线分隔禁卡片阴影；纯 React（require 白名单仅 react），零第三方 UI 库、零构建链。
window.__ModuleLoader__.load({
  id: 'dsh-rtk-kit',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')
    var h = react.createElement // 简写（React 无 JSX）
    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基
    var URL_VERSION = 'api/rtk-kit/version'
    var URL_GAIN = 'api/rtk-kit/gain'
    var URL_HEALTH = 'api/rtk-kit/health'

    /** fetch 缝（测试注入；默认全局 fetch）——测试红线 INV-4/INV-8：零真实 rtk 执行 */
    exports.__fetch = function doFetch(url, init) { return fetch(url, init) }

    // ── DESIGN.md token 逐字落地（色彩 9 + 字阶 5 + 圆角 6px；间距 4/8/12/16/24） ──
    var STYLE_ID = 'rtk-kit-settings-css'
    var CSS = [
      '.rtk-kit{--bg-page:#ffffff;--bg-subtle:#f7f8fa;--border:#e5e6eb;--text-primary:#1f2329;--text-secondary:#646a73;--accent:#3370ff;--success:#2ea44f;--danger:#d83931;--warning:#d97706;box-sizing:border-box;padding:16px;background:var(--bg-page);color:var(--text-primary);font:400 13px/1.5 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
      '.rtk-kit *{box-sizing:border-box;margin:0;padding:0}',
      '.rtk-kit .rtk-page-head{display:flex;align-items:baseline;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--border)}.rtk-kit .rtk-title{font-size:15px;font-weight:600;line-height:22px}.rtk-kit .rtk-crumb{font-size:12px;color:var(--text-secondary)}',
      '.rtk-kit .rtk-block{padding:24px 0 12px;border-bottom:1px solid var(--border)}.rtk-kit .rtk-block:last-child{border-bottom:0}',
      '.rtk-kit .rtk-row{display:flex;align-items:center;gap:8px}.rtk-kit .rtk-title-row{min-height:26px}.rtk-kit .rtk-block-title{font-size:14px;font-weight:600;line-height:22px}',
      '.rtk-kit .rtk-meta{margin-left:auto;font-size:12px;color:var(--text-secondary)}.rtk-kit .rtk-content-row{min-height:28px;padding:4px 8px}.rtk-kit .rtk-action-row{padding:12px 8px 0;gap:12px;flex-wrap:wrap}',
      '.rtk-kit .rtk-ok-mark{color:var(--success);font-weight:600;font-size:14px;line-height:1}.rtk-kit .rtk-warn-mark{color:var(--warning);font-weight:600;font-size:14px;line-height:1}.rtk-kit .rtk-fail-mark{color:var(--danger);font-weight:600;font-size:14px;line-height:1}',
      '.rtk-kit .rtk-mono{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:13px}.rtk-kit .rtk-dot-sep{color:var(--text-secondary)}.rtk-kit .rtk-metrics{border-top:1px solid var(--border)}',
      '.rtk-kit .rtk-metric-row{display:flex;align-items:center;justify-content:space-between;min-height:26px;padding:0 8px;line-height:2.2;border-bottom:1px solid var(--border)}.rtk-kit .rtk-metric-row:last-child{border-bottom:0}',
      '.rtk-kit .rtk-m-label{font-size:13px;color:var(--text-secondary)}.rtk-kit .rtk-m-value{font-size:20px;font-weight:600;line-height:1.3;color:var(--text-primary);font-variant-numeric:tabular-nums}.rtk-kit .rtk-m-value.rtk-ok{color:var(--success)}',
      '.rtk-kit .rtk-checks{border-top:1px solid var(--border)}.rtk-kit .rtk-check-row{min-height:26px;padding:1px 8px;line-height:2.2;border-bottom:1px solid var(--border)}.rtk-kit .rtk-check-row:last-child{border-bottom:0}',
      '.rtk-kit .rtk-check-line{display:flex;align-items:center;gap:12px}.rtk-kit .rtk-name{font-size:13px;color:var(--text-primary)}.rtk-kit .rtk-reason{display:block;font-size:12px;line-height:1.5;color:var(--danger)}.rtk-kit .rtk-reason.rtk-note{color:var(--text-secondary)}',
      '.rtk-kit .rtk-status{margin-left:auto;font-size:12px;white-space:nowrap}.rtk-kit .rtk-status.rtk-ok{color:var(--success)}.rtk-kit .rtk-status.rtk-fail{color:var(--danger)}',
      '.rtk-kit .rtk-btn{border:1px solid var(--border);border-radius:6px;background:var(--bg-page);color:var(--text-primary);font:inherit;font-size:13px;padding:4px 12px;cursor:pointer}.rtk-kit .rtk-btn:disabled{opacity:.6;cursor:default}',
      '.rtk-kit .rtk-seg{display:inline-flex;background:var(--bg-subtle);border:1px solid var(--border);border-radius:6px;padding:4px;gap:4px}.rtk-kit .rtk-seg button{border:0;border-radius:6px;background:transparent;color:var(--text-secondary);font:inherit;font-size:12px;line-height:18px;padding:4px 12px;cursor:pointer}',
      '.rtk-kit .rtk-seg button.rtk-on{background:var(--accent);color:#ffffff;font-weight:600}.rtk-kit .rtk-note{margin-left:auto;font-size:12px;color:var(--text-secondary)}.rtk-kit .rtk-state{padding:4px 8px;gap:8px}',
      '.rtk-kit .rtk-warn{color:var(--warning);font-size:12px}.rtk-kit .rtk-fail{color:var(--danger);font-size:12px}.rtk-kit .rtk-muted{color:var(--text-secondary);font-size:12px}',
    ].join('')

    /** 样式注入（幂等 + document 守卫）：Node/测试环境无 document 直接跳过，绝不炸模块加载 */
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

    // ── 数值格式化（定稿形：2,070 / 1.2M / 380K / 68%；null/非法 → 「-」占位） ──
    function fmtCount(v) {
      if (typeof v !== 'number' || !isFinite(v)) return '-'
      var n = Math.round(v)
      var s = String(Math.abs(n))
      var out = ''
      for (var i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 === 0) out += ','
        out += s[i]
      }
      return (n < 0 ? '-' : '') + out
    }
    function fmtTokens(v) {
      if (typeof v !== 'number' || !isFinite(v)) return '-'
      if (v >= 1e6) return String(Math.round((v / 1e6) * 10) / 10) + 'M'
      if (v >= 1e4) return String(Math.round((v / 1e3) * 10) / 10) + 'K'
      return fmtCount(v)
    }
    function fmtPct(v) {
      if (typeof v !== 'number' || !isFinite(v)) return '-'
      return String(Math.round(v * 10) / 10) + '%'
    }

    // ── 周期切片（INV-3：客户端切片零新请求；「全部」=summary 聚合） ──
    // Ruling B（Task 7）：日/周/月=该周期序列「最新桶」（max 周期键，顺序无关）；空序列=null → 「-」。
    var PERIODS = [
      { key: 'day', label: '日', list: 'daily', idKey: 'date' }, { key: 'week', label: '周', list: 'weekly', idKey: 'week_start' },
      { key: 'month', label: '月', list: 'monthly', idKey: 'month' }, { key: 'all', label: '全部', list: null, idKey: null },
    ]
    function sliceMetrics(data, period) {
      var empty = { commands: null, input: null, output: null, saved: null, rate: null }
      if (!data || typeof data !== 'object') return empty
      if (period === 'all') {
        var s = data.summary && typeof data.summary === 'object' ? data.summary : {}
        return { commands: s.total_commands, input: s.total_input, output: s.total_output, saved: s.total_saved, rate: s.avg_savings_pct }
      }
      var cfg = null
      for (var i = 0; i < PERIODS.length; i++) if (PERIODS[i].key === period) cfg = PERIODS[i]
      var list = cfg && Array.isArray(data[cfg.list]) ? data[cfg.list] : []
      var best = null
      for (var j = 0; j < list.length; j++) {
        var row = list[j]
        if (!row || typeof row !== 'object') continue
        if (best === null || String(row[cfg.idKey] || '') > String(best[cfg.idKey] || '')) best = row
      }
      if (!best) return empty
      return { commands: best.commands, input: best.input_tokens, output: best.output_tokens, saved: best.saved_tokens, rate: best.savings_pct }
    }

    // ── 状态归一（按 error.code 分派，Task 6 口径 ②：勿只看 res.ok） ──
    function normalizeError(err) {
      var code = err && err.code
      if (code === 'RTK_TIMEOUT') return { kind: 'timeout', text: 'rtk 响应超时' }
      if (code === 'RTK_UNAVAILABLE') return { kind: 'missing', text: String((err && err.hint) || (err && err.message) || 'rtk 二进制缺失，请先安装 rtk') }
      return { kind: 'error', text: String((err && err.message) || code || '请求失败') }
    }

    /** 失败/超时态行（US-4/INV-5）：超时=--warning「rtk 响应超时」+ 重试按钮；失败=红叉 + 原因小字 --danger */
    function stateLine(st, retryAction, onRetry) {
      var e = st.error
      if (!e) return null
      var isFail = e.kind === 'error'
      var kids = [h('span', { className: isFail ? 'rtk-fail' : 'rtk-warn' }, (isFail ? '✗ ' : '⚠ ') + e.text)]
      if (e.kind === 'timeout') kids.push(h('button', { type: 'button', className: 'rtk-btn', 'data-rtk-action': retryAction, onClick: onRetry }, '重试'))
      return h('div', { className: 'rtk-row rtk-state' }, kids)
    }

    // ── 区块 1 · RTK 版本（按钮触发；缺失态=软数据态读 data.hint，Ruling A） ──
    function versionBlock(st, onCheck) {
      var content
      if (st.status === 'idle') {
        content = h('div', { className: 'rtk-row rtk-content-row' }, h('span', { className: 'rtk-muted' }, '尚未检查'))
      } else if (st.status === 'loading') {
        content = h('div', { className: 'rtk-row rtk-content-row' }, h('span', { className: 'rtk-muted' }, '检查中…'))
      } else if (st.status === 'ok' && st.data && st.data.available === false) {
        content = h('div', { className: 'rtk-row rtk-content-row' },
          h('span', { className: 'rtk-warn-mark' }, '⚠'),
          h('span', { className: 'rtk-warn' }, String(st.data.hint || 'rtk 二进制缺失，请先安装 rtk')))
      } else if (st.status === 'ok') {
        content = h('div', { className: 'rtk-row rtk-content-row' },
          h('span', { className: 'rtk-ok-mark' }, '✓'),
          h('span', { className: 'rtk-mono' }, 'rtk ' + String((st.data && st.data.version) || '-')),
          h('span', { className: 'rtk-dot-sep' }, '·'),
          h('span', { className: 'rtk-mono' }, String((st.data && st.data.path) || '-')))
      } else {
        content = stateLine(st, 'retry-version', onCheck)
      }
      return h('section', { className: 'rtk-block', 'data-rtk-block': 'version' },
        h('div', { className: 'rtk-row rtk-title-row' },
          h('span', { className: 'rtk-block-title' }, 'RTK 版本'),
          h('span', { className: 'rtk-meta' }, '二进制检测')),
        content,
        h('div', { className: 'rtk-row rtk-action-row' },
          h('button', { type: 'button', className: 'rtk-btn', 'data-rtk-action': 'check-version', disabled: st.status === 'loading', onClick: onCheck },
            st.status === 'loading' ? '检查中…' : '检查版本')))
    }

    // ── 区块 2 · 节省统计（进页自动拉取；周期切换纯客户端切片，INV-3/INV-11） ──
    function gainBlock(st, period, onPeriod, onRetry) {
      var m = sliceMetrics(st.status === 'ok' ? st.data : null, period)
      var rows = [
        { key: 'commands', label: '总命令数', value: fmtCount(m.commands) }, { key: 'input', label: '输入 tokens', value: fmtTokens(m.input) },
        { key: 'output', label: '输出 tokens', value: fmtTokens(m.output) }, { key: 'saved', label: '节省 tokens', value: fmtTokens(m.saved) },
        { key: 'rate', label: '节省率', value: fmtPct(m.rate), ok: true },
      ]
      var rowNodes = []
      for (var i = 0; i < rows.length; i++) {
        rowNodes.push(h('div', { className: 'rtk-metric-row' },
          h('span', { className: 'rtk-m-label' }, rows[i].label),
          h('span', { className: 'rtk-m-value' + (rows[i].ok ? ' rtk-ok' : ''), 'data-rtk-metric': rows[i].key }, rows[i].value)))
      }
      var segs = []
      for (var j = 0; j < PERIODS.length; j++) {
        segs.push(h('button', {
          type: 'button', 'data-rtk-period': PERIODS[j].key,
          className: period === PERIODS[j].key ? 'rtk-on' : undefined,
          onClick: (function (k) { return function () { onPeriod(k) } })(PERIODS[j].key),
        }, PERIODS[j].label))
      }
      return h('section', { className: 'rtk-block', 'data-rtk-block': 'gain' },
        h('div', { className: 'rtk-row rtk-title-row' },
          h('span', { className: 'rtk-block-title' }, '节省统计'),
          h('span', { className: 'rtk-meta' }, '近 30 天')),
        h('div', { className: 'rtk-metrics' }, rowNodes),
        st.status === 'error' ? stateLine(st, 'retry-gain', onRetry) : null,
        h('div', { className: 'rtk-row rtk-action-row' },
          h('div', { className: 'rtk-seg' }, segs),
          h('span', { className: 'rtk-note' }, '自动加载 · 不消耗 LLM token')))
    }

    // ── 区块 3 · 功能健康（按钮触发七项；失败如实红不藏，detail 次行小字） ──
    function healthBlock(st, onRun) {
      var items = st.status === 'ok' && Array.isArray(st.data) ? st.data : []
      var meta = '未检查'
      if (st.status === 'loading') meta = '检查中…'
      else if (st.status === 'error') meta = '检查失败'
      else if (st.status === 'ok') {
        var pass = 0
        for (var k = 0; k < items.length; k++) if (items[k] && items[k].status === 'pass') pass++
        meta = items.length + ' 项 · ' + pass + ' 通过 / ' + (items.length - pass) + ' 失败'
      }
      var content
      if (st.status === 'ok') {
        var rows = []
        for (var i = 0; i < items.length; i++) {
          var item = items[i] || {}
          var ok = item.status === 'pass'
          var kids = [h('div', { className: 'rtk-check-line' },
            h('span', { className: 'rtk-name' }, String(item.label || item.id || '-')),
            h('span', { className: 'rtk-status ' + (ok ? 'rtk-ok' : 'rtk-fail') }, ok ? '✓ 正常' : '✗ 失败'))]
          if (!ok || item.id === 'compression-effective') kids.push(h('span', { className: 'rtk-reason' + (ok ? ' rtk-note' : '') }, String(item.detail || '')))
          rows.push(h('div', { className: 'rtk-check-row', 'data-rtk-check': item.id }, kids))
        }
        content = h('div', { className: 'rtk-checks' }, rows)
      } else if (st.status === 'idle') {
        content = h('div', { className: 'rtk-row rtk-content-row' }, h('span', { className: 'rtk-muted' }, '尚未检查'))
      } else if (st.status === 'loading') {
        content = h('div', { className: 'rtk-row rtk-content-row' }, h('span', { className: 'rtk-muted' }, '检查中…'))
      } else {
        content = stateLine(st, 'retry-health', onRun)
      }
      return h('section', { className: 'rtk-block', 'data-rtk-block': 'health' },
        h('div', { className: 'rtk-row rtk-title-row' },
          h('span', { className: 'rtk-block-title' }, '功能健康'),
          h('span', { className: 'rtk-meta' }, meta)),
        content,
        h('div', { className: 'rtk-row rtk-action-row' },
          h('button', { type: 'button', className: 'rtk-btn', 'data-rtk-action': 'run-health', disabled: st.status === 'loading', onClick: onRun },
            st.status === 'loading' ? '检查中…' : '运行检查')))
    }

    /** 设置节贡献组件（owner props {close}）：状态全在此、子渲染纯函数无钩子 */
    function RtkKitSection() {
      var gainPair = react.useState({ status: 'loading', data: null, error: null })
      var versionPair = react.useState({ status: 'idle', data: null, error: null })
      var healthPair = react.useState({ status: 'idle', data: null, error: null })
      var periodPair = react.useState('all')

      function request(setter, url, init) {
        setter({ status: 'loading', data: null, error: null })
        Promise.resolve()
          .then(function () { return exports.__fetch(url, init) })
          .then(function (res) { return res.json() })
          .then(function (body) {
            if (body && body.error) { setter({ status: 'error', data: null, error: normalizeError(body.error) }); return }
            setter({ status: 'ok', data: body && body.data !== undefined ? body.data : null, error: null })
          })
          .catch(function (e) { setter({ status: 'error', data: null, error: { kind: 'error', text: String((e && e.message) || e) } }) })
      }
      function loadGain() { request(gainPair[1], URL_GAIN) }
      function loadVersion() { request(versionPair[1], URL_VERSION) }
      function loadHealth() { request(healthPair[1], URL_HEALTH, { method: 'POST', body: '{}' }) }
      react.useEffect(function () { loadGain() }, [])

      return h('div', { className: 'rtk-kit', 'data-dsh-plugin': 'dsh-rtk-kit' },
        h('div', { className: 'rtk-page-head' },
          h('h1', { className: 'rtk-title' }, 'RTK Kit'),
          h('span', { className: 'rtk-crumb' }, 'rtk 输出压缩工具包')),
        versionBlock(versionPair[0], loadVersion),
        gainBlock(gainPair[0], periodPair[0], periodPair[1], loadGain),
        healthBlock(healthPair[0], loadHealth))
    }

    /**
     * 注册面（INV-1/ADR-001）：settings.section 独立菜单项「RTK Kit」。
     * 缺槽 fail-open（壳未声明设置页则该面缺席不炸装载）；disposer 收敛不抛。
     */
    function apply(ctx) {
      var disposers = []
      try {
        disposers.push(ctx.slots.inject('settings.section', function setup() {
          try {
            return ctx.slots.register({ name: 'settings.section', id: 'rtk-kit', order: 40, label: function label() { return 'RTK Kit' } }, RtkKitSection)
          } catch (e) {
            try { if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-rtk-kit] settings.section 注册失败：' + String((e && e.message) || e)) } catch { /* 日志缺位不抛 */ }
            return function noop() {}
          }
        }))
      } catch (e) {
        try { if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-rtk-kit] 客户端面注册失败：' + String((e && e.message) || e)) } catch { /* 同上 */ }
      }
      return function dispose() {
        for (var i = 0; i < disposers.length; i++) {
          try { if (typeof disposers[i] === 'function') disposers[i]() } catch { /* 收敛不抛 */ }
        }
        disposers.length = 0
      }
    }

    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
