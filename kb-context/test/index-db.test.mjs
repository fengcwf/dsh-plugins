// index-db 单测（T2）：真开临时库、真写文件、真跑 SQL——禁 mock 自嗨。
// 反例必含：①重导入后 chunks_fts 无残留旧行（R6）②VACUUM 后 fts_rowid 稳定（R5）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// node:sqlite 实验性警告降噪：只吞 ExperimentalWarning，其余警告照打（输出干净）
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w?.name !== 'ExperimentalWarning') console.error(String(w?.stack || w))
})

const { DatabaseSync } = await import('node:sqlite')
const {
  openDb, chunkText, bodyHash, trigramTerms, registerScope, listScope, applyIncremental, refresh, validateIndex,
  INDEX_SCHEMA_VERSION, FTS_RULE_FINGERPRINT,
} = await import('../lib/index-db.js')

function tmpDir(t, prefix = 'kb-indexdb-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 读 sqlite_master（独立连接，验证落盘形态而非内存态） */
function schemaRows(dbPath) {
  const db = new DatabaseSync(dbPath)
  const rows = db.prepare(
    `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  ).all()
  db.close()
  return rows
}

test('openDb：契约 schema 落地（docs/chunks 精确列 + WAL + 外键开）', async (t) => {
  const dir = tmpDir(t)
  const dbPath = path.join(dir, 'kb-index.db')
  const db = openDb(dbPath)
  t.after(() => db.close())

  const rows = schemaRows(dbPath)
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
  for (const table of ['docs', 'chunks', 'chunks_fts', 'meta', 'registry']) {
    assert.ok(byName[table], `缺表 ${table}`)
  }

  // 契约列精确一致：docs(id, path UNIQUE, size, mtime, hash)
  const docsCols = db.prepare(`PRAGMA table_info(docs)`).all().map((c) => c.name)
  assert.deepEqual(docsCols, ['id', 'path', 'size', 'mtime', 'hash'])
  // chunks(id, doc_id FK CASCADE, chunk_idx, fts_rowid UNIQUE, start_line, end_line, content)
  const chunksCols = db.prepare(`PRAGMA table_info(chunks)`).all().map((c) => c.name)
  assert.deepEqual(chunksCols, ['id', 'doc_id', 'chunk_idx', 'fts_rowid', 'start_line', 'end_line', 'content'])

  assert.equal(db.prepare(`PRAGMA journal_mode`).get().journal_mode, 'wal')
  assert.equal(db.prepare(`PRAGMA foreign_keys`).get().foreign_keys, 1)
  assert.match(byName.chunks.sql, /ON DELETE CASCADE/i)
  assert.match(byName.chunks.sql, /UNIQUE/i) // fts_rowid UNIQUE（稳定代理键）
})

test('chunks_fts：external content + trigram + fts_rowid 稳定键', async (t) => {
  const dir = tmpDir(t)
  const dbPath = path.join(dir, 'kb-index.db')
  const db = openDb(dbPath)
  t.after(() => db.close())

  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'chunks_fts'`).get()
  assert.match(row.sql, /USING fts5/i)
  assert.match(row.sql, /content_rowid='fts_rowid'/)
  assert.match(row.sql, /tokenize='trigram'/)
  // ⚠️ 契约字面 content='chunk' 与其表名 chunks 自相矛盾，实测 `('rebuild')` 会
  // 炸 `no such table: main.chunk`（迁移分支不可用）→ 裁定 content='chunks'（报告有证据）。
  assert.match(row.sql, /content='chunks'/)
})

