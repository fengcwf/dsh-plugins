// dsh-github-ops/gh-auth.js —— GitHub 认证纯逻辑收编（可单测）：
//   makeRunGh 统一执行器 + parseHostsMeta/listAccounts 状态投影 + probeAccess 三段探针
//   + switchActive 切换 + writeToken（stdin 写入）+ redact 凭据擦除。
// 设计来源：
//   forge probeAccount      —— 三段探针 + 分级 hint（401/403/429/超时）
//   git-remotes redact 形   —— remote URL 凭据擦除
//   changes/.../reports/gh-auth-token-write-shape.md —— `gh auth login --with-token` 失败形实测钉死（R-1）
// 安全纪律（INV 级，宪法 P-5/P-6/P-10）：
//   token 只经 stdin 进 gh（argv/返回值零明文）；不新增任何凭据存储（hosts.yml 单一认证源）；
//   hosts.yml 解析只判 oauth_token 在位、绝不读取 token 值；消息/返回值一律经 redact + stdin 精确擦除。
import { spawnSync } from 'node:child_process'

export const DEFAULT_PROBE_TIMEOUT_MS = 3000
export const REDACTED = '[REDACTED]'
const MAX_BUFFER = 4 * 1024 * 1024

// ── 凭据擦除（INV-1）：git remote URL userinfo + token 形态串 ──
function redactTokens(s) {
  return String(s ?? '')
    .replace(/gh[pousr]_[A-Za-z0-9_]{16,}/g, REDACTED)
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, REDACTED)
}
export function redact(text) {
  // F-9：userinfo 用 [^/\s]*@ —— 含 @ 的 userinfo 全擦；不跨 /，路径邮箱安全
  return redactTokens(String(text ?? '').replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s]*@/gi, '$1'))
}

