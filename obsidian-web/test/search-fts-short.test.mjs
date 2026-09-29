// A4 检索修复契约测试（合同=changes/2026-09-28-b2-effect-fix/delta-specs/runtime-fix-wave.md 卡 A4 第 1 项）：
//   根因（p8-r3c-repro §6）：盲区词面（<3 码点短词/纯符号）结构性走 scan → 1.5 万篇 CIFS vault
//   2s 预算内 walk 都扫不完 → backend=scan / degraded:{reason:'timeout',scanned:0} / 零命中。
//   修复：①真索引后端 canHandle(plan) 声明盲区忠实能力（SQL 下推安全门：SQL ≡ regex /i 可证明
//   等价才下推）→ service 把盲区查询路由到 fts（backend 如实报 fts）②不可证明等价的词面 /
//   未声明能力的后端仍走 scan（不信任语义保持、召回零弱化）③退化面语义保持：超时 fail-open
//   部分结果 + degraded={reason:'timeout',message,scanned} 同形。
// 真验零 mock：真 tmp vault、真 sqlite FTS5 trigram、真 MATCH/LIKE 查询；唯一注入点=后端注册缝。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { createIndexService } from '../lib/index-service.js'
import { createSearchService, compileQuery, deriveTitle, buildSnippet } from '../lib/search.js'
import { likePatterns, canPrefilterPlan } from '../lib/index-store.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-search-fts-short', import.meta.url))
// 0.1.1 起索引库落本地盘 <indexDir>/<vault 名-哈希>/（迁出 CIFS）——测试显式给 indexDir（HOME 污染防线）
const IDX_BASE = path.join(TMP_ROOT, 'idx')
const ITEM_KEYS = ['line', 'path', 'score', 'snippet', 'title']
const DATA_KEYS = ['backend', 'degraded', 'query', 'results']
// JS regex /i 折叠语义实测（Canonicalize=toUpperCase 单字符 + 非 ASCII→ASCII 不折叠特例）：
//   U+212A KELVIN SIGN 与 k/K **互不折叠**、U+017F LONG S 与 s/S **互不折叠**（node 实测）——
//   双后端（SQL LIKE 字节精确 / regex /i）在此类字符上同为「不折叠」，一致性锁在 ④。
const KELVIN = '\u212A'
const LONG_S = '\u017F'
const AU = '\u00C4' // Ä（非 ASCII 有大小写 → 拒下推，保守走 scan）
const au = '\u00E4' // ä
const FINAL_SIGMA = '\u03C2' // ς：Σ/σ/ς 三元折叠类（SQL 无法枚举 → 拒下推）

function makeVault(files) {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true })
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

async function startBoth(vault, opts = {}) {
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  await service.start()
  return {
    service,
    svc: createSearchService({ backends: { fts: service.ftsBackend }, ...opts }),
    scan: createSearchService(opts),
  }
}

const FIX = {
  'notes/alpha.md': '# Alpha Note\n\nhello world needle 世界\n',
  'notes/beta.md': '# Beta Title\n\nfoo bar C++ tips quote "bar" end\n',
  'notes/short.md': '# Short\n\n中国链接 测试正文\n',
  'notes/uni.md': `# Uni\n\n${AU}HRE ${LONG_S}long tail\n`,
  'notes/kelvin.md': `# Odd\n\nx ${KELVIN} y\n`,
  'notes/punct.md': '# Punct\n\n100%_done \\ "quoted" \'single\' !!! a%b\n',
}

