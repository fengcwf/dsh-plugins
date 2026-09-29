// settings-routes —— dsh-github-ops 设置栏目数据面（ADR-002 合约逐条对齐）：ctx.webServer.register({kind:'prefix',
// path:'/api/github-ops'}) 单 prefix 注册 + 内部分发 8 端点：
//   GET /status 本地认证状态投影（hosts.yml→parseHostsMeta/listAccounts，零明文零网络）| POST /token stdin 写入（留空=不修改，
//   INV-4 路由兜底+writeToken 拒空双保险；API 面无删除/登出端点，P-8）| POST /check 三段探针（probeTimeoutMs 逐段透传，ADR-004）
//   GET /accounts 多账号投影（ADR-005）| POST /accounts/verify 逐账号验证（auth status --json hosts 的 per-account state，
//   零破坏）| POST /accounts/switch 切换 active | GET /repo-context 仓库上下文卡（git+gh api 摘要，TTL≤30s 缓存+fail-open，
//   ADR-006）| GET /health 三段自检（配置合成 Config.parse 复检 / gh 可用 / 凭据在位，ADR-007）
// 契约（生产先例 kb-context/lib/settings-routes.js 同形，别猜）：① 每个 handler 首行 connection.requestRejection(request)
//   鉴权缝（INV-3）：未过缝=HTTP 401/403 + 结构化形；② 请求体 ≤1MiB 有界（超限拒）；请求字段 zod strictObject 白名单整单拒
//   （INV-1）；③ 响应恒为结构化形 {ok,stage,code,status,login,message,elapsedMs,hint,quota,...payload}（INV-10）：业务结果
//   （含 gh 侧失败）一律 HTTP 200 + ok:false 归因投影，HTTP 4xx/5xx 只表达传输/契约违例（401/403 鉴权、400 请求体/白名单、
//   405 方法、404 路径、500 内部）；④ 错误码 GHO-<STAGE>-<NN>：业务段沿 gh-auth 分级（01 超时/02 gh 缺失/03 401/04 403/05 429/
//   06 写入失败/07 未配置/08 不支持/99 未知），路由契约段 GHO-AUTH-01|02、GHO-ROUTE-01..05|99（01 畸形体/02 超 1MiB/03 白名单/
//   04 方法/05 路径/99 内部）；⑤ 出边界零明文（INV-1/INV-10/P-5）：sendJson 对整棵响应树逐串 redact()（URL userinfo + token/PAT
//   形态），投影层再显式 redact（双保险）；stderr 敏感串不透传。
// 模块形（kb-context 先例形 registerSettingsRoutes(deps) → disposer[]，交 ctx.effect 收敛）：deps: { register, connection,
//   Config|recheckConfig, getConfig|config, ghAuth?, runGh?, readHosts?, runGit?, workspaceDir?, cacheTtlMs?, warn? }；缝缺位
//   =数据面缺席不炸（INV-6 fail-open）。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import * as ghAuth from './gh-auth.js'

export const API_PREFIX = '/api/github-ops'
const JSON_TYPE = 'application/json; charset=utf-8'
const MAX_BODY_BYTES = 1 << 20 // INV-1：请求体 1MiB 有界
const REPO_TTL_MAX_MS = 30_000 // ADR-006：TTL ≤30s 防点刷

const NN = { timeout: '01', missing: '02', unauthorized: '03', forbidden: '04', ratelimit: '05', write: '06', notconfigured: '07', unsupported: '08', unknown: '99' }
const HINT = {
  timeout: '执行超时：网络慢或 gh 卡住，可调大 probeTimeoutMs 后重试',
  missing: '未找到 gh CLI（ENOENT）：请先安装 GitHub CLI',
  unauthorized: 'token 无效或已过期：请在设置栏目更新 token',
  forbidden: '权限不足：token 缺少所需 scope 或被组织策略限制',
  ratelimit: 'API 限额耗尽：请等待限额 reset 后重试',
  notconfigured: '本地无已登录账号/上下文：请先在设置栏目录入 token',
  unknown: '未知错误：请结合 message 归因',
}
// 路由契约段（method/notfound 已内联在 methodGuard/dispatcher）；业务段失败走 failRun（gh-auth 分级同口径）
const CONTRACT = {
  badjson: ['01', 400, '请求体不是合法 JSON'], toolarge: ['02', 400, '请求体超过 1MiB 上限'],
  whitelist: ['03', 400, '请求字段不在白名单（整单拒）'], internal: ['99', 500, '内部错误'],
}
class KError extends Error { constructor(kind, msg) { super(msg ?? kind); this.kind = kind } } // message 用户可见：抛点显式中文文案；e.message===kind 时 internal 回落 CONTRACT（M-1）

