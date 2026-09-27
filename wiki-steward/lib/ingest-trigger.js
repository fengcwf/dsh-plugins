// ingest-trigger — 设置页签「手动触发 ingest」双动作触发缝（裁定语义：脚本不语义编译）：
//   「扫描增量」= 调 ingest-pipeline.py 机械面 scan --summary（H3 规矩：不复制脚本，只调用本体），
//     结果（增量清单）写扫描日志 → 日志面板可见；
//   「触发蒸馏」= 呼叫 headless 任务通道 /root/bin/dsh-cron.sh wiki-ingest <task>（LLM 面由任务
//     执行——按钮绝不做 LLM 蒸馏），并提示「蒸馏由任务执行」；通道不可用则不触发、如实回报
//     （蒸馏走夜间任务/手动会话）。
// child_process 注入缝：execFile / spawn 可注入（测试真跑脚本本体或记录调用形）；默认=真
// child_process。蒸馏通道现状（2026-09-28 实测）：cron 25 0 * * * dsh-cron.sh wiki-ingest
// /root/bin/tasks/21-wiki-ingest.md，flock 防重入（同名在跑=SKIP exit 3），日志
// ~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log，失败告警写 ~/.dsh/kb-alerts.md。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile as cpExecFile, spawn as cpSpawn } from 'node:child_process'
import { summarizeScan } from './ingest-log.js'

export const PIPELINE_SCRIPT = '/opt/Workspace/scripts/obsidian/ingest-pipeline.py'
export const CRON_SCRIPT = '/root/bin/dsh-cron.sh'
export const DISTILL_TASK_FILE = '/root/bin/tasks/21-wiki-ingest.md'
export const DISTILL_TASK_NAME = 'wiki-ingest'
export const DISTILL_NOTE = '蒸馏由任务执行：已触发 headless 任务（dsh-cron wiki-ingest），wiki 编译由任务会话按 wiki-ingest skill 完成；进度与结果见任务日志（本按钮不做 LLM 蒸馏）。'
export const CHANNEL_UNAVAILABLE_NOTE = '蒸馏通道不可用（缺 dsh-cron.sh 或 21-wiki-ingest.md 任务文件）：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill。'
export const ALREADY_RUNNING_NOTE = '蒸馏任务已在执行（flock 防重入）：蒸馏由任务执行中，请稍后在日志面板查看结果。'

/** 本地时区 YYYYMMDD（与 dsh-cron.sh `date +%Y%m%d` 同口径） */
function dateStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 默认 execFile 缝：非零退出也 resolve（{code,stdout,stderr}），spawn 级失败才 reject */
function defaultExecFile(file, args, opts) {
  return new Promise((resolve, reject) => {
    cpExecFile(file, args, { encoding: 'utf8', ...opts }, (err, stdout, stderr) => {
      if (err && typeof err.code !== 'number') return reject(err)
      resolve({ code: err ? err.code : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

function defaultSpawn(file, args, opts) {
  return cpSpawn(file, args, opts)
}

/**
 * 触发缝工厂。
 * @param {object} [opts]
 * @param {(file:string,args:string[],opts:object)=>Promise<{code:number,stdout:string,stderr:string}>} [opts.execFile] 注入缝
 * @param {(file:string,args:string[],opts:object)=>{unref?:Function}} [opts.spawn] 注入缝
 * @param {()=>Date} [opts.now]
 * @param {string} [opts.home] [opts.logDir] 落点（默认 ~/.dsh/logs/cron——dsh-cron.sh 同位）
 */
export function createIngestTrigger(opts = {}) {
  const execFile = typeof opts.execFile === 'function' ? opts.execFile : defaultExecFile
  const spawn = typeof opts.spawn === 'function' ? opts.spawn : defaultSpawn
  const now = typeof opts.now === 'function' ? opts.now : () => new Date()
  const home = opts.home ?? os.homedir()
  const logDir = opts.logDir ?? path.join(home, '.dsh', 'logs', 'cron')
  const pipelineScript = opts.pipelineScript ?? PIPELINE_SCRIPT
  const cronScript = opts.cronScript ?? CRON_SCRIPT
  const taskFile = opts.taskFile ?? DISTILL_TASK_FILE
  const taskName = opts.taskName ?? DISTILL_TASK_NAME
  const pythonBin = opts.pythonBin ?? 'python3'
  const bashBin = opts.bashBin ?? 'bash'

  /** 扫描增量：ingest-pipeline.py 机械面（只读 scan），结果写扫描日志（面板数据源） */
  async function scan() {
    const argv = [pythonBin, pipelineScript, 'scan', '--summary']
    let r
    try {
      r = await execFile(argv[0], argv.slice(1), { timeout: 120_000 })
    } catch (e) {
      r = { code: typeof e?.code === 'number' ? e.code : 1, stdout: '', stderr: String(e?.message ?? e) }
    }
    const output = [r.stdout, r.stderr].filter((s) => s !== '').join('\n')
    const logFile = path.join(logDir, `wiki-ingest-scan-${dateStamp(now())}.log`)
    const body = [
      `=== [${stamp(now())}] MANUAL SCAN (settings panel) ===`,
      `argv: ${argv.join(' ')}`,
      output,
      `exit code: ${r.code}`,
      '',
    ].join('\n')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(logFile, body, 'utf8')
    return {
      ok: r.code === 0,
      exitCode: r.code,
      argv,
      output,
      summary: summarizeScan(r.stdout ?? ''),
      logFile,
    }
  }

  /** 通道状态：可用性如实（脚本/任务文件存在性）+ flock 防重入探针（探针失败=未知，不冒充） */
  async function distillStatus() {
    const lockFile = path.join(logDir, `${taskName}.lock`)
    const channelAvailable = fs.existsSync(cronScript) && fs.existsSync(taskFile)
    let running = false
    if (channelAvailable) {
      try {
        const p = await execFile('flock', ['-n', lockFile, '-c', 'true'], { timeout: 10_000 })
        running = p.code !== 0
      } catch {
        running = null
      }
    }
    return {
      running,
      channelAvailable,
      cronScript,
      taskFile,
      lockFile,
      logFile: path.join(logDir, `${taskName}-${dateStamp(now())}.log`),
    }
  }

  /** 触发蒸馏：呼叫 headless 任务通道（LLM 面由任务执行），detached 不阻塞 web 请求 */
  async function distill() {
    const st = await distillStatus()
    if (!st.channelAvailable) {
      return { started: false, reason: 'channel-unavailable', note: CHANNEL_UNAVAILABLE_NOTE, ...st }
    }
    if (st.running === true) {
      return { started: false, reason: 'already-running', note: ALREADY_RUNNING_NOTE, ...st }
    }
    const argv = [bashBin, cronScript, taskName, taskFile]
    try {
      const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' })
      child?.unref?.()
    } catch (e) {
      return { started: false, reason: 'spawn-failed', note: `触发失败：${e?.message ?? e}`, ...st }
    }
    return { started: true, reason: 'started', note: DISTILL_NOTE, argv, ...st }
  }

  return { scan, distill, distillStatus }
}