// ── ① 盲区查询走 fts（A4 主验收面）：backend 如实报 fts + 与 scan 结果逐字节等价 ─────────
test('① 盲区路由：短词/纯符号/混排查询经声明 canHandle 的索引后端 → backend=fts 且与 scan 结果逐字节同', async () => {
  const vault = makeVault(FIX)
  const { service, svc, scan } = await startBoth(vault)
  try {
    for (const q of ['中国', '链', '!!!', 'needle 世界', '链接 测试正文', 'C++', '用友']) {
      const plan = compileQuery(q)
      assert.equal(service.ftsBackend.canHandle(plan), true, `真索引后端声明盲区忠实能力：${q}`)
      const viaFts = await svc.search(vault, q, { limit: 200 })
      const viaScan = await scan.search(vault, q, { limit: 200 })
      assert.equal(viaFts.backend, 'fts', `盲区查询走 fts：${q}`)
      assert.equal(viaScan.backend, 'scan', `对照面走 scan：${q}`)
      assert.deepEqual(Object.keys(viaFts).sort(), DATA_KEYS, 'data 键集零变化（T3 锁形）')
      for (const hit of viaFts.results) assert.deepEqual(Object.keys(hit).sort(), ITEM_KEYS, '结果项键集零变化')
      assert.deepEqual(viaFts.results, viaScan.results, `盲区查询 fts≡scan 逐字节同：${q}`)
    }
  } finally {
    service.stop()
  }
})

// ── ② 不信任未声明能力的 fts 后端（既有语义保持，test/search.test.mjs ⑥ 同口径）──────────
test('② 能力声明门：无 canHandle / canHandle=false 的 fts 后端 → 盲区查询仍结构性走 scan 兜底', async () => {
  const vault = makeVault(FIX)
  const stub = (withDecl) => {
    const backend = {
      name: 'fts',
      async search() {
        throw Object.assign(new Error('stub fts backend called'), { code: 'stub_called' })
      },
    }
    if (withDecl) backend.canHandle = () => false
    return backend
  }
  for (const fts of [stub(false), stub(true)]) {
    const svc = createSearchService({ backends: { fts } })
    const blind = await svc.search(vault, '链接')
    assert.equal(blind.backend, 'scan', '盲区查询不信任未声明能力的 fts 后端（结构性走 scan）')
    assert.deepEqual(blind.results.map((h) => h.path), ['notes/short.md'], 'scan 兜底结果正确')
    // allFts 查询仍按既有语义信任 fts（能力声明只管盲区）——stub 被调用即证明路由到了 fts
    await assert.rejects(() => svc.search(vault, 'needle'), (err) => err.code === 'stub_called', 'allFts 查询照旧路由 fts')
  }
})

// ── ③ A4 验收：tmp vault 命中率 + 耗时断言（短词=中文检索常态，盲区必须亚秒命中）──────────
test('③ A4 验收：2 字中文短词在 N 篇 tmp vault 上 fts 命中率 100% + 耗时 <1s + 零降级', async () => {
  const N = 3000
  const SEED = 40
  const seeded = new Set()
  const files = {}
  for (let i = 0; i < N; i += 1) {
    const rel = `notes/n${String(i).padStart(5, '0')}.md`
    const hit = i % Math.floor(N / SEED) === 0 && seeded.size < SEED
    if (hit) seeded.add(rel)
    files[rel] = `# Note ${i}\n\nbody ${i} 内容${i} ${hit ? '用友 客户档案' : '无关正文'}\n`
  }
  const vault = makeVault(files)
  const { service, svc } = await startBoth(vault)
  try {
    assert.equal(seeded.size, SEED)
    const t0 = performance.now()
    const r = await svc.search(vault, '用友', { limit: 200 })
    const elapsed = performance.now() - t0
    console.log(`[a4-bench] files=${N} seed=${SEED} hits=${r.results.length} ftsMs=${elapsed.toFixed(1)}`)
    assert.equal(r.backend, 'fts', '2 字中文短词走 fts（不再退化 scan）')
    assert.equal(r.degraded, null, '零降级（不再是 timeout/scanned=0 常态）')
    assert.deepEqual(new Set(r.results.map((h) => h.path)), seeded, `命中率 100%（${SEED} 篇种子全中）`)
    assert.ok(elapsed < 1000, `盲区检索必须亚秒（实测 ${elapsed.toFixed(1)}ms < 1000ms）`)
    for (const hit of r.results) assert.deepEqual(Object.keys(hit).sort(), ITEM_KEYS)
  } finally {
    service.stop()
  }
})

