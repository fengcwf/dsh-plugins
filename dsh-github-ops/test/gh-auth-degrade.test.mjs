// gh-auth 退化形/失败形单测（Task 15 收口，与 gh-auth.test.mjs 分文件——后者 290 行近 300 上限）：
//   假 gh 慢响应超时分级（INV-5）+ 失败形 401/403/429/非零退出/写入失败分级归因（INV-10）
//   + F-7 遗留缺口（writeToken 网络错形 GHO-TOKEN-06 / switchActive 空 login / 畸形 hosts.yml 垃圾行·Tab /
//     probeAccess JSON 不可解析）+ 全链零明文（P-5/P-10/R-6）。
// 载入形：同 gh-auth.test.mjs 的假 gh 脚本（记录 argv/stdin/env，按 plan 供响应/延迟/退出码）。
// P-10 纪律：token 全为一次性假值（每用例独立取值、用后即换、绝不复用真实凭据）；断言输出零明文是硬验收。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  makeRunGh, parseHostsMeta, listAccounts, probeAccess, switchActive, writeToken,
} from '../lib/gh-auth.js'

// 一次性假值（形态=真实 token 形，令形态扫描也可捕获外泄；值仅本文件使用）
const ONCE_A = 'ghp_once_t15_alpha_0123456789abcd'
const ONCE_B = 'ghp_once_t15_bravo_0123456789abcd'
const ONCE_C = 'github_pat_once_t15_charlie_012345'
// 非 token 形态的一次性秘密：专咬 makeRunGh「stdin 秘密精确擦除」层（形态扫描抓不到的形，M3 探针实测缺口）
const ONCE_RAW = 'raw-once-t15-secret-Z7k2P9qL4nX8vB3m'
const ALL_SECRETS = [ONCE_A, ONCE_B, ONCE_C, ONCE_RAW]

const dir = mkdtempSync(join(tmpdir(), 'gh-auth-degrade-'))
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
if (entry.echoStdinToStderr) process.stderr.write(stdin)
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

// 零明文硬断言（P-5/P-10/R-6）：既定一次性假值 + token/PAT 形态串全扫
function assertNoPlaintext(value, label, secrets = ALL_SECRETS) {
  const s = JSON.stringify(value ?? null)
  for (const secret of secrets) assert.ok(!s.includes(secret), `${label}：明文泄露 ${secret}`)
  assert.ok(!/gh[pousr]_[A-Za-z0-9_]{16,}/.test(s), `${label}：token 形态串外泄`)
  assert.ok(!/github_pat_[A-Za-z0-9_]{16,}/.test(s), `${label}：PAT 形态串外泄`)
}

const STATUS_OK = JSON.stringify({ hosts: { 'github.com': [{ state: 'active', active: true, host: 'github.com', login: 'alice', gitProtocol: 'https', tokenSource: 'hosts.yml' }] } })
const USER_OK = JSON.stringify({ login: 'alice' })
const RATE_OK = JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, reset: 1700000000 }, search: { limit: 30, remaining: 29, reset: 1700000001 } } })

// ── 超时形（INV-5）：>probeTimeoutMs/timeoutMs 分级出结果、绝不挂死 ──

test('超时形@探针阶段①③：慢响应 >probeTimeoutMs → 分级结果 GHO-…-01 + 超时 hint + 不挂死', () => {
  const t0 = Date.now()
  const slow1 = withPlan({ 'auth status --json hosts': { sleepMs: 2500 } }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 800 }))
  assert.equal(slow1.ok, false)
  assert.equal(slow1.stage, 'local-config')
  assert.equal(slow1.code, 'GHO-LOCAL-CONFIG-01')
  assert.match(slow1.hint, /超时/)
  assert.ok(Date.now() - t0 < 2200, `阶段①超时分级须远早于 sleepMs 返回（${Date.now() - t0}ms）`)
  const slow3 = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { stdout: USER_OK },
    'api rate_limit': { sleepMs: 2500 },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 800 }))
  assert.equal(slow3.code, 'GHO-LATENCY-QUOTA-01', '阶段③超时归因落 latency-quota')
  assert.equal(slow3.stage, 'latency-quota')
  assert.match(slow3.hint, /probeTimeoutMs/, '超时 hint 指向可调参（INV-5 修复指引）')
  assertNoPlaintext(slow3, '超时分级结果')
})

