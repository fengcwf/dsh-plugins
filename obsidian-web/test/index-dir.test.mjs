// fix-boot-lock 后续（0.1.1 迁出 CIFS）——索引库落点 indexDir 语义锁定：
//   ①解析语义（resolveIndexDir 单一来源）：缺省/空串/纯空白 → 出厂默认 `~/.dsh/cache/obsidian-web/`
//     （~ 按 os.homedir() 展开）；显式 indexDir 覆盖；显式 dir=全落点覆盖（优先级 dir > indexDir > 默认）
//   ②每 vault 一库 `<indexDir>/<vault 名-哈希>/`：稳定（同 root 同名）+ 防撞名（同名 vault 不同 root 不同库）
//     + 安全名（净化 basename，仅 [A-Za-z0-9._-]）
//   ③真写真查（零 mock）：默认落点端到端（fake HOME 不污染真 ~/.dsh/cache）、覆盖落点真写真查
//     + FTS5 速度面证据（本地盘冷建/MATCH 查询/增量，实测数字走 t.diagnostic）
//   ④多档案分库互不串 ⑤旧落点 `<vaultRoot>/.ob-index/` 检测→重建提示留痕、旧目录逐字节保留（不删）
// 根因背景（fix-boot-lock-report E1-E10）：vault 落 CIFS 时 SMB 字节锁令 SQLite 同 fd 锁升级恒判自身
//   冲突（EACCES→SQLITE_BUSY）——SQLite 落 CIFS 恒败，索引库必须落本地盘；busy_timeout/fail-open/
//   自愈语义保留（双保险，回归=test/index-failopen.test.mjs 6 项照跑新落点）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_INDEX_DIR_BASE, LEGACY_INDEX_DIR_NAME, expandIndexDirBase,
  resolveIndexDir, vaultIndexDirName,
} from '../lib/index-store.js'
import { createIndexService } from '../lib/index-service.js'
import { createSearchService } from '../lib/search.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-dir', import.meta.url))
const IDX_BASE = path.join(TMP_ROOT, 'idx')
fs.mkdirSync(TMP_ROOT, { recursive: true })

test.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))

function makeVault(tag, files = {}) {
  const root = fs.mkdtempSync(path.join(TMP_ROOT, `${tag}-`))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return root
}

// ── ① 落点解析语义（缺省/空串/空白/~ /覆盖/优先级）+ ② 稳定·防撞名·安全名 ─────────
test('① 落点解析语义：缺省/空串/纯空白→出厂默认（~ 展开）；显式 indexDir 覆盖；dir=全落点覆盖优先', () => {
  const V = '/data/Obsidian'
  const name = vaultIndexDirName(path.resolve(V))
  const defaultDir = path.join(os.homedir(), '.dsh/cache/obsidian-web', name)
  assert.equal(DEFAULT_INDEX_DIR_BASE, '~/.dsh/cache/obsidian-web', '出厂默认基目录字面锁定')
  assert.equal(resolveIndexDir({ vaultRoot: V }), defaultDir, '缺省=出厂默认（~ 按 os.homedir() 展开）')
  assert.equal(resolveIndexDir({ vaultRoot: V, indexDir: '' }), defaultDir, '空串=缺省（语义锁定）')
  assert.equal(resolveIndexDir({ vaultRoot: V, indexDir: '   ' }), defaultDir, '纯空白=缺省（语义锁定）')
  assert.equal(resolveIndexDir({ vaultRoot: V, indexDir: undefined }), defaultDir, '显式 undefined=缺省')
  assert.equal(
    resolveIndexDir({ vaultRoot: V, indexDir: '~/my-idx' }),
    path.join(os.homedir(), 'my-idx', name),
    '~/ 前缀按 os.homedir() 展开',
  )
  assert.equal(resolveIndexDir({ vaultRoot: V, indexDir: '/data/idx' }), path.join('/data/idx', name), '显式 indexDir 覆盖')
  assert.equal(resolveIndexDir({ vaultRoot: V, indexDir: '/data/idx', dir: '/custom/full' }), '/custom/full', 'dir=全落点覆盖（优先级最高）')
  assert.equal(resolveIndexDir({ vaultRoot: V, dir: 'rel/dir' }), path.resolve('rel/dir'), 'dir 相对路径绝对化')
  assert.equal(expandIndexDirBase('~'), os.homedir(), '~ 单独=home')
  assert.throws(() => resolveIndexDir({}), /vaultRoot/, 'vaultRoot 缺失必须拒（可解释）')
})

