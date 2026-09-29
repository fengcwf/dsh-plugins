// index-store — 索引库（T11 / OW-US-11）：node:sqlite FTS5（trigram tokenizer）展示索引。
// ARC-2：sqlite 仅展示索引——可随时全量重建，非权威数据源。落点（0.1.1 迁出 CIFS，fix-boot-lock）：
//   `<indexDir>/<vaultDirName>/`（多 vault 档案各一库），indexDir 缺省 `~/.dsh/cache/obsidian-web/`
//   （本地盘）；旧落点 `<vaultRoot>/.ob-index/`（0.1.1 前）仅剩检测留痕（index-service），绝不静默删除。
//   根因实证（fix-boot-lock-report E1-E10）：vault 落 CIFS（nounix,mapposix）时 SMB per-handle 字节锁
//   把 SQLite 同 fd 锁升级判自身冲突（EACCES→SQLITE_BUSY）——该挂载任何 SQLite 写恒失败，
//   索引库必须落本地盘；busy_timeout/fail-open/自愈照旧保留（双保险，见下）。
// 库形（TECH §2.2「schema 同 kb-context 口径」独立实现，差异表见 task-11-report）：
//   docs(id, path UNIQUE, title, size, mtime_ms, content) + docs_fts(title, body, tokenize='trigram')
//   + meta(rule_fingerprint)——规则指纹变更=清库重建（kb-context FTS_RULE_FINGERPRINT 同款语义，doc 级）。
//   选型=独立 content 的 fts5 表 + 显式 RMW（delete+insert），不走 external content+triggers
//   （kb-context 实测坑：external content 的 'delete' 必须传 OLD 原文，否则静默残留索引行）。
// 查询编译（compileQuery plan → FTS MATCH / LIKE，查询串转义义务=M4/ERR-004 防炸）：
//   fts 词面 → 逐词加引号（内部 " 加倍转义）后 AND 连接进 MATCH；like 词面 → SQL LIKE（\ % _ 转义）。
//   A4 路由修复后 like 词面（2 字盲区/纯符号）生产可达本路径——下推安全门=SQL ≡ regex /i
//   可证明等价才准下推（likePatterns/sqlExactChars，含非 ASCII 大小写词面一律拒下推走 scan）
//   + (title|content) 双列；命中行/AND 语义由 search.matchDocs 终审，绝不由 SQL 单独裁决。
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { deriveTitle } from './search.js'

export const FTS_RULE_FINGERPRINT = 'fts5/trigram/doc-level/v1'

// ── 索引库落点解析（单一来源，0.1.1 迁出 CIFS）──────────────────────────────────────
// Config.indexDir（字符串）= 索引库基目录；缺省/空串/纯空白 → 出厂默认 `~/.dsh/cache/obsidian-web/`
//   （本地盘；`~`/`~/` 前缀按 os.homedir() 展开，其余 path.resolve）。
// 每 vault 一库：`<indexDir>/<vaultDirName(vaultRoot)>/`——安全名（basename 净化，仅 [A-Za-z0-9._-]）
//   + vaultRoot sha256 前 16 位（防撞名：同名 vault 落不同目录，多 vault 档案各一库）。
// 显式 dir = 全落点覆盖（测试缝/特殊部署），优先级 dir > indexDir > 出厂默认。
export const DEFAULT_INDEX_DIR_BASE = '~/.dsh/cache/obsidian-web'
export const LEGACY_INDEX_DIR_NAME = '.ob-index' // 旧落点目录名（0.1.1 前 <vaultRoot>/.ob-index/）

/** indexDir 基目录展开：空/缺省→出厂默认；`~`/`~/`→os.homedir()；其余绝对化 */
export function expandIndexDirBase(indexDir) {
  const raw = typeof indexDir === 'string' ? indexDir.trim() : ''
  const base = raw === '' ? DEFAULT_INDEX_DIR_BASE : raw
  if (base === '~') return os.homedir()
  if (base.startsWith('~/')) return path.join(os.homedir(), base.slice(2))
  return path.resolve(base)
}

/** 每 vault 子目录名：安全名（净化 basename，空→'vault'，截 32）+ sha256(rootAbs) 前 16 位（防撞名） */
export function vaultIndexDirName(vaultRootAbs) {
  const safe = path.basename(vaultRootAbs).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 32) || 'vault'
  const hash = crypto.createHash('sha256').update(vaultRootAbs).digest('hex').slice(0, 16)
  return `${safe}-${hash}`
}