test('ai/ad/au 三触发器同步；delete 传 OLD 原文（禁空串）', async (t) => {
  const dir = tmpDir(t)
  const dbPath = path.join(dir, 'kb-index.db')
  const db = openDb(dbPath)
  t.after(() => db.close())

  const trig = Object.fromEntries(
    db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger'`).all().map((r) => [r.name, r.sql]),
  )
  assert.deepEqual(Object.keys(trig).sort(), ['ad', 'ai', 'au'])
  // 'delete' 必须传 OLD 原文（R6/FTS 同步雷区：空串 delete 静默毁索引）
  assert.match(trig.ad, /'delete',\s*old\.fts_rowid,\s*old\.content/i)

  // 行为验证（真 SQL，非看 SQL 猜行为）
  db.exec(`INSERT INTO docs(path, size, mtime, hash) VALUES('wiki/a.md', 7, 1000, 'h1')`)
  const docId = db.prepare(`SELECT id FROM docs WHERE path='wiki/a.md'`).get().id
  db.exec(`INSERT INTO chunks(doc_id, chunk_idx, fts_rowid, start_line, end_line, content)
           VALUES(${docId}, 0, 101, 1, 1, '旧内容甲乙丙丁')`)
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容"'`).get().c, 1)

  // au：更新后旧词条消失、新词条命中
  db.exec(`UPDATE chunks SET content='新内容庚辛壬癸' WHERE fts_rowid=101`)
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容"'`).get().c, 0, 'au 后旧词条残留（delete 未传 OLD）')
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"新内容"'`).get().c, 1)

  // ad：删除后索引零残留
  db.exec(`DELETE FROM chunks WHERE fts_rowid=101`)
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"新内容"'`).get().c, 0, 'ad 后索引残留旧行（R6 形态）')
})

test('迁移分支 (rebuild)：幂等 + 触发器缺失自愈（失同步修复）', async (t) => {
  const dir = tmpDir(t)
  const dbPath = path.join(dir, 'kb-index.db')

  let db = openDb(dbPath)
  db.exec(`INSERT INTO docs(path, size, mtime, hash) VALUES('wiki/a.md', 7, 1000, 'h1')`)
  const docId = db.prepare(`SELECT id FROM docs WHERE path='wiki/a.md'`).get().id
  db.exec(`INSERT INTO chunks(doc_id, chunk_idx, fts_rowid, start_line, end_line, content)
           VALUES(${docId}, 0, 101, 1, 1, '旧内容甲乙丙丁')`)
  db.close()

  // 幂等：重复 openDb 不炸、元数据同口径
  db = openDb(dbPath)
  assert.equal(db.prepare(`SELECT value FROM meta WHERE key='schema_version'`).get().value, String(INDEX_SCHEMA_VERSION))
  assert.equal(db.prepare(`SELECT value FROM meta WHERE key='rule_fingerprint'`).get().value, FTS_RULE_FINGERPRINT)
  db.close()

  // 制造真实失同步：拆掉 ad 触发器后直接删行 → FTS 残留孤儿（R6 形态）
  db = new DatabaseSync(dbPath)
  db.exec(`DROP TRIGGER ad`)
  db.exec(`DELETE FROM chunks WHERE fts_rowid=101`)
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容"'`).get().c, 1, '前置：孤儿残留应可见')
  db.close()

  // reopen = 迁移分支：触发器重建 + ('rebuild') 幂等修复 → 残留清零
  db = openDb(dbPath)
  t.after(() => db.close())
  const names = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all().map((r) => r.name).sort()
  assert.deepEqual(names, ['ad', 'ai', 'au'])
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容"'`).get().c, 0, 'rebuild 后孤儿残留未清（R6 修复失败）')
})

// ── S2：行号分块 + body hash（INV-13 sha256 口径）+ trigram 口径 parity ──

test('chunkText：行号分块（startLine/endLine 1-based、chunk_idx 连续、行粒度重叠）', () => {
  // 5 行 ×4 字符，maxChars=12（两行一 chunk）overlap=5（整行回看 1 行）
  const text = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee'].join('\n')
  const chunks = chunkText(text, { maxChars: 12, overlapChars: 5 })
  assert.deepEqual(
    chunks.map((c) => ({ chunkIdx: c.chunkIdx, startLine: c.startLine, endLine: c.endLine, content: c.content })),
    [
      { chunkIdx: 0, startLine: 1, endLine: 2, content: 'aaaa\nbbbb' },
      { chunkIdx: 1, startLine: 2, endLine: 3, content: 'bbbb\ncccc' }, // 重叠行 bbbb
      { chunkIdx: 2, startLine: 3, endLine: 4, content: 'cccc\ndddd' },
      { chunkIdx: 3, startLine: 4, endLine: 5, content: 'dddd\neeee' },
    ],
  )
})

