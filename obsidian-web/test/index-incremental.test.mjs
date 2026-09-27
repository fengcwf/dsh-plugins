// T11 索引三保险——①保存即增量（saveNote/createNote/renameNote/deletePath 事件钩子 → 增量更新）。
// 语义：写路径成功落盘后即时增量更新索引（毫秒级文件级，零定时器等待）；冲突/域拒绝/回滚态零事件零副作用。
// 真验零 mock：真 tmp vault（test/.tmp-index-inc/）、真 sqlite（node:sqlite FTS5 trigram）、真事件钩子
// （vault-ops 写路径真发事件）、真检索（createSearchService 接真 fts 后端）。唯一注入点=被测事件面本身。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  saveNote, createNote, renameNote, deletePath, readNote, onVaultChange,
} from '../lib/vault-ops.js'
import { createIndexService } from '../lib/index-service.js'
import { createSearchService } from '../lib/search.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-inc', import.meta.url))

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

/** 服务+检索面真装配（fts 接管缝原样消费） */
async function startService(vault) {
  const service = createIndexService({ vaultRoot: vault })
  await service.start()
  return { service, svc: createSearchService({ backends: { fts: service.ftsBackend } }) }
}

// ── 事件钩子契约（vault-ops 写路径事件面，键形锁定）────────────────────────────
test('① 事件钩子契约：saveNote/createNote/renameNote/deletePath 成功后恰发一事件（形锁定），冲突/域拒绝零事件', async () => {
  const vault = makeVault({ 'notes/a.md': '# Alpha\n\nalpha body内容甲\n' })
  const events = []
  const off = onVaultChange((e) => events.push(e))
  try {
    // saveNote 成功 → {type:'save', path, content}
    const note = readNote(vault, 'notes/a.md')
    const saved = await saveNote(vault, 'notes/a.md', '# Alpha\n\nupdated 内容乙\n', { etag: note.etag })
    assert.equal(saved.ok, true)
    assert.deepEqual(events.pop(), { type: 'save', path: 'notes/a.md', content: '# Alpha\n\nupdated 内容乙\n' })

    // saveNote 冲突（乐观锁不符）→ 零事件（未落盘）
    const conflict = await saveNote(vault, 'notes/a.md', 'x', { etag: 'stale-etag' })
    assert.equal(conflict.conflict, true)
    assert.equal(events.length, 0, '冲突零落盘零事件')

    // createNote 成功 → {type:'create', path, content}；target-exists 域拒绝零事件
    const created = await createNote(vault, 'notes/b.md', '# Beta\n\nbeta 内容丙\n')
    assert.equal(created.ok, true)
    assert.deepEqual(events.pop(), { type: 'create', path: 'notes/b.md', content: '# Beta\n\nbeta 内容丙\n' })
    const exists = await createNote(vault, 'notes/b.md', 'dup')
    assert.equal(exists.ok, false)
    assert.equal(events.length, 0, '域拒绝零事件')

    // renameNote 成功 → {type:'rename', from, to, changed}（changed 含 from+to+改写件）
    const renamed = await renameNote(vault, 'notes/a.md', 'notes/c.md')
    assert.equal(renamed.ok, true)
    const renameEvent = events.pop()
    assert.equal(renameEvent.type, 'rename')
    assert.equal(renameEvent.from, 'notes/a.md')
    assert.equal(renameEvent.to, 'notes/c.md')
    assert.deepEqual(renameEvent.changed, renamed.changed)
    assert.deepEqual(events.length, 0)

    // deletePath 成功 → {type:'delete', path, trashPath, isDir}；双确认缺省拒零事件
    const rejected = await deletePath(vault, 'notes/b.md', {})
    assert.equal(rejected.ok, false)
    assert.equal(events.length, 0, '双确认缺省拒零事件')
    const deleted = await deletePath(vault, 'notes/b.md', { confirm: 'notes/b.md' })
    assert.equal(deleted.ok, true)
    const deleteEvent = events.pop()
    assert.equal(deleteEvent.type, 'delete')
    assert.equal(deleteEvent.path, 'notes/b.md')
    assert.equal(deleteEvent.trashPath, deleted.trashPath)
    assert.equal(deleteEvent.isDir, false)
    assert.deepEqual(events.length, 0)
  } finally {
    off()
  }
})

