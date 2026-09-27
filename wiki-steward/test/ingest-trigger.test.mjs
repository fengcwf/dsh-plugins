// ingest-trigger 单测（设置页签「手动触发 ingest」双动作触发缝）：
//   「扫描增量」= 调 ingest-pipeline.py 机械面（scan --summary），结果写日志面板；
//   「触发蒸馏」= 呼叫 headless 任务通道 /root/bin/dsh-cron.sh wiki-ingest <task>（LLM 面
//   由任务执行——按钮绝不做 LLM 蒸馏）；无可靠通道则不触发并如实回报。
// 被测件：lib/ingest-trigger.js。child_process 注入缝：execFile/spawn 可注入；
// 真验面（零 mock）：真跑 ingest-pipeline.py scan（只读）+ 真跑 /root/bin/dsh-cron.sh
// 缺任务文件形（exit 2）与 flock 防重入形（exit 3）——都不触发 LLM、只写 mkdtemp 目录
// （DSH_CRON_LOG_DIR / DSH_KB_ALERTS 环境变量是 dsh-cron.sh 自带的落点阀，绝不碰真 home）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFile as realExecFile } from 'node:child_process'

const {
  createIngestTrigger,
  PIPELINE_SCRIPT,
  CRON_SCRIPT,
  DISTILL_TASK_FILE,
  DISTILL_TASK_NAME,
  DISTILL_NOTE,
} = await import('../lib/ingest-trigger.js')
const { summarizeScan } = await import('../lib/ingest-log.js')

function mkTmp(t, prefix = 'wiki-steward-ingest-trigger-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 注入式 execFile 记录器（触发缝的依赖注入；被测逻辑全程真验） */
function recordingExec(results = []) {
  const calls = []
  const execFile = async (file, args, opts = {}) => {
    calls.push({ file, args, opts })
    const next = typeof results === 'function' ? results(file, args, opts) : results.shift()
    return next ?? { code: 0, stdout: '', stderr: '' }
  }
  return { execFile, calls }
}

/** 注入式 spawn 记录器 */
function recordingSpawn() {
  const calls = []
  const spawn = (file, args, opts = {}) => {
    calls.push({ file, args, opts })
    return { pid: 4242, unref() {} }
  }
  return { spawn, calls }
}

const FIXTURE_NOW = () => new Date('2026-09-28T08:00:00+08:00')

/** 当日 YYYYMMDD（与 dsh-cron.sh `date +%Y%m%d` 同口径：本地时区） */
function dayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

// ── 扫描增量：机械面调用 + 结果写日志 ────────────────────────────────────────
test('scan：调 ingest-pipeline.py scan --summary（机械面，不复制脚本只调用本体），结果解析+落扫描日志', async (t) => {
  const logDir = mkTmp(t)
  const { execFile, calls } = recordingExec([
    {
      code: 0,
      stdout: '📊 Ingest Pipeline Scan\n   总文件数: 3\n   已编译:   2\n   待编译:   1\n\n📋 待编译文件:\n   🆕 [01-articles] a.md (2026-09-28 07:00)\n',
      stderr: '',
    },
  ])
  const trig = createIngestTrigger({ execFile, spawn: recordingSpawn().spawn, now: FIXTURE_NOW, home: '/home/x', logDir })
  const r = await trig.scan()

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, [PIPELINE_SCRIPT, 'scan', '--summary'], 'H3 规矩：只调用运维脚本本体')
  assert.equal(r.ok, true)
  assert.equal(r.exitCode, 0)
  assert.equal(r.summary.total, 3)
  assert.equal(r.summary.pending, 1)
  assert.equal(r.summary.pendingFiles[0].status, 'ingest')
  assert.equal(r.logFile, path.join(logDir, 'wiki-ingest-scan-20260928.log'))
  // 结果（增量清单）写日志面板：真落盘，含 argv 与 exit code（可溯源）
  const text = fs.readFileSync(r.logFile, 'utf8')
  assert.match(text, /MANUAL SCAN/)
  assert.match(text, /Ingest Pipeline Scan/)
  assert.match(text, /exit code: 0/)
  assert.ok(text.includes('a.md'), '增量清单必须在日志里')
})

test('scan：非零退出照样落日志（ok:false + summary 尽力解析），错误不吞', async (t) => {
  const logDir = mkTmp(t)
  const { execFile } = recordingExec([{ code: 1, stdout: '', stderr: 'python: boom' }])
  const trig = createIngestTrigger({ execFile, spawn: recordingSpawn().spawn, now: FIXTURE_NOW, home: '/home/x', logDir })
  const r = await trig.scan()
  assert.equal(r.ok, false)
  assert.equal(r.exitCode, 1)
  assert.equal(r.summary.unknown, true)
  const text = fs.readFileSync(r.logFile, 'utf8')
  assert.match(text, /python: boom/)
  assert.match(text, /exit code: 1/)
})