test('超时形@写 token（R-1 同法钉死失败形）：慢响应 → GHO-TOKEN-01 分级 + 不挂死 + 零明文', () => {
  const t0 = Date.now()
  const r = withPlan({ 'auth login --with-token': { sleepMs: 2500 } }, () => writeToken(ONCE_A, { ghBin: fakeGh, timeoutMs: 800 }))
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'token')
  assert.equal(r.code, 'GHO-TOKEN-01')
  assert.match(r.hint, /超时/)
  assert.ok(Date.now() - t0 < 2200, `写入超时分级须有界返回（${Date.now() - t0}ms）`)
  assertNoPlaintext(r, 'writeToken 超时结果')
})

// ── 失败形分级（INV-10）：401/403/429/非零退出/写入失败 → 结构化归因 + stderr 敏感串不透传 ──

test('失败形 403@auth-connect（F-7）→ GHO-AUTH-CONNECT-04 权限归因 + stderr 含密也不透传', () => {
  const r = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { exit: 1, stderr: `HTTP 403: Forbidden (https://api.github.com/user) token=${ONCE_B}\n` },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1500 }))
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'auth-connect')
  assert.equal(r.code, 'GHO-AUTH-CONNECT-04')
  assert.equal(r.status, 403)
  assert.match(r.hint, /权限不足|scope/)
  assert.equal(typeof r.message, 'string')
  assertNoPlaintext(r, '403 归因结果')
})

test('失败形 429@auth-connect → GHO-AUTH-CONNECT-05 限额归因；非零退出（无 HTTP 线索）→ GHO-…-99 未知归因', () => {
  const limited = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { exit: 1, stderr: 'gh: HTTP 429: API rate limit exceeded for user\n' },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1500 }))
  assert.equal(limited.code, 'GHO-AUTH-CONNECT-05')
  assert.equal(limited.status, 429)
  assert.match(limited.hint, /限额/)
  const weird = withPlan({
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { exit: 2, stderr: 'gh: unknown network glitch\nsecond line ignored\n' },
  }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1500 }))
  assert.equal(weird.code, 'GHO-AUTH-CONNECT-99', '无 HTTP 线索的非零退出=unknown 分级')
  assert.equal(weird.ok, false)
  assert.equal(weird.message, 'gh: unknown network glitch', 'message=stderr 首行（多行不整段透传）')
  assertNoPlaintext(limited, '429 归因结果')
  assertNoPlaintext(weird, 'unknown 归因结果')
})

test('失败形写入（F-7）：writeToken 网络错形 → GHO-TOKEN-06 结构化归因 + 零明文', () => {
  const r = withPlan({
    'auth login --with-token': { exit: 1, stderr: `Post "https://github.com/login/oauth/access_token": dial tcp: i/o timeout auth=${ONCE_C}\n` },
  }, () => writeToken(ONCE_A, { ghBin: fakeGh, timeoutMs: 1500 }))
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'token')
  assert.equal(r.code, 'GHO-TOKEN-06')
  assert.match(r.hint, /写入失败/)
  assert.equal(typeof r.message, 'string')
  assertNoPlaintext(r, 'writeToken 网络错形')
})

test('switchActive 空 login（F-7）：拒绝执行零调用 + GHO-SWITCH-06 可见指引', () => {
  for (const empty of ['', '   ', null, undefined]) {
    const r = withPlan({}, () => switchActive(empty, { ghBin: fakeGh, timeoutMs: 1500 }))
    assert.equal(r.ok, false)
    assert.equal(r.code, 'GHO-SWITCH-06')
    assert.match(r.hint, /login 为空/)
    assert.equal(calls().length, 0, '空 login 不得触发任何 gh 调用')
    assertNoPlaintext(r, 'switchActive 空 login')
  }
})

test('probeAccess JSON 不可解析（F-7）→ GHO-LOCAL-CONFIG-99 结构化归因', () => {
  const r = withPlan({ 'auth status --json hosts': { stdout: 'not-json{{{', exit: 0 } }, () => probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1500 }))
  assert.equal(r.ok, false)
  assert.equal(r.stage, 'local-config')
  assert.equal(r.code, 'GHO-LOCAL-CONFIG-99')
  assert.match(r.message, /无法解析/)
  assertNoPlaintext(r, 'JSON 不可解析归因')
})

