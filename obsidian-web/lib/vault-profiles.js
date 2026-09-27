// vault-profiles — 设置页 vault 目录档案数据面（OW-US-13）：默认当前目录 + 任意已挂载 SMB/NFS
// 路径 + 健康检查（可读/可写/延迟三探针）+ 多档案切换语义。
// 交接契约：
//   - T11 vaultRoot 热改/多根：热改可解释拒不冒充——activate 只记录选择 + restartRequired:true，
//     运行期 vaultRoot 恒取 config（绝不拿旧根冒充已切换）；多根=本卡档案列表数据面。
//   - T10 per-vault 设置：换 vault 提示「各配」（外网域名等随 vault 各配）——RESTART_MESSAGE/UI 提示面。
//   - OW-US-13 健康检查=可读/可写/延迟三探针；CIFS 现实：延迟含挂载抖动容忍（超阈重试取优再判）。
// 持久化（ARC-2：落 vault 文件系统）：<vaultRoot>/.ob-share/vault-profiles.json（0600 原子写
// + 双 fsync，INV-15 风格；内部段围栏遮蔽 + dot 不出树——T10 Ruling 1 同款落点语义）。
// 默认档案=当前目录（计算行恒随 config.vaultRoot，不落盘防陈旧）；档案路径=未来 vault 根
// （mount 点），不受当前 vault 围栏管辖——鉴权面（authGate）限定所有者配置。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { writeAtomicFsync } from './vault-ops.js'
import { SHARE_DIR } from './share.js'

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

export const DEFAULT_PROFILE_ID = 'default'
export const DEFAULT_PROFILE_NAME = '当前目录'
export const REGISTRY_NAME = 'vault-profiles.json'
export const HEALTH_SLOW_MS = 2000 // 延迟阈值（≥2s=慢盘；以下容忍挂载抖动）
/** 换 vault 提示（T10 提示面锁形：含「重启」+「外网域名」+「各配」） */
export const RESTART_MESSAGE = '档案切换需重启/重载插件后生效——运行期 vaultRoot 不支持热改（不冒充已切换）；各 vault 设置（外网域名等）随 vault 各配'

const REGISTRY_MODE = 0o600
const REGISTRY_VERSION = 1

function registryPath(root) {
  return path.join(path.resolve(root), SHARE_DIR, REGISTRY_NAME)
}

function readRegistry(root) {
  try {
    const raw = fs.readFileSync(registryPath(root), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== REGISTRY_VERSION || !Array.isArray(parsed.profiles)) {
      throw new Error('注册表形非法')
    }
    return {
      version: REGISTRY_VERSION,
      activeProfileId: typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : DEFAULT_PROFILE_ID,
      profiles: parsed.profiles.filter((p) => typeof p?.id === 'string' && typeof p?.path === 'string'),
    }
  } catch (err) {
    if (err?.code === 'ENOENT') return { version: REGISTRY_VERSION, activeProfileId: DEFAULT_PROFILE_ID, profiles: [] }
    throw fail('bad_request', `vault 档案注册表损坏（fail-loud，不冒充空表）：${err?.message ?? err}`)
  }
}

function writeRegistry(root, registry) {
  const file = registryPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  return writeAtomicFsync(file, `${JSON.stringify(registry, null, 2)}\n`, REGISTRY_MODE)
}

function normalizeProfilePath(p) {
  if (typeof p !== 'string' || p === '') throw fail('bad_request', 'path 参数缺失')
  if (p.includes('\0')) throw fail('bad_request', 'path 含非法字符')
  if (!path.isAbsolute(p)) throw fail('bad_request', '档案路径必须是绝对路径（已挂载 SMB/NFS 路径）')
  return path.resolve(p)
}

function defaultProfile(root) {
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    path: path.resolve(root),
    isCurrent: true,
    removable: false,
  }
}

/** 档案列表（默认档案计算行恒随当前 vaultRoot + 落盘档案行） */
export function listProfiles(root) {
  const registry = readRegistry(root)
  const rows = [defaultProfile(root)]
  for (const p of registry.profiles) {
    rows.push({
      id: p.id,
      name: p.name,
      path: p.path,
      isCurrent: p.path === path.resolve(root),
      removable: true,
    })
  }
  return { profiles: rows, activeProfileId: registry.activeProfileId }
}

