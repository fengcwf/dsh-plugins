// crud — wiki CRUD 工具面（T12：US-10 / OW-US-5 / OW-US-6 / INV-7 / A2 承载）
// 职责边界：wiki 域四操作 wikiWrite / wikiRead / wikiDelete / wikiRename（改名+移动同操作）。
// 消费勿重造：围栏/原子写/锁/journal 原语 = lib/fs-safe.js；kb_validate/kb_mark 不在本文件（index.js 注册收口）。
//
// ── 全局语义（INV-7 / 六坑 iamzcr / T11 挂账裁定）──────────────────────────────
//  * vaultRoot **必传**（T11 裁定：缺省=拒+留痕，绝不裸操作）；写面=wiki/ 域 + .trash（raw/ 与业务域拒）。
//  * 默认只读（readOnly 缺省 true）：写/删/改名需显式 readOnly:false 才动手（INV-7）。
//  * 统一覆盖语义（六坑④）：目标已存在缺省拒（target-exists），显式 overwrite:true 才替换——防 rename/写入静默覆盖。
//  * 删除 → `.trash/<rel>`（冲突改名 `.N` 防覆盖）+ 双确认（confirm=目标路径复述，缺省/不符即拒）；
//    .trash 无法就位 → 拒（INV-7 反例：无 .trash 直接删必须拒——本文件零直接 rm 用户内容）。
//  * 改名/移动=多文件事务（六坑①）：改前 journal 快照 → 逐文件原子写+锁 → wikilink 重写 → INDEX 同事务 →
//    失败整体回滚（journal 逆放）；批量失败即中止回滚（六坑②）；锁内 RMW 不吞并发（六坑③：锁内读新鲜内容，
//    快照后被改=冲突中止，回滚绝不吞并发写——写后被改的项跳过逆放+留痕）；顺序=先落目标副本→改写→最后删源
//    （六坑⑥：改写后删源，零断链窗口 + 不留空源残渣）。
//  * wikilink 重写四设计（iamzcr）：①歧义不动（stem 多命中返回不动+留痕）②`#锚|别名` 捕获组回填
//    ③裸名/全路径风格保持（含 wiki/ 锚定与 .md 后缀形）④toBase 不制造新歧义（新 stem 被占→降级路径形+留痕）。
//    重写范围含 frontmatter 内链接（六坑⑤），围栏代码块豁免（validate.js wikilink 同语义）；自指随移动文件走。
//  * rolledBack 口径（T11 消费面裁定=确认）：pre-write 失败 → rolledBack:false 且 message 明示「未写盘、
//    无逆放发生」；写后失败 → rolledBack=逆放实际成败（绝不谎报 true，回滚错误进 message）。
//  * journal 内存留白（T8 挂账）：显式策略=**大小上限 + 超限拒事务 + 留痕**（stat 先行防大文件整读 OOM，
//    快照总量 ≤ journalMaxBytes，超限在动手前拒）。选型报告：不流式快照（回滚需全量字节在手，分片只会搬家）。
//
// ── 测试缝（mark.js opts._write 同款纪律，仅两个）────────────────────────────
//  _failAt：事务阶段点抛错（'after-dest' | 'after-rewrite:<rel>' | 'before-delete' | 'after-delete'），
//          抛错点之前全是真操作（中途故障注入验整体回滚）；_beforeApply：快照后、动手前回调（并发反例
//          用它做真实写盘——检测逻辑全程真验真文件，非 mock）。
//
// 零第三方依赖（node:fs / node:path），零构建纯 ESM。
import fs from 'node:fs'
import path from 'node:path'
import {
  isSafeRelPath, realpathGuard, writeAtomic, withLeaseLock, journalSave, journalRollback,
} from './fs-safe.js'

/** journal 快照总量上限（事务内存显式策略；stat 先行 + 超限拒事务留痕）。工具面取模块常量，模型不可放大。 */
export const DEFAULT_JOURNAL_MAX_BYTES = 64 * 1024 * 1024

// ── 结果形与共用校验 ─────────────────────────────────────────────────────────

const fail = (reason, message, warnings = [], extra = {}) =>
  ({ ok: false, reason, message, warnings, ...extra })

/** vaultRoot 必传校验（T11 裁定：缺省=拒+留痕，不裸操作） */
function checkVaultRoot(opts) {
  const root = opts?.vaultRoot
  if (typeof root !== 'string' || root.trim() === '') {
    return fail('vault-root-required', 'vaultRoot 缺省=拒（T11 必传裁定）：不裸操作',
      ['vaultRoot 缺省=拒：本次调用零操作（不裸操作）'])
  }
  return { ok: true, root: path.resolve(root) }
}