/** 索引库落点解析（service/store 共用单一来源）：dir > indexDir > 出厂默认 */
export function resolveIndexDir({ vaultRoot, indexDir, dir } = {}) {
  if (typeof vaultRoot !== 'string' || vaultRoot === '') throw new Error('vaultRoot 参数缺失')
  const rootAbs = path.resolve(vaultRoot)
  if (dir !== undefined) return path.resolve(dir)
  return path.join(expandIndexDirBase(indexDir), vaultIndexDirName(rootAbs))
}

// ── 开库自愈（fix-boot-lock）────────────────────────────────────────────────────────
// node:sqlite 默认 busy_timeout=0：锁竞争下写事务立即 SQLITE_BUSY（"database is locked"）。
// 开库纪律：①PRAGMA busy_timeout 正等待 ②小退避重试（指数退避，仅锁类错误重试）——瞬时锁竞争
//   （他进程持锁/并发开库）自愈。⚠️ 根因实证（2026-09-28 boot 失败，报告 fix-boot-lock-report）：
//   vault 落 CIFS（nounix,mapposix）挂载时，SMB per-handle 字节锁把 SQLite 同 fd 锁升级
//   （F_WRLCK 覆盖同 fd 已持 F_RDLCK 同区间）判冲突 EACCES→SQLITE_BUSY——该环境任何 SQLite 写
//   （含建库 SCHEMA）恒失败，busy_timeout/重试只对「真锁竞争」自愈；挂载锁语义故障由上层
//   fail-open（index-service degraded）兜底，绝不炸插件装载。
export const DEFAULT_BUSY_TIMEOUT_MS = 500
export const DEFAULT_OPEN_ATTEMPTS = 2
export const DEFAULT_RETRY_DELAY_MS = 50

/** 同步小退避（Atomics.wait——开库是同步面，不得引入异步时序） */
function sleepSync(ms) {
  if (!(ms > 0)) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** 锁类错误（可重试）：SQLITE_BUSY(5)/SQLITE_LOCKED(6) 语义——其余错误立即上抛不重试 */
function isLockError(err) {
  if (err?.errcode === 5 || err?.errcode === 6) return true
  return /locked|busy/i.test(String(err?.message ?? ''))
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  content TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(title, body, tokenize='trigram');
`

/** LIKE 词面转义（\ % _ 前加反斜杠；配合 ESCAPE '\'）——防词面通配符炸查询语义 */
function likeEscape(text) {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`)
}

function likeParam(text) {
  return `%${likeEscape(text)}%`
}

/** FTS5 MATCH 词面：逐词加引号（内部 " 加倍）——防符号/关键字炸 MATCH 语法（ERR-004 同类） */
function matchExpr(ftsTerms) {
  return ftsTerms.map((t) => `"${t.text.replace(/"/g, '""')}"`).join(' AND ')
}

// ── LIKE/MATCH 词面下推安全门（A4：SQL 预过滤必须 ≡ scan 后端 regex /i 才准下推）──────────
// SQLite LIKE 的大小写折叠=ASCII-only（非 ASCII 走字节精确比较）；matchFile 的 regex /i 走 JS
//   Canonicalize（toUpperCase 单字符 + 「非 ASCII→ASCII 不折叠」特例——实测 U+212A KELVIN SIGN
//   与 U+017F LONG S 在 /i 下与 k/s **互不折叠**，与 LIKE 行为一致）。
//   可证明「SQL ≡ /i」的词面（准下推）：① 全 ASCII——LIKE 原生 ASCII 折叠 ≡ /i；
//   ② 非 ASCII 但**无大小写**字符（CJK 等）——字节精确 ≡ /i 自匹配。
//   词面含「非 ASCII 且有大小写」字符（Ä/ä、Σ/σ/ς 三元类、К/к…）→ SQL 侧无法枚举 JS 折叠类
//   （lower/upper 取不全，如 Σ/σ/ς），下推会**窄化召回** → 返回 null 拒下推，上层 canHandle
//   拒 → scan 兜底（既有语义原样保持，绝不静默窄化召回）。
//   命中行/AND 语义仍由 search.matchDocs 终审（预过滤只允许等价/超集，绝不允许窄化）。
function sqlExactChars(text) {
  const chars = [...String(text)]
  if (chars.length === 0) return false // 空词面拒（防 %% 全表下推；compileQuery 已保证 token 非空，此处防御）
  for (const ch of chars) {
    if (ch.codePointAt(0) < 0x80) continue // ASCII：LIKE/MATCH 原生折叠 ≡ /i
    if (ch.toLowerCase() !== ch || ch.toUpperCase() !== ch) return false // 非 ASCII 有大小写：不可证明等价
  }
  return true
}

/** LIKE 词面 pattern（纯函数）：[text]=可证明等价单 pattern；null=不可安全下推（上层走 scan 兜底） */
export function likePatterns(text) {
  return sqlExactChars(text) ? [String(text)] : null
}

