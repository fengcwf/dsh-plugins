// kb_mark — raw 素材 frontmatter `sha256` 字段机械回写（Task 11；US-9/INV-1/INV-6/A2 承载）
// 职责边界：只做「sha256 一行」的字节手术（两态）+ 乐观并发 + 原子写 + 写后未动段校验；
// 不认 wiki 语义（不校验六字段/不写 wiki/不做索引）——那是 validate/queue 的事。
// 零第三方依赖（node:fs/node:path/node:crypto）；零构建纯 ESM。
//
// 契约（delta-spec §2 + Controller 裁定）：
//   kbMark(file, {expectedRevision?, vaultRoot?, _write?})
//     → 成功 {ok:true, file, changed, previous, current}（previous=回写前值，无标记行=null）
//     → 失败 {ok:false, file, reason, message, …detail}（结构化错误，不抛裸异常——参数型错误除外）
//   bodyHash(body) → sha256 十六进制（INV-13 同源口径；Buffer 原样/字符串按 utf8）
//
// 两态语义（Controller Ruling；INV-1 唯一明文例外 = sha256 一行，其余字节零改动）：
//   ①更新既有 sha256 行 = **换值**：只替换值字节（行内前后缀/空格/行尾 CR 全保留）；
//     值为空且冒号后无空格时补一个空格再入值（保 YAML `key: value` 形，防 `sha256:<hash>` 整行
//     退化成 plain scalar 破坏 frontmatter 结构）；
//   ②缺失 = 补插行到 frontmatter 闭合 `---` **之前**（ingest-pipeline.py migrate 同款语义）；
//   ③无 frontmatter 块（含只有开栏未闭合）= 拒 + 留痕（INV-1 不许改结构）；
//   ④多条 sha256 行 = 结构歧义拒（ambiguous-sha256，裁定见 task-11 报告）。
//
// hash 口径（INV-13 与 ingest-pipeline.py 69-71 同源）：body = frontmatter 闭合 `---` 行之后内容；
//   sha256 = body 经 UTF-8 容错解码 + universal-newlines 归一（\r\n|\r → \n）后重新编码的字节哈希——
//   与 Python `hashlib.sha256(body.encode('utf-8'))` 逐字节同值（LF/合法 UTF-8 文件 = 裸 body 字节哈希）。
//   跨包重复实现差异（bundle 独立性现实，同 secrets 模式）见 task-11 报告差异表。
//
// 乐观并发（hr98w 协议）：写前校验 expectedRevision == 当前 sha256 值（无标记行/空值 ≡ ''）；
//   冲突 = 拒 + 留痕（expected/actual），绝不静默覆盖。**缺省（undefined）= 无条件更新**（调用方自负）。
//
// 原子写（INV-6）：消费 fs-safe.writeAtomic（wx 独占临时文件 + 文件 fsync + rename + 目录 fsync +
//   失败清残——冲突扫描裁定：T8 已修全链，此处消费勿重造）；mode 沿用原文件权限位。
//   写后未动段 hash 校验：写前记「去掉 sha256 行整行」的内容 hash，写后重读磁盘核对——
//   不一致 = write-corrupt + journalSave/journalRollback 逆放还原（不静默留坏文件）。
//
// 已知边界（如实申报，task-11 报告）：
//   - vaultRoot 缺省不围栏（契约 `kbMark(file, {expectedRevision?})` 无 root 面）——传 vaultRoot 时
//     走 fs-safe.realpathGuard 四步围栏（symlink 逃逸/越界拒）；T12/T14 消费方应传；
//   - 孤 \r 内嵌行按 raw 行切分（与 Python universal-newlines 行切分有分歧，vault 实况 LF 不涉及）；
//   - mode 经 umask 截损属 T8 挂账 deferred minor（journal 同面），本模块沿用 writeAtomic 语义。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { writeAtomic, realpathGuard, journalSave, journalRollback } from './fs-safe.js'