test('② 每 vault 一库：稳定（同 root 同名）+ 防撞名（同名 vault 不同 root 不同库）+ 安全名', () => {
  const a = '/x/Obsidian'
  const b = '/y/Obsidian'
  const nameA = vaultIndexDirName(a)
  assert.equal(vaultIndexDirName(a), nameA, '同 root 解析稳定（重启不换库）')
  assert.notEqual(nameA, vaultIndexDirName(b), '防撞名：同名 vault（不同 root）落不同库')
  assert.ok(nameA.startsWith('Obsidian-'), `安全名可读（basename-哈希）：${nameA}`)
  assert.match(nameA, /^[A-Za-z0-9._-]+$/, '目录名仅 [A-Za-z0-9._-]（安全名）')
  const weird = vaultIndexDirName(path.resolve('/data/我的 vault!*'))
  assert.match(weird, /^[A-Za-z0-9._-]+$/, `特殊字符 root 净化：${weird}`)
  assert.notEqual(nameA, weird, '不同 root 哈希不同')
})

// ── ③a 默认落点端到端真写真查（fake HOME——绝不污染真 ~/.dsh/cache）──────────────
test('③a 默认落点端到端（真写真查）：不传 indexDir → 真落 <HOME>/.dsh/cache/obsidian-web/，vault 内零索引残留', async () => {
  const fakeHome = fs.mkdtempSync(path.join(TMP_ROOT, 'home-'))
  const prevHome = process.env.HOME
  process.env.HOME = fakeHome // os.homedir() 按 $HOME 现值解析（实测）——默认落点端到端不碰真 home
  try {
    const vault = makeVault('defhome', { 'a.md': '# A\n\nneedle 默认落点内容\n' })
    const service = createIndexService({ vaultRoot: vault }) // 不传 indexDir=出厂默认语义被测面
    try {
      const run = await service.refresh()
      assert.equal(run.status, 'done')
      assert.deepEqual(run.counts, { seen: 0, added: 1, updated: 0, removed: 0, degraded: 0 })
      const dir = resolveIndexDir({ vaultRoot: vault })
      assert.ok(dir.startsWith(path.join(fakeHome, '.dsh/cache/obsidian-web') + path.sep), `默认落点=fake HOME 缓存目录：${dir}`)
      assert.equal(service.dir, dir, '服务落点=resolveIndexDir 单一来源')
      assert.ok(fs.statSync(path.join(dir, 'index.db')).size > 0, '真写：index.db 非 0 字节（SCHEMA 真落盘）')
      assert.ok(fs.existsSync(path.join(dir, 'reconcile-ledger.json')), '账本随库落新落点')
      // 真查（fts 后端真 MATCH）
      const svc = createSearchService({ backends: { fts: service.ftsBackend } })
      const r = await svc.search(vault, 'needle')
      assert.equal(r.backend, 'fts', '本地盘索引可用（非降级 scan）')
      assert.ok(r.results.some((h) => h.path === 'a.md'), `真查命中：${JSON.stringify(r.results.map((h) => h.path))}`)
      // vault 内零索引残留（索引库不再随 vault 落 CIFS）
      assert.equal(fs.existsSync(path.join(vault, LEGACY_INDEX_DIR_NAME)), false, 'vault 内零索引残留')
    } finally {
      service.stop()
    }
  } finally {
    process.env.HOME = prevHome
  }
})

