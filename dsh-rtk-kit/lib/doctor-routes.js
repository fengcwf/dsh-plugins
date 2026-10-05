// dsh-rtk-kit/lib/doctor-routes.js —— 设置页数据路由（Task 6：authGate + 信封 + 错误码族；Task 2：安装面 + 记录面）
// 依据：changes/20260929-phase0/tasks.md Task 6 + 队长裁决（路由形 / 信封 / 错误码族 / INV-2 / INV-7）；
//      changes/2026-10-03-rtk-reinstall/tasks.md Task 2（POST install 路由 / 重装记录面 / F-01/F-02 闭环）；
//      鉴权缝照 wiki-steward/lib/ingest-routes.js:43-48 形（connection.requestRejection：过缝失败直接回拒，绝不进业务面）。
// 路由形：ctx.webServer.register({kind:'prefix', path:'/api/rtk-kit', handler}) 单 prefix + 内部分发：
//   GET  /api/rtk-kit/version   版本面（版本号 + 路径 + 可用性 + lastInstall/installSupported/installTargetMatch；
//        重解析种子=config 原值（F-FINAL-1(i)）、每请求 lib/resolve-bin.js 重发现后回显实际执行值（Task 6 F-01 自愈，单源））
//   GET  /api/rtk-kit/gain      统计面（summary + 日/周/月周期序列；gain -a 一次取全量、客户端切片，INV-3）
//   POST /api/rtk-kit/health    健康面（七项定序结果数组；POST body 不读不进 argv，INV-7）
//   POST /api/rtk-kit/install   安装面（一键重装；INV-1 安装能力唯一入口=登录面后；POST body 不读不解析，INV-7）
//        客户端取 URL 一律用文档相对常量 INSTALL_URL（无前导斜杠，issue #1707 教训）
// API 形：成功 {data}；失败 {error:{code,message[,hint]}}；错误码族收口
//   AUTH_REQUIRED（鉴权拒绝）/ RTK_UNAVAILABLE（二进制缺失，附安装提示）/ RTK_TIMEOUT（超时供 UI 重试）/ RTK_ERROR（其余）；
//   安装面分类码（INSTALL_ERROR_STATUS 收口 HTTP 语义，前端按 code 分派红条）：DOWNLOAD_FAILED / CHECKSUM_MISMATCH /
//   EXTRACT_FAILED / WRITE_FAILED / VERIFY_FAILED / PLATFORM_UNSUPPORTED / 互斥重入（409）。
// 安全红线（INV-7）：诊断面只走 Task 5 三动作（M1 结案口径）；安装面只走 Task 1 引擎（固定 URL 白名单 + 固定 argv）——
//   零破坏性旗标、零透传执行、零用户输入拼接 argv；POST body 永无路径进入 argv/URL。
// 零 token 面（INV-2）：功能只走设置页 HTTP——零新会话工具注册、零统计/健康/安装内容注入会话。
// 重装记录面（INV-10 / Ruling 2）：追加写 ~/.dsh/dsh-rtk-kit/install-log.json（读-改-写 + tmp/rename 原子替换），
//   条目只记 时间/目标版本/来源 URL/成败/错误分类（白名单归一，零凭据/零 token/零 env 明文）；
//   读写失败回 null 不炸（fail-open）——记录面异常绝不影响安装结果与既有面（INV-4）。
// fail-open（TECH.md 错误处理策略）：rtk 缺失不抛 500 不炸装载——版本面软回 available:false + 安装提示（数据态）；
//   统计面回 RTK_UNAVAILABLE + hint 字段（F-02/INV-9：hint 与 found 同门控，真缺失才带安装提示）；
//   健康面七项如实红叉（getHealth 永不抛）。
//   webServer / connection 缺缝由 Task 8 接线层探测处理；本模块假定两缝在场。
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { getGain, getHealth, getVersion, INSTALL_HINT, missingInstallHint } from './doctor.js'
import { findRtkBin } from './resolve-bin.js'
import {
  PLATFORM_UNSUPPORTED,
  REINSTALL_IN_PROGRESS,
  buildInstallRecord,
  defaultLogPath,
  isReinstallInFlight,
  isSupportedPlatform,
  reinstallRtk,
  targetPathOf,
} from './install.js'

