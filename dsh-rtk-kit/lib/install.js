// lib/install.js —— rtk 一键重装引擎（下载→SHA256 校验→tar 白名单解包→备份→原子落盘→复检）
// 依据：changes/2026-10-03-rtk-reinstall/TECH.md §3 1-5、7；constitution INV-2/INV-3/INV-7/INV-8。
//
// 形态：纯函数核 + 可注入 IO（fetch / fs / execFile / 时钟 / installDir / logPath）；
// 安装链全异步（Promise 化 execFile），零 spawnSync、零 shell 拼接、零远程脚本执行（INV-7）。
// 下载源唯一（INV-2）：URL 只由固定资产名常量拼出（releaseAssetUrl 白名单），零用户输入进 URL/argv。
// 校验门（INV-2/3）：SHA256 与 checksums.txt 精确匹配条目比对，不匹配绝不落盘；
//   归档字节先经校验认证，tar 才可见——解包仅取白名单条目 rtk（防路径穿越），其余条目一律忽略。
// 落盘（INV-3）：.rtk.tmp-<ts> → chmod 0o755 → 旧版 rename 备份 rtk.bak.<ts> → rename 原子替换；
//   一切失败路径不动旧二进制（备份后失败即回滚）。
// 复检（Ruling c 2026-10-04）：直指落盘 targetPath——多二进制共存绝不验到别处二进制；
//   版本口径仍走 lib/doctor.js getVersion（INV-9 同源），禁止另写版本逻辑。
// 互斥（INV-5）：模块级 in-flight 单飞；重入回 reinstall-in-progress 语义值（HTTP 409 由路由层映射）。
// 记录面（INV-10）：引擎只产出 record（字段白名单：时间/版本/来源 URL/成败/错误分类），
//   logPath 随结果透传，落盘归路由层——引擎写面仅 installDir/rtk(+.bak/.tmp) 与 mkdtemp 中转。

import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFile as cpExecFile } from 'node:child_process'
import { getVersion } from './doctor.js'

// ───────────────────────── 常量面（下载源唯一，INV-2） ─────────────────────────

export const RELEASE_DOWNLOAD_BASE = 'https://github.com/rtk-ai/rtk/releases/latest/download/'
export const RTK_ASSET = 'rtk-x86_64-unknown-linux-musl.tar.gz'
export const CHECKSUMS_ASSET = 'checksums.txt'
const ALLOWED_ASSETS = Object.freeze(new Set([RTK_ASSET, CHECKSUMS_ASSET]))

export const DEFAULT_TIMEOUT_MS = 60000 // 下载超时（TECH §3-1）
export const DEFAULT_VERIFY_TIMEOUT_MS = 5000 // 复检执行超时（doctor 同口径）
export const INSTALL_BIN_NAME = 'rtk'
export const WHITELIST_ENTRY = 'rtk' // 解包白名单条目（防 tar 路径穿越）

// 错误分类常量（TECH §3-7）：分类错误对象形状与 doctor-routes 信封一致 {code, message[, hint]}。
export const DOWNLOAD_FAILED = 'DOWNLOAD_FAILED'
export const CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH'
export const EXTRACT_FAILED = 'EXTRACT_FAILED'
export const WRITE_FAILED = 'WRITE_FAILED'
export const VERIFY_FAILED = 'VERIFY_FAILED'
export const PLATFORM_UNSUPPORTED = 'PLATFORM_UNSUPPORTED'
export const REINSTALL_IN_PROGRESS = 'reinstall-in-progress' // 互斥重入语义值（路由层映射 409）
export const INSTALL_ERROR_CODES = Object.freeze([
  DOWNLOAD_FAILED, CHECKSUM_MISMATCH, EXTRACT_FAILED, WRITE_FAILED, VERIFY_FAILED, PLATFORM_UNSUPPORTED,
])

/** 重装记录字段白名单（INV-10：零凭据/零 token/零 env 明文）。 */
export const INSTALL_RECORD_FIELDS = Object.freeze(['time', 'version', 'source', 'ok', 'error'])

