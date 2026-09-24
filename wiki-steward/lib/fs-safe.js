// fs-safe — 写安全共享基元（Task 8；冲突扫描裁定：T11 kb_mark / T12 CRUD 消费，勿重复实现）
// 职责边界：只做文件系统安全原语，不认 wiki 语义（不读 frontmatter/不算 sha256 行/不判 readOnly）——
// 业务语义归 mark.js/crud.js。零第三方依赖（node:fs / node:path / node:crypto），零构建纯 ESM。
// 基元与教训来源：
//   writeAtomic    — T2/T6 教训全集：`fs.open(tmp,'wx')` 独占创建 + 写后**文件 fsync** + rename 原子换新 +
//                    **目录 fsync**（rename 提交后尽力而为）+ 失败清残（只清本调用创建的临时文件）。
//                    临时名 = target.<pid>.<seq>.<rand>.tmp：同进程 seq 防自撞、pid+rand 防陈旧 pid 残留撞车。
//   withFileLock   — 锁目录原语（mkdir 原子性）：**禁以 'w' 模式打开目标文件**（'w' 截断教训——锁机制
//                    绝不碰数据文件，'a' 模式都不需要）；也不走 flock fd（LRN-034：fd 被子进程继承后
//                    永久持锁）。等待 waitMs 超时 → ELOCKTIMEOUT 上抛，临界区绝不执行。
//   realpathGuard   — kb-context tools.js 同款围栏四步：形式拒 → realpath 归一（root 自身 symlink 也归一）
//                    → root 归属判（path.relative 形防前缀拼接坑）→ dangling 外指逐段 lstat 判逃逸意图
//                    （R17/INV-7：网络盘 symlink 逃逸必须拒；链式多跳同样拒——fallback 对每跳归一目标
//                    自身再 lstat 解到底，T8 fix round1 Important #1）。返回软结果 {ok,…}，永不抛。
//   journalSave/Rollback — 改前快照/逆放最小原语（R19 dry-run 快照可逆、T12 journal 多文件事务由调用方
//                    逐文件组合）：快照记 content+sha256+mode（hr98w 对账面），逆放经 writeAtomic 原子还原、
//                    快照时不存在 → 逆放即删除（幂等）。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 原子写（T2/T6 教训全集）：wx 独占临时文件 → 写 → 文件 fsync → close → rename → 目录 fsync → 失败清残。
 * 失败语义：rename 之前任何一步失败 → 临时文件清残、目标保持原状、错误上抛；rename 之后目录 fsync 为
 * **post-commit 尽力而为**（rename 已提交——此刻报错会让调用方误判写失败而重试，故吞掉留注释，非静默丢数据）。
 * fsync 可测面说明：文件 fsync/rename 序在进程内无观察面（内核语义），由代码评审锚定；行为可测面 =
 * 独占创建、整文件替换、并发不撕裂、失败清残、mode 生效（test/fs-safe.test.mjs 钉住）。
 * @param {string} target 目标文件路径（父目录必须存在，不自动建）
 * @param {string|Buffer|Uint8Array} data 内容（其他类型 → TypeError，零副作用先拒）
 * @param {{mode?: number}} [opts] 新文件权限位（默认 0o644；经 umask 生效）
 * @returns {Promise<{path: string, bytes: number}>}
 */
export async function writeAtomic(target, data, { mode = 0o644 } = {}) {
  if (typeof target !== 'string' || target.length === 0 || target.includes('\0')) {
    throw new TypeError('writeAtomic: target 必须是非空无 NUL 字符串')
  }
  if (!(typeof data === 'string' || Buffer.isBuffer(data) || ArrayBuffer.isView(data))) {
    throw new TypeError('writeAtomic: data 必须是 string/Buffer/TypedArray')
  }
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  // 同进程 seq 防自撞；pid+rand 防跨进程与陈旧 pid 残留（wx 独占兜底，双重防）
  const tmp = `${target}.${process.pid}.${++WRITE_SEQ}.${RANDOM}.tmp`
  let created = false
  try {
    const fh = await fs.promises.open(tmp, 'wx', mode) // 独占创建：已存在即拒，绝不覆盖别人的临时文件
    created = true
    try {
      await fh.writeFile(buf)
      await fh.sync() // 文件 fsync：数据落盘先于 rename（崩溃后目标要么旧要么新，绝不半截）
    } finally {
      await fh.close()
    }
    await fs.promises.rename(tmp, target) // 同目录 rename 原子换新
  } catch (e) {
    if (created) await fs.promises.rm(tmp, { force: true }).catch(() => {}) // 失败清残；保留原始错误
    throw e
  }
  // 目录 fsync：rename 元数据尽力落盘（post-commit，失败不改判成功语义）
  try {
    const dh = await fs.promises.open(path.dirname(target), 'r')
    try { await dh.sync() } finally { await dh.close() }
  } catch { /* post-commit best-effort：rename 已可见，fsync 失败无补救意义 */ }
  return { path: target, bytes: buf.length }
}

