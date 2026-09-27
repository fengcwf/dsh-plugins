// 前端编辑面纯函数单测（T4）：保存会话状态机 + 保存防抖 + diff 对比 + 视图状态持久化。
// 组件容器/展示分离：.vue 只做展示，逻辑全落纯模块（web/src/lib），与 T2 web-lib 同纪律。
// 真验行为零 mock：防抖用真实定时器测真实时序；storage 用注入的真对象（纯函数契约参数）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditorSession, reduceSession, lockParamsFor, createDebouncer, SAVE_DEBOUNCE_MS } from '../web/src/lib/save-client.js'
import { diffLines } from '../web/src/lib/diff.js'
import { loadEditState, saveEditState, loadReadState, saveReadState, EDIT_STATE_KEY, READ_STATE_KEY } from '../web/src/lib/view-state.js'

const NOTE = { path: 'notes/a.md', content: '第一版', mtime: 1000, etag: '4-1000' }

// ── 保存防抖（delta-spec §3：保存防抖 ≥500ms）────────────────────────────────
test('保存防抖 ≥500ms（delta-spec §3 机械门）', () => {
  assert.ok(SAVE_DEBOUNCE_MS >= 500, `SAVE_DEBOUNCE_MS=${SAVE_DEBOUNCE_MS} 低于 500ms 下限`)
})

test('createDebouncer：连击合流一次、flush 立即执行、cancel 吞掉（真实定时器）', async () => {
  let calls = []
  const d = createDebouncer((v) => calls.push(v), 40)
  d.schedule('a')
  d.schedule('b')
  d.schedule('c')
  assert.deepEqual(calls, [], '窗口内不得执行')
  await new Promise((r) => setTimeout(r, 80))
  assert.deepEqual(calls, ['c'], '只执行最后一次')
  d.schedule('d')
  d.flush()
  assert.deepEqual(calls, ['c', 'd'], 'flush 立即执行')
  d.schedule('e')
  d.cancel()
  await new Promise((r) => setTimeout(r, 80))
  assert.deepEqual(calls, ['c', 'd'], 'cancel 吞掉')
})

// ── 保存会话状态机 ───────────────────────────────────────────────────────────
test('会话状态机：load→edit(dirty)→save_start(saving)→save_ok(clean，留 undo 材料)', () => {
  let s = createEditorSession(NOTE)
  assert.equal(s.status, 'clean')
  assert.equal(s.draft, '第一版')
  s = reduceSession(s, { type: 'edit', content: '第二版' })
  assert.equal(s.status, 'dirty')
  assert.equal(s.draft, '第二版')
  s = reduceSession(s, { type: 'save_start' })
  assert.equal(s.status, 'saving')
  const result = {
    ok: true, path: 'notes/a.md', mtime: 2000, etag: '4-2000', size: 4,
    diffUndo: { before: { content: '第一版', mtime: 1000, etag: '4-1000', size: 4 }, after: { content: '第二版', mtime: 2000, etag: '4-2000', size: 4 } },
  }
  s = reduceSession(s, { type: 'save_ok', result })
  assert.equal(s.status, 'clean')
  assert.equal(s.mtime, 2000)
  assert.equal(s.etag, '4-2000')
  assert.equal(s.diffUndo.before.content, '第一版', '保存后保留保存前快照（内存级 undo）')
})

