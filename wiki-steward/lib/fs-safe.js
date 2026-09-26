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
//                    逐文件组合）：快照记 content+sha256+mode（hr98w 对账面），逆放经 writeAtomic 原子还原
//                    + 写后 fchmod 精确还原 mode（不受 umask 截损，遗留清障①），
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

// lease 锁 owner token（每获取唯一：pid+seq+进程随机量）
let LOCK_SEQ = 0

/**
 * lease 锁（T12 锁 stale 自愈；withFileLock 的带租约增强版——withFileLock 语义与消费方不动）：
 * `<target>.lock` 目录内记 `lease.json` {owner, at}。
 *   获取：mkdir 原子；EEXIST → 读 lease 判陈旧（now-at > leaseMs）→ **超时接管**（rm 陈旧锁目录后重试
 *   获取；并发接管者竞争 mkdir，输者继续等待循环）；接管经 fn 的 meta `{tookOver, staleAgeMs}` +
 *   onTakeover 回调留痕（绝不静默拆锁）。
 *   保守面：无 lease.json / 坏 JSON 的锁目录（他原语产物、写入中途）**不判 stale 不接管**，等待超时；
 *   等待 waitMs 超时 → ELOCKTIMEOUT 上抛，临界区绝不执行。
 *   释放（遗留清障② 释放原子化）：**成功 `unlink(lease.json)` 作为原子放弃**（替代 check-then-act
 *   read→rm：摘牌是单文件原子操作，绝不 read-比对-rm 递归强拆锁目录树）；随后清目录 = **非递归 rmdir
 *   且仅当锁目录仍是本临界区 mkdir 出的实例**（dev+inode 同源实例门）——被接管后锁目录是新实例
 *   （实例门跳过）或目录非空（rmdir ENOTEMPTY 安全失败），「绝不拆新持有者的锁」由结构保证而非
 *   check-then-act 断言。残局自清：lease 缺失（ENOENT）不挡实例门清目录（绝不留残锁）。
 *   已知限（显式，测试锁定）：lease 取自获取时刻、临界区内不续期——临界区必须短于 leaseMs
 *   （crud 事务均秒级；超长临界区由调用方分段或调大 leaseMs）；接管竞态窗内旧持有者的摘牌
 *   可能摘掉新持有者的 lease 条目（其锁目录与临界区不受影响，其自行释放仍经实例门清理）。
 * @param {string} target 锁命名对象（本体不被触碰）
 * @param {(meta: {tookOver: boolean, staleAgeMs: number|null}) => Promise<T>|T} fn 临界区
 * @param {{waitMs?: number, pollMs?: number, leaseMs?: number, onTakeover?: (meta) => void}} [opts]
 * @returns {Promise<T>} fn 的返回值
 * @template T
 */
export async function withLeaseLock(target, fn, { waitMs = 5000, pollMs = 20, leaseMs = 60_000, onTakeover } = {}) {
  if (typeof target !== 'string' || target.length === 0) {
    throw new TypeError('withLeaseLock: target 必须是非空字符串')
  }
  if (typeof fn !== 'function') throw new TypeError('withLeaseLock: fn 必须是函数')
  const lockDir = `${target}.lock`
  const leaseFile = path.join(lockDir, 'lease.json')
  const owner = `${process.pid}.${++LOCK_SEQ}.${RANDOM}`
  const start = Date.now()
  let tookOver = false
  let staleAgeMs = null
  let dirDev = null
  let dirIno = null // 锁目录实例身份（dev+inode）：释放侧「绝不拆新持有者」的结构门
  for (;;) {
    try {
      await fs.promises.mkdir(lockDir) // 非递归 mkdir 原子获取
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e // ENOENT（父目录缺失）/EPERM 等原样上抛
      // 陈旧判据：lease 时间戳超龄（缺 lease.json/坏 JSON = 不判 stale，保守不接管）
      let stale = false
      try {
        const lease = JSON.parse(await fs.promises.readFile(leaseFile, 'utf8'))
        const age = Date.now() - Number(lease?.at)
        if (lease?.owner !== owner && Number.isFinite(age) && age > leaseMs) {
          stale = true
          staleAgeMs = age
        }
      } catch { stale = false }
      if (stale) {
        await fs.promises.rm(lockDir, { recursive: true, force: true }).catch(() => {})
        tookOver = true
        try { onTakeover?.({ tookOver: true, staleAgeMs }) } catch { /* 留痕回调异常不阻塞获取 */ }
        continue // 重试获取（可能输给并发接管者 → 回到等待循环）
      }
      if (Date.now() - start >= waitMs) {
        const err = new Error(`withLeaseLock: 等待 ${waitMs}ms 未获得锁 ${lockDir}`)
        err.code = 'ELOCKTIMEOUT'
        throw err
      }
      await sleep(pollMs)
      continue
    }
    // 已获锁：记锁目录实例身份（此刻的 dev+inode = 我 mkdir 出的那一个实例），再写 lease 凭据
    // （任一步失败清残后上抛——绝不留无主锁）
    try {
      const st = await fs.promises.stat(lockDir)
      dirDev = st.dev
      dirIno = st.ino
      await fs.promises.writeFile(leaseFile, JSON.stringify({ owner, at: Date.now() }))
    } catch (e) {
      await fs.promises.rm(lockDir, { recursive: true, force: true }).catch(() => {})
      throw e
    }
    break
  }
  try {
    return await fn({ tookOver, staleAgeMs })
  } finally {
    // 释放 = 成功 unlink(lease.json) 作为原子放弃（替代 check-then-act read→rm）：
    // 摘牌单文件原子（unlink 恰一胜者），绝不再 read-比对后 rm -rf 递归强拆锁目录树
    try {
      await fs.promises.unlink(leaseFile)
    } catch { /* ENOENT=已被接管摘牌/损坏：照样走实例门清目录（残锁自清） */ }
    // 清目录 = 非递归 rmdir 且仅当锁目录仍是本临界区 mkdir 出的实例（dev+inode 同源）——
    // 新持有者实例绝不被拆（实例门跳过）；目录非空（他人之物在内）rmdir 安全失败
    try {
      const st = await fs.promises.lstat(lockDir)
      if (st.isDirectory() && dirIno !== null && st.dev === dirDev && st.ino === dirIno) {
        await fs.promises.rmdir(lockDir)
      }
    } catch { /* 目录不在/非空/lstat 失败：保守不动 */ }
  }
}

