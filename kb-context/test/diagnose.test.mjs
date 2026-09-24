// diagnose 单测（T7 空态五态诊断）：五态确定性判据 + 优先级序 + hint ≤200 + 信号提取 + collector 真 T2 库集成。
// 必含（brief 钉住 / A4 逐态用例）：①五态各 1 例（判据确定性、不依赖时钟/网络）②优先级序（excluded >
//   indexing > failed > no-text > not-indexed）③hint ≤200 字符含建议动作 ④normalizeEmptyState 软校验
//   （坏 state/hint 丢弃——旧调用不破的第一道闸）⑤collector 对缺库/空白文件/仅空白文件的真库实证。
// stub 边界纪律：docs 观察面用纯函数替身（判定逻辑被测）；collector 集成走真 T2 openDb+applyIncremental。
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

const {
  EMPTY_STATES, EMPTY_STATE_HINT_MAX,
  isIndexHealthError, classifySignals, diagnoseEmptyState, normalizeEmptyState, collectEmptyState,
} = await import('../lib/diagnose.js')

// 出厂 scope（delta-spec §2 字面：indexAll wiki/raw + 六业务目录 grepOnDemand）
const SCOPE = {
  indexAll: ['wiki', 'raw'],
  grepOnDemand: ['01-客户资料', '02-致远OA', '03-帆软报表', '04-用友', '05-医院成本', '08-unraid'],
}

/** 观察面基线：健康索引、有文本、查询未命中（兜底 not-indexed residual 的最小 obs） */
function baseObs(over = {}) {
  return {
    scope: SCOPE,
    candidateExists: false,
    activeExists: true,
    openError: null,
    problems: [],
    degraded: null,
    docs: { count: 1, find: () => ({ path: 'wiki/cost.md', blank: false }) },
    ...over,
  }
}

