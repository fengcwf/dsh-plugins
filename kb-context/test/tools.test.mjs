// tools 单测（T6；R1 改判 2026-09-24）：真 defineTool（@deepseek-ai/dsh-tools 真件）+ 真 T2 索引库 + 真 T3 search
// + 真临时 vault 目录 fs 直读——禁 mock 自嗨。
// 必含反例（brief 钉住）：①description 含 score 语义字样（detpecca 教训）②wiki_read 三态（正文/
//   (page not found)/(invalid or unreadable path)，含 ../ 穿越与绝对路径负例）③部分失败不整体炸
//   ④JSON 无 -0/NaN（R12）⑤search degraded 透传（lexical/timeout 两态 + config salvage 携带态）。
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
  buildTools, readPagesFromFs, currentConfig, isSafeRelPath, finiteScore,
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

/** 工具面构造：search 缝=真 T2 索引库 + 真 T3 search；readPages 缝=真临时 vault fs 直读（root 走 config） */
function mktools(t, files, configSource = () => ({})) {
  const vault = makeVault(t, files)
  const db = openDb(path.join(tmpDir(t), 'idx.db'))
  t.after(() => db.close())
  applyIncremental(db, { vaultRoot: vault, scope: { indexAll: ['wiki'] }, files: Object.keys(files) })
  const [wikiSearch, wikiRead] = buildTools({
    defineTool,
    search: (query, opts) => search(db, query, opts),
    readPages: (paths, opts) => readPagesFromFs(opts?.root, paths, opts),
    // configSource 现读（per-call 热改真验）：vaultRoot 铺底（测试可用 config 覆盖），其余键测试给什么是什么
    configSource: () => ({ vaultRoot: vault, ...(typeof configSource === 'function' ? configSource() : configSource) }),
  })
  return { wikiSearch, wikiRead, db, vault }
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

test("wiki_search degraded:'config' 携带（INV-15）：config salvage 留痕，与 lexical 并存 'config' 优先", async (t) => {
  const { wikiSearch: ws } = mktools(t, FIXTURE, () => ({ timeoutMs: 'oops' })) // safeParse 失败 → salvage
  const lex = await ws.execute({ query: '的' }, EXEC) // 纯短词 = lexical 路径
  assert.equal(lex.degraded, 'config', "config salvage 留痕优先于 lexical（镜像 inject.js 'config' 优先序）")
  const hit = await ws.execute({ query: '成本核算' }, EXEC)
  assert.equal(hit.degraded, 'config', "BM25 路径同样携带 degraded:'config'（salvage 是调用级降级）")
  assert.ok(hit.hits.length >= 1, 'salvage 后检索照常产命中（保热改连续性）')
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

// ── S2：wiki_read 软错误读（fs 直读三态 + 截断） ──────────────────────────────

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
  const vault = makeVault(t, { 'wiki/ok.md': '第一行\n第二行' })
  const pages = readPagesFromFs(vault, ['wiki/ok.md', 'wiki/missing.md', '/etc/passwd']).pages
  assert.equal(pages['wiki/ok.md'], '第一行\n第二行', '正常页返回精确正文')
  assert.equal(pages['wiki/missing.md'], PAGE_NOT_FOUND, '磁盘无此文件 → (page not found)')
  assert.equal(pages['/etc/passwd'], INVALID_PATH, '绝对路径 → (invalid or unreadable path)')
})

test("wiki_read fs 直读磁盘现状：未索引/新改文件直读 + 尾随 '\\n' round-trip 不丢（重组丢尾坑回归）", async (t) => {
  // 不建索引库（未索引）：文件写盘即可读（R1 改判①：数据源=磁盘现状）
  const vault = makeVault(t, { 'wiki/fresh.md': '新鲜内容\n第二行\n\n' })
  const pages = readPagesFromFs(vault, ['wiki/fresh.md']).pages
  assert.equal(pages['wiki/fresh.md'], '新鲜内容\n第二行\n\n', 'round-trip 精确：尾随换行不丢')

  // 新改文件即时可见（内容陈旧坑回归）：改盘不改索引，直读拿最新
  fs.writeFileSync(path.join(vault, 'wiki', 'fresh.md'), '改后内容')
  assert.equal(readPagesFromFs(vault, ['wiki/fresh.md']).pages['wiki/fresh.md'], '改后内容', '磁盘现状即时生效')

  const { wikiRead } = mktools(t, FIXTURE, () => ({ vaultRoot: vault }))
  const out = await wikiRead.execute({ paths: ['wiki/fresh.md'] }, EXEC)
  assert.equal(out.pages['wiki/fresh.md'], '改后内容', '工具面同样直读磁盘现状')
})

test('wiki_read 路径负例全数拒：../ 穿越 / 绝对路径 / 反斜杠 / 空段 / 非字符串', async (t) => {
  const vault = makeVault(t, { 'wiki/ok.md': '正文' })
  const bad = ['../x.md', 'a/../../b', '/etc/passwd', 'C:\\x', 'wiki\\x', '', 'wiki//x', './x', 'a/./b', 'wiki/']
  for (const p of bad) {
    assert.equal(isSafeRelPath(p), false, `必须判不安全：${JSON.stringify(p)}`)
    assert.equal(readPagesFromFs(vault, [p]).pages[p], INVALID_PATH, `必须标 invalid：${JSON.stringify(p)}`)
  }
  assert.equal(isSafeRelPath('wiki/ok.md'), true, 'vault 相对路径判安全')
  const mixed = readPagesFromFs(vault, [42, null]).pages
  assert.equal(mixed['42'], INVALID_PATH, '非字符串 → invalid（键取 String 化）')
  assert.equal(mixed['null'], INVALID_PATH, 'null → invalid')
})

test('wiki_read symlink 逃逸全形（INV-7）：活外指/dangling 外指/目录外指 → invalid；vault 内指归一正常读', async (t) => {
  const outside = tmpDir(t, 'kb-out-')
  fs.writeFileSync(path.join(outside, 'secret.md'), 'SECRET')
  const vault = makeVault(t, { 'wiki/ok.md': '正文' })
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(vault, 'wiki', 'leak.md')) // 活外指
  fs.symlinkSync(path.join(outside, 'gone.md'), path.join(vault, 'wiki', 'dangle.md')) // dangling 外指
  fs.symlinkSync(outside, path.join(vault, 'wiki', 'ext')) // 目录外指
  fs.symlinkSync(path.join(vault, 'wiki', 'ok.md'), path.join(vault, 'wiki', 'alias.md')) // vault 内指

  const pages = readPagesFromFs(vault, [
    'wiki/leak.md', 'wiki/dangle.md', 'wiki/ext/secret.md', 'wiki/ext/gone.md', 'wiki/alias.md',
  ]).pages
  assert.equal(pages['wiki/leak.md'], INVALID_PATH, 'symlink 活外指 → invalid（不泄内容）')
  assert.equal(pages['wiki/dangle.md'], INVALID_PATH, 'dangling 外指（逃逸意图）→ invalid，非 not found')
  assert.equal(pages['wiki/ext/secret.md'], INVALID_PATH, '目录 symlink 外指（realpath 归一后判）→ invalid')
  assert.equal(pages['wiki/ext/gone.md'], INVALID_PATH, '目录外指下缺失项同样按逃逸拒（walk 预验）')
  assert.equal(pages['wiki/alias.md'], '正文', 'vault 内 symlink 归一后正常读')
  assert.ok(!Object.values(pages).includes('SECRET'), '外指内容零泄漏')
})