/** 新增档案（任意已挂载 SMB/NFS 路径——挂载可暂缺，健康检查如实报） */
export async function addProfile(root, params) {
  const p = params ?? {}
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (name === '' || name.length > 64) throw fail('bad_request', 'name 必须是 1-64 字符非空名称')
  const target = normalizeProfilePath(p.path)
  const registry = readRegistry(root)
  if (target === path.resolve(root)) throw fail('bad_request', '档案已存在（当前目录=默认档案）')
  if (registry.profiles.some((x) => path.resolve(x.path) === target)) throw fail('bad_request', '档案已存在（同路径）')
  const profile = {
    id: `p-${crypto.randomBytes(8).toString('hex')}`,
    name,
    path: target,
    createdAt: Date.now(),
  }
  registry.profiles.push(profile)
  await writeRegistry(root, registry)
  return { profile }
}

/** 删除档案（默认档案不可删；删激活档案 → active 归默认，不留悬空指针） */
export async function removeProfile(root, id) {
  if (id === DEFAULT_PROFILE_ID) throw fail('bad_request', '默认档案（当前目录）不可删除')
  const registry = readRegistry(root)
  const idx = registry.profiles.findIndex((x) => x.id === id)
  if (idx === -1) throw fail('not_found', `档案不存在：${id}`)
  registry.profiles.splice(idx, 1)
  if (registry.activeProfileId === id) registry.activeProfileId = DEFAULT_PROFILE_ID
  await writeRegistry(root, registry)
  return listProfiles(root)
}

/**
 * 切换语义（T11 交接：热改可解释拒不冒充）：记录激活档案选择 + restartRequired:true——
 * 运行期 vaultRoot 恒取 config（消费面绝不冒充已切换）；生效=重启/重载插件。
 */
export async function activateProfile(root, id) {
  const registry = readRegistry(root)
  const known = id === DEFAULT_PROFILE_ID || registry.profiles.some((x) => x.id === id)
  if (!known) throw fail('not_found', `档案不存在：${id}`)
  registry.activeProfileId = id
  await writeRegistry(root, registry)
  return { activeProfileId: id, restartRequired: true, message: RESTART_MESSAGE }
}

// ── 健康检查三探针（OW-US-13：可读/可写/延迟）────────────────────────────────────
function readableProbe(target) {
  try {
    fs.readdirSync(target)
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err?.code ?? String(err?.message ?? err) }
  }
}

function writableProbe(target) {
  const probe = path.join(target, `.ob-health-probe-${crypto.randomBytes(6).toString('hex')}`)
  try {
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
    return { ok: true, error: null }
  } catch (err) {
    try { fs.unlinkSync(probe) } catch { /* 清残尽力（探针失败时可能从未创建） */ }
    return { ok: false, error: err?.code ?? String(err?.message ?? err) }
  }
}

/** 延迟探针（stat 往返）：超阈重试取优=挂载抖动容忍（CIFS 现实）；now 可注入=测真非 mock */
function latencyProbe(target, now) {
  const t0 = now()
  try {
    fs.statSync(target)
  } catch (err) {
    return { latencyMs: null, samples: [], error: err?.code ?? String(err?.message ?? err) }
  }
  const first = now() - t0
  const samples = [first]
  let latencyMs = first
  if (first >= HEALTH_SLOW_MS) {
    const t2 = now()
    try {
      fs.statSync(target)
    } catch {
      return { latencyMs: first, samples, error: null }
    }
    const second = now() - t2
    samples.push(second)
    latencyMs = Math.min(first, second) // 抖动容忍=取优再判
  }
  return { latencyMs, samples, error: null }
}

export function classifyHealth({ readableOk, writableOk, latencyMs }) {
  if (!readableOk) return 'unreachable' // 读不出=挂载掉线/未挂载
  if (!writableOk) return 'degraded' // 可读不可写=只读挂载/权限
  if (latencyMs === null || latencyMs >= HEALTH_SLOW_MS) return 'degraded' // 真慢盘（抖动容忍后）
  return 'ok'
}

/**
 * 健康检查（可读/可写/延迟三探针）。目标=档案路径（未来 vault 根，mount 点），不受当前
 * vault 围栏管辖；路径形围栏=绝对路径语义（bad_request 可解释）。
 * @returns {{readable:{ok,error}, writable:{ok,error}, latencyMs, samples, status}}
 */
export function checkVaultHealth(targetPath, options = {}) {
  const now = options.now ?? Date.now
  const target = normalizeProfilePath(targetPath)
  const readable = readableProbe(target)
  const writable = writableProbe(target)
  const latency = latencyProbe(target, now)
  return {
    readable: { ok: readable.ok, error: readable.error },
    writable: { ok: writable.ok, error: writable.error },
    latencyMs: latency.latencyMs,
    samples: latency.samples,
    status: classifyHealth({ readableOk: readable.ok, writableOk: writable.ok, latencyMs: latency.latencyMs }),
  }
}