/**
 * body hash（INV-13 同源口径）：sha256(字节) 十六进制。
 * @param {Buffer|string} body Buffer 原样；字符串按 utf8 编码后哈希（测试/合成输入用）
 * @returns {string}
 */
export function bodyHash(body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8')
  return createHash('sha256').update(buf).digest('hex')
}

const DIGEST = (buf) => createHash('sha256').update(buf).digest('hex')

/** Python universal newlines 同口径归一：\r\n 与孤 \r 都译作 \n（ingest-pipeline 读取语义） */
const normalizeNewlines = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

// ── 字节级行扫描（手术在 raw 字节上做；行内容 core 去尾 \r 与 Python 行对齐） ──────

/** 行 = [start, end)（end 不含 \n）+ after（下行起点/EOF）+ core（去尾 \r 后的 [start, coreEnd)） */
function splitLines(buf) {
  const lines = []
  let start = 0
  for (;;) {
    const nl = buf.indexOf(0x0a, start)
    const end = nl === -1 ? buf.length : nl
    const coreEnd = end > start && buf[end - 1] === 0x0d ? end - 1 : end
    lines.push({ start, end, coreEnd, after: nl === -1 ? buf.length : nl + 1 })
    if (nl === -1) break
    start = nl + 1
  }
  return lines
}

const WS = new Set([0x20, 0x09, 0x0d, 0x0a, 0x0b, 0x0c])
const trimmedEquals = (buf, start, end, ascii) => {
  let s = start
  let e = end
  while (s < e && WS.has(buf[s])) s++
  while (e > s && WS.has(buf[e - 1])) e--
  return e - s === ascii.length && buf.toString('latin1', s, e) === ascii
}

const isFence = (buf, l) => trimmedEquals(buf, l.start, l.coreEnd, '---')
const SHA_PREFIX = 'sha256:'
const isShaLine = (buf, l) =>
  l.coreEnd - l.start >= SHA_PREFIX.length && buf.toString('latin1', l.start, l.start + SHA_PREFIX.length) === SHA_PREFIX

/** sha256 行值字节区间 [vStart, vEnd)（行内；空值 → 空区间，落点=冒号后首个非空白处） */
function valueSpan(buf, l) {
  let s = l.start + SHA_PREFIX.length
  while (s < l.coreEnd && WS.has(buf[s])) s++
  let e = l.coreEnd
  while (e > s && WS.has(buf[e - 1])) e--
  return { vStart: s, vEnd: e }
}

const lineValue = (buf, l) => {
  const { vStart, vEnd } = valueSpan(buf, l)
  return buf.toString('utf8', vStart, vEnd)
}

/** 去掉 sha256 行整行（内容+换行符）后的内容（未动段 hash 的口径） */
const stripShaLine = (buf, l) =>
  l === undefined ? buf : Buffer.concat([buf.subarray(0, l.start), buf.subarray(l.after)])

// ── 结果构造 ──────────────────────────────────────────────────────────────────

const fail = (file, reason, message, extra = {}) => ({ ok: false, file, reason, message, ...extra })

// ── 主契约 ────────────────────────────────────────────────────────────────────

/**
 * sha256 原子回写（两态字节手术 + 乐观并发 + 原子写 + 未动段校验）。
 * @param {string} file 目标 raw 素材文件
 * @param {{expectedRevision?: string|null, vaultRoot?: string, _write?: Function}} [opts]
 *   expectedRevision：写前乐观并发校验（undefined=无条件；null/''=期望无标记行/空值）；
 *   vaultRoot：围栏根（缺省不围栏=调用方自理；传入即 realpathGuard 四步拒逃逸）；
 *   _write：故障注入缝（默认 fs-safe.writeAtomic；测试塞破坏性写入器验 INV-6 校验拒绝路径）。
 * @returns {Promise<{ok:true, file, changed:boolean, previous:string|null, current:string}
 *   | {ok:false, file, reason:'no-frontmatter'|'ambiguous-sha256'|'revision-conflict'|'fenced'
 *      |'not-found'|'io-error'|'write-corrupt', message:string, …detail}>}
 */
