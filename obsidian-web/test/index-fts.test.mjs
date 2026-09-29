// T11 索引三保险——⑤ fts 后端零 API 变化接管 T3 检索缝（T3 回归网）⑥ 2 字盲区路由（A4 后走索引）。
// 契约（lib/search.js T3 锁形）：createSearchService({backends:{fts}})；后端 {name,search({root,plan,limit})
// → {hits,degraded}}；结果项键 {path,line,snippet,score,title}；data 键 {backend,degraded,query,results}；
// 查询串转义义务（MATCH 逐词引号）；snippet=已转义形态（出口 assertEscapedSnippet 强制）；
// score=排序权重（越大越优）；路由（A4）：plan.allFts → fts；盲区词面 → 后端 canHandle(plan) 声明
// 忠实能力才走 fts，否则 scan 兜底（test/search.test.mjs ⑥ 锁「不信任未声明能力的后端」）。
// 真验零 mock：真 tmp vault、真 sqlite FTS5 trigram（node:sqlite）、真 MATCH 查询；唯一注入点=后端注册缝。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIndexService } from '../lib/index-service.js'
import { createSearchService, compileQuery } from '../lib/search.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-fts', import.meta.url))
// 0.1.1 起索引库落本地盘 <indexDir>/<vault 名-哈希>/（迁出 CIFS）——测试显式给 indexDir（HOME 污染防线）
const IDX_BASE = path.join(TMP_ROOT, 'idx')
const ITEM_KEYS = ['line', 'path', 'score', 'snippet', 'title']
const DATA_KEYS = ['backend', 'degraded', 'query', 'results']

const FIX = {
  'notes/alpha.md': '# Alpha Note\n\nhello world needle 世界\n',
  'notes/beta.md': '# Beta Title\n\nfoo bar C++ tips quote "bar" end\n',
  'notes/gamma.md': '# Gamma\n\n<script>alert(1)</script> xss needle\n',
  'notes/short.md': '# Short\n\n中国链接 测试正文\n',
}

function makeVault(files, { wipe = true } = {}) {
  if (wipe) fs.rmSync(TMP_ROOT, { recursive: true, force: true })
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

test.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))

async function startService(vault) {
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  await service.start()
  return { service, svc: createSearchService({ backends: { fts: service.ftsBackend } }), scan: createSearchService() }
}

// ── ⑤ 零 API 变化：键集/信封/路由语义与 T3 逐字一致 ─────────────────────────────
test('⑤ fts 接管零 API 变化：data/结果项键集锁定、backend 可观测为 fts、snippet=已转义形态', async () => {
  const vault = makeVault(FIX)
  const { service, svc } = await startService(vault)
  try {
    const r = await svc.search(vault, 'needle')
    assert.equal(r.backend, 'fts', 'allFts 查询路由到 fts 索引后端')
    assert.deepEqual(Object.keys(r).sort(), DATA_KEYS, 'data 键集零变化（T3 锁形）')
    assert.ok(r.results.length >= 2)
    for (const hit of r.results) {
      assert.deepEqual(Object.keys(hit).sort(), ITEM_KEYS, '结果项键集零变化（T3 锁形）')
    }
    // ARC-1 消毒：含 <script> 的行 → snippet=已转义形态（出口 assertEscapedSnippet 已结构性拒非合规）
    const xss = r.results.find((h) => h.path === 'notes/gamma.md')
    assert.ok(xss.snippet.includes('&lt;script&gt;'), `snippet 已转义：${xss.snippet}`)
    assert.ok(!/<(?!\/?mark>)/.test(xss.snippet), 'mark 之外零裸标签')
    assert.ok(xss.snippet.includes('<mark>needle</mark>'), '高亮唯一标签 <mark>')
    // score=排序权重（越大越优，仅排序用）：非负数值、降序
    for (let i = 1; i < r.results.length; i += 1) {
      assert.ok(r.results[i - 1].score >= r.results[i].score, 'score 降序（排序权重语义）')
    }
  } finally {
    service.stop()
  }
})

