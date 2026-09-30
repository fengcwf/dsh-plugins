// migrate.test.mjs — 数据面收口（2026-09-30）：遗留 ~/.dsh/kb-index/ → plugins/kb-context/data/kb-index/
// 语义锁：无遗留=零副作用（T7 apply 零落盘不变式）；只搬 active.db*（queue/归 wiki-steward）；
// 新家已有不覆盖；旧目录非空保留；幂等可重入。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateLegacyIndexDb, pluginDataDir, resolveIndexDbPath } from '../lib/index.js'

function fakeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-mig-'))
  process.env.HOME = home
  t.after(() => { delete process.env.HOME })
  return home
}

test('无遗留 = 零副作用：新旧目录都不创建', (t) => {
  const home = fakeHome(t)
  const r = migrateLegacyIndexDb()
  assert.deepEqual(r, { moved: [] })
  assert.ok(!fs.existsSync(path.join(home, '.dsh', 'kb-index')), '旧落点不建')
  assert.ok(!fs.existsSync(pluginDataDir()), '新家也不建（零落盘）')
})

test('遗留 active.db+侧车+candidate → 全迁新家，旧 kb-index 迁空即删，再跑幂等', (t) => {
  const home = fakeHome(t)
  const legacy = path.join(home, '.dsh', 'kb-index')
  fs.mkdirSync(legacy, { recursive: true })
  for (const n of ['active.db', 'active.db-shm', 'active.db-wal', 'active.db.candidate']) {
    fs.writeFileSync(path.join(legacy, n), `data:${n}`)
  }
  const r = migrateLegacyIndexDb()
  assert.deepEqual(r.moved.sort(), ['active.db', 'active.db-shm', 'active.db-wal', 'active.db.candidate'])
  const newDir = path.join(pluginDataDir(), 'kb-index')
  for (const n of r.moved) assert.equal(fs.readFileSync(path.join(newDir, n), 'utf8'), `data:${n}`)
  assert.equal(fs.readFileSync(resolveIndexDbPath(), 'utf8'), 'data:active.db')
  assert.ok(!fs.existsSync(legacy), '迁空旧目录删除')
  assert.deepEqual(migrateLegacyIndexDb(), { moved: [] }, '重入幂等')
})

test('旧 kb-index 还有对家状态（queue/）→ 只搬 active.db*，旧目录保留', (t) => {
  const home = fakeHome(t)
  const legacy = path.join(home, '.dsh', 'kb-index')
  fs.mkdirSync(path.join(legacy, 'queue'), { recursive: true })
  fs.writeFileSync(path.join(legacy, 'active.db'), 'idx')
  fs.writeFileSync(path.join(legacy, 'schedule-ledger.json'), 'ledger=wiki-steward')
  const r = migrateLegacyIndexDb()
  assert.deepEqual(r.moved, ['active.db'])
  assert.ok(fs.existsSync(path.join(legacy, 'queue')), '对家状态原地不动')
  assert.ok(fs.existsSync(path.join(legacy, 'schedule-ledger.json')), '对家账本原地不动')
  assert.equal(fs.readFileSync(path.join(legacy, 'schedule-ledger.json'), 'utf8'), 'ledger=wiki-steward')
})

test('新家已有 active.db → 不覆盖不搬（旧副本留原地）', (t) => {
  const home = fakeHome(t)
  const legacy = path.join(home, '.dsh', 'kb-index')
  fs.mkdirSync(path.join(pluginDataDir(), 'kb-index'), { recursive: true })
  fs.writeFileSync(resolveIndexDbPath(), 'fresh')
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, 'active.db'), 'stale')
  const r = migrateLegacyIndexDb()
  assert.deepEqual(r.moved, [])
  assert.equal(r.skipped, true)
  assert.equal(fs.readFileSync(resolveIndexDbPath(), 'utf8'), 'fresh')
  assert.equal(fs.readFileSync(path.join(legacy, 'active.db'), 'utf8'), 'stale')
})