test('wiki_read 读失败面：目录路径 → invalid；vaultRoot 缺失 → 全 invalid（读失败非页面缺失）', async (t) => {
  const vault = makeVault(t, { 'wiki/ok.md': '正文' })
  fs.mkdirSync(path.join(vault, 'wiki', 'adir'), { recursive: true })
  assert.equal(readPagesFromFs(vault, ['wiki/adir']).pages['wiki/adir'], INVALID_PATH, '目录路径 EISDIR → invalid')

  const pages = readPagesFromFs(path.join(vault, 'no-such-root'), ['wiki/ok.md', '../x']).pages
  assert.equal(pages['wiki/ok.md'], INVALID_PATH, 'vaultRoot 坏了是读失败面（不能骗模型「页不存在」）')
  assert.equal(pages['../x'], INVALID_PATH, '不安全形仍先拒')
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
  // 小上限精确锁行为（fs 直读超长单行 → 截断标记保留）
  const vault = makeVault(t, { 'wiki/big.md': '文'.repeat(9_000) })
  const small = readPagesFromFs(vault, ['wiki/big.md'], { maxPageChars: 10, maxTotalChars: 100 }).pages
  assert.equal(small['wiki/big.md'], '文'.repeat(10) + '\n' + TRUNCATED)

  // 默认上限走工具面（真临时 vault）
  const { wikiRead } = mktools(t, { 'wiki/big.md': '文'.repeat(9_000) })
  const out = await wikiRead.execute({ paths: ['wiki/big.md'] }, EXEC)
  assert.equal(out.pages['wiki/big.md'].length, MAX_PAGE_CHARS + 1 + TRUNCATED.length)
  assert.ok(out.pages['wiki/big.md'].startsWith('文'.repeat(80)))
  assert.ok(out.pages['wiki/big.md'].endsWith('\n' + TRUNCATED))
})

