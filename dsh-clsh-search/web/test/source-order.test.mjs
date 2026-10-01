// source-order.test.mjs — Task 14：源管理纯模块单测（web/ 树内；inScope 拆路径规则）。
// 覆盖验收：priority 全排列校验 / 单源全关提示 / 开关写回（经 settings-api 契约）。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  DEFAULT_SOURCE_FLAGS,
  SOURCE_IDS,
  moveSource,
  toggleSource,
  validatePriority,
  validateSources,
} from '../src/lib/source-order.js'
import { DEFAULT_SETTINGS, toConfig } from '../src/lib/settings-api.js'

test('validatePriority：默认序为四源全排列，合法', () => {
  assert.deepEqual(validatePriority([...SOURCE_IDS]), { ok: true, errors: [] })
  assert.deepEqual(validatePriority(['baidu', 'so360', 'bing', 'ddg']), { ok: true, errors: [] })
})

test('validatePriority：缺源/重复/未知 id/长度错均判非法', () => {
  assert.equal(validatePriority(['ddg', 'bing', 'so360']).ok, false)
  assert.equal(validatePriority(['ddg', 'ddg', 'bing', 'so360']).ok, false)
  assert.equal(validatePriority(['ddg', 'bing', 'so360', 'google']).ok, false)
  assert.equal(validatePriority(['ddg', 'bing', 'so360', 'baidu', 'ddg']).ok, false)
  assert.equal(validatePriority('ddg').ok, false)
})

test('moveSource：交换顺序、越界为无操作、不改原数组', () => {
  const order = [...SOURCE_IDS]
  assert.deepEqual(moveSource(order, 'ddg', 1), ['bing', 'ddg', 'so360', 'baidu'])
  assert.deepEqual(moveSource(order, 'baidu', -1), ['ddg', 'bing', 'baidu', 'so360'])
  assert.deepEqual(moveSource(order, 'ddg', -1), order)
  assert.deepEqual(moveSource(order, 'baidu', 1), order)
  assert.deepEqual(order, SOURCE_IDS)
  assert.ok(validatePriority(moveSource(order, 'so360', 1)).ok)
})

test('toggleSource：开关写回为新对象；未知 id 无操作', () => {
  const next = toggleSource(DEFAULT_SOURCE_FLAGS, 'baidu')
  assert.equal(next.baidu, false)
  assert.equal(DEFAULT_SOURCE_FLAGS.baidu, true)
  assert.equal(toggleSource(next, 'baidu').baidu, true)
  assert.deepEqual(toggleSource(DEFAULT_SOURCE_FLAGS, 'google'), DEFAULT_SOURCE_FLAGS)
})

test('validateSources：四源全关给出校验提示；任一源开即通过', () => {
  const allOff = { ddg: false, bing: false, so360: false, baidu: false }
  const check = validateSources(allOff)
  assert.equal(check.ok, false)
  assert.match(check.errors[0], /至少启用一个搜索源/)
  assert.equal(validateSources(toggleSource(allOff, 'ddg')).ok, true)
})

test('开关与 priority 经 settings-api 契约写回 Config 同键', () => {
  const toggled = { ...DEFAULT_SETTINGS, sources: toggleSource(DEFAULT_SETTINGS.sources, 'bing') }
  const patch = toConfig(toggled)
  assert.deepEqual(Object.keys(patch.sources).sort(), ['baidu', 'bing', 'ddg', 'priority', 'so360'])
  assert.equal(patch.sources.bing, false)
  assert.deepEqual(patch.sources.priority, SOURCE_IDS)

  const reordered = { ...DEFAULT_SETTINGS, priority: moveSource(SOURCE_IDS, 'ddg', 1) }
  assert.deepEqual(toConfig(reordered).sources.priority, ['bing', 'ddg', 'so360', 'baidu'])
})
