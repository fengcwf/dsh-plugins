// settings-routes 数据面 integration 形测试：假 ctx（webServer/connection 缝）+ 真 handler + 真 gh-auth 归因。覆盖（验收逐条）：
// 逐路由鉴权矩阵（INV-3）、「留空=不修改」（INV-4）、1MiB 有界 + zod 白名单整单拒（INV-1）、路由输出零明文（INV-1/INV-10/P-5，
// 含 URL userinfo 形 `https://user:pass@host/x` 对抗）、错误结构化（INV-10）、probeTimeoutMs 透传（ADR-004）、repo-context
// TTL≤30s + fail-open（ADR-006）、health 三段（ADR-007）、无删除/登出端点（INV-4/P-8）、缺缝 fail-open（INV-6）。
// 安全（P-10/R-6）：凭据全为一次性假值；断言响应体零明文。
import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { z } from 'zod'
import { registerSettingsRoutes, API_PREFIX } from '../lib/settings-routes.js'

const SECRET = 'ghp_fake_route_secret_0123456789abcdef'
const SECRET_B = 'github_pat_fake_route_secret_0123456789'
const USERINFO_URL = 'https://user:pass@github.com/acme/widgets.git'
const Config = z.object({
  enabled: z.boolean().default(true), ghBin: z.string().default('gh'), enforceCommands: z.boolean().default(true),
  webFetchPolicy: z.enum(['deny', 'ask', 'off']).default('deny'), registerRepoTools: z.boolean().default(true),
  allowDelete: z.boolean().default(false), awareness: z.boolean().default(true),
  ghTimeoutMs: z.number().default(60000), probeTimeoutMs: z.number().default(3000),
})
const HOSTS = `github.com:
    users:
        alice:
            oauth_token: ${SECRET}
            git_protocol: https
        bob:
            oauth_token: ${SECRET_B}
    active_account: alice
    oauth_token: ${SECRET}
    user: alice
    git_protocol: https
`
const STATUS_JSON = JSON.stringify({ hosts: { 'github.com': [{ state: 'success', active: true, host: 'github.com', login: 'alice', tokenSource: 'hosts.yml', gitProtocol: 'https' }] } })
const USER_JSON = JSON.stringify({ login: 'alice' })
const RATE_JSON = JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, reset: 1700000000 }, search: { limit: 30, remaining: 29, reset: 1700000001 } } })
const REPO_JSON = JSON.stringify({ full_name: 'acme/widgets', stargazers_count: 7, open_issues_count: 3, default_branch: 'main' })
const VERIFY_JSON = JSON.stringify({ hosts: { 'github.com': [
  { state: 'success', active: true, host: 'github.com', login: 'alice' },
  { state: 'error', active: false, host: 'github.com', login: 'bob', error: `HTTP 401: Bad credentials (${SECRET} ${SECRET_B}) https://user:pass@host/x` },
] } })