/** 分类错误对象：code/message/hint 形与 doctor-routes {error:{code,message[,hint]}} 信封一致；
 *  失败态诊断面 .record/.verify/.backupPath 只作路由层红条详情映射源（R-3），不进 toEnvelope 形状。 */
export class InstallError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'InstallError'
    this.code = code
    if (extra.hint) this.hint = extra.hint
    if (extra.cause !== undefined) this.cause = extra.cause
    if (extra.verify !== undefined) this.verify = extra.verify
    if (extra.record !== undefined) this.record = extra.record
    if (extra.backupPath !== undefined) this.backupPath = extra.backupPath
  }

  /** 信封形状（与 doctor-routes fail() 同形）：{code, message[, hint]}。 */
  toEnvelope() {
    return { code: this.code, message: this.message, ...(this.hint ? { hint: this.hint } : {}) }
  }
}

/**
 * 资产 URL（固定模板 + 资产名白名单；非白名单一律拒绝，杜绝任意 URL/用户输入拼接）。
 * @param {string} asset - 只认 RTK_ASSET / CHECKSUMS_ASSET 两值
 */
export function releaseAssetUrl(asset) {
  if (typeof asset !== 'string' || !ALLOWED_ASSETS.has(asset)) {
    throw new TypeError(`releaseAssetUrl: 资产名不在白名单内 ${JSON.stringify(asset)}`)
  }
  return RELEASE_DOWNLOAD_BASE + asset
}

/** 平台门槛（INV-6）：linux + x64 才支持一键重装。 */
export function isSupportedPlatform(platform = os.platform(), arch = os.arch()) {
  return platform === 'linux' && arch === 'x64'
}

/**
 * 解析 checksums.txt（行形 `<hash>  <name>`）→ Map(name → hex hash 小写)。
 * 文件名精确匹配（Map 键），前后缀变体不冒名。
 */
export function parseChecksums(text) {
  const out = new Map()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2 || !/^[0-9a-fA-F]{64}$/.test(parts[0])) continue
    const name = parts.slice(1).join(' ').replace(/^\*/, '')
    if (name === '') continue
    out.set(name, parts[0].toLowerCase())
  }
  return out
}

/** 构造重装记录（INV-10 字段白名单：多余键一律丢弃）。 */
export function buildInstallRecord(fields = {}) {
  return Object.freeze({
    time: typeof fields.time === 'string' ? fields.time : null,
    version: typeof fields.version === 'string' ? fields.version : null,
    source: typeof fields.source === 'string' ? fields.source : null,
    ok: fields.ok === true,
    error: typeof fields.error === 'string' ? fields.error : null,
  })
}

/** 记录面默认落点（代码默认值；opts.logPath 可注入，落盘归路由层）。 */
export function defaultLogPath(homedir = os.homedir()) {
  return path.join(homedir, '.dsh', 'dsh-rtk-kit', 'install-log.json')
}

// ───────────────────────── 默认 IO 缝（可注入替换） ─────────────────────────

/** 默认 fs 缝（全异步；测试可部分覆盖注入故障）。 */
export const defaultFs = Object.freeze({
  mkdir: (d, o) => fsp.mkdir(d, o),
  mkdtemp: (prefix) => fsp.mkdtemp(prefix),
  writeFile: (p, d) => fsp.writeFile(p, d),
  readFile: (p) => fsp.readFile(p),
  rename: (a, b) => fsp.rename(a, b),
  chmod: (p, m) => fsp.chmod(p, m),
  rm: (p, o) => fsp.rm(p, o),
  stat: (p) => fsp.stat(p),
  lstat: (p) => fsp.lstat(p),
  copyFile: (a, b) => fsp.copyFile(a, b),
  createWriteStream: (p, o) => fs.createWriteStream(p, o),
})

