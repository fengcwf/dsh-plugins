// createNote — 文件夹分享（写）「新建」原语（OW-INV-2 四操作之一；永不静默覆盖=OW-INV-5 语义在创建面）
// 复用面：vault-ops 单一写原语来源（fs-safe ARC-4 语义内建），guest 面只调不重造。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNote } from '../lib/vault-ops.js'

const TMP = fileURLToPath(new URL('./.tmp-create', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

function freshVault(tag) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  return root
}

test('createNote 新建文件：内容逐字节同 + ok 形 {ok,path,mtime,etag,size}', async () => {
  const root = freshVault('ok')
  fs.mkdirSync(path.join(root, 'notes'))
  const result = await createNote(root, 'notes/new.md', '# 你好\n正文')
  assert.equal(result.ok, true)
  assert.equal(result.path, 'notes/new.md')
  assert.equal(typeof result.mtime, 'number')
  assert.equal(result.size, Buffer.byteLength('# 你好\n正文', 'utf8'))
  assert.equal(fs.readFileSync(path.join(root, 'notes/new.md'), 'utf8'), '# 你好\n正文')
  assert.equal(result.etag, `${result.size}-${result.mtime}`, 'etag 形与 readNote 同口径')
})

test('createNote 空内容新建合法（缺省 content=空串）', async () => {
  const root = freshVault('empty')
  fs.mkdirSync(path.join(root, 'd'))
  const result = await createNote(root, 'd/blank.md')
  assert.equal(result.ok, true)
  assert.equal(fs.readFileSync(path.join(root, 'd/blank.md'), 'utf8'), '')
})

test('目标已存在（文件）→ {ok:false,reason:target-exists} 且内容零改动（永不静默覆盖）', async () => {
  const root = freshVault('exists')
  fs.mkdirSync(path.join(root, 'd'))
  fs.writeFileSync(path.join(root, 'd/x.md'), '原始内容')
  const result = await createNote(root, 'd/x.md', '覆盖尝试')
  assert.deepEqual(result, { ok: false, reason: 'target-exists' })
  assert.equal(fs.readFileSync(path.join(root, 'd/x.md'), 'utf8'), '原始内容')
})

test('目标已存在（目录）→ target-exists（不落文件）', async () => {
  const root = freshVault('dir')
  fs.mkdirSync(path.join(root, 'd/sub'), { recursive: true })
  const result = await createNote(root, 'd/sub', 'x')
  assert.deepEqual(result, { ok: false, reason: 'target-exists' })
  assert.ok(fs.statSync(path.join(root, 'd/sub')).isDirectory())
})

test('父目录缺失 → parent-missing（域结果不抛、零残渣）', async () => {
  const root = freshVault('parent')
  const result = await createNote(root, 'no-such-dir/new.md', 'x')
  assert.deepEqual(result, { ok: false, reason: 'parent-missing' })
  assert.equal(fs.existsSync(path.join(root, 'no-such-dir')), false)
})

test('围栏非法（穿越/绝对/NUL）throw bad_request（词法围栏单一来源复用）', async () => {
  const root = freshVault('fence')
  for (const bad of ['../x.md', 'a/../../x.md', '/etc/x.md', 'a\0b.md']) {
    await assert.rejects(() => createNote(root, bad, 'x'), (err) => err.code === 'bad_request', `应拒：${JSON.stringify(bad)}`)
  }
})

test('非字符串 content throw bad_request（形参围栏先行）', async () => {
  const root = freshVault('content')
  await assert.rejects(() => createNote(root, 'x.md', 123), (err) => err.code === 'bad_request')
  await assert.rejects(() => createNote(root, 'x.md', null), (err) => err.code === 'bad_request')
})