test('chunkText：短文本单 chunk；空文本返回 []；尾随换行不虚增行', () => {
  assert.deepEqual(chunkText(''), [])
  const one = chunkText('第一行内容\n第二行内容\n', { maxChars: 800, overlapChars: 120 })
  assert.equal(one.length, 1)
  assert.deepEqual(
    { chunkIdx: one[0].chunkIdx, startLine: one[0].startLine, endLine: one[0].endLine, content: one[0].content },
    { chunkIdx: 0, startLine: 1, endLine: 2, content: '第一行内容\n第二行内容' },
  )
})

test('chunkText：超长单行硬切（段内 start=end=该行号），前后行不受污染', () => {
  const text = ['aaa', 'y'.repeat(25), 'zzz'].join('\n')
  const chunks = chunkText(text, { maxChars: 10, overlapChars: 5 })
  assert.deepEqual(
    chunks.map((c) => ({ chunkIdx: c.chunkIdx, startLine: c.startLine, endLine: c.endLine, len: c.content.length })),
    [
      { chunkIdx: 0, startLine: 1, endLine: 1, len: 3 },
      { chunkIdx: 1, startLine: 2, endLine: 2, len: 10 }, // 硬切 25 → 10/10/5
      { chunkIdx: 2, startLine: 2, endLine: 2, len: 10 },
      { chunkIdx: 3, startLine: 2, endLine: 2, len: 5 },
      { chunkIdx: 4, startLine: 3, endLine: 3, len: 3 },
    ],
  )
  // chunk_idx 连续 + 全部内容拼回可对账
  assert.deepEqual(chunks.map((c) => c.chunkIdx), [0, 1, 2, 3, 4])
})

test('chunkText：默认参数 = 800 字符/120 重叠（调研口径，防漂移）', () => {
  const line = (n) => `${n}`.padStart(3, '0') + 'x'.repeat(100)
  const text = Array.from({ length: 20 }, (_, i) => line(i + 1)).join('\n')
  const chunks = chunkText(text)
  assert.ok(chunks.length > 1, '2000+ 字符应分多块')
  for (const c of chunks) {
    assert.ok(c.content.length <= 800, `chunk 超长 ${c.content.length}`)
    assert.ok(c.startLine >= 1 && c.startLine <= c.endLine)
  }
  // 相邻块行号重叠（行粒度重叠生效，起始行不大于上块结束行）
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].startLine <= chunks[i - 1].endLine, `块 ${i} 与前块无重叠`)
    assert.ok(chunks[i].startLine > chunks[i - 1].startLine, `块 ${i} 未前进（死循环形态）`)
  }
})

