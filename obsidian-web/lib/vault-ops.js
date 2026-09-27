// vault-ops — vault 读写/改名/移动/删除/导出（T2 = 读侧；T4 = 保存写侧；T5-T7/T12 叠加改名/删除/导出）
// 契约（delta-specs/obsidian-web.md §2）：
//   - 保存 saveNote(root, path, content, {expectedMtime|etag}) → {ok,...,diffUndo} | {conflict,diffUndo}（OW-INV-3 乐观锁）
//   - 改名/移动 renameNote(root, from, to, {overwrite?})（契约名 rename，delta-specs §2）→ journal
//     多文件事务 {ok, rolledBack, warnings, changed[]}（OW-INV-4；详见文件尾 renameNote 段）
//   - 删除走 .trash 可逆 + 双确认（OW-INV-5）；下载 zip ≤5000 文件/500MB 超限拒（OW-INV-9）
// 写安全（T4 归位）：@deepseek-ai/dsh-atomic-write（writeFileAtomic + withFileLock 单文件 lease，
//   wx 独占+rename+失败清残内建于该包——2026-09-26 裁定写安全套件=该包）+ 提交后 fsync(文件)+fsync(目录)
//   补 ARC-4 崩溃持久化（dsh-atomic-write 明示 fsync out of scope，此处补齐）。
// 乐观锁（OW-INV-3）：无 expectedMtime/etag 不落盘；锁不符 → {conflict, diffUndo} 零写入（三选：覆盖/重载/对比）。
// diff undo：保存前内容快照随结果返回（内存级 undo；持久化 undo 归后续）。
// 路径围栏（OW-INV-7 终态，T12 围栏合流）：相对路径 + 拒 '..'（trim 后判——别名穿越同拒）/绝对
//          路径/盘符/NUL/纯点空格别名段 + realpath 全链逐段解引用拒 symlink 逃逸/遍历/循环——
//          词法围栏雏形（T2-T11）已升级为 realpath 围栏终态（详见 resolveInRoot 段）。
// T2 读侧契约（形状锁定=前端 wire 契约，test/vault-ops.test.mjs 锁形）：
//   listTree(root)            → {root, nodes}    node: {name, path, type, children?}（目录优先字典序）
//   readNote(root, relPath)   → {path, content, mtime, etag, size}   etag=size-mtime（乐观锁前置）
//   scanBacklinks(root, path) → {path, backlinks:[{path, line, text}]}（占位级扫描，T11 索引化后替换）
import fs from 'node:fs'
import path from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { planRewrite, scanMdLinkTargets } from './wikilink-rewrite.js'
import { isTraversalSeg, isAliasOnlySeg } from './path-alias.js'

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

// ── vault 变更事件面（T11 保存即增量的钩子缝 / OW-US-11 保险①）──────────────────
// 写路径成功落盘后发事件（saveNote/createNote/renameNote/deletePath）；冲突/域拒绝/回滚态零事件。
// 事件形（键锁定 test/index-incremental.test.mjs）：
//   {type:'save'|'create', path, content}
//   {type:'rename', from, to, changed}      changed=调用结果 changed 同数组（含 from+to+改写件）
//   {type:'delete', path, trashPath, isDir}
// 监听器抛错不回传写路径（逐监听器隔离 + console.warn 留痕，INV-15 禁静默）；返回退订函数。
const changeListeners = new Set()

export function onVaultChange(listener) {
  if (typeof listener !== 'function') throw fail('bad_request', 'listener 必须是函数')
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

function emitVaultChange(event) {
  for (const listener of changeListeners) {
    try {
      listener(event)
    } catch (err) {
      console.warn(`[obsidian-web] vault-change 监听器抛错（已隔离，写路径不受影响）：${err?.message ?? err}`)
    }
  }
}

function assertRelPath(relPath) {
  if (typeof relPath !== 'string' || relPath === '') throw fail('bad_request', 'path 参数缺失')
  if (relPath.includes('\0')) throw fail('bad_request', 'path 含非法字符')
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) throw fail('bad_request', 'path 必须是 vault 内相对路径')
  // 穿越/别名判定按 / 与 \ 双分隔符分段（Win32/SMB 反斜杠=分隔符，fail-closed 只多拒不放行）：
  // trim 后判 '..'（T8 Ruling 3 交接：'.. '/' ..'≡'..' 同拒，与 share.js normalizeSegAlias 同源口径，
  // 归一单一来源=path-alias.js）；穿越判定先于别名剔除（T8 Ruling 2：`.. ` 归穿越拒，绝不剔成空段
  // 静默丢弃）；纯点空格别名段 fail-closed 拒（无独立身份，不静默改写目标路径）；'.' 与空段=通用 no-op。
  for (const seg of relPath.split(/[/\\]/)) {
    if (isTraversalSeg(seg)) throw fail('bad_request', 'path 拒绝穿越')
    if (isAliasOnlySeg(seg)) throw fail('bad_request', 'path 含别名段（纯点空格段无独立身份）')
  }
}

// ── realpath 路径围栏（OW-INV-7 终态，T12 围栏合流）────────────────────────────────
// 语义：形式拒（含别名穿越）→ root realpath 归一（root 自身 symlink/挂载别名也归一）→ 全链
// 逐段解引用至真实节点，越 root 即拒（T5 alias 拓扑：中间段 in-root 别名解引用放行、链尾
// 外指即拒；kb fs-safe fix r1 同款语义、独立实现——差异表见 task-12-report.md）。
// 消费面契约：返回值仍为词法 abs（export/share 的 lstat 门依赖词法节点身份判 symlink 条目，
// 表面语义零回退）；I/O 前 realpath 复核=每次操作现算零缓存（TOCTOU 口径①）。

