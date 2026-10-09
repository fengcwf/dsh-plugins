// source-order.test.mjs — Task 14：源管理纯模块单测（web/ 树内；inScope 拆路径规则）。
// 覆盖验收：priority 全排列校验 / 单源全关提示 / 开关写回（经 settings-api 契约）。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  DEFAULT_SOURCE_FLAGS,
  SOURCE_IDS,
  allSourceIds,
  moveSource,
  toggleSource,
  validatePriority,
  validateSources,
} from '../src/lib/source-order.js'
import { DEFAULT_SETTINGS, toConfig } from '../src/lib/settings-api.js'
import { Config } from '../../lib/index.js'

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
  // T17b 扩展显式翻修：写回面 sources 子键随透传扩为七键（custom/useProxy 归位）
  assert.deepEqual(Object.keys(patch.sources).sort(), ['baidu', 'bing', 'custom', 'ddg', 'priority', 'so360', 'useProxy'])
  assert.equal(patch.sources.bing, false)
  assert.deepEqual(patch.sources.priority, SOURCE_IDS)

  const reordered = { ...DEFAULT_SETTINGS, priority: moveSource(SOURCE_IDS, 'ddg', 1) }
  assert.deepEqual(toConfig(reordered).sources.priority, ['bing', 'ddg', 'so360', 'baidu'])
})

test('Config sources 键面扩锁（0.2.x / INV-19）：custom 与 useProxy 在场且默认值回落，写回键面仍封闭', () => {
  const sources = Config.parse({}).sources
  assert.deepEqual(
    Object.keys(sources).sort(),
    ['baidu', 'bing', 'custom', 'ddg', 'priority', 'so360', 'useProxy'],
    'sources 子键面 = 0.1.0 五键 + 0.2.x custom/useProxy（扩键须显式翻修本断言）',
  )
  assert.deepEqual(sources.custom, [], 'custom 默认空（升级后行为与 0.1.0 等价）')
  assert.deepEqual(sources.useProxy, { ddg: true, bing: true, so360: false, baidu: false }, '境外默认走代理、国内默认直连（R21）')
  // 写回键面封闭锁：T17b 扩展显式翻修（本锁原注释即要求扩展时翻）——写回面新增 custom/useProxy 归位 sources 子键
  assert.deepEqual(Object.keys(toConfig(DEFAULT_SETTINGS).sources).sort(), ['baidu', 'bing', 'custom', 'ddg', 'priority', 'so360', 'useProxy'])
})

test('R25 混排：内置+自定义 id 动态全排列，三检（长度/未知/重复）继续有效', () => {
  const known = allSourceIds(['my-source', 'another'])
  assert.deepEqual(known, ['ddg', 'bing', 'so360', 'baidu', 'my-source', 'another'], '词表=内置在前+自定义在后')
  const mixed = ['my-source', 'ddg', 'another', 'bing', 'so360', 'baidu']
  assert.deepEqual(validatePriority(mixed, known), { ok: true, errors: [] }, '混排全排列合法（自定义可排任意位）')
  // 三检继续有效
  assert.equal(validatePriority(['my-source', 'ddg', 'another', 'bing', 'so360'], known).ok, false, '长度错（缺 1）判非法')
  assert.equal(validatePriority([...mixed, 'ghost'], known).ok, false, '未知 id 判非法')
  assert.equal(validatePriority(['ddg', 'ddg', 'another', 'bing', 'so360', 'baidu'], known).ok, false, '重复 id 判非法')
  // 默认词表行为不变（四源面续命）
  assert.deepEqual(validatePriority([...SOURCE_IDS]), { ok: true, errors: [] })
  assert.equal(validatePriority(['ddg', 'bing', 'so360', 'my-source']).ok, false, '缺省词表下自定义 id 仍判未知')
})

test('allSourceIds：冲突与非法 id fail-closed（同 id 两源歧义面）', () => {
  assert.deepEqual(allSourceIds(), [...SOURCE_IDS], '无自定义=内置四源')
  assert.throws(() => allSourceIds(['ddg']), /冲突/, '自定义 id 与内置冲突即拒')
  assert.throws(() => allSourceIds(['']), TypeError, '空 id 拒')
  assert.throws(() => allSourceIds([42]), TypeError, '非字符串 id 拒')
})
