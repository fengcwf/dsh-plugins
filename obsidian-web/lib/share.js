// share — 分享令牌/角色/密码/到期/一次性/撤销/限流（T8：模型+校验+管理面数据面；/ob_share/ HTTP 面与
// live 渲染直出归 T9，管理页前端归 T10）。契约（delta-specs §2 + PRODUCT OW-INV-1/2/2b 权威编号）：
//   分享条目 {token, target, role:'read'|'write', passwordHash?, expiresAt?, oneShot, revoked, createdAt}
//   OW-INV-1  逐条显式生成、默认不对外；写权限必须设访问密码（autoPassword 自动生成、可改）；
//             敏感文件名（SENSITIVE_GLOBS 显式常量清单）永不可分享——任意路径段命中即拒
//   OW-INV-2  角色分级范围模型：笔记分享（写）=仅内容编辑；文件夹分享（写）=目录内新建/编辑/删除/改名；
//             范围外/穿越 subPath 一律 false（fail-closed，T9 映射 404/405）
//   OW-INV-2b 密码可无；设置时自动生成；校验失败/过期/撤销/一次性已消耗/不存在/坏 token 形/配置禁用
//             → 同形 404（不泄露存在性）；每 IP 120/min 滑窗限流（判在查表前、统一 429 形）
// 安全面硬约束：
//   - token=crypto.randomBytes(32)=256bit≥128bit 不可枚举，base64url 43 字符（TOKEN_RE 锁形，
//     同时封死借 token 参数穿越文件系统的通道）
//   - 密码=hash+salt（scrypt N=16384），盘上绝无明文；guest 校验一调用恰一次 scrypt——
//     失败路径付 dummy 代价（burnScrypt），不给「存在/不存在」时序侧信道
//   - 持久化 <vaultRoot>/.ob-share/<token>.json（0600/0700；原子写+双 fsync=ARC-4 崩溃持久化；
//     dot 目录不出树）；一次性消耗/计数与校验同一锁内落盘（withFileLock，10 并发恰 1 成功）
//   - 自指围栏（C-1，T8 fix r1；fix r2 别名归一补强）：vault 根不可分享；guest subPath 与 target 逐段过
//     INTERNAL_SEGMENTS+isSensitiveName——.ob-share（分享存储自身）/.trash（恢复材料）/敏感名经分享面
//     永不可达（fail-closed）。不变量声明（fix r2 修正）：判定含 CIFS/SMB 别名归一（剥前导空格+尾随 [. ]、
//     大小写不敏感）——'.ob-share.'/' .TRASH.'/' . ' 等别名形与本体同拒，「永不可经分享面触达」在别名
//     FS 模型（Windows/SMB 剥尾随点/空格）下同样成立；根族/穿越段（'.'/'..'+尾随 [. ]/前导空格别名）同判。
//   - guest 面 fail-closed：内部异常与不存在同形（不泄露存在性）；可解释错误只走管理面
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { resolveInRoot, writeAtomicFsync } from './vault-ops.js'
import { normalizeSegAlias } from './path-alias.js'

