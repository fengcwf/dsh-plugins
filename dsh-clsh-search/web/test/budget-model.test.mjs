// budget-model.test.mjs — Task 15：性能预算纯模块单测（web/ 树内）。
// 覆盖验收：正整数校验 / maxResults clamp 1-10 / egoBudget 默认 15 / 键面与 Config 一一对应 / 回显=R5。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Config } from '../../lib/index.js'
import {
  BUDGET_KEYS,
  CACHE_TTL_OPTIONS,
  EXTRA_KEY_DEFAULTS,
  EXTRA_KEY_FIELDS,
  R5_DEFAULTS,
  clampMaxResults,
  extraPatch,
  msToSeconds,
  pickExtraKeys,
  secondsToMs,
  validateBudget,
  validateNumber,
} from '../src/lib/budget-model.js'
import { DEFAULT_SETTINGS, fromConfig } from '../src/lib/settings-api.js'

const parsedDefault = Config.parse({})

test('键面一一对应：BUDGET_KEYS 全在 Config，且 Config 无遗漏预算键（无遗漏、无多余）', () => {
  const configKeys = Object.keys(parsedDefault).sort()
  for (const key of BUDGET_KEYS) assert.ok(key in parsedDefault, `Config 缺预算键 ${key}`)
  const nonBudget = configKeys.filter((key) => !BUDGET_KEYS.includes(key))
  // 0.2.x 扩键（INV-19/K-20）：非预算键新增 proxies / retryBackoffMs / maxResponseBytes / logCapacity / healthTimeoutMs
  assert.deepEqual(nonBudget, ['cacheDir', 'dataDir', 'healthTimeoutMs', 'logCapacity', 'logDir', 'maxResponseBytes', 'proxies', 'retryBackoffMs', 'sources', 'takeOver'])
  assert.deepEqual([...BUDGET_KEYS].sort(), ['cacheTtlMs', 'chainBudgetMs', 'egoBudget', 'maxResults', 'retries', 'timeoutMs'])
})

test('回显 = R5 确认值：budget 默认值与 Config schema 字段默认值逐项一致', () => {
  for (const key of BUDGET_KEYS) {
    assert.equal(R5_DEFAULTS[key], parsedDefault[key], `${key} 默认值漂移`)
  }
  assert.deepEqual(fromConfig({}), DEFAULT_SETTINGS)
  assert.equal(fromConfig({}).egoBudget, 15)
  assert.equal(R5_DEFAULTS.cacheTtlMs, 600000)
})

test('validateNumber：正整数校验（空/非数/小数/越界拒绝，min 0 字段接受 0）', () => {
  assert.equal(validateNumber('abc', { label: '超时' }).ok, false)
  assert.equal(validateNumber('', { label: '超时' }).ok, false)
  assert.equal(validateNumber(1.5, { label: '超时' }).ok, false)
  assert.equal(validateNumber(0, { label: '超时' }).ok, false)
  assert.equal(validateNumber(-3, { min: 0, label: '重试' }).ok, false)
  assert.equal(validateNumber(0, { min: 0, label: '重试' }).ok, true)
  assert.equal(validateNumber('12', { label: '超时' }).ok, true)
  assert.equal(validateNumber(11, { max: 10, label: '条数' }).ok, false)
})

test('clampMaxResults：clamp 1-10，与 Config transform 同式', () => {
  assert.equal(clampMaxResults(0), 1)
  assert.equal(clampMaxResults(8), 8)
  assert.equal(clampMaxResults(99), 10)
  assert.equal(Config.parse({ maxResults: 99 }).maxResults, clampMaxResults(99))
  assert.equal(Config.parse({ maxResults: -5 }).maxResults, clampMaxResults(-5))
})

test('validateBudget：逐字段校验；maxResults 越界 clamp 非报错', () => {
  assert.equal(validateBudget('timeoutMs', 'x').ok, false)
  assert.equal(validateBudget('timeoutMs', 12000).value, 12000)
  assert.equal(validateBudget('egoBudget', -1).ok, false)
  const clamped = validateBudget('maxResults', 99)
  assert.equal(clamped.ok, true)
  assert.equal(clamped.value, 10)
  assert.equal(validateBudget('unknownKey', 1).ok, false)
})

