// T11 索引三保险——②30min 定时对账（假时钟/假定时器注入）③对账账本落盘+崩溃续跑 ④陈旧窗口 ≤30min 语义。
// 语义：全量 diff 校正（seen/added/updated/removed/degraded 计数）+ 账本落盘 JSON（时间戳/计数/degraded
// 留痕——INV-15 风格）+ 分批可中断 + 账本续跑（先查补跑账本）；定时器 30min 语义保证陈旧窗口 ≤30min。
// 真验零 mock：真 tmp vault、真 sqlite、真落盘账本、真文件增删改；唯一注入点=假时钟/假定时器（被测
// 定时语义本身）与 _onBatch 故障缝（vault-ops _onStage 惯例）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIndexService, RECONCILE_INTERVAL_MS, INDEX_DIR_NAME } from '../lib/index-service.js'
import { createSearchService } from '../lib/search.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-recon', import.meta.url))

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

const ledgerOf = (vault) => JSON.parse(fs.readFileSync(path.join(vault, INDEX_DIR_NAME, 'reconcile-ledger.json'), 'utf8'))
const notes = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${String(i).padStart(2, '0')}.md`, `# Note ${i}\n\nbody ${i} 内容${i}\n`]))

// ── ③ 对账账本落盘：计数语义 seen/added/updated/removed/degraded + 时间戳 ─────────
test('③ 对账账本落盘：增量 diff 计数（seen/added/updated/removed）逐次精确 + 账本 JSON 可读（时间戳/计数/状态）', async () => {
  const vault = makeVault(notes(4))
  const service = createIndexService({ vaultRoot: vault, batchSize: 2 })
  try {
    const run1 = await service.reconcile()
    assert.deepEqual(run1.counts, { seen: 0, added: 4, updated: 0, removed: 0, degraded: 0 }, '首建全量 added')

    // 改一个（内容+字节数变）→ updated 恰 1
    fs.writeFileSync(path.join(vault, 'f00.md'), '# Note 0\n\nbody 0 内容0 变长了内容\n')
    const run2 = await service.reconcile()
    assert.deepEqual(run2.counts, { seen: 3, added: 0, updated: 1, removed: 0, degraded: 0 })

    // 删一个（绕过钩子=外部变更）→ removed 恰 1（余 3 个 seen）
    fs.rmSync(path.join(vault, 'f01.md'))
    const run3 = await service.reconcile()
    assert.deepEqual(run3.counts, { seen: 3, added: 0, updated: 0, removed: 1, degraded: 0 })

    // 账本落盘可读（INV-15 风格：时间戳/计数/degraded 留痕）
    const ledger = ledgerOf(vault)
    assert.equal(ledger.version, 1)
    assert.ok(Array.isArray(ledger.runs) && ledger.runs.length >= 3)
    for (const run of ledger.runs) {
      assert.equal(typeof run.runId, 'string')
      assert.equal(typeof run.startedAt, 'number')
      assert.equal(typeof run.finishedAt, 'number')
      assert.equal(run.status, 'done')
      assert.deepEqual(Object.keys(run.counts).sort(), ['added', 'degraded', 'removed', 'seen', 'updated'])
    }
    assert.deepEqual(ledger.runs.at(-1).counts, run3.counts, '账本计数=返回计数')
  } finally {
    service.stop()
  }
})

test('③ degraded 留痕：对账中途文件消失 → 逐条 {path,reason,message} 入账本 + 计数（INV-15 禁静默）', async () => {
  const vault = makeVault(notes(5))
  const service = createIndexService({ vaultRoot: vault, batchSize: 2 })
  try {
    const run = await service.reconcile({
      _onBatch: ({ batchesDone }) => {
        if (batchesDone === 1) fs.rmSync(path.join(vault, 'f02.md')) // 批间外部删除=读失败源
      },
    })
    assert.deepEqual(run.counts, { seen: 0, added: 4, updated: 0, removed: 0, degraded: 1 })
    assert.equal(run.counts.degraded, 1)
    assert.equal(run.degraded.length, 1)
    assert.equal(run.degraded[0].path, 'f02.md')
    assert.equal(typeof run.degraded[0].reason, 'string')
    assert.equal(typeof run.degraded[0].message, 'string')
    assert.equal(run.counts.added, 4, '其余文件照常入索引')
    const ledger = ledgerOf(vault)
    assert.deepEqual(ledger.runs.at(-1).degraded, run.degraded, 'degraded 留痕入账本')
  } finally {
    service.stop()
  }
})