/** 目标路径形式校验（安全形=fs-safe.isSafeRelPath 同源：vault 相对 POSIX，拒 ../ 绝对/盘符/反斜杠/NUL/空段） */
function checkRel(rel, warnings) {
  if (typeof rel !== 'string' || rel.length === 0) {
    return fail('unsafe-form', '目标路径必须是非空字符串', warnings)
  }
  if (!isSafeRelPath(rel)) {
    return fail('unsafe-form', `目标路径不安全（拒 ../ 穿越/绝对/盘符/反斜杠/NUL/空段）：${JSON.stringify(rel)}`, warnings)
  }
  return { ok: true, rel }
}

/** wiki 域校验（写面=wiki/ 域 + .trash；raw/ 与业务域拒） */
function checkWikiDomain(rel, warnings) {
  if (rel === 'wiki' || !rel.startsWith('wiki/')) {
    return fail('not-wiki', `写面=wiki/ 域：${rel} 不在可写域`, warnings)
  }
  return { ok: true }
}

/** 默认只读门（INV-7）：写/删/改名需显式 readOnly:false */
function checkWritable(opts, warnings) {
  if (opts?.readOnly !== false) {
    return fail('read-only', '默认只读（INV-7）：显式 readOnly:false 才动手', warnings)
  }
  return { ok: true }
}

/** 围栏（realpathGuard 全链逐段解引用，T12 加固版）：拒绝 unsafe-form/root 解析失败/越 root/symlink 逃逸 */
function fence(root, rel, warnings, { mustExist = false } = {}) {
  const g = realpathGuard(root, rel)
  if (!g.ok) {
    return fail('fenced', `realpathGuard 拒绝（${g.reason}）：${rel}`, warnings, { guard: g.reason })
  }
  if (mustExist && !g.exists) {
    return fail('not-found', `目标不存在：${rel}`, warnings)
  }
  return { ok: true, ...g }
}

// ── fix r1 #1：目标写入的锁内重检覆盖门（六坑④ 检查与写入原子）────────────────
/** 目标存在性新鲜判（stat 语义=realpathGuard().exists 同源：跟符号链接；dangling 内指=不存在） */
const existsFresh = async (p) => {
  try { await fs.promises.stat(p); return true } catch { return false }
}
/**
 * 覆盖门（**必须在 withLeaseLock 临界区内调用**，与 writeAtomic 同锁=检查与写入原子，堵静默覆盖窗口）：
 * overwrite:false 且目标锁内已存在 → `{rejected:'target-exists'}`（写入拒）；overwrite:true 语义不变（放行覆盖）。
 * fix r1 #1 修复的正是「检查在锁外、锁内不重检」——此窗口内被并发建的目标会被 writeAtomic 静默覆盖。
 */
const overwriteGate = async (targetReal, overwrite) => {
  const existsNow = await existsFresh(targetReal)
  if (existsNow && overwrite !== true) return { rejected: 'target-exists' }
  return { created: !existsNow }
}

// ── wikilink 扫描/改写引擎（四设计；parseRegTarget 归一口径与 validate.js 对齐） ──

/** 单个 [[…]] 内文解析：target 之外的 `#锚`/`|别名`/前导空白整段保留（捕获组回填） */
function parseInner(inner) {
  const aliasIdx = inner.indexOf('|')
  const left = aliasIdx === -1 ? inner : inner.slice(0, aliasIdx)
  const aliasPart = aliasIdx === -1 ? '' : inner.slice(aliasIdx)
  const anchorIdx = left.indexOf('#')
  const anchorPart = anchorIdx === -1 ? '' : left.slice(anchorIdx)
  const rawTarget = anchorIdx === -1 ? left : left.slice(0, anchorIdx)
  const target = rawTarget.trim()
  const lead = rawTarget.slice(0, rawTarget.length - rawTarget.trimStart().length)
  return { target, suffix: anchorPart + aliasPart, lead }
}

/** 目标形解析（validate.js parseRegTarget 同口径）：去 .md → 剥 wiki/ 锚定 → 形判定 */
function parseTargetShape(target) {
  const hadMd = target.endsWith('.md')
  const t = hadMd ? target.slice(0, -3) : target
  const hadWiki = t.startsWith('wiki/')
  const key = hadWiki ? t.slice('wiki/'.length) : t
  // wiki/ 锚定形=路径形（validate.js parseRegTarget 同判）；无 / 且无锚定=stem 形
  const form = hadWiki || key.includes('/') ? 'path' : 'stem'
  return { hadMd, hadWiki, key, form }
}

