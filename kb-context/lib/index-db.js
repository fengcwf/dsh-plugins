// index-db — kb-context 的 FTS5 索引层：建表/增量刷新/候选校验激活（T2）
// 职责边界：只管索引库（docs/chunks/chunks_fts + 元数据/范围注册）与增量；
// 查询编译归 lib/search.js（T3），本文件不做检索。
// ⚠️ FTS5 同步三雷（调研裁定 + 本机实测）：
//   ① 'delete' 命令必须传 OLD 原文——传空串会静默留下残留索引行（实测残留可 MATCH 命中）；
//   ② REPLACE/隐式 rowid 会换键——chunks.fts_rowid 是显式稳定代理键（content_rowid 对齐），
//      VACUUM 重排内部 rowid 也不受影响（R5）；
//   ③ 文件级 DELETE+INSERT 必须单事务——防重导入残留旧 FTS 行（R6）。
// ⚠️ 契约字面 content='chunk' 与表名 chunks 自相矛盾：实测该写法 CREATE 通过但
//   `('rebuild')` 迁移分支炸 `no such table: main.chunk`（/tmp/kbprobe 探针 2b），
//   故裁定 content='chunks'——external content 语义不变，rebuild 可用。
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

export const INDEX_SCHEMA_VERSION = 1
// tokenizer/规则版本指纹（TECH §8：索引元数据记录指纹，规则变了走迁移重建）
export const FTS_RULE_FINGERPRINT = 'fts5/trigram/ext-content:chunks.fts_rowid/v1'

// 分块参数（调研裁定 dhb861 行感知分块口径：800 字符/120 重叠/行号记 startLine/endLine）
export const CHUNK_MAX_CHARS = 800
export const CHUNK_OVERLAP_CHARS = 120

import { createHash } from 'node:crypto'

/**
 * body hash 口径（INV-13 与 wiki-ingest SHA256 三态同源）：sha256(文件体字节) 十六进制。
 * @param {Buffer|string} body Buffer 原样；字符串按 utf8 编码后哈希（测试/合成输入用）
 */
