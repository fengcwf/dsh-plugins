// share-actions — 树右键「分享」编排纯函数（C3 卡）：目标态置/清 + 目录/文件同路载荷。
// 组件容器/展示分离（frontend-ui-engineering）：编排落本模块，App.vue 只做「置目标 + 切面板」搬运。
// 本文件补齐 C3 前的覆盖空洞（此前 share-actions.js 全树零测试引用——真浏览器行为测试只锁运行缝）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createShareActions, shareFormFor, sharePayloadFor } from '../web/src/lib/share-actions.js'
import { buildCreatePayload } from '../web/src/lib/share-view.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// ── 目录/文件同路：形态不分流（后端据 lstat 自判 targetType，前端零分支）──────────────
test('C3 shareFormFor：目录与笔记同形（仅 target 不同，其余默认全同）', () => {
  const dir = shareFormFor('notes')
  const file = shareFormFor('notes/a.md')
  assert.deepEqual(dir, { target: 'notes', role: 'read', passwordMode: 'none', password: '', ttlDays: 7, oneShot: false })
  assert.deepEqual({ ...dir, target: '' }, { ...file, target: '' }, '目录与笔记除 target 外逐字段同形')
  assert.deepEqual(shareFormFor(''), { ...dir, target: '' }, '空路径=空 target 形（不炸）')
})

test('C3 sharePayloadFor：目录路径出载荷且 target 原样（目录分享=既有链路，零第二套）', () => {
  assert.deepEqual(sharePayloadFor('notes'), { target: 'notes', role: 'read', oneShot: false, ttlDays: 7 })
  assert.deepEqual(sharePayloadFor('notes/sub'), { target: 'notes/sub', role: 'read', oneShot: false, ttlDays: 7 }, '子目录同形')
  assert.deepEqual(sharePayloadFor('notes/a.md'), { target: 'notes/a.md', role: 'read', oneShot: false, ttlDays: 7 }, '笔记同形（零分流）')
  assert.equal(sharePayloadFor(''), null, '空路径不出载荷（buildCreatePayload 复核）')
  assert.equal(sharePayloadFor(undefined), null, '非法形不出载荷')
  // 复用既有载荷复核：本模块不复制任何密码/角色不变量
  assert.deepEqual(sharePayloadFor('notes'), buildCreatePayload(shareFormFor('notes')), '与 buildCreatePayload 同源')
})

// ── 目标态置/清（容器薄壳）──────────────────────────────────────────────────────
test('C3 createShareActions：置目标带 kind + 切面板回调 + 目标原样可读', () => {
  const notices = []
  let went = 0
  const { shareTarget, onShareFrom, onShareClear } = createShareActions({
    onNotice: (t) => notices.push(t), goSharePanel: () => { went += 1 },
  })
  assert.equal(shareTarget.value, null, '初态无目标')
  assert.equal(went, 0, '初态零切面板')

  onShareFrom({ key: 'notes', type: 'dir' })
  assert.deepEqual(shareTarget.value, { path: 'notes', kind: 'dir' }, '目录目标：path=节点路径、kind=dir')
  assert.equal(went, 1, '置目标即切分享面板（弹层由 SharePanel 开）')

  onShareFrom({ key: 'notes/a.md', type: 'file' })
  assert.deepEqual(shareTarget.value, { path: 'notes/a.md', kind: 'file' }, '笔记目标同路（kind 只作展示，不据其分流）')
  assert.equal(went, 2)

  onShareClear()
  assert.equal(shareTarget.value, null, '清目标=null（面板回手动新建形态）')
})

test('C3 createShareActions：空/非法目标=留痕提示且不置目标不改面板', () => {
  const notices = []
  let went = 0
  const { shareTarget, onShareFrom } = createShareActions({ onNotice: (t) => notices.push(t), goSharePanel: () => { went += 1 } })
  for (const bad of [null, undefined, {}, { key: '' }, { key: 42 }, { type: 'dir' }]) {
    onShareFrom(bad)
  }
  assert.equal(shareTarget.value, null, '非法目标零置入')
  assert.equal(went, 0, '非法目标不切面板（不出现空弹层）')
  assert.equal(notices.length, 6, '每个非法形各留痕一次（可解释）')
  assert.match(notices[0], /分享目标为空/, '留痕文案可解释')
})

test('C3 createShareActions：kind 缺省=file（服务端口径兜底，不因缺 type 崩）', () => {
  const { shareTarget, onShareFrom } = createShareActions({})
  onShareFrom({ key: 'notes' })
  assert.deepEqual(shareTarget.value, { path: 'notes', kind: 'file' }, '缺 type → kind=file（安全默认）')
})

// ── 源码形锁：清目标只在「切离」分享面板时发生（C3 三段根因之一，防回归重犯）──────────
test('C3 源码锁：App.vue 清目标带切离守卫（panel !== "share"）——同 tick 置目标不被抹掉', () => {
  const app = fs.readFileSync(path.join(HERE, '..', 'web', 'src', 'App.vue'), 'utf8')
  assert.match(app, /if \(panel !== 'share'\) onShareClear\(\)/, '切离才清（无条件清=弹层空目标回归）')
  assert.match(app, /@share="onShareFrom"/, 'NoteTree 的 share 事件接上编排')
  assert.match(app, /:share-request="shareTarget"/, '目标经 prop 下达到面板')
})

test('C3 源码锁：SharePanel 懒挂载，故 shareRequest 观察器必须 immediate（否则永不触发）', () => {
  const panel = fs.readFileSync(path.join(HERE, '..', 'web', 'src', 'components', 'SharePanel.vue'), 'utf8')
  assert.match(panel, /\(\) => props\.shareRequest,[\s\S]{0,200}?\{ immediate: true \}/, 'shareRequest 观察器 immediate:true')
  assert.match(panel, /consumedRequest/, '同请求只消费一次（切面板回来不重开弹层）')
})

test('C3 源码锁：ShareCreateDialog 表单重置观察器 immediate（同批 props 落位不落后）', () => {
  const dlg = fs.readFileSync(path.join(HERE, '..', 'web', 'src', 'components', 'ShareCreateDialog.vue'), 'utf8')
  assert.match(dlg, /\{ immediate: true, flush: 'sync' \}/, 'visible 观察器 immediate + sync flush')
  assert.match(dlg, /target: props\.defaultTarget/, '重置时取 defaultTarget（单一来源）')
})
