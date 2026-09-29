// gh-auth 纯逻辑单测：假 gh 脚本记录 stdin/argv，覆盖状态投影/探针三段/失败分级/切换降级/redact/超时分支。
// 安全断言（P-10/R-6）：全部 token 用一次性假值，且所有返回值/投影零明文（token 形态串扫描）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  makeRunGh, parseHostsMeta, listAccounts, probeAccess, switchActive, writeToken, redact, DEFAULT_PROBE_TIMEOUT_MS,
} from '../lib/gh-auth.js'

const FAKE_TOKEN = 'ghp_faketoken_for_shape_test_only'
const SECRET_A = 'ghp_secretvalueA123456789012345'
const SECRET_B = 'ghp_secretvalueB123456789012345'

const dir = mkdtempSync(join(tmpdir(), 'gh-auth-test-'))
const fakeGh = join(dir, 'fake-gh.mjs')
const logFile = join(dir, 'calls.jsonl')
const planFile = join(dir, 'plan.json')
writeFileSync(fakeGh, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
const argv = process.argv.slice(2)
let stdin = ''
try { stdin = readFileSync(0, 'utf8') } catch {}
if (process.env.FAKE_GH_LOG) {
  appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ argv, stdin, env: {
    GH_PROMPT_DISABLED: process.env.GH_PROMPT_DISABLED, NO_COLOR: process.env.NO_COLOR, PAGER: process.env.PAGER } }) + '\\n')
}
const plan = process.env.FAKE_GH_PLAN_FILE ? JSON.parse(readFileSync(process.env.FAKE_GH_PLAN_FILE, 'utf8')) : {}
const key = argv.join(' ')
let entry = plan[key]
if (!entry) for (const k of Object.keys(plan)) if (key.startsWith(k)) { entry = plan[k]; break }
entry = entry ?? {}
if (entry.sleepMs) await new Promise((r) => setTimeout(r, entry.sleepMs))
if (entry.echoStdin) process.stdout.write(stdin)
if (entry.stdout) process.stdout.write(entry.stdout)
if (entry.stderr) process.stderr.write(entry.stderr)
if (entry.exit) process.exitCode = entry.exit
`)
chmodSync(fakeGh, 0o755)

function withPlan(plan, fn) {
  writeFileSync(planFile, JSON.stringify(plan))
  writeFileSync(logFile, '')
  process.env.FAKE_GH_LOG = logFile
  process.env.FAKE_GH_PLAN_FILE = planFile
  try { return fn() } finally { delete process.env.FAKE_GH_LOG; delete process.env.FAKE_GH_PLAN_FILE }
}
const calls = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

function assertNoPlaintext(value, label) {
  const s = JSON.stringify(value)
  for (const secret of [FAKE_TOKEN, SECRET_A, SECRET_B]) assert.ok(!s.includes(secret), `${label}：明文泄露 ${secret}`)
  assert.ok(!/gh[pousr]_[A-Za-z0-9_]{16,}/.test(s), `${label}：token 形态串外泄`)
  assert.ok(!/github_pat_[A-Za-z0-9_]{16,}/.test(s), `${label}：PAT 形态串外泄`)
}

const HOSTS_YAML = `github.com:
    users:
        alice:
            oauth_token: ${SECRET_A}
            git_protocol: https
        bob:
            oauth_token: ${SECRET_B}
    active_account: alice
    oauth_token: ${SECRET_A}
    user: alice
    git_protocol: https
`
const STATUS_OK = JSON.stringify({ hosts: { 'github.com': [{ state: 'active', active: true, host: 'github.com', login: 'alice', gitProtocol: 'https', tokenSource: 'hosts.yml' }] } })
const RATE_OK = JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, reset: 1700000000 }, search: { limit: 30, remaining: 29, reset: 1700000001 } } })
// 生产 hosts.yml 真实形（F-1）：users 为 YAML 序列项、active_account 值非 login；legacy 形无 users 段
const HOSTS_PROD_YAML = `github.com:
    active_account: 'true'
    git_protocol: https
    oauth_token: ${SECRET_A}
    user: fengcwf
    users:
    - fengcwf
`
const HOSTS_LEGACY_YAML = `github.com:
    oauth_token: ${SECRET_A}
    user: fengcwf
