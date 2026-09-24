// tools 单测（T6）：真 defineTool（@deepseek-ai/dsh-tools 真件）+ 真 T2 索引库 + 真 T3 search——禁 mock 自嗨。
// 必含反例（brief 钉住）：①description 含 score 语义字样（detpecca 教训）②wiki_read 三态（正文/
//   (page not found)/(invalid or unreadable path)，含 ../ 穿越与绝对路径负例）③部分失败不整体炸
//   ④JSON 无 -0/NaN（R12）⑤search degraded 两态透传。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools' // 真宿主件（类型 peer）：真验 schema 编译/参数校验

// node:sqlite 实验性警告降噪：只吞 ExperimentalWarning，其余警告照打（输出干净）
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w?.name !== 'ExperimentalWarning') console.error(String(w?.stack || w))
})

const { openDb, applyIncremental } = await import('../lib/index-db.js')
const { search } = await import('../lib/search.js')
const {
  buildTools, readPagesFromDb, reassemblePage, isSafeRelPath, finiteScore,
  PAGE_NOT_FOUND, INVALID_PATH, TRUNCATED, MAX_PAGE_CHARS, MAX_TOTAL_CHARS,
} = await import('../lib/tools.js')

function tmpDir(t, prefix = 'kb-tools-') {
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

/** 工具面构造（缝=真件绑定真库；被测逻辑=工具定义与 execute，不模拟） */
function mktools(t, files, configSource = () => ({})) {
  const db = mkdb(t, files)
  const [wikiSearch, wikiRead] = buildTools({
    defineTool,
    search: (query, opts) => search(db, query, opts),
    readPages: (paths, opts) => readPagesFromDb(db, paths, opts),
    configSource,
  })
  return { wikiSearch, wikiRead, db }
}

const EXEC = { signal: new AbortController().signal }
const FIXTURE = {
  'wiki/cost.md': '医院成本核算口径说明\n第二行内容\n第三行内容',
  'wiki/oa.md': '致远OA 流程配置说明\n第二行内容',
  'wiki/yonyou.md': '用友 NC 凭证接口说明\n第二行内容',
}

// ── S1：wiki_search 工具面 ──────────────────────────────────────────────────

test('wiki_search description 含 score 语义字样 + 出处 path:lines + limit 默认值（detpecca 教训）', (t) => {
  const { wikiSearch: ws } = mktools(t, FIXTURE)
  assert.equal(ws.name, 'wiki_search')
  const d = ws.description
  assert.ok(d.includes('分数是排序权重非相似度'), 'score 语义必须明说（模型易误读为相似度）')
  assert.ok(d.includes('path') && d.includes('lines'), 'description 须写明出处含 path:lines')
  assert.ok(d.includes('行号'), 'description 须写明 lines 是行号区间')
  assert.match(d, /limit[^]*默认/, 'description 须写明 limit 默认值')
})

test('wiki_search 真库命中：hits 形状含出处 path:lines + score ∈ [0,1) + snippet', async (t) => {
  const { wikiSearch: ws } = mktools(t, FIXTURE)
  const out = await ws.execute({ query: '成本核算' }, EXEC)
  assert.ok(Array.isArray(out.hits))
  assert.ok(out.hits.length >= 1)
  const hit = out.hits[0]
  assert.deepEqual(Object.keys(hit).sort(), ['lines', 'path', 'score', 'snippet'])
  assert.equal(hit.path, 'wiki/cost.md')
  assert.deepEqual(hit.lines, [1, 3], '出处行号区间来自真 T2 分块')
  assert.equal(typeof hit.score, 'number')
  assert.ok(hit.score > 0 && hit.score < 1, 'BM25 归一 score ∈ (0,1)')
  assert.ok(hit.snippet.includes('成本核算'))
  assert.ok(!('degraded' in out), 'BM25 正常路径无 degraded')
})

test('wiki_search degraded 两态透传：纯短词=lexical、超时配置=timeout', async (t) => {
  const { wikiSearch: ws } = mktools(t, FIXTURE)
  const lex = await ws.execute({ query: '的' }, EXEC) // 1 码点短词 → 纯 LIKE 兜底路径
  assert.equal(lex.degraded, 'lexical', "短词纯词法路径 degraded:'lexical' 透传")

  const { wikiSearch: ws2 } = mktools(t, FIXTURE, () => ({ timeoutMs: 0 })) // 0=立即超时（T3/T5 既定语义）
  const slow = await ws2.execute({ query: '成本核算' }, EXEC)
  assert.equal(slow.degraded, 'timeout', "超时降级 degraded:'timeout' 透传")
  assert.deepEqual(slow.hits, [], '立即超时不产命中')
})

test('wiki_search JSON 输出无 -0/NaN（R12）：数值遍历 + 序列化回读等值', async (t) => {
  const { wikiSearch: ws } = mktools(t, FIXTURE)
  for (const q of ['成本核算', '的', 'zzz_nomatch_qqq']) {
    const out = await ws.execute({ query: q }, EXEC)
    const nums = []
    ;(function walk(v) {
      if (typeof v === 'number') nums.push(v)
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    })(out)
    for (const n of nums) {
      assert.ok(Number.isFinite(n), `JSON 数值必须有限（NaN/Inf 序列化会变 null）：${String(n)}`)
      assert.ok(!Object.is(n, -0), 'JSON 禁负零（R12）')
    }
    // 序列化回读等值：NaN/Inf → null、深比较钉住（deepStrictEqual 严格区分 ±0/NaN）
    assert.deepEqual(JSON.parse(JSON.stringify(out)), out)
  }
})

test('finiteScore 断言层兜：-0/NaN/±Inf/负值收敛 +0，正值原样', () => {
  assert.ok(Object.is(finiteScore(-0), 0) && !Object.is(finiteScore(-0), -0), '-0 → +0')
  assert.equal(finiteScore(NaN), 0)
  assert.equal(finiteScore(Infinity), 0)
  assert.equal(finiteScore(-Infinity), 0)
  assert.equal(finiteScore(-0.7), 0)
  assert.equal(finiteScore(0), 0)
  assert.equal(finiteScore(0.5), 0.5)
})

test('wiki_search limit：默认取 config budget.maxSnippets（per-call 热改），显式 limit 优先', async (t) => {
  const rawConfig = { budget: { maxSnippets: 2, maxTokens: 2000 } }
  const { wikiSearch: ws } = mktools(t, FIXTURE, () => rawConfig)
  const two = await ws.execute({ query: '第二行内容' }, EXEC)
  assert.equal(two.hits.length, 2, '默认 limit=配置 budget.maxSnippets')

  rawConfig.budget.maxSnippets = 1 // 热改（原位变更，per-call 读当前值）
  const one = await ws.execute({ query: '第二行内容' }, EXEC)
  assert.equal(one.hits.length, 1, '热改后默认值跟着变')

  const explicit = await ws.execute({ query: '第二行内容', limit: 3 }, EXEC)
  assert.equal(explicit.hits.length, 3, '显式 limit 覆盖默认')
})

// ── S2：wiki_read 软错误读（三态 + 截断） ────────────────────────────────────

test('wiki_read description 写明三态标记与截断语义（契约字面量对齐）', (t) => {
  const { wikiRead } = mktools(t, FIXTURE)
  assert.equal(wikiRead.name, 'wiki_read')
  const d = wikiRead.description
  assert.ok(d.includes(PAGE_NOT_FOUND), 'description 须写明缺失标记字面')
  assert.ok(d.includes(INVALID_PATH), 'description 须写明不安全/读失败标记字面')
  assert.ok(d.includes(TRUNCATED), 'description 须写明截断标记字面')
  assert.ok(d.includes('相对路径'), 'description 须写明路径口径（vault 相对路径）')
})

test('wiki_read 三态：正文 / (page not found) / (invalid or unreadable path)', async (t) => {
  const db = mkdb(t, { 'wiki/ok.md': '第一行\n第二行' })
  const pages = readPagesFromDb(db, ['wiki/ok.md', 'wiki/missing.md', '/etc/passwd']).pages
  assert.equal(pages['wiki/ok.md'], '第一行\n第二行', '正常页返回精确正文')
  assert.equal(pages['wiki/missing.md'], PAGE_NOT_FOUND, '缺失页 → (page not found)')
  assert.equal(pages['/etc/passwd'], INVALID_PATH, '绝对路径 → (invalid or unreadable path)')
})

test('wiki_read 路径负例全数拒：../ 穿越 / 绝对路径 / 反斜杠 / 空段 / 非字符串', async (t) => {
  const db = mkdb(t, { 'wiki/ok.md': '正文' })
  const bad = ['../x.md', 'a/../../b', '/etc/passwd', 'C:\\x', 'wiki\\x', '', 'wiki//x', './x', 'a/./b', 'wiki/']
  for (const p of bad) {
    assert.equal(isSafeRelPath(p), false, `必须判不安全：${JSON.stringify(p)}`)
    assert.equal(readPagesFromDb(db, [p]).pages[p], INVALID_PATH, `必须标 invalid：${JSON.stringify(p)}`)
  }
  assert.equal(isSafeRelPath('wiki/ok.md'), true, 'vault 相对路径判安全')
  const mixed = readPagesFromDb(db, [42, null]).pages
  assert.equal(mixed['42'], INVALID_PATH, '非字符串 → invalid（键取 String 化）')
  assert.equal(mixed['null'], INVALID_PATH, 'null → invalid')
})

test('wiki_read 部分失败不整体炸（detpecca 范式）：混合批量逐键标记', async (t) => {
  const { wikiRead } = mktools(t, FIXTURE)
  const out = await wikiRead.execute(
    { paths: ['wiki/cost.md', 'wiki/nope.md', '../etc/passwd', 'wiki/oa.md'] },
    EXEC,
  )
  assert.deepEqual(Object.keys(out), ['pages'])
  assert.equal(out.pages['wiki/cost.md'], '医院成本核算口径说明\n第二行内容\n第三行内容')
  assert.equal(out.pages['wiki/nope.md'], PAGE_NOT_FOUND)
  assert.equal(out.pages['../etc/passwd'], INVALID_PATH)
  assert.equal(out.pages['wiki/oa.md'], '致远OA 流程配置说明\n第二行内容', '后续路径照常处理')
})

test('wiki_read 截断：每页上限 + \n(truncated) 标记（默认 8000 锁定）', async (t) => {
  assert.equal(MAX_PAGE_CHARS, 8_000, '默认每页上限测试锁定')
  // 小上限精确锁行为（含硬切段重组：9000 字符单行 → 12 段 → 重组精确 → 截断）
  const db = mkdb(t, { 'wiki/big.md': '文'.repeat(9_000) })
  const small = readPagesFromDb(db, ['wiki/big.md'], { maxPageChars: 10, maxTotalChars: 100 }).pages
  assert.equal(small['wiki/big.md'], '文'.repeat(10) + '\n' + TRUNCATED)

  // 默认上限走工具面（真库）
  const { wikiRead } = mktools(t, { 'wiki/big.md': '文'.repeat(9_000) })
  const out = await wikiRead.execute({ paths: ['wiki/big.md'] }, EXEC)
  assert.equal(out.pages['wiki/big.md'].length, MAX_PAGE_CHARS + 1 + TRUNCATED.length)
  assert.ok(out.pages['wiki/big.md'].startsWith('文'.repeat(80)))
  assert.ok(out.pages['wiki/big.md'].endsWith('\n' + TRUNCATED))
})

test('wiki_read 合计上限：跨页预算耗尽后置 (truncated)，不整体炸', async (t) => {
  assert.equal(MAX_TOTAL_CHARS, 32_000, '默认合计上限测试锁定')
  const db = mkdb(t, { 'wiki/a.md': 'A'.repeat(50), 'wiki/b.md': 'B'.repeat(50) })
  const pages = readPagesFromDb(db, ['wiki/a.md', 'wiki/b.md'], { maxPageChars: 100, maxTotalChars: 60 }).pages
  assert.equal(pages['wiki/a.md'], 'A'.repeat(50), '首篇全额')
  assert.equal(pages['wiki/b.md'], 'B'.repeat(10) + '\n' + TRUNCATED, '次篇压进剩余预算')
  const pages2 = readPagesFromDb(db, ['wiki/a.md', 'wiki/b.md'], { maxPageChars: 30, maxTotalChars: 30 }).pages
  assert.equal(pages2['wiki/a.md'], 'A'.repeat(30) + '\n' + TRUNCATED)
  assert.equal(pages2['wiki/b.md'], TRUNCATED, '预算耗尽 → (truncated) 整值')
})

test('wiki_read 空页与缺库：空文本照实返回、缺库全 (page not found)（读侧零副作用）', async (t) => {
  const db = mkdb(t, { 'wiki/empty.md': '', 'wiki/ok.md': '正文' })
  assert.equal(readPagesFromDb(db, ['wiki/empty.md']).pages['wiki/empty.md'], '', '空页=空文本（非 not found）')

  // 缺库（null 缝）：不建库零副作用，有效路径 → not found，不安全路径照旧 invalid
  const pages = readPagesFromDb(null, ['wiki/ok.md', '../x']).pages
  assert.equal(pages['wiki/ok.md'], PAGE_NOT_FOUND)
  assert.equal(pages['../x'], INVALID_PATH)
})

test('reassemblePage 重组精确：重叠块幂等覆盖 + 硬切段同行拼接', () => {
  // 行粒度重叠（T2 chunkText 口径）：共享行内容全等 → 覆盖幂等
  assert.equal(reassemblePage([
    { chunk_idx: 0, start_line: 1, end_line: 2, content: 'A\nB' },
    { chunk_idx: 1, start_line: 2, end_line: 3, content: 'B\nC' },
  ]), 'A\nB\nC')
  // 硬切段（超长单行）：同行多段按 chunk_idx 拼接还原一行
  assert.equal(reassemblePage([
    { chunk_idx: 0, start_line: 5, end_line: 5, content: '12345' },
    { chunk_idx: 1, start_line: 5, end_line: 5, content: '678' },
  ]), '12345678')
  // 整行单块（≤maxChars）后接他行块：不重复不追加
  assert.equal(reassemblePage([
    { chunk_idx: 0, start_line: 1, end_line: 1, content: 'X' },
    { chunk_idx: 1, start_line: 2, end_line: 3, content: 'Y\nZ' },
  ]), 'X\nY\nZ')
  assert.equal(reassemblePage([]), '', '空文本 → 空串')
})

// ── S3：apply 注册接线 ──────────────────────────────────────────────────────

test('apply 注册 wiki_search/wiki_read（ctx.tools.register；真 defineTool 参数校验必拒坏参）', async () => {
  const { apply } = await import('../lib/index.js')
  const regs = []
  apply({ on: () => {}, tools: { register: (tool) => regs.push(tool) }, logger: { warn: () => {} } }, {})
  assert.deepEqual(regs.map((tool) => tool.name), ['wiki_search', 'wiki_read'])
  for (const tool of regs) {
    assert.equal(typeof tool.description, 'string')
    assert.equal(typeof tool.execute, 'function')
    assert.ok(tool.parameters && typeof tool.parameters === 'object', '输出面向模型的参数 schema 在位')
  }
  await assert.rejects(
    () => regs[0].execute({}, EXEC),
    (e) => Array.isArray(e?.violations) && e.violations.length > 0,
    '缺 required query 必拒（defineTool 真校验，非 mock）',
  )
})

test('apply e2e（HOME 隔离真活跃库）：注册工具真跑检索/读页，读侧零副作用', async (t) => {
  const { apply } = await import('../lib/index.js')
  const { openDb, registerScope, applyIncremental } = await import('../lib/index-db.js')
  const home = tmpDir(t, 'kb-home-')
  const origHome = process.env.HOME
  process.env.HOME = home
  t.after(() => { process.env.HOME = origHome })

  const vault = makeVault(t, { 'wiki/cost.md': '医院成本核算口径说明\n第二行内容' })
  const dbPath = path.join(home, '.dsh', 'kb-index', 'active.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = openDb(dbPath)
  registerScope(db, { indexAll: ['wiki'] })
  applyIncremental(db, { vaultRoot: vault, scope: { indexAll: ['wiki'] }, files: ['wiki/cost.md'] })
  db.close()

  const regs = []
  apply({ on: () => {}, tools: { register: (tool) => regs.push(tool) }, logger: { warn: () => {} } }, {})
  const [ws, wr] = regs
  const out = await ws.execute({ query: '成本核算' }, EXEC)
  assert.equal(out.hits[0]?.path, 'wiki/cost.md', '经 index.js runSearch 真件检索真活跃库')
  assert.deepEqual(out.hits[0]?.lines, [1, 2])

  const read = await wr.execute({ paths: ['wiki/cost.md', 'wiki/none.md', '../x'] }, EXEC)
  assert.equal(read.pages['wiki/cost.md'], '医院成本核算口径说明\n第二行内容', '经 runReadPages 真件读真活跃库')
  assert.equal(read.pages['wiki/none.md'], PAGE_NOT_FOUND)
  assert.equal(read.pages['../x'], INVALID_PATH)
})

test('apply fail-open 双向（INV-15 禁静默）：缺 ctx.tools 留痕仍注册 pre-step；缺 ctx.on 留痕仍注册工具', async () => {
  const { apply } = await import('../lib/index.js')

  // ① 缺 ctx.tools：告警留痕 + pre-step 照常注册
  const warnings = []
  const onRegs = []
  apply({ on: (event, fn, opts) => onRegs.push({ event, fn, opts }), logger: { warn: (l) => warnings.push(l) } }, {})
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /ctx\.tools/)
  assert.equal(onRegs.length, 1, '工具缝缺失不得阻断 pre-step 注册')
  assert.equal(onRegs[0].event, 'agent/pre-step')

  // ② 缺 ctx.on：告警留痕 + 工具照常注册
  const warnings2 = []
  const toolRegs = []
  apply({ tools: { register: (tool) => toolRegs.push(tool) }, logger: { warn: (l) => warnings2.push(l) } }, {})
  assert.equal(warnings2.length, 1)
  assert.match(warnings2[0], /ctx\.on/)
  assert.deepEqual(toolRegs.map((tool) => tool.name), ['wiki_search', 'wiki_read'])
})

test('wiki_read 键集安全化：__proto__ 路径键不丢（审中 finding 回归钉住）', async (t) => {
  const db = mkdb(t, { 'wiki/ok.md': '正文' })
  const { pages } = readPagesFromDb(db, ['__proto__', 'constructor', 'wiki/ok.md'])
  assert.ok(Object.hasOwn(pages, '__proto__'), "'__proto__' 必须落 own key（禁 setter 静默丢键）")
  assert.equal(pages.__proto__, PAGE_NOT_FOUND, '合法形式但缺失 → (page not found)')
  assert.ok(Object.hasOwn(pages, 'constructor'))
  assert.equal(pages.constructor, PAGE_NOT_FOUND)
  assert.equal(pages['wiki/ok.md'], '正文')
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), pages, 'JSON 序列化回读键值全量保留')
})