export async function kbMark(file, opts = {}) {
  if (typeof file !== 'string' || file.length === 0 || file.includes('\0')) {
    throw new TypeError('kbMark: file 必须是非空无 NUL 字符串')
  }
  if (opts._write !== undefined && typeof opts._write !== 'function') {
    throw new TypeError('kbMark: _write 必须是函数（故障注入缝）')
  }
  const abs = path.resolve(file)

  // 围栏（vaultRoot 缺省不围栏）：形式拒→realpath 归一→root 归属→dangling 外指判逃逸
  if (opts.vaultRoot !== undefined) {
    const root = path.resolve(opts.vaultRoot)
    const rel = path.relative(root, abs)
    if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      return fail(abs, 'fenced', `目标不在 vaultRoot 围栏内：${abs}`, { guard: 'outside-root' })
    }
    const guard = realpathGuard(root, rel.split(path.sep).join('/'))
    if (!guard.ok) return fail(abs, 'fenced', `realpathGuard 拒绝（${guard.reason}）：${rel}`, { guard: guard.reason })
    if (!guard.exists) return fail(abs, 'not-found', `目标不存在：${abs}`)
  }

  // 读入（raw 字节；手术绝不经字符串转码往返）
  let buf
  let mode
  try {
    buf = await fs.promises.readFile(abs)
    mode = (await fs.promises.stat(abs)).mode & 0o777
  } catch (e) {
    if (e?.code === 'ENOENT') return fail(abs, 'not-found', `目标不存在：${abs}`)
    return fail(abs, 'io-error', `目标不可读：${e?.code ?? e?.message ?? e}`, { code: e?.code })
  }

  // ── 结构解析（两态判据 + 闭合 --- 锚点） ──
  const lines = splitLines(buf)
  if (lines.length === 0 || !isFence(buf, lines[0])) {
    return fail(abs, 'no-frontmatter', '无 frontmatter 块（INV-1 不许改结构，sha256 回写拒）')
  }
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (isFence(buf, lines[i])) { closeIdx = i; break }
  }
  if (closeIdx === -1) {
    return fail(abs, 'no-frontmatter', 'frontmatter 未闭合（无闭合 ---，INV-1 不许改结构，sha256 回写拒）')
  }
  const shaIdx = []
  for (let i = 1; i < closeIdx; i++) {
    if (isShaLine(buf, lines[i])) shaIdx.push(i)
  }
  if (shaIdx.length > 1) {
    return fail(abs, 'ambiguous-sha256', `frontmatter 含 ${shaIdx.length} 条 sha256 行（结构歧义拒，人工去重后重试）`)
  }

  // ── 乐观并发（hr98w）：expectedRevision == 当前 sha256 值（无标记行/空值 ≡ ''） ──
  const previous = shaIdx.length === 1 ? lineValue(buf, lines[shaIdx[0]]) : null
  if (opts.expectedRevision !== undefined) {
    const expected = opts.expectedRevision === null ? '' : String(opts.expectedRevision).trim()
    const actual = previous ?? ''
    if (expected !== actual) {
      return fail(abs, 'revision-conflict', `expectedRevision 不符（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）——拒绝覆盖`, { expected: opts.expectedRevision === null ? null : String(opts.expectedRevision), actual: previous })
    }
  }

  // ── 回写值（INV-13 同源）：body = 闭合 --- 行之后内容，universal-newlines 归一后哈希 ──
  const rawBody = buf.subarray(lines[closeIdx].after)
  const current = bodyHash(Buffer.from(normalizeNewlines(rawBody.toString('utf8')), 'utf8'))

  // ── 两态字节手术（除 sha256 行值字节外零改动） ──
  let newBuf
  let newLine // 写后核对用：新 sha256 行在 newBuf 中的定位锚（内容起点）
  if (shaIdx.length === 1) {
    // ①更新态：只换值字节（行内前缀/空白/行尾 CR 全保留；空值且冒号后无空格 → 补一空格保 YAML 形）
    const l = lines[shaIdx[0]]
    const { vStart, vEnd } = valueSpan(buf, l)
    const needSpace = vStart === vEnd && vStart === l.start + SHA_PREFIX.length
    const insert = (needSpace ? ' ' : '') + current
    newBuf = Buffer.concat([buf.subarray(0, vStart), Buffer.from(insert, 'utf8'), buf.subarray(vEnd)])
    newLine = l.start
  } else {
    // ②补插态：新行恰插在闭合 --- 行之前（migrate 同款）
    const at = lines[closeIdx].start
    newBuf = Buffer.concat([buf.subarray(0, at), Buffer.from(`sha256: ${current}\n`, 'utf8'), buf.subarray(at)])
    newLine = at
  }

  // 幂等：构造内容与原文全等 → changed:false 零写盘（同值重写无变化）
  if (newBuf.equals(buf)) {
    return { ok: true, file: abs, changed: false, previous, current }
  }

  // ── 写前记未动段 hash（INV-6）：去掉 sha256 行整行后的内容 hash ──
  const preDigest = DIGEST(stripShaLine(buf, shaIdx.length === 1 ? lines[shaIdx[0]] : undefined))

  // ── 原子写（fs-safe.writeAtomic 全链：wx 独占 + 文件 fsync + rename + 目录 fsync + 失败清残） ──
  const snap = await journalSave(abs) // 逆放凭据（content+sha256+mode）
  const write = opts._write ?? writeAtomic
  try {
    await write(abs, newBuf, { mode })
  } catch (e) {
    await journalRollback(snap).catch(() => {}) // 写入失败也逆放（防半截/破坏性写入器留坏文件）
    return fail(abs, 'io-error', `写入失败已逆放：${e?.code ?? e?.message ?? e}`, { code: e?.code, rolledBack: true })
  }

  // ── 写后未动段 hash 校验（INV-6）：重读磁盘核对，写坏即逆放拒 ──
  let disk
  try {
    disk = await fs.promises.readFile(abs)
  } catch (e) {
    await journalRollback(snap).catch(() => {})
    return fail(abs, 'io-error', `写后回读失败已逆放：${e?.code ?? e?.message ?? e}`, { code: e?.code, rolledBack: true })
  }
  const verify = verifyUnchanged(disk, preDigest, newLine, shaIdx.length === 1)
  if (!verify.ok) {
    let rolledBack = true
    await journalRollback(snap).catch(() => { rolledBack = false })
    return fail(abs, 'write-corrupt', `写后未动段 hash 校验失败（${verify.reason}）已逆放还原`, { rolledBack })
  }
  return { ok: true, file: abs, changed: true, previous, current }
}