// ── ⑤ 双后端等价（零 API 变化最强证明：同查询同结果）────────────────────────────
test('⑤ fts≡scan 等价：同一 vault 同一查询双后端逐字节同结果（score/snippet/排序全同）', async () => {
  const vault = makeVault(FIX)
  const { service, svc, scan } = await startService(vault)
  try {
    for (const q of ['needle', 'foo bar', 'Alpha', 'NEEDLE world', 'hello world', 'C++', '测试正文']) {
      const viaFts = await svc.search(vault, q)
      const viaScan = await scan.search(vault, q, { limit: 200 })
      assert.equal(viaFts.backend, 'fts', q)
      assert.equal(viaScan.backend, 'scan', q)
      assert.deepEqual(viaFts.results, viaScan.results, `双后端结果逐字节同：${q}`)
    }
  } finally {
    service.stop()
  }
})

// ── ⑤ 查询串转义义务（ERR-004 同类事故防炸）────────────────────────────────────
test('⑤ 查询串转义义务：符号/关键字/引号词面进 MATCH 前逐词加引号——不炸 SQL/FTS 语法且命中正确', async () => {
  const vault = makeVault(FIX)
  const { service, svc } = await startService(vault)
  try {
    for (const q of ['C++', 'ab"cd', 'foo*bar', '(open', 'AND OR NOT', '^caret', 'a:b', 'NEAR(x)', 'foo "bar"']) {
      await assert.doesNotReject(() => svc.search(vault, q), `MATCH 词面转义：${q}`)
    }
    const cpp = await svc.search(vault, 'C++')
    assert.deepEqual(cpp.results.map((h) => h.path), ['notes/beta.md'], 'C++ 词面命中（逐词引号转义）')
    const quoted = await svc.search(vault, 'foo "bar"')
    assert.deepEqual(quoted.results.map((h) => h.path), ['notes/beta.md'], '内嵌引号词面不炸且命中')
  } finally {
    service.stop()
  }
})

// ── ⑥ 2 字盲区路由（A4 修复：真索引后端声明 canHandle → 盲区走索引 LIKE 窄化）──────────
// A4（runtime-fix-wave.md 卡 A4）前=盲区查询结构性走 scan（1.5 万篇 CIFS 上 2s 恒超时零命中，
// p8-r3c-repro §6 backend=scan/degraded timeout/scanned=0）；后=真索引后端 canHandle(plan)===true
// 承载盲区（SQL 下推安全门 + matchDocs 终审）→ backend 如实报 fts。**结果断言逐字未动。**
test('⑥ 2 字盲区路由：声明 canHandle 的索引后端承载盲区查询（A4），结果仍正确', async () => {
  const vault = makeVault(FIX)
  const { service, svc } = await startService(vault)
  try {
    assert.equal(compileQuery('中国').allFts, false)
    assert.equal(service.ftsBackend.canHandle(compileQuery('中国')), true, '真索引后端声明盲区忠实能力（SQL≡/i 下推安全门）')
    const two = await svc.search(vault, '中国')
    assert.equal(two.backend, 'fts', 'A4 路由修复：盲区查询走索引 LIKE 预过滤（backend 如实报 fts）')
    assert.deepEqual(two.results.map((h) => h.path), ['notes/short.md'])

    const one = await svc.search(vault, '链')
    assert.equal(one.backend, 'fts', '1 字盲区同走索引（LIKE 预过滤）')

    const symbol = await svc.search(vault, '!!!')
    assert.equal(symbol.backend, 'fts', '纯符号词同走索引（LIKE 预过滤）')

    // 混排（含短词）→ 同走索引（文件级 AND 全词命中）
    const mixed = await svc.search(vault, 'needle 世界')
    assert.equal(mixed.backend, 'fts', '含盲区词的混排查询走索引')
    assert.deepEqual(mixed.results.map((h) => h.path).sort(), ['notes/alpha.md'], '文件级 AND：两词都命中才出')
  } finally {
    service.stop()
  }
})

// ── 边界：查询根与索引根不一致 → 可解释拒（不静默出错果）────────────────────────
test('边界：查询 root 与索引库 root 不一致 → bad_request 可解释拒（绝不拿旧根索引冒充）', async () => {
  const vault = makeVault(FIX)
  const other = makeVault(FIX, { wipe: false }) // 第二个 tmp vault（同内容不同根，与首库共存）
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  await service.start()
  try {
    const svc = createSearchService({ backends: { fts: service.ftsBackend } })
    await assert.rejects(() => svc.search(other, 'needle'), (err) => err.code === 'bad_request')
  } finally {
    service.stop()
  }
})