test('wiki_read 合计上限：跨页预算耗尽后置 (truncated)，不整体炸', async (t) => {
  assert.equal(MAX_TOTAL_CHARS, 32_000, '默认合计上限测试锁定')
  const vault = makeVault(t, { 'wiki/a.md': 'A'.repeat(50), 'wiki/b.md': 'B'.repeat(50) })
  const pages = readPagesFromFs(vault, ['wiki/a.md', 'wiki/b.md'], { maxPageChars: 100, maxTotalChars: 60 }).pages
  assert.equal(pages['wiki/a.md'], 'A'.repeat(50), '首篇全额')
  assert.equal(pages['wiki/b.md'], 'B'.repeat(10) + '\n' + TRUNCATED, '次篇压进剩余预算')
  const pages2 = readPagesFromFs(vault, ['wiki/a.md', 'wiki/b.md'], { maxPageChars: 30, maxTotalChars: 30 }).pages
  assert.equal(pages2['wiki/a.md'], 'A'.repeat(30) + '\n' + TRUNCATED)
  assert.equal(pages2['wiki/b.md'], TRUNCATED, '预算耗尽 → (truncated) 整值')
})

test('wiki_read 每页截断不吃合计预算（fix round1 回归）：超长首篇撞页上限后，后续页仍按剩余额度返内容', (t) => {
  // 场景（审查 finding 逐字）：[big(20k), a(5k), b(5k)] 默认 8k/页、32k/合计——
  // big 截到 8k 时 cap==maxPageChars<remaining（合计预算仍有余），不得把 32k 总预算整体清零，
  // 否则 a、b 被伪装成「预算耗尽截断」整值 (truncated)（24k 预算闲置 + 误导模型）。
  const vault = makeVault(t, {
    'wiki/big.md': '文'.repeat(20_000),
    'wiki/a.md': 'A'.repeat(5_000),
    'wiki/b.md': 'B'.repeat(5_000),
  })
  const pages = readPagesFromFs(vault, ['wiki/big.md', 'wiki/a.md', 'wiki/b.md']).pages
  assert.equal(pages['wiki/big.md'], '文'.repeat(MAX_PAGE_CHARS) + '\n' + TRUNCATED, '超长首篇按每页上限截断')
  assert.equal(pages['wiki/a.md'], 'A'.repeat(5_000), 'a 按剩余额度全额返回（非整值 (truncated)）')
  assert.equal(pages['wiki/b.md'], 'B'.repeat(5_000), 'b 按剩余额度全额返回（非整值 (truncated)）')
  const total = Object.values(pages).reduce((n, s) => n + s.length, 0)
  assert.ok(total <= MAX_TOTAL_CHARS + 1 + TRUNCATED.length, `合并不超 32k+标记开销（实测 ${total}）`)
})

test('wiki_read 空页与缺失：空文本照实返回、磁盘无此文件 → (page not found)', async (t) => {
  const vault = makeVault(t, { 'wiki/empty.md': '', 'wiki/ok.md': '正文' })
  assert.equal(readPagesFromFs(vault, ['wiki/empty.md']).pages['wiki/empty.md'], '', '空页=空文本（非 not found）')
  assert.equal(readPagesFromFs(vault, ['wiki/ok.md', 'wiki/missing.md']).pages['wiki/missing.md'], PAGE_NOT_FOUND)
})

test('wiki_read 键集安全化：__proto__ 路径键不丢（审中 finding 回归钉住）', async (t) => {
  const vault = makeVault(t, { 'wiki/ok.md': '正文' })
  const { pages } = readPagesFromFs(vault, ['__proto__', 'constructor', 'wiki/ok.md'])
  assert.ok(Object.hasOwn(pages, '__proto__'), "'__proto__' 必须落 own key（禁 setter 静默丢键）")
  assert.equal(pages.__proto__, PAGE_NOT_FOUND, '合法形式但缺失 → (page not found)')
  assert.ok(Object.hasOwn(pages, 'constructor'))
  assert.equal(pages.constructor, PAGE_NOT_FOUND)
  assert.equal(pages['wiki/ok.md'], '正文')
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), pages, 'JSON 序列化回读键值全量保留')
})

