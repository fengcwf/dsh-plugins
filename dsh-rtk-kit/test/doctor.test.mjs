import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_TIMEOUT_MS,
  HEALTH_ITEMS,
  INSTALL_HINT,
  buildArgv,
  checkBinaryExec,
  checkCompressionEffective,
  checkFailOpen,
  checkGainSource,
  checkGuardMatrix,
  checkRewriteSeam,
  checkVersionParse,
  execRtk,
  getGain,
  getHealth,
  getVersion,
  runDoctorTool,
} from '../lib/doctor.js'
import {
  API_PREFIX,
  INSTALL_ERROR_STATUS,
  appendInstallRecord,
  createDoctorHandlers,
  readLastInstall,
} from '../lib/doctor-routes.js'
import {
  CHECKSUM_MISMATCH,
  DOWNLOAD_FAILED,
  EXTRACT_FAILED,
  INSTALL_ERROR_CODES,
  InstallError,
  PLATFORM_UNSUPPORTED,
  REINSTALL_IN_PROGRESS,
  RTK_ASSET,
  VERIFY_FAILED,
  WRITE_FAILED,
  buildInstallRecord,
  isReinstallInFlight,
  releaseAssetUrl,
  reinstallRtk,
} from '../lib/install.js'

/** 记录调用形的假 execFile（执行器注入缝；测试零 node:child_process、零真实 rtk）。 */
function fakeExec(impl) {
  const calls = []
  const exec = async (file, args, opts) => {
    calls.push({ file, args, opts })
    return impl(file, args, opts)
  }
  return { exec, calls }
}

/** 模拟 execFile 超时被 SIGTERM 杀死的 reject 形（不真等 5 秒）。 */
function timeoutError() {
  const e = new Error('Command failed: rtk')
  e.killed = true
  e.signal = 'SIGTERM'
  e.code = null
  return e
}

// ───────────────────────── argv 白名单（INV-7） ─────────────────────────

test('buildArgv：四个白名单动作各回固定 argv', () => {
  assert.deepEqual(buildArgv('version'), ['rtk', '--version'])
  assert.deepEqual(buildArgv('gain'), ['rtk', 'gain', '-a', '-f', 'json'])
  assert.deepEqual(buildArgv('rewrite'), ['rtk', 'rewrite', 'git status'])
  assert.deepEqual(buildArgv('config'), ['rtk', 'config'])
  // rtkBin 经参数传入（照 config.rtkBin 语义），不硬编码
  assert.deepEqual(buildArgv('version', '/root/.local/bin/rtk'), ['/root/.local/bin/rtk', '--version'])
})

test('buildArgv：未知动作一律拒绝（含 run/echo/带 --reset 输入/原型链键）', () => {
  for (const bad of [
    'run', 'echo', 'health', 'gain --reset', '--reset', 'version --reset', 'rtk run',
    '', '  ', 'constructor', '__proto__', 'toString', 'hasOwnProperty',
    undefined, null, 1, ['gain'],
  ]) {
    assert.throws(() => buildArgv(bad), undefined, `应拒绝：${String(bad)}`)
  }
})

test('buildArgv：返回值零 --reset、零 run 子命令、零拼接形态', () => {
  for (const action of ['version', 'gain', 'rewrite', 'config']) {
    const argv = buildArgv(action)
    assert.ok(Array.isArray(argv) && argv.length >= 2, action)
    assert.ok(argv.every((s) => typeof s === 'string'), action)
    assert.ok(argv.every((s) => !s.includes('--reset')), action)
    assert.ok(!argv.includes('run'), action)
    assert.ok(argv.every((s) => !/\s/.test(s.replace(/^git status$/, ''))), `${action}：除固定探针外零空白拼接`)
  }
})

// ───────────────────────── execRtk 异步封装（INV-5 / ADR-004） ─────────────────────────

test('execRtk：默认 timeoutMs=5000，argv 按 ADR-004 形拆给 execFile', async () => {
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0', stderr: '' }))
  const r = await execRtk(buildArgv('version', '/root/.local/bin/rtk'), { exec })
  assert.deepEqual(r, { code: 0, stdout: 'rtk 0.49.0', stderr: '' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, '/root/.local/bin/rtk')
  assert.deepEqual(calls[0].args, ['--version'])
  assert.deepEqual(calls[0].opts, { timeout: 5000 })
  assert.equal(DEFAULT_TIMEOUT_MS, 5000)
})

test('execRtk：timeoutMs 可覆盖并透传', async () => {
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: '', stderr: '' }))
  await execRtk(['rtk', '--version'], { exec, timeoutMs: 1234 })
  assert.deepEqual(calls[0].opts, { timeout: 1234 })
})

test('execRtk：非零退出也 resolve {code,stdout,stderr}（不信 rc，0.49.0 改写成功码=3）', async () => {
  const { exec } = fakeExec(async () => ({ code: 3, stdout: 'rtk git status', stderr: '' }))
  const r = await execRtk(buildArgv('rewrite'), { exec })
  assert.deepEqual(r, { code: 3, stdout: 'rtk git status', stderr: '' })
})

test('execRtk：超时 reject 归 RTK_TIMEOUT', async () => {
  const { exec } = fakeExec(async () => {
    throw timeoutError()
  })
  await assert.rejects(execRtk(['rtk', '--version'], { exec }), (err) => {
    assert.equal(err.code, 'RTK_TIMEOUT')
    return true
  })
})

test('execRtk：spawn 级失败 reject 归 RTK_UNAVAILABLE', async () => {
  for (const kind of ['ENOENT', 'EACCES']) {
    const e = new Error(`spawn ${kind}`)
    e.code = kind
    const { exec } = fakeExec(async () => {
      throw e
    })
    await assert.rejects(execRtk(['rtk', '--version'], { exec }), (err) => {
      assert.equal(err.code, 'RTK_UNAVAILABLE')
      return true
    })
  }
})

test('execRtk：非法 argv 直接拒绝（不落 execFile）', async () => {
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: '', stderr: '' }))
  for (const bad of [undefined, null, [], 'rtk --version', [1, 2]]) {
    await assert.rejects(execRtk(bad, { exec }))
  }
  assert.equal(calls.length, 0)
})

// ───────────────────────── getVersion / getGain（proposal.md §4 数据形） ─────────────────────────