test('换算与下拉候选：毫秒↔秒、TTL 候选含 R5 默认 10 分钟', () => {
  assert.equal(msToSeconds(12000), 12)
  assert.equal(msToSeconds(30000), 30)
  assert.equal(secondsToMs(12), 12000)
  assert.ok(CACHE_TTL_OPTIONS.some((opt) => opt.valueMs === R5_DEFAULTS.cacheTtlMs && opt.label === '10 分钟'))
})

test('0.2.x 七组新键三面镜像：EXTRA_KEY_DEFAULTS 与词汇表 == Config schema（K-9 豁免③防漂移自证）', () => {
  // 面1：Config schema（lib/index.js） ↔ 面2：web 词汇表（budget-model）——逐键钉死
  for (const key of ['retryBackoffMs', 'maxResponseBytes', 'logCapacity', 'healthTimeoutMs']) {
    assert.equal(EXTRA_KEY_DEFAULTS[key], parsedDefault[key], `${key} 默认值漂移（Config ↔ 词汇表）`)
  }
  assert.deepEqual(EXTRA_KEY_DEFAULTS.proxies, parsedDefault.proxies, 'proxies 漂移')
  assert.deepEqual(EXTRA_KEY_DEFAULTS.useProxy, parsedDefault.sources.useProxy, 'sources.useProxy 漂移')
  assert.deepEqual(EXTRA_KEY_DEFAULTS.custom, parsedDefault.sources.custom, 'sources.custom 漂移')
  // 面3：词汇表（EXTRA_KEY_FIELDS）与默认值一一对应、字段齐 label/desc（设置页展示面）
  assert.deepEqual([...EXTRA_KEY_FIELDS.map((f) => f.key)].sort(), Object.keys(EXTRA_KEY_DEFAULTS).sort(), '词汇表键面 = 默认值键面')
  for (const field of EXTRA_KEY_FIELDS) {
    assert.ok(field.label && field.desc, `${field.key} 缺 label/desc 词汇`)
  }
  // 默认值语义抽样（R32/R5/K-26 拍板值）
  assert.equal(EXTRA_KEY_DEFAULTS.retryBackoffMs, 300)
  assert.equal(EXTRA_KEY_DEFAULTS.maxResponseBytes, 2097152, '2MiB（K-26：baidu 真实 0.91-1.04MiB 不被误拦）')
  assert.equal(EXTRA_KEY_DEFAULTS.logCapacity, 200)
  assert.equal(EXTRA_KEY_DEFAULTS.healthTimeoutMs, 5000)
})

test('写回面（保存即不丢）：extraPatch 含七组新键且 custom/useProxy 归位 sources 子键；pickExtraKeys 仅取在场键', () => {
  const customItem = { id: 'my-src', urlTemplate: 'https://e.example/s?q={query}' }
  const patch = extraPatch({ custom: [customItem], retryBackoffMs: 100 })
  // 七组全覆盖：顶层 5 + sources 子键 2
  for (const key of ['retryBackoffMs', 'maxResponseBytes', 'logCapacity', 'healthTimeoutMs', 'proxies', 'sources']) {
    assert.ok(key in patch, `写回 patch 缺 ${key}（保存即丢）`)
  }
  assert.equal(patch.retryBackoffMs, 100, '在场键透传')
  assert.equal(patch.maxResponseBytes, 2097152, '缺键回默认（保存不把服务端已配值清空；K-26 默认 2MiB）')
  assert.deepEqual(patch.sources.custom, [customItem], 'custom 归位 sources 子键')
  assert.ok(patch.sources.useProxy && typeof patch.sources.useProxy === 'object', 'useProxy 归位 sources 子键')
  assert.ok(Array.isArray(patch.proxies), 'proxies 数组形')

  // pickExtraKeys 在场语义：不在场不回填（applyPatch 编辑旧键不得重置新键）
  assert.deepEqual(Object.keys(pickExtraKeys({ logCapacity: 50 })).sort(), ['logCapacity'])
  // Config 形兼容：custom/useProxy 从 sources 子键取平铺
  const fromShape = pickExtraKeys({ sources: { custom: [customItem], useProxy: { ddg: false } }, proxies: ['https://p.example:8443'] })
  assert.deepEqual(fromShape.custom, [customItem])
  assert.equal(fromShape.useProxy.ddg, false)
  assert.deepEqual(fromShape.proxies, ['https://p.example:8443'])
  // 非法形回缺省（不产键）
  assert.deepEqual(pickExtraKeys(null), {})
  assert.deepEqual(pickExtraKeys({ retryBackoffMs: 'x' }), {})
})
