// budget-model.test.mjs — Task 15：性能预算纯模块单测（web/ 树内）。
// 覆盖验收：正整数校验 / maxResults clamp 1-10 / egoBudget 默认 15 / 键面与 Config 一一对应 / 回显=R5。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Config } from '../../lib/index.js'
import {
  BUDGET_KEYS,
  CACHE_TTL_OPTIONS,
  R5_DEFAULTS,
  clampMaxResults,
  msToSeconds,
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
  assert.deepEqual(nonBudget, ['cacheDir', 'dataDir', 'logDir', 'sources', 'takeOver'])
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