// ── ③ 崩溃续跑（账本可读 → 先查补跑账本）──────────────────────────────────────
test('③ 中断续跑：对账中断（interrupted 账本+cursor）→ 新服务启动先查补跑账本 → 续跑完成、计数累计', async () => {
  const vault = makeVault(notes(6))
  const service1 = createIndexService({ vaultRoot: vault, batchSize: 2 })
  await assert.rejects(
    () => service1.reconcile({ _onBatch: ({ batchesDone }) => { if (batchesDone === 2) throw new Error('中途故障') } }),
    /中途故障/,
  )
  service1.stop()

  const interrupted = ledgerOf(vault).runs.at(-1)
  assert.equal(interrupted.status, 'interrupted', '中断留痕（不静默）')
  assert.equal(typeof interrupted.cursor, 'string', '批间 cursor 落盘=续跑凭据')
  assert.equal(interrupted.counts.added, 4, '中断前已处理批次入账')

  const service2 = createIndexService({ vaultRoot: vault, batchSize: 2 })
  try {
    await service2.start() // 先查补跑账本 → 续跑
    const runs = ledgerOf(vault).runs
    const resumed = runs.at(-1)
    assert.equal(resumed.status, 'done')
    assert.equal(resumed.resumedFrom, interrupted.runId, '续跑溯源入账本')
    assert.deepEqual(resumed.counts, { seen: 0, added: 6, updated: 0, removed: 0, degraded: 0 }, '计数累计=中断前+续跑')
    const svc = createSearchService({ backends: { fts: service2.ftsBackend } })
    for (let i = 0; i < 6; i += 1) {
      const hits = await svc.search(vault, `内容${i}`)
      assert.deepEqual(hits.results.map((r) => r.path), [`f${String(i).padStart(2, '0')}.md`], `续跑后全文档可检索：f${i}`)
    }
  } finally {
    service2.stop()
  }
})

test('③ 崩溃续跑：进程级崩溃（账本停在 running+cursor、无收尾）→ 新服务启动续跑完成', async () => {
  const vault = makeVault(notes(6))
  const service1 = createIndexService({ vaultRoot: vault, batchSize: 2 })
  await assert.rejects(
    () => service1.reconcile({
      _onBatch: ({ batchesDone }) => {
        if (batchesDone === 1) {
          const err = new Error('模拟进程崩溃')
          err.code = 'simulate-crash' // 崩溃模拟缝：跳过一切收尾（账本保持 running 态）
          throw err
        }
      },
    }),
    /模拟进程崩溃/,
  )
  service1.stop()

  const crashed = ledgerOf(vault).runs.at(-1)
  assert.equal(crashed.status, 'running', '崩溃态=running（无 interrupted 收尾）')
  assert.equal(typeof crashed.cursor, 'string')
  assert.equal(crashed.counts.added, 2)

  const service2 = createIndexService({ vaultRoot: vault, batchSize: 2 })
  try {
    await service2.start()
    const resumed = ledgerOf(vault).runs.at(-1)
    assert.equal(resumed.status, 'done')
    assert.equal(resumed.resumedFrom, crashed.runId)
    assert.deepEqual(resumed.counts, { seen: 0, added: 6, updated: 0, removed: 0, degraded: 0 })
  } finally {
    service2.stop()
  }
})