`

test('makeRunGh：stdin 传 token、argv/env 恒定、返回值零明文', () => {
  const runGh = makeRunGh({ ghBin: fakeGh, timeoutMs: 3000 })
  const r = withPlan({ 'auth login --with-token': { echoStdin: true, exit: 0 } }, () => runGh(['auth', 'login', '--with-token'], { stdin: FAKE_TOKEN }))
  assert.equal(r.status, 0)
  const [c] = calls()
  assert.deepEqual(c.argv, ['auth', 'login', '--with-token'])            // argv 永不含 token
  assert.equal(c.stdin, FAKE_TOKEN)                                       // token 只走 stdin（INV-2）
  assert.deepEqual(c.env, { GH_PROMPT_DISABLED: '1', NO_COLOR: '1', PAGER: 'cat' })
  assert.match(r.stdout, /\[REDACTED\]/)                                  // 即便 gh 回显也被擦除（INV-1）
  assertNoPlaintext(r, 'runGh 返回值')
  // F-2 返回值 redact 契约：stdout 秘密擦除+token 形态扫描（保真 JSON，URL 凭据擦除属 redact() 层）；stderr 全量 redact
  const r2 = withPlan({ 'api user': { exit: 1, stdout: `{"url":"https://user:pass@keep.example/x","tok":"${SECRET_B}"}`, stderr: 'dial https://user:p@ss@host/x failed' } }, () => runGh(['api', 'user']))
  assert.ok(!r2.stdout.includes(SECRET_B) && r2.stdout.includes('[REDACTED]'))
  assert.ok(r2.stdout.includes('https://user:pass@keep.example/x'))
  assert.equal(r2.stderr, 'dial https://host/x failed')
  assertNoPlaintext(r2, 'runGh 返回值(F-2)')
})

test('makeRunGh：超时出 timedOut、gh 缺失出 ENOENT、输出有界（4MiB maxBuffer）', () => {
  const runGh = makeRunGh({ ghBin: fakeGh, timeoutMs: 150 })
  const slow = withPlan({ 'api user': { sleepMs: 3000 } }, () => runGh(['api', 'user']))
  assert.equal(slow.timedOut, true)
  assert.equal(slow.errorCode, 'ETIMEDOUT')
  const missing = makeRunGh({ ghBin: join(dir, 'nope-gh'), timeoutMs: 300 })(['api', 'user'])
  assert.equal(missing.errorCode, 'ENOENT')
  const big = makeRunGh({ ghBin: fakeGh, timeoutMs: 5000 })
  const over = withPlan({ 'api user': { stdout: 'x'.repeat(5 * 1024 * 1024) } }, () => big(['api', 'user']))
  assert.ok(over.stdout.length <= 4 * 1024 * 1024 + 128 * 1024, `stdout 有界（实测 ${over.stdout.length}）`)
  assert.equal(over.errorCode, 'ENOBUFS')
})

test('writeToken 成功形：argv 不落 token、stdin 传 token、结果零明文', () => {
  const r = withPlan({ 'auth login --with-token': { exit: 0 } }, () => writeToken(FAKE_TOKEN, { ghBin: fakeGh, timeoutMs: 3000 }))
  assert.equal(r.ok, true)
  assert.equal(r.stage, 'token')
  assert.equal(r.code, null)
  const [c] = calls()
  assert.deepEqual(c.argv, ['auth', 'login', '--with-token'])
  assert.equal(c.stdin, FAKE_TOKEN)
  assertNoPlaintext(r, 'writeToken 结果')
})

test('writeToken 失败形钉死（R-1 实测 stderr 形）：GHO-TOKEN-03 + 401 hint', () => {
  const r = withPlan({ 'auth login --with-token': { exit: 1, stderr: 'error validating token: HTTP 401: Bad credentials (https://api.github.com/)\nTry authenticating with:  gh auth login\n' } },
    () => writeToken(FAKE_TOKEN, { ghBin: fakeGh, timeoutMs: 3000 }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'GHO-TOKEN-03')
  assert.equal(r.status, 401)
  assert.match(r.hint, /token/i)
  assertNoPlaintext(r, 'writeToken 失败结果')
})

test('writeToken 空 token：拒绝执行且零调用（钉死空 stdin 掉设备码流程的陷阱，INV-4）', () => {
  const r = withPlan({}, () => writeToken('   ', { ghBin: fakeGh, timeoutMs: 3000 }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'GHO-TOKEN-06')
  assert.equal(calls().length, 0)
})

test('parseHostsMeta：行级元数据投影（active_account/user/users/git_protocol，token 只判在位）', () => {
  const meta = parseHostsMeta(HOSTS_YAML)
  assert.deepEqual(meta, {
    hosts: [{
      host: 'github.com', user: 'alice', activeAccount: 'alice', gitProtocol: 'https', hasToken: true,
      users: [{ login: 'alice', hasToken: true }, { login: 'bob', hasToken: true }],
    }],
  })
  assertNoPlaintext(meta, 'parseHostsMeta 输出')
})

test('parseHostsMeta：空文本/无 hosts → 空投影', () => {
  assert.deepEqual(parseHostsMeta(''), { hosts: [] })
  assert.deepEqual(parseHostsMeta('# only comments\n'), { hosts: [] })
})

test('listAccounts：{login,active,configured,verified} 投影（不读 token 值）', () => {
  const accounts = listAccounts(HOSTS_YAML, { verified: ['bob'] })
  assert.deepEqual(accounts, [
    { login: 'alice', active: true, configured: true, verified: false },
    { login: 'bob', active: false, configured: true, verified: true },
  ])
  assertNoPlaintext(accounts, 'listAccounts 输出')
})

test('F-1 生产真实形 + legacy 形：users 序列项/active_account 非 login 回退 user/无 users 合成', () => {
  const meta = parseHostsMeta(HOSTS_PROD_YAML)
  assert.deepEqual(meta.hosts[0].users, [{ login: 'fengcwf', hasToken: true }])
  assert.equal(meta.hosts[0].activeAccount, 'fengcwf')
  assert.deepEqual(listAccounts(HOSTS_PROD_YAML), [{ login: 'fengcwf', active: true, configured: true, verified: false }])
  const legacy = parseHostsMeta(HOSTS_LEGACY_YAML)
  assert.deepEqual(legacy.hosts[0].users, [{ login: 'fengcwf', hasToken: true }])
  assert.deepEqual(listAccounts(HOSTS_LEGACY_YAML), [{ login: 'fengcwf', active: true, configured: true, verified: false }])
  assertNoPlaintext(meta, '生产形投影')
})

test('probeAccess 三段全通：stage=latency-quota + login/quota/elapsedMs + 探针 argv 顺序', () => {
  const r = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { stdout: JSON.stringify({ login: 'alice' }) },
    'api rate_limit': { stdout: RATE_OK },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 2000 }))
  assert.equal(r.ok, true)
  assert.equal(r.stage, 'latency-quota')
  assert.equal(r.code, null)
  assert.equal(r.login, 'alice')
  assert.deepEqual(r.quota, { core: { limit: 5000, remaining: 4999, reset: 1700000000 }, search: { limit: 30, remaining: 29, reset: 1700000001 } })
  assert.equal(typeof r.elapsedMs, 'number')
  assert.deepEqual(calls().map((c) => c.argv), [
    ['auth', 'status', '--json', 'hosts'], ['api', 'user'], ['api', 'rate_limit'],
  ])
  assertNoPlaintext(r, 'probeAccess 结果')
})

test('probeAccess 失败分级：401@auth-connect → GHO-AUTH-CONNECT-03', () => {
  const r = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { exit: 1, stderr: 'HTTP 401: Bad credentials (https://api.github.com/user)\n' },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 2000 }))
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'auth-connect')
  assert.equal(r.code, 'GHO-AUTH-CONNECT-03')
  assert.equal(r.status, 401)
  assert.equal(r.login, 'alice')
  assert.match(r.hint, /token/i)
})

test('probeAccess 失败分级：429@latency-quota → GHO-LATENCY-QUOTA-05（限额 hint）', () => {
  const r = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { stdout: JSON.stringify({ login: 'alice' }) },
    'api rate_limit': { exit: 1, stderr: 'gh: HTTP 429: API rate limit exceeded\n' },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 2000 }))
  assert.equal(r.code, 'GHO-LATENCY-QUOTA-05')
  assert.equal(r.status, 429)
  assert.match(r.hint, /限额/)
})

test('probeAccess：probeTimeoutMs 贯通 + 超时分级（不挂死）', () => {
  // 注：probeTimeoutMs 须留足假 gh（node shebang）单次启动成本（实测 ~110-160ms）的余量，
  // 否则 stage① 自己先超时、归因落 local-config（2026-09-29 抖动复盘根因）。
  const t0 = Date.now()
  const r = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { sleepMs: 6000 },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1000 }))
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'auth-connect')
  assert.equal(r.code, 'GHO-AUTH-CONNECT-01')
  assert.match(r.hint, /超时/)
  assert.ok(r.elapsedMs >= 500 && Date.now() - t0 < 5000, `超时须远早于 sleepMs 返回（elapsedMs=${r.elapsedMs}）`)
})

test('probeAccess：未配置（hosts 空）→ GHO-LOCAL-CONFIG-07；gh 缺失 → GHO-LOCAL-CONFIG-02', () => {
  const none = withPlan({ 'auth status --json hosts': { stdout: '{"hosts":{}}', exit: 0 } }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1000 }))
  assert.equal(none.code, 'GHO-LOCAL-CONFIG-07')
  assert.match(none.hint, /录入|登录/)
  const missing = withPlan({}, () => probeAccess({ ghBin: join(dir, 'nope-gh'), probeTimeoutMs: 1000 }))
  assert.equal(missing.code, 'GHO-LOCAL-CONFIG-02')
  assert.match(missing.hint, /gh/i)
})

test('probeTimeoutMs 缺省 3000（INV-5）', () => {
  assert.equal(DEFAULT_PROBE_TIMEOUT_MS, 3000)
})

test('switchActive 成功形：gh auth switch --user <login>（R-3 本机支持）', () => {
  const r = withPlan({ 'auth switch --user bob': { exit: 0 } }, () => switchActive('bob', { ghBin: fakeGh, timeoutMs: 2000 }))
  assert.equal(r.ok, true)
  assert.equal(r.stage, 'switch')
  assert.deepEqual(calls()[0].argv, ['auth', 'switch', '--user', 'bob'])
})

test('switchActive 降级：gh<2.20 无 auth switch → 手工切换 hint', () => {
  const r = withPlan({ 'auth switch --user bob': { exit: 1, stderr: 'unknown command "switch" for "gh auth"\n' } },
    () => switchActive('bob', { ghBin: fakeGh, timeoutMs: 2000 }))
  assert.equal(r.ok, false)
  assert.equal(r.code, 'GHO-SWITCH-08')
  assert.match(r.hint, /手工|手动/)
})

test('redact：git remote URL 凭据擦除 + token 形态扫描，普通文本不动', () => {
  assert.equal(redact('https://user:pass@github.com/o/r.git'), 'https://github.com/o/r.git')
  assert.equal(redact('git@github.com:o/r.git'), 'git@github.com:o/r.git')
  assert.equal(redact(`token=${FAKE_TOKEN} pat=github_pat_11AAAAAAAAAAAAAAAAAAAAAA end`), 'token=[REDACTED] pat=[REDACTED] end')
  assert.equal(redact('plain text stays'), 'plain text stays')
  assert.equal(redact('https://user:p@ss@host/x'), 'https://host/x')          // F-9 userinfo 含 @ 全擦
  assert.equal(redact('https://github.com/a/b?u=foo@bar'), 'https://github.com/a/b?u=foo@bar') // 路径邮箱安全
})

test('零明文总扫描：探针/写入/账号投影全链路无 token 形态串（P-10、INV-1）', () => {
  const results = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { stdout: JSON.stringify({ login: 'alice' }) },
    'api rate_limit': { stdout: RATE_OK },
    'auth login --with-token': { exit: 1, stderr: 'error validating token: HTTP 401: Bad credentials (https://api.github.com/)\n' },
    'auth switch --user alice': { exit: 0 },
  }, () => [
    probeAccess({ ghBin: fakeGh, probeTimeoutMs: 2000 }),
    writeToken(FAKE_TOKEN, { ghBin: fakeGh, timeoutMs: 2000 }),
    switchActive('alice', { ghBin: fakeGh, timeoutMs: 2000 }),
    listAccounts(HOSTS_YAML),
    parseHostsMeta(HOSTS_YAML),
  ])
  for (const [i, r] of results.entries()) assertNoPlaintext(r, `总扫描#${i}`)
})