test('bodyHash：sha256 body 口径（标准向量 + Buffer/utf8 字符串同值，INV-13 同源）', () => {
  assert.equal(bodyHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(bodyHash(Buffer.from('abc', 'utf8')), bodyHash('abc'))
  assert.equal(bodyHash('中文 body'), bodyHash(Buffer.from('中文 body', 'utf8')))
  assert.notEqual(bodyHash('abc'), bodyHash('abd'))
})

test('trigramTerms：与 SQLite trigram 分词同口径（大小写折叠实测 parity）', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE VIRTUAL TABLE ft USING fts5(content, tokenize='trigram')`)
  db.exec(`CREATE VIRTUAL TABLE voc USING fts5vocab(ft, 'row')`)
  const contents = ['中文abc', 'aA中B1_中', '短', 'EMPTY 短词ab']
  const sqlTerms = new Set()
  for (const [i, content] of contents.entries()) {
    db.exec(`INSERT INTO ft(rowid, content) VALUES(${i + 1}, '${content}')`)
    for (const t of trigramTerms(content)) sqlTerms.has(t) || null
    for (const row of db.prepare(`SELECT term FROM voc`).all()) sqlTerms.add(row.term)
  }
  // 逐条 parity：JS 侧三元组集合必须 == SQLite vocab 全集
  const jsTerms = new Set(contents.flatMap((c) => [...trigramTerms(c)]))
  assert.deepEqual([...sqlTerms].sort(), [...jsTerms].sort())
  assert.equal(trigramTerms('短').size, 0, '不足 3 字符无 trigram（短词盲区，T3 LIKE 兜底）')
})

// ── S3：三态增量（mtime+size 快表 + hash 兜底）+ 文件级单事务 + 混合范围注册 ──

const SCOPE = { indexAll: ['wiki', 'raw'], grepOnDemand: ['01-客户资料', '02-致远OA'] }

function makeVault(t, files) {
  const dir = tmpDir(t, 'kb-vault-')
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return dir
}

/** DB 行 → 普通对象（strict deepEqual 会比原型，null-prototype 行会假失败） */
function rows(db, sql) {
  return db.prepare(sql).all().map((r) => ({ ...r }))
}

/**
 * 反例级对账：chunks_fts 词表 == JS trigram(chunks.content)，孤儿/陈旧/残留一行都藏不住。
 * ⚠️ 必须用 fts5vocab 'instance' 模式：'row' 模式的 doc 是「文档计数」不是 rowid（探针 6 实测）。
 */
function assertIndexParity(db, msg = 'FTS 索引与内容表失同步（残留/孤儿/陈旧）') {
  const chunks = rows(db, `SELECT fts_rowid, content FROM chunks`)
  const expect = new Map()
  for (const c of chunks) expect.set(c.fts_rowid, trigramTerms(c.content))
  const actual = new Map()
  for (const row of db.prepare(`SELECT DISTINCT term, doc FROM vins`).all()) {
    if (!actual.has(row.doc)) actual.set(row.doc, new Set())
    actual.get(row.doc).add(row.term)
  }
  assert.deepEqual(
    [...actual.entries()].map(([doc, terms]) => [doc, [...terms].sort()]).sort((a, b) => a[0] - b[0]),
    [...expect.entries()].map(([doc, terms]) => [doc, [...terms].sort()]).sort((a, b) => a[0] - b[0]),
    msg,
  )
}

test('混合范围：indexAll 全量索引 / grepOnDemand 只注册路径不索引', async (t) => {
  const vault = makeVault(t, {
    'wiki/a.md': '第一篇甲乙丙丁',
    'raw/b.md': '第二篇乙丙丁戊',
    '01-客户资料/c.md': '客户材料丙丁戊己',
    'other/d.md': '范围外丁戊己庚',
  })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())

  assert.deepEqual(registerScope(db, SCOPE), { index: ['wiki', 'raw'], grep: ['01-客户资料', '02-致远OA'] })
  assert.deepEqual(listScope(db), { index: ['wiki', 'raw'], grep: ['01-客户资料', '02-致远OA'] }, 'listScope 保留注册序')
  // registry 落盘语义：业务区 mode='grep'（T3 临时 grep 用）
  assert.equal(db.prepare(`SELECT mode FROM registry WHERE path='01-客户资料'`).get().mode, 'grep')

  const files = ['wiki/a.md', 'raw/b.md', '01-客户资料/c.md', 'other/d.md']
  const res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })
  assert.deepEqual(res.added, ['wiki/a.md', 'raw/b.md'])
  const paths = db.prepare(`SELECT path FROM docs ORDER BY path`).all().map((r) => r.path)
  assert.deepEqual(paths, ['raw/b.md', 'wiki/a.md'], 'grepOnDemand/范围外文件不进索引')
})

test('三态增量：added / unchanged(mtime+size 快表) / hash 兜底 / updated', async (t) => {
  const vault = makeVault(t, {
    'wiki/a.md': '第一篇内容甲乙丙丁\n第二行戊己庚辛',
    'wiki/b.md': '另一篇内容丙丁戊己',
  })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  const files = ['wiki/a.md', 'wiki/b.md']

  // 首轮：全部 added
  let res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })
  assert.deepEqual(res.added, ['wiki/a.md', 'wiki/b.md'])
  assert.deepEqual(res.updated, [])
  assert.deepEqual(res.unchanged, [])
  const docB = db.prepare(`SELECT * FROM docs WHERE path='wiki/b.md'`).get()
  assert.equal(docB.hash, bodyHash('另一篇内容丙丁戊己'), 'INV-13：hash=sha256(body)')
  assert.equal(docB.size, Buffer.byteLength('另一篇内容丙丁戊己', 'utf8'))

  // 无变化：全部 unchanged（快表命中，连读都不必）
  res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })
  assert.deepEqual(res.unchanged, ['wiki/a.md', 'wiki/b.md'])
  assert.equal(res.added.length + res.updated.length + res.removed.length, 0)

  // 只 touch mtime（内容同）：可疑项 hash 兜底 → 仍 unchanged，且快表前滚避免重复读
  const future = Date.now() / 1000 + 60
  fs.utimesSync(path.join(vault, 'wiki/b.md'), future, future)
  const beforeRowids = rows(db, `SELECT fts_rowid FROM chunks ORDER BY fts_rowid`)
  res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })
  assert.deepEqual(res.unchanged, ['wiki/a.md', 'wiki/b.md'])
  assert.deepEqual(rows(db, `SELECT fts_rowid FROM chunks ORDER BY fts_rowid`), beforeRowids, 'hash 兜底判同 → 不重建块')
  assert.equal(db.prepare(`SELECT mtime FROM docs WHERE path='wiki/b.md'`).get().mtime, Math.round(future * 1000), '快表前滚（下次免读）')

  // 真变更：updated
  fs.writeFileSync(path.join(vault, 'wiki/b.md'), '改后的内容壬癸子丑')
  res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })
  assert.deepEqual(res.updated, ['wiki/b.md'])
  assert.deepEqual(res.unchanged, ['wiki/a.md'])

  // 新文件：added
  fs.writeFileSync(path.join(vault, 'wiki/c.md'), '新增的内容子丑寅卯')
  res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: [...files, 'wiki/c.md'] })
  assert.deepEqual(res.added, ['wiki/c.md'])
})

test('R6 反例：重导入后 chunks_fts 零残留旧行（词表级对账）', async (t) => {
  const oldBody = '旧内容甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥'
  const newBody = '新内容乾兑离震巽坎艮坤天地玄黄宇宙洪荒日月盈昃辰宿列张'
  const vault = makeVault(t, { 'wiki/a.md': oldBody })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  db.exec(`CREATE VIRTUAL TABLE vins USING fts5vocab(chunks_fts, 'instance')`)

  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容甲"'`).get().c, 1)

  // 重导入（同路径换体）——dhb861 残留坑的精确复现路径
  fs.writeFileSync(path.join(vault, 'wiki/a.md'), newBody)
  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })

  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容甲"'`).get().c, 0, '旧 FTS 行残留（R6）')
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"新内容乾"'`).get().c, 1)
  assertIndexParity(db, '重导入后词表残留孤儿/陈旧行（R6）')
  // 块集合 == 全新分块结果（无半旧半新）
  const got = rows(db, `SELECT chunk_idx, start_line, end_line, content FROM chunks ORDER BY chunk_idx`)
  assert.deepEqual(got, chunkText(newBody).map((c) => ({
    chunk_idx: c.chunkIdx, start_line: c.startLine, end_line: c.endLine, content: c.content,
  })))
})