/**
 * 写后核对：磁盘内容须可解析（frontmatter + 恰一条 sha256 行），且「去掉 sha256 行整行」的
 * 内容 hash 与写前记录一致（=除 sha256 行外逐字节未动，INV-1 hash 级对账 + INV-6 校验面）。
 */
function verifyUnchanged(disk, preDigest, newLine, isUpdate) {
  const lines = splitLines(disk)
  if (lines.length === 0 || !isFence(disk, lines[0])) return { ok: false, reason: '结构不可解析' }
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (isFence(disk, lines[i])) { closeIdx = i; break }
  }
  if (closeIdx === -1) return { ok: false, reason: 'frontmatter 不可解析' }
  const shaIdx = []
  for (let i = 1; i < closeIdx; i++) {
    if (isShaLine(disk, lines[i])) shaIdx.push(i)
  }
  if (shaIdx.length !== 1) return { ok: false, reason: `sha256 行数 ${shaIdx.length} ≠ 1` }
  // 插补态核对锚点：新行应在原闭合锚点处（防写坏挪位）；更新态行位可随值长度变化，只核 hash
  if (!isUpdate && lines[shaIdx[0]].start !== newLine) return { ok: false, reason: 'sha256 行位置漂移' }
  const postDigest = DIGEST(stripShaLine(disk, lines[shaIdx[0]]))
  if (postDigest !== preDigest) return { ok: false, reason: '未动段 hash 不一致' }
  return { ok: true }
}
