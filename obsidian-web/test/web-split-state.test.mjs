// 分屏状态持久化锁（T13 / delta-spec §3：分屏编辑与阅读视图状态独立持久化 localStorage）
//   ② localStorage 往返（save→load 逐字段同）+ 两把 key 独立互不覆盖 + 敌意值归一
//      （splitRatio 出界夹取、非布尔回默认、未知 panel 回 read、坏 JSON 回默认）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadEditState,
  saveEditState,
  loadReadState,
  saveReadState,
  normalizeEditState,
  normalizeReadState,
  EDIT_STATE_KEY,
  READ_STATE_KEY,
} from '../web/src/lib/view-state.js'

/** 内存 storage（真往返：同 getItem/setItem 语义，零 mock 框架） */
function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  }
}

test('分屏状态 localStorage 往返：save→load 逐字段同（previewVisible/splitRatio）', () => {
  const st = memoryStorage()
  saveEditState(st, { previewVisible: false, splitRatio: 0.31 })
  assert.deepEqual(loadEditState(st), { previewVisible: false, splitRatio: 0.31 })
  saveEditState(st, { previewVisible: true, splitRatio: 0.8 })
  assert.deepEqual(loadEditState(st), { previewVisible: true, splitRatio: 0.8 })
})

test('阅读视图状态独立持久化：两把 key 独立互不覆盖（ob:edit-state ≠ ob:read-state）', () => {
  const st = memoryStorage()
  assert.notEqual(EDIT_STATE_KEY, READ_STATE_KEY)
  saveEditState(st, { previewVisible: true, splitRatio: 0.5 })
  saveReadState(st, { panel: 'search' })
  assert.deepEqual(loadEditState(st), { previewVisible: true, splitRatio: 0.5 }, '读态写入不得动编辑态')
  assert.deepEqual(loadReadState(st), { panel: 'search' })
  const keys = Object.keys(st.dump()).sort()
  assert.deepEqual(keys, [READ_STATE_KEY, EDIT_STATE_KEY].sort(), '恰两把 key')
})

test('敌意值归一：splitRatio 出界夹取 [0.2,0.8]、非布尔/NaN 回默认、坏 JSON 回默认', () => {
  assert.deepEqual(normalizeEditState({ previewVisible: true, splitRatio: 9.9 }), { previewVisible: true, splitRatio: 0.8 })
  assert.deepEqual(normalizeEditState({ previewVisible: 'yes', splitRatio: -1 }), { previewVisible: true, splitRatio: 0.2 })
  assert.deepEqual(normalizeEditState({ previewVisible: true, splitRatio: Number.NaN }), { previewVisible: true, splitRatio: 0.5 })
  assert.deepEqual(normalizeEditState(null), { previewVisible: true, splitRatio: 0.5 }, '非法输入回默认')
  const st = memoryStorage()
  st.setItem(EDIT_STATE_KEY, '{{{ 不是 JSON')
  assert.deepEqual(loadEditState(st), { previewVisible: true, splitRatio: 0.5 }, '坏 JSON 回默认不炸')
})

test('阅读态归一：未知 panel 回 read、坏 JSON 回默认', () => {
  assert.deepEqual(normalizeReadState({ panel: 'settings' }), { panel: 'settings' })
  assert.deepEqual(normalizeReadState({ panel: 'nonsense' }), { panel: 'read' })
  assert.deepEqual(normalizeReadState(undefined), { panel: 'read' })
  const st = memoryStorage()
  st.setItem(READ_STATE_KEY, 'null')
  assert.deepEqual(loadReadState(st), { panel: 'read' })
})