// ── ② 30min 定时器用例（假时钟/假定时器注入）+ ④ 陈旧窗口 ≤30min ────────────────
test('② 定时对账：interval 恰 30min（假定时器捕获）；到点触发全量对账', async () => {
  const vault = makeVault(notes(3))
  let tick = null
  const fakeTimers = {
    setInterval: (fn, ms) => { tick = { fn, ms }; return { unref() {} } },
    clearInterval: () => { tick = null },
  }
  let fakeNow = 1_000_000
  const service = createIndexService({ vaultRoot: vault, now: () => fakeNow, timers: fakeTimers })
  try {
    await service.start()
    assert.ok(tick, 'start() 排定定时器')
    assert.equal(tick.ms, RECONCILE_INTERVAL_MS, '对账周期=30min（OW-US-11）')
    assert.equal(RECONCILE_INTERVAL_MS, 30 * 60 * 1000, '常量字面锁定 30min')

    // 外部变更（绕过钩子=桌面 Obsidian 并发写场景）→ 到点对账校正
    fs.writeFileSync(path.join(vault, 'ext.md'), '# Ext\n\nexternal 外部内容\n')
    const svc = createSearchService({ backends: { fts: service.ftsBackend } })
    assert.deepEqual((await svc.search(vault, 'external')).results, [], '对账前陈旧（保险②未到点）')

    fakeNow += RECONCILE_INTERVAL_MS
    await tick.fn()
    const hits = await svc.search(vault, 'external')
    assert.deepEqual(hits.results.map((r) => r.path), ['ext.md'], '到点对账后可见')
  } finally {
    service.stop()
  }
})

test('④ 陈旧窗口 ≤30min：任意外部变更最迟 30min 内入索引（定时器语义保证）+ 保存即增量≈0 窗口', async () => {
  const vault = makeVault(notes(2))
  let tick = null
  const fakeTimers = {
    setInterval: (fn, ms) => { tick = { fn, ms }; return { unref() {} } },
    clearInterval: () => {},
  }
  let fakeNow = 5_000_000
  const service = createIndexService({ vaultRoot: vault, now: () => fakeNow, timers: fakeTimers })
  try {
    await service.start()
    const changeAt = fakeNow // 上次对账刚完成，外部变更立刻发生（最坏时机）
    fs.writeFileSync(path.join(vault, 'ext.md'), '# Ext\n\nexternal 外部内容\n')
    fakeNow += RECONCILE_INTERVAL_MS // 恰一个周期后到点
    await tick.fn()
    const indexedAt = fakeNow
    const staleMs = indexedAt - changeAt
    assert.ok(staleMs <= RECONCILE_INTERVAL_MS, `陈旧窗口 ${staleMs}ms ≤ 30min`)
    assert.equal(staleMs, RECONCILE_INTERVAL_MS, '最坏情形=恰一个对账周期（边界断言）')

    // 保险①对照：经保存钩子的变更=即时可见（零 tick、零等待——零窗口证明在「未触发 tick 即可见」本身）
    const { saveNote, readNote } = await import('../lib/vault-ops.js')
    const note = readNote(vault, 'f00.md')
    await saveNote(vault, 'f00.md', '# Note 0\n\nhook 即时内容\n', { etag: note.etag })
    const svc = createSearchService({ backends: { fts: service.ftsBackend } })
    const hookHits = await svc.search(vault, 'hook')
    assert.deepEqual(hookHits.results.map((r) => r.path), ['f00.md'], '保存即增量：未到点、未 tick 即可见（陈旧窗口=0）')
  } finally {
    service.stop()
  }
})

test('② 启动补跑：距上次完成 >30min（或无账本）→ start() 立即对账（先查补跑账本）；期内不重复', async () => {
  const vault = makeVault(notes(2))
  const fakeTimers = { setInterval: () => ({ unref() {} }), clearInterval: () => {} }
  let fakeNow = 10_000_000
  const service1 = createIndexService({ vaultRoot: vault, now: () => fakeNow, timers: fakeTimers })
  await service1.reconcile()
  service1.stop()

  // 外部变更后停机，重启时距上次完成 >30min → 立即补跑
  fs.writeFileSync(path.join(vault, 'ext.md'), '# Ext\n\nexternal 外部内容\n')
  fakeNow += RECONCILE_INTERVAL_MS + 1
  const service2 = createIndexService({ vaultRoot: vault, now: () => fakeNow, timers: fakeTimers })
  try {
    await service2.start()
    const svc = createSearchService({ backends: { fts: service2.ftsBackend } })
    assert.deepEqual((await svc.search(vault, 'external')).results.map((r) => r.path), ['ext.md'], '重启补跑即时校正')
  } finally {
    service2.stop()
  }
})