const ok = (stdout = '') => ({ stdout, stderr: '', status: 0, elapsedMs: 2, timedOut: false, errorCode: null })
const bad = (stderr, status = 1) => ({ stdout: '', stderr, status, elapsedMs: 3, timedOut: false, errorCode: null })
const probeGh = (argv) => {
  const k = argv.join(' ')
  if (k === 'auth status --json hosts') return ok(STATUS_JSON)
  if (k === 'api user') return ok(USER_JSON)
  if (k === 'api rate_limit') return ok(RATE_JSON)
  return ok('')
}
function setup({ config = {}, hosts = HOSTS, gh = probeGh, git, cacheTtlMs, reject } = {}) {
  const calls = { gh: [], git: [], auth: [] }
  const specs = []
  const rawConfig = { probeTimeoutMs: 3000, ghTimeoutMs: 60000, ghBin: 'gh', ...config }
  const disposers = registerSettingsRoutes({
    register: (spec) => { specs.push(spec); return () => { spec.disposed = true } },
    connection: { requestRejection: (req) => { calls.auth.push(req); return typeof reject === 'function' ? reject(req) : reject } },
    Config,
    getConfig: () => rawConfig,
    runGh: (argv, opts = {}) => { calls.gh.push({ argv, opts }); return typeof gh === 'function' ? gh(argv, opts) : gh },
    readHosts: () => (hosts == null ? { exists: false, path: '/tmp/none/hosts.yml', text: null } : { exists: true, path: '/tmp/gh/hosts.yml', text: hosts }),
    runGit: (argv) => { calls.git.push(argv); return typeof git === 'function' ? git(argv) : git },
    workspaceDir: '/tmp/ws',
    cacheTtlMs,
  })
  return { calls, specs, disposers, handler: specs[0]?.handler }
}
async function call(handler, { method = 'GET', url = `${API_PREFIX}/status`, body, rawBody, headers = { host: '127.0.0.1:3080' } } = {}) {
  const data = rawBody ?? (body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
  const req = Readable.from(data == null ? [] : [data])
  req.method = method; req.url = url; req.headers = headers
  const res = {
    statusCode: 0, headers: {}, body: null,
    writeHead(s, h) { this.statusCode = s; Object.assign(this.headers, h ?? {}) },
    setHeader(k, v) { this.headers[k] = v },
    end(b) { this.body = b ?? '' },
  }
  await handler(req, res)
  return { status: res.statusCode, headers: res.headers, text: res.body, json: res.body ? JSON.parse(res.body) : null }
}
function assertNoLeak(s, label) {
  for (const secret of [SECRET, SECRET_B, 'user:pass@']) assert.ok(!String(s).includes(secret), `${label}：明文泄露 ${secret}`)
  assert.ok(!/gh[pousr]_[A-Za-z0-9_]{16,}/.test(s), `${label}：token 形态串外泄`)
  assert.ok(!/github_pat_[A-Za-z0-9_]{16,}/.test(s), `${label}：PAT 形态串外泄`)
}
const ROUTES = [
  ['GET', `${API_PREFIX}/status`], ['POST', `${API_PREFIX}/token`], ['POST', `${API_PREFIX}/check`],
  ['GET', `${API_PREFIX}/accounts`], ['POST', `${API_PREFIX}/accounts/verify`], ['POST', `${API_PREFIX}/accounts/switch`],
  ['GET', `${API_PREFIX}/repo-context`], ['GET', `${API_PREFIX}/health`],
]

test('注册面 + 缺缝 fail-open（INV-6）：prefix 注册 / disposer 可撤销 / 缺 connection 不注册不炸', () => {
  const env = setup()
  assert.equal(env.specs[0].kind, 'prefix'); assert.equal(env.specs[0].path, API_PREFIX)
  env.disposers[0]()
  assert.equal(env.specs[0].disposed, true)
  const noConn = registerSettingsRoutes({ register: () => { throw new Error('不应注册') }, Config, getConfig: () => ({}) })
  assert.deepEqual(noConn, [], '缺鉴权缝=数据面缺席（fail-open），不得注册')
})

test('鉴权矩阵：8 端点首行 requestRejection，未授权 401/403 且零副作用（INV-3）', async () => {
  for (const [rejection, expectStatus, code] of [[401, 401, 'GHO-AUTH-01'], [403, 403, 'GHO-AUTH-02']]) {
    for (const [method, url] of ROUTES) {
      const env = setup({ reject: rejection })
      const r = await call(env.handler, { method, url, body: method === 'POST' ? {} : undefined })
      assert.equal(r.status, expectStatus, `${method} ${url} → HTTP ${expectStatus}`)
      assert.equal(r.json.ok, false); assert.equal(r.json.code, code, `${method} ${url} 错误码`)
      assert.equal(env.calls.auth.length, 1, '鉴权缝在场且先行')
      assert.equal(env.calls.gh.length, 0, '未授权不得触达 gh'); assert.equal(env.calls.git.length, 0, '未授权不得触达 git')
    }
  }
})

test('路由契约守卫：方法 405+allow、路径 404、畸形 JSON 400、白名单整单拒 400（INV-1）', async () => {
  const env = setup()
  const m = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/status`, body: {} })
  assert.equal(m.status, 405); assert.equal(m.json.code, 'GHO-ROUTE-04'); assert.equal(m.headers.allow, 'GET')
  const n = await call(env.handler, { url: `${API_PREFIX}/nope` })
  assert.equal(n.status, 404); assert.equal(n.json.code, 'GHO-ROUTE-05')
  const j = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, rawBody: '{oops' })
  assert.equal(j.status, 400); assert.equal(j.json.code, 'GHO-ROUTE-01')
  const w = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, body: { token: 'x', evil: 'y' } })
  assert.equal(w.status, 400); assert.equal(w.json.code, 'GHO-ROUTE-03')
  const s = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/accounts/switch`, body: { login: 'a', sudo: 1 } })
  assert.equal(s.status, 400); assert.equal(s.json.code, 'GHO-ROUTE-03')
  assert.equal(env.calls.gh.length, 0, '契约拒绝不得触达 gh')
})