/** 围栏代码块豁免的行扫描（validate.js checkStructure 同款 fence 状态机）→ [[…]] 出现列表 */
function scanLinks(text) {
  const out = []
  const lines = text.split('\n')
  let fenceKind = null
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceM = /^\s{0,3}(```|~~~)/.exec(line)
    if (fenceM) {
      if (fenceKind === null) fenceKind = fenceM[1]
      else if (fenceKind === fenceM[1]) fenceKind = null
      offset += line.length + 1
      continue
    }
    if (fenceKind === null) {
      const re = /\[\[([^\]\[]*?)\]\]/g
      let m
      while ((m = re.exec(line)) !== null) {
        out.push({ inner: m[1], start: offset + m.index + 2, end: offset + m.index + 2 + m[1].length, line: i + 1 })
      }
    }
    offset += line.length + 1
  }
  return out
}

// wikilink 重写会改动页面内容，若触带 sha256 字段的文件需重打标（kb_mark 管辖，归终审）。
/**
 * 改写计划（对一份文本）：匹配到旧文件的链接 → 新目标（风格保持/捕获组回填/toBase 歧义降级）；
 * stem 歧义 → 不动+留痕（设计①）。返回 {text, changes, skipped, notes}。
 */
function planRewrite(text, ctx) {
  const edits = []
  const skipped = []
  const notes = []
  for (const link of scanLinks(text)) {
    const { target, suffix, lead } = parseInner(link.inner)
    if (target === '') continue
    const shape = parseTargetShape(target)
    if (shape.key === '') continue
    let match = false
    if (shape.form === 'path') {
      match = shape.key === ctx.oldKey
    } else if (shape.key === ctx.oldStem) {
      if (ctx.oldStemUnique) match = true
      else skipped.push({ line: link.line, target, reason: 'ambiguous-stem' })
    }
    if (!match) continue
    let newTarget
    if (shape.form === 'path' || ctx.newStemUnique) {
      // 设计③风格保持：裸名→裸名、路径→路径（wiki/ 锚定与 .md 后缀形保留）
      newTarget = shape.form === 'path'
        ? `${shape.hadWiki ? 'wiki/' : ''}${ctx.newKey}${shape.hadMd ? '.md' : ''}`
        : `${ctx.newStem}${shape.hadMd ? '.md' : ''}`
    } else {
      // 设计④toBase 不制造新歧义：新 stem 已被占 → 降级路径形 + 留痕
      newTarget = `${shape.hadWiki ? 'wiki/' : ''}${ctx.newKey}${shape.hadMd ? '.md' : ''}`
      notes.push(`toBase 新歧义：[[${target}]]（第 ${link.line} 行）降级为路径形 [[${newTarget}]]（${ctx.newStem} 已被占用）`)
    }
    const replacement = lead + newTarget + suffix
    if (replacement === link.inner) continue // 同形改写（纯移动的裸名链接）：no-op 不入编辑面
    edits.push({ start: link.start, end: link.end, text: replacement })
  }
  let out = text
  for (const e of edits.reverse()) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  return { text: out, changes: edits.length, skipped, notes }
}

// ── wiki 文件清单（walk 不跟 symlink 目录，与 validate.js collectMd 同款；供歧义判据与改写扫描） ──

function listWikiMd(root) {
  const out = []
  const base = path.join(root, 'wiki')
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && e.name.endsWith('.md')) out.push(p)
    }
  }
  walk(base)
  return out
    .map((p) => path.relative(root, p).split(path.sep).join('/'))
    .sort()
}

// ── journal 事务（多文件：快照/预算/逆放，T11 rolledBack 诚实口径）─────────────

/** 事务条目：{snap, written: Buffer|null（本事务写入的新内容）, deleted: bool} */
const entryOf = (snap) => ({ snap, written: null, deleted: false })

/**
 * 事务逆放（逆序逐条）：只逆放「我们确实改过且现状仍是我们写的样子」的条目——
 * 写后被并发改/删的项**跳过逆放+留痕**（绝不吞并发写，六坑③）；返回问题清单（空=整体回滚完成）。
 */
async function rollbackAll(entries, warnings) {
  const problems = []
  for (const e of [...entries].reverse()) {
    const rel = e.snap.file
    try {
      if (e.deleted) {
        let cur = null
        try { cur = await fs.promises.readFile(e.snap.file) } catch (err) { if (err?.code !== 'ENOENT') throw err }
        if (cur !== null) {
          if (e.snap.existed && cur.equals(e.snap.content)) continue // 已被并发还原为原状
          problems.push(`${rel} 删除后被并发重建，未逆放（保留并发内容）`)
          warnings.push(`回滚跳过：${rel} 删除后被并发重建（保留并发内容）`)
          continue
        }
        await journalRollback(e.snap) // 逆放复活源文件
        continue
      }
      if (e.written !== null) {
        let cur = null
        try { cur = await fs.promises.readFile(e.snap.file) } catch (err) { if (err?.code !== 'ENOENT') throw err }
        if (cur === null) {
          problems.push(`${rel} 本事务写入后被并发删除，未逆放`)
          warnings.push(`回滚跳过：${rel} 写后被并发删除`)
          continue
        }
        if (!cur.equals(e.written)) {
          problems.push(`${rel} 写后被并发修改，未逆放（保留并发内容）`)
          warnings.push(`回滚跳过：${rel} 写后被并发修改（保留并发内容）`)
          continue
        }
        await journalRollback(e.snap)
        continue
      }
      // 未动条目：零逆放项
    } catch (err) {
      problems.push(`${rel} 逆放失败（${err?.code ?? err?.message ?? err}）`)
    }
  }
  return problems
}

// ── wikiRead（函数面；工具名 wiki_read 归 kb-context——同层重复注册 throw，见报告 Ruling）──

/**
 * 围栏内读（vaultRoot 必传；任意 vault 相对路径，读侧不套 wiki 域限）。
 * @returns {Promise<{ok:true, file, content, warnings} | {ok:false, reason, message, warnings}>}
 */
export async function wikiRead(target, opts = {}) {
  if (typeof target !== 'string' || target.length === 0) {
    throw new TypeError('wikiRead: target 必须是非空字符串')
  }
  const warnings = []
  const v = checkVaultRoot(opts)
  if (!v.ok) return v
  const r = checkRel(target, warnings)
  if (!r.ok) return r
  const f = fence(v.root, r.rel, warnings, { mustExist: true })
  if (!f.ok) return f
  try {
    const content = await fs.promises.readFile(f.real, 'utf8')
    return { ok: true, file: r.rel, content, warnings }
  } catch (e) {
    return fail('io-error', `读取失败：${e?.code ?? e?.message ?? e}`, warnings)
  }
}

// ── wikiWrite ────────────────────────────────────────────────────────────────

/**
 * 写单页（默认只读；覆盖语义=显式 overwrite，缺省拒；围栏全链解引用；锁内写）。
 * @param {string} target vault 相对路径（wiki/ 域）
 * @param {string} content 内容（UTF-8 原样落盘）
 * @param {{vaultRoot: string, readOnly?: boolean, overwrite?: boolean}} [opts]
 * @returns {Promise<{ok:true, file, created, warnings} | {ok:false, reason, message, warnings}>}
 */
export async function wikiWrite(target, content, opts = {}) {
  if (typeof target !== 'string' || target.length === 0) {
    throw new TypeError('wikiWrite: target 必须是非空字符串')
  }
  if (typeof content !== 'string') {
    throw new TypeError('wikiWrite: content 必须是字符串')
  }
  const warnings = []
  const v = checkVaultRoot(opts)
  if (!v.ok) return v
  const r = checkRel(target, warnings)
  if (!r.ok) return r
  const d = checkWikiDomain(r.rel, warnings)
  if (!d.ok) return d
  const w = checkWritable(opts, warnings)
  if (!w.ok) return w
  const f = fence(v.root, r.rel, warnings)
  if (!f.ok) return f
  // 父目录必须存在（不自动建目录——写侧不制造意外目录树）
  const parent = path.dirname(f.real)
  let pst
  try {
    pst = await fs.promises.stat(parent)
  } catch {
    return fail('not-found', `父目录不存在（不自动建目录）：${path.dirname(r.rel)}`, warnings)
  }
  if (!pst.isDirectory()) return fail('not-found', `父路径不是目录：${path.dirname(r.rel)}`, warnings)
  const created = !f.exists
  if (f.exists && opts.overwrite !== true) {
    // 六坑④统一覆盖语义：缺省拒（静默覆盖反例）——快路径早拒
    return fail('target-exists', `目标已存在（显式 overwrite:true 才替换）：${r.rel}`, warnings)
  }
  const result = await withLeaseLock(f.real, async (meta) => {
    if (meta.tookOver) {
      warnings.push(`stale-lock-takeover：${r.rel}（陈旧 ${Math.round(meta.staleAgeMs)}ms，已接管）`)
    }
    // fix r1 #1：锁内重检覆盖门（与 writeAtomic 同锁=检查与写入原子）——堵「检查后、写入前」并发建目标被静默覆盖
    const gate = await overwriteGate(f.real, opts.overwrite)
    if (gate.rejected) return gate
    await writeAtomic(f.real, content)
    return { created: gate.created }
  }).catch((e) => e)
  if (result instanceof Error) {
    return fail('io-error', `写入失败：${result?.code ?? result?.message ?? result}`, warnings)
  }
  if (result?.rejected) {
    return fail('target-exists', `目标已存在（显式 overwrite:true 才替换）：${r.rel}`, warnings)
  }
  return { ok: true, file: r.rel, created: result.created ?? created, warnings }
}

// ── wikiDelete（.trash 可逆 + 双确认；INV-7 / OW-US-6）────────────────────────

/** trash 落点：`.trash/<rel>`；冲突 → 扩展名前插 `.N`（x.md → x.1.md；无扩展 → proj.1）防覆盖 */
function trashRelFor(rel, taken) {
  const ext = path.posix.extname(rel)
  const base = ext === '' ? rel : rel.slice(0, -ext.length)
  for (let n = 0; ; n++) {
    const cand = n === 0 ? `.trash/${rel}` : `.trash/${base}.${n}${ext}`
    if (!taken(cand)) return cand
  }
}

/**
 * 删除（文件或目录）→ `.trash/<rel>` 冲突改名防覆盖 + 双确认（confirm=目标路径复述）。
 * .trash 无法就位 → 拒（INV-7 反例：无 .trash 直接删必须拒——本操作零直接 rm 用户内容）。
 * @param {string} target vault 相对路径（wiki/ 域）
 * @param {{vaultRoot: string, readOnly?: boolean, confirm: string}} opts
 */
export async function wikiDelete(target, opts = {}) {
  if (typeof target !== 'string' || target.length === 0) {
    throw new TypeError('wikiDelete: target 必须是非空字符串')
  }
  if (opts?.confirm !== undefined && typeof opts.confirm !== 'string') {
    throw new TypeError('wikiDelete: confirm 必须是字符串（目标路径复述）')
  }
  const warnings = []
  const v = checkVaultRoot(opts)
  if (!v.ok) return v
  const r = checkRel(target, warnings)
  if (!r.ok) return r
  const d = checkWikiDomain(r.rel, warnings)
  if (!d.ok) return d
  const w = checkWritable(opts, warnings)
  if (!w.ok) return w
  // 双确认（INV-7）：confirm 值=目标路径复述，缺省/不符即拒（零副作用）
  if (opts?.confirm === undefined || opts.confirm === '') {
    return fail('confirm-required', '双确认缺失（INV-7）：confirm=目标路径复述才动手', warnings)
  }
  if (opts.confirm !== r.rel) {
    return fail('confirm-mismatch', `双确认不符（INV-7）：confirm 须复述目标路径 ${r.rel}`, warnings)
  }
  const f = fence(v.root, r.rel, warnings, { mustExist: true })
  if (!f.ok) return f
  // fix r1 #2：lstat 源路径自身（不解引用）——in-root symlink 源（link.md→real.md）照 stat(f.real) 解引用
  // 会判 real.md 是文件而放行 → rename(f.real) 移走真实页、源路径残留 dangling（违零空源残渣）。
  // 源节点非真实文件/目录（symlink/其他）即拒 not-a-file；真实目录仍可删（保留 .trash 目录特性）。
  const srcNode = await fs.promises.lstat(path.join(v.root, r.rel)).catch(() => null)
  if (srcNode === null || srcNode.isSymbolicLink() || (!srcNode.isFile() && !srcNode.isDirectory())) {
    return fail('not-a-file', `仅普通文件/目录可删（拒 symlink/其他，防源路径残渣）：${r.rel}`, warnings)
  }
  const kind = srcNode.isDirectory() ? 'directory' : 'file'
  // .trash 就位（失败=拒，绝不落到直接删）
  const trashDir = path.join(v.root, '.trash')
  try {
    await fs.promises.mkdir(trashDir, { recursive: true })
    const trashParentRel = path.posix.dirname(`.trash/${r.rel}`)
    if (trashParentRel !== '.') await fs.promises.mkdir(path.join(v.root, trashParentRel), { recursive: true })
  } catch (e) {
    return fail('io-error', `无法就位 .trash（拒绝直接删）：${e?.code ?? e?.message ?? e}`, warnings)
  }
  const taken = (cand) => fs.existsSync(path.join(v.root, cand))
  const trashRel = trashRelFor(r.rel, taken)
  if (trashRel !== `.trash/${r.rel}`) {
    warnings.push(`trash 冲突改名防覆盖：${r.rel} → ${trashRel}`)
  }
  const result = await withLeaseLock(f.real, async (meta) => {
    if (meta.tookOver) {
      warnings.push(`stale-lock-takeover：${r.rel}（陈旧 ${Math.round(meta.staleAgeMs)}ms，已接管）`)
    }
    await fs.promises.rename(f.real, path.join(v.root, trashRel))
    return true
  }).catch((e) => e)
  if (result instanceof Error) {
    return fail('io-error', `移入 .trash 失败：${result?.code ?? result?.message ?? result}`, warnings)
  }
  return { ok: true, file: r.rel, trashPath: trashRel, kind, warnings }
}

// ── wikiRename（改名/移动 = journal 多文件事务；OW-US-5 / OW-INV-4）────────────

const faultError = (stage) => {
  const e = new Error(`事务故障注入（测试缝）：${stage}`)
  e.reason = 'transaction-failed'
  return e
}

/**
 * 改名/移动（同操作：to 可跨目录）——多文件事务：改前 journal 快照 → 逐文件原子写+锁 →
 * wikilink 重写（四设计）→ INDEX 同事务 → 失败整体回滚（journal 逆放）。
 * 顺序=先落目标副本 → 改写链接 → 最后删源（六坑⑥零断链窗口+不留空源残渣）。
 * 仅 .md 页（零断链承诺的范围）；目录改名拒（not-a-file，扩展面见报告边界）。
 * @param {string} from 源（vault 相对，wiki/ 域）
 * @param {string} to 目标（vault 相对，wiki/ 域；可跨目录=移动）
 * @param {{vaultRoot: string, readOnly?: boolean, overwrite?: boolean, dryRun?: boolean,
 *          journalMaxBytes?: number, _failAt?: string, _beforeApply?: () => Promise<void>|void}} [opts]
 */
export async function wikiRename(from, to, opts = {}) {
  if (typeof from !== 'string' || from.length === 0) {
    throw new TypeError('wikiRename: from 必须是非空字符串')
  }
  if (typeof to !== 'string' || to.length === 0) {
    throw new TypeError('wikiRename: to 必须是非空字符串')
  }
  const warnings = []
  const v = checkVaultRoot(opts)
  if (!v.ok) return v
  const rf = checkRel(from, warnings)
  if (!rf.ok) return rf
  const rt = checkRel(to, warnings)
  if (!rt.ok) return rt
  const d1 = checkWikiDomain(rf.rel, warnings)
  if (!d1.ok) return d1
  const d2 = checkWikiDomain(rt.rel, warnings)
  if (!d2.ok) return d2
  const w = checkWritable(opts)
  if (!w.ok) return { ...w, from: rf.rel, to: rt.rel }
  if (rf.rel === rt.rel) {
    return fail('same-path', `from 与 to 相同：${rf.rel}`, warnings, { from: rf.rel, to: rt.rel })
  }
  // 围栏 + 语义校验
  const ff = fence(v.root, rf.rel, warnings, { mustExist: true })
  if (!ff.ok) return { ...ff, from: rf.rel, to: rt.rel }
  // fix r1 #2：lstat 源路径自身（不解引用）——in-root symlink 源（link.md→real.md）照 stat(ff.real) 解引用
  // 判 real.md 是文件而放行 → 后续 rm(ff.real) 删真实页、源路径残留 dangling + oldKey 取自请求名致 [[real]] 断链。
  // 源节点非普通 .md 文件（symlink/目录/其他）即拒 not-a-file（正是「仅 .md 页」门本意）。
  const srcNode = await fs.promises.lstat(path.join(v.root, rf.rel)).catch(() => null)
  if (srcNode === null || !srcNode.isFile() || !rf.rel.endsWith('.md')) {
    return fail('not-a-file', `仅 .md 普通文件页支持改名/移动（拒 symlink/目录/其他；零断链承诺范围）：${rf.rel}`, warnings, { from: rf.rel, to: rt.rel })
  }
  const tf = fence(v.root, rt.rel, warnings)
  if (!tf.ok) return { ...tf, from: rf.rel, to: rt.rel }
  if (tf.exists) {
    if (opts.overwrite !== true) {
      // 六坑④：rename 前查目标存在——缺省拒（防静默覆盖同名）
      return fail('target-exists', `目标已存在（显式 overwrite:true 才替换）：${rt.rel}`, warnings, { from: rf.rel, to: rt.rel })
    }
    const toStat = await fs.promises.stat(tf.real)
    if (toStat.isDirectory()) {
      return fail('target-exists', `目标为目录，不覆盖：${rt.rel}`, warnings, { from: rf.rel, to: rt.rel })
    }
  }
  const toParent = path.join(v.root, path.posix.dirname(rt.rel))
  let tpStat
  try {
    tpStat = await fs.promises.stat(toParent)
  } catch {
    return fail('not-found', `目标父目录不存在（不自动建目录）：${path.posix.dirname(rt.rel)}`, warnings, { from: rf.rel, to: rt.rel })
  }
  if (!tpStat.isDirectory()) {
    return fail('not-found', `目标父路径不是目录：${path.posix.dirname(rt.rel)}`, warnings, { from: rf.rel, to: rt.rel })
  }

  // ── 计划：歧义判据 + 全库（wiki 域）链接扫描 + 逐文件改写计划 ──
  const oldKey = rf.rel.slice('wiki/'.length, -'.md'.length)
  const oldStem = path.posix.basename(oldKey)
  const newKey = rt.rel.slice('wiki/'.length, -'.md'.length)
  const newStem = path.posix.basename(newKey)
  const allMd = listWikiMd(v.root)
  const oldStemUnique = allMd.filter((rel) => path.posix.basename(rel) === `${oldStem}.md` && rel !== rf.rel).length === 0
  const newStemUnique = allMd.filter((rel) => path.posix.basename(rel) === `${newStem}.md` && rel !== rt.rel && rel !== rf.rel).length === 0
  const ctxPlan = { oldKey, oldStem, oldStemUnique, newKey, newStem, newStemUnique }

  // 源内容（含自指改写，随移动文件走）
  const fromBuf = await fs.promises.readFile(ff.real)
  const selfPlan = planRewrite(fromBuf.toString('utf8'), ctxPlan)

  // 扫描 wiki 域全部 .md（源/目标除外）：改写计划（INDEX.md 同在扫描面=INDEX 同事务）
  const rewrites = []
  const skipped = []
  const planNotes = []
  for (const rel of allMd) {
    if (rel === rf.rel || rel === rt.rel) continue
    const abs = path.join(v.root, rel)
    const g = realpathGuard(v.root, rel)
    if (!g.ok || !g.exists) {
      warnings.push(`跳过不可围栏文件（未改写）：${rel}（${g.ok ? 'not-found' : g.reason}）`)
      continue
    }
    const cur = await fs.promises.readFile(g.real, 'utf8')
    const plan = planRewrite(cur, ctxPlan)
    if (plan.changes === 0 && plan.skipped.length === 0) continue
    for (const s of plan.skipped) skipped.push({ file: rel, ...s })
    for (const n of plan.notes) planNotes.push(`${rel}：${n}`)
    if (plan.changes > 0) rewrites.push({ rel, abs: g.real, before: cur, after: plan.text, changes: plan.changes })
  }
  for (const s of selfPlan.skipped) skipped.push({ file: rf.rel, ...s })
  for (const n of selfPlan.notes) planNotes.push(`${rf.rel}：${n}`)
  if (planNotes.length > 0 || skipped.length > 0) {
    for (const s of skipped) {
      warnings.push(`歧义不动：${s.file} 第 ${s.line} 行 [[${s.target}]]（stem 多命中，返回不动+留痕）`)
    }
    for (const n of planNotes) warnings.push(n)
  }

  const planned = rewrites.map((x) => ({ file: x.rel, changes: x.changes }))
  if (opts.dryRun === true) {
    // R19 dry-run：计划可见、零写盘（快照可逆的预览面）
    warnings.push('改写范围=wiki/ 域；wiki/ 外引用未扫描未改写')
    return {
      ok: true, dryRun: true, from: rf.rel, to: rt.rel,
      planned, skipped,
      wouldMove: { from: rf.rel, to: rt.rel, selfChanges: selfPlan.changes },
      warnings,
    }
  }

  // ── journal 快照（改前全量；stat 先行 + 预算——超限拒事务留痕，零写盘） ──
  const journalMaxBytes = Number.isFinite(opts.journalMaxBytes) && opts.journalMaxBytes > 0
    ? opts.journalMaxBytes
    : DEFAULT_JOURNAL_MAX_BYTES
  const participants = [ff.real, tf.real, ...rewrites.map((x) => x.abs)]
  let budget = journalMaxBytes
  for (const p of participants) {
    let size = 0
    try {
      size = (await fs.promises.stat(p)).size
    } catch (e) {
      if (e?.code !== 'ENOENT') {
        return fail('io-error', `快照前 stat 失败（未写盘、无逆放发生）：${e?.code ?? e?.message ?? e}`, warnings, {
          from: rf.rel, to: rt.rel, rolledBack: false,
        })
      }
    }
    budget -= size
    if (budget < 0) {
      warnings.push(`journal-limit：事务快照总量超上限 ${journalMaxBytes} 字节（大文件/目录事务显式策略）`)
      return fail('journal-limit', `journal 快照总量超上限 ${journalMaxBytes} 字节：事务拒（未写盘、无逆放发生）`, warnings, {
        from: rf.rel, to: rt.rel, rolledBack: false,
      })
    }
  }
  const snapOf = new Map()
  for (const p of participants) {
    try {
      snapOf.set(p, await journalSave(p))
    } catch (e) {
      return fail('io-error', `改前快照失败（未写盘、无逆放发生）：${e?.code ?? e?.message ?? e}`, warnings, {
        from: rf.rel, to: rt.rel, rolledBack: false,
      })
    }
  }

  // ── 动手（事务）：①目标副本（含自指改写）→ ②逐文件锁内 RMW 改写（含 INDEX）→ ③最后删源 ──
  // 测试缝 _beforeApply：快照后、动手前回调（并发反例在此做真实写盘——检测逻辑全程真验真文件）
  if (typeof opts._beforeApply === 'function') await opts._beforeApply()
  const entries = []
  const entryFor = (abs) => {
    const e = entryOf(snapOf.get(abs))
    entries.push(e)
    return e
  }
  const failTx = async (err) => {
    const mutated = entries.some((e) => e.deleted || e.written !== null)
    const problems = await rollbackAll(entries, warnings)
    const prefix = `${err?.message ?? err}`
    warnings.push(`事务中止（${err?.reason ?? 'transaction-failed'}）：${prefix}`) // 冲突/故障必留痕（INV-15）
    if (!mutated) {
      // T11 rolledBack 口径（消费面确认）：pre-write 失败 = 未写盘、无逆放发生
      return fail(err?.reason ?? 'transaction-failed', `${prefix}；未写盘、无逆放发生`, warnings, {
        from: rf.rel, to: rt.rel, rolledBack: false,
      })
    }
    const rolledBack = problems.length === 0
    const note = rolledBack
      ? '已整体逆放还原'
      : `逆放未完全（${problems.join('；')}），文件可能处于中间态需人工核对`
    return fail(err?.reason ?? 'transaction-failed', `${prefix}；${note}`, warnings, {
      from: rf.rel, to: rt.rel, rolledBack,
    })
  }

  try {
    // ① 目标副本（零断链窗口：改写前新名已在场）——fix r1 #1：写入进 withLeaseLock(tf.real)，
    //    锁内重检覆盖门（与写入原子，堵『检查后写入前』并发建目标被静默覆盖）+ fresh 快照
    //    （回滚面同步受锁：还原真实写前态，绝不把并发者文件逆放成『不存在』——(b) 坑）。
    const destWrite = await withLeaseLock(tf.real, async (meta) => {
      if (meta.tookOver) {
        warnings.push(`stale-lock-takeover：${rt.rel}（陈旧 ${Math.round(meta.staleAgeMs)}ms，已接管）`)
      }
      const gate = await overwriteGate(tf.real, opts.overwrite)
      if (gate.rejected) return gate // overwrite:false 且锁内存在即拒（pre-write 面）
      const e = entryFor(tf.real) // 写入面才进 entries（拒绝面零回滚项）
      e.snap = await journalSave(tf.real) // 锁内 fresh 快照=回滚基（覆盖前真实内容）
      await writeAtomic(tf.real, selfPlan.text)
      e.written = Buffer.from(selfPlan.text, 'utf8')
      return { ok: true }
    })
    if (destWrite?.rejected) {
      const err = new Error(`目标已存在（显式 overwrite:true 才替换）：${rt.rel}`)
      err.reason = 'target-exists'
      throw err // pre-write：failTx → rolledBack:false「未写盘、无逆放发生」
    }
    if (opts._failAt === 'after-dest') throw faultError('after-dest')

    // ② 逐文件锁内 RMW（六坑③：锁内读新鲜内容——快照后被改=冲突中止，绝不吞并发写）
    for (const rw of rewrites) {
      const e = entryFor(rw.abs)
      await withLeaseLock(rw.abs, async (meta) => {
        if (meta.tookOver) {
          warnings.push(`stale-lock-takeover：${rw.rel}（陈旧 ${Math.round(meta.staleAgeMs)}ms，已接管）`)
        }
        const fresh = await fs.promises.readFile(rw.abs)
        if (!fresh.equals(Buffer.from(rw.before, 'utf8'))) {
          const err = new Error(`并发修改检测：${rw.rel} 快照后被改写，中止事务`)
          err.reason = 'concurrent-modification'
          throw err
        }
        await writeAtomic(rw.abs, rw.after)
        e.written = Buffer.from(rw.after, 'utf8')
      })
      if (opts._failAt === `after-rewrite:${rw.rel}`) throw faultError(`after-rewrite:${rw.rel}`)
    }

    // ③ 删源（改写后删源=六坑⑥；删前核对源未被并发改）
    const srcEntry = entryFor(ff.real)
    if (opts._failAt === 'before-delete') throw faultError('before-delete')
    await withLeaseLock(ff.real, async (meta) => {
      if (meta.tookOver) {
        warnings.push(`stale-lock-takeover：${rf.rel}（陈旧 ${Math.round(meta.staleAgeMs)}ms，已接管）`)
      }
      const fresh = await fs.promises.readFile(ff.real)
      if (!fresh.equals(fromBuf)) {
        const err = new Error(`并发修改检测：${rf.rel} 快照后被改写，中止事务`)
        err.reason = 'concurrent-modification'
        throw err
      }
      await fs.promises.rm(ff.real)
    })
    srcEntry.deleted = true
    if (opts._failAt === 'after-delete') throw faultError('after-delete')
  } catch (e) {
    return failTx(e)
  }

  warnings.push('改写范围=wiki/ 域；wiki/ 外引用未扫描未改写')
  return {
    ok: true,
    from: rf.rel,
    to: rt.rel,
    moved: true,
    selfChanges: selfPlan.changes,
    rewritten: planned,
    skipped,
    warnings,
  }
}
