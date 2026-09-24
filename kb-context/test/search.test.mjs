// search 单测（T3）：真开 T2 索引库、真跑 FTS5/LIKE——禁 mock 自嗨。
// 反例必含：①FTS 语法注入词被中和 ②1-2 字中文短词命中（A1 PoC 组成）③空词走 LIKE 不炸
//           ④deadline 超时路径 ⑤JSON 序列化无 -0/NaN（R12）。
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

const { openDb, applyIncremental } = await import('../lib/index-db.js')
const { search, compileQuery, estimateTokens, normalizeScore, installDeadlineGuard } = await import('../lib/search.js')

function tmpDir(t, prefix = 'kb-search-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function makeVault(t, files) {
  const dir = tmpDir(t, 'kb-vault-')
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return dir
}

/** 真 vault + 真 T2 增量索引 → 搜索用库（集成口径，非构造内存行） */
function mkdb(t, files) {
  const vault = makeVault(t, files)
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  applyIncremental(db, { vaultRoot: vault, scope: { indexAll: ['wiki'] }, files: Object.keys(files) })
  return db
}

// ── S1：查询编译（逐词引号 OR + 引号加倍 + 短词/空词路由 + LIKE 转义） ──

test('compileQuery：逐词引号 OR 编译，词内引号加倍（防 FTS 语法注入）', () => {
  const q = compileQuery('数据库 性能调优')
  assert.deepEqual(q.words, ['数据库', '性能调优'])
  assert.deepEqual(q.ftsWords, ['数据库', '性能调优'])
  assert.deepEqual(q.likeWords, [])
  assert.equal(q.match, '"数据库" OR "性能调优"')
  assert.deepEqual(q.likePatterns, [])

  // 语法关键字/通配/括号逐字关进引号；词内引号加倍转义
  assert.equal(compileQuery('NEAR').match, '"NEAR"')
  assert.equal(compileQuery('foo"').match, '"foo"""')
  assert.equal(compileQuery('(abc').match, '"(abc"') // 含括号的 ≥3 码点词照进 MATCH（括号被关进引号）
  assert.equal(compileQuery('a*b').match, '"a*b"')
  assert.equal(compileQuery('AND NOT NEAR').match, '"AND" OR "NOT" OR "NEAR"')
  assert.deepEqual(compileQuery('AND OR NOT NEAR').likeWords, ['OR'], '2 码点关键字也是短词盲区 → LIKE 兜底')
  // 查询词原样透传：折叠由 FTS5 查询侧做（与 index-db.trigramTerms 同源 parity，不重实现）
  assert.equal(compileQuery('İstanbul').match, '"İstanbul"')
})

test('compileQuery：1-2 字短词走 LIKE 兜底（trigram 盲区），通配/转义符逐个 ESCAPE 前缀（R11）', () => {
  const s = compileQuery('数据库 ab')
  assert.equal(s.match, '"数据库"')
  assert.deepEqual(s.ftsWords, ['数据库'])
  assert.deepEqual(s.likeWords, ['ab'])
  assert.deepEqual(s.likePatterns, ['%ab%'])

  // R11：ESCAPE '!'（禁 '\\' 三层转义）；%/_/! 全部 '!' 前缀
  assert.deepEqual(compileQuery('%').likePatterns, ['%!%%'])
  assert.deepEqual(compileQuery('_').likePatterns, ['%!_%'])
  assert.deepEqual(compileQuery('a%').likePatterns, ['%a!%%'])
  assert.deepEqual(compileQuery('_!').likePatterns, ['%!_!!%'])
})

test('compileQuery：空查询 match=null（MATCH \'\' 是语法错误），整查询走 LIKE', () => {
  for (const q of ['', '   ']) {
    const c = compileQuery(q)
    assert.equal(c.match, null)
    assert.deepEqual(c.words, [])
    assert.deepEqual(c.likePatterns, ['%%'])
  }
})

// ── S2：行为反例（真检索） ──

test('① FTS 语法注入词被中和：NEAR/*/引号按字面命中，无语法错、无通配逃逸', async (t) => {
  const db = mkdb(t, {
    'wiki/inject.md': '文档包含 NEAR 与 a*b 与 (括号 与 foo" OR "bar 逃逸串',
    'wiki/axb.md': 'axb 不该被通配命中',
    'wiki/plain.md': '普通内容壬癸子丑',
  })
  // NEAR 是 FTS5 关键字：必须被引号中和为字面词
  assert.deepEqual(search(db, 'NEAR').hits.map((h) => h.path), ['wiki/inject.md'])
  // * 不是通配符：a*b 只命名字面 a*b，不命中 axb
  assert.deepEqual(search(db, 'a*b').hits.map((h) => h.path), ['wiki/inject.md'])
  // 引号逃逸串：foo" OR "bar 不炸、按组成词字面命中
  assert.deepEqual(search(db, 'foo" OR "bar').hits.map((h) => h.path), ['wiki/inject.md'])
  // 单字符 * 走 LIKE 兜底也只命名字面 *（'!' 转义后非通配）
  assert.deepEqual(search(db, '*').hits.map((h) => h.path), ['wiki/inject.md'])
  // 裸括号短语
  assert.deepEqual(search(db, '(括号').hits.map((h) => h.path), ['wiki/inject.md'])
})