test('1MiB 请求体有界：超限 400 GHO-ROUTE-02 且零业务副作用（INV-1）', async () => {
  const env = setup()
  const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, rawBody: 'a'.repeat((1 << 20) + 16) })
  assert.equal(r.status, 400); assert.equal(r.json.code, 'GHO-ROUTE-02'); assert.equal(r.json.ok, false)
  assert.equal(env.calls.gh.length, 0)
  assert.equal(env.calls.auth.length, 1, '鉴权先行于读体')
})

test('POST /token 留空=不修改（INV-4）：空/缺失/空白 token 全 200 no-op，绝不触碰既有凭据', async () => {
  for (const body of [undefined, {}, { token: '' }, { token: '   ' }]) {
    const env = setup()
    const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, body })
    assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.noop, true)
    assert.equal(env.calls.gh.length, 0, 'no-op 不得执行任何 gh 写入（writeToken 拒空=双保险）')
    assertNoLeak(r.text, 'token no-op')
  }
  const env = setup()
  const del = await call(env.handler, { method: 'DELETE', url: `${API_PREFIX}/token` })
  assert.equal(del.status, 405, 'API 面无删除/登出端点（INV-4/P-8）')
  const logout = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/logout` })
  assert.equal(logout.status, 404)
})

test('POST /token 写入：只经 stdin 进 gh（argv 零明文，P-5），响应零明文', async () => {
  const env = setup({ gh: () => ok('') })
  const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, body: { token: SECRET } })
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.noop, false)
  assert.deepEqual(env.calls.gh[0].argv, ['auth', 'login', '--with-token'])
  assert.ok(!env.calls.gh[0].argv.join(' ').includes(SECRET), 'argv 永不含 token 明文')
  assert.equal(env.calls.gh[0].opts.stdin, SECRET, 'token 只经 stdin')
  assertNoLeak(r.text, 'token 写入响应')
})

test('路由输出零明文对抗（INV-1/INV-10）：URL userinfo 形 + token 形态 + hosts.yml 假值全擦', async () => {
  const git = (argv) => (argv[0] === 'remote' ? ok(`origin\t${USERINFO_URL} (fetch)\norigin\t${USERINFO_URL} (push)\n`) : ok('main\n'))
  const gh = (argv) => {
    const k = argv.join(' ')
    if (k === 'api repos/acme/widgets') return ok(REPO_JSON)
    if (k === 'auth login --with-token') return bad(`error validating token: HTTP 401: Bad credentials (${SECRET} ${SECRET_B}) https://user:pass@host/x`)
    return probeGh(argv)
  }
  const env = setup({ gh, git })
  for (const [method, url] of ROUTES) {
    const body = method === 'POST' ? (url.endsWith('/token') ? { token: SECRET } : url.endsWith('/switch') ? { login: 'alice' } : {}) : undefined
    const r = await call(env.handler, { method, url, body })
    assertNoLeak(r.text, `${method} ${url}`)
  }
  const rc = await call(env.handler, { url: `${API_PREFIX}/repo-context` })
  assert.equal(rc.json.git.remotes[0].url, 'https://github.com/acme/widgets.git', 'remote URL userinfo 擦除（不是丢内容）')
})

test('GET /status：本地认证状态投影（零网络 + 零明文）', async () => {
  const env = setup({ gh: () => { throw new Error('status 不得触网') } })
  const r = await call(env.handler, { url: `${API_PREFIX}/status` })
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.stage, 'status'); assert.equal(r.json.login, 'alice')
  assert.deepEqual(r.json.accounts.map((a) => a.login), ['alice', 'bob'])
  assert.equal(r.json.accounts[0].active, true); assert.equal(r.json.accounts[0].configured, true)
  assert.equal(r.json.hosts[0].host, 'github.com'); assert.equal(r.json.hosts[0].hasToken, true)
  assert.equal(env.calls.gh.length, 0)
  assert.equal(env.calls.auth.length, 1, 'handler 首行鉴权')
  assertNoLeak(r.text, 'status 投影')
  const miss = setup({ hosts: null })
  const m = await call(miss.handler, { url: `${API_PREFIX}/status` })
  assert.equal(m.json.ok, false); assert.equal(m.json.code, 'GHO-STATUS-07')
})