test('getVersion：可用 → 版本号 + 路径 + 可参性', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  assert.deepEqual(await getVersion({ exec, rtkBin: '/root/.local/bin/rtk' }), {
    available: true,
    version: '0.49.0',
    path: '/root/.local/bin/rtk',
    hint: null,
  })
})

test('getVersion：rtk 缺失降级 → available:false + 安装提示字段（US-1）', async () => {
  const e = new Error('spawn ENOENT')
  e.code = 'ENOENT'
  const { exec } = fakeExec(async () => {
    throw e
  })
  // F-02 注入（同步修 fixture）：resolveEnv 全缺失缝——断言原文不动，注入只为摆脱真机 rtk 干扰
  const r = await getVersion({ exec, rtkBin: 'rtk', resolveEnv: allMissingEnv() })
  assert.equal(r.available, false)
  assert.equal(r.version, null)
  assert.equal(r.path, 'rtk')
  assert.equal(r.hint, INSTALL_HINT)
  assert.ok(r.hint.includes('install'))
})

test('getVersion：超时如实上抛 RTK_TIMEOUT（供 UI 重试，INV-5）', async () => {
  const { exec } = fakeExec(async () => {
    throw timeoutError()
  })
  await assert.rejects(getVersion({ exec }), (err) => err.code === 'RTK_TIMEOUT')
})

test('getVersion：stdout 不可解析 → available:true + version:null（不抛错）', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'garbage output', stderr: '' }))
  const r = await getVersion({ exec })
  assert.equal(r.available, true)
  assert.equal(r.version, null)
})

test('getGain：summary 指标对象 + 日/周/月周期序列（全局口径 -a）', async () => {
  const payload = {
    summary: {
      total_commands: 10, total_input: 100, total_output: 50, total_saved: 60,
      avg_savings_pct: 35.5, total_time_ms: 1234, avg_time_ms: 12,
    },
    daily: [{ date: '2026-09-29', commands: 1, input_tokens: 10, output_tokens: 5, saved_tokens: 6, savings_pct: 30, total_time_ms: 100, avg_time_ms: 10 }],
    weekly: [{ week_start: '2026-09-22', week_end: '2026-09-28', commands: 2, input_tokens: 20, output_tokens: 10, saved_tokens: 12, savings_pct: 32, total_time_ms: 200, avg_time_ms: 10 }],
    monthly: [{ month: '2026-09', commands: 3, input_tokens: 30, output_tokens: 15, saved_tokens: 18, savings_pct: 33, total_time_ms: 300, avg_time_ms: 10 }],
  }
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: JSON.stringify(payload), stderr: '' }))
  const g = await getGain({ exec })
  assert.deepEqual(calls[0].args, ['gain', '-a', '-f', 'json'])
  assert.deepEqual(g, payload)
})

test('getGain：缺字段容错 → 缺失指标回 null、缺周期回空数组（R-3 占位）', async () => {
  const { exec } = fakeExec(async () => ({ code: 0, stdout: JSON.stringify({ summary: { total_commands: 5 } }), stderr: '' }))
  const g = await getGain({ exec })
  assert.equal(g.summary.total_commands, 5)
  assert.equal(g.summary.total_input, null)
  assert.equal(g.summary.avg_savings_pct, null)
  assert.deepEqual(g.daily, [])
  assert.deepEqual(g.weekly, [])
  assert.deepEqual(g.monthly, [])
})

test('getGain：JSON 解析失败 → RTK_ERROR；rtk 缺失 → RTK_UNAVAILABLE', async () => {
  const bad = fakeExec(async () => ({ code: 0, stdout: 'not json at all', stderr: '' }))
  await assert.rejects(getGain({ exec: bad.exec }), (err) => err.code === 'RTK_ERROR')
  const e = new Error('spawn ENOENT')
  e.code = 'ENOENT'
  const missing = fakeExec(async () => {
    throw e
  })
  await assert.rejects(getGain({ exec: missing.exec }), (err) => err.code === 'RTK_UNAVAILABLE')
})

// ───────────────────────── 健康八项（INV-4 零污染法，Round 3 +rewrite-mounted） ─────────────────────────

const NOW = new Date('2026-09-29T12:00:00.000Z')
const FIXED_NOW = () => NOW