// ── S2.5：vaultRoot 配置（R2 裁定） ─────────────────────────────────────────

test('vaultRoot 默认值字面锁定 + currentConfig salvage 择取/回退 + salvaged 标记', () => {
  const def = currentConfig(() => ({}))
  assert.equal(def.salvaged, false)
  assert.equal(def.cfg.vaultRoot, '/mnt/unraid_data/Obsidian', '默认 vaultRoot 字面锁定')

  const over = currentConfig(() => ({ vaultRoot: '/custom/vault' }))
  assert.equal(over.salvaged, false)
  assert.equal(over.cfg.vaultRoot, '/custom/vault', '显式覆盖生效')

  const bad = currentConfig(() => ({ timeoutMs: 'oops' }))
  assert.equal(bad.salvaged, true, 'safeParse 失败 → salvaged 标记（INV-15 携带位判据）')
  assert.equal(bad.cfg.vaultRoot, '/mnt/unraid_data/Obsidian', '坏配置无 vaultRoot → 回退默认')

  const badKeepRoot = currentConfig(() => ({ timeoutMs: 'oops', vaultRoot: '/keep/me' }))
  assert.equal(badKeepRoot.cfg.vaultRoot, '/keep/me', 'salvage raw vaultRoot 好值择取（保热改连续性）')

  const badRoot = currentConfig(() => ({ vaultRoot: 123 }))
  assert.equal(badRoot.salvaged, true)
  assert.equal(badRoot.cfg.vaultRoot, '/mnt/unraid_data/Obsidian', '坏类型 vaultRoot 回退默认')
})

