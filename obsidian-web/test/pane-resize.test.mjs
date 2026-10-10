// pane-resize 纯函数测试（C1 分隔条，国标 GB/T 37835-2019 六要素的可测核心）
import test from 'node:test'
import assert from 'node:assert/strict'
import { resizePair, keyStep, canDrag, inHitZone } from '../web/src/lib/pane-resize.js'

test('守恒：相邻两栏此消彼长，总量不变', () => {
  const r = resizePair({ a: 250, b: 250 }, 30)
  assert.equal(r.a + r.b, 500)
  assert.equal(r.a, 280)
})

test('min 钳位：目标低于 min 时抬到 min（差值由 B 承担）', () => {
  const r = resizePair({ a: 250, b: 250 }, -100, { min: 200 })
  assert.equal(r.a, 200)
  assert.equal(r.b, 300)
})

test('clamp 下限：A 不会低于 min（差额留给 B）', () => {
  const r = resizePair({ a: 220, b: 300 }, -100, { min: 200 })
  assert.equal(r.a, 200)
  assert.ok(r.b >= 200)
})

test('clamp 上限：A 不会高于 max', () => {
  const r = resizePair({ a: 300, b: 900 }, 1000, { max: 640, min: 200 })
  assert.equal(r.a, 640)
})

test('守恒饱和：B 已在下限时返回 null（无可让空间）', () => {
  const r = resizePair({ a: 300, b: 200 }, 50, { min: 200 })
  assert.equal(r, null)
})

test('delta=0 / 非法输入：不产生新宽度', () => {
  assert.deepEqual(resizePair({ a: 100, b: 200 }, 0), { a: 100, b: 200 })
  assert.equal(resizePair({ a: 100, b: 200 }, NaN), null)
  assert.equal(resizePair(null, 10), null)
})

test('键盘步进：Shift=加速；Home/End 用极值档', () => {
  assert.equal(keyStep('ArrowLeft'), -16)
  assert.equal(keyStep('ArrowRight'), 16)
  assert.equal(keyStep('ArrowLeft', { shift: true }), -64)
  assert.equal(keyStep('End'), 16)
  assert.equal(keyStep('a'), 0)
})

test('canDrag：鼠标只认左键；触摸不认按钮', () => {
  assert.equal(canDrag({ pointerType: 'mouse', button: 0 }), true)
  assert.equal(canDrag({ pointerType: 'mouse', button: 2 }), false)
  assert.equal(canDrag({ pointerType: 'touch', button: 0 }), true)
  assert.equal(canDrag(null), false)
})

test('命中区 ≥24px（国标）：中线 ±12px 内即命中', () => {
  const rect = { left: 100, width: 6 }
  assert.equal(inHitZone(103, rect), true)   // 距中线 0px
  assert.equal(inHitZone(115, rect), true)   // 距中线 12px（命中区边缘 24px）
  assert.equal(inHitZone(118, rect), false)  // 超出 24px 全宽
  assert.equal(inHitZone(0, null), false)
})