// 临时名组件（模块级：WRITE_SEQ 同进程单调、RANDOM 每进程随机）
let WRITE_SEQ = 0
const RANDOM = (Math.random() * 0xffffffff).toString(16).padStart(8, '0')

/**
 * 锁目录临界区：`<target>.lock` mkdir 原子获取；waitMs 内轮询，超时 → code ELOCKTIMEOUT 且 fn 绝不执行。
 * ⚠️ 'a'/`w` 教训：本函数**完全不打开目标文件**（数据文件一个字节都不碰——连 'a' 都不用，'w' 截断更不可能）；
 *    锁状态只活在锁目录的在场性上，fn 返回/抛错都经 finally 释放。
 * 已知限（最小原语，消费方自理）：无 stale 自愈——持锁进程崩溃会留下锁目录，由调用方按 mtime 清理或人工 rm；
 * 父目录必须存在（ENOENT 原样上抛，不自动建目录）。
 * @param {string} target 锁命名对象（通常= 目标文件路径；本体不被触碰）
 * @param {() => Promise<T>|T} fn 临界区
 * @param {{waitMs?: number, pollMs?: number}} [opts]
 * @returns {Promise<T>} fn 的返回值
 * @template T
 */
export async function withFileLock(target, fn, { waitMs = 5000, pollMs = 20 } = {}) {
  if (typeof target !== 'string' || target.length === 0) {
    throw new TypeError('withFileLock: target 必须是非空字符串')
  }
  if (typeof fn !== 'function') throw new TypeError('withFileLock: fn 必须是函数')
  const lockDir = `${target}.lock`
  const start = Date.now()
  for (;;) {
    try {
      await fs.promises.mkdir(lockDir) // 非递归 mkdir：原子——已存在（目录或文件）即 EEXIST
      break
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e // ENOENT（父目录缺失）/EPERM 等原样上抛
      if (Date.now() - start >= waitMs) {
        const err = new Error(`withFileLock: 等待 ${waitMs}ms 未获得锁 ${lockDir}`)
        err.code = 'ELOCKTIMEOUT'
        throw err
      }
      await sleep(pollMs)
    }
  }
  try {
    return await fn()
  } finally {
    await fs.promises.rm(lockDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** 路径安全形（kb-context tools.js 同款）：非空串、无 NUL/反斜杠、非绝对（POSIX/盘符）、每段非空非 '.'/'..' */
function isSafeRelPath(p) {
  if (typeof p !== 'string' || p === '') return false
  if (p.includes('\0') || p.includes('\\')) return false
  if (p.startsWith('/')) return false
  if (/^[A-Za-z]:/.test(p)) return false
  return p.split('/').every((s) => s !== '' && s !== '.' && s !== '..')
}

/** root 归属判：real 是否落在 rootReal 之内（含 root 自身）——path.relative 形防前缀拼接坑 */
function isInsideRoot(rootReal, real) {
  const rel = path.relative(rootReal, real)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/**
 * dangling 外指面检查（目标缺失时启用；修复链式逃逸——审查 Important #1）：逐段行走，每段遇 symlink 就地
 * 循环 readlink 归一，并对**归一目标自身**再 lstat 直至解到真实节点或越 root——绝不能在归一后直接跳到
 * 下一段（修复前 `cur = resolved` 跳过对归一目标的 lstat，两跳链中间跳 b 指向 root 外时漏判，随后对
 * 后代的 lstat 中间解引用后 ENOENT 被当"真缺失"放行 → 围栏写穿）。判据：
 *   任一跳归一后越 root → 逃逸（dangling 外指也算逃逸意图）；
 *   链内自环/互指（归一路径重复）或 lstat ELOOP → 与主判 ELOOP 同语义判逃逸；
 *   lstat ENOENT/ENOTDIR 仅在链已全部解至真实节点后出现 → 真缺失、无外指面（放行 exists:false）。
 * （修复前此处注释声称"链式 dangling 由 realpath 主判兜住"不实——外目录存在、仅末段缺失时 realpath
 *   同样 ENOENT 走本 fallback。）
 */
function symlinksEscape(rootReal, target) {
  let cur = rootReal
  for (const seg of path.relative(rootReal, target).split(path.sep)) {
    if (seg === '') continue
    cur = path.join(cur, seg)
    const seen = new Set() // 本段链内已归一路径（自环/互指判据）
    for (;;) {
      let st
      try { st = fs.lstatSync(cur) } catch (e) {
        if (e?.code === 'ELOOP') return true // 链内循环（与主判 ELOOP 同语义）
        return false // 链已解尽后的真缺失：无外指面
      }
      if (!st.isSymbolicLink()) break // 本段解至真实节点 → 走下一段
      let link
      try { link = fs.readlinkSync(cur) } catch { return true } // 读不出链接：按不安全形拒
      const resolved = path.resolve(path.dirname(cur), link)
      if (!isInsideRoot(rootReal, resolved)) return true // 外指（dangling 也算逃逸意图）
      if (seen.has(resolved)) return true // 自环/互指 → 与主判 ELOOP 同语义
      seen.add(resolved)
      cur = resolved // 归一后 **对归一目标自身继续 lstat**（链式下一跳在此暴露——不得跳段）
    }
  }
  return false
}

/**
 * realpath 围栏（kb-context tools.js 同款四步；R17/INV-7）：形式拒 → realpath 归一 → root 归属 → dangling 外指判逃逸。
 * 写侧语义（T11/T12 消费）：路径安全但尚不存在 → `{ok:true, exists:false}`（可建）；存在但归一后越 root / 外指 → 拒。
 * 永不抛：root 解析失败（缺失/类型错）→ 'root-unresolvable'；其余 realpath 意外错误 → 'unresolvable'。
 * @param {string} root 围栏根（自身可为 symlink，归一后判）
 * @param {string} rel 根内相对路径
 * @returns {{ok: true, real: string, exists: boolean} | {ok: false, reason: 'unsafe-form'|'root-unresolvable'|'outside-root'|'symlink-escape'|'unresolvable'}}
 */
export function realpathGuard(root, rel) {
  if (!isSafeRelPath(rel)) return { ok: false, reason: 'unsafe-form' }
  let rootReal
  try { rootReal = fs.realpathSync(root) } catch { return { ok: false, reason: 'root-unresolvable' } }
  const target = path.resolve(rootReal, rel) // rel 已过形式拒：无 '..' 段，lexical 必在 root 下
  let real
  try {
    real = fs.realpathSync(target)
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') {
      // 写侧目标可缺失：先验逃逸面（外指 symlink 拒），真缺失放行（exists:false）
      if (symlinksEscape(rootReal, target)) return { ok: false, reason: 'symlink-escape' }
      return { ok: true, real: target, exists: false }
    }
    if (e?.code === 'ELOOP') return { ok: false, reason: 'symlink-escape' }
    return { ok: false, reason: 'unresolvable' }
  }
  if (!isInsideRoot(rootReal, real)) return { ok: false, reason: 'outside-root' }
  return { ok: true, real, exists: true }
}

/**
 * 改前快照（R19/T12 journal 事务的单文件原语）：记 content + sha256 + mode。
 * 文件不存在 → `{existed:false, content:null, sha256:null, mode:null}`（逆放即删除的凭据）。
 * @param {string} file 目标文件
 * @returns {Promise<{file: string, existed: boolean, content: Buffer|null, sha256: string|null, mode: number|null}>}
 */
export async function journalSave(file) {
  if (typeof file !== 'string' || file.length === 0) {
    throw new TypeError('journalSave: file 必须是非空字符串')
  }
  try {
    const content = await fs.promises.readFile(file)
    const st = await fs.promises.stat(file)
    return { file, existed: true, content, sha256: createHash('sha256').update(content).digest('hex'), mode: st.mode & 0o777 }
  } catch (e) {
    if (e?.code === 'ENOENT') return { file, existed: false, content: null, sha256: null, mode: null }
    throw e
  }
}

/**
 * 逆放（journalSave 的回滚半边）：existed → writeAtomic 原子还原字节+权限；!existed → 删除事后创建的文件。
 * 幂等：force 忽略 ENOENT，重复 rollback 无害。T12 多文件事务 = 调用方按快照逆序逐文件调用。
 * @param {{file: string, existed: boolean, content: Buffer|null, sha256: string|null, mode: number|null}} snap
 */
export async function journalRollback(snap) {
  if (!snap || typeof snap !== 'object' || typeof snap.file !== 'string') {
    throw new TypeError('journalRollback: 必须是 journalSave 产出的快照对象')
  }
  if (snap.existed) {
    await writeAtomic(snap.file, snap.content, { mode: snap.mode ?? 0o644 })
    return
  }
  await fs.promises.rm(snap.file, { force: true })
}