test('scan：同日多次触发追加同一扫描日志（不覆盖历史）', async (t) => {
  const logDir = mkTmp(t)
  const { execFile } = recordingExec([{ code: 0, stdout: 'run-1', stderr: '' }, { code: 0, stdout: 'run-2', stderr: '' }])
  const trig = createIngestTrigger({ execFile, spawn: recordingSpawn().spawn, now: FIXTURE_NOW, home: '/home/x', logDir })
  await trig.scan()
  await trig.scan()
  const text = fs.readFileSync(path.join(logDir, 'wiki-ingest-scan-20260928.log'), 'utf8')
  assert.ok(text.includes('run-1') && text.includes('run-2'))
  assert.equal(text.match(/MANUAL SCAN/g).length, 2)
})

// ── 触发蒸馏：headless 任务通道（按钮绝不做 LLM 蒸馏）────────────────────────
test('distill：通道可用且空闲 → detached 呼叫 dsh-cron.sh wiki-ingest <task>，提示「蒸馏由任务执行」', async (t) => {
  const logDir = mkTmp(t)
  const taskFile = path.join(logDir, 'task.md')
  fs.writeFileSync(taskFile, '# fake task（不执行——spawn 注入记录）')
  const { spawn, calls } = recordingSpawn()
  const trig = createIngestTrigger({
    execFile: recordingExec([{ code: 0, stdout: '', stderr: '' }]).execFile, // flock 探针：0=未持锁
    spawn,
    now: FIXTURE_NOW,
    home: '/home/x',
    logDir,
    cronScript: CRON_SCRIPT,
    taskFile,
  })
  const r = await trig.distill()
  assert.equal(r.started, true)
  assert.equal(r.reason, 'started')
  assert.deepEqual(calls[0].args, [CRON_SCRIPT, DISTILL_TASK_NAME, taskFile])
  assert.equal(calls[0].opts.detached, true, '后台执行：不阻塞 web 请求')
  assert.equal(typeof r.logFile, 'string')
  assert.ok(DISTILL_NOTE.includes('蒸馏由任务执行'), '裁定文案：蒸馏由任务执行')
  assert.ok(r.note.includes('蒸馏由任务执行'))
})

test('distill：任务文件/通道脚本缺失 = 不造按钮语义（started:false + reason 留痕，绝不 spawn）', async (t) => {
  const logDir = mkTmp(t)
  const { spawn, calls } = recordingSpawn()
  const trig = createIngestTrigger({
    execFile: recordingExec().execFile,
    spawn,
    now: FIXTURE_NOW,
    home: '/home/x',
    logDir,
    cronScript: path.join(logDir, 'no-such-cron.sh'),
    taskFile: path.join(logDir, 'no-such-task.md'),
  })
  const r = await trig.distill()
  assert.equal(r.started, false)
  assert.equal(r.reason, 'channel-unavailable')
  assert.equal(calls.length, 0)
  assert.ok(r.note && r.note.length > 0, '必须如实提示通道不可用（蒸馏走夜间任务/手动会话）')
})

test('distill：flock 探针报告执行中 → 不重入（started:false reason=already-running）', async (t) => {
  const logDir = mkTmp(t)
  const taskFile = path.join(logDir, 'task.md')
  fs.writeFileSync(taskFile, '# t')
  const { spawn, calls } = recordingSpawn()
  const trig = createIngestTrigger({
    execFile: recordingExec([{ code: 1, stdout: '', stderr: '' }]).execFile, // 1=锁被占
    spawn,
    now: FIXTURE_NOW,
    home: '/home/x',
    logDir,
    cronScript: CRON_SCRIPT,
    taskFile,
  })
  const r = await trig.distill()
  assert.equal(r.started, false)
  assert.equal(r.reason, 'already-running')
  assert.equal(calls.length, 0)
})

test('distillStatus：通道可用性如实报告（脚本/任务文件存在性），logFile 与 dsh-cron 同名同位', async (t) => {
  const logDir = mkTmp(t)
  const taskFile = path.join(logDir, 'task.md')
  fs.writeFileSync(taskFile, '# t')
  const trig = createIngestTrigger({
    execFile: recordingExec().execFile,
    spawn: recordingSpawn().spawn,
    now: FIXTURE_NOW,
    home: '/home/x',
    logDir,
    cronScript: CRON_SCRIPT,
    taskFile,
    taskName: 'wiki-ingest',
  })
  const st = await trig.distillStatus()
  assert.equal(st.channelAvailable, true)
  assert.equal(st.running, false)
  assert.equal(st.logFile, path.join(logDir, 'wiki-ingest-20260928.log'), 'dsh-cron.sh LOG 命名 <name>-YYYYMMDD.log')
  assert.equal(st.lockFile, path.join(logDir, 'wiki-ingest.lock'), 'dsh-cron.sh 锁 <name>.lock')
})