/**
 * A4 盲区/词面可安全窄化判定（纯函数、零副作用——路由期调用）：plan 全部词面 SQL 语义
 * ≡ regex /i 才接（含 fts 词面——MATCH 的 ASCII 折叠同样只在可证明等价面内下推）。
 */
export function canPrefilterPlan(plan) {
  const terms = Array.isArray(plan?.terms) ? plan.terms : []
  return terms.length > 0 && terms.every((t) => sqlExactChars(t.text))
}

/**
 * 打开/建库（幂等；目录缺失自建）——锁竞争自愈：busy_timeout pragma 正等待 + 小退避重试（指数）。
 * @param {{vaultRoot: string, indexDir?: string, dir?: string, busyTimeoutMs?: number,
 *          openAttempts?: number, retryDelayMs?: number}} 落点解析见 resolveIndexDir（dir>indexDir>默认）
 * @returns store 句柄（node:sqlite 同步 API；close() 收敛）
 */
export function createIndexStore({
  vaultRoot,
  indexDir,
  dir,
  busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS,
  openAttempts = DEFAULT_OPEN_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  if (typeof vaultRoot !== 'string' || vaultRoot === '') throw new Error('vaultRoot 参数缺失')
  const rootAbs = path.resolve(vaultRoot)
  const dirAbs = resolveIndexDir({ vaultRoot: rootAbs, indexDir, dir })
  fs.mkdirSync(dirAbs, { recursive: true })
  const dbPath = path.join(dirAbs, 'index.db')
  const attempts = Math.max(1, Math.floor(openAttempts))
  const backoffMs = Math.max(0, Math.floor(retryDelayMs))
  const busyMs = Number.isFinite(busyTimeoutMs) ? Math.max(0, Math.floor(busyTimeoutMs)) : DEFAULT_BUSY_TIMEOUT_MS
  for (let attempt = 1; ; attempt += 1) {
    try {
      return openOnce({ rootAbs, dirAbs, dbPath, busyMs })
    } catch (err) {
      if (!isLockError(err) || attempt >= attempts) throw err
      sleepSync(backoffMs * 2 ** (attempt - 1)) // 小退避（指数）——瞬时锁竞争自愈；只重试锁类错误
    }
  }
}

/** 单次开库：busy_timeout pragma → SCHEMA → 规则指纹核 → 预编译语句；任一步失败关连接（重试干净起步） */
function openOnce({ rootAbs, dirAbs, dbPath, busyMs }) {
  const db = new DatabaseSync(dbPath)
  try {
    db.exec(`PRAGMA busy_timeout = ${busyMs}`)
    db.exec(SCHEMA)
  // 规则指纹核（tokenizer/规则版本变了 → 清库重建，绝不新旧口径混跑）
  let rebuilt = false
  const fp = db.prepare("SELECT value FROM meta WHERE key = 'rule_fingerprint'").get()
  if (fp?.value !== FTS_RULE_FINGERPRINT) {
    db.exec('BEGIN')
    try {
      db.exec('DELETE FROM docs_fts; DELETE FROM docs;')
      db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('rule_fingerprint', ?)").run(FTS_RULE_FINGERPRINT)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    rebuilt = true
  }

  function withTx(body) {
    db.exec('BEGIN')
    try {
      const out = body()
      db.exec('COMMIT')
      return out
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  // 预编译语句（热路径：逐文件 upsert 千页级调用，杜绝逐次 prepare）
  const stmt = {
    selectId: db.prepare('SELECT id FROM docs WHERE path = ?'),
    updateDoc: db.prepare('UPDATE docs SET title = ?, size = ?, mtime_ms = ?, content = ? WHERE id = ?'),
    insertDoc: db.prepare('INSERT INTO docs(path, title, size, mtime_ms, content) VALUES(?, ?, ?, ?, ?)'),
    insertFts: db.prepare('INSERT INTO docs_fts(rowid, title, body) VALUES(?, ?, ?)'),
    deleteFts: db.prepare('DELETE FROM docs_fts WHERE rowid = ?'),
    deleteDoc: db.prepare('DELETE FROM docs WHERE id = ?'),
  }

  /** 单条 upsert（无事务——批量走 upsertFiles 一事务一批：千页对账 COMMIT 双 fsync 是冷建大头） */
  function upsertOne(rel, content, stat) {
    const text = String(content)
    const { title } = deriveTitle(text, rel)
    const size = stat?.size ?? Buffer.byteLength(text, 'utf8')
    const mtimeMs = stat?.mtimeMs ?? Date.now()
    const row = stmt.selectId.get(rel)
    if (row !== undefined) {
      stmt.updateDoc.run(title, size, mtimeMs, text, row.id)
      stmt.deleteFts.run(row.id)
      stmt.insertFts.run(row.id, title, text)
      return row.id
    }
    const info = stmt.insertDoc.run(rel, title, size, mtimeMs, text)
    const id = Number(info.lastInsertRowid)
    stmt.insertFts.run(id, title, text)
    return id
  }

  function upsertFile(rel, content, stat) {
    return withTx(() => upsertOne(rel, content, stat))
  }

  /** 批量 upsert（一事务一批——对账分批路径；entries=[{rel, content, stat}]） */
  function upsertFiles(entries) {
    return withTx(() => entries.map((e) => upsertOne(e.rel, e.content, e.stat)))
  }

  function removeFile(rel) {
    return withTx(() => {
      const row = stmt.selectId.get(rel)
      if (row === undefined) return 0
      stmt.deleteFts.run(row.id)
      stmt.deleteDoc.run(row.id)
      return 1
    })
  }

  /** 子树出索引（目录删除事件）：path=rel 或 rel 前缀下任意段（LIKE 转义防词面通配） */
  function removeTree(rel) {
    return withTx(() => {
      const rows = db.prepare('SELECT id FROM docs WHERE path = ? OR path LIKE ? ESCAPE \'\\\'')
        .all(rel, `${likeEscape(rel)}/%`)
      for (const row of rows) {
        stmt.deleteFts.run(row.id)
        stmt.deleteDoc.run(row.id)
      }
      return rows.length
    })
  }

  function listDocs() {
    const out = new Map()
    for (const row of db.prepare('SELECT path, size, mtime_ms FROM docs').all()) {
      out.set(row.path, { size: row.size, mtimeMs: row.mtime_ms })
    }
    return out
  }

  /** 全量内容快照（A1 反链索引面）：{rel, content}[] 按 path 升序——backlink-index.replaceFromDocs 消费 */
  function listDocContents() {
    return db.prepare('SELECT path, content FROM docs ORDER BY path').all()
      .map((row) => ({ rel: row.path, content: row.content }))
  }

  /**
   * compileQuery plan → FTS MATCH / LIKE 候选选择（文件级 AND 预过滤；终审=search.matchDocs）。
   * A4 盲区召回口径：like 词面走 (title|content) LIKE（title 列覆盖 basename 派生标题——
   *   matchFile 标题命中也在召回面）；下推安全门保证 SQL ≡ regex /i（绝不窄化召回）。
   * opts.after/limit = path keyset 分批（fts 后端批间让出+超时预算用；缺省=一次全量=旧行为）。
   */
  function matchCandidates(plan, { after = null, limit = null } = {}) {
    const ftsTerms = plan.terms.filter((t) => t.strategy === 'fts')
    const likeTerms = plan.terms.filter((t) => t.strategy === 'like')
    const where = []
    const params = []
    if (ftsTerms.length > 0) {
      where.push('id IN (SELECT rowid FROM docs_fts WHERE docs_fts MATCH ?)')
      params.push(matchExpr(ftsTerms))
    }
    for (const t of likeTerms) {
      const patterns = likePatterns(t.text)
      if (patterns === null) {
        // canHandle 已拒（路由期），此处防御：绝不静默窄化召回——上抛可解释错码，服务层走 scan 兜底
        throw Object.assign(new Error(`LIKE 词面不可安全下推（SQL 与 regex /i 折叠语义不可证明等价）：${t.text}`), { code: 'like_unbounded' })
      }
      const ors = []
      for (const p of patterns) {
        ors.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')")
        params.push(likeParam(p), likeParam(p))
      }
      where.push(ors.length === 1 ? ors[0] : `(${ors.join(' OR ')})`)
    }
    if (after !== null) {
      where.push('path > ?')
      params.push(after)
    }
    if (where.length === 0) return []
    const lim = limit === null ? null : Math.max(1, Math.floor(limit))
    let sql = `SELECT path, content FROM docs WHERE ${where.join(' AND ')} ORDER BY path`
    if (lim !== null) {
      sql += ' LIMIT ?'
      params.push(lim)
    }
    return db.prepare(sql).all(...params)
  }

  function count() {
    return Number(db.prepare('SELECT COUNT(*) AS n FROM docs').get().n)
  }

    return {
      vaultRoot: rootAbs,
      dir: dirAbs,
      dbPath,
      rebuilt,
      busyTimeoutMs: busyMs,
      upsertFile,
      upsertFiles,
      removeFile,
      removeTree,
      listDocs,
      listDocContents,
      matchCandidates,
      count,
      close: () => db.close(),
    }
  } catch (err) {
    try { db.close() } catch { /* 关闭失败不掩盖原错误（重试/上抛以原错误为准） */ }
    throw err
  }
}
