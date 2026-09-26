// 搜索面契约测试（T3 / OW-US-2）：查询编译纯函数 + scan 后端（限流/超时/降级）+ fts 可插拔缝 + score 语义文案。
// 必测八项中的 ①-⑥ 在本文件；⑦ node --test 全绿含 load、⑧ check-plugin PASS 见派发证据。
// 测试真验行为零 mock：真 fixture 文件系统、真实现后端；唯一注入点=后端注册缝（可插拔被测面本身）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compileQuery,
  buildSnippet,
  deriveTitle,
  createScanBackend,
  createSearchService,
} from '../lib/search.js'
import { SCORE_HINT, describeDegraded } from '../web/src/lib/search-view.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const SEARCHVAULT = path.join(FIXTURES, 'searchvault')
const ITEM_KEYS = ['line', 'path', 'score', 'snippet', 'title']

// ── ① 查询编译边界（纯函数）─────────────────────────────────────────────────
test('compileQuery 边界：空/空白/非字符串 → ok:false（bad_type/empty）', () => {
  for (const raw of ['', '   ', '\t\n']) {
    const plan = compileQuery(raw)
    assert.equal(plan.ok, false, JSON.stringify(raw))
    assert.equal(plan.reason, 'empty')
    assert.deepEqual(plan.terms, [])
  }
  for (const raw of [123, null, undefined, {}]) {
    const plan = compileQuery(raw)
    assert.equal(plan.ok, false)
    assert.equal(plan.reason, 'bad_type')
  }
})

test('compileQuery 边界：1 字/2 字短查询走 like（trigram 盲区），3 字起走 fts', () => {
  assert.deepEqual(compileQuery('中').terms, [{ text: '中', strategy: 'like' }], '1 字盲区')
  assert.deepEqual(compileQuery('中国').terms, [{ text: '中国', strategy: 'like' }], '2 字盲区（OW-US-2 LIKE 兜底）')
  assert.deepEqual(compileQuery('中国梦').terms, [{ text: '中国梦', strategy: 'fts' }], '3 字可交 trigram')
  assert.equal(compileQuery('中国').needsFallback, true)
  assert.equal(compileQuery('中国梦').allFts, true)
})

test('compileQuery 边界：中英混排按空白分词，逐词定策略（短词 like、长词 fts）', () => {
  assert.deepEqual(compileQuery('  中文   dream  ').terms, [
    { text: '中文', strategy: 'like' },
    { text: 'dream', strategy: 'fts' },
  ])
  const mixed = compileQuery('中ab')
  assert.deepEqual(mixed.terms, [{ text: '中ab', strategy: 'fts' }], '3 码点混合串可交 trigram')
  assert.equal(mixed.ok, true)
  assert.equal(compileQuery('中ab').needsFallback, false)
})

test('compileQuery 边界：纯符号词一律 like（符号盲区），带字母符号串按长度', () => {
  for (const raw of ['!!!', '###', '@#$', '中!']) {
    const plan = compileQuery(raw)
    assert.equal(plan.ok, true, raw)
    assert.equal(plan.terms[0].strategy, 'like', `纯符号/短符号兜底：${raw}`)
  }
  assert.deepEqual(compileQuery('C++').terms, [{ text: 'C++', strategy: 'fts' }], '3 码点带字母串走 fts')
})

test('buildSnippet 形态：窗口截断 + 多词高亮 <mark> + 省略号', () => {
  const s = buildSnippet('Intro line with needle word.', compileQuery('needle').terms)
  assert.equal(s, 'Intro line with <mark>needle</mark> word.')
  const multi = buildSnippet('with needle inside', compileQuery('needle inside').terms)
  assert.equal(multi, 'with <mark>needle</mark> <mark>inside</mark>')
  const long = buildSnippet('x'.repeat(400) + ' needle ' + 'y'.repeat(400), compileQuery('needle').terms)
  assert.ok(long.length < 220, '长行截窗口')
  assert.ok(long.includes('<mark>needle</mark>'))
  assert.ok(long.startsWith('…') || long.endsWith('…'), '截断出省略号')
})

