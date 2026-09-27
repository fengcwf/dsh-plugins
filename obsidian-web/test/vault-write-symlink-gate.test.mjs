// 写面最终分量 symlink 门（T14 收口批 / T12 review Issue 1(b)）：
// saveNote/createNote 显式 lstat 最终分量门——与 export/share/rename/delete 同向（symlink 条目
// 显式拒、不解引用），同物不变量保真：别名与真实路径恒同物，写既不顶替别名节点（不把 symlink
// 静默 rename 成普通文件=别名断裂），也不静默写穿别名目标（文件级别名写语义裁定=写面拒，
// 中间段目录别名解引用语义不变——OW-INV-7⑨ 正例锁形随附）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveNote, createNote } from '../lib/vault-ops.js'

const TMP = fileURLToPath(new URL('./.tmp-symgate', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

function freshVault(tag) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  fs.mkdirSync(path.join(root, 'notes'))
  fs.mkdirSync(path.join(root, 'sub', 'b'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sub', 'b', 'real.md'), '# REAL\n')
  return root
}

// ── saveNote 最终分量门 ──────────────────────────────────────────────────────

test('saveNote 最终分量=in-root 别名 symlink → not-a-file 显式拒 + 同物不变量保真（别名不被顶替、目标零写入）', async () => {
  const root = freshVault('save-alias')
  fs.symlinkSync(path.join('sub', 'b', 'real.md'), path.join(root, 'notes', 'a.md')) // 相对目标（in-root 别名）
  await assert.rejects(
    () => saveNote(root, 'notes/a.md', 'pwn', { etag: '0-0' }),
    (err) => err?.code === 'not-a-file',
    '最终分量 symlink 写面必须显式拒（not-a-file，与 export/share lstat 门同向）',
  )
  const node = fs.lstatSync(path.join(root, 'notes', 'a.md'))
  assert.ok(node.isSymbolicLink(), '别名节点必须仍是 symlink（写不顶替别名=同物不变量保真）')
  assert.equal(fs.readlinkSync(path.join(root, 'notes', 'a.md')), path.join('sub', 'b', 'real.md'), '链接目标不变')
  assert.equal(fs.readFileSync(path.join(root, 'sub', 'b', 'real.md'), 'utf8'), '# REAL\n', '别名目标内容零写入（不静默写穿）')
})

test('saveNote 最终分量=dangling symlink → not-a-file 显式拒 + 不凭空造目标（零残渣）', async () => {
  const root = freshVault('save-dangling')
  fs.symlinkSync('notes/ghost.md', path.join(root, 'notes', 'g.md')) // 悬空（目标不存在）
  await assert.rejects(
    () => saveNote(root, 'notes/g.md', 'pwn', { etag: '0-0' }),
    (err) => err?.code === 'not-a-file',
    'dangling 最终分量 symlink 同拒（lstat 门判类型，不解引用不看目标）',
  )
  assert.ok(fs.lstatSync(path.join(root, 'notes', 'g.md')).isSymbolicLink(), 'symlink 仍在')
  assert.equal(fs.existsSync(path.join(root, 'notes', 'ghost.md')), false, '不得凭空造出链接目标')
})

test('saveNote 普通文件正例回归（symlink 门不误伤真文件：落盘+diffUndo 快照）', async () => {
  const root = freshVault('save-real')
  const result = await saveNote(root, 'sub/b/real.md', '# NEW\n', { etag: `${Buffer.byteLength('# REAL\n')}-${fs.statSync(path.join(root, 'sub', 'b', 'real.md')).mtimeMs}` })
  assert.equal(result.ok, true)
  assert.equal(fs.readFileSync(path.join(root, 'sub', 'b', 'real.md'), 'utf8'), '# NEW\n')
  assert.equal(result.diffUndo.before.content, '# REAL\n', '保存前快照照旧（diff undo 可用）')
})

test('saveNote 目标为目录 → 照旧拒（not_found，symlink 门不改变既有类型语义）', async () => {
  const root = freshVault('save-dir')
  await assert.rejects(() => saveNote(root, 'sub', 'x', { etag: '0-0' }), (err) => err?.code === 'not_found')
})

// ── createNote 最终分量门 ────────────────────────────────────────────────────

test('createNote 最终分量=in-root 别名 symlink → {ok:false,reason:not-a-file} + 同物不变量保真', async () => {
  const root = freshVault('create-alias')
  fs.symlinkSync(path.join('sub', 'b', 'real.md'), path.join(root, 'notes', 'a.md'))
  const result = await createNote(root, 'notes/a.md', 'pwn')
  assert.deepEqual(result, { ok: false, reason: 'not-a-file' }, '最终分量 symlink=类型拒（not-a-file，与 export/share 同向），非 target-exists 冒充')
  assert.ok(fs.lstatSync(path.join(root, 'notes', 'a.md')).isSymbolicLink(), '别名节点仍是 symlink')
  assert.equal(fs.readFileSync(path.join(root, 'sub', 'b', 'real.md'), 'utf8'), '# REAL\n', '别名目标零写入')
})

test('createNote 最终分量=dangling symlink → not-a-file + 零残渣；root 外指 symlink=围栏先行拒（bad_request，不进写面）', async (t) => {
  const root = freshVault('create-outside')
  const outside = fs.mkdtempSync(path.join(TMP, 'outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.writeFileSync(path.join(outside, 'x.md'), '# OUTSIDE\n')
  fs.symlinkSync('ghost.md', path.join(root, 'notes', 'dangling.md'))
  fs.symlinkSync(path.join(outside, 'x.md'), path.join(root, 'notes', 'out.md'))
  // dangling（in-root 真缺失）→ 围栏放行至写面，类型门显式拒 not-a-file
  const dangling = await createNote(root, 'notes/dangling.md', 'pwn')
  assert.deepEqual(dangling, { ok: false, reason: 'not-a-file' }, 'dangling 最终分量 symlink 显式拒')
  assert.ok(fs.lstatSync(path.join(root, 'notes', 'dangling.md')).isSymbolicLink(), 'symlink 不被顶替')
  assert.equal(fs.existsSync(path.join(root, 'notes', 'ghost.md')), false, 'dangling 不凭空造目标')
  // root 外指（真实节点越 root）→ realpath 围栏先行拒（更早更严，不进写面）
  await assert.rejects(() => createNote(root, 'notes/out.md', 'pwn'), (err) => err?.code === 'bad_request', 'root 外指=围栏拒')
  assert.ok(fs.lstatSync(path.join(root, 'notes', 'out.md')).isSymbolicLink(), 'symlink 不被顶替')
  assert.equal(fs.readFileSync(path.join(outside, 'x.md'), 'utf8'), '# OUTSIDE\n', 'root 外目标零写穿')
})

test('createNote 目标已存在（真文件/真目录）→ target-exists 不变（symlink 门不改既有覆盖保护）', async () => {
  const root = freshVault('create-real')
  fs.writeFileSync(path.join(root, 'notes', 'x.md'), '原始')
  fs.mkdirSync(path.join(root, 'notes', 'd'))
  assert.deepEqual(await createNote(root, 'notes/x.md', 'pwn'), { ok: false, reason: 'target-exists' })
  assert.deepEqual(await createNote(root, 'notes/d', 'pwn'), { ok: false, reason: 'target-exists' })
  assert.equal(fs.readFileSync(path.join(root, 'notes', 'x.md'), 'utf8'), '原始')
})

test('中间段目录别名写正例不变（OW-INV-7⑨：a→sub/b，createNote 落真实节点——门只管最终分量）', async () => {
  const root = freshVault('mid-alias')
  fs.symlinkSync(path.join('sub', 'b'), path.join(root, 'a')) // a → sub/b（中间段目录别名）
  const created = await createNote(root, 'a/new.md', '# NEW\n')
  assert.equal(created.ok, true)
  assert.equal(fs.readFileSync(path.join(root, 'sub', 'b', 'new.md'), 'utf8'), '# NEW\n', '解引用落真实节点零语义漂移')
  assert.equal(fs.readFileSync(path.join(root, 'a', 'new.md'), 'utf8'), '# NEW\n', '别名视图同物')
})