export function bodyHash(body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8')
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * SQLite trigram 分词的 JS 同口径实现（候选校验一致性对账用）。
 * 口径（fix round 1 探针实测 /tmp/kbprobe-t2fix1，Node v24.14.1 内置 SQLite）：
 * - 默认 trigram **折叠大小写**（等价 case_sensitive 0），且折叠**逐码点 1:1**——
 *   ⚠️ 整串 toLowerCase() 是结构性错误：İ(U+0130) 会扩散成 i+U+0307 两码点、滑窗整体错位；
 *   折叠语义下 İ 保持原码点（simple folding 只有全折叠映射，逐码点折叠不动它）。
 * - SQLite 折叠表与 JS toLowerCase 有两类系统性分歧（fix round 1 全码点逐项对账：
 *   1112063 码点零分歧，探针输出见 task-2-report.md fix 报告）：
 *   FOLD_REMAP：simple folding 专属映射（ς→σ、ſ→s、µ→μ、ͅ→ι、ϐ→β、ẛ→ṡ…，含 FFFE/FFFF→FFFD）；
 *   FOLD_KEEP：JS 会动而 SQLite 保持原码点（切罗基 Ꭰ-Ᏽ、格鲁吉亚 겐-Ჿ、Osage/Adlam/Vithkuqi/
 *   Old Hungarian 等 SQLite 折叠表未覆盖的大小写块 + 037F/0528 等特例）。
 * - 不足 3 字符 → 空集（短词盲区由 T3 LIKE 兜底）。
 */
const FOLD_REMAP = new Map([
  [0x00B5, 0x03BC],
  [0x017F, 0x0073],
  [0x0345, 0x03B9],
  [0x03C2, 0x03C3],
  [0x03D0, 0x03B2],
  [0x03D1, 0x03B8],
  [0x03D5, 0x03C6],
  [0x03D6, 0x03C0],
  [0x03F0, 0x03BA],
  [0x03F1, 0x03C1],
  [0x03F5, 0x03B5],
  [0x1E9B, 0x1E61],
  [0x1FBE, 0x03B9],
  [0xFFFE, 0xFFFD],
  [0xFFFF, 0xFFFD],
])
const FOLD_KEEP_RANGES = [
  [0x13A0, 0x13F5],
  [0x1C90, 0x1CBA],
  [0x1CBD, 0x1CBF],
  [0xA7AB, 0xA7AE],
  [0xA7B0, 0xA7B4],
  [0xA7C4, 0xA7C7],
  [0xA7CB, 0xA7CC],
  [0x104B0, 0x104D3],
  [0x10570, 0x1057A],
  [0x1057C, 0x1058A],
  [0x1058C, 0x10592],
  [0x10594, 0x10595],
  [0x10C80, 0x10CB2],
  [0x10D50, 0x10D65],
  [0x118A0, 0x118BF],
  [0x16E40, 0x16E5F],
  [0x16EA0, 0x16EB8],
  [0x1E900, 0x1E921],
]
const FOLD_KEEP_SINGLES = new Set([
  0x037F, 0x0528, 0x052A, 0x052C, 0x052E, 0x1C89, 0x2C2F, 0xA698,
  0xA69A, 0xA796, 0xA798, 0xA79A, 0xA79C, 0xA79E, 0xA7B6, 0xA7B8,
  0xA7BA, 0xA7BC, 0xA7BE, 0xA7C0, 0xA7C2, 0xA7C9, 0xA7CE, 0xA7D0,
  0xA7D2, 0xA7D4, 0xA7D6, 0xA7D8, 0xA7DA, 0xA7DC, 0xA7F5,
])

/** 单码点折叠（1:1 恒单码点）：与 SQLite fts5 折叠表实测对齐 */
function foldCodePoint(cp) {
  const remap = FOLD_REMAP.get(cp)
  if (remap !== undefined) return remap
  if (FOLD_KEEP_SINGLES.has(cp)) return cp
  for (const [lo, hi] of FOLD_KEEP_RANGES) {
    if (cp >= lo && cp <= hi) return cp
  }
  const lower = String.fromCodePoint(cp).toLowerCase()
  return [...lower].length === 1 ? lower.codePointAt(0) : cp // 扩散（İ）→ 保持原码点
}

export function trigramTerms(text) {
  const chars = [...String(text ?? '')].map((ch) => String.fromCodePoint(foldCodePoint(ch.codePointAt(0))))
  const terms = new Set()
  for (let i = 0; i + 3 <= chars.length; i++) terms.add(chars.slice(i, i + 3).join(''))
  return terms
}

/**
 * 行感知分块（调研口径 800 字符/120 重叠）：
 * - 整行贪心装箱，行号 1-based 记 startLine/endLine；相邻块行粒度重叠（回看 ≤overlapChars 的整行）；
 * - 单行超 maxChars → 硬切定长段（段内 startLine=endLine=该行号，段间不重叠，防死循环）；
 * - 重叠必须让 start 严格前进（ovStart ∈ (start, end]），否则超长相邻行会互相同块死循环；
 * - 尾随换行产生的空尾行不计入（不虚增 endLine）；空文本 → []。
 */
export function chunkText(text, opts = {}) {
  const maxChars = opts.maxChars ?? CHUNK_MAX_CHARS
  const overlapChars = opts.overlapChars ?? CHUNK_OVERLAP_CHARS
  if (text === '' || text == null) return []

  const lines = String(text).split('\n').map((t, i) => ({ text: t, n: i + 1 }))
  if (lines.length > 1 && lines[lines.length - 1].text === '') lines.pop() // 尾随 '\n'

  const chunks = []
  const push = (parts) => chunks.push({
    chunkIdx: chunks.length,
    startLine: parts[0].n,
    endLine: parts[parts.length - 1].n,
    content: parts.map((p) => p.text).join('\n'),
  })

  let start = 0
  while (start < lines.length) {
    // 贪心装箱（整行）
    let end = start
    let size = 0
    while (end < lines.length) {
      const add = (end > start ? 1 : 0) + lines[end].text.length
      if (end > start && size + add > maxChars) break
      size += add
      end++
      if (size >= maxChars) break
    }

    if (end === start + 1 && lines[start].text.length > maxChars) {
      // 超长单行硬切：定长段，start=end=该行号
      const s = lines[start].text
      for (let off = 0; off < s.length; off += maxChars) {
        const seg = s.slice(off, off + maxChars)
        chunks.push({
          chunkIdx: chunks.length,
          startLine: lines[start].n,
          endLine: lines[start].n,
          content: seg,
        })
      }
      start = end
      continue
    }

    push(lines.slice(start, end))
    // ⚠️ 末块触底即停：否则重叠游标会再排出一个只重复已覆盖内容的尾块（TDD 抓到的真 bug）
    if (end >= lines.length) break

    // 行粒度重叠：从块尾回看整行，累计 ≤overlapChars；至少留一行保证 start 前进
    let ovStart = end
    let acc = 0
    for (let i = end - 1; i > start; i--) {
      const len = lines[i].text.length
      if (acc + len > overlapChars) break
      acc += len + 1
      ovStart = i
    }
    start = Math.min(Math.max(ovStart, start + 1), end)
  }
  return chunks
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS docs (
  id    INTEGER PRIMARY KEY,
  path  TEXT    NOT NULL UNIQUE,
  size  INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  hash  TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id         INTEGER PRIMARY KEY,
  doc_id     INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  chunk_idx  INTEGER NOT NULL,
  fts_rowid  INTEGER NOT NULL UNIQUE,
  start_line INTEGER NOT NULL,
  end_line   INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  UNIQUE (doc_id, chunk_idx)
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS registry (
  path          TEXT PRIMARY KEY,
  mode          TEXT NOT NULL CHECK (mode IN ('index', 'grep')),
  registered_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='fts_rowid',
  tokenize='trigram'
);
`

// 三触发器（契约命名 ai/ad/au = after insert/delete/update）
// ⚠️ ad/au 的 'delete' 传 old.fts_rowid + old.content 原文（禁空串，见文件头三雷①）
const TRIGGER_SQL = [
  `CREATE TRIGGER IF NOT EXISTS ai AFTER INSERT ON chunks BEGIN
     INSERT INTO chunks_fts(rowid, content) VALUES (new.fts_rowid, new.content);
   END;`,
  `CREATE TRIGGER IF NOT EXISTS ad AFTER DELETE ON chunks BEGIN
     INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.fts_rowid, old.content);
   END;`,
  `CREATE TRIGGER IF NOT EXISTS au AFTER UPDATE ON chunks BEGIN
     INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.fts_rowid, old.content);
     INSERT INTO chunks_fts(rowid, content) VALUES (new.fts_rowid, new.content);
   END;`,
]

const EXPECTED_TRIGGERS = ['ad', 'ai', 'au']

function metaGet(db, key) {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key)
  return row?.value ?? null
}

function metaSet(db, key, value) {
  db.prepare(`INSERT INTO meta(key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value))
}

