// vault-ops 保存契约测试（T4）：OW-INV-3 安全写入——原子锁（withFileLock lease）+ mtime/etag 乐观锁
// + 冲突三选（覆盖/重载/对比）+ diff undo 往返；并发双写竞争注入（OW-US-4 验收）。
// 真验行为零 mock：真 fixture 文件系统副本（test/.tmp-*），真并发 Promise.all 双写。
// 边界（T12 裁定）：路径围栏=词法围栏（'..'/绝对/盘符/NUL 拒）；realpath/symlink 围栏归 T12，本卡不宣称 symlink 安全。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readNote, saveNote } from '../lib/vault-ops.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-save', import.meta.url))

function tmpVault(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  fs.cpSync(path.join(FIXTURES, 'vault'), dir, { recursive: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const snapKeys = ['content', 'etag', 'mtime', 'size']

// ── ④ 无乐观锁不落盘（负例）──────────────────────────────────────────────────
test('OW-INV-3：无乐观锁不落盘——缺 expectedMtime/etag 一律 bad_request 且盘上内容不动', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/a.md')
  for (const opts of [undefined, {}, { expectedMtime: undefined }, { etag: undefined }]) {
    await assert.rejects(() => saveNote(root, 'notes/a.md', '被拒绝的内容', opts), (err) => err.code === 'bad_request', JSON.stringify(opts))
  }
  const after = readNote(root, 'notes/a.md')
  assert.equal(after.content, before.content, '缺乐观锁必须零写入')
  assert.equal(after.mtime, before.mtime, 'mtime 不得变化')
})

test('保存围栏：../ 穿越/绝对路径/NUL/盘符 bad_request（写侧词法围栏，与读侧同款）', async (t) => {
  const root = tmpVault(t)
  for (const bad of ['../outside.md', '/etc/passwd', 'notes/../../x.md', 'a\0b.md', 'C:/win.md']) {
    await assert.rejects(() => saveNote(root, bad, 'x', { expectedMtime: 1 }), (err) => err.code === 'bad_request', `必须拒：${bad}`)
  }
})

test('保存目标不存在 → not_found（本卡保存仅覆盖已存在文件，新建归后续）', async (t) => {
  const root = tmpVault(t)
  await assert.rejects(() => saveNote(root, 'notes/nope.md', 'x', { expectedMtime: 1 }), (err) => err.code === 'not_found')
})

// ── 乐观锁正例 + 返回形 ──────────────────────────────────────────────────────
test('保存正例（mtime 锁）：ok 形锁定 + 盘上内容落盘 + 新 etag 生效', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/a.md')
  const result = await saveNote(root, 'notes/a.md', '# 已保存\n', { expectedMtime: before.mtime })
  assert.deepEqual(Object.keys(result).sort(), ['diffUndo', 'etag', 'mtime', 'ok', 'path', 'size'])
  assert.equal(result.ok, true)
  assert.equal(result.path, 'notes/a.md')
  assert.deepEqual(Object.keys(result.diffUndo).sort(), ['after', 'before'])
  for (const snap of [result.diffUndo.before, result.diffUndo.after]) assert.deepEqual(Object.keys(snap).sort(), snapKeys)
  assert.equal(result.diffUndo.before.content, before.content, 'diffUndo.before=保存前内容快照（一键还原源）')
  assert.equal(result.diffUndo.after.content, '# 已保存\n')
  const disk = readNote(root, 'notes/a.md')
  assert.equal(disk.content, '# 已保存\n')
  assert.equal(disk.mtime, result.mtime)
  assert.equal(disk.etag, result.etag)
})

test('保存正例（etag 锁）：etag 形乐观锁同样落盘', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/b.md')
  const result = await saveNote(root, 'notes/b.md', 'etag 锁内容', { etag: before.etag })
  assert.equal(result.ok, true)
  assert.equal(readNote(root, 'notes/b.md').content, 'etag 锁内容')
})

// ── 冲突三选（覆盖/重载/对比）────────────────────────────────────────────────
test('陈旧锁 → conflict 形锁定：{conflict, diffUndo:{before, incoming}}，盘上内容不动', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/a.md')
  const result = await saveNote(root, 'notes/a.md', '过期内容', { expectedMtime: before.mtime - 1000 })
  assert.deepEqual(Object.keys(result).sort(), ['conflict', 'diffUndo', 'path'])
  assert.equal(result.conflict, true)
  assert.deepEqual(Object.keys(result.diffUndo).sort(), ['before', 'incoming'])
  assert.deepEqual(Object.keys(result.diffUndo.before).sort(), snapKeys)
  assert.deepEqual(Object.keys(result.diffUndo.incoming).sort(), ['content'])
  assert.equal(result.diffUndo.before.content, before.content, 'before=冲突时盘上内容（重载/对比基线）')
  assert.equal(result.diffUndo.incoming.content, '过期内容', 'incoming=本次尝试写入（对比面）')
  assert.equal(readNote(root, 'notes/a.md').content, before.content, '冲突必须零写入')
})