/** 默认 execFile 缝（Promise 化；非零退出也 resolve {code,stdout,stderr}，spawn 级失败才 reject）。 */
function defaultExecFile(file, args, opts) {
  return new Promise((resolve, reject) => {
    cpExecFile(file, args, { encoding: 'utf8', ...opts }, (err, stdout, stderr) => {
      if (err && typeof err.code !== 'number') return reject(err)
      resolve({ code: err ? err.code : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

const errText = (err) => String(err?.message ?? err?.code ?? err)
const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

async function isRegularFile(fsImpl, p) {
  try {
    return (await fsImpl.lstat(p)).isFile()
  } catch {
    return false
  }
}

// ───────────────────────── 下载（fetch + AbortController 有界超时） ─────────────────────────

function downloadError(aborted, timeoutMs, url, err) {
  return new InstallError(
    DOWNLOAD_FAILED,
    aborted ? `下载超时（${timeoutMs}ms）：${url}` : `下载失败：${errText(err)}`,
    { cause: err },
  )
}

/**
 * 下载资产：dest 给定=流式落盘中转文件（半截文件靠后续校验兜底），否则取文本。
 * @returns {Promise<string|void>} dest 为空时返回响应文本
 */
async function fetchAsset(o, url, dest) {
  const controller = new AbortController()
  let aborted = false
  const timer = setTimeout(() => { aborted = true; controller.abort() }, o.timeoutMs)
  try {
    let res
    try {
      res = await o.fetch(url, { signal: controller.signal })
    } catch (err) {
      throw downloadError(aborted, o.timeoutMs, url, err)
    }
    if (!res || res.ok !== true) {
      throw new InstallError(DOWNLOAD_FAILED, `下载失败：HTTP ${res ? res.status : '无响应'}（${url}）`)
    }
    try {
      if (dest) {
        if (res.body == null) throw new Error('响应无 body')
        const src = typeof res.body.getReader === 'function' ? Readable.fromWeb(res.body) : Readable.from(res.body)
        await pipeline(src, o.fs.createWriteStream(dest))
        return undefined
      }
      if (typeof res.text !== 'function') throw new Error('响应不支持文本读取')
      return await res.text()
    } catch (err) {
      throw downloadError(aborted, o.timeoutMs, url, err)
    }
  } finally {
    clearTimeout(timer)
  }
}

// ───────────────────────── 安装链（分类失败路径：旧二进制一切失败路径不动，INV-3） ─────────────────────────

/** 默认安装位（官方 install.sh 落点）：~/.local/bin。 */
function defaultInstallDir() {
  return path.join(os.homedir(), '.local', 'bin')
}

/** 引擎落盘目标（F-FINAL-1(ii) 按钮门控单源 + normalizeOpts 共用）：installDir 缺省官方落点，文件名恒 INSTALL_BIN_NAME。 */
export function targetPathOf(raw = {}) {
  return path.join(raw.installDir ?? defaultInstallDir(), INSTALL_BIN_NAME)
}

function normalizeOpts(raw = {}) {
  const installDir = raw.installDir ?? defaultInstallDir()
  return {
    rtkBin: raw.rtkBin ?? 'rtk',
    installDir,
    targetPath: targetPathOf(raw),
    logPath: raw.logPath ?? defaultLogPath(),
    tmpdir: raw.tmpdir ?? os.tmpdir(),
    timeoutMs: raw.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    verifyTimeoutMs: raw.verifyTimeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS,
    now: typeof raw.now === 'function' ? raw.now : Date.now,
    fetch: typeof raw.fetch === 'function' ? raw.fetch : globalThis.fetch,
    exec: typeof raw.exec === 'function' ? raw.exec : defaultExecFile,
    fs: raw.fs ? { ...defaultFs, ...raw.fs } : defaultFs,
    resolveEnv: raw.resolveEnv,
    platform: raw.platform ?? os.platform(),
    arch: raw.arch ?? os.arch(),
  }
}

async function runInstall(o) {
  const ts = o.now()
  const tarUrl = releaseAssetUrl(RTK_ASSET)
  const recordOf = (fields) => buildInstallRecord({ time: new Date(ts).toISOString(), source: tarUrl, ...fields })

  if (!isSupportedPlatform(o.platform, o.arch)) {
    throw new InstallError(PLATFORM_UNSUPPORTED, `平台不支持一键重装（${o.platform}/${o.arch}，仅 linux/x64）`)
  }

  let staging = null
  try {
    try {
      staging = await o.fs.mkdtemp(path.join(o.tmpdir, 'rtk-install-'))
    } catch (err) {
      throw new InstallError(WRITE_FAILED, `创建中转目录失败：${errText(err)}`, { cause: err })
    }

    // 1) 校验清单（下载源唯一：两资产均固定 URL，零用户输入）
    const sumsText = await fetchAsset(o, releaseAssetUrl(CHECKSUMS_ASSET))
    const expected = parseChecksums(sumsText).get(RTK_ASSET)
    if (!expected) {
      throw new InstallError(CHECKSUM_MISMATCH, 'checksums.txt 缺少目标资产条目，无法校验（中止不落盘）')
    }

    // 2) 下载归档（流式落盘中转目录）
    const tgz = path.join(staging, RTK_ASSET)
    await fetchAsset(o, tarUrl, tgz)

    // 3) SHA256 校验（不匹配=绝不落盘）
    let archiveBytes
    try {
      archiveBytes = await o.fs.readFile(tgz)
    } catch (err) {
      throw new InstallError(EXTRACT_FAILED, `读取中转归档失败：${errText(err)}`, { cause: err })
    }
    const actual = sha256Hex(archiveBytes)
    if (actual !== expected) {
      throw new InstallError(CHECKSUM_MISMATCH, `SHA256 校验失败（期望 ${expected}，实际 ${actual}），不落盘`)
    }

    // 4) 解包（固定 argv，零 shell）→ 只取白名单条目 rtk
    const extractDir = path.join(staging, 'extract')
    try {
      await o.fs.mkdir(extractDir, { recursive: true })
    } catch (err) {
      throw new InstallError(EXTRACT_FAILED, `创建解包目录失败：${errText(err)}`, { cause: err })
    }
    let extractErr = null
    let extractCode = null
    try {
      const r = await o.exec('tar', ['-xzf', tgz, '-C', extractDir], { timeout: o.timeoutMs })
      extractCode = r?.code ?? 0
    } catch (err) {
      extractErr = err
    }
    const picked = path.join(extractDir, WHITELIST_ENTRY)
    if (!(await isRegularFile(o.fs, picked))) {
      const why = extractErr ? errText(extractErr) : `tar 退出码 ${extractCode}`
      throw new InstallError(EXTRACT_FAILED, `解包未得到白名单条目 ${WHITELIST_ENTRY}（${why}）`, { cause: extractErr ?? undefined })
    }
    // 归档字节已经校验认证；tar 对非白名单成员（含 .. 形）跳过并以非零码退出（GNU tar 实测）——
    // 白名单条目在场且为常规文件即视为解包成功，其余成员一律不取（写面只落 rtk）。
    try {
      await o.fs.chmod(picked, 0o755)
    } catch (err) {
      throw new InstallError(EXTRACT_FAILED, `白名单条目补可执行位失败：${errText(err)}`, { cause: err })
    }

    // 5) 备份 + 原子落盘（一切失败路径不动旧二进制）
    try {
      await o.fs.mkdir(o.installDir, { recursive: true })
    } catch (err) {
      throw new InstallError(WRITE_FAILED, `创建目标目录失败（旧二进制未动）：${errText(err)}`, { cause: err })
    }
    const tmp = path.join(o.installDir, `.rtk.tmp-${ts}`)
    const cleanupTmp = async () => {
      try { await o.fs.rm(tmp, { force: true }) } catch { /* 清理尽力而为 */ }
    }
    try {
      await o.fs.copyFile(picked, tmp)
      await o.fs.chmod(tmp, 0o755)
    } catch (err) {
      await cleanupTmp()
      throw new InstallError(WRITE_FAILED, `写入中转文件失败：${errText(err)}`, { cause: err })
    }
    let backupPath = null
    if (await isRegularFile(o.fs, o.targetPath)) {
      backupPath = path.join(o.installDir, `rtk.bak.${ts}`)
      try {
        await o.fs.rename(o.targetPath, backupPath)
      } catch (err) {
        await cleanupTmp()
        throw new InstallError(WRITE_FAILED, `备份旧二进制失败（旧二进制未动）：${errText(err)}`, { cause: err })
      }
    }
    try {
      await o.fs.rename(tmp, o.targetPath)
    } catch (err) {
      // F-FINAL-2（Ruling 2026-10-04）：报文二值化——回滚成功才称「旧二进制已回滚」；回滚失败如实「旧版保留于
      // <backupPath>，回滚失败：<原因>」（旧字节仍在 .bak，INV-3 不破）；无旧版如实「此前无旧二进制」；
      // 回滚错进 cause（不静默吞，cause=回滚错优先、无回滚错则原始 rename 错）。
      let rollbackErr = null
      if (backupPath) {
        try { await o.fs.rename(backupPath, o.targetPath) } catch (rerr) { rollbackErr = rerr }
      }
      await cleanupTmp()
      const note = rollbackErr
        ? `旧版保留于 ${backupPath}，回滚失败：${errText(rollbackErr)}`
        : backupPath ? '旧二进制已回滚' : '此前无旧二进制'
      throw new InstallError(WRITE_FAILED, `原子落盘失败（${note}）：${errText(err)}`, { cause: rollbackErr ?? err })
    }

    // 6) 复检（Ruling c 2026-10-04）：直指落盘 targetPath（多二进制共存绝不验到 PATH 他处二进制）；
    //    版本口径 getVersion 单源（INV-9），解析逻辑不另写。
    let verify
    try {
      verify = await getVersion({ rtkBin: o.targetPath, exec: o.exec, timeoutMs: o.verifyTimeoutMs, resolveEnv: o.resolveEnv })
    } catch (err) {
      throw new InstallError(VERIFY_FAILED, `复检失败：${errText(err)}`, {
        cause: err,
        record: recordOf({ ok: false, error: VERIFY_FAILED, version: null }),
        backupPath, // R-3：旧版 .bak 位置（null=此前无旧版），路由层红条详情映射
      })
    }
    if (!verify?.available) {
      throw new InstallError(VERIFY_FAILED, '复检未通过：安装后 rtk 仍不可用', {
        verify,
        record: recordOf({ ok: false, error: VERIFY_FAILED, version: verify?.version ?? null }),
        backupPath, // R-3：同上
      })
    }
    return {
      ok: true,
      verify,
      targetPath: o.targetPath,
      backupPath,
      record: recordOf({ ok: true, error: null, version: verify.version }),
      logPath: o.logPath,
    }
  } finally {
    if (staging) {
      try { await o.fs.rm(staging, { recursive: true, force: true }) } catch { /* 清理尽力而为 */ }
    }
  }
}

/** 失败路径补记录（INV-10：失败也只记白名单字段），原错误对象原样上抛。 */
async function withRecord(promise, o) {
  try {
    return await promise
  } catch (err) {
    if (err instanceof InstallError && err.record === undefined) {
      const ts = o.now()
      err.record = buildInstallRecord({
        time: new Date(ts).toISOString(),
        source: releaseAssetUrl(RTK_ASSET),
        ok: false,
        error: err.code,
        version: err.verify?.version ?? null,
      })
    }
    throw err
  }
}

// ───────────────────────── 对外入口（模块级互斥单飞，INV-5） ─────────────────────────

let inFlight = null

/** 互斥在场判定（路由层可据此预判 409）。 */
export function isReinstallInFlight() {
  return inFlight !== null
}

/**
 * 一键重装（下载→校验→解包→备份→原子落盘→复检）。
 * @param {object} [raw] 可注入 IO：{rtkBin, installDir, logPath, tmpdir, timeoutMs, verifyTimeoutMs,
 *   now, fetch, exec, fs, resolveEnv, platform, arch}
 * @returns {Promise<{ok:true, verify, targetPath, backupPath, record, logPath}>}
 * @throws {InstallError} {code, message[, hint], record?, verify?}；重入回 REINSTALL_IN_PROGRESS
 */
export function reinstallRtk(raw = {}) {
  if (inFlight !== null) {
    return Promise.reject(new InstallError(REINSTALL_IN_PROGRESS, '重装任务进行中（互斥单飞）'))
  }
  const o = normalizeOpts(raw)
  const p = withRecord(runInstall(o), o).finally(() => { inFlight = null })
  inFlight = p
  return p
}