// ── 真验（零 mock）：真跑运维脚本本体 ────────────────────────────────────────
test('真验：ingest-pipeline.py scan --summary 真跑（只读），summary 机械解析对上真实输出', async (t) => {
  assert.ok(fs.existsSync(PIPELINE_SCRIPT), `运维脚本必须在（调研结论钉住）：${PIPELINE_SCRIPT}`)
  const logDir = mkTmp(t)
  const trig = createIngestTrigger({
    spawn: recordingSpawn().spawn,
    now: () => new Date(),
    home: '/home/x',
    logDir,
    pipelineScript: PIPELINE_SCRIPT,
  })
  const r = await trig.scan()
  assert.equal(r.ok, true, `真跑失败：${r.output}`)
  assert.equal(typeof r.summary.total, 'number')
  assert.equal(typeof r.summary.pending, 'number')
  assert.equal(r.summary.unknown, undefined, '真实 scan 输出必须被识别（非 unknown 形）')
  assert.match(r.output, /Ingest Pipeline Scan/)
  assert.ok(fs.existsSync(r.logFile), '扫描结果必须真落盘（写日志面板的数据源）')
})

test('真验：dsh-cron.sh 缺任务文件形 exit 2 + 日志/告警只写注入落点（真通道脚本，不触发 LLM）', async (t) => {
  assert.ok(fs.existsSync(CRON_SCRIPT), `通道脚本必须在：${CRON_SCRIPT}`)
  const logDir = mkTmp(t)
  const alerts = path.join(logDir, 'kb-alerts.md')
  const r = spawnSync('bash', [CRON_SCRIPT, 'wiki-ingest', path.join(logDir, 'missing-task.md')], {
    encoding: 'utf8',
    env: { ...process.env, DSH_CRON_LOG_DIR: logDir, DSH_KB_ALERTS: alerts },
  })
  assert.equal(r.status, 2, `预期 exit 2（task-file 不存在）：${r.stdout}${r.stderr}`)
  const log = fs.readFileSync(path.join(logDir, `wiki-ingest-${dayStamp()}.log`), 'utf8')
  assert.match(log, /ERROR: task-file 不存在/)
  assert.match(log, /exit code: 2/)
  assert.match(fs.readFileSync(alerts, 'utf8'), /cron:wiki-ingest exit=2/)
})

test('真验：flock 防重入形 exit 3（真锁真脚本）——distillStatus 探针与真锁同判', async (t) => {
  const logDir = mkTmp(t)
  const taskFile = path.join(logDir, 'task.md')
  fs.writeFileSync(taskFile, '# t')
  const lockFile = path.join(logDir, 'wiki-ingest.lock')
  // 真持锁者：flock 持锁 15s（后台），探针/通道与它竞争同一把锁
  const holder = realExecFile('bash', ['-c', `exec 9>>"$1"; flock 9; sleep 15`, 'holder', lockFile])
  t.after(() => { try { holder.kill() } catch { /* 已退出 */ } })
  // 等锁真被持有（flock -n 探针失败=已持有）
  for (let i = 0; i < 50; i += 1) {
    const probe = spawnSync('flock', ['-n', lockFile, '-c', 'true'], { encoding: 'utf8' })
    if (probe.status !== 0) break
    await new Promise((res) => setTimeout(res, 50))
  }
  const probe = spawnSync('flock', ['-n', lockFile, '-c', 'true'], { encoding: 'utf8' })
  assert.notEqual(probe.status, 0, '锁必须真被持有（测试前置条件）')

  const trig = createIngestTrigger({
    execFile: (file, args, opts) => new Promise((resolve, reject) => {
      realExecFile(file, args, opts ?? {}, (err, stdout, stderr) => {
        if (err && typeof err.code !== 'number') return reject(err)
        resolve({ code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr) })
      })
    }),
    spawn: recordingSpawn().spawn,
    now: () => new Date(),
    home: '/home/x',
    logDir,
    cronScript: CRON_SCRIPT,
    taskFile,
    taskName: 'wiki-ingest',
  })
  const st = await trig.distillStatus()
  assert.equal(st.running, true, '探针必须认出真锁')
  const d = await trig.distill()
  assert.equal(d.started, false)
  assert.equal(d.reason, 'already-running')

  const r = spawnSync('bash', [CRON_SCRIPT, 'wiki-ingest', taskFile], {
    encoding: 'utf8',
    env: { ...process.env, DSH_CRON_LOG_DIR: logDir, DSH_KB_ALERTS: path.join(logDir, 'kb-alerts.md') },
    timeout: 10000,
  })
  assert.equal(r.status, 3, `同名任务在跑必须 SKIP（exit 3）：${r.stdout}${r.stderr}`)
  const log = fs.readFileSync(path.join(logDir, `wiki-ingest-${dayStamp()}.log`), 'utf8')
  assert.match(log, /SKIP name=wiki-ingest/)
  assert.match(log, /exit code: 3/)
})

// ── 真验：summarizeScan 对上真跑输出（解析器不脱离真实形）────────────────────
test('真验：真跑输出直接进 summarizeScan（与 ingest-log 解析器同源）', async () => {
  assert.ok(fs.existsSync(PIPELINE_SCRIPT))
  const { execFile } = (await import('node:child_process'))
  const out = await new Promise((resolve) => {
    execFile('python3', [PIPELINE_SCRIPT, 'scan', '--summary'], { encoding: 'utf8', timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout: String(stdout) })
    })
  })
  const s = summarizeScan(out.stdout)
  assert.equal(typeof s.total, 'number')
  assert.ok(Array.isArray(s.pendingFiles))
})