function isInsideRoot(rootReal, target) {
  const rel = path.relative(rootReal, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/**
 * dangling 外指面检查（真实路径缺失时启用；T5 alias 拓扑交接）：**全链逐段解引用至真实
 * 节点或越 root 即拒**——行走不变量：cur 恒为「已完全解引用的真实前缀」，每次 lstat 只解
 * 一个新段（绝不整路径 lstat：中间段会被内核静默解引用，`a→sub/b`+`sub→root 外`+末段缺失
 * 拓扑会被 ENOENT 误判「真缺失」放行 → 围栏写穿）。symlink 归一目标的每一段前插回工作队列
 * 重走逐段解引用。判据：任一跳归一后越 root=逃逸（dangling 外指也算逃逸意图）；链内自环/
 * 互指或 ELOOP=逃逸；真实前缀下 ENOENT/ENOTDIR=真缺失放行（其下段不可触达）。
 */
function symlinksEscape(rootReal, target) {
  // 队列项 {seg, chain}：chain=解引用链 id（symlink 归一目标继承发起链，原始段开新链）——
  // 自环/互指判据只在同一链内比较（跨段共享会把 root 内合法自指结构误判成环）。
  let nextChain = 0
  const queue = path.relative(rootReal, target).split(path.sep)
    .filter((s) => s !== '').map((seg) => ({ seg, chain: ++nextChain }))
  const seenByChain = new Map()
  let cur = rootReal
  while (queue.length > 0) {
    const { seg, chain } = queue.shift()
    cur = path.join(cur, seg) // 真实前缀上拼一个新段：lstat 只解这一个段
    let st
    try {
      st = fs.lstatSync(cur)
    } catch (err) {
      if (err?.code === 'ELOOP') return true // 链内循环 → 与主判 ELOOP 同语义判逃逸
      return false // 真实前缀下真缺失（ENOENT/ENOTDIR）：无外指面
    }
    if (!st.isSymbolicLink()) continue // 本段解至真实节点 → 下一段
    let link
    try {
      link = fs.readlinkSync(cur)
    } catch {
      return true // 读不出链接：按不安全形拒
    }
    const resolved = path.resolve(path.dirname(cur), link)
    if (!isInsideRoot(rootReal, resolved)) return true // 外指（dangling 也算逃逸意图）
    const seen = seenByChain.get(chain) ?? new Set()
    if (seen.has(resolved)) return true // 同链自环/互指 → 逃逸
    seen.add(resolved)
    seenByChain.set(chain, seen)
    // 归一目标不得整路径跳入：相对 root 的每一段前插回队列（中间段可能又是 symlink）；
    // 前插保证真实前缀在正确基点上继续累加
    queue.unshift(...path.relative(rootReal, resolved).split(path.sep)
      .filter((s) => s !== '').map((s) => ({ seg: s, chain })))
    cur = rootReal // 回到真实根重建前缀不变量
  }
  return false
}

/**
 * realpath 围栏单一来源（T7 导出面/T10 分享面复用）：形式拒 + 全链解引用 + root 归属判。
 * 缺失目标（写侧可建/读侧缺失）先验逃逸面（外指 symlink 拒），真缺失放行。
 * @returns {string} 词法 abs（消费面 lstat 门依赖词法节点身份；I/O 经内核解引用必落围栏内真实节点）
 */
export function resolveInRoot(root, relPath) {
  assertRelPath(relPath)
  const base = path.resolve(root)
  const abs = path.resolve(base, relPath)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw fail('bad_request', 'path 越出 vaultRoot')
  let rootReal
  try {
    rootReal = fs.realpathSync(base) // root 自身 symlink/挂载别名归一
  } catch {
    throw fail('bad_request', 'vaultRoot 不可解析（缺失/类型错）')
  }
  const target = path.resolve(rootReal, relPath) // relPath 已过形式拒：lexical 必在 rootReal 下
  let real
  try {
    real = fs.realpathSync(target) // 主判：全链解引用至真实节点
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
      if (symlinksEscape(rootReal, target)) throw fail('bad_request', 'path 拒绝 symlink 逃逸')
      return abs // 真缺失：可建（写侧）/可报缺失（读侧）
    }
    if (err?.code === 'ELOOP') throw fail('bad_request', 'path 拒绝 symlink 循环')
    throw fail('bad_request', 'path 不可解析')
  }
  if (!isInsideRoot(rootReal, real)) throw fail('bad_request', 'path 拒绝 symlink 逃逸（真实节点越出 vaultRoot）')
  return abs
}

/**
 * TOCTOU 路径复核缝（操作前/后漂移复核）：abs 当前解析必须仍落 root 内真实节点（缺失面
 * 复验逃逸意图）。漂移/外指/循环 → throw bad_request（可解释拒）。
 */
export function assertRealInRoot(root, abs) {
  const base = path.resolve(root)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw fail('bad_request', 'path 越出 vaultRoot')
  let rootReal
  try {
    rootReal = fs.realpathSync(base)
  } catch {
    throw fail('bad_request', 'vaultRoot 不可解析（缺失/类型错）')
  }
  const target = path.resolve(rootReal, path.relative(base, abs))
  let real
  try {
    real = fs.realpathSync(target)
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
      if (symlinksEscape(rootReal, target)) throw fail('bad_request', 'path 拒绝 symlink 逃逸（漂移复核）')
      return
    }
    if (err?.code === 'ELOOP') throw fail('bad_request', 'path 拒绝 symlink 循环（漂移复核）')
    throw fail('bad_request', 'path 不可解析（漂移复核）')
  }
  if (!isInsideRoot(rootReal, real)) throw fail('bad_request', 'path 拒绝 symlink 逃逸（漂移复核）')
}

/**
 * TOCTOU 打开后复核缝（T9 lstat→open 窄窗收口，读面）：fd 与路径当前真实节点必须同一
 * （dev/ino 比对，BigInt 防大 inode 失精）+ 路径仍在 root 内。换物/外逃漂移 → throw bad_request。
 */
export function assertOpenedRealInRoot(root, abs, fd) {
  assertRealInRoot(root, abs)
  const base = path.resolve(root)
  const rootReal = fs.realpathSync(base)
  const target = path.resolve(rootReal, path.relative(base, abs))
  let real
  try {
    real = fs.realpathSync(target)
  } catch {
    throw fail('bad_request', '打开后复核失败（路径已漂移/缺失）')
  }
  const fdStat = fs.fstatSync(fd, { bigint: true })
  const realStat = fs.statSync(real, { bigint: true })
  if (fdStat.dev !== realStat.dev || fdStat.ino !== realStat.ino) {
    throw fail('bad_request', '打开后复核失败（fd 与路径真实节点失配）')
  }
}

function statOrThrow(abs, relPath) {
  try {
    return fs.statSync(abs)
  } catch (err) {
    if (err.code === 'ENOENT') throw fail('not_found', `不存在：${relPath}`)
    throw err
  }
}

// ── listTree：树列表（目录优先、组内字典序；dot 条目与 symlink 不出树，T12 归位 symlink 围栏）────
function scanDir(abs, rel) {
  let dirents
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') throw fail('not_found', `目录不存在：${rel || '.'}`)
    throw err
  }
  const dirs = []
  const files = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const childRel = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) {
      dirs.push({ name: d.name, path: childRel, type: 'dir', children: scanDir(path.join(abs, d.name), childRel) })
    } else if (d.isFile()) {
      files.push({ name: d.name, path: childRel, type: 'file' })
    }
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return [...dirs.sort(byName), ...files.sort(byName)]
}

export function listTree(root) {
  const absRoot = path.resolve(root)
  return { root: absRoot, nodes: scanDir(absRoot, '') }
}

// ── readNote：读文件（下载/预览/反链共用读面）─────────────────────────────────────────────
// TOCTOU 口径（T12，T9 交接 lstat→open 窄窗收口）：open 前 realpath 复核（resolveInRoot 现算）
// + fd 打开 + 打开后复核（assertOpenedRealInRoot：fstat↔realpath dev/ino 失配即拒）——换物/
// 外逃漂移在读到内容前拦下，内容零外泄。
export function readNote(root, relPath) {
  const abs = resolveInRoot(root, relPath)
  const stat = statOrThrow(abs, relPath)
  if (!stat.isFile()) throw fail('not_found', `不是文件：${relPath}`)
  let fd
  try {
    fd = fs.openSync(abs, fs.constants.O_RDONLY)
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') throw fail('not_found', `不存在：${relPath}`)
    if (err?.code === 'ELOOP') throw fail('bad_request', 'path 拒绝 symlink 循环')
    throw err
  }
  let content
  let mtime
  let size
  try {
    assertOpenedRealInRoot(root, abs, fd) // 打开后复核（漂移即拒，内容零外泄）
    content = fs.readFileSync(fd, 'utf8')
    const fdStat = fs.fstatSync(fd)
    size = Buffer.byteLength(content, 'utf8')
    mtime = fdStat.mtimeMs
  } finally {
    fs.closeSync(fd)
  }
  return { path: relPath, content, mtime, etag: `${size}-${mtime}`, size }
}

