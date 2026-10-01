// takeover-model.test.mjs — Task 16：接管三态 + 隐私提示纯模块单测（web/ 树内）。
// 覆盖验收：三态映射 Config.takeOver 且默认 auto（K-10）/ 隐私文案含 credential-ref 与不出网语义（US-5、K-4）/ 强制不高亮。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Config } from '../../lib/index.js'
import {
  PRIVACY_NOTICE,
  TAKE_OVER_DEFAULT,
  TAKE_OVER_MODES,
  TAKE_OVER_OPTIONS,
  isDefaultTakeOver,
  isTakeOverActive,
  normalizeTakeOver,
} from '../src/lib/takeover-model.js'

const parsedDefault = Config.parse({})

test('三态映射 Config.takeOver：词汇同源同序，默认值 auto', () => {
  assert.deepEqual(TAKE_OVER_MODES, ['auto', 'force', 'off'])
  assert.equal(TAKE_OVER_DEFAULT, 'auto')
  assert.equal(parsedDefault.takeOver, TAKE_OVER_DEFAULT)
  assert.deepEqual(TAKE_OVER_OPTIONS.map((o) => o.value), TAKE_OVER_MODES)
})

test('normalizeTakeOver：非法值回落 auto（fail-open）', () => {
  assert.equal(normalizeTakeOver('force'), 'force')
  assert.equal(normalizeTakeOver('off'), 'off')
  assert.equal(normalizeTakeOver('take-over'), 'auto')
  assert.equal(normalizeTakeOver(undefined), 'auto')
  assert.equal(normalizeTakeOver(3), 'auto')
})

test('强制接管不高亮：默认态仅 auto 激活，force 只在显式选择时激活（K-10）', () => {
  assert.equal(isTakeOverActive(TAKE_OVER_DEFAULT, 'auto'), true)
  assert.equal(isTakeOverActive(TAKE_OVER_DEFAULT, 'force'), false)
  assert.equal(isTakeOverActive(TAKE_OVER_DEFAULT, 'off'), false)
  assert.equal(isTakeOverActive('force', 'force'), true)
  assert.equal(isDefaultTakeOver('force'), false)
  assert.equal(isDefaultTakeOver('auto'), true)
})

test('隐私提示文案：含 credential-ref 与不出网语义（US-5 / INV-4 / K-4）', () => {
  assert.match(PRIVACY_NOTICE, /credential-ref/)
  assert.match(PRIVACY_NOTICE, /不出网/)
  assert.match(PRIVACY_NOTICE, /vault/)
  assert.match(PRIVACY_NOTICE, /不落明文/)
})
