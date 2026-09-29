import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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
} from '../lib/doctor.js'

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
  const r = await getVersion({ exec, rtkBin: 'rtk' })
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

// ───────────────────────── 健康七项（INV-4 零污染法） ─────────────────────────

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

test('getHealth：七项结果数组定序 {id,label,status,detail}，exec 面零样本命令执行', async () => {
  const dbPath = makeFixtureDb([{ timestamp: '2026-09-28T00:00:00+00:00', savings_pct: 33 }])
  const { exec, calls } = fakeExec(async (file, args) => {
    if (args[0] === 'gain') {
      return { code: 0, stdout: JSON.stringify({ summary: { total_commands: 9 } }), stderr: '' }
    }
    return { code: 0, stdout: 'rtk 0.49.0', stderr: '' }
  })
  const items = await getHealth({ exec, rtkBin: 'rtk', historyDb: dbPath, now: FIXED_NOW })
  assert.equal(items.length, 7)
  assert.deepEqual(
    items.map((it) => it.id),
    HEALTH_ITEMS.map((it) => it.id),
  )
  assert.deepEqual(items.map((it) => it.id), [
    'binary-exec', 'version-parse', 'rewrite-seam', 'guard-matrix',
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
  assert.equal(items.length, 7)
  for (const it of items) assertItemShape(it, it.id)
  assert.equal(items.find((it) => it.id === 'binary-exec').status, 'fail')
  assert.equal(items.find((it) => it.id === 'gain-source').status, 'fail')
  assert.equal(items.find((it) => it.id === 'compression-effective').status, 'fail')
  assert.equal(items.find((it) => it.id === 'guard-matrix').status, 'pass')
})