// ── 统一执行器：token 一律 stdin 传递，env 恒定且剔除 GH_TOKEN/GITHUB_TOKEN/GH_ENTERPRISE_TOKEN/GH_HOST（P-6 单一凭据源），输出有界且零明文 ──
export function makeRunGh({ ghBin = 'gh', timeoutMs = 60000 } = {}) {
  return function runGh(argv, opts = {}) {
    const stdin = opts.stdin == null ? '' : String(opts.stdin)
    const secret = stdin.trim() === '' ? null : stdin.trim()
    const t0 = Date.now()
    // P-6 单一凭据源：GH_TOKEN/GITHUB_TOKEN/GH_ENTERPRISE_TOKEN/GH_HOST 是 hosts.yml 之外的隐形第二凭据源
    //（gh 的 env token 优先级高于 hosts.yml，会顶包「保存后立即验证」US-2）——执行器 env 一律剔除这四键，
    // ghHost/账号选择只走 argv 与 hosts.yml，永不走 env
    const env = { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', PAGER: 'cat' }
    delete env.GH_TOKEN
    delete env.GITHUB_TOKEN
    delete env.GH_ENTERPRISE_TOKEN
    delete env.GH_HOST
    const r = spawnSync(ghBin, argv.map(String), {
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? timeoutMs,
      maxBuffer: MAX_BUFFER,
      input: stdin,
      env,
    })
    // 返回值零明文（INV-1/F-2）：stdin 秘密精确擦除 + token 形态扫描；
    // stdout 保真（URL 凭据擦除属 redact() 层职责，展示/投影边界由调用方 redact）；stderr 全量 redact
    const scrubSecret = (t) => (secret ? String(t ?? '').split(secret).join(REDACTED) : String(t ?? ''))
    return {
      stdout: redactTokens(scrubSecret(r.stdout)),
      stderr: redact(scrubSecret(r.stderr)),
      status: r.status ?? 1,
      elapsedMs: Date.now() - t0,
      timedOut: r.error?.code === 'ETIMEDOUT',
      errorCode: r.error?.code ?? null,
    }
  }
}

// ── hosts.yml 元数据投影：行级解析（不引 YAML 库，P-4），oauth_token 只判在位 ──
export function parseHostsMeta(yamlText) {
  const hosts = []
  let host = null
  let currentUser = null
  const stack = []
  for (const raw of String(yamlText ?? '').split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue
    const indent = /^ */.exec(raw)[0].length
    // 序列项（生产真实形 users: → `- login`）：无冒号行，走 users 上下文
    const seq = /^-\s+(.+)$/.exec(raw.trim())
    if (seq) {
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop()
      const parent = stack.length ? stack[stack.length - 1] : null
      const login = seq[1].trim().replace(/^(['"])(.*)\1$/, '$2')
      if (parent?.kind === 'users' && host && login) host.users.push({ login, hasToken: false })
      continue
    }
    const m = /^([^:\s][^:]*):(?:\s*(.*))?$/.exec(raw.trim())
    if (!m) continue
    const key = m[1].trim()
    const value = (m[2] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack.length ? stack[stack.length - 1] : null
    if (!parent) {
      host = { host: key, user: null, activeAccount: null, gitProtocol: null, hasToken: false, users: [] }
      hosts.push(host)
      currentUser = null
      stack.push({ indent, kind: 'host' })
    } else if (parent.kind === 'host') {
      if (key === 'users') stack.push({ indent, kind: 'users' })
      else if (key === 'user') host.user = value || null
      else if (key === 'active_account') host.activeAccount = value || null
      else if (key === 'git_protocol') host.gitProtocol = value || null
      else if (key === 'oauth_token') host.hasToken = true // 只判在位（INV-1）
    } else if (parent.kind === 'users') {
      currentUser = { login: key, hasToken: false }
      host.users.push(currentUser)
      stack.push({ indent, kind: 'user' })
    } else if (parent.kind === 'user') {
      if (key === 'oauth_token') currentUser.hasToken = true // 只判在位（INV-1）
    }
  }
  // 投影归一（F-1）：user 补录/合成 + active_account 仅匹配已知 login 才认（生产形值='true'）+ token 在位归因
  for (const h of hosts) {
    const known = new Set(h.users.map((u) => u.login))
    if (h.user && !known.has(h.user)) { h.users.push({ login: h.user, hasToken: false }); known.add(h.user) }
    if (!h.users.length && h.activeAccount) h.users.push({ login: h.activeAccount, hasToken: false })
    h.activeAccount = known.has(h.activeAccount) ? h.activeAccount : (known.has(h.user) ? h.user : (h.users[0]?.login ?? null))
    for (const u of h.users) u.hasToken = Boolean(u.hasToken || (u.login === h.activeAccount && h.hasToken))
  }
  return { hosts }
}

// ── 账号投影：{login,active,configured,verified}（不读 token 值）──
export function listAccounts(metaOrText, { verified } = {}) {
  const meta = typeof metaOrText === 'string' ? parseHostsMeta(metaOrText) : (metaOrText ?? { hosts: [] })
  const vset = verified instanceof Set ? verified : new Set(Array.isArray(verified) ? verified : verified ? [verified] : [])
  const accounts = []
  const seen = new Set()
  for (const host of meta.hosts ?? []) {
    // F-1：users 空/缺时从 user 字段合成；active_account 匹配已知 login 才认，否则回退 user
    const users = host.users?.length ? host.users : (host.user ? [{ login: host.user, hasToken: host.hasToken }] : [])
    const known = new Set(users.map((u) => u.login))
    const activeLogin = known.has(host.activeAccount) ? host.activeAccount : (host.user ?? null)
    for (const user of users) {
      if (!user?.login || seen.has(user.login)) continue
      seen.add(user.login)
      const active = user.login === activeLogin
      accounts.push({
        login: user.login,
        active,
        configured: Boolean(user.hasToken || (active && host.hasToken)),
        verified: vset.has(user.login),
      })
    }
  }
  return accounts
}

// ── 错误分级（US-6 / INV-10）：GHO-<STAGE>-<NN>，hint 面=401/403/429/超时/gh 缺失/写入失败 ──
const KINDS = {
  timeout: { nn: '01', hint: (o) => `执行超时（>${o.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS}ms）：网络慢或 gh 卡住，可调大 probeTimeoutMs 后重试` },
  missing: { nn: '02', hint: () => '未找到 gh CLI（ENOENT）：请先安装 GitHub CLI' },
  unauthorized: { nn: '03', hint: () => 'token 无效或已过期：请在设置栏目更新 token' },
  forbidden: { nn: '04', hint: () => '权限不足：token 缺少所需 scope 或被组织策略限制' },
  ratelimit: { nn: '05', hint: () => 'API 限额耗尽：请等待限额 reset 后重试' },
  write: { nn: '06', hint: () => '写入失败：token 未写入 hosts.yml，请检查 token 形态（ghp_/gho_/github_pat_ 开头）后重试' },
  notconfigured: { nn: '07', hint: () => '本地无已登录账号：请先在设置栏目录入 token' },
  unsupported: { nn: '08', hint: () => '当前 gh 版本不支持该命令（需 gh ≥2.20）：请在终端手工执行 gh auth switch 切换 active 账号' },
  unknown: { nn: '99', hint: () => '未知错误：请结合 message 归因' },
}

function httpStatusOf(text) {
  const m = /HTTP[^\d]*(\d{3})/i.exec(text)
  if (m) return Number(m[1])
  if (/bad credentials|authentication fail|unauthorized/i.test(text)) return 401
  if (/forbidden/i.test(text)) return 403
  if (/rate limit|too many requests/i.test(text)) return 429
  return null
}
const kindOfStatus = (status) => ({ 401: 'unauthorized', 403: 'forbidden', 429: 'ratelimit' }[status] ?? null)
const firstLine = (t) => String(t ?? '').trim().split('\n')[0] ?? ''

function failResult(stage, kind, o = {}) {
  const k = KINDS[kind] ?? KINDS.unknown
  return {
    ok: false,
    stage,
    code: `GHO-${stage.toUpperCase()}-${k.nn}`,
    status: o.status ?? null,
    login: o.login ?? null,
    message: redact(o.message ?? ''),
    elapsedMs: o.elapsedMs ?? 0,
    hint: o.hint ?? k.hint(o),
    quota: null,
  }
}

function okResult(stage, o = {}) {
  return {
    ok: true, stage, code: null, status: o.status ?? 200, login: o.login ?? null,
    message: redact(o.message ?? ''), elapsedMs: o.elapsedMs ?? 0, hint: null, quota: o.quota ?? null,
  }
}

function classifyRun(stage, r, o = {}) {
  const ctx = { ...o, timeoutMs: o.timeoutMs }
  if (r.timedOut) return failResult(stage, 'timeout', { ...ctx, message: `执行超时（>${ctx.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS}ms）`, elapsedMs: o.elapsedMs ?? r.elapsedMs })
  if (r.errorCode === 'ENOENT') return failResult(stage, 'missing', { ...ctx, message: '未找到 gh CLI', elapsedMs: o.elapsedMs ?? r.elapsedMs })
  const status = httpStatusOf(r.stderr)
  const kind = kindOfStatus(status) ?? (stage === 'token' ? 'write' : 'unknown')
  return failResult(stage, kind, { ...ctx, status, message: firstLine(r.stderr) || `gh 退出码 ${r.status}`, elapsedMs: o.elapsedMs ?? r.elapsedMs })
}

// ── 写 token（ADR-003）：`gh auth login --with-token` 只经 stdin；空 token 拒绝执行（R-1 实测陷阱）──
export function writeToken(token, opts = {}) {
  const t = typeof token === 'string' ? token.trim() : ''
  const runGh = opts.runGh ?? makeRunGh({ ghBin: opts.ghBin ?? 'gh', timeoutMs: opts.timeoutMs ?? 60000 })
  if (!t) return failResult('token', 'write', { message: 'token 为空：留空=不修改，未执行任何写入' })
  const r = runGh(['auth', 'login', '--with-token'], { stdin: t, timeoutMs: opts.timeoutMs })
  if (r.status === 0 && !r.timedOut && !r.errorCode) {
    return okResult('token', { message: 'token 已经 stdin 写入 hosts.yml（单一认证源）', elapsedMs: r.elapsedMs })
  }
  return classifyRun('token', r, { timeoutMs: opts.timeoutMs })
}

// ── 三段探针（ADR-004）：local-config → auth-connect → latency-quota（墙钟 elapsedMs 贯通）──
export function probeAccess(opts = {}) {
  const probeTimeoutMs = opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const runGh = opts.runGh ?? makeRunGh({ ghBin: opts.ghBin ?? 'gh', timeoutMs: probeTimeoutMs })
  const t0 = Date.now()
  const elapsedMs = () => Date.now() - t0
  let login = null
  const fail = (stage, r) => classifyRun(stage, r, { timeoutMs: probeTimeoutMs, elapsedMs: elapsedMs(), login })

  // ① local-config：gh auth status --json hosts（--json 下退出码恒 0，判据=JSON state/hosts 在位）
  const r1 = runGh(['auth', 'status', '--json', 'hosts'], { timeoutMs: probeTimeoutMs })
  if (r1.status !== 0 || r1.timedOut || r1.errorCode) return fail('local-config', r1)
  let hostsJson
  try { hostsJson = JSON.parse(r1.stdout) } catch { return failResult('local-config', 'unknown', { message: 'gh auth status 输出无法解析为 JSON', elapsedMs: elapsedMs() }) }
  const entries = Object.values(hostsJson?.hosts ?? {}).flat().filter((e) => e && e.login)
  if (!entries.length) return failResult('local-config', 'notconfigured', { message: '本地无已登录账号（hosts 为空）', elapsedMs: elapsedMs() })
  const active = entries.find((e) => e.active) ?? entries[0]
  login = active.login ?? null
  const stateNote = entries.filter((e) => e.state && e.state !== 'active')
    .map((e) => `${e.host ?? '?'} state=${e.state}${e.error ? `（${firstLine(e.error)}）` : ''}`).join('；')

  // ② auth-connect：gh api user（401=坏 token，归因落此段，对齐 ADR-004）
  const r2 = runGh(['api', 'user'], { timeoutMs: probeTimeoutMs })
  if (r2.status !== 0 || r2.timedOut || r2.errorCode) return fail('auth-connect', r2)
  try { const u = JSON.parse(r2.stdout); if (u?.login) login = u.login } catch { /* login 用①的投影 */ }

  // ③ latency-quota：gh api rate_limit + 墙钟
  const r3 = runGh(['api', 'rate_limit'], { timeoutMs: probeTimeoutMs })
  if (r3.status !== 0 || r3.timedOut || r3.errorCode) return fail('latency-quota', r3)
  let quota = null
  try {
    const res = JSON.parse(r3.stdout)?.resources ?? {}
    const pick = (x) => (x ? { limit: x.limit ?? null, remaining: x.remaining ?? null, reset: x.reset ?? null } : null)
    quota = { core: pick(res.core), search: pick(res.search) }
  } catch { /* quota 保持 null */ }
  return okResult('latency-quota', {
    login,
    message: `三段探针通过${stateNote ? `；本地 state 备注：${redact(stateNote)}` : ''}`,
    elapsedMs: elapsedMs(),
    quota,
  })
}

// ── 切换 active（ADR-005 / R-3）：gh auth switch；不可用则降级提示手工切换 ──
export function switchActive(login, opts = {}) {
  const user = typeof login === 'string' ? login.trim() : ''
  const runGh = opts.runGh ?? makeRunGh({ ghBin: opts.ghBin ?? 'gh', timeoutMs: opts.timeoutMs ?? 60000 })
  if (!user) return failResult('switch', 'write', { message: 'login 为空：未执行切换', hint: 'login 为空：未执行切换，请提供目标账号 login' })
  const r = runGh(['auth', 'switch', '--user', user], { timeoutMs: opts.timeoutMs })
  if (r.status === 0 && !r.timedOut && !r.errorCode) {
    return okResult('switch', { login: user, message: `已切换 active 账号为 ${user}`, elapsedMs: r.elapsedMs })
  }
  if (/unknown (command|flag)|unrecognized|unsupported/i.test(r.stderr)) {
    return failResult('switch', 'unsupported', { login: user, message: firstLine(r.stderr), elapsedMs: r.elapsedMs })
  }
  return classifyRun('switch', r, { login: user, timeoutMs: opts.timeoutMs })
}