// ── ④ 折叠语义一致性锁 + 非 ASCII 大小写词面保守兜底（召回零弱化）────────────────────────
test('④ 折叠一致性：非 ASCII 有大小写词面拒下推走 scan（既有语义原样）；U+212A/U+017F 双后端同判不折叠', async () => {
  const vault = makeVault(FIX)
  const { service, svc, scan } = await startBoth(vault)
  try {
    // 非 ASCII 有大小写（ä/Ä）：SQL 侧无法枚举 JS 折叠类 → canHandle 拒 → 走 scan（今日行为原样，召回零弱化）
    for (const q of [au, AU]) {
      const plan = compileQuery(q)
      assert.equal(service.ftsBackend.canHandle(plan), false, `非 ASCII 有大小写词面拒下推：${q}`)
      const r = await svc.search(vault, q, { limit: 200 })
      assert.equal(r.backend, 'scan', `保守走 scan（既有语义原样）：${q}`)
      assert.ok(r.results.some((h) => h.path === 'notes/uni.md'), `Ä 在 ä 的 /i 召回面内（scan 兜底保召回）：${q}`)
    }
    // ASCII 短词（k/s）：可下推走 fts；U+212A KELVIN / U+017F LONG S 在 JS /i 下与 k/s 互不折叠
    // （实测 Canonicalize 特例）——双后端同判「不折叠」，一致性锁（防未来实现引入 SQL/regex 折叠漂移）
    for (const q of ['k', 's']) {
      const viaFts = await svc.search(vault, q, { limit: 200 })
      const viaScan = await scan.search(vault, q, { limit: 200 })
      assert.equal(viaFts.backend, 'fts', q)
      assert.deepEqual(viaFts.results, viaScan.results, `折叠一致性 fts≡scan：${q}`)
    }
    const kelvin = await svc.search(vault, 'k', { limit: 200 })
    assert.ok(!kelvin.results.some((h) => h.path === 'notes/kelvin.md'), 'U+212A KELVIN 与 k 在 /i 下互不折叠（双后端一致排除）')
    const longs = await svc.search(vault, 's', { limit: 200 })
    assert.ok(!longs.results.some((h) => h.path === 'notes/uni.md'), 'U+017F LONG S 与 s 在 /i 下互不折叠（双后端一致排除）')
  } finally {
    service.stop()
  }
})

// ── ⑤ 纯符号/通配符词面：转义义务（ERR-004 同类）——不炸 SQL/FTS 语法且命中字面量 ─────────
test('⑤ 纯符号词面进 LIKE/MATCH 前转义：% _ \\ " \' 不炸且命中字面量（与 scan 等价）', async () => {
  const vault = makeVault(FIX)
  const { service, svc, scan } = await startBoth(vault)
  try {
    for (const q of ['100%', '_', '\\', '"', "'", '!!!', 'a%b', 'C++', 'foo*bar', 'NEAR(x)', 'AND OR']) {
      await assert.doesNotReject(() => svc.search(vault, q, { limit: 200 }), `词面转义不炸：${q}`)
      const viaFts = await svc.search(vault, q, { limit: 200 })
      const viaScan = await scan.search(vault, q, { limit: 200 })
      assert.deepEqual(viaFts.results, viaScan.results, `符号词面 fts≡scan：${q}`)
    }
    const pct = await svc.search(vault, '100%', { limit: 200 })
    assert.deepEqual(pct.results.map((h) => h.path), ['notes/punct.md'], '字面量 % 命中（LIKE 转义防通配）')
  } finally {
    service.stop()
  }
})