test('② 1-2 字中文短词命中（A1 PoC 组成：短词/长句/标识符三类查询）', async (t) => {
  const db = mkdb(t, {
    'wiki/short.md': '数据库系统概述\n第二行内容\n数据是关键',
    'wiki/long.md': '这是一段很长的查询句子用于召回测试的文档正文',
    'wiki/ident.md': '调用 chunkText 与 kb-index 分块入口',
  })
  // 短词（1-2 字 CJK，trigram 盲区）→ LIKE 兜底命中；纯词法路径标 degraded:'lexical'
  const r = search(db, '数据')
  assert.deepEqual(r.hits.map((h) => h.path), ['wiki/short.md'])
  assert.deepEqual(r.hits[0].lines, [1, 3])
  assert.equal(r.degraded, 'lexical')
  // 1 字也命中
  assert.deepEqual(search(db, '库').hits.map((h) => h.path), ['wiki/short.md'])
  // 长句查询（FTS 短语）
  assert.deepEqual(search(db, '这是一段很长的查询句子').hits.map((h) => h.path), ['wiki/long.md'])
  // 标识符查询
  assert.deepEqual(search(db, 'chunkText').hits.map((h) => h.path), ['wiki/ident.md'])
})

test('③ 空词走 LIKE 不炸：browse 全量、确定性序、受 maxSnippets 截断', async (t) => {
  const db = mkdb(t, {
    'wiki/a.md': '甲篇内容',
    'wiki/b.md': '乙篇内容',
    'wiki/c.md': '丙篇内容',
    'wiki/d.md': '丁篇内容',
  })
  for (const q of ['', '   ']) {
    const r = search(db, q)
    assert.equal(r.degraded, 'lexical')
    assert.deepEqual(r.hits.map((h) => h.path), ['wiki/a.md', 'wiki/b.md', 'wiki/c.md'], 'browse 受 maxSnippets=3 截断且确定性序')
  }
  assert.deepEqual(search(db, '', { maxSnippets: 2 }).hits.map((h) => h.path), ['wiki/a.md', 'wiki/b.md'])
})

test('④ deadline 超时路径：即刻返回 {hits:[], degraded:"timeout"}，不阻塞会话', async (t) => {
  const db = mkdb(t, { 'wiki/a.md': '数据库内容甲乙丙丁' })
  for (const q of ['数据库', '数据', '']) {
    const t0 = Date.now()
    const r = search(db, q, { timeoutMs: 0 })
    assert.deepEqual(r, { hits: [], degraded: 'timeout' })
    assert.ok(Date.now() - t0 < 1000, '超时路径必须秒回（DatabaseSync 阻塞亦不卡会话）')
  }
  // 正常超时不受影响
  const ok = search(db, '数据库', { timeoutMs: 2000 })
  assert.equal(ok.hits.length, 1)
  assert.equal(ok.degraded, undefined)
})

test('SQL 内置 deadline 守卫：过期抛错中止语句（UDF 逐行评估，AbortSignal 无效的替代）', async (t) => {
  const db = mkdb(t, { 'wiki/a.md': '数据库 内容甲乙丙丁' })
  installDeadlineGuard(db, Date.now() - 1)
  // FTS 路径：守卫在 WHERE 内逐行评估，过期即中止
  assert.throws(
    () => db.prepare(`SELECT count(*) c FROM chunks_fts WHERE chunks_fts MATCH '"数据库"' AND kb_deadline_ok()`).get(),
    /deadline/,
  )
  // LIKE 路径：全表扫描同样受守卫
  assert.throws(
    () => db.prepare(`SELECT count(*) c FROM chunks WHERE content LIKE '%数据%' ESCAPE '!' AND kb_deadline_ok()`).get(),
    /deadline/,
  )
  // 未过期不误伤
  installDeadlineGuard(db, Date.now() + 60_000)
  assert.equal(db.prepare(`SELECT count(*) c FROM chunks WHERE kb_deadline_ok()`).get().c, 1)
})