test('文件级 DELETE+INSERT 单事务：注入失败整文件回滚，不留半旧半新', async (t) => {
  const line1 = '安全行内容甲乙丙丁'.padEnd(500, '甲')
  const line2 = 'BOOM 行内容乙丙丁戊'.padEnd(500, '乙')
  const oldBody = `${line1}\n${'旧行内容'.padEnd(500, '丙')}`
  const boomBody = `${line1}\n${line2}`
  const vault = makeVault(t, { 'wiki/a.md': oldBody })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())

  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })
  const before = rows(db, `SELECT chunk_idx, start_line, end_line, content FROM chunks ORDER BY chunk_idx`)
  const beforeHash = db.prepare(`SELECT hash FROM docs WHERE path='wiki/a.md'`).get().hash
  assert.ok(before.length >= 2, '前置：应有多块')

  // 真实失败注入（SQL 层 RAISE，非 mock 我方代码）：第 2 块含 BOOM → 插到一半必炸
  db.exec(`CREATE TRIGGER boom BEFORE INSERT ON chunks WHEN new.content LIKE '%BOOM%' BEGIN
             SELECT RAISE(ABORT, 'boom'); END;`)
  fs.writeFileSync(path.join(vault, 'wiki/a.md'), boomBody)
  const res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })
  assert.deepEqual(res.skipped.map((s) => s.path), ['wiki/a.md'], '失败文件 fail-open 跳过留痕')
  assert.deepEqual(rows(db, `SELECT chunk_idx, start_line, end_line, content FROM chunks ORDER BY chunk_idx`), before,
    '单事务回滚：不得留半旧半新')
  assert.equal(db.prepare(`SELECT hash FROM docs WHERE path='wiki/a.md'`).get().hash, beforeHash, 'docs 快照同滚')

  // 障碍移除后重导成功
  db.exec(`DROP TRIGGER boom`)
  const res2 = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })
  assert.deepEqual(res2.updated, ['wiki/a.md'])
  assert.deepEqual(rows(db, `SELECT chunk_idx, start_line, end_line, content FROM chunks ORDER BY chunk_idx`),
    chunkText(boomBody).map((c) => ({
      chunk_idx: c.chunkIdx, start_line: c.startLine, end_line: c.endLine, content: c.content,
    })))
})