export const API_PREFIX = '/api/rtk-kit'

/** 安装面客户端 URL（文档相对、无前导斜杠，issue #1707 教训）：fetch 一律用本常量，禁 '/api' 绝对形。 */
export const INSTALL_URL = 'api/rtk-kit/install'

const JSON_TYPE = 'application/json; charset=utf-8'

/** 方法面收口（Task 7 fetch 合约同形 + Task 2 增 install）：version/gain 只 GET，health/install 只 POST。 */
const METHODS = Object.freeze({
  version: Object.freeze(['GET']),
  gain: Object.freeze(['GET']),
  health: Object.freeze(['POST']),
  install: Object.freeze(['POST']),
})

/** 错误码 → HTTP 状态（码族收口四码）。 */
const ERROR_STATUS = Object.freeze({ RTK_UNAVAILABLE: 503, RTK_TIMEOUT: 504, RTK_ERROR: 500 })

/** 安装面分类码 → HTTP 语义（Task 2 收口）：上游源失败 502、本地处理/复检失败 500、平台门槛 400、互斥重入 409。 */
export const INSTALL_ERROR_STATUS = Object.freeze({
  PLATFORM_UNSUPPORTED: 400,
  DOWNLOAD_FAILED: 502,
  CHECKSUM_MISMATCH: 502,
  EXTRACT_FAILED: 500,
  WRITE_FAILED: 500,
  VERIFY_FAILED: 500,
  [REINSTALL_IN_PROGRESS]: 409,
})

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function fail(res, status, code, message, extra) {
  sendJson(res, status, { error: { code, message, ...(extra ?? {}) } })
}

/** 鉴权缝（照 wiki-steward/lib/ingest-routes.js:43-48 形）：过缝失败直接回拒（码族收口 AUTH_REQUIRED），绝不进业务面。 */
function authGate(connection, req, res) {
  const rejection = connection.requestRejection({ headers: req.headers })
  if (rejection === undefined) return true
  const status = Number.isInteger(rejection) && rejection >= 400 ? rejection : 403
  fail(res, status, 'AUTH_REQUIRED', '未通过请求鉴权')
  return false
}

function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true
  res.setHeader('allow', allowed.join(', '))
  fail(res, 405, 'RTK_ERROR', `不支持 ${req.method}`)
  return false
}

function pathnameOf(req) {
  try {
    return new URL(req.url, 'http://dsh.invalid').pathname
  } catch {
    return ''
  }
}

// ───────────────────────── 重装记录面（INV-10 / Ruling 2：落盘归路由层，引擎只产 record） ─────────────────────────

/** 记录条数上限（T2-F-1）：写时截断保留最近 50 条——重装频率低，50 条足够追溯，
 *  且防 install-log.json 只增不减永续累积；超限从最旧丢起（追加语义不破）。 */
const MAX_INSTALL_RECORDS = 50

/**
 * 追加写一条重装记录（INV-10 白名单归一：时间/目标版本/来源 URL/成败/错误分类，多余键丢弃）。
 * 读-改-写 + tmp/rename 原子替换（INV-5 互斥单飞下无并发写者；追加不覆盖历史）；
 * 写时截断保留最近 MAX_INSTALL_RECORDS 条（T2-F-1）；追加前清同前缀陈旧 tmp 残留（T2-F-2①）。
 * fail-open（INV-4）：任何失败只留痕回 null、绝不抛——写记录不影响安装结果。
 * @param {string} logPath 记录文件（缺省 ~/.dsh/dsh-rtk-kit/install-log.json，opts 可注入）
 * @param {object} record 重装记录（buildInstallRecord 形）
 * @param {Function} [warn] 服务端留痕
 * @returns {Promise<object|null>} 落盘条目或 null
 */