/**
 * 建表 + 迁移分支（幂等修复）：
 * - 首次：建 docs/chunks/meta/registry/chunks_fts + ai/ad/au；
 * - 触发器缺失（历史库/被拆过）：重建触发器 + `('rebuild')` 从内容表重灌索引（幂等）；
 * - 规则指纹/版本漂移：重建 chunks_fts + `('rebuild')`。
 * 迁移分支不抛错（fail-open 留给调用方的校验环），但正常路径抛 SQLite 原始错误。
 */
function ensureSchema(db) {
  db.exec(SCHEMA_SQL)

  const version = metaGet(db, 'schema_version')
  const fingerprint = metaGet(db, 'rule_fingerprint')
  const present = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all().map((r) => r.name).sort()
  const triggersIntact = JSON.stringify(present) === JSON.stringify(EXPECTED_TRIGGERS)

  const needsFtsRebuild = fingerprint !== FTS_RULE_FINGERPRINT ||
    (version !== null && version !== String(INDEX_SCHEMA_VERSION))

  if (needsFtsRebuild && fingerprint !== null) {
    // 规则漂移：拆表重建（连触发器，避免指向已删表的悬挂触发器）
    db.exec(`DROP TRIGGER IF EXISTS ai; DROP TRIGGER IF EXISTS ad; DROP TRIGGER IF EXISTS au;
             DROP VIRTUAL TABLE IF EXISTS chunks_fts;`)
    db.exec(SCHEMA_SQL)
    db.exec(TRIGGER_SQL.join('\n'))
  } else if (!triggersIntact) {
    db.exec(TRIGGER_SQL.join('\n'))
  }

  if (needsFtsRebuild || !triggersIntact) {
    // ('rebuild') 幂等修复：以内容表 chunks 为唯一真源重灌 FTS 索引
    db.exec(`INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')`)
  }

  metaSet(db, 'schema_version', INDEX_SCHEMA_VERSION)
  metaSet(db, 'rule_fingerprint', FTS_RULE_FINGERPRINT)
  if (metaGet(db, 'fts_rowid_seq') === null) metaSet(db, 'fts_rowid_seq', 0)
  if (metaGet(db, 'revision') === null) metaSet(db, 'revision', 0)
}