test('removed：文件消失后 docs/chunks/FTS 三处同步清理', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '留存内容甲乙丙丁', 'wiki/b.md': '删除内容乙丙丁戊' })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  db.exec(`CREATE VIRTUAL TABLE vins USING fts5vocab(chunks_fts, 'instance')`)

  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md', 'wiki/b.md'] })
  fs.rmSync(path.join(vault, 'wiki/b.md'))
  const res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })

  assert.deepEqual(res.removed, ['wiki/b.md'])
  assert.deepEqual(db.prepare(`SELECT path FROM docs`).all().map((r) => r.path), ['wiki/a.md'])
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"删除内容乙"'`).get().c, 0, '幽文档残留（R6 形态）')
  assertIndexParity(db)
})

test('fail-open：不可读条目跳过留痕，其余照常（INV-15 禁静默）', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '正常内容甲乙丙丁' })
  fs.mkdirSync(path.join(vault, 'wiki', 'isdir.md')) // 读取必炸 EISDIR
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())

  const res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md', 'wiki/isdir.md'] })
  assert.deepEqual(res.added, ['wiki/a.md'])
  assert.equal(res.skipped.length, 1)
  assert.equal(res.skipped[0].path, 'wiki/isdir.md')
  assert.ok(res.skipped[0].error, '跳过必须带原因（禁静默）')
})

// ── S4：候选校验（SQLite/FTS5/维度/有限值）+ copy-on-write revision 激活 ──

test('validateIndex：干净库过检；四类真实腐坏逐类检出', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '对账内容甲乙丙丁戊己', 'wiki/b.md': '对账内容乙丙丁戊己庚' })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md', 'wiki/b.md'] })

  const clean = validateIndex(db)
  assert.equal(clean.ok, true, `干净库应过检：${JSON.stringify(clean.problems)}`)

  // ① FTS 残留孤儿（R6 形态：拆 ad 直删）
  db.exec(`DROP TRIGGER ad`)
  db.exec(`DELETE FROM chunks WHERE doc_id = (SELECT id FROM docs WHERE path='wiki/b.md')`)
  let v = validateIndex(db)
  assert.equal(v.ok, false)
  assert.ok(v.problems.some((p) => /coherence/.test(p)), JSON.stringify(v.problems))
  db.exec(`INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')`) // 清残留
  db.exec(`CREATE TRIGGER ad AFTER DELETE ON chunks BEGIN
             INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.fts_rowid, old.content); END;`)

  // ② FTS 陈旧行（内容换体未同步）
  db.exec(`DROP TRIGGER au`)
  db.exec(`UPDATE chunks SET content='陈旧失同步内容xyz' WHERE chunk_idx = 0`)
  v = validateIndex(db)
  assert.equal(v.ok, false)
  assert.ok(v.problems.some((p) => /coherence/.test(p)))
  db.exec(`INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')`)
  db.exec(`CREATE TRIGGER au AFTER UPDATE ON chunks BEGIN
             INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.fts_rowid, old.content);
             INSERT INTO chunks_fts(rowid, content) VALUES (new.fts_rowid, new.content); END;`)

  // ③ 维度：行号非法 + chunk_idx 不连续
  db.exec(`UPDATE chunks SET start_line = 0 WHERE chunk_idx = 0`)
  v = validateIndex(db)
  assert.equal(v.ok, false)
  assert.ok(v.problems.some((p) => /dims/.test(p)), JSON.stringify(v.problems))
  db.exec(`UPDATE chunks SET start_line = 1 WHERE chunk_idx = 0`)

  // ④ 有限值：REAL inf / 小数混入整型列（NaN 被 NOT NULL 挡，探针 8）
  db.prepare(`UPDATE docs SET size = ? WHERE path='wiki/a.md'`).run(Infinity)
  v = validateIndex(db)
  assert.equal(v.ok, false)
  assert.ok(v.problems.some((p) => /finite/.test(p)), JSON.stringify(v.problems))
})