test('① 事件钩子隔离：监听器抛错不影响写路径结果（INV-15 留痕不静默），退订后零事件', async () => {
  const vault = makeVault({ 'notes/a.md': '# Alpha\n\nalpha body\n' })
  const seen = []
  const offBad = onVaultChange(() => { throw new Error('listener boom') })
  const offGood = onVaultChange((e) => seen.push(e.type))
  try {
    const note = readNote(vault, 'notes/a.md')
    const saved = await saveNote(vault, 'notes/a.md', '# Alpha\n\nok\n', { etag: note.etag })
    assert.equal(saved.ok, true, '监听器抛错不回传到写路径')
    assert.deepEqual(seen, ['save'], '坏监听器不挡后续监听器')
  } finally {
    offBad()
    offGood()
  }
  const note = readNote(vault, 'notes/a.md')
  await saveNote(vault, 'notes/a.md', '# Alpha\n\nok2\n', { etag: note.etag })
  assert.deepEqual(seen, ['save'], '退订后零事件')
})

// ── ① 保存即增量（三事件 + create）───────────────────────────────────────────
test('① 保存即增量：saveNote 落盘 → 索引即时更新（旧词即时出索引、新词即时可检索，零对账等待）', async () => {
  const vault = makeVault({ 'notes/a.md': '# Alpha\n\nhello world 世界旧文\n' })
  const { service, svc } = await startService(vault)
  try {
    const before = await svc.search(vault, 'world')
    assert.equal(before.backend, 'fts')
    assert.deepEqual(before.results.map((r) => r.path), ['notes/a.md'])

    const note = readNote(vault, 'notes/a.md')
    const t0 = performance.now()
    const saved = await saveNote(vault, 'notes/a.md', '# Alpha\n\ngoodbye mars 星球新文\n', { etag: note.etag })
    assert.equal(saved.ok, true)
    const elapsed = performance.now() - t0 // 保存调用返回时索引已更新=增量含在毫秒级路径内

    const after = await svc.search(vault, 'mars')
    assert.deepEqual(after.results.map((r) => r.path), ['notes/a.md'], '新词即时可检索')
    const gone = await svc.search(vault, 'world')
    assert.deepEqual(gone.results, [], '旧词即时出索引（未等 30min 对账）')
    assert.ok(elapsed < 2000, `保存+增量毫秒级路径：${elapsed.toFixed(1)}ms < 2000ms`)
  } finally {
    service.stop()
  }
})

test('① 新建即增量：createNote 落盘 → 索引即时可检索', async () => {
  const vault = makeVault({ 'notes/a.md': '# Alpha\n\nalpha body\n' })
  const { service, svc } = await startService(vault)
  try {
    const created = await createNote(vault, 'notes/new.md', '# New\n\nfresh 内容乙\n')
    assert.equal(created.ok, true)
    const hits = await svc.search(vault, 'fresh')
    assert.deepEqual(hits.results.map((r) => r.path), ['notes/new.md'], '新建即时可检索')
  } finally {
    service.stop()
  }
})

test('① 改名即增量：renameNote 事务 → 旧路径即时出索引、新路径即时可检索、wikilink 改写件同步更新', async () => {
  const vault = makeVault({
    'notes/a.md': '# Alpha\n\nalpha body内容甲\n',
    'notes/link.md': '# Link\n\nrefers [[a]] marker\n',
  })
  const { service, svc } = await startService(vault)
  try {
    const before = await svc.search(vault, 'alpha')
    assert.deepEqual([...new Set(before.results.map((r) => r.path))], ['notes/a.md'])

    const renamed = await renameNote(vault, 'notes/a.md', 'notes/b.md')
    assert.equal(renamed.ok, true)

    const after = await svc.search(vault, 'alpha')
    assert.deepEqual([...new Set(after.results.map((r) => r.path))], ['notes/b.md'], '新路径即时可检索、旧路径零命中')
    const rewrote = await svc.search(vault, '[[b]]')
    assert.deepEqual(rewrote.results.map((r) => r.path), ['notes/link.md'], 'wikilink 改写件同步进索引（[[a]]→[[b]]）')
  } finally {
    service.stop()
  }
})

test('① 删除即增量：deletePath（文件/目录）→ 路径与子树即时出索引', async () => {
  const vault = makeVault({
    'notes/a.md': '# Alpha\n\nalpha body\n',
    'notes/b.md': '# Beta\n\nbeta body\n',
    'keep.md': '# Keep\n\nkeep body\n',
  })
  const { service, svc } = await startService(vault)
  try {
    const deleted = await deletePath(vault, 'notes', { confirm: 'notes' })
    assert.equal(deleted.ok, true)
    assert.equal(deleted.trashPath, '.trash/notes')
    assert.deepEqual((await svc.search(vault, 'alpha')).results, [], '子树文件 a.md 即时出索引')
    assert.deepEqual((await svc.search(vault, 'beta')).results, [], '子树文件 b.md 即时出索引')
    assert.deepEqual((await svc.search(vault, 'body')).results.map((r) => r.path), ['keep.md'], '目录删除=子树全出索引')
  } finally {
    service.stop()
  }
})