// ── ③ snippet 消毒负例（HTML 注入 query / 注入行文）──────────────────────────
test('snippet 消毒负例：行文与 query 注入 HTML 一律转义，唯一标签=<mark>', () => {
  const line = 'body text with <script>alert(1)</script> inside.'
  const s = buildSnippet(line, compileQuery('script').terms)
  assert.ok(!s.includes('<script'), `不得出未转义脚本标签：${s}`)
  // 去掉高亮标记后 = 整行 escapeHtml（实体可能被 <mark> 切段，按剥离后精确核）
  assert.equal(s.replaceAll('<mark>', '').replaceAll('</mark>', ''), 'body text with &lt;script&gt;alert(1)&lt;/script&gt; inside.')
  assert.ok(/<mark>script<\/mark>/.test(s), '高亮标记存在')
  assert.ok(!/<(?!\/?mark>)/.test(s), `唯一允许标签=<mark>：${s}`)

  // query 本身即注入串：命中文本也必须实体化（ARC-1 消毒口径）
  const q = compileQuery('<img src=x onerror=alert(1)>').terms
  const s2 = buildSnippet('xx <img src=x onerror=alert(1)> yy', q)
  assert.ok(!/<(?!\/?mark>)/.test(s2), `注入 query 命中段同样转义：${s2}`)
  assert.ok(s2.includes('&lt;img'), s2)
})

test('deriveTitle：frontmatter title > 首个 H1 > basename（含行号）', () => {
  assert.deepEqual(deriveTitle('---\ntitle: Alpha Note\n---\n\n# Alpha Heading\n', 'notes/alpha.md'), {
    title: 'Alpha Note',
    line: 2,
  })
  assert.deepEqual(deriveTitle('# Beta Title\n\n链接。\n', 'notes/beta.md'), { title: 'Beta Title', line: 1 })
  assert.deepEqual(deriveTitle('just plain text\nwith needle inside\n', 'notes/gamma.md'), {
    title: 'gamma',
    line: 1,
  })
})

// ── scan 后端：全文+标题、AND 语义、score 权重 ─────────────────────────────────
test('scan 全文命中：命中行/行号/snippet 高亮/大小写折叠，含 frontmatter 行号还原', async () => {
  const svc = createSearchService()
  const r = await svc.search(SEARCHVAULT, 'needle')
  assert.equal(r.degraded, null, '正常扫描零降级')
  const got = r.results.map((x) => [x.path, x.line])
  assert.deepEqual(got, [
    ['notes/alpha.md', 7],
    ['notes/alpha.md', 11],
    ['notes/gamma.md', 2],
  ], '同分按 path/line 升序（score 10×行内词数）')
  assert.ok(r.results[0].snippet.includes('<mark>needle</mark>'))
  assert.equal(r.results[0].title, 'Alpha Note')
  assert.equal(r.results[2].title, 'gamma')
})

test('scan 文件级 AND：多词查询缺词文件全排除；同行多词命中计多词权重', async () => {
  const svc = createSearchService()
  const none = await svc.search(SEARCHVAULT, 'quick needle')
  assert.deepEqual(none.results, [], 'quick 只在 beta、needle 只在 alpha/gamma → 零文件同时命中')
  const r = await svc.search(SEARCHVAULT, 'needle inside')
  assert.equal(r.results.length, 1)
  assert.deepEqual([r.results[0].path, r.results[0].line], ['notes/gamma.md', 2])
  assert.equal(r.results[0].score, 20, 'score=10×行内命中词数（2 词）')
})