// ── 显式常量（改值必须过 test/share*.test.mjs 锁形测试）────────────────────
export const SHARE_DIR = '.ob-share'
// 分享 URL 前缀（OW-US-9 根治 URL 拼接坑）：分享 URL 路径段的唯一字面来源——guest 面
// （share-server FACE_PREFIX）与链接生成（share-links.buildShareLinks）同引此常量；前端零拼接
// （红线「禁止半路拼分享 URL」，test/share-links.test.mjs 字面量恰一处 + web/src 零命中双锁）。
export const SHARE_URL_PREFIX = '/ob_share/'
export const TOKEN_BYTES = 32 // 256bit（≥128bit 下限，OW-INV-2b「不可枚举」）
export const ROLES = Object.freeze(['read', 'write'])
export const OPERATIONS = Object.freeze(['read', 'edit', 'create', 'delete', 'rename'])
export const RATE_LIMIT_PER_MINUTE = 120 // OW-INV-2b 每 IP 120/min
export const RATE_WINDOW_MS = 60_000
// 敏感文件名永禁清单（OW-INV-1；v1.1 修订（spec-owner 已批，T8 fix r1/M-5）：*.ext 类加尾随通配，
// 修正 .env* 宽 vs *.pem 窄不一致——x.pem.backup/secrets.pem.backup 类备份残形全命中；误杀反例不回退）。
// glob 形（* 通配）、大小写不敏感、逐路径段判定；匹配前归一（前导空格+尾随 [. ] 剥除，CIFS/SMB 归一现实）。
// C-1（T8 fix r1）：guest subPath 逐段同判（内部段+敏感名 fail-closed）——Q1 目录内容可达残余风险已闭合。
export const SENSITIVE_GLOBS = Object.freeze([
  '.env*', '*.pem*', '*.key*', '*.credentials*', '.npmrc', '.netrc', '*.p12*', '*.pfx*',
  'id_rsa*', 'id_dsa*', 'id_ecdsa*', 'id_ed25519*',
])
const SENSITIVE_RE = SENSITIVE_GLOBS.map((glob) => new RegExp(
  `^${glob.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i'))
export const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/ // base64url 形（32B→43 字符）；零 '.'/'/'/'\' = 文件名/围栏安全
const INTERNAL_SEGMENTS = new Set(['.trash', SHARE_DIR]) // 恢复材料/自身存储永不可分享
// CIFS/SMB 别名归一：单一来源收敛 path-alias.js（T12 围栏合流——share.js 模型层与 vault-ops
// realpath 围栏「同源口径」；M-5 语义不变：剥前导空格+尾随 [. ]、前导 '.' 绝不剥（.env 保形））。
function isInternalSegment(seg) {
  // C-1：内部段判定大小写不敏感（CIFS 大小写不敏感面 .TRASH 与 .trash 同物——fail-closed 不给绕行）；
  // C-1 fix r2：同过别名归一（trim）——'.ob-share.'/' .TRASH.'/' .trash. ' 等尾随 [. ]/前导空格形与本体同拒
  return INTERNAL_SEGMENTS.has(normalizeSegAlias(seg).toLowerCase())
}
const LOCK_WAIT_MS = 10_000
const DAY_MS = 86_400_000
const DEFAULT_TTL_DAYS = 7
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 32, maxN: 1 << 20 } // maxN=坏存储 DoS 护栏
const PW_ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789' // 去易混 0O1lI
const PW_LENGTH = 16

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// ── 令牌与密码 ─────────────────────────────────────────────────────────────
export function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url') // 43 字符 / 256bit
}

export function generatePassword() {
  let out = ''
  for (let i = 0; i < PW_LENGTH; i++) out += PW_ALPHABET[crypto.randomInt(PW_ALPHABET.length)]
  return out
}

/** 密码存储形：scrypt$N$r$p$saltB64$hashB64（hash+salt，绝无明文；算法前缀可演进） */
export function hashPassword(password) {
  if (typeof password !== 'string' || password === '') throw fail('bad_request', '密码必须是非空字符串')
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

/** 校验（timingSafeEqual 恒时比对；畸形/超规存储→false 非抛） */
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password === '' || typeof encoded !== 'string') return false
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  if (N < 2 || N > SCRYPT.maxN || r < 1 || p < 1) return false
  const salt = Buffer.from(parts[4], 'base64url')
  const expected = Buffer.from(parts[5], 'base64url')
  if (salt.length === 0 || expected.length === 0 || expected.length > 256) return false
  let actual
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N, r, p })
  } catch {
    return false
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// dummy scrypt（失败路径付真实代价：不存在 token 与坏密码同量级耗时，不给存在性时序侧信道）
let dummyHashCache
function burnScrypt() {
  if (!dummyHashCache) dummyHashCache = hashPassword('obsidian-web-dummy-burn')
  verifyPassword('obsidian-web-dummy-burn', dummyHashCache)
}

// ── 敏感文件名（OW-INV-1）──────────────────────────────────────────────────
export function isSensitiveName(name) {
  if (typeof name !== 'string' || name === '') return false
  // M-5（v1.1，T8 fix r1）：匹配前归一——前导空格剥除（' id_rsa' 形）+ 尾随 [. ] 剥除
  // （CIFS/SMB 剥尾随点/空格：secrets.pem./'x.pem ' 与 secrets.pem 同一文件）；前导 '.' 绝不剥（.env 保形）。
  // fix r2：归一收敛 normalizeSegAlias 单一来源（isInternalSegment 同判）
  const normalized = normalizeSegAlias(name)
  if (normalized === '') return false
  return SENSITIVE_RE.some((rx) => rx.test(normalized))
}

export function isSensitivePath(relPath) {
  if (typeof relPath !== 'string' || relPath === '') return false
  return relPath.split(/[/\\]/).some((seg) => isSensitiveName(seg))
}

// ── 每 IP 限流（OW-INV-2b：120/min 滑窗）───────────────────────────────────
/**
 * 滑动窗口限流器（内存态，键=IP；now 可注入=测真逻辑非 mock）。
 * check(ip, now) → {allowed, remaining}；窗口恰界：limit 次全过、第 limit+1 次拒、
 * now-首击 ≥ windowMs 后恢复。缺 ip 归 '(anonymous)' 桶（调用方不给 ip 时限流仍生效）。
 */
export function createRateLimiter({ limit = RATE_LIMIT_PER_MINUTE, windowMs = RATE_WINDOW_MS } = {}) {
  const hits = new Map() // ip → 升序时间戳数组
  return {
    check(ip, now = Date.now()) {
      const key = typeof ip === 'string' && ip !== '' ? ip : '(anonymous)'
      const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (arr.length >= limit) {
        hits.set(key, arr)
        return { allowed: false, remaining: 0 }
      }
      arr.push(now)
      hits.set(key, arr)
      if (hits.size > 4096) { // 内存有界：清空全过期桶
        for (const [k, v] of hits) {
          if (v.length === 0 || now - v[v.length - 1] >= windowMs) hits.delete(k)
        }
      }
      return { allowed: true, remaining: limit - arr.length }
    },
  }
}

// ── 同形响应（OW-INV-2b：不泄露存在性）────────────────────────────────────
// export（T9）：guest HTTP 面同形 404/429 响应体单一来源——share-server 构造响应必须复用此二形，
// 与模型层逐字节同形（test/share-server.test.mjs 字面双锁防漂移）。
export function accessDenied() {
  // 全失败形态（校验失败/过期/撤销/一次性已消耗/不存在/坏 token 形/配置禁用）共此一形：
  // 固定四键、常量消息、冻结——任何差异都是存在性泄露
  return Object.freeze({ ok: false, status: 404, code: 'not_found', message: '分享不存在或已失效' })
}
export function rateLimited() {
  // 限流响应=429 统一形：判在查表前、键只看 IP——存在/不存在 token 得到逐字节同响应
  return Object.freeze({ ok: false, status: 429, code: 'rate_limited', message: '请求过于频繁，请稍后重试' })
}

// ── 持久化（<vaultRoot>/.ob-share/<token>.json，0600/0700，原子写+双 fsync）──
function shareDirAbs(root) {
  return path.join(path.resolve(root), SHARE_DIR)
}
function assertToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw fail('bad_request', 'token 形非法')
}
function shareFileAbs(root, token) {
  // token 已过 TOKEN_RE（无 '.'/'/'/'\'）——join 恒在 .ob-share 内，穿越通道封死
  return path.join(shareDirAbs(root), `${token}.json`)
}
function readEntrySync(file, token) {
  // M-1（T8 fix r1）：entry.token 必须与文件名 token 全等（串号条目 fail-closed 当无此分享——
  // 防改名/搬运条目借文件名冒充他 token）；缺参比较恒 false=fail-closed
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
    return entry && typeof entry === 'object' && entry.token === token ? entry : null
  } catch {
    return null // 缺失/坏 JSON 一律当无此分享（fail-closed 同形）
  }
}
async function persistEntry(file, entry) {
  await writeAtomicFsync(file, JSON.stringify(entry, null, 2), 0o600)
}
export async function ensureShareDir(root) {
  const dir = shareDirAbs(root)
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 })
  try {
    await fs.promises.chmod(dir, 0o700) // 已存在目录也收权（CIFS 不支持 chmod 时尽力而为，测试锁本地形）
  } catch { /* 文件系统不支持 mode：不阻塞（存储内容本身 hash 态无明文） */ }
  return dir
}
function toPublic(entry) {
  return {
    token: entry.token,
    target: entry.target,
    targetType: entry.targetType,
    role: entry.role,
    hasPassword: typeof entry.passwordHash === 'string',
    expiresAt: entry.expiresAt ?? null,
    oneShot: entry.oneShot === true,
    revoked: entry.revoked === true,
    createdAt: entry.createdAt,
    accessCount: entry.accessCount ?? 0,
    lastAccessAt: entry.lastAccessAt ?? null,
    revokedAt: entry.revokedAt ?? null,
    consumedAt: entry.consumedAt ?? null,
  }
}

// ── 形参归一 ───────────────────────────────────────────────────────────────
function normalizeExpiry(value) {
  if (value === null) return null // 显式 null = 永不过期
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw fail('bad_request', 'expiresAt 非法（必须是有限数值）')
    return value
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (!Number.isFinite(ms)) throw fail('bad_request', 'expiresAt 非法（ISO 时间或 epoch ms）')
    return ms
  }
  throw fail('bad_request', 'expiresAt 非法（ISO 时间或 epoch ms）')
}

function resolvePasswordSpec({ password, autoPassword }, { required }) {
  if (autoPassword !== undefined && typeof autoPassword !== 'boolean') throw fail('bad_request', 'autoPassword 非法')
  const given = password !== undefined && password !== null
  if (given && typeof password !== 'string') throw fail('bad_request', 'password 非法')
  if (given && autoPassword === true) throw fail('bad_request', 'password 与 autoPassword 只能给一')
  if (given && password === '') throw fail('bad_request', 'password 不能为空串（清除密码传 password=null）')
  if (!given && autoPassword !== true) {
    if (required) {
      // OW-INV-1 不变量级：写权限必须设访问密码（可解释：点名 autoPassword 自动生成途径）
      throw fail('password_required', '写权限必须设置访问密码（OW-INV-1）：传 password=<口令> 或 autoPassword=true 自动生成')
    }
    return { passwordHash: undefined, plaintext: null }
  }
  const plaintext = autoPassword === true ? generatePassword() : null
  return { passwordHash: hashPassword(plaintext ?? password), plaintext }
}

function normalizeSub(subPath) {
  // share-root-relative 子路径归一（''=目标本体）；任何可疑形 → null（fail-closed）
  if (typeof subPath !== 'string') return null
  if (subPath === '') return ''
  if (subPath.includes('\0') || subPath.includes('\\')) return null
  if (path.posix.isAbsolute(subPath) || /^[a-zA-Z]:/.test(subPath)) return null
  const segs = subPath.split('/')
  // fix r2：穿越判定过别名归一（trim 后再判 '..'）——'.. '/' ..'≡'..'（CIFS 剥尾随点/空格）同拒
  if (segs.some((s) => s.trim() === '..')) return null
  // 根族 filter（fix r2：trim 后再剔 '.'）——'.'/' '/' . '/' . .' 等别名段与 '.' 同族同剔（归 ''=目标本体）
  const kept = segs.filter((s) => normalizeSegAlias(s) !== '')
  // C-1 自指围栏（T8 fix r1）：subPath 逐段过 INTERNAL_SEGMENTS+isSensitiveName——
  // .ob-share（分享存储自身）/.trash（恢复材料）/敏感名永不可经 guest subPath 触达（fail-closed）
  if (kept.some((s) => isInternalSegment(s) || isSensitiveName(s))) return null
  return kept.join('/')
}

// ── OW-INV-2 范围模型（subPath=share-root-relative；输出=vault 相对路径）────
/**
 * 解析 guest 子路径 → 落点（vault 相对路径）。含入性由构造保证：
 * 一切输出恒在 share.target 内（file=目标本体；dir=target/<sub>），范围外/穿越 → {ok:false}。
 * file 分享寻址：'' | basename | 目标自身 vault 路径（三别名同指一文件）。
 */
export function resolveSharePath(share, subPath) {
  if (!share || typeof share !== 'object' || typeof share.target !== 'string' || share.target === '') return { ok: false }
  const target = share.target
  // C-1 纵深（T8 fix r1）：target 本体同样过围栏——vault 根（'.' 族）/内部段/敏感名/穿越/绝对/非法字符的
  // 条目（含盘上被篡改/遗留条目）一律 {ok:false}，绝不自指暴露 .ob-share/.trash/敏感文件。
  // fix r2：穿越/根族判定同过 CIFS/SMB 别名归一（trim 后再判 '..'、再剔 '.' 族）——别名形与本体同判
  const segList = target.split('/')
  if (segList.some((s) => s.trim() === '..')) return { ok: false }
  const targetSegs = segList.filter((s) => normalizeSegAlias(s) !== '')
  if (targetSegs.length === 0) return { ok: false }
  if (target.includes('\0') || target.includes('\\') || path.posix.isAbsolute(target) || /^[a-zA-Z]:/.test(target)) return { ok: false }
  if (targetSegs.some((s) => s === '..' || isInternalSegment(s) || isSensitiveName(s))) return { ok: false }
  const sub = normalizeSub(subPath)
  if (sub === null) return { ok: false }
  if (share.targetType === 'file') {
    const base = target.split('/').pop()
    if (sub === '' || sub === base || sub === target) return { ok: true, path: target }
    return { ok: false }
  }
  if (share.targetType === 'dir') {
    return { ok: true, path: sub === '' ? target : `${target}/${sub}` }
  }
  return { ok: false }
}

/** 操作许可（OW-INV-2 角色分级）：read/edit/create/delete/rename × read/write × file/dir */
export function shareAllowsOperation(share, op, subPath = '') {
  if (!share || typeof share !== 'object' || !OPERATIONS.includes(op)) return false
  const resolved = resolveSharePath(share, subPath)
  if (!resolved.ok) return false
  const sub = normalizeSub(subPath)
  const isSelf = sub === '' || resolved.path === share.target
  if (share.role === 'read') return op === 'read' // 只读角色：仅读
  if (share.role !== 'write') return false
  if (share.targetType === 'file') {
    // 笔记分享（写）=仅内容编辑（OW-INV-2）：读/改内容✓，新建/删除/改名✗
    return op === 'read' || (op === 'edit' && isSelf)
  }
  if (share.targetType === 'dir') {
    // 文件夹分享（写）=目录内新建/编辑/删除/改名（OW-INV-2）：目录本体只读，操作限目录内条目
    if (op === 'read') return true
    return !isSelf // create/edit/delete/rename 恰限目录内条目（本体不可改删名）
  }
  return false
}

// ── 创建（OW-INV-1：逐条显式生成、默认不对外）──────────────────────────────
/**
 * 显式生成一条分享。返回 {share: 管理面形, password: 自动生成明文（恰一次，否则 null）}。
 * 拒绝可解释（管理面）：bad_request / not_found / sensitive_name / password_required / share_disabled。
 */
export async function createShare(root, params, options = {}) {
  const p = params ?? {}
  const config = options.config
  if (config?.share?.enabled === false) {
    throw fail('share_disabled', '分享已停用（share.enabled=false——默认不对外，fail-closed）')
  }
  const role = p.role
  if (!ROLES.includes(role)) throw fail('bad_request', `role 非法（${ROLES.join('/')}）`)
  // target 过 realpath 围栏（T12 终态；与 vault-ops resolveInRoot 单一来源复核）
  const target = p.target
  if (typeof target !== 'string' || target === '') throw fail('bad_request', 'target 参数缺失')
  if (target.includes('\0') || target.includes('\\')) throw fail('bad_request', 'target 含非法字符')
  if (path.isAbsolute(target) || /^[a-zA-Z]:/.test(target)) throw fail('bad_request', 'target 必须是 vault 内相对路径')
  if (target.split('/').some((seg) => seg.trim() === '..')) throw fail('bad_request', 'target 拒绝穿越')
  // C-1（T8 fix r1）：vault 根不可作分享目标——分享必须是具体的文件/目录；根分享会让 guest
  // 触达 .ob-share（分享存储自身）/.trash（恢复材料）= 自指围栏缺口。
  // fix r2：穿越/根族判定同过 CIFS/SMB 别名归一（trim 后再剔 '.'）——'. '/' . '/' . .'≡根、别名形同拒
  const targetSegs = target.split('/').filter((seg) => normalizeSegAlias(seg) !== '')
  if (targetSegs.length === 0) throw fail('bad_request', 'target 拒绝 vault 根（分享必须是具体的文件或目录）')
  const abs = resolveInRoot(root, target) // 围栏单一来源
  if (targetSegs.some((seg) => isInternalSegment(seg))) {
    throw fail('bad_request', '内部目录（.trash/.ob-share）不可分享')
  }
  // 敏感文件名永禁（OW-INV-1）：任意路径段命中即拒（拒=可解释，先于存在性探测）
  if (isSensitivePath(target)) throw fail('sensitive_name', `敏感文件名永不可分享（OW-INV-1）：${target}`)
  // 目标存在性与类型（lstat 门：symlink 不解引用）
  let st
  try {
    st = fs.lstatSync(abs)
  } catch (err) {
    if (err.code === 'ENOENT') throw fail('not_found', `不存在：${target}`)
    throw fail('bad_request', `目标不可读：${target}`)
  }
  if (st.isSymbolicLink()) throw fail('bad_request', '分享目标必须是真实文件或目录（symlink 拒，不解引用）')
  const targetType = st.isDirectory() ? 'dir' : st.isFile() ? 'file' : null
  if (targetType === null) throw fail('bad_request', '分享目标必须是真实文件或目录')
  // 密码（OW-INV-1：写 role 无密码=拒+可解释；autoPassword=设置时自动生成、可改）
  const pw = resolvePasswordSpec(p, { required: role === 'write' })
  // oneShot / 到期
  if (p.oneShot !== undefined && typeof p.oneShot !== 'boolean') throw fail('bad_request', 'oneShot 非法')
  if (p.expiresAt !== undefined && p.ttlDays !== undefined) throw fail('bad_request', 'expiresAt 与 ttlDays 只能给一')
  const createdAt = Date.now()
  let expiresAt
  if (p.expiresAt !== undefined) {
    expiresAt = normalizeExpiry(p.expiresAt)
  } else {
    let days = p.ttlDays !== undefined ? p.ttlDays : config?.share?.defaultTtlDays
    if (days !== undefined && (!Number.isFinite(days) || days <= 0)) throw fail('bad_request', 'ttlDays 非法（正数）')
    if (!Number.isFinite(days) || days <= 0) days = DEFAULT_TTL_DAYS
    expiresAt = createdAt + days * DAY_MS
  }
  // 落盘（原子写+双 fsync；token 撞车（256bit 极罕见）换新令牌重试）
  const dir = await ensureShareDir(root)
  let token = null
  let file = null
  for (let i = 0; i < 4; i++) {
    const candidate = generateToken()
    const candidateFile = path.join(dir, `${candidate}.json`)
    if (!fs.existsSync(candidateFile)) {
      token = candidate
      file = candidateFile
      break
    }
  }
  if (!token) throw fail('io_error', '令牌生成连续撞车（256bit 熵下不可能常态）——请重试')
  const entry = {
    token,
    target,
    targetType,
    role,
    ...(pw.passwordHash ? { passwordHash: pw.passwordHash } : {}),
    expiresAt,
    oneShot: p.oneShot === true,
    revoked: false,
    createdAt,
    accessCount: 0,
    lastAccessAt: null,
    revokedAt: null,
    consumedAt: null,
  }
  await persistEntry(file, entry)
  return { share: toPublic(entry), password: pw.plaintext }
}

// ── 管理面数据面（OW-US-10：列表/查看计数/撤销/密码与权限调整）─────────────
export async function listShares(root) {
  const dir = shareDirAbs(root)
  let names
  try {
    names = await fs.promises.readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return { shares: [], total: 0 } // 未建 store = 零分享（默认不对外）
    throw fail('io_error', `读取分享存储失败：${err.message}`)
  }
  const entries = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const entry = readEntrySync(path.join(dir, name), name.slice(0, -'.json'.length)) // M-1：串号条目不出列表
    if (entry) entries.push(entry)
  }
  entries.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return { shares: entries.map(toPublic), total: entries.length }
}

export async function getShare(root, token) {
  assertToken(token)
  const entry = readEntrySync(shareFileAbs(root, token), token)
  if (!entry) throw fail('not_found', '分享不存在')
  return toPublic(entry)
}

async function mutateShare(root, token, mutate) {
  assertToken(token)
  const file = shareFileAbs(root, token)
  if (!readEntrySync(file, token)) throw fail('not_found', '分享不存在') // 锁前快拒（无 store 目录时不取锁）
  return await withFileLock(file, async () => {
    const entry = readEntrySync(file, token)
    if (!entry) throw fail('not_found', '分享不存在')
    const result = await mutate(entry)
    entry.updatedAt = Date.now()
    await persistEntry(file, entry)
    return result
  }, { waitMs: LOCK_WAIT_MS })
}

/** 调权限：升 write 必须已有密码或同调给密码（OW-INV-1）；降 read 保留密码
 *  T13 载荷合流：密码三态同调承载（password=<口令>=改密 / autoPassword=true=重新生成 /
 *  password=null=清除，仅非写角色）——管理 UI 密码调整全走本调用；T13 concern④ 收口（T14）：
 *  独立改密端点与模型函数已整体下线（未发版零外部调用方），本调用=密码调整单一来源，
 *  单锁内 RMW 原子（不做「先调权再改密」两段式=免中窗状态分裂）；写+清=显式拒不冒充。 */
export async function updateShareRole(root, token, role, options = {}) {
  if (!ROLES.includes(role)) throw fail('bad_request', `role 非法（${ROLES.join('/')}）`)
  return await mutateShare(root, token, async (entry) => {
    const clearing = options.password === null && options.autoPassword !== true
    if (role === 'write' && clearing) {
      throw fail('password_required', '写权限必须保留访问密码（OW-INV-1），不可清除')
    }
    if (role === 'write' && typeof entry.passwordHash !== 'string') {
      const given = options.password !== undefined && options.password !== null
      if (!given && options.autoPassword !== true) {
        throw fail('password_required', '升写权限必须先设访问密码（OW-INV-1）：传 password=<口令> 或 autoPassword=true 自动生成')
      }
    }
    const pw = resolvePasswordSpec(options, { required: false })
    if (pw.passwordHash) entry.passwordHash = pw.passwordHash
    else if (clearing) delete entry.passwordHash
    entry.role = role
    return { share: toPublic(entry), password: pw.plaintext }
  })
}

/** 撤销（幂等）：revoked=true 即时失效（OW-INV-2b） */
export async function revokeShare(root, token) {
  return await mutateShare(root, token, async (entry) => {
    if (entry.revoked !== true) {
      entry.revoked = true
      entry.revokedAt = Date.now()
    }
    return { share: toPublic(entry) }
  })
}

/** 调到期：number(ms)/ISO/null（=永不过期） */
export async function updateShareExpiry(root, token, expiresAt) {
  const normalized = normalizeExpiry(expiresAt)
  return await mutateShare(root, token, async (entry) => {
    entry.expiresAt = normalized
    return { share: toPublic(entry) }
  })
}

// ── guest 校验（OW-INV-2b：同形 404 + 一次性 + 限流）───────────────────────
/**
 * 访客令牌校验。成功 {ok:true, share}（无 passwordHash）；一切失败 = 同形 404（accessDenied）；
 * 限流 = 统一 429（rateLimited，判在查表前）。内部异常 fail-closed 落同形 404。
 * 一调用恰一次 scrypt：真校验或 burnScrypt——失败路径耗时同量级（时序侧信道封死）。
 */
export async function checkAccess(root, input, options = {}) {
  const { token, password, ip } = input ?? {}
  const { config, limiter } = options
  const now = options.now ?? Date.now()
  // IP 口径契约（I-2 / T8 fix r1，T9 依此）：ip=socket.remoteAddress only——绝不默认信任
  // X-Forwarded-For（客户端可伪造）；仅当显式配置可信代理时才解析 XFF 并取最右可信跳。
  let didWork = false
  const denied = () => accessDenied()
  const deniedQuiet = () => { // 尚未付 scrypt 代价的失败路径：补 dummy
    if (!didWork) burnScrypt()
    return accessDenied()
  }
  try {
    // 限流判在查表前（I-2，T8 fix r1：整块在 fail-closed 信封内——limiter.check 异常落同形 404，绝不外抛）：
    // 响应只取决于 IP，token 有效性不得影响（不泄露存在性）
    if (limiter) {
      // 无法归属 IP（调用方没给 ip）→ fail-closed 限流（不发无记名预算；429 统一形）
      if (typeof ip !== 'string' || ip === '') return rateLimited()
      const verdict = limiter.check(ip, now)
      if (!verdict.allowed) return rateLimited()
    }
    if (config?.share?.enabled === false) return deniedQuiet()
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return deniedQuiet()
    const file = shareFileAbs(root, token)
    if (!readEntrySync(file, token)) return deniedQuiet()
    return await withFileLock(file, async () => {
      const entry = readEntrySync(file, token)
      if (!entry) return deniedQuiet()
      // I-1（T8 fix r1）fail-closed 复断言：盘上 write 无密码 = OW-INV-1 不变量被破坏
      // （坏存储/被篡改条目）——同形 404，绝不免密放行
      if (entry.role === 'write' && typeof entry.passwordHash !== 'string') return deniedQuiet()
      if (typeof entry.passwordHash === 'string') {
        didWork = true // 真 scrypt 校验恰一次
        if (!verifyPassword(typeof password === 'string' ? password : '', entry.passwordHash)) return denied()
      }
      const expired = entry.expiresAt != null && now >= entry.expiresAt
      const gone = entry.revoked === true || entry.consumedAt != null
      if (expired || gone) return didWork ? denied() : deniedQuiet()
      // 成功：计数 + 一次性消耗（锁内同次落盘——10 并发恰 1 成功；落盘失败 fail-closed）
      entry.accessCount = (entry.accessCount ?? 0) + 1
      entry.lastAccessAt = now
      if (entry.oneShot === true) entry.consumedAt = now
      await persistEntry(file, entry)
      return { ok: true, share: toPublic(entry) }
    }, { waitMs: LOCK_WAIT_MS })
  } catch {
    // guest 面 fail-closed：任何内部异常与不存在同形（可解释错误只走管理面）
    return deniedQuiet()
  }
}