function tmpDir(t, prefix = 'kb-diag-') {
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

// ── 五态判据（A4 逐态用例） ────────────────────────────────────────────────────

test('五态① excluded：query 词元落 grepOnDemand 且不落 indexAll——配置 scope 判、缺库也可判', () => {
  // activeExists:false（缺库）也必须判 excluded——excluded 不依赖索引库健康
  const r = diagnoseEmptyState('查下 01-客户资料 的合同审批流程', baseObs({ activeExists: false, docs: null }))
  assert.equal(r.state, 'excluded')
  assert.ok(r.hint.includes('grepOnDemand'), 'hint 点明按需注册范围')
  assert.ok(r.hint.includes('wiki_read'), 'hint 给建议动作（按路径直读）')
  assert.ok(r.hint.length <= EMPTY_STATE_HINT_MAX, `hint ≤200（实际 ${r.hint.length}）`)
})

test('五态② indexing：候选库 .candidate 在场=构建中（fs 判据，不查库）', () => {
  const r = diagnoseEmptyState('wiki 成本核算', baseObs({ candidateExists: true, openError: 'x', docs: null }))
  assert.equal(r.state, 'indexing')
  assert.ok(r.hint.includes('构建进行中'), 'hint 说明构建中')
  assert.ok(r.hint.includes('稍候'), 'hint 给建议动作（稍候重试）')
  assert.ok(r.hint.length <= EMPTY_STATE_HINT_MAX)
})

test('五态③ failed：openError / problems 非空 / degraded 三种判据各自成立 + 详情进 hint', () => {
  const a = diagnoseEmptyState('wiki x', baseObs({ openError: 'file is not a database', docs: null }))
  assert.equal(a.state, 'failed')
  assert.ok(a.hint.includes('file is not a database'), '错误详情进 hint（可解释）')
  assert.ok(a.hint.includes('重建'), 'hint 给建议动作（重建索引）')

  const b = diagnoseEmptyState('wiki x', baseObs({ problems: ['coherence: fts_rowid=1 词表失同步'], docs: null }))
  assert.equal(b.state, 'failed')
  assert.ok(b.hint.includes('coherence'), 'problems[0] 进 hint')

  const c = diagnoseEmptyState('wiki x', baseObs({ degraded: 'validation', docs: null }))
  assert.equal(c.state, 'failed')
  assert.ok(c.hint.includes('validation'), 'degraded 进 hint')
  assert.ok(a.hint.length <= EMPTY_STATE_HINT_MAX && b.hint.length <= EMPTY_STATE_HINT_MAX && c.hint.length <= EMPTY_STATE_HINT_MAX)
})

test('五态④ no-text：docs 有记录但 chunk 空/仅空白（空文件与仅空白文件两形态）', () => {
  const blankDocs = {
    count: 2,
    find: (sig) => (sig === 'wiki/blank.md' ? { path: 'wiki/blank.md', blank: true }
      : sig === 'wiki/ws.md' ? { path: 'wiki/ws.md', blank: true } : null),
  }
  const a = diagnoseEmptyState('wiki/blank.md', baseObs({ docs: blankDocs }))
  assert.equal(a.state, 'no-text')
  assert.ok(a.hint.includes('wiki/blank.md'), '文件路径进 hint')
  assert.ok(a.hint.includes('正文'), 'hint 给建议动作（补充正文）')

  const b = diagnoseEmptyState('wiki/ws.md 说明', baseObs({ docs: blankDocs }))
  assert.equal(b.state, 'no-text')
  assert.ok(b.hint.length <= EMPTY_STATE_HINT_MAX)
})

test('五态⑤ not-indexed 四变体：范围内无记录 / 缺库 / 空索引 / residual 兜底（各自 hint 可解释）', () => {
  // a. 路径在 scope 内但 docs 无此文件记录（判据字面）
  const a = diagnoseEmptyState('wiki/newpage.md', baseObs({
    docs: { count: 1, find: () => null },
  }))
  assert.equal(a.state, 'not-indexed')
  assert.ok(a.hint.includes('wiki/newpage.md'), '缺记录路径进 hint')
  assert.ok(a.hint.includes('索引刷新'), 'hint 给建议动作（运行索引刷新）')

  // b. 索引库不存在
  const b = diagnoseEmptyState('wiki 成本', baseObs({ activeExists: false, docs: null }))
  assert.equal(b.state, 'not-indexed')
  assert.ok(b.hint.includes('索引库不存在'), '缺库变体 hint')

  // c. 索引库为空（docs 零记录）
  const c = diagnoseEmptyState('wiki 成本', baseObs({ docs: { count: 0, find: () => null } }))
  assert.equal(c.state, 'not-indexed')
  assert.ok(c.hint.includes('索引库为空'), '空索引变体 hint')

  // d. residual：文件已索引有文本但查询词未命中（兜底，状态仍可解释 + 建议）
  const d = diagnoseEmptyState('某种查不到的词', baseObs())
  assert.equal(d.state, 'not-indexed')
  assert.ok(d.hint.includes('未在已索引内容中命中'), 'residual hint 如实说明内容未命中')
  for (const r of [a, b, c, d]) assert.ok(r.hint.length <= EMPTY_STATE_HINT_MAX)
})

// ── 优先级序 ───────────────────────────────────────────────────────────────────

test('优先级：excluded > indexing > failed > no-text > not-indexed（逐对压制实证）', () => {
  // excluded 压 indexing/failed（grep 目录等构建也没用——config 判据最具体）
  assert.equal(
    diagnoseEmptyState('01-客户资料/合同.md', baseObs({ candidateExists: true, openError: 'boom', docs: null })).state,
    'excluded',
  )
  // indexing 压 failed（copy-on-write 构建正是在修坏库——等构建比报坏更可行动）
  assert.equal(
    diagnoseEmptyState('wiki x', baseObs({ candidateExists: true, openError: 'boom', docs: null })).state,
    'indexing',
  )
  // failed 压 no-text/not-indexed（库打不开，docs 观察面不可信）
  const docsSays = { count: 2, find: () => ({ path: 'wiki/blank.md', blank: true }) }
  assert.equal(
    diagnoseEmptyState('wiki/blank.md', baseObs({ openError: 'boom', docs: docsSays })).state,
    'failed',
  )
  // no-text 压 not-indexed（空白文档比缺记录更具体：多信号时空白命中即判）
  const mixed = { count: 2, find: (sig) => (sig === 'wiki/blank.md' ? { path: 'wiki/blank.md', blank: true } : null) }
  assert.equal(diagnoseEmptyState('wiki/blank.md wiki/new.md', baseObs({ docs: mixed })).state, 'no-text')
  // 反向：无空白记录时缺记录信号判 not-indexed（不误升 no-text）
  assert.equal(
    diagnoseEmptyState('wiki/new.md wiki/cost.md', baseObs({ docs: { count: 1, find: (s) => (s === 'wiki/cost.md' ? { path: 'wiki/cost.md', blank: false } : null) } })).state,
    'not-indexed',
  )
})

test('excluded 判定否定面：query 同时落 indexAll（混合信号）不判 excluded——in-scope 优先走库判', () => {
  const r = diagnoseEmptyState('wiki/cost 01-客户资料', baseObs())
  assert.notEqual(r.state, 'excluded')
  assert.equal(r.state, 'not-indexed', 'in-scope 信号已索引有文本 → residual')
})

// ── hint 纪律 ──────────────────────────────────────────────────────────────────

test('hint 纪律：五态 hint 全部非空且 ≤200；病态长 query/长详情也钳制', () => {
  const fixtures = [
    diagnoseEmptyState('01-客户资料/x', baseObs()),
    diagnoseEmptyState('wiki x', baseObs({ candidateExists: true })),
    diagnoseEmptyState('wiki x', baseObs({ openError: 'E'.repeat(500), docs: null })),
    diagnoseEmptyState('wiki/blank.md', baseObs({ docs: { count: 1, find: () => ({ path: 'wiki/blank.md', blank: true }) } })),
    diagnoseEmptyState('查不到的词', baseObs()),
  ]
  assert.deepEqual(fixtures.map((f) => f.state), ['excluded', 'indexing', 'failed', 'no-text', 'not-indexed'])
  for (const f of fixtures) {
    assert.ok(typeof f.hint === 'string' && f.hint.length > 0, 'hint 非空')
    assert.ok(f.hint.length <= EMPTY_STATE_HINT_MAX, `hint ≤200（${f.state}: ${f.hint.length}）`)
    assert.ok(EMPTY_STATES.includes(f.state), 'state ∈ 五态枚举')
  }
  // 病态长 query（1000 字符信号）：仍钳制
  const long = diagnoseEmptyState(`wiki/${'a'.repeat(1000)}.md`, baseObs({ docs: { count: 0, find: () => null } }))
  assert.ok(long.hint.length <= EMPTY_STATE_HINT_MAX, `长 query 钳制（实际 ${long.hint.length}）`)
})

// ── 信号提取（classifySignals） ───────────────────────────────────────────────

test('classifySignals：路径/根名词元分类（index/grep/other）+ 普通词丢弃 + 尾部句读剥离 + 去重', () => {
  const sigs = classifySignals('查看 wiki/cost.md 与 01-客户资料/合同.md 关于 08-unraid 的 wiki 说明 random/path 无路径词 ./wiki/a.md， 尾缀。', SCOPE)
  const bySig = new Map(sigs.map((s) => [s.sig, s.kind]))
  assert.equal(bySig.get('wiki/cost.md'), 'index', 'indexAll 前缀 → index')
  assert.equal(bySig.get('01-客户资料/合同.md'), 'grep', 'grepOnDemand 前缀 → grep')
  assert.equal(bySig.get('08-unraid'), 'grep', '裸根名词元 → grep')
  assert.equal(bySig.get('wiki'), 'index', '裸 indexAll 根名 → index')
  assert.equal(bySig.get('random/path'), 'other', '路径形但不落任何根 → other（docs 查找候选）')
  assert.equal(bySig.get('说明'), undefined, '普通词不是信号（丢弃）')
  assert.equal(bySig.get('wiki/a.md'), 'index', './ 前缀归一 + 尾部句读剥离')
  assert.equal(sigs.filter((s) => s.sig === 'wiki/a.md').length, 1, '同词元去重')
  // 保序（query 出现序）
  assert.equal(sigs[0].sig, 'wiki/cost.md')
})

test('classifySignals：空 query/空 scope 安全（空数组，不抛）', () => {
  assert.deepEqual(classifySignals('', SCOPE), [])
  assert.deepEqual(classifySignals(null, SCOPE), [])
  // 空 scope：普通词无信号；pathish 词元仍标 other（可查 docs）
  assert.deepEqual(classifySignals('普通词', { indexAll: [], grepOnDemand: [] }), [])
  assert.equal(classifySignals('wiki/cost.md', { indexAll: [], grepOnDemand: [] })[0]?.kind, 'other')
})

// ── normalizeEmptyState（软增第一道闸：旧调用不破） ─────────────────────────────

test('normalizeEmptyState：合法透传 + hint 钳 200；坏 state/坏 hint/缺键一律 null（旧调用不破）', () => {
  const ok = normalizeEmptyState({ state: 'not-indexed', hint: '运行索引刷新' })
  assert.deepEqual(ok, { state: 'not-indexed', hint: '运行索引刷新' })
  assert.equal(normalizeEmptyState({ state: 'not-indexed', hint: 'x'.repeat(500) }).hint.length, 200, '超长 hint 钳 200')
  assert.equal(normalizeEmptyState({ state: 'bogus', hint: 'x' }), null, '非枚举 state 丢弃')
  assert.equal(normalizeEmptyState({ state: 'not-indexed' }), null, '缺 hint 丢弃')
  assert.equal(normalizeEmptyState({ state: 'not-indexed', hint: 42 }), null, '非字符串 hint 丢弃')
  assert.equal(normalizeEmptyState(null), null, 'null 透传 null')
  assert.equal(normalizeEmptyState(undefined), null)
  assert.equal(normalizeEmptyState({ hint: 'x' }), null, '缺 state 丢弃')
})

// ── isIndexHealthError ─────────────────────────────────────────────────────────

test('isIndexHealthError：node:sqlite 错误码判据（探针实证 errcode 26/1 同族）；普通异常不误判', () => {
  assert.equal(isIndexHealthError(Object.assign(new Error('file is not a database'), { code: 'ERR_SQLITE_ERROR' })), true)
  assert.equal(isIndexHealthError(Object.assign(new Error('boom'), { code: 'ERR_SQLITE_ERROR' })), true, '同 code 即健康面错误')
  assert.equal(isIndexHealthError(new Error('boom')), false, '普通异常不吞（原样上抛语义保留）')
  assert.equal(isIndexHealthError(null), false)
  const deadline = Object.assign(new Error('kb-context: search deadline exceeded'), { code: undefined })
  assert.equal(isIndexHealthError(deadline), false, 'deadline 错误不判健康面（走 timeout 语义）')
})

// ── collectEmptyState（真 T2 库集成，零 mock） ──────────────────────────────────

test('collectEmptyState 真库：空文件 doc（零 chunk）→ no-text；仅空白文件 chunk → no-text', async (t) => {
  const { openDb, registerScope, applyIncremental } = await import('../lib/index-db.js')
  const vault = makeVault(t, { 'wiki/blank.md': '', 'wiki/ws.md': '   \n\t  ', 'wiki/cost.md': '医院成本核算口径' })
  const dbPath = path.join(tmpDir(t, 'idx-'), 'active.db')
  const db = openDb(dbPath)
  t.after(() => db.close())
  registerScope(db, SCOPE)
  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/blank.md', 'wiki/ws.md', 'wiki/cost.md'] })

  const a = collectEmptyState({ dbPath, query: 'wiki/blank.md', scope: SCOPE, db })
  assert.equal(a.state, 'no-text', 'docs 有记录零 chunk → no-text')
  const b = collectEmptyState({ dbPath, query: 'wiki/ws.md', scope: SCOPE, db })
  assert.equal(b.state, 'no-text', '仅空白 chunk → no-text')
  const c = collectEmptyState({ dbPath, query: 'wiki/newpage.md', scope: SCOPE, db })
  assert.equal(c.state, 'not-indexed', '范围内无记录 → not-indexed')
  const d = collectEmptyState({ dbPath, query: '01-客户资料 合同', scope: SCOPE, db })
  assert.equal(d.state, 'excluded', 'grep 根名词元 → excluded')
})

test('collectEmptyState 缺库/坏观察面：active.db 缺失 → not-indexed(索引库不存在)；从不抛错', (t) => {
  const dbPath = path.join(tmpDir(t, 'nodb-'), 'active.db') // 不存在
  const r = collectEmptyState({ dbPath, query: 'wiki 成本', scope: SCOPE })
  assert.equal(r.state, 'not-indexed')
  assert.ok(r.hint.includes('索引库不存在'))
  // db handle 缺失但 openError 在场 → failed（runSearch 打开失败缝）
  const f = collectEmptyState({ dbPath, query: 'wiki 成本', scope: SCOPE, openError: 'file is not a database' })
  assert.equal(f.state, 'failed')
  // 观察面查询炸（db 已坏）→ 不抛，收敛 failed
  const poison = { prepare: () => { throw Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR' }) } }
  const g = collectEmptyState({ dbPath, query: 'wiki 成本', scope: SCOPE, db: poison })
  assert.equal(g.state, 'failed', 'docs 观察面异常 → failed 不外抛')
})

// ── runSearch 空态生产缝（T7 slice3：真缝 e2e，HOME 隔离零 mock） ──────────────────
// 动态 import——lib/index.js 的 runSearch 导出落地前此两例红（slice3 RED）。

test('runSearch 真缝 e2e：缺库 not-indexed / 坏库 failed（不抛）/ 候选库 indexing——零命中产 emptyState 且零建库', async (t) => {
  const { runSearch } = await import('../lib/index.js')
  const origHome = process.env.HOME
  t.after(() => { process.env.HOME = origHome })

  // ① 缺库 → not-indexed（hint 解释缺库）+ 零落盘
  const home1 = tmpDir(t, 'kb-home-')
  process.env.HOME = home1
  const r1 = runSearch('wiki 成本核算', { scope: SCOPE })
  assert.deepEqual(r1.hits, [])
  assert.equal(r1.emptyState?.state, 'not-indexed')
  assert.ok(r1.emptyState.hint.includes('索引库不存在'))
  assert.ok(!fs.existsSync(path.join(home1, '.dsh', 'kb-index', 'active.db')), '读侧不建库')

  // ② 坏库（非 SQLite 字节）→ failed：健康面错误转 emptyState，不原样上抛（A4 failed 可达）
  const home2 = tmpDir(t, 'kb-home-')
  process.env.HOME = home2
  const dbPath2 = path.join(home2, '.dsh', 'kb-index', 'active.db')
  fs.mkdirSync(path.dirname(dbPath2), { recursive: true })
  fs.writeFileSync(dbPath2, 'this is not a sqlite database, just garbage bytes')
  const r2 = runSearch('wiki 成本核算', { scope: SCOPE })
  assert.deepEqual(r2.hits, [], '坏库零命中而非抛错')
  assert.equal(r2.emptyState?.state, 'failed')
  assert.ok(r2.emptyState.hint.includes('重建'), 'failed hint 含建议动作')

  // ③ 候选库在场 → indexing（压过 not-indexed/residual）
  const home3 = tmpDir(t, 'kb-home-')
  process.env.HOME = home3
  const { openDb, registerScope, applyIncremental } = await import('../lib/index-db.js')
  const vault = makeVault(t, { 'wiki/cost.md': '医院成本核算口径' })
  const dbPath3 = path.join(home3, '.dsh', 'kb-index', 'active.db')
  fs.mkdirSync(path.dirname(dbPath3), { recursive: true })
  const db3 = openDb(dbPath3)
  registerScope(db3, SCOPE)
  applyIncremental(db3, { vaultRoot: vault, scope: SCOPE, files: ['wiki/cost.md'] })
  db3.close()
  fs.writeFileSync(`${dbPath3}.candidate`, '')
  const r3 = runSearch('查不到的词', { scope: SCOPE })
  assert.deepEqual(r3.hits, [])
  assert.equal(r3.emptyState?.state, 'indexing', '候选库在场判 indexing')
  assert.ok(r3.emptyState.hint.includes('构建进行中'))
})

test('runSearch 真缝 e2e：空白文件 no-text / grepOnDemand excluded / residual not-indexed；命中与 timeout 不产 emptyState', async (t) => {
  const { runSearch } = await import('../lib/index.js')
  const { openDb, registerScope, applyIncremental } = await import('../lib/index-db.js')
  const origHome = process.env.HOME
  t.after(() => { process.env.HOME = origHome })
  const home = tmpDir(t, 'kb-home-')
  process.env.HOME = home

  const vault = makeVault(t, { 'wiki/cost.md': '医院成本核算口径', 'wiki/blank.md': '' })
  const dbPath = path.join(home, '.dsh', 'kb-index', 'active.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = openDb(dbPath)
  registerScope(db, SCOPE)
  applyIncremental(db, { vaultRoot: vault, scope: SCOPE, files: ['wiki/cost.md', 'wiki/blank.md'] })
  db.close()

  // ④ 空白文件已入 docs（零 chunk）→ no-text
  const r1 = runSearch('wiki/blank.md', { scope: SCOPE })
  assert.deepEqual(r1.hits, [])
  assert.equal(r1.emptyState?.state, 'no-text')
  assert.ok(r1.emptyState.hint.includes('wiki/blank.md'))

  // ⑤ query 落 grepOnDemand → excluded（config scope 判，建议 wiki_read 直读）
  const r2 = runSearch('01-客户资料 合同', { scope: SCOPE })
  assert.deepEqual(r2.hits, [])
  assert.equal(r2.emptyState?.state, 'excluded')
  assert.ok(r2.emptyState.hint.includes('wiki_read'))

  // ⑥ residual：索引健康、内容未命中 → not-indexed（诚实 hint）
  const r3 = runSearch('查不到的词', { scope: SCOPE })
  assert.deepEqual(r3.hits, [])
  assert.equal(r3.emptyState?.state, 'not-indexed')
  assert.ok(r3.emptyState.hint.includes('未在已索引内容中命中'))

  // 软增边界：命中不产 emptyState；timeout 降级不产（timeout 自解释）
  const r4 = runSearch('成本核算', { scope: SCOPE })
  assert.ok(r4.hits.length > 0, '真命中')
  assert.ok(!('emptyState' in r4), '命中不带 emptyState')
  const r5 = runSearch('查不到的词', { scope: SCOPE, timeoutMs: 0 })
  assert.equal(r5.degraded, 'timeout')
  assert.ok(!('emptyState' in r5), 'timeout 零命中不产 emptyState')
})
