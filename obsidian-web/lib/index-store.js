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
 * 打开/建库（幂等；目录缺失自建）。
 * @param {{vaultRoot: string, dir?: string}} dir 缺省 `<vaultRoot>/.ob-index`
 * @returns store 句柄（node:sqlite 同步 API；close() 收敛）
 */
export function createIndexStore({ vaultRoot, dir } = {}) {
  if (typeof vaultRoot !== 'string' || vaultRoot === '') throw new Error('vaultRoot 参数缺失')
  const rootAbs = path.resolve(vaultRoot)
  const dirAbs = dir === undefined ? path.join(rootAbs, '.ob-index') : path.resolve(dir)
  fs.mkdirSync(dirAbs, { recursive: true })
  const dbPath = path.join(dirAbs, 'index.db')
  const db = new DatabaseSync(dbPath)
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
    upsertFile,
    upsertFiles,
    removeFile,
    removeTree,
    listDocs,
    matchCandidates,
    count,
    close: () => db.close(),
  }
}