test('POST /check：三段探针 + probeTimeoutMs 透传 + quota 投影（ADR-004）', async () => {
  const env = setup({ config: { probeTimeoutMs: 4500 }, gh: probeGh })
  const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/check`, body: {} })
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.stage, 'latency-quota')
  assert.equal(r.json.login, 'alice'); assert.equal(r.json.quota.core.remaining, 4999)
  assert.equal(env.calls.gh.length, 3)
  for (const c of env.calls.gh) assert.equal(c.opts.timeoutMs, 4500, 'probeTimeoutMs 逐段透传')
  assert.equal(env.calls.auth.length, 1)
})

test('POST /check 失败归因：结构化 GHO-<STAGE>-<NN> + 分级 hint + stderr 敏感串不透传（INV-10）', async () => {
  const env = setup({ gh: (argv) => (argv.join(' ') === 'api user' ? bad(`gh: Bad credentials (HTTP 401) ${SECRET} https://user:pass@host/x`) : probeGh(argv)) })
  const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/check`, body: {} })
  assert.equal(r.status, 200); assert.equal(r.json.ok, false); assert.equal(r.json.stage, 'auth-connect')
  assert.equal(r.json.code, 'GHO-AUTH-CONNECT-03'); assert.equal(r.json.status, 401); assert.equal(r.json.login, 'alice')
  assert.match(r.json.hint, /token 无效/)
  assert.equal(typeof r.json.elapsedMs, 'number')
  assertNoLeak(r.text, 'check 失败')
})

test('GET /accounts + /accounts/verify：逐账号验证 + verified 回填 + L-1 幻影 login 过滤', async () => {
  const gh = (argv) => (argv.join(' ') === 'auth status --json hosts' ? ok(VERIFY_JSON) : probeGh(argv))
  const env = setup({ gh })
  const v = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/accounts/verify`, body: { logins: ['alice', 'bob', 'ghost'] } })
  assert.equal(v.status, 200); assert.equal(v.json.ok, true)
  assert.deepEqual(v.json.accounts.map((a) => [a.login, a.verified, a.state]), [['alice', true, 'success'], ['bob', false, 'error'], ['ghost', false, 'missing']])
  assertNoLeak(v.text, 'verify 投影')
  const a = await call(env.handler, { url: `${API_PREFIX}/accounts` })
  assert.deepEqual(a.json.accounts.map((x) => [x.login, x.verified]), [['alice', true], ['bob', false]])
  // L-1 幻影账号（deferred）：users+user 双缺、active_account 布尔形 → 投影层过滤 login 形如 true/false
  const phantom = setup({ hosts: `github.com:\n    active_account: 'true'\n    oauth_token: ${SECRET}\n    git_protocol: https\n` })
  const p = await call(phantom.handler, { url: `${API_PREFIX}/accounts` })
  assert.ok(p.json.accounts.every((x) => x.login !== 'true' && x.login !== 'false'), '布尔形幻影 login 不出口')
  assertNoLeak(p.text, '幻影过滤')
})