test('scan 标题命中：标题权重进 score、frontmatter 行不作命中行、标题合成命中行', async () => {
  const svc = createSearchService()
  // 'Alpha Note'：frontmatter title 命中两词 + 正文仅 'Alpha' 命中（frontmatter 行不进命中行）
  const r = await svc.search(SEARCHVAULT, 'Alpha Note')
  assert.equal(r.results.length, 1)
  assert.deepEqual([r.results[0].path, r.results[0].line], ['notes/alpha.md', 5])
  assert.equal(r.results[0].score, 60, 'score=10×1 行内词 + 20×2 标题词 + 10 整串入标题')
  assert.equal(r.results[0].title, 'Alpha Note')
  // 'Note'：正文无命中、标题命中 → 合成标题命中行（line=标题行，snippet=高亮标题）
  const t = await svc.search(SEARCHVAULT, 'Note')
  assert.equal(t.results.length, 1)
  assert.deepEqual(Object.keys(t.results[0]).sort(), ITEM_KEYS)
  assert.deepEqual([t.results[0].path, t.results[0].line], ['notes/alpha.md', 2])
  assert.equal(t.results[0].snippet, 'Alpha <mark>Note</mark>')
  assert.equal(t.results[0].score, 30, 'score=20×1 标题词 + 10 整串入标题')
})

test('scan 2 字盲区兜底：like 策略短词照常命中中文内容', async () => {
  const plan = compileQuery('链接')
  assert.equal(plan.terms[0].strategy, 'like', '2 字查询=盲区，走 LIKE/前缀兜底')
  const svc = createSearchService()
  const r = await svc.search(SEARCHVAULT, '链接')
  assert.deepEqual(r.results.map((x) => [x.path, x.line]), [['notes/beta.md', 3]])
  assert.ok(r.results[0].snippet.includes('<mark>链接</mark>'))
})

// ── ② score 语义文案（detpecca 教训：score=排序权重非相似度）──────────────────
test('score 语义文案：语义句在、全文案零「相似度」字样、禁百分比', () => {
  assert.match(SCORE_HINT, /排序权重/, '语义句必须点明 score=排序权重')
  assert.match(SCORE_HINT, /越大越优/, '语义句必须点明方向')
  assert.ok(!SCORE_HINT.includes('相似度'), 'detpecca 教训：禁暗示相似度')
  assert.ok(!/%/.test(SCORE_HINT), '禁百分比展示暗示')
  const dir = fileURLToPath(new URL('../web/src', import.meta.url))
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const d of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, d.name)
      if (d.isDirectory()) stack.push(abs)
      else if (/\.(vue|js)$/.test(d.name)) {
        const src = fs.readFileSync(abs, 'utf8')
        assert.ok(!src.includes('相似度'), `前端零「相似度」字样：${abs}`)
      }
    }
  }
})

// ── ④ 超时降级留痕（INV-15 风格：降级必须可见、fail-open 不报错）─────────────
test('超时降级：超时 fail-open 出部分结果 + degraded 留痕（reason/message/scanned）', async () => {
  const svc = createSearchService({ timeoutMs: 0 })
  const r = await svc.search(SEARCHVAULT, 'needle')
  assert.deepEqual(Object.keys(r).sort(), ['backend', 'degraded', 'query', 'results'])
  assert.ok(Array.isArray(r.results), 'fail-open：超时不出错，出部分结果')
  assert.ok(r.degraded, '降级必须留痕（INV-15 风格）')
  assert.deepEqual(Object.keys(r.degraded).sort(), ['message', 'reason', 'scanned'])
  assert.equal(r.degraded.reason, 'timeout')
  assert.match(r.degraded.message, /超时/, '降级提示进返回')
  assert.equal(typeof r.degraded.scanned, 'number')
  assert.match(describeDegraded(r.degraded), /超时/, '前端提示文案同样留痕')
  const clean = await createSearchService().search(SEARCHVAULT, 'needle')
  assert.equal(clean.degraded, null, '未超时零降级标记')
  assert.equal(describeDegraded(null), '')
})