/**
 * 打开（不存在则创建）索引库并保证 schema 就绪。
 * ⚠️ 必须开 foreign_keys（chunks.doc_id FK CASCADE 靠它生效）；journal_mode=WAL（契约）。
 */
export function openDb(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  ensureSchema(db)
  return db
}

/**
 * 只读打开既有索引库（读侧专用缝，T5 消费）。
 * ⚠️ 严禁读路径走 openDb()=ensureSchema：那会在任何校验门之前对活跃库原地 ('rebuild')/DROP 触发器/
 *   UPDATE meta（T2 教训）——读侧 readOnly 打开，不迁移、不建库（缺库判空态由调用方负责，读侧零副作用）。
 */
export function openReadOnlyDb(dbPath) {
  return new DatabaseSync(dbPath, { readOnly: true })
}

// ── 范围注册（混合范围）+ 三态增量 + 文件级单事务 ──

function normalizeRel(p) {
  return String(p).split(path.sep).join('/')
}

/** 范围注册：indexAll→'index'（全量索引），grepOnDemand→'grep'（只注册路径，T3 临时 grep 用） */
export function registerScope(db, scope = {}) {
  const index = [...(scope.indexAll ?? [])]
  const grep = [...(scope.grepOnDemand ?? [])]
  const now = Date.now()
  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM registry`).run()
    const ins = db.prepare(`INSERT INTO registry(path, mode, registered_at) VALUES (?, ?, ?)`)
    for (const p of index) ins.run(normalizeRel(p), 'index', now)
    for (const p of grep) ins.run(normalizeRel(p), 'grep', now)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return { index, grep }
}

/** 读回范围注册（T3 拿 grep 根做临时 grep） */
export function listScope(db) {
  const rows = db.prepare(`SELECT path, mode FROM registry ORDER BY rowid`).all()
  return {
    // 保留注册序（与 registerScope 返回同序，勿排序）
    index: rows.filter((r) => r.mode === 'index').map((r) => r.path),
    grep: rows.filter((r) => r.mode === 'grep').map((r) => r.path),
  }
}

/** 混合范围过滤：只索引 indexAll 根下的文件；grepOnDemand/范围外不进索引 */
function filterIndexable(files, scope) {
  const roots = (scope?.indexAll ?? []).map(normalizeRel)
  return files.map(normalizeRel).filter((rel) =>
    roots.some((root) => rel === root || rel.startsWith(`${root}/`)),
  )
}

/**
 * 三态增量分类（mtime+size 快表筛变更，可疑项 sha256 兜底，INV-13 口径）：
 * - 无 docs 行 → added；size+mtime 全等 → unchanged（免读）；
 * - 可疑（size/mtime 有变）→ 读 body 哈希：同 hash → unchanged（快表前滚，免重建）；异 hash → updated。
 * 另含 removed（docs 有行而文件列表已无——幽文档清理，R6 同族防线）与 skipped（读失败 fail-open 留痕）。
 * ⚠️ files 必须是索引范围内的完整清单（调用方按 scope 全量列举），removed 语义才有意义。
 */
function classify(db, vaultRoot, files) {
  const known = new Map(
    db.prepare(`SELECT id, path, size, mtime, hash FROM docs`).all().map((r) => [r.path, r]),
  )
  const seen = new Set()
  const out = { added: [], updated: [], unchanged: [], removed: [], skipped: [], touched: [] }
  for (const rel of files) {
    seen.add(rel)
    let st
    try {
      st = fs.statSync(path.join(vaultRoot, rel))
    } catch (e) {
      out.skipped.push({ path: rel, error: String(e?.message || e) })
      continue
    }
    const size = st.size
    const mtime = Math.round(st.mtimeMs)
    const prev = known.get(rel)
    if (!prev) {
      out.added.push({ path: rel, size, mtime })
      continue
    }
    if (prev.size === size && prev.mtime === mtime) {
      out.unchanged.push({ path: rel, size, mtime })
      continue
    }
    // 可疑项：hash 兜底
    let body
    try {
      body = fs.readFileSync(path.join(vaultRoot, rel))
    } catch (e) {
      out.skipped.push({ path: rel, error: String(e?.message || e) })
      continue
    }
    if (bodyHash(body) === prev.hash) {
      out.unchanged.push({ path: rel, size, mtime })
      out.touched.push({ id: prev.id, size, mtime }) // 快表前滚：下次免读
    } else {
      out.updated.push({ path: rel, size, mtime, body })
    }
  }
  for (const [rel, row] of known) {
    if (!seen.has(rel)) out.removed.push({ path: rel, id: row.id })
  }
  return out
}

function nextFtsRowids(db, count) {
  const seqRow = db.prepare(`SELECT value FROM meta WHERE key='fts_rowid_seq'`).get()
  let seq = Number(seqRow?.value ?? 0)
  const ids = []
  for (let i = 0; i < count; i++) ids.push(++seq)
  db.prepare(`UPDATE meta SET value=? WHERE key='fts_rowid_seq'`).run(String(seq))
  return ids
}

/**
 * 应用增量（文件级 DELETE+INSERT 单事务——防 R6 重导入残留旧 FTS 行）。
 * 单文件失败 → ROLLBACK 后记入 skipped（fail-open 留痕，INV-15），不影响其余文件。
 * 返回 {added, updated, unchanged, removed, skipped}（前三/removed 为 path 数组）。
 */
export function applyIncremental(db, { vaultRoot, scope, files }) {
  const plan = classify(db, vaultRoot, filterIndexable(files, scope))
  // ⚠️ 失败文件收集后置过滤——禁止在 for...of 里 splice（变异迭代会吞掉下一个文件）
  const failed = new Set()
  const replaceDoc = (rel, size, mtime, body) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const old = db.prepare(`SELECT id FROM docs WHERE path = ?`).get(rel)
      if (old) {
        // 显式删 chunks（触发器 ad 同步清 FTS）+ docs；FK CASCADE 仅兜底
        db.prepare(`DELETE FROM chunks WHERE doc_id = ?`).run(old.id)
        db.prepare(`DELETE FROM docs WHERE id = ?`).run(old.id)
      }
      db.prepare(`INSERT INTO docs(path, size, mtime, hash) VALUES (?, ?, ?, ?)`)
        .run(rel, size, mtime, bodyHash(body))
      const docId = db.prepare(`SELECT id FROM docs WHERE path = ?`).get(rel).id
      const parts = chunkText(body.toString('utf8'))
      const rowids = nextFtsRowids(db, parts.length)
      const ins = db.prepare(
        `INSERT INTO chunks(doc_id, chunk_idx, fts_rowid, start_line, end_line, content)
         VALUES (?, ?, ?, ?, ?, ?)`)
      parts.forEach((c, i) => ins.run(docId, c.chunkIdx, rowids[i], c.startLine, c.endLine, c.content))
      db.exec('COMMIT')
      return true
    } catch (e) {
      db.exec('ROLLBACK')
      plan.skipped.push({ path: rel, error: String(e?.message || e) })
      return false
    }
  }

  for (const item of plan.added) {
    try {
      const body = fs.readFileSync(path.join(vaultRoot, item.path))
      if (!replaceDoc(item.path, item.size, item.mtime, body)) failed.add(item.path)
    } catch (e) {
      failed.add(item.path)
      plan.skipped.push({ path: item.path, error: String(e?.message || e) })
    }
  }
  for (const item of plan.updated) {
    if (!replaceDoc(item.path, item.size, item.mtime, item.body)) failed.add(item.path)
  }
  // 快表前滚（hash 同、元数据漂移）：单条 UPDATE，不动 chunks
  const touch = db.prepare(`UPDATE docs SET size = ?, mtime = ? WHERE id = ?`)
  for (const t of plan.touched) touch.run(t.size, t.mtime, t.id)
  // 幽文档清理：单文件单事务
  for (const item of plan.removed) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`DELETE FROM chunks WHERE doc_id = ?`).run(item.id)
      db.prepare(`DELETE FROM docs WHERE id = ?`).run(item.id)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      plan.skipped.push({ path: item.path, error: String(e?.message || e) })
    }
  }
  const kept = (xs) => xs.filter((x) => !failed.has(x.path)).map((x) => x.path)
  return {
    added: kept(plan.added),
    updated: kept(plan.updated),
    unchanged: plan.unchanged.map((x) => x.path),
    removed: plan.removed.map((x) => x.path),
    skipped: plan.skipped,
  }
}

// ── 候选校验（SQLite/FTS5/维度/有限值/词表对账）+ copy-on-write revision 激活 ──

/**
 * 候选索引校验。⚠️ FTS5 'integrity-check' 只查索引内部一致性，**检不出 external
 * content 失同步**（/tmp/kbprobe 探针 5 实证）——R6 残留/陈旧的检出靠词表对账：
 * fts5vocab('instance').doc == fts_rowid（'row' 模式的 doc 是文档计数不是 rowid，探针 6），
 * 词表 (term, doc) 必须与 JS trigram(chunks.content) 逐块全等。
 * 全量对账（如千页 PoC 激活耗时超标再加采样旋钮——当前不预支）。
 */
export function validateIndex(db) {
  const problems = []
  const count = (sql) => db.prepare(sql).get().c

  // ① SQLite 结构完整性
  const ic = db.prepare(`PRAGMA integrity_check`).get()
  if ((ic?.integrity_check ?? '') !== 'ok') problems.push(`sqlite: integrity_check=${ic?.integrity_check}`)

  // ② FTS5 内部一致性（外部对账见 ⑤）
  try {
    db.exec(`INSERT INTO chunks_fts(chunks_fts) VALUES ('integrity-check')`)
  } catch (e) {
    problems.push(`fts5: ${String(e?.message || e)}`)
  }

  // ③ 维度/结构不变量
  if (count(`SELECT count(*) c FROM chunks WHERE fts_rowid IS NULL`) > 0) problems.push('dims: fts_rowid 缺失')
  if (count(`SELECT count(*) c FROM (SELECT fts_rowid FROM chunks GROUP BY fts_rowid HAVING count(*) > 1)`) > 0) {
    problems.push('dims: fts_rowid 重复')
  }
  if (count(`SELECT count(*) c FROM (SELECT doc_id FROM chunks GROUP BY doc_id
             HAVING min(chunk_idx) != 0 OR max(chunk_idx) != count(*) - 1)`) > 0) {
    problems.push('dims: chunk_idx 不连续')
  }
  if (count(`SELECT count(*) c FROM chunks WHERE start_line < 1 OR end_line < start_line`) > 0) problems.push('dims: 行号非法')
  if (count(`SELECT count(*) c FROM chunks c LEFT JOIN docs d ON d.id = c.doc_id WHERE d.id IS NULL`) > 0) {
    problems.push('dims: chunks 孤儿 doc_id')
  }

  // ④ 有限值（NaN 落库即成 NULL 被 NOT NULL 挡；此处防 REAL inf/小数混入整型列，探针 8）
  const finiteCheck = (cols) => cols
    .map((col) => `(${col} != ${col} OR abs(${col}) >= 9e15 OR ${col} != CAST(${col} AS INTEGER))`)
    .join(' OR ')
  if (count(`SELECT count(*) c FROM docs WHERE ${finiteCheck(['size', 'mtime'])}`) > 0) {
    problems.push('finite: docs 数值列非有限整数')
  }
  if (count(`SELECT count(*) c FROM chunks WHERE ${finiteCheck(['chunk_idx', 'fts_rowid', 'start_line', 'end_line'])}`) > 0) {
    problems.push('finite: chunks 数值列非有限整数')
  }

  // ⑤ 词表对账（R6/R5 真检出器）：临时 fts5vocab 用完即弃，不污染 schema
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS kb_vins_tmp USING fts5vocab(chunks_fts, 'instance')`)
    const chunks = db.prepare(`SELECT fts_rowid, content FROM chunks ORDER BY fts_rowid`).all()
    const allIds = new Set(db.prepare(`SELECT fts_rowid FROM chunks`).all().map((r) => r.fts_rowid))
    const actual = new Map()
    for (const row of db.prepare(`SELECT DISTINCT term, doc FROM kb_vins_tmp`).all()) {
      if (!actual.has(row.doc)) actual.set(row.doc, new Set())
      actual.get(row.doc).add(row.term)
    }
    for (const c of chunks) {
      const want = trigramTerms(c.content)
      const got = actual.get(c.fts_rowid) ?? new Set()
      const same = want.size === got.size && [...want].every((t) => got.has(t))
      if (!same) problems.push(`coherence: fts_rowid=${c.fts_rowid} 词表失同步（残留/陈旧/缺失）`)
    }
    for (const doc of actual.keys()) {
      if (!allIds.has(doc)) problems.push(`coherence: 孤儿 FTS 行 rowid=${doc}（内容表无此行）`)
    }
  } catch (e) {
    problems.push(`coherence: 对账失败 ${String(e?.message || e)}`)
  } finally {
    try { db.exec(`DROP TABLE IF EXISTS kb_vins_tmp`) } catch { /* 建失败就无所谓删 */ }
  }

  return { ok: problems.length === 0, problems }
}