// ── 畸形 hosts.yml（垃圾行/Tab，F-7）：不炸 + 零明文 + 不伪造凭据（gh 的 YAML 解析器同样拒 tab 缩进）──

test('畸形 hosts.yml（垃圾行）：垃圾行不入投影、纯垃圾=空投影、零明文', () => {
  const garbageOnly = '!!! not yaml @@@\n???\n:::\n---\n::bad::\n'
  assert.deepEqual(parseHostsMeta(garbageOnly), { hosts: [] }, '纯垃圾行=空投影')
  assert.deepEqual(listAccounts(garbageOnly), [])
  const mixed = `github.com:
    user: alice
    oauth_token: ${ONCE_A}
    git_protocol: https
!!! garbage line ###
`
  const meta = parseHostsMeta(mixed)
  assert.deepEqual(meta.hosts.map((h) => h.host), ['github.com'], '垃圾行不产生幻影 host')
  assert.equal(meta.hosts[0].hasToken, true)
  assert.deepEqual(listAccounts(mixed), [{ login: 'alice', active: true, configured: true, verified: false }])
  assertNoPlaintext(meta, '畸形（垃圾行）投影')
  assertNoPlaintext(listAccounts(mixed), '畸形（垃圾行）账号投影')
})

test('畸形 hosts.yml（Tab 缩进）：不炸 + 零明文 + 不伪造凭据（hasToken/configured 不得误报 true）', () => {
  const tabbed = `github.com:
\toauth_token: ${ONCE_A}
\tuser: alice
\tusers:
\t- alice
`
  let meta
  assert.doesNotThrow(() => { meta = parseHostsMeta(tabbed) }, '畸形（Tab 缩进）绝不抛异常')
  const accounts = listAccounts(tabbed)
  assert.equal(meta.hosts.every((h) => h.hasToken === false), true, 'tab 缩进=gh 同判不可用：不得伪造凭据在位')
  assert.equal(accounts.every((a) => a.configured === false), true, '不得伪造 configured')
  assertNoPlaintext(meta, '畸形（Tab）投影')
  assertNoPlaintext(accounts, '畸形（Tab）账号投影')
})

// ── 全链零明文（P-5/P-10/R-6）：argv / 返回值 / 假 gh 最坏回显（stdin 回声）全扫一 ──

test('全链零明文：一次性假 token 经 stdin 写入，argv/返回值零明文（最坏回显也被擦除）', () => {
  const results = withPlan({
    'auth login --with-token': { echoStdin: true, echoStdinToStderr: true, exit: 1, stderr: `error validating token: HTTP 401: Bad credentials\n` },
    'auth status --json hosts': { stdout: STATUS_OK },
    'api user': { echoStdinToStderr: true, exit: 1, stderr: 'HTTP 401: Bad credentials\n' },
  }, () => [
    writeToken(ONCE_B, { ghBin: fakeGh, timeoutMs: 1500 }),
    writeToken(ONCE_RAW, { ghBin: fakeGh, timeoutMs: 1500 }), // 非形态秘密：咬 stdin 精确擦除层（M3 缺口补咬）
    probeAccess({ ghBin: fakeGh, probeTimeoutMs: 1500 }),
    parseHostsMeta(`github.com:\n    oauth_token: ${ONCE_C}\n    user: alice\n`),
    listAccounts(`github.com:\n    oauth_token: ${ONCE_C}\n    user: alice\n`),
  ])
  // ① argv 永不含 token（stdin 是唯一传输通道）；env 恒定
  for (const c of calls()) {
    assertNoPlaintext({ argv: c.argv, env: c.env }, '假 gh 调用记录（argv/env）')
  }
  const argvs = calls().map((c) => c.argv.join(' ')).join(' | ')
  assert.ok(argvs.includes('auth login --with-token'), '调用面确实发生过（断言非真空转）')
  // ② 返回值/投影零明文（假 gh 把 stdin 回声进 stdout/stderr 的最坏形也被擦除）
  for (const [i, r] of results.entries()) assertNoPlaintext(r, `全链返回值#${i}`)
  const [write] = results
  assert.ok(write.message.includes('HTTP 401'), '归因信息保真（擦除的是凭据不是错误事实）')
})