/** 临时 sqlite fixture（假 commands 表；列可裁剪以测缺列）。 */
function makeFixtureDb(rows, { columns = 'timestamp TEXT, savings_pct REAL' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-doctor-'))
  const dbPath = path.join(dir, 'history.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TABLE commands (${columns})`)
  for (const row of rows) {
    const keys = Object.keys(row)
    db.prepare(`INSERT INTO commands (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => row[k]))
  }
  db.close()
  return dbPath
}

const assertItemShape = (it, id) => {
  assert.equal(it.id, id)
  assert.equal(typeof it.label, 'string')
  assert.ok(it.status === 'pass' || it.status === 'fail')
  assert.equal(typeof it.detail, 'string')
}

test('checkBinaryExec：假 execFile ENOENT → fail；spawn 成功 → pass', async () => {
  const e = new Error('spawn ENOENT')
  e.code = 'ENOENT'
  const bad = fakeExec(async () => {
    throw e
  })
  const failItem = await checkBinaryExec({ exec: bad.exec })
  assertItemShape(failItem, 'binary-exec')
  assert.equal(failItem.status, 'fail')

  const ok = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0', stderr: '' }))
  const passItem = await checkBinaryExec({ exec: ok.exec })
  assertItemShape(passItem, 'binary-exec')
  assert.equal(passItem.status, 'pass')
})

test('checkVersionParse：版本行可解析 → pass；垃圾输出 → fail', async () => {
  const ok = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const passItem = await checkVersionParse({ exec: ok.exec })
  assertItemShape(passItem, 'version-parse')
  assert.equal(passItem.status, 'pass')
  assert.ok(passItem.detail.includes('0.49.0'))

  const bad = fakeExec(async () => ({ code: 0, stdout: 'what??', stderr: '' }))
  const failItem = await checkVersionParse({ exec: bad.exec })
  assert.equal(failItem.status, 'fail')
})

test('checkRewriteSeam：^rtk 非空 stdout → pass（不信 rc）；空/非 rtk 形 → fail；探针 argv 固定非透传', async () => {
  const ok = fakeExec(async () => ({ code: 3, stdout: 'rtk git status', stderr: '' }))
  const passItem = await checkRewriteSeam({ exec: ok.exec })
  assertItemShape(passItem, 'rewrite-seam')
  assert.equal(passItem.status, 'pass')
  assert.deepEqual(ok.calls[0].args, ['rewrite', 'git status']) // 固定探针：不执行样本命令

  const empty = fakeExec(async () => ({ code: 0, stdout: '\n', stderr: '' }))
  assert.equal((await checkRewriteSeam({ exec: empty.exec })).status, 'fail')

  const notRtk = fakeExec(async () => ({ code: 3, stdout: 'git status', stderr: '' }))
  assert.equal((await checkRewriteSeam({ exec: notRtk.exec })).status, 'fail')
})

test('checkGuardMatrix / checkFailOpen：守卫矩阵与 fail-open 链路纯函数判定 → pass', () => {
  const guard = checkGuardMatrix()
  assertItemShape(guard, 'guard-matrix')
  assert.equal(guard.status, 'pass', guard.detail)
  const failOpen = checkFailOpen()
  assertItemShape(failOpen, 'fail-open')
  assert.equal(failOpen.status, 'pass', failOpen.detail)
})

test('checkGainSource：gain -a -f json 可解析 → pass；垃圾输出 / rtk 缺失 → fail', async () => {
  const ok = fakeExec(async () => ({ code: 0, stdout: JSON.stringify({ summary: { total_commands: 1 } }), stderr: '' }))
  const passItem = await checkGainSource({ exec: ok.exec })
  assertItemShape(passItem, 'gain-source')
  assert.equal(passItem.status, 'pass')
  assert.deepEqual(ok.calls[0].args, ['gain', '-a', '-f', 'json'])

  const garbage = fakeExec(async () => ({ code: 0, stdout: 'nope', stderr: '' }))
  assert.equal((await checkGainSource({ exec: garbage.exec })).status, 'fail')

  const e = new Error('spawn ENOENT')
  e.code = 'ENOENT'
  const missing = fakeExec(async () => {
    throw e
  })
  assert.equal((await checkGainSource({ exec: missing.exec })).status, 'fail')
})

test('checkCompressionEffective：savings_pct>0 且 COUNT>0 → pass；空表 → fail（INV-4 零污染）', async () => {
  const good = makeFixtureDb([
    { timestamp: '2026-09-28T00:00:00+00:00', savings_pct: 40 },
    { timestamp: '2026-09-20T00:00:00+00:00', savings_pct: 20 },
  ])
  const passItem = await checkCompressionEffective({ historyDb: good, now: FIXED_NOW })
  assertItemShape(passItem, 'compression-effective')
  assert.equal(passItem.status, 'pass', passItem.detail)

  const empty = makeFixtureDb([])
  const failItem = await checkCompressionEffective({ historyDb: empty, now: FIXED_NOW })
  assert.equal(failItem.status, 'fail')
})

test('checkCompressionEffective：近 30 天窗口 / AVG=0 / 缺列 / 缺表 / 读失败 → fail 如实回显（R-1）', async () => {
  const stale = makeFixtureDb([{ timestamp: '2026-08-01T00:00:00+00:00', savings_pct: 40 }])
  assert.equal((await checkCompressionEffective({ historyDb: stale, now: FIXED_NOW })).status, 'fail')

  const zeroAvg = makeFixtureDb([{ timestamp: '2026-09-28T00:00:00+00:00', savings_pct: 0 }])
  assert.equal((await checkCompressionEffective({ historyDb: zeroAvg, now: FIXED_NOW })).status, 'fail')

  const noCol = makeFixtureDb([], { columns: 'timestamp TEXT' })
  const noColItem = await checkCompressionEffective({ historyDb: noCol, now: FIXED_NOW })
  assert.equal(noColItem.status, 'fail')
  assert.ok(noColItem.detail.includes('savings_pct'), noColItem.detail)

  const noTable = makeFixtureDb([], { columns: 'timestamp TEXT, savings_pct REAL' })
  fs.rmSync(noTable)
  const noTableItem = await checkCompressionEffective({ historyDb: noTable, now: FIXED_NOW })
  assert.equal(noTableItem.status, 'fail')
  assert.ok(noTableItem.detail.length > 0)

  const throwItem = await checkCompressionEffective({
    now: FIXED_NOW,
    readHistory: async () => {
      throw new Error('db is locked')
    },
  })
  assert.equal(throwItem.status, 'fail')
  assert.ok(throwItem.detail.includes('db is locked'), throwItem.detail)
})

test('checkCompressionEffective：注入读取器收到 30 天窗口 since', async () => {
  const seen = {}
  const item = await checkCompressionEffective({
    now: FIXED_NOW,
    readHistory: async (q) => {
      Object.assign(seen, q)
      return { count: 2, avgSavingsPct: 25 }
    },
  })
  assert.equal(item.status, 'pass')
  assert.equal(seen.since, new Date(NOW.getTime() - 30 * 24 * 3600 * 1000).toISOString())
})

test('getHealth：八项结果数组定序 {id,label,status,detail}，exec 面零样本命令执行', async () => {
  const dbPath = makeFixtureDb([{ timestamp: '2026-09-28T00:00:00+00:00', savings_pct: 33 }])
  const { exec, calls } = fakeExec(async (file, args) => {
    if (args[0] === 'gain') {
      return { code: 0, stdout: JSON.stringify({ summary: { total_commands: 9 } }), stderr: '' }
    }
    return { code: 0, stdout: 'rtk 0.49.0', stderr: '' }
  })
  const items = await getHealth({ exec, rtkBin: 'rtk', historyDb: dbPath, now: FIXED_NOW })
  assert.equal(items.length, 8)
  assert.deepEqual(
    items.map((it) => it.id),
    HEALTH_ITEMS.map((it) => it.id),
  )
  assert.deepEqual(items.map((it) => it.id), [
    'binary-exec', 'version-parse', 'rewrite-seam', 'rewrite-mounted', 'guard-matrix',
    'fail-open', 'gain-source', 'compression-effective',
  ])
  for (const it of items) assert.ok(it.status === 'pass' || it.status === 'fail', it.id)
  // 零污染：所有 exec 调用只能是白名单固定形（防样本命令/透传执行）
  for (const c of calls) {
    assert.ok(
      ['version', 'gain', 'rewrite', 'config'].some((a) => {
        const expect = [c.file, ...buildArgv(a, c.file).slice(1)]
        return JSON.stringify([c.file, ...c.args]) === JSON.stringify(expect)
      }),
      `非白名单 argv：${JSON.stringify(c)}`,
    )
  }
})

test('getHealth：rtk 全缺失也绝不抛错，exec 面项如实 fail（fail-open）', async () => {
  const e = new Error('spawn ENOENT')
  e.code = 'ENOENT'
  const { exec } = fakeExec(async () => {
    throw e
  })
  const items = await getHealth({
    exec,
    historyDb: '/nonexistent/history.db',
    now: FIXED_NOW,
    readHistory: async () => {
      throw new Error('db missing')
    },
  })
  assert.equal(items.length, 8)
  for (const it of items) assertItemShape(it, it.id)
  assert.equal(items.find((it) => it.id === 'binary-exec').status, 'fail')
  assert.equal(items.find((it) => it.id === 'gain-source').status, 'fail')
  assert.equal(items.find((it) => it.id === 'compression-effective').status, 'fail')
  assert.equal(items.find((it) => it.id === 'guard-matrix').status, 'pass')
  assert.equal(items.find((it) => it.id === 'rewrite-mounted').status, 'fail', '零挂载零命中=如实 fail（禁误导绿灯，Round 3）')
})

// ───────────────────────── rtk_doctor 轻诊断执行体（Task 8 瘦身 / INV-6） ─────────────────────────

/** 模拟二进制缺失的 spawn 级失败（ENOENT）。 */
function enoentError() {
  const e = new Error('spawn rtk ENOENT')
  e.code = 'ENOENT'
  return e
}

/**
 * 全缺失解析环境（2026-10-03-rtk-bin-discovery 注入缝）：mkdtemp 假 HOME + 空 PATH + 恒否可执行判定。
 * 用例断言原文不动——「全缺失」恰是 A4 真缺失态：(bin: rtk) + 安装提示；注入只为摆脱真机 rtk 干扰。
 */
function allMissingEnv() {
  return {
    path: '',
    homedir: fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-doctor-')),
    isExecutable: () => false,
  }
}

test('runDoctorTool 轻诊断三行形（可用性/版本/配置）：rtk 在场恰三行、只走 --version', async () => {
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const r = await runDoctorTool({}, { rtkBin: 'rtk', exec, autoRewrite: true, conservative: true, awareness: 'high', resolveEnv: allMissingEnv() })
  assert.deepEqual(r.text.split('\n'), [
    'rtk available: yes (bin: rtk)',
    'version: 0.49.0',
    'auto-rewrite: on | conservative: true | awareness: high',
  ])
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, ['--version'])
})

test('runDoctorTool：rtk 缺失软回可用行 + 安装提示（US-1 降级显示，不抛错）', async () => {
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = await runDoctorTool({}, { exec, resolveEnv: allMissingEnv() })
  assert.deepEqual(r.text.split('\n'), ['rtk available: no (bin: rtk)', INSTALL_HINT])
})

test('runDoctorTool gain 段渲染（doctorGain:true）：summary 指标 JSON；gain 输出坏 → (no data yet) 兜底', async () => {
  const { exec } = fakeExec(async (file, args) => {
    if (args.join(',') === '--version') return { code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }
    return { code: 0, stdout: JSON.stringify({ summary: { total_commands: 7, avg_savings_pct: 12.5 } }), stderr: '' }
  })
  const r = await runDoctorTool({}, { exec, doctorGain: true, resolveEnv: allMissingEnv() }) // R-03：解析注入缝，零真机探测
  const lines = r.text.split('\n')
  assert.equal(lines.length, 6)
  assert.equal(lines[3], '')
  assert.equal(lines[4], '--- rtk gain (summary) ---')
  // R-3 归一形：SUMMARY_METRICS 全键（缺失字段回 null）
  assert.deepEqual(JSON.parse(lines[5]), {
    total_commands: 7,
    total_input: null,
    total_output: null,
    total_saved: null,
    avg_savings_pct: 12.5,
    total_time_ms: null,
    avg_time_ms: null,
  })

  const bad = fakeExec(async (file, args) => {
    if (args.join(',') === '--version') return { code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }
    return { code: 0, stdout: 'not json', stderr: '' }
  })
  const r2 = await runDoctorTool({}, { exec: bad.exec, doctorGain: true, resolveEnv: allMissingEnv() }) // R-03：同上
  assert.deepEqual(r2.text.split('\n').slice(4), ['--- rtk gain (summary) ---', '(no data yet)'])
})

// ═══════════════ Task 2：F-02 两窗口 / POST install 路由面 / 记录面 / F-01（rtk-reinstall） ═══════════════
// 依据：changes/2026-10-03-rtk-reinstall/tasks.md Task 2 验收 1-7；constitution INV-1/INV-4/INV-5/INV-6/INV-9/INV-10。
// 测试红线（INV-8）：全 mkdtemp 注入，零真 home 读写。

/** mkdtemp 沙箱（零真 home）：记录面/落盘面注入落点。 */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-routes-test-'))
  return { dir, logPath: path.join(dir, 'install-log.json') }
}

/** 在场且可执行的假二进制（F-02 窗口 B fixture：找到但执行失败）。 */
function presentBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-found-test-'))
  const bin = path.join(dir, 'rtk')
  fs.writeFileSync(bin, '#!/bin/sh\necho "rtk 1.2.3"\n')
  fs.chmodSync(bin, 0o755)
  return bin
}

/** spawn 级失败（非超时）：执行失败窗口 fixture。 */
function spawnFailError(code = 'EACCES') {
  const e = new Error(`spawn ${code}`)
  e.code = code
  return e
}

// ───────────────────────── F-02：hint 与 found 同门控（INV-9 锁定两窗口） ─────────────────────────

test('F-02/INV-9 窗口A：真缺失（解析不到二进制）→ available:false + INSTALL_HINT', async () => {
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = await getVersion({ exec, rtkBin: 'rtk', resolveEnv: allMissingEnv() })
  assert.equal(r.available, false)
  assert.equal(r.hint, INSTALL_HINT, '真缺失带安装提示（hint 与 found 同门控）')
})

test('F-02/INV-9 窗口B：找到但执行失败 → available:false 且 hint:null（不带安装提示）', async () => {
  const bin = presentBin()
  const { exec } = fakeExec(async () => {
    throw spawnFailError('EACCES')
  })
  const r = await getVersion({ exec, rtkBin: bin })
  assert.equal(r.available, false)
  assert.equal(r.hint, null, 'A4：找到≠安装提示——执行失败窗口不带 INSTALL_HINT')
})

test('F-02/INV-9 工具输出同口径：找到但执行失败 → runDoctorTool 不输出「安装：」行', async () => {
  const bin = presentBin()
  const { exec } = fakeExec(async () => {
    throw spawnFailError('ENOEXEC')
  })
  const r = await runDoctorTool({}, { exec, rtkBin: bin, resolveEnv: { path: '', homedir: '' } })
  assert.deepEqual(r.text.split('\n'), [`rtk available: no (bin: ${bin})`], '数据面与工具输出同口径（F-02 闭环）')
})

// ───────────────────────── 记录面（INV-10 白名单 / fail-open） ─────────────────────────

test('记录面：追加写只落 INV-10 白名单字段（零凭据/token/env 明文），readLastInstall 回最近条目', async () => {
  const { logPath } = sandbox()
  const src = releaseAssetUrl(RTK_ASSET)
  const rec1 = buildInstallRecord({
    time: '2026-10-04T01:00:00.000Z',
    version: '1.0.0',
    source: src,
    ok: true,
    error: null,
    token: 'SECRET-TOKEN',
    password: 'hunter2',
    env: 'GITHUB_TOKEN=SECRET',
  })
  assert.deepEqual(await appendInstallRecord(logPath, rec1), rec1)
  const rec2 = buildInstallRecord({ time: '2026-10-04T02:00:00.000Z', version: '2.0.0', source: src, ok: false, error: DOWNLOAD_FAILED })
  assert.deepEqual(await appendInstallRecord(logPath, rec2), rec2)

  const raw = fs.readFileSync(logPath, 'utf8')
  assert.doesNotMatch(raw, /SECRET|hunter2/i, '零凭据/token/env 明文（INV-10）')
  assert.doesNotMatch(raw, /token|password|credential|authorization/i, '字段面零敏感键')
  const list = JSON.parse(raw)
  assert.equal(list.length, 2, '追加写不覆盖历史')
  for (const entry of list) {
    assert.deepEqual(Object.keys(entry).sort(), ['error', 'ok', 'source', 'time', 'version'], '条目仅含白名单字段')
  }
  const last = await readLastInstall(logPath)
  assert.deepEqual(last, rec2, '最近一条记录回显（US-5）')
})

test('记录面读取：缺失/损坏/空/形状错 → null 不炸（INV-4 fail-open）', async () => {
  const { logPath } = sandbox()
  assert.equal(await readLastInstall(logPath), null, '缺失 → null')
  fs.writeFileSync(logPath, '{损坏 json')
  assert.equal(await readLastInstall(logPath), null, '损坏 → null 不炸')
  fs.writeFileSync(logPath, '[]')
  assert.equal(await readLastInstall(logPath), null, '空数组 → null')
  fs.writeFileSync(logPath, '{"not":"array"}')
  assert.equal(await readLastInstall(logPath), null, '形状不对（非数组）→ null')
})

test('记录面读取：取最近一条并归一白名单（多余键零泄漏）', async () => {
  const { logPath } = sandbox()
  fs.writeFileSync(logPath, JSON.stringify([
    { time: 't1', version: '1.0.0', source: 'u', ok: true, error: null },
    { time: 't2', version: '2.0.0', source: 'u', ok: false, error: 'WRITE_FAILED', token: 'LEAK' },
  ]))
  const last = await readLastInstall(logPath)
  assert.deepEqual(last, { time: 't2', version: '2.0.0', source: 'u', ok: false, error: 'WRITE_FAILED' })
  assert.equal('token' in last, false, '读面归一白名单，零泄漏')
})

test('记录面 fail-open：写失败回 null 不抛（INV-4：安装结果不受记录写影响）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-rec-fail-'))
  const rec = buildInstallRecord({ time: 't', version: '1.0.0', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
  assert.equal(await appendInstallRecord(dir, rec), null, '落点是目录 → 写失败回 null 不抛')
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(`${path.basename(dir)}.tmp`)), [], '失败路径零 tmp 残渣')
})

// ───────────────────────── 记录面收口（Task 5：T2-F-1 截断 / T2-F-2 残留+留痕 / T3-nit 写名形） ─────────────────────────

test('记录面上限（T2-F-1）：写时截断保留最近 50 条（超限丢最旧，追加语义不破）', async () => {
  const { logPath } = sandbox()
  const src = releaseAssetUrl(RTK_ASSET)
  const seed = []
  for (let i = 1; i <= 60; i += 1) seed.push({ time: `t${i}`, version: `${i}.0.0`, source: src, ok: true, error: null })
  fs.writeFileSync(logPath, JSON.stringify(seed))
  await appendInstallRecord(logPath, buildInstallRecord({ time: 't61', version: '61.0.0', source: src, ok: true, error: null }))
  const list = JSON.parse(fs.readFileSync(logPath, 'utf8'))
  assert.equal(list.length, 50, '写时截断：上限 50 条（不随追加永续增长）')
  assert.equal(list[49].version, '61.0.0', '最新条目在尾部')
  assert.equal(list[0].version, '12.0.0', '最旧按序丢弃（保留最近 50 = t12..t61）')
  await appendInstallRecord(logPath, buildInstallRecord({ time: 't62', version: '62.0.0', source: src, ok: true, error: null }))
  const list2 = JSON.parse(fs.readFileSync(logPath, 'utf8'))
  assert.equal(list2.length, 50, '再次追加仍 50 条（截断每写必跑）')
  assert.equal(list2[0].version, '13.0.0', '再丢一条最旧')
})

test('记录面残留清理（T2-F-2①）：陈旧 `.tmp-<pid>-<ts>` 残留追加前清走（crash 残渣不永续累积）', async () => {
  const { dir, logPath } = sandbox()
  fs.writeFileSync(`${logPath}.tmp-9999-1700000000000`, '{半截写入')
  const rec = buildInstallRecord({ time: 't', version: '1.0.0', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
  assert.deepEqual(await appendInstallRecord(logPath, rec), rec)
  assert.deepEqual(fs.readdirSync(dir).sort(), ['install-log.json'], '陈旧 tmp 清走、零残留')
  assert.equal((await readLastInstall(logPath)).version, '1.0.0', '本次条目照常落盘')
})

test('记录面重起账留痕（T2-F-2②）：损坏/形状错重起账补 warn（与读面口径对齐：缺失静默、损坏留痕）', async () => {
  const { logPath } = sandbox()
  const warns = []
  const warn = (m) => warns.push(String(m))
  const rec = buildInstallRecord({ time: 't', version: '1.0.0', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
  await appendInstallRecord(logPath, rec, warn) // 缺失态首次写
  assert.deepEqual(warns, [], '缺失=静默（与读面 ENOENT 静默同口径）')
  fs.writeFileSync(logPath, '{损坏 json')
  await appendInstallRecord(logPath, rec, warn)
  assert.equal(warns.length, 1, '损坏=留痕恰一（与读面 warn 口径对齐）')
  assert.match(warns[0], /重装记录读取失败/, 'warn 文案与 readLastInstall 同口径')
  assert.equal(JSON.parse(fs.readFileSync(logPath, 'utf8')).length, 1, '重起账后只含本次条目（历史丢但留痕）')
  fs.writeFileSync(logPath, '{"not":"array"}')
  await appendInstallRecord(logPath, rec, warn)
  assert.equal(warns.length, 2, '形状错=同样留痕（归损坏口径）')
  assert.equal(JSON.parse(fs.readFileSync(logPath, 'utf8')).length, 1, '形状错同样重起账')
})

test('记录面 confinedFs 写名形断言（T3-nit）：fsp 写面仅 logPath 与 `.tmp-<pid>-<ts>` 形（零越界写）', async () => {
  const { dir, logPath } = sandbox()
  fs.writeFileSync(`${logPath}.tmp-9999-1700000000000`, '{残留') // 让清理路径也进写面记录
  const rec = buildInstallRecord({ time: 't', version: '1.0.0', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
  const writes = []
  const orig = {}
  for (const key of ['writeFile', 'rename', 'rm', 'mkdir']) {
    orig[key] = fsp[key]
    fsp[key] = (...args) => {
      // 只录路径形实参：writeFile(tmp, content) 的第二参是 JSON 载荷不是路径；rename 两参皆路径
      writes.push({ key, paths: key === 'rename' ? [args[0], args[1]] : [args[0]] })
      return orig[key](...args)
    }
  }
  try {
    assert.deepEqual(await appendInstallRecord(logPath, rec), rec)
  } finally {
    for (const key of Object.keys(orig)) fsp[key] = orig[key]
  }
  assert.ok(writes.length > 0, '写面有调用（审计非空转）')
  const tmpShape = (p) => p.startsWith(`${logPath}.tmp-`) && /^\d+-\d+$/.test(p.slice(`${logPath}.tmp-`.length))
  for (const { key, paths } of writes) {
    for (const p of paths) {
      assert.ok(p === logPath || p === dir || tmpShape(p), `记录面写越界（confinedFs 写名形）：${key} ${p}`)
    }
  }
  assert.ok(writes.some(({ paths }) => paths.some(tmpShape)), 'tmp 形写在场（`.tmp-<pid>-<ts>` 名形锁）')
  assert.deepEqual(fs.readdirSync(dir).sort(), ['install-log.json'], '收尾仅 logPath 在场（tmp 零残留）')
})

// ───────────────────────── POST install 路由面（INV-1/INV-5/INV-6/INV-7 + US-3） ─────────────────────────

/** 假 req：body/on/read/迭代器全部计数——body 一旦被读即计数（INV-7 同形断言）。 */
function makeReq({ method = 'POST', url = `${API_PREFIX}/install`, headers = { 'x-test': '1' } } = {}) {
  const reads = { count: 0 }
  return {
    method,
    url,
    headers,
    reads,
    get body() {
      reads.count += 1
      return '{"evil":"--reset","cmd":"rm -rf /"}'
    },
    on() {
      reads.count += 1
    },
    read() {
      reads.count += 1
    },
    async *[Symbol.asyncIterator]() {
      reads.count += 1
      yield Buffer.from('{}')
    },
  }
}

/** 假 res（捕获状态/头/信封体）。 */
function makeRes() {
  const res = {
    status: null,
    headers: {},
    body: null,
    writeHead(status, headers) {
      res.status = status
      Object.assign(res.headers, headers ?? {})
      return res
    },
    setHeader(k, v) {
      res.headers[k] = v
    },
    end(data) {
      res.body = data == null ? null : JSON.parse(String(data))
      return res
    },
  }
  return res
}

/** 路由依赖底座（全注入，零真 home）。 */
function baseDeps(logPath, over = {}) {
  return {
    connection: { requestRejection: () => undefined },
    rtkBin: '/opt/rtk/bin/rtk',
    warn: () => {},
    platform: 'linux',
    arch: 'x64',
    installOpts: { logPath },
    ...over,
  }
}

async function callInstall(deps, reqOver) {
  const handlers = createDoctorHandlers(deps)
  const res = makeRes()
  await handlers.install(makeReq(reqOver), res)
  return res
}

async function callVersion(deps) {
  const handlers = createDoctorHandlers(deps)
  const res = makeRes()
  await handlers.version(makeReq({ method: 'GET', url: `${API_PREFIX}/version` }), res)
  return res
}

/** 成功结果 fixture（引擎返回形照 T1 契约）。 */
function okResult(record, over = {}) {
  return {
    ok: true,
    verify: { available: true, version: '9.9.9', path: '/opt/rtk/bin/rtk', hint: null },
    targetPath: '/opt/rtk/bin/rtk',
    backupPath: '/opt/rtk/bin/rtk.bak.1770',
    record,
    ...over,
  }
}

test('POST install 鉴权（INV-1）：401/403 同形回拒不进业务面（引擎零调用）', async () => {
  for (const rejection of [401, 403]) {
    const { logPath } = sandbox()
    let called = 0
    const res = await callInstall(baseDeps(logPath, {
      connection: { requestRejection: () => rejection },
      installEngine: async () => {
        called += 1
        return okResult(buildInstallRecord({ ok: true }))
      },
    }))
    assert.equal(res.status, rejection)
    assert.equal(res.body.error.code, 'AUTH_REQUIRED')
    assert.equal(typeof res.body.error.message, 'string')
    assert.equal(called, 0, '未过鉴权绝不进安装链（INV-1 安装面唯一入口=登录面后）')
  }
})

test('POST install 方法面收口：仅 POST（GET → 405 + allow: POST，引擎零调用）', async () => {
  const { logPath } = sandbox()
  let called = 0
  const res = await callInstall(baseDeps(logPath, {
    installEngine: async () => {
      called += 1
      return okResult(buildInstallRecord({ ok: true }))
    },
  }), { method: 'GET' })
  assert.equal(res.status, 405)
  assert.equal(res.headers.allow, 'POST')
  assert.equal(res.body.error.code, 'RTK_ERROR')
  assert.equal(called, 0)
})

test('POST install body 不读不解析（INV-7 同形）：请求内容永无路径进入引擎 opts', async () => {
  const { logPath } = sandbox()
  let seenOpts = null
  const handlers = createDoctorHandlers(baseDeps(logPath, {
    installEngine: async (opts) => {
      seenOpts = opts
      return okResult(buildInstallRecord({ ok: true }), { logPath: opts.logPath })
    },
  }))
  const req = makeReq()
  const res = makeRes()
  await handlers.install(req, res)
  assert.equal(res.status, 200)
  assert.equal(req.reads.count, 0, 'POST body 一律不读不解析（INV-7 同形断言）')
  assert.ok(!JSON.stringify(seenOpts).includes('--reset'), 'body 内容零进入引擎 opts')
  assert.ok(!JSON.stringify(seenOpts).includes('rm -rf'), 'body 内容零进入引擎 opts')
})

test('POST install 平台门槛（INV-6）：非 linux/x64 → 400 PLATFORM_UNSUPPORTED + 手动安装 hint；引擎零调用', async () => {
  const { logPath } = sandbox()
  let called = 0
  const deps = baseDeps(logPath, {
    platform: 'darwin',
    arch: 'arm64',
    installEngine: async () => {
      called += 1
      return okResult(buildInstallRecord({ ok: true }))
    },
  })
  const res = await callInstall(deps)
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, PLATFORM_UNSUPPORTED)
  assert.equal(res.body.error.hint, INSTALL_HINT, '他平台提示手动安装（INV-6）')
  assert.equal(called, 0, '平台门槛不过不进安装链')
  const vres = await callVersion(deps)
  assert.equal(vres.body.data.installSupported, false, 'installSupported 与安装门槛同源')
})

test('POST install 互斥单飞（INV-5）：真实引擎 in-flight 重入 → 409 reinstall-in-progress', async () => {
  const { dir, logPath } = sandbox()
  let releaseFetch
  const gate = new Promise((resolve) => {
    releaseFetch = resolve
  })
  const hangingFetch = async () => {
    await gate
    throw new Error('net down')
  }
  const deps = baseDeps(logPath, {
    installOpts: {
      logPath,
      installDir: path.join(dir, 'bin'),
      tmpdir: dir,
      fetch: hangingFetch,
      now: () => 1770000000000,
    },
    installEngine: reinstallRtk, // 真实引擎（模块级 in-flight 标志）
  })
  const handlers = createDoctorHandlers(deps)
  const res1 = makeRes()
  const p1 = handlers.install(makeReq(), res1) // 同步进引擎：in-flight 置位后才挂起
  assert.equal(isReinstallInFlight(), true, '引擎 in-flight 标志在场')
  const res2 = makeRes()
  await handlers.install(makeReq(), res2)
  assert.equal(res2.status, 409, '重入回 409')
  assert.equal(res2.body.error.code, REINSTALL_IN_PROGRESS)
  assert.equal(res2.body.error.code, 'reinstall-in-progress')
  releaseFetch()
  await p1
  assert.equal(res1.status, 502)
  assert.equal(res1.body.error.code, DOWNLOAD_FAILED)
  assert.equal(isReinstallInFlight(), false, '任务收敛后 in-flight 归零')
})

test('POST install 重入映射：引擎 reinstall-in-progress 拒绝 → 409 + code（非安装尝试零记录）', async () => {
  const { logPath } = sandbox()
  const res = await callInstall(baseDeps(logPath, {
    installEngine: async () => {
      throw new InstallError(REINSTALL_IN_PROGRESS, '重装任务进行中（互斥单飞）')
    },
  }))
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'reinstall-in-progress')
  assert.equal(fs.existsSync(logPath), false, '重入非安装尝试，零记录落盘')
})

test('POST install 成功：{data:{record, verify}} + 记录落盘（US-2 / INV-10）', async () => {
  const { logPath } = sandbox()
  const record = buildInstallRecord({ time: '2026-10-04T03:00:00.000Z', version: '9.9.9', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
  let seenOpts = null
  const res = await callInstall(baseDeps(logPath, {
    installEngine: async (opts) => {
      seenOpts = opts
      return okResult(record, { logPath: opts.logPath })
    },
  }))
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.body.data).sort(), ['record', 'verify'], '成功信封恰 {record, verify}')
  assert.deepEqual(res.body.data.record, record)
  assert.equal(res.body.data.verify.version, '9.9.9')
  assert.equal(seenOpts.platform, 'linux')
  assert.equal(seenOpts.arch, 'x64')
  assert.deepEqual(await readLastInstall(logPath), record, '成功记录落盘（追加写）')
})

test('R-3：VERIFY_FAILED 红条详情含 .verify/.record 与旧版 .bak 位置；失败记录照常落盘', async () => {
  const { logPath } = sandbox()
  const verify = { available: false, version: null, path: '/opt/rtk/bin/rtk', hint: null }
  const record = buildInstallRecord({ time: '2026-10-04T04:00:00.000Z', version: null, source: releaseAssetUrl(RTK_ASSET), ok: false, error: VERIFY_FAILED })
  const res = await callInstall(baseDeps(logPath, {
    installEngine: async () => {
      throw new InstallError(VERIFY_FAILED, '复检未通过：安装后 rtk 仍不可用', { verify, record, backupPath: '/opt/rtk/bin/rtk.bak.1770' })
    },
  }))
  assert.equal(res.status, 500)
  assert.equal(res.body.error.code, VERIFY_FAILED)
  assert.deepEqual(res.body.error.verify, verify, '红条详情含 .verify（R-3）')
  assert.deepEqual(res.body.error.record, record, '红条详情含 .record（R-3）')
  assert.equal(res.body.error.backupPath, '/opt/rtk/bin/rtk.bak.1770', '红条详情含旧版 .bak 位置（R-3）')
  assert.deepEqual(await readLastInstall(logPath), record, '失败记录落盘（ok:false + 错误分类）')
})

test('POST install 错误分类信封：六类 code 各有 message + HTTP 语义（前端按 code 分派红条）', async () => {
  const expected = {
    [DOWNLOAD_FAILED]: 502,
    [CHECKSUM_MISMATCH]: 502,
    [EXTRACT_FAILED]: 500,
    [WRITE_FAILED]: 500,
    [VERIFY_FAILED]: 500,
    [PLATFORM_UNSUPPORTED]: 400,
  }
  assert.deepEqual([...INSTALL_ERROR_CODES].sort(), Object.keys(expected).sort(), '六类分类常量与状态表收口')
  for (const [code, status] of Object.entries(expected)) {
    const { logPath } = sandbox()
    const record = buildInstallRecord({ time: `t-${code}`, version: null, source: releaseAssetUrl(RTK_ASSET), ok: false, error: code })
    const res = await callInstall(baseDeps(logPath, {
      installEngine: async () => {
        // 引擎契约（T1 withRecord）：InstallError 失败态必带 .record（INV-10 白名单）
        throw new InstallError(code, `${code} 分类详情`, { record })
      },
    }))
    assert.equal(res.status, status, `${code} → HTTP ${status}`)
    assert.equal(INSTALL_ERROR_STATUS[code], status, `${code} 状态表一致`)
    assert.equal(res.body.error.code, code, `${code} 信封 code 可分派`)
    assert.equal(res.body.error.message, `${code} 分类详情`, `${code} 带 message`)
    assert.equal('data' in res.body, false, '失败信封不得混入 data')
    assert.deepEqual(await readLastInstall(logPath), record, `${code} 失败记录落盘`)
    if (code === PLATFORM_UNSUPPORTED) {
      assert.equal(res.body.error.hint, INSTALL_HINT, 'PLATFORM_UNSUPPORTED 带手动安装 hint')
    }
  }
})

test('GET version 数据面（Ruling 2）：data 增 lastInstall + installSupported + installTargetMatch（F-FINAL-1(ii)）；记录损坏回 null 不炸', async () => {
  const { logPath } = sandbox()
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  // resolveEnv 注入（确定性）：种子 /opt/rtk/bin/rtk 显式路径形+缺失+≠默认落点（os.homedir()/.local/bin/rtk）→ match:false
  const deps = baseDeps(logPath, { exec, resolveEnv: { path: '', homedir: '', isExecutable: () => false } })
  const res1 = await callVersion(deps)
  assert.equal(res1.status, 200)
  assert.deepEqual(res1.body.data, {
    available: true,
    version: '0.49.0',
    path: '/opt/rtk/bin/rtk',
    hint: null,
    lastInstall: null,
    installSupported: true,
    installTargetMatch: false,
  })
  await appendInstallRecord(logPath, buildInstallRecord({ time: 't', version: '1.2.3', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null }))
  const res2 = await callVersion(deps)
  assert.equal(res2.body.data.lastInstall.version, '1.2.3', '最近重装记录回显（US-5）')
  fs.writeFileSync(logPath, '损坏{')
  const res3 = await callVersion(deps)
  assert.equal(res3.status, 200, '记录损坏不炸（INV-4 fail-open）')
  assert.equal(res3.body.data.lastInstall, null)
})

test('fail-open（INV-4）：记录写失败不影响 install 成功响应与 version 面', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-failopen-'))
  const record = buildInstallRecord({ time: 't', version: '9.9.9', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null })
  const deps = baseDeps(dir, {
    installEngine: async () => okResult(record, { logPath: dir }),
  })
  const res = await callInstall(deps)
  assert.equal(res.status, 200, '记录写失败不影响安装结果（fail-open）')
  assert.deepEqual(res.body.data.record, record)
  const vres = await callVersion({ ...deps, exec: fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' })).exec })
  assert.equal(vres.status, 200, '记录面异常不影响既有 version 面')
  assert.equal(vres.body.data.lastInstall, null)
})

// ───────────────────────── F-01 注释口径 + 红线断言 ─────────────────────────

test('F-FINAL-1(i)：doctor-routes.js 注释与种子语义一致（种子=config 原值每请求重发现，零「原样回显」漂移）', () => {
  const src = fs.readFileSync(new URL('../lib/doctor-routes.js', import.meta.url), 'utf8')
  // 注释锁口径同步（终审 F-FINAL-1(i) 种子修正，替代 F-01 期「apply 解析后值」旧口径）：
  assert.ok(src.includes('种子=config 原值'), '注释应写明重解析种子=config 原值（每请求 findRtkBin 重发现）')
  assert.doesNotMatch(src, /原样回显/, 'F-01：旧口径「配置 rtkBin 原样回显」已清（实为每请求重发现+回显实际执行值）')
})

test('红线断言（Task 2）：路由/诊断面零 spawnSync、零工具注册面；POST body 零进 argv', () => {
  for (const rel of ['../lib/doctor-routes.js', '../lib/doctor.js']) {
    const stripped = fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    assert.doesNotMatch(stripped, /\bspawnSync\b/, `${rel} 零 spawnSync`)
    assert.doesNotMatch(stripped, /\bexecSync\b/, `${rel} 零 execSync`)
    assert.doesNotMatch(stripped, /\bdefineTool\b/, `${rel} 零工具注册面`)
    assert.doesNotMatch(stripped, /tools\.register/, `${rel} 零工具注册面`)
    assert.doesNotMatch(stripped, /\bchild_process\.(spawn|exec)\b/, `${rel} 零同步执行缝`)
  }
  // 路由面零 child_process 直引（执行缝只在 doctor.js 的异步 execFile 封装内）
  const routesSrc = fs.readFileSync(new URL('../lib/doctor-routes.js', import.meta.url), 'utf8')
  assert.doesNotMatch(routesSrc, /node:child_process/, 'doctor-routes.js 零 child_process 直引')
  for (const code of INSTALL_ERROR_CODES) {
    assert.ok(Object.hasOwn(INSTALL_ERROR_STATUS, code), `六类 ${code} 均在 HTTP 状态表内（前端可分派）`)
  }
  assert.equal(INSTALL_ERROR_STATUS[REINSTALL_IN_PROGRESS], 409, '互斥重入收口 409')
})