// ── saveNote：保存写侧（OW-INV-3/OW-US-4）——withFileLock 单文件 lease + 乐观锁 + diff undo ────
// 锁等待：dsh-atomic-write 默认 2s——CIFS 慢盘 fsync 可超，显式放宽（等锁超时=报错而非冲突，
//         会破坏「冲突三选」语义；等待本身是产效的：后到者拿到锁后重读已提交状态）。
const SAVE_LOCK_WAIT_MS = 10_000
/** ARC-4 崩溃持久化补全：fsync 文件 + fsync 目录（dsh-atomic-write 明示 fsync out of scope） */
function fsyncPath(abs, { dir = false } = {}) {
  let fd
  try {
    fd = fs.openSync(abs, dir ? 'r' : 'r')
    fs.fsyncSync(fd)
  } catch (err) {
    throw fail('io_error', `fsync 失败（${dir ? '目录' : '文件'}：${abs}）：${err.message}`)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

function snapshot(content, stat) {
  const size = Buffer.byteLength(content, 'utf8')
  return { content, mtime: stat.mtimeMs, etag: `${size}-${stat.mtimeMs}`, size }
}

/**
 * 保存笔记（OW-INV-3：无乐观锁不落盘；冲突必须显式三选）。
 * @param options {{expectedMtime?: number, etag?: string}} 乐观锁（至少给一；mtime 优先核 etag）
 * @returns {Promise<
 *   | {ok: true, path, mtime, etag, size, diffUndo: {before: snap, after: snap}}
 *   | {conflict: true, path, diffUndo: {before: snap, incoming: {content}}}
 * >}
 *   diffUndo.before = 保存前内容快照（成功=一键还原源；冲突=盘上现内容，重载/对比基线）
 *   diffUndo.incoming = 冲突时本次尝试写入内容（对比面）
 * 边界：仅覆盖已存在文件（新建=createNote）；realpath/symlink 围栏已归位（T12 终态）。
 */
export async function saveNote(root, relPath, content, options = {}) {
  const opts = options ?? {}
  const { expectedMtime, etag } = opts
  if (expectedMtime === undefined && etag === undefined) {
    throw fail('bad_request', '缺乐观锁参数（expectedMtime|etag）——无乐观锁不落盘')
  }
  if (expectedMtime !== undefined && !Number.isFinite(Number(expectedMtime))) {
    throw fail('bad_request', 'expectedMtime 非法（必须是有限数值）')
  }
  if (etag !== undefined && (typeof etag !== 'string' || etag === '')) {
    throw fail('bad_request', 'etag 非法（必须是非空字符串）')
  }
  if (typeof content !== 'string') throw fail('bad_request', 'content 必须是字符串')
  const abs = resolveInRoot(root, relPath) // realpath 围栏（T12 终态）
  return withFileLock(abs, async () => {
    resolveInRoot(root, relPath) // TOCTOU 口径②：锁内 realpath 复核（入口→写之间换入即拒）
    const stat = statOrThrow(abs, relPath)
    if (!stat.isFile()) throw fail('not_found', `不是文件：${relPath}`)
    const beforeContent = fs.readFileSync(abs, 'utf8')
    const before = snapshot(beforeContent, stat)
    const stale =
      (etag !== undefined && etag !== before.etag) ||
      (expectedMtime !== undefined && Number(expectedMtime) !== before.mtime)
    if (stale) return { conflict: true, path: relPath, diffUndo: { before, incoming: { content } } }
    await writeFileAtomic(abs, content, { mode: stat.mode & 0o777 })
    fsyncPath(abs) // ARC-4：fsync 文件
    fsyncPath(path.dirname(abs), { dir: true }) // ARC-4：目录 fsync（rename 可见性）
    try {
      assertRealInRoot(root, abs) // TOCTOU 口径③：操作后复核（漂移→io_error 留痕；残窗见 task-12 报告）
    } catch (err) {
      throw fail('io_error', `保存后路径复核失败（路径漂移，内容已写入当次真实节点）：${err.message}`)
    }
    const after = snapshot(content, statOrThrow(abs, relPath))
    emitVaultChange({ type: 'save', path: relPath, content }) // T11 保险①：保存即增量（落盘后发事件）
    return {
      ok: true,
      path: relPath,
      mtime: after.mtime,
      etag: after.etag,
      size: after.size,
      diffUndo: { before, after },
    }
  }, { waitMs: SAVE_LOCK_WAIT_MS })
}

// ── createNote：新建写侧（T9 文件夹分享（写）「新建」原语；OW-INV-5 永不静默覆盖在创建面）────────
// 创建语义=独占创建（乐观条件=「目标不存在」，锁内 lstat 复核——OW-INV-3「无乐观锁不落盘」的创建面
// 口径）；目标已存在一律域结果拒（文件/目录同拒），绝不覆盖既有内容。ARC-4 fs-safe 收尾同 saveNote
// （原子写 + 文件 fsync + 目录 fsync）。
/**
 * 新建文件（目录内新建——OW-INV-2 文件夹分享（写）四操作之一）。
 * @returns {Promise<
 *   | {ok: true, path, mtime, etag, size}
 *   | {ok: false, reason: 'target-exists' | 'parent-missing'}
 * >}
 *   域结果一律对象返回（不抛错）；仅形参/围栏非法 throw bad_request；IO 异常 throw io_error。
 */
export async function createNote(root, relPath, content = '') {
  if (content === undefined) content = ''
  if (typeof content !== 'string') throw fail('bad_request', 'content 必须是字符串')
  const abs = resolveInRoot(root, relPath) // realpath 围栏（单一来源，T12 终态）
  try {
    return await withFileLock(abs, async () => {
      resolveInRoot(root, relPath) // TOCTOU 口径②：锁内 realpath 复核
      const existing = await fs.promises.lstat(abs).catch(() => null)
      if (existing !== null) return { ok: false, reason: 'target-exists' } // 文件/目录同拒（永不静默覆盖）
      await writeFileAtomic(abs, content, { mode: 0o644 })
      fsyncPath(abs) // ARC-4：fsync 文件
      fsyncPath(path.dirname(abs), { dir: true }) // ARC-4：目录 fsync
      try {
        assertRealInRoot(root, abs) // TOCTOU 口径③：操作后复核（漂移→io_error 留痕）
      } catch (err) {
        throw fail('io_error', `创建后路径复核失败（路径漂移，内容已写入当次真实节点）：${err.message}`)
      }
      const stat = statOrThrow(abs, relPath)
      emitVaultChange({ type: 'create', path: relPath, content }) // T11 保险①：新建即增量
      return {
        ok: true,
        path: relPath,
        mtime: stat.mtimeMs,
        etag: `${Buffer.byteLength(content, 'utf8')}-${stat.mtimeMs}`,
        size: Buffer.byteLength(content, 'utf8'),
      }
    }, { waitMs: SAVE_LOCK_WAIT_MS })
  } catch (err) {
    // 父目录缺失/父非目录：域结果（含取锁/写入两处 ENOENT——锁文件与目标同目录，同判）
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { ok: false, reason: 'parent-missing' }
    if (err.code === 'bad_request' || err.code === 'io_error') throw err
    throw fail('io_error', `创建失败：${err.message}`)
  }
}

// ── scanBacklinks：反链扫描（占位级全量扫，T11 索引三保险归位后换索引读）──────────────────────
// 解析语义：wikilink [[t|alias]]/[[t#head]] 剥别名锚点 + basename 匹配；md 相对链接按源文件目录解析；
//          同行多链只记一条（text=源行原文）；外链/纯锚点不计；目标不自指。
const WIKI_LINK_RE = /\[\[([^\[\]]+)\]\]/g
const MD_LINK_RE = /\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g

function linkTarget(raw) {
  const t = raw.split('#')[0].split('|')[0].trim()
  if (!t || t.startsWith('#')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null // 外链不计
  return t
}

function matchesTarget(targetNote, srcPath, rawTarget) {
  const t = linkTarget(rawTarget)
  if (!t) return false
  const noteBase = targetNote.replace(/\.md$/i, '')
  const tBase = t.replace(/\.md$/i, '')
  const srcDir = path.posix.dirname(srcPath)
  const viaRel = path.posix.normalize(srcDir === '.' ? tBase : `${srcDir}/${tBase}`)
  if (viaRel === noteBase) return true
  if (tBase === noteBase) return true
  const tName = tBase.split('/').pop()
  const nName = noteBase.split('/').pop()
  return tName !== '' && tName === nName // Obsidian basename 语义（大小写敏感，T11 归位折叠）
}

/** 全 vault 文件清单（dot 条目与 symlink 不入清单；mdOnly=.md 改写扫描面） */
function collectFiles(root, { mdOnly = false } = {}) {
  const out = []
  const walk = (abs, rel) => {
    let dirents
    try {
      dirents = fs.readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue
      const childRel = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) walk(path.join(abs, d.name), childRel)
      else if (d.isFile() && (!mdOnly || d.name.toLowerCase().endsWith('.md'))) out.push(childRel)
    }
  }
  walk(path.resolve(root), '')
  return out.sort()
}

function collectMarkdownFiles(root) {
  return collectFiles(root, { mdOnly: true })
}

export function scanBacklinks(root, relPath) {
  resolveInRoot(root, relPath) // 围栏同 readNote（不强制目标存在：反链索引语义）
  const backlinks = []
  for (const srcPath of collectMarkdownFiles(root)) {
    if (srcPath === relPath) continue // 目标不自指
    const content = fs.readFileSync(path.resolve(root, srcPath), 'utf8')
    const lines = content.split('\n')
    for (let line = 0; line < lines.length; line += 1) {
      const text = lines[line].replace(/\r$/, '')
      WIKI_LINK_RE.lastIndex = 0
      MD_LINK_RE.lastIndex = 0
      const hit =
        [...text.matchAll(WIKI_LINK_RE)].some((m) => matchesTarget(relPath, srcPath, m[1])) ||
        [...text.matchAll(MD_LINK_RE)].some((m) => matchesTarget(relPath, srcPath, m[1]))
      if (hit) backlinks.push({ path: srcPath, line: line + 1, text })
    }
  }
  backlinks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line))
  return { path: relPath, backlinks }
}

