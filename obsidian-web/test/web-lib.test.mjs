// 前端纯函数单测（T2 验收③）：树选择 + TOC 提取，均为 web/src/lib 下的框架无关纯模块。
// 组件容器/展示分离：.vue 只做展示，逻辑全落纯函数（前端零第二套 markdown 实现，ARC-1）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTreeModel, ancestorsOf, selectNode, resolveNotePath } from '../web/src/lib/tree.js'
import { extractToc, buildTocTree } from '../web/src/lib/toc.js'

const WIRE_NODES = [
  { name: 'notes', path: 'notes', type: 'dir', children: [{ name: 'a.md', path: 'notes/a.md', type: 'file' }] },
  { name: 'INDEX.md', path: 'INDEX.md', type: 'file' },
]

// ── 树选择纯函数 ────────────────────────────────────────────────────────────
test('buildTreeModel：wire 节点 → 组件模型（key=path、label=name、dir 才有 children）', () => {
  const model = buildTreeModel(WIRE_NODES)
  assert.deepEqual(model[0], {
    key: 'notes',
    label: 'notes',
    type: 'dir',
    children: [{ key: 'notes/a.md', label: 'a.md', type: 'file' }],
  })
  assert.deepEqual(model[1], { key: 'INDEX.md', label: 'INDEX.md', type: 'file' }, 'file 无 children 键')
})

test('ancestorsOf：逐级祖先路径（供展开定位）', () => {
  assert.deepEqual(ancestorsOf('notes/sub/a.md'), ['notes', 'notes/sub'])
  assert.deepEqual(ancestorsOf('a.md'), [])
})

test('selectNode：选文件=选中+祖先自动展开（保留既有展开）', () => {
  const s1 = selectNode({ selected: null, expanded: [] }, { key: 'notes/a.md', type: 'file' })
  assert.deepEqual(s1, { selected: 'notes/a.md', expanded: ['notes'] })
  const s2 = selectNode({ selected: 'notes/a.md', expanded: ['keep'] }, { key: 'notes/sub/a.md', type: 'file' })
  assert.deepEqual(s2, { selected: 'notes/sub/a.md', expanded: ['keep', 'notes', 'notes/sub'] })
})

test('selectNode：选目录=纯展开切换，不动 selected', () => {
  let state = { selected: 'notes/a.md', expanded: [] }
  state = selectNode(state, { key: 'notes', type: 'dir' })
  assert.deepEqual(state, { selected: 'notes/a.md', expanded: ['notes'] })
  state = selectNode(state, { key: 'notes', type: 'dir' })
  assert.deepEqual(state, { selected: 'notes/a.md', expanded: [] }, '再点目录=收起')
})

// ── wikilink 目标解析（阅读面点击跳转用）─────────────────────────────────────
test('resolveNotePath：显式路径/.md 可选/basename 兜底/锚点别名剥离/找不到返 null', () => {
  const files = ['INDEX.md', 'notes/a.md', 'notes/b.md']
  assert.equal(resolveNotePath(files, 'notes/a'), 'notes/a.md', '省略 .md 可解析')
  assert.equal(resolveNotePath(files, 'notes/a.md'), 'notes/a.md', '显式路径直配')
  assert.equal(resolveNotePath(files, 'b'), 'notes/b.md', 'basename 匹配（Obsidian 语义）')
  assert.equal(resolveNotePath(files, 'notes/a#Head'), 'notes/a.md', '锚点剥离')
  assert.equal(resolveNotePath(files, 'notes/a|Alias'), 'notes/a.md', '别名剥离')
  assert.equal(resolveNotePath(files, 'nope'), null, '找不到返 null')
  assert.equal(resolveNotePath(files, ''), null, '空目标返 null')
  assert.equal(resolveNotePath(null, 'a'), null, '非法 filePaths 不炸')
})

// ── TOC 提取纯函数 ──────────────────────────────────────────────────────────
test('extractToc：render 结果 → TOC 面板模型（过滤空文本/夹取 level/去重 id/算 indent）', () => {
  const rendered = {
    html: '<h1 id="a">A</h1>',
    toc: [
      { id: 'a', text: 'A', level: 1 },
      { id: 'skipped', text: '   ', level: 2 },   // 空文本滤除
      { id: 'b', text: 'B', level: 9 },            // level 夹到 6
      { id: 'a', text: 'A 重复', level: 3 },        // id 去重（保留先者）
    ],
  }
  const items = extractToc(rendered)
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), ['id', 'indent', 'level', 'text'])
  assert.deepEqual(items, [
    { id: 'a', text: 'A', level: 1, indent: 0 },
    { id: 'b', text: 'B', level: 6, indent: 5 },
  ])
})

test('extractToc：非法形输入不炸（空渲染结果/缺字段）', () => {
  assert.deepEqual(extractToc(null), [])
  assert.deepEqual(extractToc({}), [])
  assert.deepEqual(extractToc({ html: '', toc: [] }), [])
})

test('buildTocTree：扁平 → 嵌套（children 逐级挂载）', () => {
  const tree = buildTocTree([
    { id: 'a', text: 'A', level: 1, indent: 0 },
    { id: 'b', text: 'B', level: 2, indent: 1 },
    { id: 'c', text: 'C', level: 2, indent: 1 },
    { id: 'd', text: 'D', level: 1, indent: 0 },
  ])
  assert.deepEqual(tree, [
    { id: 'a', text: 'A', level: 1, indent: 0, children: [
      { id: 'b', text: 'B', level: 2, indent: 1, children: [] },
      { id: 'c', text: 'C', level: 2, indent: 1, children: [] },
    ] },
    { id: 'd', text: 'D', level: 1, indent: 0, children: [] },
  ])
})
