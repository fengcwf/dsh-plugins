// vault-ops — vault 读写/改名/移动/删除/导出（T2 = 读侧；T4-T7/T12 叠加写侧）
// 契约（delta-specs/obsidian-web.md §2）：
//   - 保存 save(path, content, {expectedMtime|etag}) → 成功 | {conflict, diffUndo}（OW-INV-3 乐观锁）
//   - 改名/移动 rename(from, to, {overwrite?}) → journal 事务 {ok, rolledBack, warnings}（OW-INV-4）
//   - 删除走 .trash 可逆 + 双确认（OW-INV-5）；下载 zip ≤5000 文件/500MB 超限拒（OW-INV-9）
// 写安全（T4+）：一律 @deepseek-ai/dsh-atomic-write（writeFileAtomic + withFileLock，fs-safe 语义内建）。
// 路径围栏：本卡=相对路径 + 拒 '..'/绝对路径/NUL + resolve 后越界拒（OW-INV-7 前置）；
//          realpath 拒 symlink 逃逸归 T12 与围栏终态合流。
// T2 读侧契约（形状锁定=前端 wire 契约，test/vault-ops.test.mjs 锁形）：
//   listTree(root)            → {root, nodes}    node: {name, path, type, children?}（目录优先字典序）
//   readNote(root, relPath)   → {path, content, mtime, etag, size}   etag=size-mtime（乐观锁前置）
//   scanBacklinks(root, path) → {path, backlinks:[{path, line, text}]}（占位级扫描，T11 索引化后替换）
import fs from 'node:fs'
import path from 'node:path'

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function assertRelPath(relPath) {
  if (typeof relPath !== 'string' || relPath === '') throw fail('bad_request', 'path 参数缺失')
  if (relPath.includes('\0')) throw fail('bad_request', 'path 含非法字符')
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) throw fail('bad_request', 'path 必须是 vault 内相对路径')
  if (relPath.split('/').some((seg) => seg === '..')) throw fail('bad_request', 'path 拒绝穿越')
}

function resolveInRoot(root, relPath) {
  assertRelPath(relPath)
  const base = path.resolve(root)
  const abs = path.resolve(base, relPath)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw fail('bad_request', 'path 越出 vaultRoot')
  return abs
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
export function readNote(root, relPath) {
  const abs = resolveInRoot(root, relPath)
  const stat = statOrThrow(abs, relPath)
  if (!stat.isFile()) throw fail('not_found', `不是文件：${relPath}`)
  const content = fs.readFileSync(abs, 'utf8')
  const size = Buffer.byteLength(content, 'utf8')
  const mtime = stat.mtimeMs
  return { path: relPath, content, mtime, etag: `${size}-${mtime}`, size }
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

function collectMarkdownFiles(root) {
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
      else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) out.push(childRel)
    }
  }
  walk(path.resolve(root), '')
  return out.sort()
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