test('refresh：copy-on-write 激活，revision 校验后递增', async (t) => {
  const vault = makeVault(t, {
    'wiki/a.md': '第一篇内容甲乙丙丁',
    'wiki/b.md': '第二篇内容乙丙丁戊\n第二行丙丁戊己',
  })
  const activePath = path.join(tmpDir(t), 'nested', 'kb-index.db')
  const files = ['wiki/a.md', 'wiki/b.md']

  const res = refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })
  assert.equal(res.activated, true, JSON.stringify(res))
  assert.equal(res.rebuilt, false)
  assert.equal(res.revision, 1)
  assert.deepEqual(res.counts.added, ['wiki/a.md', 'wiki/b.md'])
  assert.ok(fs.existsSync(activePath), '激活后活跃索引在位')
  assert.ok(!fs.existsSync(`${activePath}.candidate`), '候选残留')

  let db = openDb(activePath)
  assert.equal(validateIndex(db).ok, true)
  assert.equal(db.prepare(`SELECT value FROM meta WHERE key='revision'`).get().value, '1')
  db.close()

  // 增量第二次：revision 前进，updated 三态贯通
  fs.writeFileSync(path.join(vault, 'wiki/b.md'), '改后的第二篇内容庚辛壬癸')
  const res2 = refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })
  assert.equal(res2.activated, true)
  assert.equal(res2.revision, 2)
  assert.deepEqual(res2.counts.updated, ['wiki/b.md'])
  assert.deepEqual(res2.counts.unchanged, ['wiki/a.md'])
  db = openDb(activePath)
  t.after(() => db.close())
  assert.equal(db.prepare(`SELECT value FROM meta WHERE key='revision'`).get().value, '2')
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧的乙丙"'`).get().c, 0)
})

test('refresh：校验不过不激活（保旧索引原样），候选清理干净', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '第一篇内容甲乙丙丁' })
  const activePath = path.join(tmpDir(t), 'kb-index.db')
  const files = ['wiki/a.md']
  refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })
  const before = fs.readFileSync(activePath)
  fs.writeFileSync(path.join(vault, 'wiki/a.md'), '换体内容壬癸子丑寅卯')

  const res = refresh({
    activePath, vaultRoot: vault, scope: SCOPE, files,
    validate: () => ({ ok: false, problems: ['forced: 校验不过'] }), // 激活门注入失败（其余全真实）
  })
  assert.equal(res.activated, false, JSON.stringify(res))
  assert.equal(res.degraded, 'validation')
  assert.deepEqual(res.problems, ['forced: 校验不过'])
  assert.deepEqual(fs.readFileSync(activePath), before, '旧索引必须原样保留（copy-on-write）')
  assert.ok(!fs.existsSync(`${activePath}.candidate`), '失败候选必须清理')
})