// ── ⑤ 键集锁定 ──────────────────────────────────────────────────────────────
test('键集锁定：结果项={path,line,snippet,score,title}；service 返回形={backend,degraded,query,results}', async () => {
  const svc = createSearchService()
  const r = await svc.search(SEARCHVAULT, 'needle')
  assert.deepEqual(Object.keys(r).sort(), ['backend', 'degraded', 'query', 'results'])
  assert.equal(r.query, 'needle')
  assert.equal(r.backend, 'scan')
  assert.ok(r.results.length > 0)
  for (const item of r.results) {
    assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS, JSON.stringify(item))
    assert.equal(typeof item.path, 'string')
    assert.equal(typeof item.line, 'number')
    assert.equal(typeof item.snippet, 'string')
    assert.equal(typeof item.score, 'number')
    assert.equal(typeof item.title, 'string')
    assert.ok(!/<(?!\/?mark>)/.test(item.snippet), '每条 snippet 都过消毒')
  }
  // limit 生效（排序权重降序）
  const limited = await svc.search(SEARCHVAULT, 'needle', { limit: 1 })
  assert.equal(limited.results.length, 1)
})

test('score 语义锁定：数值=排序权重（越大越优），按 score 降序出结果', async () => {
  const svc = createSearchService()
  const r = await svc.search(SEARCHVAULT, 'needle inside')
  assert.equal(r.results[0].score, 20)
  const s = await svc.search(SEARCHVAULT, 'Alpha Note')
  assert.ok(s.results[0].score > r.results[0].score, '标题加权命中排前（排序权重，非相似度百分比）')
})

// ── ⑥ fts 后端缝可插拔（T11 索引后端即插即用、零 API 变化）────────────────────
// 插入的是真实现小后端（真 fixture fs 扫标题），非 mock：其可观察行为=只出标题命中。
test('fts 后端缝可插拔：注册即用、结果形零变化；短查询结构性走 scan 兜底不信任 fts', async () => {
  // 真实现：标题索引后端（只按标题命中，示范 T11 fts 后端接缝形）
  const titleBackend = {
    name: 'fts',
    async search({ root, plan, limit }) {
      const hits = []
      for (const name of fs.readdirSync(path.join(root, 'notes'))) {
        const rel = `notes/${name}`
        const content = fs.readFileSync(path.join(root, rel), 'utf8')
        const { title, line } = deriveTitle(content, rel)
        const matched = plan.terms.filter((t) => title.toLowerCase().includes(t.text.toLowerCase()))
        if (matched.length === plan.terms.length) {
          hits.push({ path: rel, line, snippet: buildSnippet(title, plan.terms), score: 20 * matched.length, title })
        }
      }
      return { hits: hits.slice(0, limit), degraded: null }
    }
  }
  const svc = createSearchService({ backends: { fts: titleBackend } })

  const viaFts = await svc.search(SEARCHVAULT, 'needle')
  assert.equal(viaFts.backend, 'fts', 'fts-able 查询（3+ 字）路由到已插 fts 后端')
  assert.deepEqual(viaFts.results, [], '插拔后端行为真实可见：标题无 needle → 零命中（scan 则有 3 条）')
  for (const item of viaFts.results) assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS)

  const titleHit = await svc.search(SEARCHVAULT, 'Beta Title')
  assert.equal(titleHit.backend, 'fts')
  assert.deepEqual(titleHit.results.map((x) => [x.path, x.line]), [['notes/beta.md', 1]])
  assert.deepEqual(Object.keys(titleHit.results[0]).sort(), ITEM_KEYS, '后端切换零 API 变化')

  const fallback = await svc.search(SEARCHVAULT, '链接')
  assert.equal(fallback.backend, 'scan', '2 字盲区查询结构性走 scan/LIKE 兜底，不信任 fts 后端')
  assert.deepEqual(fallback.results.map((x) => [x.path, x.line]), [['notes/beta.md', 3]])

  const noFts = await createSearchService().search(SEARCHVAULT, 'needle')
  assert.equal(noFts.backend, 'scan', '未插 fts 时默认 scan 后端')
})