/** 路径安全形（kb-context tools.js 同款）：非空串、无 NUL/反斜杠、非绝对（POSIX/盘符）、每段非空非 '.'/'..' */
export function isSafeRelPath(p) {
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
 * dangling 外指面检查（目标缺失时启用；链式逃逸审查 Important #1 + T12 多段中间链加固）：
 * **全链逐段解引用至真实节点或越 root 即拒**——行走不变量：cur 恒为「已完全解引用的真实前缀」，
 * 每次 lstat 只解一个新段（绝不整路径 lstat：多段路径的中间段会被内核静默解引用，
 * 修复前 `cur = resolved` 跳回整路径 lstat，`a→sub/b` + `sub→root 外` + 末段缺失的拓扑
 * 中 ENOENT 被误判「真缺失」放行 → 围栏写穿）。symlink 归一目标的每一段（中间段也可能是
 * symlink）前插回工作队列重走逐段解引用。判据：
 *   任一跳归一后越 root → 逃逸（dangling 外指也算逃逸意图）；
 *   链内自环/互指（归一路径重复）或 lstat ELOOP → 与主判 ELOOP 同语义判逃逸；
 *   lstat ENOENT/ENOTDIR（真实前缀下缺段）→ 真缺失、无外指面（放行 exists:false；
 *   其下段不可能被触达——缺失中间段之后的路径不可穿越，写侧亦然）。
 */
function symlinksEscape(rootReal, target) {
  // 队列项 {seg, chain}：chain=解引用链 id（symlink 归一目标继承发起链，原始段开新链）
  // ——自环/互指判据只在同一解引用链内比较（跨段共享会把 root 内合法自指结构误判成环）。
  let nextChain = 0
  const queue = path.relative(rootReal, target).split(path.sep)
    .filter((s) => s !== '').map((seg) => ({ seg, chain: ++nextChain }))
  const seenByChain = new Map() // chain → Set<已归一 symlink 目标>
  let cur = rootReal // 真实前缀不变量：起点为 root
  while (queue.length > 0) {
    const { seg, chain } = queue.shift()
    cur = path.join(cur, seg) // 在真实前缀上拼一个新段：lstat 只解这一个段
    let st
    try {
      st = fs.lstatSync(cur)
    } catch (e) {
      if (e?.code === 'ELOOP') return true // 链内循环（与主判 ELOOP 同语义）
      return false // 真实前缀下的真缺失（ENOENT/ENOTDIR）：无外指面
    }
    if (!st.isSymbolicLink()) continue // 本段解至真实节点（cur 仍满足不变量）→ 下一段
    let link
    try { link = fs.readlinkSync(cur) } catch { return true } // 读不出链接：按不安全形拒
    const resolved = path.resolve(path.dirname(cur), link)
    if (!isInsideRoot(rootReal, resolved)) return true // 外指（dangling 也算逃逸意图）
    const seen = seenByChain.get(chain) ?? new Set()
    if (seen.has(resolved)) return true // 同链自环/互指 → 与主判 ELOOP 同语义
    seen.add(resolved)
    seenByChain.set(chain, seen)
    // 归一目标**不得整路径跳入**：相对 root 的每一段前插回队列（中间段可能又是 symlink，
    // 必须逐段解引用）；前插保证真实前缀在正确基点上继续累加
    queue.unshift(...path.relative(rootReal, resolved).split(path.sep)
      .filter((s) => s !== '').map((s) => ({ seg: s, chain })))
    cur = rootReal // 回到真实根重建前缀不变量（展开段先于其余段处理，前缀累加正确）
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
 * 逆放（journalSave 的回滚半边）：existed → writeAtomic 原子还原字节 + 写后 fchmod 精确还原
 * 权限位（遗留清障①：writeAtomic 的 open mode 过 umask 截损——0077 下 0o640→0o600；fchmod
 * 不受 umask 影响，快照记录的 mode 逐位还原，双 umask 口径同判）；!existed → 删除事后创建的文件。
 * 幂等：force 忽略 ENOENT，重复 rollback 无害。T12 多文件事务 = 调用方按快照逆序逐文件调用。
 * @param {{file: string, existed: boolean, content: Buffer|null, sha256: string|null, mode: number|null}} snap
 */
export async function journalRollback(snap) {
  if (!snap || typeof snap !== 'object' || typeof snap.file !== 'string') {
    throw new TypeError('journalRollback: 必须是 journalSave 产出的快照对象')
  }
  if (snap.existed) {
    await writeAtomic(snap.file, snap.content, { mode: snap.mode ?? 0o644 })
    if (snap.mode != null) {
      // fchmod 精确还原（open 后 fchmod，T8 deferred「journal 权限 umask 截损」收口）：
      // rename 落盘后的目标 mode 是「snap.mode & ~umask」，这里逐位补回快照记录值
      const fh = await fs.promises.open(snap.file, 'r')
      try {
        await fh.chmod(snap.mode)
      } finally {
        await fh.close()
      }
    }
    return
  }
  await fs.promises.rm(snap.file, { force: true })
}