test('refresh：继承腐坏候选被拒后全量重建自愈（rebuild 幂等修复）', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '第一篇内容甲乙丙丁\n第二行戊己庚辛' })
  const activePath = path.join(tmpDir(t), 'kb-index.db')
  const files = ['wiki/a.md']
  refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })

  // 制造继承腐坏：行号非法（触发器齐全 → 迁移分支不会替我们修，必须靠校验拒收）
  let db = openDb(activePath)
  db.exec(`UPDATE chunks SET start_line = 0`)
  db.close()

  const res = refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })
  assert.equal(res.activated, true, JSON.stringify(res))
  assert.equal(res.rebuilt, true, 'copy 校验失败 → 全量重建')
  assert.equal(res.revision, 2, 'revision 单调前进（重建也吃旧值 +1）')
  db = openDb(activePath)
  t.after(() => db.close())
  assert.equal(validateIndex(db).ok, true, '自愈后过检')
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks WHERE start_line < 1`).get().c, 0)
})

test('R5 反例：VACUUM 后 fts_rowid 稳定（显式代理键，非内部 rowid）', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '第一行内容甲乙丙丁\n第二行内容乙丙丁戊\n第三行内容丙丁戊己庚辛' })
  const activePath = path.join(tmpDir(t), 'kb-index.db')
  refresh({ activePath, vaultRoot: vault, scope: SCOPE, files: ['wiki/a.md'] })

  let db = openDb(activePath)
  const before = rows(db, `SELECT fts_rowid, chunk_idx, content FROM chunks ORDER BY chunk_idx`)
  assert.ok(before.length >= 1)
  db.exec(`VACUUM`) // 隐式 rowid 重排雷区（探针 7 实测会重排）
  db.close()

  db = openDb(activePath)
  t.after(() => db.close())
  assert.deepEqual(rows(db, `SELECT fts_rowid, chunk_idx, content FROM chunks ORDER BY chunk_idx`), before,
    'VACUUM 后 fts_rowid 必须稳定（R5）')
  const hit = db.prepare(`SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH '"第一行内容"'`).get()
  assert.equal(hit.rowid, before[0].fts_rowid, 'FTS rowid 映射不漂')
  assert.equal(validateIndex(db).ok, true, 'VACUUM 后词表对账仍过检')
})

test('R6 反例（refresh 全链）：重导入零残留 + 候选校验过检', async (t) => {
  const vault = makeVault(t, { 'wiki/a.md': '旧内容甲乙丙丁戊己庚辛壬癸子丑寅卯' })
  const activePath = path.join(tmpDir(t), 'kb-index.db')
  const files = ['wiki/a.md']
  refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })

  fs.writeFileSync(path.join(vault, 'wiki/a.md'), '新内容乾兑离震巽坎艮坤天地玄黄宇宙')
  const res = refresh({ activePath, vaultRoot: vault, scope: SCOPE, files })
  assert.equal(res.activated, true)
  assert.deepEqual(res.counts.updated, ['wiki/a.md'])

  const db = openDb(activePath)
  t.after(() => db.close())
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"旧内容甲"'`).get().c, 0, '旧 FTS 行残留（R6）')
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"新内容乾"'`).get().c, 1)
  assert.deepEqual(validateIndex(db).problems, [], '词表级对账：零残留（R6 反例过检）')
})

test('批量增量回归：单文件失败不得吞掉后续文件（splice 迭代坑）', async (t) => {
  const vault = makeVault(t, {
    'wiki/a.md': 'A 篇初始内容甲乙丙丁',
    'wiki/b.md': 'B 篇初始内容乙丙丁戊',
  })
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  const files = ['wiki/a.md', 'wiki/b.md']
  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })

  // a 换体含 BOOM（SQL 层 RAISE 必炸）；b 正常换体——a 先处理，b 不得被吞
  db.exec(`CREATE TRIGGER boom BEFORE INSERT ON chunks WHEN new.content LIKE '%BOOM%' BEGIN
             SELECT RAISE(ABORT, 'boom'); END;`)
  fs.writeFileSync(path.join(vault, 'wiki/a.md'), 'A 篇 BOOM 内容甲乙丙丁')
  fs.writeFileSync(path.join(vault, 'wiki/b.md'), 'B 篇换后内容庚辛壬癸')

  const res = applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files })
  assert.deepEqual(res.skipped.map((s) => s.path), ['wiki/a.md'])
  assert.deepEqual(res.updated, ['wiki/b.md'], 'b 必须照常更新（失败只影响 a）')
  const got = rows(db, `SELECT path, hash FROM docs ORDER BY path`)
  assert.deepEqual(got, [
    { path: 'wiki/a.md', hash: bodyHash('A 篇初始内容甲乙丙丁') },
    { path: 'wiki/b.md', hash: bodyHash('B 篇换后内容庚辛壬癸') },
  ], 'a 回滚保旧体 + b 已换新体')
  assert.ok(rows(db, `SELECT content FROM chunks`).some((c) => c.content.includes('B 篇换后')), 'b 的块已换新')
})
