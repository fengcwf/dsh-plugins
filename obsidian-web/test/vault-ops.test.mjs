// vault-ops 读侧契约测试（T2）：树列表 + 读文件 + 反链扫描（占位级，T11 索引化后替换）。
// 形状锁定 = 前端 wire 契约（API 与共用同一形）。真验行为：真 fixture 文件系统，零 mock。
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { listTree, readNote, scanBacklinks } from '../lib/vault-ops.js'

const VAULT = fileURLToPath(new URL('./fixtures/vault', import.meta.url))

test('listTree 形状锁定：dir 带 children、file 不带；path=父 path/name；目录优先字典序', () => {
  const tree = listTree(VAULT)
  assert.deepEqual(Object.keys(tree).sort(), ['nodes', 'root'], 'listTree 返回形恰 {root, nodes}')
  assert.equal(tree.root, path.resolve(VAULT))
  const top = tree.nodes
  // 目录优先：notes/、sub/ 在前，INDEX.md 最后
  assert.deepEqual(top.map((n) => n.name), ['notes', 'sub', 'INDEX.md'])
  for (const node of top) {
    assert.deepEqual(Object.keys(node).sort(), node.type === 'dir' ? ['children', 'name', 'path', 'type'] : ['name', 'path', 'type'], `节点形状锁定：${node.name}`)
  }
  const notes = top.find((n) => n.name === 'notes')
  assert.equal(notes.path, 'notes')
  assert.equal(notes.type, 'dir')
  assert.deepEqual(notes.children.map((n) => n.name), ['a.md', 'b.md', 'c.md'])
  assert.equal(notes.children[0].path, 'notes/a.md')
  assert.equal(notes.children[0].type, 'file')
})

test('readNote 形状锁定：{path, content, mtime, etag, size}；etag=size-mtime', () => {
  const note = readNote(VAULT, 'notes/a.md')
  assert.deepEqual(Object.keys(note).sort(), ['content', 'etag', 'mtime', 'path', 'size'])
  assert.equal(note.path, 'notes/a.md')
  assert.ok(note.content.includes('# Note A'))
  assert.equal(typeof note.mtime, 'number')
  assert.equal(note.size, Buffer.byteLength(note.content, 'utf8'))
  assert.equal(note.etag, `${note.size}-${note.mtime}`)
})

test('readNote 路径围栏雏形：../ 穿越、绝对路径、NUL 一律 bad_request（OW-INV-7 前置）', () => {
  for (const bad of ['../outside.md', '/etc/passwd', 'notes/../../x.md', 'a\0b.md']) {
    assert.throws(() => readNote(VAULT, bad), (err) => err.code === 'bad_request', `必须拒：${bad}`)
  }
})

test('readNote 缺文件 → not_found', () => {
  assert.throws(() => readNote(VAULT, 'notes/nope.md'), (err) => err.code === 'not_found')
})

test('scanBacklinks 形状锁定：{path, backlinks:[{path,line,text}]}，按 path/line 升序', () => {
  const r = scanBacklinks(VAULT, 'notes/a.md')
  assert.deepEqual(Object.keys(r).sort(), ['backlinks', 'path'])
  assert.equal(r.path, 'notes/a.md')
  for (const item of r.backlinks) assert.deepEqual(Object.keys(item).sort(), ['line', 'path', 'text'])
  assert.deepEqual(r.backlinks.map((b) => [b.path, b.line]), [
    ['INDEX.md', 3],       // [[notes/a]]
    ['notes/b.md', 3],     // [[a]] + [ref](a.md)（同行一条）
    ['sub/deep.md', 3],    // [[notes/a]] + [direct](../notes/a.md)（同行一条）
  ])
  assert.equal(r.backlinks[1].text, 'Links back to [[a]] and [ref](a.md).')
})

test('scanBacklinks 解析语义：wikilink 别名/锚点剥离、basename 匹配、md 相对链接', () => {
  // notes/b.md 的反链：INDEX.md（[[b]]）、notes/a.md（[[b|Bee]]）、notes/c.md（[[b]]）
  const r = scanBacklinks(VAULT, 'notes/b.md')
  assert.deepEqual(r.backlinks.map((b) => [b.path, b.line]), [
    ['INDEX.md', 4],     // [[b]]（第 4 行）
    ['notes/a.md', 8],   // [[b|Bee]]（frontmatter 之后第 8 行）
    ['notes/c.md', 4],   // [[b]]（第 4 行）
  ])
  // 无反链 → 空数组（合法形）
  const none = scanBacklinks(VAULT, 'notes/c.md')
  assert.deepEqual(none, { path: 'notes/c.md', backlinks: [] })
  // 目标自身不自指：notes/a.md 不会被自身反向命中
  assert.ok(!scanBacklinks(VAULT, 'notes/a.md').backlinks.some((b) => b.path === 'notes/a.md'))
})

test('scanBacklinks 路径围栏同 readNote', () => {
  assert.throws(() => scanBacklinks(VAULT, '../x.md'), (err) => err.code === 'bad_request')
})

test('readNote 对非 md 文本文件同样可读（下载/预览共用读面）', () => {
  fs.writeFileSync(path.join(VAULT, 'notes', 'readme.txt'), 'plain text', 'utf8')
  try {
    const r = readNote(VAULT, 'notes/readme.txt')
    assert.equal(r.content, 'plain text')
  } finally {
    fs.rmSync(path.join(VAULT, 'notes', 'readme.txt'))
  }
})