test('冲突三选：conflict→overwrite 锁参数取 before.mtime；reload 回滚草稿；compare 出双快照', () => {
  let s = createEditorSession(NOTE)
  s = reduceSession(s, { type: 'edit', content: '我方内容' })
  const conflictResult = {
    conflict: true, path: 'notes/a.md',
    diffUndo: { before: { content: '他方内容', mtime: 3000, etag: '5-3000', size: 5 }, incoming: { content: '我方内容' } },
  }
  s = reduceSession(s, { type: 'conflict', result: conflictResult })
  assert.equal(s.status, 'conflict')
  // 覆盖：以盘上现 mtime 为新乐观锁，草稿保持我方内容
  const overwrite = reduceSession(s, { type: 'choose', choice: 'overwrite' })
  assert.deepEqual(lockParamsFor(overwrite), { expectedMtime: 3000 }, '覆盖=用 before.mtime 重新上锁')
  assert.equal(overwrite.draft, '我方内容')
  assert.equal(overwrite.status, 'saving')
  // 重载：草稿回盘上内容，状态回 clean（与盘一致）
  const reload = reduceSession(s, { type: 'choose', choice: 'reload' })
  assert.equal(reload.draft, '他方内容')
  assert.equal(reload.status, 'clean')
  assert.equal(reload.mtime, 3000)
  assert.equal(reload.etag, '5-3000')
  // 对比：双快照俱在，可出 diff
  const compare = reduceSession(s, { type: 'choose', choice: 'compare' })
  assert.equal(compare.comparing, true)
  assert.equal(compare.conflict.diffUndo.before.content, '他方内容')
  assert.equal(compare.conflict.diffUndo.incoming.content, '我方内容')
})

test('undo：保存成功后一键回到保存前内容（内存级 undo，往返语义）', () => {
  let s = createEditorSession(NOTE)
  s = reduceSession(s, { type: 'edit', content: '改坏了' })
  s = reduceSession(s, {
    type: 'save_ok',
    result: {
      ok: true, path: 'notes/a.md', mtime: 2000, etag: '4-2000', size: 4,
      diffUndo: { before: { content: '第一版', mtime: 1000, etag: '4-1000', size: 4 }, after: { content: '改坏了', mtime: 2000, etag: '4-2000', size: 4 } },
    },
  })
  s = reduceSession(s, { type: 'undo' })
  assert.equal(s.draft, '第一版', 'undo=回到保存前快照')
  assert.equal(s.status, 'dirty', 'undo 后草稿与盘不同 → dirty')
  assert.deepEqual(lockParamsFor(s), { expectedMtime: 2000 }, 'undo 落盘用当前 mtime 上锁')
})

test('会话状态机：save_error 回 dirty 留错误信息；未保存草稿不丢', () => {
  let s = createEditorSession(NOTE)
  s = reduceSession(s, { type: 'edit', content: '草稿' })
  s = reduceSession(s, { type: 'save_start' })
  s = reduceSession(s, { type: 'save_error', message: '网络中断' })
  assert.equal(s.status, 'dirty')
  assert.equal(s.error, '网络中断')
  assert.equal(s.draft, '草稿')
})

// ── diff 对比（对比三选展示面）────────────────────────────────────────────────
test('diffLines：行级 LCS 对比（same/del/add），可渲染对比视图', () => {
  assert.deepEqual(diffLines('a\nb\nc', 'a\nx\nc'), [
    { type: 'same', text: 'a' },
    { type: 'del', text: 'b' },
    { type: 'add', text: 'x' },
    { type: 'same', text: 'c' },
  ])
  assert.deepEqual(diffLines('', '新'), [{ type: 'add', text: '新' }])
  assert.deepEqual(diffLines('同', '同'), [{ type: 'same', text: '同' }])
})

// ── 视图状态持久化（分屏编辑与阅读视图独立持久化，delta-spec §3）──────────────
test('视图状态持久化：编辑/阅读两把独立 key，互不覆盖；坏 JSON 容错回默认', () => {
  const storage = new Map()
  const fake = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) }
  saveEditState(fake, { previewVisible: true, splitRatio: 0.5 })
  saveReadState(fake, { panel: 'search' })
  assert.equal(storage.has(EDIT_STATE_KEY), true)
  assert.equal(storage.has(READ_STATE_KEY), true)
  assert.notEqual(EDIT_STATE_KEY, READ_STATE_KEY, '分屏编辑与阅读视图状态独立持久化')
  assert.deepEqual(loadEditState(fake), { previewVisible: true, splitRatio: 0.5 })
  assert.deepEqual(loadReadState(fake), { panel: 'search' })
  storage.set(EDIT_STATE_KEY, '{坏 JSON')
  assert.deepEqual(loadEditState(fake, { previewVisible: false, splitRatio: 0.4 }), { previewVisible: false, splitRatio: 0.4 }, '坏 JSON 回默认不炸')
})
