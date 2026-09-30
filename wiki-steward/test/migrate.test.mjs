// migrate.test.mjs — 数据面收口（2026-09-30）：遗留 ~/.dsh/kb-index/{queue,schedule-ledger.json}
// 与 ~/.dsh/kb-alerts.md → plugins/wiki-steward/data/
// 语义锁：无遗留=零副作用（不 mkdir）；新家已有不覆盖；旧 kb-index 非空（对家 active.db）保留；幂等可重入。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateLegacyState } from '../lib/index.js'

function fakeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-mig-'))
  process.env.HOME = home
  t.after(() => { delete process.env.HOME })
  return home
}

function pathsOf(home) {
  const dataRoot = path.join(home, '.dsh', 'plugins', 'wiki-steward', 'data')
  return {
    dataRoot,
    paths: {
      queueDir: path.join(dataRoot, 'kb-index', 'queue'),
      ledgerFile: path.join(dataRoot, 'kb-index', 'schedule-ledger.json'),
      alertFile: path.join(dataRoot, 'kb-alerts.md'),
    },
  }
}

test('无遗留 = 零副作用：新旧目录都不创建', (t) => {
  const home = fakeHome(t)
  const { dataRoot, paths } = pathsOf(home)
  const warnings = []
  const r = migrateLegacyState({ dataRoot, paths, warn: (l) => warnings.push(l) })
  assert.deepEqual(r, { moved: [] })
  assert.deepEqual(warnings, [])
  assert.ok(!fs.existsSync(dataRoot), '新家不建（零落盘）')
  assert.ok(!fs.existsSync(path.join(home, '.dsh', 'kb-index')), '旧落点不建')
})

test('queue/账本/告警全迁 → 新家在场、迁空旧 kb-index 删除、再跑幂等', (t) => {
  const home = fakeHome(t)
  const legacy = path.join(home, '.dsh', 'kb-index')
  fs.mkdirSync(path.join(legacy, 'queue'), { recursive: true })
  fs.writeFileSync(path.join(legacy, 'queue', 'a.json'), 'entry')
  fs.writeFileSync(path.join(legacy, 'schedule-ledger.json'), 'ledger')
  fs.writeFileSync(path.join(home, '.dsh', 'kb-alerts.md'), 'alert-line')
  const { dataRoot, paths } = pathsOf(home)
  const r = migrateLegacyState({ dataRoot, paths })
  assert.deepEqual(r.moved.sort(), ['kb-alerts.md', 'queue', 'schedule-ledger.json'])
  assert.equal(fs.readFileSync(path.join(paths.queueDir, 'a.json'), 'utf8'), 'entry')
  assert.equal(fs.readFileSync(paths.ledgerFile, 'utf8'), 'ledger')
  assert.equal(fs.readFileSync(paths.alertFile, 'utf8'), 'alert-line')
  assert.ok(!fs.existsSync(legacy), '迁空旧目录删除')
  assert.ok(!fs.existsSync(path.join(home, '.dsh', 'kb-alerts.md')))
  assert.deepEqual(migrateLegacyState({ dataRoot, paths }), { moved: [] }, '重入幂等')
})

test('旧 kb-index 留有对家 active.db → 只搬自家两项，旧目录保留', (t) => {
  const home = fakeHome(t)
  const legacy = path.join(home, '.dsh', 'kb-index')
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, 'active.db'), 'idx=kb-context')
  fs.writeFileSync(path.join(legacy, 'schedule-ledger.json'), 'ledger')
  const { dataRoot, paths } = pathsOf(home)
  const r = migrateLegacyState({ dataRoot, paths })
  assert.deepEqual(r.moved, ['schedule-ledger.json'])
  assert.equal(fs.readFileSync(path.join(legacy, 'active.db'), 'utf8'), 'idx=kb-context', '对家索引原地不动')
})

test('新家已有 → 不覆盖不搬', (t) => {
  const home = fakeHome(t)
  const { dataRoot, paths } = pathsOf(home)
  fs.mkdirSync(path.dirname(paths.alertFile), { recursive: true })
  fs.writeFileSync(paths.alertFile, 'fresh')
  fs.writeFileSync(path.join(home, '.dsh', 'kb-alerts.md'), 'stale')
  const r = migrateLegacyState({ dataRoot, paths })
  assert.deepEqual(r.moved, [])
  assert.equal(fs.readFileSync(paths.alertFile, 'utf8'), 'fresh')
  assert.equal(fs.readFileSync(path.join(home, '.dsh', 'kb-alerts.md'), 'utf8'), 'stale', '旧副本留原地')
})