/**
 * revision 基数：只读查询活跃库 meta.revision（Important#2 修复项）。
 * ⚠️ 严禁走 openDb()=ensureSchema 做探针：那会在任何校验门之前对活跃库原地
 * ('rebuild')/DROP 触发器/UPDATE meta——破坏「失败候选即弃、旧索引字节级原样保留」。
 * ⚠️ 只读打开 WAL 库仍会新生成空 -shm/-wal（实测）：探针只清自己引入的 sidecar，
 * 活跃库既有文件一律不动（字节级 + 文件清单双重原样）。
 * 读失败/非法值 → 按 0 计并留痕 problems + degraded:'revision-probe'（INV-15 禁静默，
 * 旧版 `catch { 0 }` 吞错会让 revision 静默回退 7→1，破「单调 +1 不回退」）。
 */
function readBaseRevision(activePath, summary) {
  if (!fs.existsSync(activePath)) return 0
  const hadWal = fs.existsSync(`${activePath}-wal`)
  const hadShm = fs.existsSync(`${activePath}-shm`)
  let probe = null
  try {
    probe = new DatabaseSync(activePath, { readOnly: true })
    const row = probe.prepare(`SELECT value FROM meta WHERE key='revision'`).get()
    if (row === undefined) return 0 // 无 revision 键：按 0（初始化口径，非错误）
    const n = Number(row.value)
    if (!Number.isFinite(n) || n < 0) throw new Error(`meta.revision 非法值 ${JSON.stringify(row.value)}`)
    return Math.trunc(n)
  } catch (e) {
    summary.problems.push(`revision 基数读取失败（按 0 计）：${String(e?.message || e)}`)
    summary.degraded = 'revision-probe'
    return 0
  } finally {
    try { probe?.close() } catch { /* 尽力关闭 */ }
    if (!hadWal) try { fs.rmSync(`${activePath}-wal`, { force: true }) } catch { /* 尽力清理 */ }
    if (!hadShm) try { fs.rmSync(`${activePath}-shm`, { force: true }) } catch { /* 尽力清理 */ }
  }
}

