// lib/client.ui.project.js — dsh-github-ops UI 投影层（client.ui.* 兄弟 chunk，F-scan-1 渲染族）。
// 纯函数投影（零 DOM 零取数）：结构化响应 → 视图模型片段（分级错误卡 / 三段检验行 / 限额可视化 / 自检三段行）。
// 显示边界（INV-1/INV-10/合同 1）：只读白名单结构化字段（code/status/message/hint/quota/elapsedMs），
//   绝不读取 stderr 等原始串、不拼接任何 URL/token 明文；分级不依赖 HTTP 状态（合同 9：ok:false + code 归因）。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  chunk: 'client.ui.project.js',
  factory: () => {
    var module = { exports: {} }
    var exports = module.exports

    // —— 分级错误卡（INV-10）：code 尾段归因（gh-auth 分级同口径 01..08/99）+ HTTP 契约违例归因 ——
    var LABEL_BY_NN = {
      '01': '执行超时', '02': 'gh 未安装', '03': 'token 无效', '04': '权限不足',
      '05': 'API 限额耗尽', '06': '写入失败', '07': '未配置', '08': '不支持', '99': '未知错误',
    }
    var LABEL_BY_HTTP = {
      400: '请求被拒', 401: '未登录', 403: '来源受限', 404: '路径不存在', 405: '方法不支持', 500: '服务内部错误',
    }
    var HINT_BY_HTTP = {
      400: '请求不合法：请刷新页面后重试', 401: '未登录或登录已过期：请先登录 dsh web',
      403: '请求来源非法（信任围栏）：仅允许同源/回环请求', 404: '不提供该路径：请升级插件后重试',
      405: '不支持的请求方法', 500: '服务内部错误：请查看 dsh 日志',
    }

    function labelOf(code, status) {
      if (code && code.indexOf('GHO-AUTH-') === 0) return status === 401 ? '未登录' : '来源受限'
      if (code && code.indexOf('GHO-ROUTE-') === 0) return LABEL_BY_HTTP[status] ?? '请求被拒'
      var m = /-(\d\d)$/.exec(code ?? '')
      return (m ? LABEL_BY_NN[m[1]] : null) ?? LABEL_BY_HTTP[status] ?? (status >= 500 ? '服务内部错误' : status >= 400 ? '请求被拒' : '未知错误')
    }
    function hintByStatus(status) {
      return HINT_BY_HTTP[status] ?? (status >= 500 ? '服务内部错误：请查看 dsh 日志' : status >= 400 ? '请求被拒：请刷新页面后重试' : '请结合提示归因后重试；持续失败请查看 dsh 日志')
    }

    /** 结构化失败 → 分级错误卡模型（title=「状态 · 归因」，hint=修复指引）；只取白名单字段 */
    function gradeFailure(resp) {
      if (!resp || resp.transport) {
        return { code: null, status: null, title: '网络请求失败', message: String((resp && resp.message) ?? '本地服务未响应'), hint: '本地服务未响应：请刷新页面后重试；若持续失败请查看 dsh 日志' }
      }
      var code = typeof resp.code === 'string' ? resp.code : null
      var status = typeof resp.status === 'number' ? resp.status : null
      return {
        code: code,
        status: status,
        title: (status === null ? '' : status + ' · ') + labelOf(code, status),
        message: String(resp.message ?? ''),
        hint: String(resp.hint ?? hintByStatus(status)),
      }
    }

    /** 限额可视化：remaining/limit（形如 4995 / 5000）+ reset 时间文案 */
    function formatReset(reset) {
      if (typeof reset !== 'number' || !Number.isFinite(reset) || reset <= 0) return '未提供'
      var d = new Date(reset * 1000)
      if (Number.isNaN(d.getTime())) return '未提供'
      var hh = String(d.getHours()).padStart(2, '0')
      var mm = String(d.getMinutes()).padStart(2, '0')
      if (d.toDateString() === new Date().toDateString()) return hh + ':' + mm + '（今天）'
      return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + hh + ':' + mm
    }
    function formatQuota(quota) {
      var core = quota && quota.core ? quota.core : null
      if (!core || typeof core.remaining !== 'number') return null
      return {
        remaining: core.remaining,
        limit: typeof core.limit === 'number' ? core.limit : null,
        text: core.remaining + ' / ' + (core.limit ?? '?'),
        resetText: formatReset(core.reset),
      }
    }

    // —— 三段检验行（US-3）：probeAccess 单结果 → 逐段行（前序=已过，末段=判定，其后=未执行）——
    var CHECK_STAGES = [
      { key: 'local-config', label: '本地配置', passed: '配置文件解析正常', mono: false },
      { key: 'auth-connect', label: '认证连通', passed: 'gh api /user → 200', mono: true },
      { key: 'latency-quota', label: '延迟 · 限额', passed: null, mono: true },
    ]
    function checkRows(result, quota) {
      var idx = 0
      for (var i = 0; i < CHECK_STAGES.length; i++) if (CHECK_STAGES[i].key === result.stage) { idx = i; break }
      return CHECK_STAGES.map(function (s, i) {
        var st = i < idx ? 'passed' : i > idx ? 'pending' : (result.ok === true ? 'passed' : 'failed')
        var detail
        if (st === 'pending') detail = '未执行'
        else if (st === 'failed') detail = String(result.message ?? '未通过')
        else if (s.passed) detail = s.passed
        else detail = String(result.elapsedMs ?? 0) + 'ms · ' + (quota ? quota.remaining + '/' + quota.limit : '限额未知')
        return { key: s.key, label: s.label, state: st, detail: detail, mono: s.mono }
      })
    }

    /** 插件自检三段行（US-7）：配置合成 / gh 可用 / 凭据在位 */
    function healthRows(sections) {
      var s = sections && typeof sections === 'object' ? sections : {}
      var config = s.config ?? {}
      var ghs = s.gh ?? {}
      var cred = s.credentials ?? {}
      return [
        { key: 'config', label: '配置合成', ok: config.ok === true, detail: String(config.message ?? (config.ok === true ? '配置合成复检通过' : '未通过')), hint: config.hint ?? null },
        { key: 'gh', label: 'gh 可用', ok: ghs.ok === true, detail: ghs.ok === true ? (ghs.version ? String(ghs.version) + ' 在位' : String(ghs.message ?? 'gh CLI 可用')) : String(ghs.message ?? '未通过'), hint: ghs.hint ?? null },
        { key: 'credentials', label: '凭据在位', ok: cred.ok === true, detail: cred.ok === true ? (cred.active ? 'token 已加载' : 'hosts.yml 在位') : String(cred.message ?? '未通过'), hint: cred.hint ?? null },
      ]
    }

    exports.gradeFailure = gradeFailure
    exports.formatQuota = formatQuota
    exports.formatReset = formatReset
    exports.checkRows = checkRows
    exports.healthRows = healthRows
    return module.exports
  },
})