export async function appendInstallRecord(logPath, record, warn = () => {}) {
  const entry = buildInstallRecord(record)
  const tmp = `${logPath}.tmp-${process.pid}-${Date.now()}`
  try {
    // T2-F-2①：清同前缀陈旧 tmp 残留（写中途 crash 留下的 `${logPath}.tmp-*`，不回收会永续累积）；
    //   INV-5 互斥单飞下无并发写者，绝清不到活文件；清理尽力而为不抛，失败不影响写入。
    try {
      const dir = path.dirname(logPath)
      const prefix = `${path.basename(logPath)}.tmp-`
      for (const name of await fsp.readdir(dir)) {
        if (name.startsWith(prefix)) await fsp.rm(path.join(dir, name), { force: true })
      }
    } catch {
      /* 目录缺失=无残留 */
    }
    let list = []
    try {
      const parsed = JSON.parse(await fsp.readFile(logPath, 'utf8'))
      if (!Array.isArray(parsed)) throw new Error('记录文件形状不对（应为数组）')
      list = parsed
    } catch (err) {
      // T2-F-2②：重起账留痕（与读面 warn 口径对齐：缺失静默、损坏留痕；fail-open 不炸）
      if (err?.code !== 'ENOENT') warn(`[rtk-kit] 重装记录读取失败（损坏=重新起账，fail-open）：${String(err?.message ?? err)}`)
    }
    list.push(entry)
    if (list.length > MAX_INSTALL_RECORDS) list = list.slice(-MAX_INSTALL_RECORDS) // T2-F-1：写时截断，只留最近 N 条
    await fsp.mkdir(path.dirname(logPath), { recursive: true })
    await fsp.writeFile(tmp, JSON.stringify(list, null, 2))
    await fsp.rename(tmp, logPath)
    return entry
  } catch (err) {
    try {
      await fsp.rm(tmp, { force: true })
    } catch {
      /* 清理尽力而为 */
    }
    warn(`[rtk-kit] 重装记录写入失败（fail-open，不影响安装结果）：${String(err?.message ?? err)}`)
    return null
  }
}

/**
 * 读最近一条重装记录（Ruling 2 数据面：version 面 lastInstall）。
 * fail-open（INV-4）：文件缺失/损坏/形状不对回 null 且绝不抛（缺失静默、损坏留痕）；
 * 条目归一白名单（多余键零泄漏，INV-10 读面同口径）。
 * @returns {Promise<object|null>} 最近记录（buildInstallRecord 形）或 null
 */
export async function readLastInstall(logPath, warn = () => {}) {
  try {
    const parsed = JSON.parse(await fsp.readFile(logPath, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('记录文件形状不对（应为数组）')
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      const entry = parsed[i]
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) return buildInstallRecord(entry)
    }
    return null
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      warn(`[rtk-kit] 重装记录读取失败（fail-open，回 null）：${String(err?.message ?? err)}`)
    }
    return null
  }
}

/** 值是否路径形（与 resolve-bin.js looksLikePath 同口径：含 / 或 \ 即显式路径，否则裸命令名）。 */
const looksPathLike = (s) => s.includes('/') || s.includes('\\')

/**
 * F-FINAL-1(ii)（Ruling 2026-10-04）按钮门控数据面语义：一键重装能否满足配置位（前端据此收窄「重新安装」按钮）。
 * false 恰当且仅当三条件齐：种子=显式路径形 **且** 该路径缺失（findRtkBin found=false）**且** ≠ 引擎 targetPath
 * （INV-7 写面限制：引擎恒装 targetPath=~/.local/bin/rtk）——装了也不满足配置位，按钮改手动安装提示（防误导成功）。
 * 对照面恒 true：裸名种子（A2 发现可被引擎落点满足）/ 种子=落点位（装完即满足）/ 路径在位（非「缺失」窗口）。
 * @param {string} seed 重解析种子（config 原值）
 * @param {object} [resolveEnv] findRtkBin 注入缝
 * @param {object} [installOpts] 引擎 opts（installDir 决定 targetPath，install.js targetPathOf 单源）
 * @returns {boolean} true=一键重装可满足配置位
 */
