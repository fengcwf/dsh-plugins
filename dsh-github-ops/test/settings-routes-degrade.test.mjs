// settings-routes 退化形/失败形 integration 形测试（Task 15 收口，与 settings-routes.test.mjs 分文件——后者 312 行已超限）：
//   ① 真 makeRunGh + 假 gh 脚本全链：慢响应 >probeTimeoutMs 超时分级不挂死（INV-5）、R-1 写入失败形
//      stderr 敏感串不透传（INV-10/R-1）；② 失败形分级矩阵（401/403/429/非零退出/写入失败 GHO-TOKEN-06）；
//   ③ 缺缝 fail-open（INV-6）；④ 返回值/argv/warn 日志全链零明文（P-5/P-10/R-6）。
// 合同面（ADR-002 ③/⑤）：业务失败=HTTP 200 + ok:false 结构化归因；出边界 sendJson 整树 redact + 投影层双保险。
import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { registerSettingsRoutes, API_PREFIX } from '../lib/settings-routes.js'

// 一次性假值（P-10：用后即换，值仅本文件使用）
const ONCE_D = 'ghp_once_t15_delta_0123456789abcd'
const ONCE_E = 'ghp_once_t15_echo_0123456789abcd'
// 非 token 形态的一次性秘密：专咬 makeRunGh「stdin 秘密精确擦除」层（形态扫描抓不到的形，M3 探针实测缺口）
const ONCE_RAW = 'raw-once-t15-route-secret-Z7k2P9qL4nX8vB3m'
const ALL_SECRETS = [ONCE_D, ONCE_E, ONCE_RAW]

const Config = z.object({
  enabled: z.boolean().default(true), ghBin: z.string().default('gh'), enforceCommands: z.boolean().default(true),
  webFetchPolicy: z.enum(['deny', 'ask', 'off']).default('deny'), registerRepoTools: z.boolean().default(true),
  allowDelete: z.boolean().default(false), awareness: z.boolean().default(true),
  ghTimeoutMs: z.number().default(60000), probeTimeoutMs: z.number().default(3000),
})
const HOSTS = `github.com:
    user: alice
    oauth_token: ${ONCE_D}
    git_protocol: https
`
const STATUS_JSON = JSON.stringify({ hosts: { 'github.com': [{ state: 'success', active: true, host: 'github.com', login: 'alice' }] } })
const USER_JSON = JSON.stringify({ login: 'alice' })
const RATE_JSON = JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, reset: 1700000000 }, search: null } })