// ── ③b 覆盖落点真写真查 + FTS5 速度面恢复证据（本地盘冷建/查询/增量）──────────────
test('③b 覆盖落点真写真查 + FTS5 速度面证据：300 篇冷建/MATCH 查询/增量，实测数字走 diagnostic', async (t) => {
  const vault = makeVault('speed')
  const body = '速度样本内容 sample body 正文内容 '.repeat(40)
  for (let i = 0; i < 300; i += 1) {
    fs.writeFileSync(path.join(vault, `n${i}.md`), `# Note ${i}\n\n${body} needle${i % 7} common\n`)
  }
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  try {
    const t0 = performance.now()
    const run = await service.refresh()
    const buildMs = performance.now() - t0
    assert.equal(run.status, 'done')
    assert.equal(run.counts.added, 300, '冷建全量入库')

    const svc = createSearchService({ backends: { fts: service.ftsBackend } })
    const t1 = performance.now()
    const r = await svc.search(vault, 'common')
    const queryMs = performance.now() - t1
    assert.equal(r.backend, 'fts', '查询走 fts 索引后端（非 scan）')
    assert.equal(r.results.length, 50, '全量命中（默认 limit=50 截取）')

    // 真查正确性：needle3 只命中 i%7===3 的样本
    const r3 = await svc.search(vault, 'needle3')
    assert.ok(r3.results.length > 0, 'needle3 真命中')
    for (const h of r3.results) {
      assert.ok(Number(h.path.slice(1, -3)) % 7 === 3, `FTS 命中口径错：${h.path}`)
    }

    // 增量（保存即增量同径 store.upsertFile；此处走对账增量面验证速度）
    fs.writeFileSync(path.join(vault, 'n300.md'), `# Note 300\n\n${body} common\n`)
    const t2 = performance.now()
    const run2 = await service.refresh()
    const incMs = performance.now() - t2
    assert.deepEqual(run2.counts, { seen: 300, added: 1, updated: 0, removed: 0, degraded: 0 }, '增量 diff 精确')

    t.diagnostic(`FTS5 速度面（本地盘 ext4，indexDir=${IDX_BASE}）：300 篇冷建 ${buildMs.toFixed(1)}ms（${(buildMs / 300).toFixed(2)}ms/篇）、MATCH 查询 ${queryMs.toFixed(1)}ms、增量对账 ${incMs.toFixed(1)}ms`)
    assert.ok(buildMs < 15000, `本地盘冷建速度面（宽松上界防 flaky）：${buildMs.toFixed(1)}ms`)
    assert.ok(queryMs < 1000, `MATCH 查询速度面（宽松上界防 flaky）：${queryMs.toFixed(1)}ms`)
    assert.ok(incMs < 10000, `增量对账速度面（宽松上界防 flaky）：${incMs.toFixed(1)}ms`)
  } finally {
    service.stop()
  }
})