// ── renameNote：改名/移动 = 多文件事务（T5 / OW-US-5 / OW-INV-4；iamzcr 六坑 + 修复轮教训）────
// 事务序（六坑①⑥）：改前 journal 快照 → ①目标副本（含自指改写）→ ②逐文件锁内 RMW 改写
//   （wikilink 重写四设计 + INDEX.md 同在扫描面=INDEX 同事务）→ ③最后删源 → 失败整体回滚（journal 逆放）。
//   顺序=零断链窗口保证（新名先在场、引用改完才删源）+ 不留空源残渣。
// 六坑逐条：①多文件事务化 ②批量失败即中止回滚（未轮到文件零触碰）③锁内 RMW fresh-read 比对
//   （快照后被改=并发冲突中止，绝不吞并发写）④rename 前查目标存在（缺省拒，显式 overwrite:true）
//   + 目标槽位检查与写入同锁内（TOCTOU 秒级窗可静默覆盖并发者——修复轮教训）⑤frontmatter title
//   内链接同改写（wikilink-rewrite 扫描面不豁免 frontmatter）⑥改写后删源。
// 回滚纪律（修复轮教训）：回滚基=锁内 fresh 快照（并发者内容不被逆放成「不存在」）；
//   回滚只逆放「我们写过且现状仍是我们的写」——写后被并发改/删的项跳过逆放+留痕（绝不吞并发写）。
// 域结果形（kb_mark ok 键惯例）：{ok, rolledBack, warnings, changed[]}——成功/域拒绝/回滚态一律
//   结果对象（UI 按 reason 决策）；仅形参/围栏非法 throw bad_request（沿 saveNote 惯例）。
//   changed=调用结束后盘上与调用前不同的路径（回滚完成=空数组；回滚未完全=残留项）。
// 测试缝（仅一个）：opts._onStage(stage)——事务阶段点回调（'after-snapshot' | 'after-dest' |
//   'before-rewrite:<rel>' | 'after-rewrite:<rel>' | 'before-fsync:<rel>' | 'after-rm:<rel>' |
//   'before-delete' | 'after-delete' | 'rollback-compare:<rel>'）：
//   回调内真写盘=并发注入、抛错=中途故障注入（检测逻辑全程真验真文件，非 mock）。
//   步骤内断面（fix r1 补）：'before-fsync:<rel>'=写入落盘后、fsync 前（抛错=「写后 fsync 抛」）；
//   'after-rm:<rel>'=③ rm 落盘后、目录 fsync 前（抛错=「rm 后 fsync 抛」；回调内把 <源>.lock
//   换成目录=真实 finally 清锁故障 ERR_FS_EISDIR=「锁释放抛」）；'rollback-compare:<rel>'=
//   回滚『比对后、逆放前』断面（锁内；回调内真写盘=回滚窗口并发注入）。
// 边界声明：改写扫描面=全 vault .md 页面（wikilink/INDEX 零断链承诺面）；md 形链接 [x](y.md)
//   不改写只留痕（承诺范围外）；目录改名拒（not-a-file）；realpath 围栏已归位（T12 终态）。
const TX_LOCK_WAIT_MS = 10_000
export const DEFAULT_JOURNAL_MAX_BYTES = 64 * 1024 * 1024