// ── 结构化形 + 出边界零明文（INV-1/INV-10）──
function shape(stage, fields = {}) {
  return { ok: false, stage, code: null, status: null, login: null, message: '', elapsedMs: 0, hint: null, quota: null, ...fields }
}
const adopt = (r, extra = {}) => shape(r.stage, {
  ok: r.ok, code: r.code, status: r.status, login: r.login, message: r.message, elapsedMs: r.elapsedMs, hint: r.hint, quota: r.quota, ...extra,
})
const scrub = (v) => (Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) : typeof v === 'string' ? ghAuth.redact(v) : v)
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(scrub(body))) // 出边界统一 redact（URL userinfo + token 形态）
}
const firstLine = (t) => String(t ?? '').trim().split('\n')[0] ?? ''
const httpOf = (r) => { const m = /HTTP[^\d]*(\d{3})/i.exec(r?.stderr ?? ''); return m ? Number(m[1]) : null }
const kindOfRun = (r) => (r?.timedOut ? 'timeout' : r?.errorCode === 'ENOENT' ? 'missing'
  : /\bHTTP[^\d]*401\b|bad credentials|authentication fail|unauthorized/i.test(r?.stderr ?? '') ? 'unauthorized'
  : /\bHTTP[^\d]*403\b|forbidden/i.test(r?.stderr ?? '') ? 'forbidden' : /\bHTTP[^\d]*429\b|rate limit|too many requests/i.test(r?.stderr ?? '') ? 'ratelimit' : 'unknown')
// 路由自有业务段的同形失败构造（gh-auth 未导出 failResult，不扩其接口；分级 hint 与 gh-auth 同口径）
const failRun = (stage, r, kind) => {
  const k = kind ?? kindOfRun(r)
  return shape(stage, { code: `GHO-${stage.toUpperCase()}-${NN[k]}`, status: httpOf(r), message: ghAuth.redact(firstLine(r.stderr) || `退出码 ${r.status}`), elapsedMs: r.elapsedMs ?? 0, hint: HINT[k] })
}
const BOOLISH = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off'])
const isPhantom = (login) => typeof login !== 'string' || !login || BOOLISH.has(login.toLowerCase())