test('vaultRoot 覆盖与热改：工具面 per-call 现读 root，热改即时生效', async (t) => {
  const a = makeVault(t, { 'wiki/a.md': 'A页' })
  const b = makeVault(t, { 'wiki/a.md': 'B页' })
  const raw = { vaultRoot: a }
  const { wikiRead } = mktools(t, FIXTURE, () => raw)
  assert.equal((await wikiRead.execute({ paths: ['wiki/a.md'] }, EXEC)).pages['wiki/a.md'], 'A页')

  raw.vaultRoot = b // 热改（原位变更，per-call 读当前值）
  assert.equal((await wikiRead.execute({ paths: ['wiki/a.md'] }, EXEC)).pages['wiki/a.md'], 'B页', '热改 root 即时生效')
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

test('apply e2e（HOME 隔离真活跃库 + vaultRoot fs 直读）：注册工具真跑检索/读页，读侧零副作用', async (t) => {
  const { apply } = await import('../lib/index.js')
  const { openDb, registerScope, applyIncremental } = await import('../lib/index-db.js')
  const home = tmpDir(t, 'kb-home-')
  const origHome = process.env.HOME
  process.env.HOME = home
  t.after(() => { process.env.HOME = origHome })

  // wiki/cost.md 入索引；wiki/fresh.md 只写盘不入索引（R1 改判①：未索引页照样直读）
  const vault = makeVault(t, {
    'wiki/cost.md': '医院成本核算口径说明\n第二行内容',
    'wiki/fresh.md': '未索引新改文件',
  })
  const dbPath = path.join(home, '.dsh', 'kb-index', 'active.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = openDb(dbPath)
  registerScope(db, { indexAll: ['wiki'] })
  applyIncremental(db, { vaultRoot: vault, scope: { indexAll: ['wiki'] }, files: ['wiki/cost.md'] })
  db.close()

  const regs = []
  apply({ on: () => {}, tools: { register: (tool) => regs.push(tool) }, logger: { warn: () => {} } }, { vaultRoot: vault })
  const [ws, wr] = regs
  const out = await ws.execute({ query: '成本核算' }, EXEC)
  assert.equal(out.hits[0]?.path, 'wiki/cost.md', '经 index.js runSearch 真件检索真活跃库')
  assert.deepEqual(out.hits[0]?.lines, [1, 2])

  const read = await wr.execute({ paths: ['wiki/cost.md', 'wiki/fresh.md', 'wiki/none.md', '../x'] }, EXEC)
  assert.equal(read.pages['wiki/cost.md'], '医院成本核算口径说明\n第二行内容', '经 runReadPages 真件 fs 直读')
  assert.equal(read.pages['wiki/fresh.md'], '未索引新改文件', '未索引页直读磁盘现状（索引重组误报坑回归）')
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

// ── S5：T7 空态 emptyState 软增（wiki_search 零命中可解释状态，A4） ────────────────

const EMPTY_STATE_ES = {
  state: 'excluded',
  hint: '查询目标「01-客户资料」属 grepOnDemand 按需范围（只注册不入 FTS 索引）。建议用 wiki_read 按路径直读。',
}

test('wiki_search emptyState 软增：零命中透传 + 命中不带 + 缺位/坏值丢弃（旧调用不破）+ scope 携带', async () => {
  const seen = []
  const mk = (searchImpl) => buildTools({
    defineTool,
    search: (q, o) => { seen.push(o); return searchImpl(q, o) },
    readPages: () => ({ pages: {} }),
    configSource: () => ({}),
  })[0]

  // ① 零命中 + 合法 emptyState → 原样透传（软增键出现）
  const out = await mk(() => ({ hits: [], emptyState: EMPTY_STATE_ES })).execute({ query: 'x' }, EXEC)
  assert.deepEqual(out, { hits: [], emptyState: EMPTY_STATE_ES })

  // ② scope 携带（config 热读——excluded 判据数据源）：salvage/缺省回退出厂 scope
  assert.deepEqual(seen[0].scope, {
    indexAll: ['wiki', 'raw'],
    grepOnDemand: ['01-客户资料', '02-致远OA', '03-帆软报表', '04-用友', '05-医院成本', '08-unraid'],
  }, 'search opts 携带 scope（出厂默认）')

  // ③ 命中 → 不带 emptyState（即使缝误带也裁掉——软增只挂零命中）
  const hit = { path: 'wiki/a.md', lines: [1, 2], score: 0.5, snippet: 's' }
  const out2 = await mk(() => ({ hits: [hit], emptyState: EMPTY_STATE_ES })).execute({ query: 'x' }, EXEC)
  assert.deepEqual(Object.keys(out2).sort(), ['hits'], '命中不带 emptyState')

  // ④ 旧调用面：零命中无 emptyState → 键不出现（deepEqual 全量键集）
  const out3 = await mk(() => ({ hits: [] })).execute({ query: 'x' }, EXEC)
  assert.deepEqual(out3, { hits: [] }, '缺位键不出现——旧调用不破')

  // ⑤ 坏值丢弃（normalizeEmptyState 软增闸）
  const out4 = await mk(() => ({ hits: [], emptyState: { state: 'bogus', hint: 'x' } })).execute({ query: 'x' }, EXEC)
  assert.deepEqual(out4, { hits: [] }, '非枚举 state 丢弃')
  const out5 = await mk(() => ({ hits: [], emptyState: { state: 'not-indexed', hint: 'y'.repeat(500) } })).execute({ query: 'x' }, EXEC)
  assert.equal(out5.emptyState.hint.length, 200, 'hint 钳 200')
})

test('wiki_search output.schema 增可选 emptyState（六态 enum + 顶层可选）+ description 写明 + render 含键', async () => {
  const [ws] = buildTools({
    defineTool,
    search: () => ({ hits: [], emptyState: EMPTY_STATE_ES }), // T3 缝契约：同步返回对象（async stub 会拿到 Promise）
    readPages: () => ({ pages: {} }),
    configSource: () => ({}),
  })
  const schema = ws.output.schema
  assert.ok('emptyState' in schema.properties, 'schema 增 emptyState 键')
  assert.ok(!(schema.required ?? []).includes('emptyState'), '顶层可选（软增——旧调用不破）')
  assert.equal(schema.properties.emptyState.type, 'object')
  assert.equal(schema.properties.emptyState.additionalProperties, false)
  assert.deepEqual(schema.properties.emptyState.properties.state.enum,
    ['not-indexed', 'indexing', 'failed', 'excluded', 'no-text', 'no-match'], '六态 enum 字面（含调整轮 no-match）')
  assert.deepEqual(schema.properties.emptyState.required, ['state', 'hint'], 'defineTool 编译提升对象级 required（内层两键必填）')
  assert.equal(schema.properties.emptyState.properties.hint.type, 'string')
  assert.ok(ws.description.includes('emptyState'), 'description 写明软增键')
  assert.ok(ws.description.includes('not-indexed'), 'description 写明六态字面')
  assert.ok(ws.description.includes('no-match'), 'description 写明 no-match（调整轮）')

  // render：JSON 输出含 emptyState（模型可见）
  const value = await ws.execute({ query: 'x' }, EXEC)
  const [block] = ws.output.render({ query: 'x' }, value)
  assert.equal(JSON.parse(block.text).emptyState.state, 'excluded')
})