// ── 假 gh 脚本（记录 argv/stdin；按 plan 供响应/延迟/退出码/最坏回显）──
const dir = mkdtempSync(join(tmpdir(), 'settings-degrade-'))
const fakeGh = join(dir, 'fake-gh.mjs')
const logFile = join(dir, 'calls.jsonl')
const planFile = join(dir, 'plan.json')
writeFileSync(fakeGh, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
const argv = process.argv.slice(2)
let stdin = ''
try { stdin = readFileSync(0, 'utf8') } catch {}
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ argv, stdin }) + '\\n')
const plan = process.env.FAKE_GH_PLAN_FILE ? JSON.parse(readFileSync(process.env.FAKE_GH_PLAN_FILE, 'utf8')) : {}
const key = argv.join(' ')
let entry = plan[key]
if (!entry) for (const k of Object.keys(plan)) if (key.startsWith(k)) { entry = plan[k]; break }
entry = entry ?? {}
if (entry.sleepMs) await new Promise((r) => setTimeout(r, entry.sleepMs))
if (entry.echoStdin) process.stdout.write(stdin)
if (entry.echoStdinToStderr) process.stderr.write(stdin)
if (entry.stdout) process.stdout.write(entry.stdout)
if (entry.stderr) process.stderr.write(entry.stderr)
if (entry.exit) process.exitCode = entry.exit
`)
chmodSync(fakeGh, 0o755)
const calls = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

// ── 假 ctx/请求响应缝（同 settings-routes.test.mjs 形）──
function setup({ config = {}, hosts = HOSTS, gh, git, warn, reject, readHosts } = {}) {
  const calls = { gh: [], git: [], auth: [] }
  const specs = []
  const warns = []
  const rawConfig = { probeTimeoutMs: 3000, ghTimeoutMs: 60000, ghBin: 'gh', ...config }
  const disposers = registerSettingsRoutes({
    register: (spec) => { specs.push(spec); return () => { spec.disposed = true } },
    connection: { requestRejection: (req) => { calls.auth.push(req); return typeof reject === 'function' ? reject(req) : reject } },
    Config,
    getConfig: () => rawConfig,
    // 注入 runGh=桩（快路径）；不传则走真 makeRunGh（config.ghBin=fakeGh 时=真 spawn 全链）
    ...(gh ? { runGh: (argv, opts = {}) => { calls.gh.push({ argv, opts }); return typeof gh === 'function' ? gh(argv, opts) : gh } } : {}),
    readHosts: readHosts ?? (() => (hosts == null ? { exists: false, path: '/tmp/none/hosts.yml', text: null } : { exists: true, path: '/tmp/gh/hosts.yml', text: hosts })),
    ...(git ? { runGit: (argv) => { calls.git.push(argv); return typeof git === 'function' ? git(argv) : git } } : {}),
    workspaceDir: '/tmp/ws',
    warn: (line) => { warns.push(String(line)); if (typeof warn === 'function') warn(line) },
  })
  return { calls, specs, disposers, warns, handler: specs[0]?.handler }
}
async function call(handler, { method = 'GET', url = `${API_PREFIX}/check`, body, rawBody, headers = { host: '127.0.0.1:3080' } } = {}) {
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
  for (const secret of ALL_SECRETS) assert.ok(!String(s).includes(secret), `${label}：明文泄露 ${secret}`)
  assert.ok(!String(s).includes('user:pass@'), `${label}：URL userinfo 明文泄露`)
  assert.ok(!/gh[pousr]_[A-Za-z0-9_]{16,}/.test(s), `${label}：token 形态串外泄`)
  assert.ok(!/github_pat_[A-Za-z0-9_]{16,}/.test(s), `${label}：PAT 形态串外泄`)
}
const ok = (stdout = '') => ({ stdout, stderr: '', status: 0, elapsedMs: 2, timedOut: false, errorCode: null })
const bad = (stderr, status = 1) => ({ stdout: '', stderr, status, elapsedMs: 3, timedOut: false, errorCode: null })
const structured = (json, stage) => {
  for (const k of ['ok', 'stage', 'code', 'status', 'login', 'message', 'elapsedMs', 'hint', 'quota']) assert.ok(k in json, `${stage} 结构化形缺字段 ${k}`)
  assert.equal(json.ok, false)
}

// ── ① 真 makeRunGh + 假 gh 脚本全链（退化形主战场）──

test('慢响应超时形全链（真 spawn）：>probeTimeoutMs → 200+ok:false GHO-AUTH-CONNECT-01，分级出结果不挂死（INV-5）', async () => {
  process.env.FAKE_GH_LOG = logFile
  process.env.FAKE_GH_PLAN_FILE = planFile
  writeFileSync(logFile, '')
  writeFileSync(planFile, JSON.stringify({
    'auth status --json hosts': { stdout: STATUS_JSON },
    'api user': { sleepMs: 2500 },
  }))
  try {
    const env = setup({ config: { ghBin: fakeGh, probeTimeoutMs: 800, ghTimeoutMs: 800 } }) // 不注 runGh=真执行器
    const t0 = Date.now()
    const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/check`, body: {} })
    const wall = Date.now() - t0
    assert.equal(r.status, 200, '业务失败=HTTP 200 + ok:false（合同 9）')
    structured(r.json, 'check 超时形')
    assert.equal(r.json.stage, 'auth-connect')
    assert.equal(r.json.code, 'GHO-AUTH-CONNECT-01')
    assert.match(r.json.hint, /超时/)
    assert.ok(wall < 2200, `超时分级须远早于 sleepMs 返回（实测 ${wall}ms）`)
    assert.equal(typeof r.json.elapsedMs, 'number')
    assertNoLeak(r.text, 'check 超时形响应')
  } finally {
    delete process.env.FAKE_GH_LOG; delete process.env.FAKE_GH_PLAN_FILE
  }
})