// ── ⑥ 下推安全门（纯函数）：SQL ≡ regex /i 可证明等价才下推，否则拒 → scan 兜底 ────────────
test('⑥ 下推安全门：ASCII/无大小写 CJK 准下推；非 ASCII 有大小写（ä/ß/ς）拒下推（绝不窄化召回）', () => {
  assert.deepEqual(likePatterns('中国'), ['中国'], 'CJK 无大小写：单 pattern（字节精确 ≡ /i）')
  assert.deepEqual(likePatterns('abc'), ['abc'], 'ASCII：LIKE 原生折叠 ≡ /i，单 pattern')
  assert.equal(likePatterns(au), null, 'ä（非 ASCII 有大小写）→ 拒下推')
  assert.equal(likePatterns('ß'), null, 'ß（toUpperCase 多字符展开）→ 拒下推')
  assert.equal(likePatterns(FINAL_SIGMA), null, 'ς（Σ/σ/ς 三元折叠类，SQL 无法枚举）→ 拒下推')
  assert.equal(likePatterns(''), null, '空词面拒（防 %% 全表下推）')
  assert.equal(canPrefilterPlan(compileQuery('中国')), true)
  assert.equal(canPrefilterPlan(compileQuery('用友')), true, '生产主诉查询词面可下推')
  assert.equal(canPrefilterPlan(compileQuery('api')), true)
  assert.equal(canPrefilterPlan(compileQuery(au)), false)
  assert.equal(
    canPrefilterPlan({ terms: [{ text: 'needle', strategy: 'fts' }, { text: `${AU}HRE`, strategy: 'fts' }] }),
    false,
    '混排含非 ASCII 大小写词面 → 整查保守走 scan（既有语义原样）',
  )
  assert.equal(canPrefilterPlan({ terms: [] }), false, '空 plan 拒')
})

// ── ⑦ 退化面语义保持：超时 fail-open 部分结果 + degraded 同形（不再是常态，但形态不丢）──────
test('⑦ 超时降级留痕同形：timeoutMs=0 → fts 后端 fail-open + degraded={reason:"timeout",message,scanned}', async () => {
  const vault = makeVault(FIX)
  const fast = await startBoth(vault, { timeoutMs: 0 })
  try {
    const r = await fast.svc.search(vault, 'needle')
    assert.equal(r.backend, 'fts')
    assert.ok(Array.isArray(r.results), 'fail-open：超时不出错，出部分结果')
    assert.deepEqual(Object.keys(r.degraded).sort(), ['message', 'reason', 'scanned'], 'degraded 形与 scan 后端同锁')
    assert.equal(r.degraded.reason, 'timeout')
    assert.match(r.degraded.message, /超时/)
    assert.equal(typeof r.degraded.scanned, 'number')
  } finally {
    fast.service.stop()
  }
  const normal = await startBoth(vault, { timeoutMs: 2000 })
  try {
    const clean = await normal.svc.search(vault, 'needle')
    assert.equal(clean.degraded, null, '有预算时零降级（超时=预算语义非查询语义）')
    assert.ok(clean.results.length >= 1, '同查询在有预算时出命中')
  } finally {
    normal.service.stop()
  }
})

// ── ⑧ 既有 T3 语义回归：allFts 查询仍走 fts、snippet/score 口径零变化 ────────────────────
test('⑧ allFts 回归：3+ 字查询照旧走 fts，snippet=已转义形态 + score=排序权重降序', async () => {
  const vault = makeVault(FIX)
  const { service, svc } = await startBoth(vault)
  try {
    const r = await svc.search(vault, 'needle')
    assert.equal(r.backend, 'fts')
    assert.equal(r.degraded, null)
    for (let i = 1; i < r.results.length; i += 1) {
      assert.ok(r.results[i - 1].score >= r.results[i].score, 'score 降序（排序权重语义）')
    }
    for (const hit of r.results) {
      assert.ok(!/<(?!\/?mark>)/.test(hit.snippet), 'mark 之外零裸标签')
      assert.ok(!/(^|[^&])&(?!(?:amp|lt|gt|quot|#39);)/.test(hit.snippet.replaceAll('<mark>', '').replaceAll('</mark>', '')), 'snippet=已转义形态')
    }
    assert.deepEqual(deriveTitle('# Beta Title\n\nx', 'notes/beta.md'), { title: 'Beta Title', line: 1 })
    assert.equal(buildSnippet('needle line', compileQuery('needle').terms), '<mark>needle</mark> line')
  } finally {
    service.stop()
  }
})