function dropFileWithSidecars(p) {
  for (const suf of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${p}${suf}`, { force: true }) } catch { /* 尽力清理 */ }
  }
}

/**
 * copy-on-write 增量刷新：候选库上改 → 校验（SQLite/FTS5/维度/有限值/词表对账）→ 通过才激活。
 * - 正常路：复制活跃库为候选 → 增量 → 校验 → rename 原子激活；失败候选即弃，旧索引原样保留。
 * - 继承腐坏（复制来的候选校验不过）→ 全量重建候选再校验（('rebuild') 幂等修复精神）；
 *   再不过 → activated:false + degraded:'validation'（fail-open 留痕，INV-15 禁静默）。
 * - revision 单调 +1（以活跃库 meta 为基数，重建也不回退），落候选并随激活生效。
 * ⚠️ files 须为索引范围内完整清单（removed 语义依赖它）；validate 可注入（激活门测试用）。
 */
export function refresh({ activePath, vaultRoot, scope, files, validate = validateIndex, validateOpts = {} }) {
  const candidatePath = `${activePath}.candidate`
  fs.mkdirSync(path.dirname(activePath), { recursive: true })
  dropFileWithSidecars(candidatePath)

  const summary = { activated: false, degraded: null, rebuilt: false, revision: null, problems: [], counts: null }
  const baseRevision = readBaseRevision(activePath, summary)
  const attempts = fs.existsSync(activePath) ? [false, true] : [true]
  let lastProblems = ['candidate build failed']
  let prevAttemptFailed = false

  for (const fresh of attempts) {
    dropFileWithSidecars(candidatePath)
    try {
      if (!fresh) fs.copyFileSync(activePath, candidatePath)
      const db = openDb(candidatePath)
      let counts
      try {
        registerScope(db, scope ?? {})
        counts = applyIncremental(db, { vaultRoot, scope: scope ?? {}, files })
        metaSet(db, 'revision', baseRevision + 1)
        const v = validate(db, validateOpts)
        if (!v.ok) {
          lastProblems = v.problems
          prevAttemptFailed = true
          db.close()
          continue // 拒收候选 → 下一轮全量重建 / 放弃
        }
        db.exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
        db.close()
      } catch (e) {
        try { db.close() } catch { /* 已关 */ }
        lastProblems = [String(e?.message || e)]
        prevAttemptFailed = true
        continue
      }
      // 激活：清活跃库残余 sidecar 后原子 rename
      dropFileWithSidecars(`${activePath}-wal`)
      dropFileWithSidecars(`${activePath}-shm`)
      fs.rmSync(activePath, { force: true })
      fs.renameSync(candidatePath, activePath)
      summary.activated = true
      summary.rebuilt = prevAttemptFailed
      summary.revision = baseRevision + 1
      summary.counts = counts
      return summary
    } catch (e) {
      lastProblems = [String(e?.message || e)]
      prevAttemptFailed = true
    }
  }

  dropFileWithSidecars(candidatePath)
  summary.degraded = 'validation'
  summary.problems.push(...lastProblems) // 不覆盖探针留痕（INV-15：所有问题都要在场）
  return summary
}