// ── ④ 多档案分库（多 vault 档案各一库，互不串）────────────────────────────────────
test('④ 多档案分库：同 indexDir 两个同名 vault（不同 root）→ 各一库互不串 + 同 root 复用同一库', async () => {
  const a = path.join(TMP_ROOT, 'multi-x', 'Obsidian')
  const b = path.join(TMP_ROOT, 'multi-y', 'Obsidian')
  fs.mkdirSync(a, { recursive: true })
  fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(a, 'a.md'), '# A\n\nalpha 只在档案甲\n')
  fs.writeFileSync(path.join(b, 'b.md'), '# B\n\nbeta 只在档案乙\n')

  const svcA = createIndexService({ vaultRoot: a, indexDir: IDX_BASE })
  const svcB = createIndexService({ vaultRoot: b, indexDir: IDX_BASE })
  try {
    assert.notEqual(svcA.dir, svcB.dir, '同名 vault（不同 root）分库')
    assert.equal(path.dirname(svcA.dir), IDX_BASE, '同基目录（多档案同 indexDir）')
    assert.ok(path.basename(svcA.dir).startsWith('Obsidian-'), `安全名可读：${path.basename(svcA.dir)}`)
    await svcA.refresh()
    await svcB.refresh()
    assert.equal(svcA.store.count(), 1)
    assert.equal(svcB.store.count(), 1)
    assert.deepEqual([...svcA.store.listDocs().keys()], ['a.md'], '档案甲只含甲内容')
    assert.deepEqual([...svcB.store.listDocs().keys()], ['b.md'], '档案乙只含乙内容（互不串）')
    const searchA = createSearchService({ backends: { fts: svcA.ftsBackend } })
    const ra = await searchA.search(a, 'alpha')
    assert.equal(ra.backend, 'fts')
    assert.deepEqual(ra.results.map((h) => h.path), ['a.md'], '跨档案查询只见本档案')
  } finally {
    svcA.stop()
    svcB.stop()
  }
  // 同 root 重启复用同一库（落点稳定，不重建不换名）
  const svcA2 = createIndexService({ vaultRoot: a, indexDir: IDX_BASE })
  try {
    assert.equal(svcA2.dir, path.join(IDX_BASE, vaultIndexDirName(a)), '同 root 落点稳定')
    assert.equal(svcA2.store.count(), 1, '复用既有库（非重建空库）')
  } finally {
    svcA2.stop()
  }
})

// ── ⑤ 旧落点检测：提示重建留痕 + 旧目录逐字节保留（绝不静默删除）──────────────────
test('⑤ 旧落点 .ob-index/ 检测→重建提示留痕（新落点正常、旧目录逐字节保留不删）；显式 dir=同落点不提示', async () => {
  const vault = makeVault('legacy', { 'a.md': '# A\n\nlegacy 旧落点内容 needle\n' })
  const legacyDir = path.join(vault, LEGACY_INDEX_DIR_NAME)
  fs.mkdirSync(legacyDir, { recursive: true })
  const stale = Buffer.from('stale-index-bytes-not-sqlite')
  fs.writeFileSync(path.join(legacyDir, 'index.db'), stale)

  const warns = []
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE, warn: (l) => warns.push(String(l)) })
  try {
    const hit = warns.find((l) => l.includes(LEGACY_INDEX_DIR_NAME) && l.includes('重建'))
    assert.ok(hit, `旧落点检测必须留痕（重建提示）：${JSON.stringify(warns)}`)
    assert.ok(hit.includes('未删除'), '留痕必须写明旧目录未删除（防不可逆）')
    assert.ok(hit.includes(IDX_BASE), '留痕必须写明新落点')
    const run = await service.refresh()
    assert.equal(run.status, 'done')
    assert.equal(run.counts.added, 1, '新落点重建（索引=可重建零损失缓存 ARC-2，不迁移旧库）')
    assert.ok(fs.statSync(path.join(service.dir, 'index.db')).size > 0, '新落点真库')
    assert.ok(!service.dir.startsWith(`${vault}${path.sep}`), '新落点在 vault 外（本地盘）')
    assert.deepEqual(fs.readFileSync(path.join(legacyDir, 'index.db')), stale, '旧落点逐字节保留（绝不静默删除/改写）')
  } finally {
    service.stop()
  }

  // 显式 dir 落旧落点（测试缝/特殊部署）= 同落点，不提示旧落点
  const vault2 = makeVault('legacy2', { 'a.md': '# A\n\nlegacy 内容\n' })
  const legacyDir2 = path.join(vault2, LEGACY_INDEX_DIR_NAME)
  fs.mkdirSync(legacyDir2, { recursive: true })
  const warns2 = []
  const svc2 = createIndexService({ vaultRoot: vault2, dir: legacyDir2, warn: (l) => warns2.push(String(l)) })
  try {
    assert.equal(warns2.filter((l) => l.includes('旧索引落点')).length, 0, `同落点（显式 dir）不提示：${JSON.stringify(warns2)}`)
    const run2 = await svc2.refresh()
    assert.equal(run2.status, 'done', '显式 dir 全落点覆盖照常工作')
  } finally {
    svc2.stop()
  }
})