test('R-1 写入失败形全链（真 spawn）：失败 stderr 含密最坏形 → GHO-TOKEN-03 + stderr 敏感串不透传（INV-10/R-1）', async () => {
  process.env.FAKE_GH_LOG = logFile
  process.env.FAKE_GH_PLAN_FILE = planFile
  writeFileSync(logFile, '')
  writeFileSync(planFile, JSON.stringify({
    'auth login --with-token': { echoStdin: true, echoStdinToStderr: true, exit: 1, stderr: 'error validating token: HTTP 401: Bad credentials (https://api.github.com/)\nTry authenticating with:  gh auth login\n' },
  }))
  try {
    const env = setup({ config: { ghBin: fakeGh, probeTimeoutMs: 1500, ghTimeoutMs: 3000 } })
    // 两轮一次性写入：token 形态值（形态扫描面）+ 非形态值（stdin 精确擦除面，M3 缺口补咬）
    for (const secret of [ONCE_E, ONCE_RAW]) {
      const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, body: { token: secret } })
      assert.equal(r.status, 200)
      structured(r.json, 'token 失败形')
      assert.equal(r.json.code, 'GHO-TOKEN-03')
      assert.equal(r.json.status, 401)
      assert.match(r.json.message, /401|Bad credentials/, '归因事实保真（擦除的是凭据）')
      assertNoLeak(r.text, 'token 失败形响应')
    }
    // argv 永不含 token（stdin 唯一通道）+ 假 gh 调用记录零明文（stdin 字段除外=传输通道）
    const cs = calls()
    assert.ok(cs.length >= 2, '确实发生过 gh 写入调用（断言非真空转）')
    for (const c of cs) {
      for (const secret of [ONCE_E, ONCE_RAW]) assert.ok(!c.argv.join(' ').includes(secret), 'argv 永不含 token 明文（P-5）')
      assertNoLeak({ argv: c.argv }, '假 gh argv 记录')
    }
  } finally {
    delete process.env.FAKE_GH_LOG; delete process.env.FAKE_GH_PLAN_FILE
  }
})

test('sendJson 整树 redact 咬合（INV-1 双保险）：白名单违例键名反射 token 形态串 → 出边界必须擦除', async () => {
  // 对抗形：请求体用 token 形态串做「未知字段名」——zod 白名单违例 message 会回显键名（自证路径），
  // 唯一兜底=sendJson 整树 redact（M4 探针实测缺口补咬：此层失效=键名明文出边界）。
  const hostileKey = 'ghp_reflected_key_name_0123456789'
  const env = setup()
  const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, body: { token: 'x', [hostileKey]: 1 } })
  assert.equal(r.status, 400)
  assert.equal(r.json.code, 'GHO-ROUTE-03')
  assert.match(r.json.message, /白名单/, '契约文案保真')
  assert.equal(String(r.json.message).includes(hostileKey), false, '键名反射串出边界必须过 redact')
  assertNoLeak(r.text, '白名单违例响应')
})

// ── ② 失败形分级矩阵（注入桩快路径）：401/403/429/非零退出/写入失败 ──