test('⑤ JSON 序列化无 -0/NaN：bm25 归一防负零（R12）', async (t) => {
  // 归一函数边界：bm25 无 MATCH 实测返回 -0；-0/NaN/±Inf/正值全部收敛为 +0
  for (const v of [-0, 0, NaN, Infinity, -Infinity, 0.5]) {
    const s = normalizeScore(v)
    assert.ok(Object.is(s, 0), `normalizeScore(${String(v)}) 应为 +0，实得 ${String(s)}`)
    assert.ok(Number.isFinite(s))
  }
  assert.ok(Math.abs(normalizeScore(-2) - 2 / 3) < 1e-12, '负值归一到 (0,1)：n/(1+n)')
  const tiny = normalizeScore(-1e-6)
  assert.ok(tiny > 0 && tiny < 1)

  // 全路径产物：数值有限、无 -0；JSON 往返严格相等（deepStrictEqual 区分 -0/+0 → 红）
  const db = mkdb(t, { 'wiki/a.md': '数据库 性能调优 甲乙丙', 'wiki/b.md': 'zz ab 数据' })
  for (const q of ['数据库', '数据', '', 'NEAR', '数据库 ab']) {
    const r = search(db, q)
    const json = JSON.stringify(r)
    assert.ok(!json.includes('null'), `NaN 会序列化成 null：${json}`)
    assert.deepEqual(JSON.parse(json), r, 'JSON 往返不得引入/丢失 -0 与精度')
    for (const h of r.hits) {
      assert.ok(Number.isFinite(h.score), `score 非有限值：${String(h.score)}`)
      assert.ok(!Object.is(h.score, -0), 'score 不得是 -0（R12）')
    }
  }
})

// ── S3：排序 / snippet 口径 / 预算截断 / 合并与形状 ──

test('bm25 ASC：词频高在前，score 归一后越大越优（排序语义锁定）', async (t) => {
  const db = mkdb(t, {
    'wiki/a.md': '重复词 重复词 重复词 重复词 重复词 内容',
    'wiki/b.md': '重复词 出现一次 内容',
  })
  const r = search(db, '重复词')
  assert.deepEqual(r.hits.map((h) => h.path), ['wiki/a.md', 'wiki/b.md'])
  assert.ok(r.hits[0].score > r.hits[1].score, `score 越大越优：${r.hits[0].score} vs ${r.hits[1].score}`)
  assert.equal(r.degraded, undefined)
})

test('snippet 口径：查询词位置前 80/后 220 字符（边界钳制不补齐）', async (t) => {
  const long = 'x'.repeat(100) + '目标词' + 'y'.repeat(300)
  const nearStart = 'a'.repeat(50) + '短词' + 'b'.repeat(400)
  const db = mkdb(t, { 'wiki/snip.md': long, 'wiki/head.md': nearStart })

  const hit = search(db, '目标词').hits.find((h) => h.path === 'wiki/snip.md')
  assert.equal(hit.snippet, long.slice(100 - 80, 100 + 220), '词位前 80 / 后 220')

  const hit2 = search(db, '短词').hits.find((h) => h.path === 'wiki/head.md')
  assert.equal(hit2.snippet, nearStart.slice(0, 50 + 220), '靠左钳制：不足 80 不补齐')
})

test('截断：≤maxSnippets 片段 / ≤maxTokens token（首条必保）；estimateTokens 粗口径', async (t) => {
  const files = {}
  for (const n of ['一', '二', '三', '四', '五']) files[`wiki/${n}.md`] = `预算词 出现在第${n}篇的正文内容`
  const db = mkdb(t, files)

  assert.equal(search(db, '预算词').hits.length, 3, '默认 ≤3 片段')
  assert.equal(search(db, '预算词', { maxSnippets: 2 }).hits.length, 2)
  assert.equal(search(db, '预算词', { maxSnippets: 5, maxTokens: 1 }).hits.length, 1, '超预算只保首条（首条必保）')
  assert.equal(search(db, '预算词', { maxSnippets: 5, maxTokens: 10000 }).hits.length, 5)

  // 粗口径：CJK≈1 token/码点，其余 ≈4 字符 1 token
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateTokens('甲乙丙丁'), 4)
  assert.equal(estimateTokens('abcd'), 1)
  assert.equal(estimateTokens('ab cd'), 2)
})

test('混合查询 OR 合并：FTS 命中 + 短词 LIKE 兜底命中（BM25 序在前）', async (t) => {
  const db = mkdb(t, {
    'wiki/long.md': '数据库 性能调优正文内容甲乙丙',
    'wiki/short2.md': 'zz ab 杂条目',
  })
  const r = search(db, '数据库 ab')
  assert.deepEqual(r.hits.map((h) => h.path), ['wiki/long.md', 'wiki/short2.md'])
  // Ruling：degraded:'lexical' 只标注纯词法路径（BM25 未参与排序）；FTS 参与的混合查询不降级
  assert.equal(r.degraded, undefined)
})

test('hit 契约形状：{path, lines:[s,e], score, snippet} 精确键 + 行号出处', async (t) => {
  const db = mkdb(t, { 'wiki/shapes.md': '第一行甲乙丙\n第二行目标戊己\n第三行庚辛壬癸' })
  const r = search(db, '目标戊') // ≥3 码点走 FTS：未降级，不带 degraded 键
  assert.deepEqual(Object.keys(r), ['hits'], '未降级不带 degraded 键')
  assert.deepEqual(Object.keys(r.hits[0]), ['path', 'lines', 'score', 'snippet'])
  assert.equal(r.hits[0].path, 'wiki/shapes.md')
  assert.deepEqual(r.hits[0].lines, [1, 3], '出处 = startLine-endLine（整块行域）')
  assert.ok(Number.isFinite(r.hits[0].score))
  assert.ok(r.hits[0].snippet.includes('目标'))
})