/** 改前快照（journal 事务单文件原语）：existed:false=逆放即删除的凭据 */
async function journalSave(abs) {
  try {
    const content = await fs.promises.readFile(abs)
    const st = await fs.promises.stat(abs)
    return { file: abs, existed: true, content, mode: st.mode & 0o777 }
  } catch (err) {
    if (err?.code === 'ENOENT') return { file: abs, existed: false, content: null, mode: null }
    throw err
  }
}

/** 逆放（journalSave 的回滚半边）：existed → 原字节+mode 精确还原（fchmod 不受 umask 截损）；
 *  !existed → 删除事后创建的文件。幂等：force 忽略 ENOENT。 */
async function journalRollback(snap) {
  if (snap.existed) {
    await writeFileAtomic(snap.file, snap.content, snap.mode == null ? {} : { mode: snap.mode })
    fsyncPath(snap.file) // ARC-4：fsync 文件
    fsyncPath(path.dirname(snap.file), { dir: true }) // ARC-4：目录 fsync
    if (snap.mode != null) {
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
  fsyncPath(path.dirname(snap.file), { dir: true })
}

/** 事务写：原子写 + ARC-4 fsync（文件+目录）；onBeforeFsync=「写后 fsync 前」测试缝断面。
 *  export（T8）：share.js 持久化复用同一 fs-safe 写原语（ARC-4 崩溃持久化单一来源）。 */
export async function writeAtomicFsync(abs, data, mode, onBeforeFsync) {
  await writeFileAtomic(abs, data, mode == null ? {} : { mode })
  await onBeforeFsync?.()
  fsyncPath(abs)
  fsyncPath(path.dirname(abs), { dir: true })
}

/** 事务条目：{snap, rel, written: Buffer|null（本事务写入内容）, deleted: bool} */
const entryOf = (snap, rel) => ({ snap, rel, written: null, deleted: false })

/** 事务锁（withFileLock + 自家锁残渣自清，fix r1/C1）：锁释放路径故障（finally 清锁抛错）会留下
 *  锁残渣挡死后续取锁——锁体完成后失败即判为释放故障，自清自家残渣后照抛（回滚必须能取到锁）。 */
async function withTxLock(abs, body) {
  let bodyDone = false
  try {
    await withFileLock(abs, async () => {
      await body()
      bodyDone = true
    }, { waitMs: TX_LOCK_WAIT_MS })
  } catch (err) {
    if (bodyDone) await fs.promises.rm(`${abs}.lock`, { force: true, recursive: true }).catch(() => {})
    throw err
  }
}

/**
 * 事务逆放（逆序逐条）：只逆放「我们确实改过且现状仍是我们写的样子」的条目——写后被并发改/删的
 * 项跳过逆放+留痕（六坑③：绝不吞并发写）；删除项被并发重建同样跳过。返回 {problems, unrestored}。
 * fix r1（C1 记账前置配套 + I2）：标记=已变更的条目**一律尝试逆放**（幂等容忍——变更未落盘或
 * 已被还原原状的项静默跳过，绝不误报残留）；「比对+逆放」全程持 per-file withFileLock（比对与
 * 回写之间落盘的协作并发写不再被吞）。onEntry=回滚『比对后、逆放前』测试缝断面（锁内）。
 */
async function rollbackAll(entries, warnings, onEntry) {
  const problems = []
  const unrestored = []
  for (const e of [...entries].reverse()) {
    try {
      await withTxLock(e.snap.file, async () => {
        let cur = null
        try {
          cur = await fs.promises.readFile(e.snap.file)
        } catch (err) {
          if (err?.code !== 'ENOENT') throw err
        }
        await onEntry?.(e.rel)
        if (e.deleted) {
          if (cur !== null) {
            if (e.snap.existed && cur.equals(e.snap.content)) return // 幂等容忍：rm 未落盘/已被还原=已是原状
            problems.push(`${e.rel} 删除后被并发重建，未逆放`)
            warnings.push(`回滚跳过：${e.rel} 删除后被并发重建（保留并发内容）`)
            unrestored.push(e.rel)
            return
          }
          await journalRollback(e.snap) // 逆放复活源文件
          return
        }
        if (e.written !== null) {
          if (cur === null) {
            if (!e.snap.existed) return // 幂等容忍：我方新建（原不存在）未落盘/已清=现状即原状
            problems.push(`${e.rel} 本事务写入后被并发删除，未逆放`)
            warnings.push(`回滚跳过：${e.rel} 写后被并发删除`)
            unrestored.push(e.rel)
            return
          }
          if (cur.equals(e.written)) {
            await journalRollback(e.snap)
            return
          }
          if (e.snap.existed && cur.equals(e.snap.content)) return // 幂等容忍：写未落盘/已被还原原状
          problems.push(`${e.rel} 写后被并发修改，未逆放（保留并发内容）`)
          warnings.push(`回滚跳过：${e.rel} 写后被并发修改（保留并发内容）`)
          unrestored.push(e.rel)
          return
        }
        // 未动条目：零逆放项（并发内容保留）
      })
    } catch (err) {
      problems.push(`${e.rel} 逆放失败（${err?.code ?? err?.message ?? err}）`)
      unrestored.push(e.rel)
    }
  }
  return { problems, unrestored }
}

/** 锁内 fresh-read（六坑③ 比对面）：并发删除视同并发修改（错误诚实性） */
async function readFresh(abs) {
  try {
    return await fs.promises.readFile(abs)
  } catch (err) {
    if (err?.code === 'ENOENT') {
      const e = new Error('并发修改检测：锁内目标已不存在（被并发删除），中止事务')
      e.reason = 'concurrent-modification'
      throw e
    }
    throw err
  }
}

const keyOf = (rel) => (rel.endsWith('.md') ? rel.slice(0, -3) : rel)
const stemOf = (rel) => {
  const base = rel.split('/').pop()
  return base.endsWith('.md') ? base.slice(0, -3) : base
}

/** md 形目标 → vault 相对路径（'/…'=根锚定；否则相对源文件目录；null=外链/纯锚点） */
function mdTargetRel(srcRel, rawTarget) {
  const t = rawTarget.split('#')[0].trim()
  if (t === '' || t.startsWith('#') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null
  if (t.startsWith('/')) return t.slice(1)
  const srcDir = path.posix.dirname(srcRel)
  return path.posix.normalize(srcDir === '.' ? t : `${srcDir}/${t}`)
}

/**
 * 改名/移动（同操作：to 可跨目录=移动）——多文件事务（OW-US-5 / OW-INV-4）。
 * @param options {{overwrite?: boolean, journalMaxBytes?: number, _onStage?: (stage: string) => (void|Promise<void>)}}
 * @returns {Promise<
 *   | {ok: true, from, to, moved: true, selfChanges: number, changed: string[],
 *      rewritten: [{path, changes}], skipped: [{file, line, target, reason}], rolledBack: false, warnings: string[]}
 *   | {ok: false, from, to, reason, message, changed: string[], rewritten: [],
 *      skipped: [{file, line, target, reason}], rolledBack: boolean, warnings: string[]}
 * >}
 *   reason ∈ 'same-path'|'not-found'|'not-a-file'|'target-exists'|'journal-limit'
 *            |'concurrent-modification'|'transaction-failed'
 *   域结果一律对象返回（不抛错）；仅形参/围栏非法 throw bad_request。
 */
export async function renameNote(root, from, to, options = {}) {
  const opts = options ?? {}
  if (typeof from !== 'string' || from === '') throw fail('bad_request', 'from 参数缺失')
  if (typeof to !== 'string' || to === '') throw fail('bad_request', 'to 参数缺失')
  const fromAbs = resolveInRoot(root, from) // realpath 围栏（throw bad_request）
  const toAbs = resolveInRoot(root, to)
  const warnings = []
  const skipped = []
  const result = (over) => ({
    ok: false, from, to, reason: '', message: '', changed: [], rewritten: [], skipped, rolledBack: false, warnings, ...over,
  })

  if (from === to || fromAbs === toAbs) return result({ reason: 'same-path', message: `from 与 to 相同：${from}` })
  // 源 lstat 门（修复轮教训）：源节点必须普通文件（不解引用——symlink 源/目录/其他 → not-a-file）
  const srcNode = await fs.promises.lstat(fromAbs).catch(() => null)
  if (srcNode === null) return result({ reason: 'not-found', message: `不存在：${from}` })
  if (!srcNode.isFile()) return result({ reason: 'not-a-file', message: `仅普通文件支持改名/移动（拒 symlink/目录/其他）：${from}` })
  // 六坑④：rename 前查目标存在——缺省拒（防静默覆盖同名）；apply 段锁内重检=TOCTOU 同锁
  const toNode = await fs.promises.lstat(toAbs).catch(() => null)
  if (toNode !== null) {
    if (opts.overwrite !== true) return result({ reason: 'target-exists', message: `目标已存在（显式 overwrite:true 才替换）：${to}` })
    if (toNode.isDirectory()) return result({ reason: 'target-exists', message: `目标为目录，不覆盖：${to}` })
  }
  const parentStat = await fs.promises.stat(path.dirname(toAbs)).catch(() => null)
  if (parentStat === null) return result({ reason: 'not-found', message: `目标父目录不存在（不自动建目录）：${path.posix.dirname(to)}` })
  if (!parentStat.isDirectory()) return result({ reason: 'not-found', message: `目标父路径不是目录：${path.posix.dirname(to)}` })

  // ── 计划：stem 歧义判据（全文件清单）+ .md 扫描面改写计划 + md 形链接留痕 ──
  const allFiles = collectFiles(root)
  const mdFiles = collectMarkdownFiles(root)
  const oldKey = keyOf(from)
  const newKey = keyOf(to)
  const oldStem = stemOf(from)
  const newStem = stemOf(to)
  const oldStemUnique = allFiles.every((rel) => rel === from || rel === to || stemOf(rel) !== oldStem)
  const newStemUnique = allFiles.every((rel) => rel === from || rel === to || stemOf(rel) !== newStem)
  const ctxPlan = { oldKey, oldStem, oldStemUnique, newKey, newStem, newStemUnique }

  const srcIsMd = from.endsWith('.md')
  const fromBuf = await fs.promises.readFile(fromAbs)
  const selfPlan = srcIsMd
    ? planRewrite(fromBuf.toString('utf8'), ctxPlan)
    : { text: null, changes: 0, skipped: [], notes: [] }

  const rewrites = []
  const noteMdRef = (rel, content) => {
    for (const ref of scanMdLinkTargets(content)) {
      const resolved = mdTargetRel(rel, ref.target)
      const isSrcRel = rel === from
      if (!isSrcRel && resolved !== null && (resolved === from || keyOf(resolved) === oldKey)) {
        // 零断链承诺范围=wikilink/INDEX：md 形引用指向被改名文件 → 留痕不改写
        warnings.push(`md 形链接指向被改名文件（零断链承诺范围=wikilink/INDEX，本卡不改写）：${rel} 第 ${ref.line} 行 ${ref.target}`)
      } else if (isSrcRel && resolved !== null && !ref.target.trim().startsWith('/')) {
        // 移动文件内相对 md 引用：相对基准随移动变化（本卡不重基）→ 留痕
        warnings.push(`移动致相对 md 链接基准变化（本卡不重基）：${rel} 第 ${ref.line} 行 ${ref.target}`)
      }
    }
  }
  for (const rel of mdFiles) {
    const isSrc = rel === from
    if (rel === to) continue
    const content = isSrc ? fromBuf.toString('utf8') : fs.readFileSync(path.resolve(root, rel), 'utf8')
    noteMdRef(rel, content)
    if (isSrc) continue
    const plan = planRewrite(content, ctxPlan)
    skipped.push(...plan.skipped.map((s) => ({ file: rel, ...s })))
    for (const n of plan.notes) warnings.push(`${rel}：${n}`)
    if (plan.changes > 0) rewrites.push({ rel, abs: path.resolve(root, rel), before: content, after: plan.text, changes: plan.changes })
  }
  skipped.push(...selfPlan.skipped.map((s) => ({ file: from, ...s })))
  for (const n of selfPlan.notes) warnings.push(`${from}：${n}`)
  for (const s of skipped) {
    warnings.push(`歧义不动：${s.file} 第 ${s.line} 行 [[${s.target}]]（stem 多命中，返回不动+留痕）`)
  }

  // ── journal 快照（改前全量；stat 先行 + 预算——超限拒事务留痕，零写盘）──────────
  const journalMaxBytes = Number.isFinite(opts.journalMaxBytes) && opts.journalMaxBytes > 0
    ? opts.journalMaxBytes
    : DEFAULT_JOURNAL_MAX_BYTES
  const participants = [fromAbs, toAbs, ...rewrites.map((x) => x.abs)]
  let budget = journalMaxBytes
  for (const p of participants) {
    let size = 0
    try {
      size = (await fs.promises.stat(p)).size
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        return result({ reason: 'transaction-failed', message: `快照前 stat 失败（未写盘、无逆放发生）：${err?.code ?? err}` })
      }
    }
    budget -= size
    if (budget < 0) {
      warnings.push(`journal-limit：事务快照总量超上限 ${journalMaxBytes} 字节（大文件事务显式策略）`)
      return result({ reason: 'journal-limit', message: `journal 快照总量超上限 ${journalMaxBytes} 字节：事务拒（未写盘、无逆放发生）` })
    }
  }
  const snapOf = new Map()
  for (const p of participants) {
    try {
      snapOf.set(p, await journalSave(p))
    } catch (err) {
      return result({ reason: 'transaction-failed', message: `改前快照失败（未写盘、无逆放发生）：${err?.code ?? err}` })
    }
  }

  // ── 动手（事务）：①目标副本 → ②逐文件锁内 RMW 改写（INDEX 同事务）→ ③最后删源 ──
  const entries = []
  const entryFor = (abs, rel, snap) => {
    const e = entryOf(snap ?? snapOf.get(abs), rel)
    entries.push(e)
    return e
  }
  const failTx = async (err) => {
    const mutated = entries.some((e) => e.deleted || e.written !== null)
    const { problems, unrestored } = await rollbackAll(entries, warnings, (rel) => opts._onStage?.(`rollback-compare:${rel}`))
    const prefix = String(err?.message ?? err)
    const reason = err?.reason ?? 'transaction-failed'
    warnings.push(`事务中止（${reason}）：${prefix}`) // 冲突/故障必留痕（INV-15 风格）
    if (!mutated) {
      return result({ reason, message: `${prefix}；未写盘、无逆放发生`, rolledBack: false })
    }
    const rolledBack = problems.length === 0
    return result({
      reason,
      message: rolledBack
        ? `${prefix}；已整体逆放还原`
        : `${prefix}；逆放未完全（${problems.join('；')}），文件可能处于中间态需人工核对`,
      rolledBack,
      changed: rolledBack ? [] : [...new Set(unrestored)].sort(),
    })
  }
  try {
    await opts._onStage?.('after-snapshot') // 测试缝：快照后、动手前（TOCTOU/并发注入点）
    // ① 目标副本（六坑⑥：改写前新名已在场=零断链窗口）；写入进锁，锁内重检覆盖门（TOCTOU 同锁）
    //    + 锁内 fresh 快照=回滚基（并发者内容不被逆放成「不存在」）
    //    fix r1（C1 记账前置）：written 标记先于可抛 I/O（写/fsync/锁释放任一抛→条目仍视作已变更，
    //    rollbackAll 一律尝试逆放（幂等容忍），绝不落进「变更后、标记前」丢记账窗口）
    const destContent = srcIsMd ? Buffer.from(selfPlan.text, 'utf8') : fromBuf
    await withTxLock(toAbs, async () => {
      const existsNow = await fs.promises.lstat(toAbs).then(() => true, () => false)
      if (existsNow && opts.overwrite !== true) {
        const err = new Error(`目标已存在（显式 overwrite:true 才替换）：${to}`)
        err.reason = 'target-exists'
        throw err
      }
      const e = entryFor(toAbs, to, await journalSave(toAbs)) // 写入面才进 entries（拒绝面零回滚项）
      e.written = destContent // 记账前置：标记先于可抛写
      await writeAtomicFsync(toAbs, destContent, srcNode.mode & 0o777, () => opts._onStage?.(`before-fsync:${to}`))
    })
    await opts._onStage?.('after-dest')

    // ② 逐文件锁内 RMW（六坑③：锁内 fresh-read 比对，快照后被改=中止，绝不吞并发写）
    for (const rw of rewrites) {
      await opts._onStage?.(`before-rewrite:${rw.rel}`)
      const e = entryFor(rw.abs, rw.rel)
      const afterBuf = Buffer.from(rw.after, 'utf8')
      await withTxLock(rw.abs, async () => {
        const fresh = await readFresh(rw.abs)
        if (!fresh.equals(Buffer.from(rw.before, 'utf8'))) {
          const err = new Error(`并发修改检测：${rw.rel} 快照后被改写，中止事务`)
          err.reason = 'concurrent-modification'
          throw err
        }
        e.written = afterBuf // 记账前置：标记先于可抛写（比对未过不落标记=零误伤）
        await writeAtomicFsync(rw.abs, afterBuf, null, () => opts._onStage?.(`before-fsync:${rw.rel}`))
      })
      await opts._onStage?.(`after-rewrite:${rw.rel}`)
    }

    // ③ 删源（六坑⑥：改写后删源；删前核对源未被并发改）
    await opts._onStage?.('before-delete')
    const srcEntry = entryFor(fromAbs, from)
    await withTxLock(fromAbs, async () => {
      const fresh = await readFresh(fromAbs)
      if (!fresh.equals(fromBuf)) {
        const err = new Error(`并发修改检测：${from} 快照后被改写，中止事务`)
        err.reason = 'concurrent-modification'
        throw err
      }
      srcEntry.deleted = true // 记账前置：删除标记先于 rm/可抛 fsync/锁释放
      await fs.promises.rm(fromAbs)
      await opts._onStage?.(`after-rm:${from}`) // 步骤内断面：rm 落盘后、目录 fsync 前（抛错=「rm 后 fsync 抛」）
      fsyncPath(path.dirname(fromAbs), { dir: true })
    })
    await opts._onStage?.('after-delete')
  } catch (err) {
    return failTx(err)
  }

  const changed = [...new Set([to, ...rewrites.map((x) => x.rel), from])].sort()
  emitVaultChange({ type: 'rename', from, to, changed }) // T11 保险①：改名即增量（事务提交后发事件）
  return {
    ok: true,
    from,
    to,
    moved: true,
    selfChanges: selfPlan.changes,
    changed,
    rewritten: rewrites.map((x) => ({ path: x.rel, changes: x.changes })),
    skipped,
    rolledBack: false,
    warnings,
  }
}

// ── 删除（T6）：.trash 可逆删除 + 双确认（OW-US-6 / OW-INV-5）────────────────────────
const TRASH = '.trash'
const TRASH_CANDIDATE_LIMIT = 10_000

/** 冲突改名序号位：x.md→x.1.md；无扩展名 x→x.1（stem 保持、扩展名回填，绝不覆盖既有名） */
function numberedName(name, n) {
  if (n === 0) return name
  const ext = path.posix.extname(name)
  const stem = ext === '' ? name : name.slice(0, name.length - ext.length)
  return `${stem}.${n}${ext}`
}

/**
 * trash 落点认领（wiki-steward 修复轮教训同款语义，独立实现、不 import）：
 *  - 冲突改名防覆盖：落点被占 → x.md→x.1.md（序号递增；祖先段被非目录占用同样改名该段）
 *  - O_EXCL 占位防覆盖窄窗：『taken 检查→rename』之间的并发抢建窗口由独占占位闭死——
 *    文件占位 'wx' / 目录占位 mkdir 独占，rename 顶替自家占位=唯一落点；
 *    并发者同名抢建一律 EEXIST → 自己按冲突改名走下一位（双方内容都活）。
 *  - 失败清残只清本调用占位（外来/既有内容零误伤）——见 deletePath catch 段。
 */
async function claimTrashSlot(rootAbs, rel, isDir) {
  // 输入先规范化（'.' 段折叠/多余分隔归一）：trashPath 输出无 '.' 段（修复轮 Issue 2）
  const parts = path.posix.normalize(rel).split('/')
  let dirAbs = path.join(rootAbs, TRASH)
  await fs.promises.mkdir(dirAbs, { recursive: true })
  const dirParts = [TRASH]
  let bumped = false
  for (let i = 0; i < parts.length - 1; i++) {
    let placed = false
    for (let n = 0; n < TRASH_CANDIDATE_LIMIT && !placed; n++) {
      const name = numberedName(parts[i], n)
      if (n > 0) bumped = true
      const abs = path.join(dirAbs, name)
      try {
        await fs.promises.mkdir(abs) // 祖先目录独占认领
        dirAbs = abs
        dirParts.push(name)
        placed = true
      } catch (err) {
        if (err?.code !== 'EEXIST') throw err
        const st = await fs.promises.lstat(abs).catch(() => null)
        if (st?.isDirectory()) { // 既有目录=共享祖先（其他删除的落点父目录），复用
          dirAbs = abs
          dirParts.push(name)
          placed = true
        }
        // 被非目录占用 → 该段冲突改名下一位
      }
    }
    if (!placed) throw fail('io_error', `trash 落点祖先候选耗尽：${parts.slice(0, i + 1).join('/')}`)
  }
  for (let n = 0; n < TRASH_CANDIDATE_LIMIT; n++) {
    const name = numberedName(parts[parts.length - 1], n)
    if (n > 0) bumped = true
    const abs = path.join(dirAbs, name)
    try {
      if (isDir) await fs.promises.mkdir(abs) // 目录占位（mkdir 独占）
      else await fs.promises.writeFile(abs, '', { flag: 'wx' }) // 文件占位（O_EXCL 独占）
      return { abs, trashRel: [...dirParts, name].join('/'), placeholder: abs, bumped }
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err
      // 冲突改名防覆盖：x.md→x.1.md（占位独占=EEXIST 即试下一位）
    }
  }
  throw fail('io_error', `trash 落点候选耗尽：${rel}`)
}

/**
 * 删除（OW-US-6 / OW-INV-5：可逆删除）——移动到 .trash/<rel>（绝不真删；取回=从 trashPath 逆向
 * rename 即还原，内容逐字节同）。双确认（wiki-steward T12 实测语义）：confirm === 目标相对路径
 * 全等复述；**确认检查先于一切副作用**（围栏/trash 落点/任何写之前）；缺省/不符一律拒（缺省拒），
 * 副作用零发生。源 lstat 门（修复轮教训同款精化）：symlink/其他节点拒 not-a-file（不解引用）；
 * 真实目录删除保留。落点由 claimTrashSlot 认领（冲突改名 + O_EXCL 占位防覆盖）。
 * @param options {{confirm?: string, _onStage?: (stage: string) => (void|Promise<void>)}}
 * @returns {Promise<
 *   | {ok: true, path, trashPath, warnings: string[]}
 *   | {ok: false, reason, message, trashPath: null, warnings: string[]}
 * >}
 *   reason ∈ 'confirm-missing'|'confirm-mismatch'|'in-trash'|'not-found'|'not-a-file'|'move-failed'
 *   域结果一律对象返回（不抛错）；仅形参/围栏非法 throw bad_request。
 * 测试缝（仅一个，沿 renameNote._onStage 惯例）：'claimed:<trashRel>'=占位已立、rename 前
 *   （并发抢建注入点/占位后故障注入点）；'after-rename:<trashRel>'=rename 落盘后、fsync 前。
 * 边界声明：删除不改写引用面（wikilink 悬空扫描归后续卡）；rename 永不静默覆盖同名=T5 已锁
 *   （renameNote 缺省拒 + TOCTOU 锁内重检 + /ob/api/rename 负例）。
 */
export async function deletePath(root, relPath, options = {}) {
  const opts = options ?? {}
  if (typeof relPath !== 'string' || relPath === '') throw fail('bad_request', 'path 参数缺失')
  const warnings = []
  const reject = (reason, message) => ({ ok: false, reason, message, trashPath: null, warnings })
  // 双确认先行（先于围栏/trash 落点/任何写——「副作用零发生」的结构保证）
  const confirm = opts.confirm
  if (typeof confirm !== 'string' || confirm === '') {
    return reject('confirm-missing', '缺双确认（confirm=目标相对路径全等复述）——缺省拒')
  }
  if (confirm !== relPath) return reject('confirm-mismatch', '双确认复述不符（confirm 必须全等于目标相对路径）')
  const abs = resolveInRoot(root, relPath) // realpath 围栏（throw bad_request）
  // 回收站本体/内部条目拒删（恢复材料受保护；.trash 卷入自身=不可逆坑）。
  // 判定口径=规范化落点（resolved abs 对 <root>/.trash 的前缀判定），不是原始字符串前缀：
  // './.trash/x'、'.trash/./x' 等任何含 '.' 段的词法形态都解析进 .trash，一律拒（修复轮 Issue 1——
  // 字符串前缀判定曾被 './' 形态绕过，恢复材料被静默移出受保护区）。
  const trashAbs = path.resolve(path.resolve(root), TRASH)
  if (abs === trashAbs || abs.startsWith(trashAbs + path.sep)) {
    return reject('in-trash', `回收站条目不可再删（恢复材料受保护）：${relPath}`)
  }
  // 源 lstat 门：不解引用——symlink/其他拒 not-a-file；真实文件/真实目录删除保留
  const node = await fs.promises.lstat(abs).catch(() => null)
  if (node === null) return reject('not-found', `不存在：${relPath}`)
  if (!node.isFile() && !node.isDirectory()) {
    return reject('not-a-file', `仅普通文件/真实目录支持删除（拒 symlink/其他）：${relPath}`)
  }
  const isDir = node.isDirectory()
  let claimed = null
  let renamed = false
  try {
    claimed = await claimTrashSlot(path.resolve(root), relPath, isDir)
    if (claimed.bumped) {
      warnings.push(`trash 落点冲突改名（防覆盖）：${TRASH}/${relPath} 已被占用 → ${claimed.trashRel}`)
    }
    await opts._onStage?.(`claimed:${claimed.trashRel}`)
    // rename 顶替自家独占占位=唯一落点（并发抢建同名者已在占位处 EEXIST 改道，零覆盖）
    await fs.promises.rename(abs, claimed.abs)
    renamed = true
    await opts._onStage?.(`after-rename:${claimed.trashRel}`)
    // ARC-4：目录 fsync（源父目录 + trash 父目录）——收尾故障不谎报失败（删除已落盘、可逆）
    try {
      fsyncPath(path.dirname(abs), { dir: true })
      fsyncPath(path.dirname(claimed.abs), { dir: true })
    } catch (err) {
      warnings.push(`收尾故障（删除已落盘、可逆回收不受影响）：${err?.message ?? err}`)
    }
    emitVaultChange({ type: 'delete', path: relPath, trashPath: claimed.trashRel, isDir }) // T11 保险①：删除即增量
    return { ok: true, path: relPath, trashPath: claimed.trashRel, warnings }
  } catch (err) {
    if (renamed) {
      // rename 已落盘=删除已发生：绝不谎报失败、绝不误清已回收内容（占位已被 rename 顶替，非本调用占位）
      warnings.push(`收尾故障（删除已落盘、可逆回收不受影响）：${err?.message ?? err}`)
      emitVaultChange({ type: 'delete', path: relPath, trashPath: claimed.trashRel, isDir }) // T11 保险①（已落盘事实）
      return { ok: true, path: relPath, trashPath: claimed.trashRel, warnings }
    }
    // 失败清残只清本调用占位（外来/既有内容零误伤）；rename 未发生=源未动
    if (claimed !== null) {
      if (isDir) await fs.promises.rmdir(claimed.placeholder).catch(() => {})
      else await fs.promises.rm(claimed.placeholder, { force: true }).catch(() => {})
    }
    return reject('move-failed', `移入回收站失败（已清本调用占位、源未动）：${err?.message ?? err}`)
  }
}