function installTargetMatches(seed, resolveEnv, installOpts) {
  const s = String(seed ?? '')
  if (!looksPathLike(s)) return true // 裸名种子：A2 发现可被引擎落点满足
  if (findRtkBin(seed, resolveEnv).found) return true // 在位：非「缺失」窗口
  return path.resolve(s) === path.resolve(targetPathOf(installOpts)) // 缺失：仅落点位可被一键重装满足
}

/**
 * 四端点纯 handler（依赖注入、零模块态；每 handler 第一行 authGate——INV-1）。
 * @param {object} deps
 * @param {{requestRejection: Function}} deps.connection 鉴权缝
 * @param {string} [deps.rtkBin] 重解析种子（config 原值，F-FINAL-1(i)；数据面每请求 findRtkBin 重发现（Ruling a），version 面回显实际执行值）
 * @param {Function} [deps.exec] 注入执行器（测试用假 execFile）
 * @param {number} [deps.timeoutMs] 执行超时（缺省 5s，INV-5）
 * @param {Function} [deps.historyReader] history.db 只读读取器（health 压缩项注入缝）
 * @param {Function} [deps.readHistory] 同上（Task 5 getHealth 的键名；二者取其一）
 * @param {string} [deps.historyDb] history.db 路径（health 压缩项；缺省 ~/.local/share/rtk/history.db，可注入）
 * @param {Function} [deps.now] 时钟注入（health 近 30 天窗口判定；缺省 () => new Date()）
 * @param {object} [deps.resolveEnv] 解析注入缝（findRtkBin 形；F-02 hint 门控与引擎复检同源）
 * @param {string} [deps.platform] 平台判定注入（缺省 os.platform()，INV-6 门槛 + installSupported）
 * @param {string} [deps.arch] 架构判定注入（缺省 os.arch()）
 * @param {Function} [deps.installEngine] 安装引擎（缺省 Task 1 reinstallRtk；测试注入假引擎）
 * @param {object} [deps.installOpts] 引擎注入 opts（logPath 同时是记录面落点；Task 3 apply() 接线）
 * @param {Function} [deps.warn] 服务端留痕
 * @returns {{version: Function, gain: Function, health: Function, install: Function}} (req,res) 形 handler
 */