test('失败形分级矩阵@POST /check：401/403/429/非零退出 → GHO-AUTH-CONNECT-03/04/05/99 结构化归因 + stderr 不透传', async () => {
  const matrix = [
    [bad(`HTTP 401: Bad credentials (https://api.github.com/user) leak=${ONCE_D}`), 'GHO-AUTH-CONNECT-03', 401, /token 无效/],
    [bad(`HTTP 403: Forbidden (https://api.github.com/user) leak=${ONCE_E}`), 'GHO-AUTH-CONNECT-04', 403, /权限不足/],
    [bad('gh: HTTP 429: API rate limit exceeded'), 'GHO-AUTH-CONNECT-05', 429, /限额/],
    [bad('gh: unknown network glitch\nraw detail line'), 'GHO-AUTH-CONNECT-99', null, /未知错误|结合 message/],
  ]
  for (const [stub, code, status, hint] of matrix) {
    const env = setup({ gh: (argv) => (argv.join(' ') === 'api user' ? stub : ok(argv.join(' ') === 'auth status --json hosts' ? STATUS_JSON : argv.join(' ') === 'api rate_limit' ? RATE_JSON : USER_JSON)) })
    const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/check`, body: {} })
    assert.equal(r.status, 200, `${code}：业务失败恒 200+ok:false`)
    structured(r.json, code)
    assert.equal(r.json.code, code)
    assert.equal(r.json.status, status)
    assert.equal(r.json.login, 'alice', 'login 归因贯通（阶段①投影）')
    assert.match(r.json.hint, hint)
    assert.ok(!r.text.includes('raw detail line'), 'stderr 原文不整段透传')
    assertNoLeak(r.text, `分级矩阵 ${code}`)
  }
})

test('失败形写入矩阵@POST /token：网络错形/非零退出 → GHO-TOKEN-06 + 留空=不修改不受影响（INV-4）', async () => {
  for (const stub of [bad(`Post "https://github.com/login/oauth/access_token": dial tcp: i/o timeout leak=${ONCE_D}`), bad('gh: write failed: permission denied')]) {
    const env = setup({ gh: stub })
    const r = await call(env.handler, { method: 'POST', url: `${API_PREFIX}/token`, body: { token: ONCE_D } })
    assert.equal(r.status, 200)
    structured(r.json, 'token 写入失败形')
    assert.equal(r.json.code, 'GHO-TOKEN-06')
    assert.match(r.json.hint, /写入失败/)
    assertNoLeak(r.text, 'token 写入失败形')
    assert.equal(env.calls.gh[0].opts.stdin, ONCE_D, 'token 只经 stdin（P-5）')
    assert.ok(!env.calls.gh[0].argv.join(' ').includes(ONCE_D), 'argv 零明文')
    assert.equal(env.calls.gh.length, 1)
  }
  const noop = setup({ gh: () => { throw new Error('留空不得触达 gh') } })
  const n = await call(noop.handler, { method: 'POST', url: `${API_PREFIX}/token`, body: { token: '  ' } })
  assert.equal(n.json.noop, true, '留空=不修改（INV-4）在失败形矩阵下不受影响')
  assert.equal(noop.calls.gh.length, 0)
})

// ── ③ 缺缝 fail-open（INV-6）+ ④ 日志/返回值零明文 ──

test('缺缝 fail-open（INV-6）：register/connection 缺位=数据面缺席不炸；畸形 hosts.yml 不炸栏目', async () => {
  const warns = []
  const noConn = registerSettingsRoutes({ register: () => { throw new Error('不应注册') }, Config, getConfig: () => ({}), warn: (l) => warns.push(String(l)) })
  assert.deepEqual(noConn, [], '缺鉴权缝=不注册不炸（fail-open）')
  assert.ok(warns.length >= 1, '缺席面留痕')
  const noReg = registerSettingsRoutes({ connection: { requestRejection: () => undefined }, warn: () => {} })
  assert.deepEqual(noReg, [], '缺注册缝=不注册不炸')
  // 畸形 hosts.yml（垃圾行/Tab）经 /status 投影：不炸栏目 + 零明文 + 不伪造凭据
  const weird = setup({ hosts: `github.com:\n\toauth_token: ${ONCE_D}\n\tuser: alice\n!!! garbage ###\n` })
  const r = await call(weird.handler, { url: `${API_PREFIX}/status` })
  assert.equal(r.status, 200, '畸形输入绝不炸栏目')
  assert.equal(r.json.accounts.length, 0, 'tab 缩进=gh 同判不可用：不伪造账号')
  assert.equal(r.json.hosts.every((h) => h.hasToken === false), true, '不伪造凭据在位')
  assertNoLeak(r.text, '畸形 hosts.yml 投影')
})

test('日志/返回值零明文（P-5/P-10/R-6）：内部异常 message 含密 → warn 日志与响应双双擦除', async () => {
  const env = setup({ readHosts: () => { throw new Error(`hosts read boom token=${ONCE_D}`) } })
  const r = await call(env.handler, { url: `${API_PREFIX}/status` })
  assert.equal(r.status, 500, '内部错误=HTTP 500（传输/契约层，非业务归因）')
  assert.equal(r.json.code, 'GHO-ROUTE-99')
  assert.equal(r.json.message, '内部错误', '内部细节不透传给用户（INV-10）')
  assert.ok(env.warns.length >= 1, '内部错误留日志痕')
  for (const line of env.warns) assertNoLeak(line, 'warn 日志行')
  assertNoLeak(r.text, '内部错误响应')
})