export function registerSettingsRoutes(deps = {}) {
  const { register, connection, warn = () => {} } = deps
  if (typeof register !== 'function' || typeof connection?.requestRejection !== 'function') {
    warn('[github-ops] settings-routes 注册/鉴权缝缺失：数据面未注册（fail-open，INV-6）')
    return [] // 缺缝=该面缺席，绝不炸装载
  }
  const gh = deps.ghAuth ?? ghAuth
  const verified = new Set() // /accounts/verify 结果回填（内存投影，零凭据）
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d) // 类型兜底；钳制落 Task 12 Config zod
  const cfgRaw = () => (typeof deps.getConfig === 'function' ? (deps.getConfig() ?? {}) : (deps.config ?? {}))
  const cfg = () => {
    const raw = cfgRaw()
    const parsed = deps.Config ? deps.Config.safeParse(raw) : null
    const p = parsed?.success ? parsed.data : {}
    return {
      ghBin: typeof (p.ghBin ?? raw.ghBin) === 'string' && (p.ghBin ?? raw.ghBin) ? p.ghBin ?? raw.ghBin : 'gh',
      ghTimeoutMs: num(p.ghTimeoutMs ?? raw.ghTimeoutMs, 60000),
      probeTimeoutMs: num(p.probeTimeoutMs ?? raw.probeTimeoutMs, gh.DEFAULT_PROBE_TIMEOUT_MS), // 透传探针（ADR-004）
    }
  }
  const executor = () => deps.runGh ?? gh.makeRunGh({ ghBin: cfg().ghBin, timeoutMs: cfg().ghTimeoutMs })
  const readHosts = typeof deps.readHosts === 'function' ? deps.readHosts : () => {
    const path = join(process.env.GH_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || homedir(), '.config'), 'gh', 'hosts.yml')
    try { return { exists: true, path, text: readFileSync(path, 'utf8') } } catch { return { exists: false, path, text: null } }
  }
  const runGit = typeof deps.runGit === 'function' ? deps.runGit : (argv) => {
    const t0 = Date.now()
    const r = spawnSync('git', argv.map(String), { encoding: 'utf8', timeout: 10000, maxBuffer: 1 << 20, cwd: deps.workspaceDir ?? process.cwd() })
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1, elapsedMs: Date.now() - t0, timedOut: r.error?.code === 'ETIMEDOUT', errorCode: r.error?.code ?? null }
  }
  const accountsOf = (meta) => gh.listAccounts(meta, { verified }).filter((a) => !isPhantom(a.login)) // L-1 幻影 login 投影层过滤
    .map((a) => ({ login: gh.redact(a.login), active: Boolean(a.active), configured: Boolean(a.configured), verified: Boolean(a.verified) }))
  const hostsOf = (meta) => (meta.hosts ?? []).map((h) => ({ host: gh.redact(h.host ?? ''), activeAccount: isPhantom(h.activeAccount) ? null : gh.redact(h.activeAccount), gitProtocol: h.gitProtocol ?? null, hasToken: Boolean(h.hasToken), users: (h.users ?? []).length }))
  const activeOf = (meta) => accountsOf(meta).find((a) => a.active)?.login ?? null

  // ── 鉴权缝（INV-3）：每个 handler 首行调用；401/403 + 结构化形回拒 ──
  const authGate = (req, res) => {
    const rejection = connection.requestRejection(req)
    if (rejection === undefined) return true
    const status = rejection === 401 ? 401 : 403
    sendJson(res, status, shape('auth', { code: status === 401 ? 'GHO-AUTH-01' : 'GHO-AUTH-02', status, message: '未通过请求鉴权',
      hint: status === 401 ? '未登录或登录已过期：请先登录 dsh web' : '请求来源非法（信任围栏）：仅允许同源/回环请求' }))
    return false
  }
  const methodGuard = (req, res, allowed) => {
    if (allowed.includes(req.method)) return true
    res.setHeader('allow', allowed.join(', '))
    sendJson(res, 405, shape('route', { code: 'GHO-ROUTE-04', status: 405, message: `不支持 ${req.method}` }))
    return false
  }
  const internal = (res, stage, e) => {
    const kind = e?.kind && CONTRACT[e.kind] ? e.kind : 'internal'
    const [nn, http, msg] = CONTRACT[kind]
    if (kind === 'internal') warn(`[github-ops] settings-routes ${stage} 处理失败：${gh.redact(String(e?.message ?? e))}`)
    sendJson(res, http, shape(stage, { code: `GHO-ROUTE-${nn}`, status: http, message: e?.kind && e.message && e.message !== e.kind ? e.message : msg }))
  }
  const ok500 = (stage, fn) => async (req, res) => { try { await fn(req, res) } catch (e) { internal(res, stage, e) } }
  async function readBody(req) {
    const chunks = []
    let total = 0
    for await (const chunk of req) {
      total += Buffer.byteLength(chunk)
      if (total > MAX_BODY_BYTES) throw new KError('toolarge', CONTRACT.toolarge[2]) // 有界读取，绝不整包进内存（M-1：显式中文文案）
      chunks.push(Buffer.from(chunk))
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text.trim()) return {}
    try { return JSON.parse(text) } catch { throw new KError('badjson', CONTRACT.badjson[2]) } // M-1：显式中文文案
  }
  const parseBody = (schema, body) => {
    const r = schema.safeParse(body)
    if (r.success) return r.data
    const where = r.error.issues.map((i) => (i.keys ? i.keys.join(',') : i.path.join('.') || '(root)')).join('、')
    throw new KError('whitelist', `${CONTRACT.whitelist[2]}：${where}`)
  }
  const TOKEN_SCHEMA = z.strictObject({ token: z.string().optional() }), EMPTY_SCHEMA = z.strictObject({}), VERIFY_SCHEMA = z.strictObject({ logins: z.array(z.string()).optional() }), SWITCH_SCHEMA = z.strictObject({ login: z.string() })

  // GET /status —— 本地认证状态投影（无网络）
  const statusHandler = ok500('status', async (req, res) => {
    if (!authGate(req, res)) return // 首行鉴权（INV-3）
    if (!methodGuard(req, res, ['GET'])) return
    const t0 = Date.now()
    const h = readHosts()
    if (!h.exists || !h.text) return sendJson(res, 200, shape('status', { code: 'GHO-STATUS-07', message: '本地无凭据文件（hosts.yml 不存在）', elapsedMs: Date.now() - t0, hint: HINT.notconfigured }))
    const meta = gh.parseHostsMeta(h.text)
    sendJson(res, 200, shape('status', { ok: true, login: activeOf(meta), message: '本地认证状态投影（零明文）', elapsedMs: Date.now() - t0, hosts: hostsOf(meta), accounts: accountsOf(meta) }))
  })
  // POST /token —— 「留空=不修改」路由层兜底（INV-4；writeToken 拒空=双保险），只经 stdin（P-5）
  const tokenHandler = ok500('token', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    const t0 = Date.now()
    const { token } = parseBody(TOKEN_SCHEMA, await readBody(req))
    const t = typeof token === 'string' ? token.trim() : ''
    if (!t) return sendJson(res, 200, shape('token', { ok: true, message: 'token 为空：留空=不修改，未触碰既有凭据', elapsedMs: Date.now() - t0, noop: true }))
    sendJson(res, 200, adopt(gh.writeToken(t, { runGh: executor(), timeoutMs: cfg().ghTimeoutMs }), { noop: false }))
  })
  // POST /check —— 三段探针（probeTimeoutMs 逐段透传）
  const checkHandler = ok500('check', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    parseBody(EMPTY_SCHEMA, await readBody(req))
    sendJson(res, 200, adopt(gh.probeAccess({ runGh: executor(), probeTimeoutMs: cfg().probeTimeoutMs })))
  })
  // GET /accounts —— 多账号投影
  const accountsHandler = ok500('accounts', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    const t0 = Date.now()
    const h = readHosts()
    if (!h.exists || !h.text) return sendJson(res, 200, shape('accounts', { code: 'GHO-ACCOUNTS-07', message: '本地无凭据文件（hosts.yml 不存在）', elapsedMs: Date.now() - t0, hint: HINT.notconfigured }))
    const meta = gh.parseHostsMeta(h.text)
    sendJson(res, 200, shape('accounts', { ok: true, login: activeOf(meta), message: '多账号投影（零明文）', elapsedMs: Date.now() - t0, hosts: hostsOf(meta), accounts: accountsOf(meta) }))
  })
  // POST /accounts/verify —— 逐账号验证（gh auth status --json hosts 的 per-account state；不切换、不读 token）
  const verifyHandler = ok500('verify', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    const t0 = Date.now()
    const { logins } = parseBody(VERIFY_SCHEMA, await readBody(req))
    const h = readHosts()
    if (!h.exists || !h.text) return sendJson(res, 200, shape('verify', { code: 'GHO-VERIFY-07', message: '本地无凭据文件（hosts.yml 不存在）', elapsedMs: Date.now() - t0, hint: HINT.notconfigured }))
    const meta = gh.parseHostsMeta(h.text)
    const wanted = Array.isArray(logins) && logins.length ? logins : accountsOf(meta).map((a) => a.login)
    const r = executor()(['auth', 'status', '--json', 'hosts'], { timeoutMs: cfg().probeTimeoutMs })
    if (r.status !== 0 || r.timedOut || r.errorCode) return sendJson(res, 200, failRun('verify', r))
    let entries = []
    try { entries = Object.values(JSON.parse(r.stdout)?.hosts ?? {}).flat().filter((e) => e && e.login) } catch { throw new KError('internal', 'gh auth status 输出无法解析为 JSON') }
    const accounts = wanted.map((login) => {
      const e = entries.find((x) => x.login === login)
      const item = { login: gh.redact(String(login)), verified: e?.state === 'success', state: e?.state ?? 'missing', error: e?.error ? gh.redact(firstLine(e.error)) : null }
      if (item.verified) verified.add(item.login); else verified.delete(item.login) // 回填 /accounts 投影
      return item
    })
    sendJson(res, 200, shape('verify', { ok: true, message: '逐账号验证完成（gh auth status per-account state 判据）', elapsedMs: Date.now() - t0, accounts }))
  })
  // POST /accounts/switch —— 切换 active（gh<2.20 降级手工切换）
  const switchHandler = ok500('switch', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    const { login } = parseBody(SWITCH_SCHEMA, await readBody(req))
    sendJson(res, 200, adopt(gh.switchActive(typeof login === 'string' ? login.trim() : '', { runGh: executor(), timeoutMs: cfg().ghTimeoutMs })))
  })
  // GET /repo-context —— 仓库上下文卡（TTL≤30s 内存缓存；失败 fail-open 卡内降级）
  const repoCache = { at: 0, result: null }
  const repoHandler = ok500('repo-context', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    const t0 = Date.now()
    const ttl = Math.min(num(deps.cacheTtlMs, REPO_TTL_MAX_MS), REPO_TTL_MAX_MS) // ≤30s 硬顶（ADR-006）
    if (repoCache.result && Date.now() - repoCache.at < ttl) return sendJson(res, 200, { ...repoCache.result, cached: true })
    const rv = runGit(['remote', '-v'])
    const br = runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (rv.status !== 0 || rv.timedOut || rv.errorCode) {
      const result = failRun('repo-context', rv, /not a git repository|no such remote/i.test(rv.stderr ?? '') ? 'notconfigured' : undefined)
      repoCache.at = Date.now(); repoCache.result = result
      return sendJson(res, 200, { ...result, cached: false })
    }
    const seen = new Set()
    const remotes = []
    for (const line of String(rv.stdout ?? '').split('\n')) {
      const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim())
      if (!m || seen.has(`${m[1]} ${m[2]}`)) continue
      seen.add(`${m[1]} ${m[2]}`)
      remotes.push({ name: gh.redact(m[1]), url: gh.redact(m[2]) }) // URL userinfo 擦除（INV-1）
    }
    const repoName = remotes.map((x) => /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(x.url)).find(Boolean)
    let repo = null
    let hint = remotes.length ? 'remote 非 GitHub 主机：仅展示 git 上下文' : '本地仓库无 remote：无仓库摘要'
    if (repoName) {
      const rr = executor()(['api', `repos/${repoName[1]}/${repoName[2]}`], { timeoutMs: cfg().probeTimeoutMs })
      if (rr.status === 0 && !rr.timedOut && !rr.errorCode) {
        try {
          const d = JSON.parse(rr.stdout)
          repo = { fullName: d.full_name ?? null, stars: d.stargazers_count ?? null, issues: d.open_issues_count ?? null, defaultBranch: d.default_branch ?? null }
          hint = null
        } catch { hint = 'gh api 摘要输出无法解析（卡内降级）' }
      } else { hint = HINT[kindOfRun(rr)] }
    }
    const result = shape('repo-context', { ok: true, message: repo ? '仓库上下文（git + gh api 摘要）' : '仓库上下文（部分降级）', elapsedMs: Date.now() - t0, hint, git: { branch: gh.redact(String(br.stdout ?? '').trim()), remotes }, repo })
    repoCache.at = Date.now(); repoCache.result = result
    sendJson(res, 200, { ...result, cached: false })
  })
  // GET /health —— 三段自检（①配置合成 Config.parse 复检 ②gh 可用 ③凭据在位）
  const healthHandler = ok500('health', async (req, res) => {
    if (!authGate(req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    const t0 = Date.now()
    const recheck = (() => {
      try {
        if (typeof deps.recheckConfig === 'function') return deps.recheckConfig()
        if (!deps.Config) return { ok: false, issues: ['(未注入 Config 复检缝)'] }
        const p = deps.Config.safeParse(cfgRaw())
        return p.success ? { ok: true, switches: p.data } : { ok: false, issues: p.error.issues.map((i) => i.path.join('.') || '(root)') }
      } catch (e) { return { ok: false, issues: [gh.redact(String(e?.message ?? e))] } }
    })()
    const config = recheck.ok
      ? { ok: true, message: '配置合成复检通过', switches: Object.fromEntries(['enabled', 'enforceCommands', 'webFetchPolicy', 'registerRepoTools', 'allowDelete', 'awareness'].filter((k) => k in (recheck.switches ?? {})).map((k) => [k, recheck.switches[k]])) }
      : { ok: false, code: 'GHO-HEALTH-99', message: `配置合成复检未通过：${(recheck.issues ?? []).join('、')}`, hint: '配置非法：请修正 profile 配置后重试' }
    const g = executor()(['--version'], { timeoutMs: cfg().probeTimeoutMs })
    const gk = g.status === 0 && !g.timedOut && !g.errorCode ? null : kindOfRun(g)
    const ghSection = gk
      ? { ok: false, code: `GHO-HEALTH-${NN[gk]}`, message: gh.redact(firstLine(g.stderr) || `gh --version 退出码 ${g.status}`), hint: HINT[gk], elapsedMs: g.elapsedMs }
      : { ok: true, message: 'gh CLI 可用', version: gh.redact(firstLine(g.stdout)), elapsedMs: g.elapsedMs }
    const h = readHosts()
    const credentials = !h.exists || !h.text
      ? { ok: false, code: 'GHO-HEALTH-07', message: 'hosts.yml 不存在（本地无凭据）', hint: HINT.notconfigured, hostsPath: h.path, active: null }
      : (() => { const meta = gh.parseHostsMeta(h.text); return { ok: true, message: '凭据在位（零明文投影）', hostsPath: h.path, active: activeOf(meta), accounts: accountsOf(meta).length } })()
    const sections = { config, gh: ghSection, credentials }
    const failing = ['config', 'gh', 'credentials'].find((k) => !sections[k].ok)
    sendJson(res, 200, shape('health', { ok: !failing, code: failing ? sections[failing].code : null, message: failing ? `自检未全通过（${failing}）` : '三段自检通过', elapsedMs: Date.now() - t0, sections }))
  })

  const routes = {
    [`${API_PREFIX}/status`]: statusHandler, [`${API_PREFIX}/token`]: tokenHandler, [`${API_PREFIX}/check`]: checkHandler,
    [`${API_PREFIX}/accounts`]: accountsHandler, [`${API_PREFIX}/accounts/verify`]: verifyHandler,
    [`${API_PREFIX}/accounts/switch`]: switchHandler, [`${API_PREFIX}/repo-context`]: repoHandler, [`${API_PREFIX}/health`]: healthHandler }
  const handler = async (req, res) => {
    let p = ''
    try { p = new URL(req.url, 'http://dsh.invalid').pathname } catch { p = '' }
    const route = routes[p]
    // M-2：鉴权先行于查表回拒——未过缝不给 404 差分（防路径枚举）；过缝才如实 404（handler 内首行鉴权=INV-3 不变）
    if (!route) { if (!authGate(req, res)) return; return sendJson(res, 404, shape('route', { code: 'GHO-ROUTE-05', status: 404, message: '不提供该路径' })) }
    return route(req, res)
  }
  return [register({ kind: 'prefix', path: API_PREFIX, handler })] // disposer[] 交 ctx.effect 收敛（kb-context 先例形）
}