export function createDoctorHandlers({
  connection,
  rtkBin,
  exec,
  timeoutMs,
  historyReader,
  readHistory,
  historyDb,
  now,
  resolveEnv,
  platform,
  arch,
  installEngine = reinstallRtk,
  installOpts = {},
  warn = () => {},
}) {
  const actionOpts = { rtkBin, exec, timeoutMs, resolveEnv }
  const logPath = installOpts.logPath ?? defaultLogPath()

  // F-01（Task 6 fix，Ruling a 2026-10-04）+ F-FINAL-1(i) 种子修正（Ruling 2026-10-04）：数据面执行前每请求
  // findRtkBin 重发现（stat 级零 spawn），**种子=config 原值**（缺省裸名每请求重跑发现（PATH→官方落点兜底），
  // boot 命中具体路径被删/装落他位均自愈不等重启=窗口 a 闭合）；显式配置值 A3 幂等透传零覆盖（resolve-bin 语义不动）。
  // version 面 path 口径：回显本次实际执行的二进制（每请求重发现值，resolve-bin 单源）。
  const actionNow = () => ({ ...actionOpts, rtkBin: findRtkBin(rtkBin, resolveEnv).bin })

  /** 三动作抛错 → 失败信封（未知错误归 RTK_ERROR；hint 与 found 同门控 F-02/INV-9：真缺失才附安装提示）。 */
  const failFromError = (res, err) => {
    const code = err?.code === 'RTK_UNAVAILABLE' || err?.code === 'RTK_TIMEOUT' ? err.code : 'RTK_ERROR'
    const hint = code === 'RTK_UNAVAILABLE' ? missingInstallHint(rtkBin, resolveEnv) : null
    fail(res, ERROR_STATUS[code], code, String(err?.message ?? err), hint ? { hint } : undefined)
  }

  const version = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.version)) return
    try {
      // 版本面软回（US-1 / M5）+ Ruling 2 读取面：data 增 lastInstall（最近重装记录或 null）、installSupported
      // （服务端平台判定）与 installTargetMatch（F-FINAL-1(ii)：一键重装能否满足配置位，前端按钮门控语义）
      const data = await getVersion(actionNow())
      sendJson(res, 200, {
        data: {
          ...data,
          lastInstall: await readLastInstall(logPath, warn),
          installSupported: isSupportedPlatform(platform, arch),
          installTargetMatch: installTargetMatches(rtkBin, resolveEnv, installOpts),
        },
      })
    } catch (err) {
      warn(`[rtk-kit] 版本检查失败：${String(err?.message ?? err)}`)
      failFromError(res, err)
    }
  }

  const gain = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.gain)) return
    try {
      sendJson(res, 200, { data: await getGain(actionNow()) })
    } catch (err) {
      warn(`[rtk-kit] 统计读取失败：${String(err?.message ?? err)}`)
      failFromError(res, err)
    }
  }

  const health = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.health)) return
    try {
      // INV-7：POST body 不读不解析——七项只走固定白名单动作，请求内容永无路径进入 argv
      const items = await getHealth({ ...actionNow(), readHistory: readHistory ?? historyReader, historyDb, now })
      sendJson(res, 200, { data: items })
    } catch (err) {
      warn(`[rtk-kit] 健康检查异常（纵深防御，getHealth 契约永不抛）：${String(err?.message ?? err)}`)
      failFromError(res, err)
    }
  }

  const install = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.install)) return
    // INV-7 同形：POST body 不读不解析——请求内容永无路径进入 argv/URL（引擎 opts 全服务端注入，零用户输入）
    if (!isSupportedPlatform(platform, arch)) {
      // INV-6：他平台不进安装链（路由照常注册，数据面回分类错误 + 手动安装提示）
      return fail(res, INSTALL_ERROR_STATUS[PLATFORM_UNSUPPORTED], PLATFORM_UNSUPPORTED,
        `平台不支持一键重装（${platform ?? os.platform()}/${arch ?? os.arch()}，仅 linux/x64）`, { hint: INSTALL_HINT })
    }
    if (isReinstallInFlight()) {
      // INV-5：服务端互斥单飞——重入回 409 + error.code=reinstall-in-progress（前端按钮禁用 / 静默不重复弹错）
      return fail(res, INSTALL_ERROR_STATUS[REINSTALL_IN_PROGRESS], REINSTALL_IN_PROGRESS, '重装任务进行中（互斥单飞）')
    }
    try {
      const result = await installEngine({ ...installOpts, rtkBin: findRtkBin(rtkBin, resolveEnv).bin, platform, arch, resolveEnv })
      await appendInstallRecord(logPath, result.record, warn) // fail-open：写失败不影响安装结果（INV-4）
      sendJson(res, 200, { data: { record: result.record, verify: result.verify } })
    } catch (err) {
      const code = typeof err?.code === 'string' && Object.hasOwn(INSTALL_ERROR_STATUS, err.code) ? err.code : 'RTK_ERROR'
      const message = String(err?.message ?? err)
      if (code === REINSTALL_IN_PROGRESS) {
        // 重入=非安装尝试：零记录落盘、信封最小化（code + message）
        return fail(res, INSTALL_ERROR_STATUS[code], code, message)
      }
      if (err?.record !== undefined) {
        await appendInstallRecord(logPath, err.record, warn) // 失败也记（成败口径 US-5 / INV-10），fail-open
      }
      // R-3：失败态红条详情映射 .verify/.record/旧版 .bak 位置（backupPath，null=此前无旧版）
      const extra = {}
      if (code === PLATFORM_UNSUPPORTED) extra.hint = INSTALL_HINT
      if (err?.verify !== undefined) extra.verify = err.verify
      if (err?.record !== undefined) extra.record = err.record
      if (err?.backupPath !== undefined) extra.backupPath = err.backupPath
      if (code === 'RTK_ERROR') warn(`[rtk-kit] 安装失败（未分类，归 RTK_ERROR）：${message}`)
      fail(res, code === 'RTK_ERROR' ? ERROR_STATUS.RTK_ERROR : INSTALL_ERROR_STATUS[code], code, message, extra)
    }
  }

  return { version, gain, health, install }
}