test('POST /accounts/switch：成功投影 + gh<2.20 降级 hint（ADR-005/R-3）', async () => {
  const env = setup({ gh: () => ok('') })
  const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/accounts/switch`, body: { login: 'bob' } })
  assert.equal(r.json.ok, true); assert.equal(r.json.login, 'bob')
  assert.deepEqual(env.calls.gh[0].argv, ['auth', 'switch', '--user', 'bob'])
  const low = setup({ gh: () => bad('unknown command "auth"') })
  const l = await call(low.handler, { method: 'POST', url: `${API_PREFIX}/accounts/switch`, body: { login: 'bob' } })
  assert.equal(l.json.ok, false); assert.equal(l.json.code, 'GHO-SWITCH-08')
  assert.match(l.json.hint, /手工执行 gh auth switch/)
})

test('GET /repo-context：gh 摘要 + TTL≤30s 缓存 + 失败 fail-open（ADR-006/INV-6）', async () => {
  const calls = { gh: 0, git: 0 }
  const env = setup({
    cacheTtlMs: 100,
    git: (argv) => { calls.git++; return argv[0] === 'remote' ? ok(`origin\t${USERINFO_URL} (fetch)\n`) : ok('main\n') },
    gh: (argv) => { calls.gh++; return argv.join(' ') === 'api repos/acme/widgets' ? ok(REPO_JSON) : probeGh(argv) },
  })
  const r1 = await call(env.handler, { url: `${API_PREFIX}/repo-context` })
  assert.equal(r1.json.ok, true); assert.equal(r1.json.cached, false)
  assert.equal(r1.json.repo.fullName, 'acme/widgets')
  assert.equal(r1.json.repo.stars, 7); assert.equal(r1.json.repo.issues, 3); assert.equal(r1.json.repo.defaultBranch, 'main')
  assert.equal(r1.json.git.branch, 'main')
  const r2 = await call(env.handler, { url: `${API_PREFIX}/repo-context` })
  assert.equal(r2.json.cached, true, 'TTL 内走缓存')
  assert.equal(calls.git + calls.gh, 3, '缓存期零重复调用')
  await new Promise((res) => setTimeout(res, 200))
  const r3 = await call(env.handler, { url: `${API_PREFIX}/repo-context` })
  assert.equal(r3.json.cached, false, 'TTL 过期重取（≤30s 钳制在实现内）')
  const broken = setup({ git: () => bad('fatal: not a git repository (or any of the parent directories)') })
  const b = await call(broken.handler, { url: `${API_PREFIX}/repo-context` })
  assert.equal(b.status, 200, 'fail-open：卡内降级不炸栏目'); assert.equal(b.json.ok, false)
  assert.ok(b.json.code?.startsWith('GHO-REPO-'))
  assertNoLeak(b.text, 'repo-context 降级')
})

test('M-1 用户可见 message（INV-10）：畸形 JSON / 超 1MiB 回落 CONTRACT 中文文案，不裸奔 kind 字面', async () => {
  const env = setup()
  const j = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, rawBody: '{oops' })
  assert.equal(j.status, 400); assert.equal(j.json.code, 'GHO-ROUTE-01')
  assert.equal(j.json.message, '请求体不是合法 JSON', '畸形 JSON 的 message 必须是 CONTRACT 中文文案（不得是 "badjson"）')
  const big = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, rawBody: 'a'.repeat((1 << 20) + 16) })
  assert.equal(big.status, 400); assert.equal(big.json.code, 'GHO-ROUTE-02')
  assert.equal(big.json.message, '请求体超过 1MiB 上限', '超限的 message 必须是 CONTRACT 中文文案（不得是 "toolarge"）')
  assert.equal(env.calls.gh.length, 0)
})

test('M-2 差分枚举回归（INV-3）：未授权 已知/未知路径同形回拒（鉴权先行于 404 查表），过缝才如实 404', async () => {
  for (const rejection of [401, 403]) {
    const env = setup({ reject: rejection })
    const known = await call(env.handler, { method: 'GET', url: `${API_PREFIX}/status` })
    const unknown = await call(env.handler, { method: 'GET', url: `${API_PREFIX}/nope` })
    assert.equal(unknown.status, known.status, `未授权(${rejection})：未知路径不得回 404（防路径枚举）`)
    assert.equal(unknown.json.code, known.json.code, `未授权(${rejection})：错误码同形`)
    assert.equal(unknown.status, rejection)
    assert.equal(env.calls.gh.length, 0); assert.equal(env.calls.git.length, 0)
  }
  const env = setup()
  const n = await call(env.handler, { url: `${API_PREFIX}/nope` })
  assert.equal(n.status, 404, '已授权未知路径如实 404')
  assert.equal(n.json.code, 'GHO-ROUTE-05')
})

test('GET /health：三段自检（配置合成复检 / gh 可用 / 凭据在位）+ 降级归因（ADR-007）', async () => {
  const env = setup({ gh: (argv) => (argv.join(' ') === '--version' ? ok('gh version 2.90.0\n') : probeGh(argv)) })
  const r = await call(env.handler, { url: `${API_PREFIX}/health` })
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.stage, 'health')
  assert.equal(r.json.sections.config.ok, true); assert.equal(r.json.sections.config.switches.enabled, true)
  assert.equal(r.json.sections.gh.ok, true)
  assert.match(r.json.sections.gh.version, /gh version 2\.90\.0/)
  assert.equal(r.json.sections.credentials.ok, true); assert.equal(r.json.sections.credentials.active, 'alice')
  assert.equal(env.calls.gh[0].opts.timeoutMs, 3000, 'gh --version 走 probeTimeoutMs')
  assertNoLeak(r.text, 'health 投影')
  const badEnv = setup({ config: { probeTimeoutMs: 'NaN' }, hosts: null, gh: () => ({ stdout: '', stderr: '', status: 1, elapsedMs: 1, timedOut: false, errorCode: 'ENOENT' }) })
  const b = await call(badEnv.handler, { url: `${API_PREFIX}/health` })
  assert.equal(b.json.ok, false)
  assert.equal(b.json.sections.config.ok, false, 'Config.parse 复检不过→如实')
  assert.equal(b.json.sections.gh.ok, false)
  assert.match(b.json.sections.gh.hint, /安装 GitHub CLI/)
  assert.equal(b.json.sections.credentials.ok, false)
  assertNoLeak(b.text, 'health 降级')
})