test('冲突三选语义：覆盖=以 before.mtime 为新乐观锁重试成功；重载=取 before.content；对比=双快照可 diff', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/a.md')
  const conflict = await saveNote(root, 'notes/a.md', '我方内容', { expectedMtime: before.mtime - 1000 })
  // 覆盖（overwrite）
  const overwrite = await saveNote(root, 'notes/a.md', conflict.diffUndo.incoming.content, { expectedMtime: conflict.diffUndo.before.mtime })
  assert.equal(overwrite.ok, true, '覆盖：以盘上现 mtime 为新乐观锁必须成功')
  assert.equal(readNote(root, 'notes/a.md').content, '我方内容')
  // 重载（reload）= diffUndo.before.content 即盘上内容
  assert.equal(conflict.diffUndo.before.content, before.content, '重载源=before.content')
  // 对比（compare）= before.content vs incoming.content 双快照俱在
  assert.notEqual(conflict.diffUndo.before.content, conflict.diffUndo.incoming.content, '对比面：两份内容可作 diff')
})

// ── ⑤ 并发双写竞争注入 ───────────────────────────────────────────────────────
test('并发双写竞争注入：同一乐观锁双写恰一 ok 一 conflict，盘上=胜者内容（OW-INV-3）', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/a.md')
  const [r1, r2] = await Promise.all([
    saveNote(root, 'notes/a.md', '写入者一', { expectedMtime: before.mtime }),
    saveNote(root, 'notes/a.md', '写入者二', { expectedMtime: before.mtime }),
  ])
  const oks = [r1, r2].filter((r) => r.ok === true)
  const conflicts = [r1, r2].filter((r) => r.conflict === true)
  assert.equal(oks.length, 1, `恰一个胜者：${JSON.stringify([r1, r2])}`)
  assert.equal(conflicts.length, 1, '恰一个冲突')
  const disk = readNote(root, 'notes/a.md')
  assert.ok(['写入者一', '写入者二'].includes(disk.content), '盘上=胜者内容')
  assert.equal(disk.content, oks[0].diffUndo.after.content)
  assert.equal(conflicts[0].diffUndo.incoming.content, disk.content === '写入者一' ? '写入者二' : '写入者一', '败者内容进 incoming（对比面）')
})

test('外部写者竞争注入（桌面 Obsidian 并发）：盘被改后旧 mtime 保存必冲突且零覆盖', async (t) => {
  const root = tmpVault(t)
  const before = readNote(root, 'notes/a.md')
  // 模拟外部写者：编辑器打开期间盘上内容被他方替换
  fs.writeFileSync(path.join(root, 'notes/a.md'), '桌面端写入', 'utf8')
  const result = await saveNote(root, 'notes/a.md', '网页端写入', { expectedMtime: before.mtime })
  assert.equal(result.conflict, true)
  assert.equal(readNote(root, 'notes/a.md').content, '桌面端写入', '外部写入不得被静默覆盖')
  assert.equal(result.diffUndo.before.content, '桌面端写入')
})

// ── ⑥ diff undo 往返 ─────────────────────────────────────────────────────────
test('diff undo 往返：保存→diffUndo.before→还原，内容回到保存前（内存级 undo 契约）', async (t) => {
  const root = tmpVault(t)
  const v1 = readNote(root, 'notes/a.md')
  const saved = await saveNote(root, 'notes/a.md', '改坏的第二版', { expectedMtime: v1.mtime })
  assert.equal(saved.diffUndo.before.content, v1.content)
  // 一键还原：以 before.content 再保存（新乐观锁=保存后的 mtime）
  const restored = await saveNote(root, 'notes/a.md', saved.diffUndo.before.content, { expectedMtime: saved.mtime })
  assert.equal(restored.ok, true)
  const roundtrip = readNote(root, 'notes/a.md')
  assert.equal(roundtrip.content, v1.content, 'diff undo 往返后内容与保存前逐字节一致')
})
