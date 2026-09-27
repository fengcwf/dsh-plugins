// index-store — 索引库（T11 / OW-US-11）：node:sqlite FTS5（trigram tokenizer）展示索引。
// ARC-2：sqlite 仅展示索引——持久化落 vault 文件系统 `<vaultRoot>/.ob-index/`（.ob-share/ 外独立目录，
//   dot 条目不出树/不出分享面/不入 walk；索引可随时全量重建，非权威数据源）。
// 库形（TECH §2.2「schema 同 kb-context 口径」独立实现，差异表见 task-11-report）：
//   docs(id, path UNIQUE, title, size, mtime_ms, content) + docs_fts(title, body, tokenize='trigram')
//   + meta(rule_fingerprint)——规则指纹变更=清库重建（kb-context FTS_RULE_FINGERPRINT 同款语义，doc 级）。
//   选型=独立 content 的 fts5 表 + 显式 RMW（delete+insert），不走 external content+triggers
//   （kb-context 实测坑：external content 的 'delete' 必须传 OLD 原文，否则静默残留索引行）。
// 查询编译（compileQuery plan → FTS MATCH / LIKE，查询串转义义务=M4/ERR-004 防炸）：
//   fts 词面 → 逐词加引号（内部 " 加倍转义）后 AND 连接进 MATCH；like 词面 → SQL LIKE（\ % _ 转义）。
//   LIKE 预过滤=ASCII 大小写折叠（非 ASCII 大小写对可能比 regex /i 窄——service 层结构性兜底保证
//   like 词面生产不可达本路径；命中行/AND 语义由 search.matchDocs 复核，绝不由 SQL 单独裁决）。
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { deriveTitle } from './search.js'

export const FTS_RULE_FINGERPRINT = 'fts5/trigram/doc-level/v1'

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

/**
 * 打开/建库（幂等；目录缺失自建）——锁竞争自愈：busy_timeout pragma 正等待 + 小退避重试（指数）。
 * @param {{vaultRoot: string, dir?: string, busyTimeoutMs?: number, openAttempts?: number,
 *          retryDelayMs?: number}} dir 缺省 `<vaultRoot>/.ob-index`
 * @returns store 句柄（node:sqlite 同步 API；close() 收敛）
 */
export function createIndexStore({
  vaultRoot,
  dir,
  busyTimeoutMs = DEFAULT_BUSY_TIMEOUT_MS,
  openAttempts = DEFAULT_OPEN_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  if (typeof vaultRoot !== 'string' || vaultRoot === '') throw new Error('vaultRoot 参数缺失')
  const rootAbs = path.resolve(vaultRoot)
  const dirAbs = dir === undefined ? path.join(rootAbs, '.ob-index') : path.resolve(dir)
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

  /** compileQuery plan → FTS MATCH / LIKE 候选选择（文件级 AND 预过滤；终审=search.matchDocs） */
  function matchCandidates(plan) {
    const ftsTerms = plan.terms.filter((t) => t.strategy === 'fts')
    const likeTerms = plan.terms.filter((t) => t.strategy === 'like')
    const where = []
    const params = []
    if (ftsTerms.length > 0) {
      where.push('id IN (SELECT rowid FROM docs_fts WHERE docs_fts MATCH ?)')
      params.push(matchExpr(ftsTerms))
    }
    for (const t of likeTerms) {
      where.push('content LIKE ? ESCAPE \'\\\'')
      params.push(likeParam(t.text))
    }
    if (where.length === 0) return []
    return db.prepare(`SELECT path, content FROM docs WHERE ${where.join(' AND ')} ORDER BY path`).all(...params)
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
      matchCandidates,
      count,
      close: () => db.close(),
    }
  } catch (err) {
    try { db.close() } catch { /* 关闭失败不掩盖原错误（重试/上抛以原错误为准） */ }
    throw err
  }
}