/**
 * 注册设置页数据路由（Task 8 接线层调用；webServer/connection 缺缝探测由接线层负责）。
 * @param {object} ctx - 宿主 ctx（webServer.register 缝 + connection 鉴权缝；logger 可选）
 * @param {object} [opts] - {rtkBin, exec, timeoutMs, historyReader|readHistory, historyDb, now, warn,
 *   resolveEnv, platform, arch, installEngine, installOpts}（installOpts.logPath 同时是记录面落点）
 * @returns {Function} disposer（幂等、收敛不抛；交 ctx.effect 收敛）
 */
export function registerDoctorRoutes(ctx, opts = {}) {
  const connection = ctx.connection
  const warn = opts.warn ?? ((msg) => ctx.logger?.warn?.(msg))
  const handlers = createDoctorHandlers({
    ...opts,
    // F1（T6 审查收口）：connection/warn 最后进——opts.connection 不得遮蔽 ctx.connection 鉴权缝（防鉴权旁路）
    connection,
    warn,
  })

  // F2（T6 审查收口）：dispatch 外层兜底——authGate/methodGuard 抛错或 handler 异步拒绝 → 错误信封
  //（码族收口 RTK_ERROR），绝不 unhandled rejection；响应已发出/损坏时只留痕不二次回写（兜底自身绝不抛）。
  const failSafe = (res, err) => {
    warn(`[rtk-kit] 路由异常兜底：${String(err?.message ?? err)}`)
    try {
      if (res.writableEnded || res.headersSent) return
      fail(res, 500, 'RTK_ERROR', `内部错误：${String(err?.message ?? err)}`)
    } catch {
      /* 兜底不抛（响应已损坏时无处回信封） */
    }
  }

  const handler = (req, res) => {
    try {
      const p = pathnameOf(req)
      let ret
      if (p === `${API_PREFIX}/version`) ret = handlers.version(req, res)
      else if (p === `${API_PREFIX}/gain`) ret = handlers.gain(req, res)
      else if (p === `${API_PREFIX}/health`) ret = handlers.health(req, res)
      else if (p === `${API_PREFIX}/install`) ret = handlers.install(req, res)
      else {
        // 未知路径先过鉴权缝再 404（未登录者不获知路径存在性）；码族收口
        if (!authGate(connection, req, res)) return undefined
        return fail(res, 404, 'RTK_ERROR', '不提供该路径')
      }
      return typeof ret?.then === 'function' ? ret.catch((err) => failSafe(res, err)) : ret // F2：异步拒绝收敛为信封
    } catch (err) {
      failSafe(res, err) // F2：分发面同步抛错（authGate 等）同回信封
      return undefined
    }
  }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (typeof dispose === 'function') {
      try {
        dispose()
      } catch {
        /* 收敛不抛（INV-8） */
      }
    }
  }
}
