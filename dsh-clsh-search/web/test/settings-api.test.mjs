// settings-api.test.mjs — Task 13：设置读写契约纯模块单测（web/ 树内）。
// 覆盖：设置键与 Config 同键（无遗漏、无多余）/ 回显=R5 / toConfig 同键写回 / 传输缝可注入（离线）。
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Config } from '../../lib/index.js'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  createSettingsApi,
  fromConfig,
  toConfig,
  validateSettings,
} from '../src/lib/settings-api.js'

test('设置键与 Config 同键：sources/priority + 预算键 + takeOver，无遗漏无多余', () => {
  assert.deepEqual(SETTINGS_KEYS, [
    'sources', 'priority', 'timeoutMs', 'retries', 'chainBudgetMs', 'maxResults', 'cacheTtlMs', 'egoBudget', 'takeOver',
  ])
  const patch = toConfig(DEFAULT_SETTINGS)
  assert.deepEqual(Object.keys(patch).sort(), ['cacheTtlMs', 'chainBudgetMs', 'egoBudget', 'maxResults', 'retries', 'sources', 'takeOver', 'timeoutMs'])
  for (const key of Object.keys(patch)) assert.ok(key in Config.parse({}), `Config 无键 ${key}`)
  assert.deepEqual(Object.keys(patch.sources).sort(), ['baidu', 'bing', 'ddg', 'priority', 'so360'])
})

test('回显 = R5 确认表：未改动时 fromConfig 全默认一致', () => {
  assert.deepEqual(fromConfig({}), DEFAULT_SETTINGS)
  assert.equal(fromConfig({}).timeoutMs, 12000)
  assert.equal(fromConfig({}).retries, 3)
  assert.equal(fromConfig({}).chainBudgetMs, 30000)
  assert.equal(fromConfig({}).maxResults, 8)
  assert.equal(fromConfig({}).cacheTtlMs, 600000)
  assert.equal(fromConfig({}).egoBudget, 15)
  assert.equal(fromConfig({}).takeOver, 'auto')
})

test('fromConfig：缺省/非法值回落默认，越界条数 clamp，非法 priority 回默认序', () => {
  assert.equal(fromConfig({ maxResults: 99 }).maxResults, 10)
  assert.equal(fromConfig({ timeoutMs: 'x' }).timeoutMs, 12000)
  assert.equal(fromConfig({ takeOver: 'x' }).takeOver, 'auto')
  assert.deepEqual(fromConfig({ sources: { priority: ['ddg'] } }).priority, DEFAULT_SETTINGS.priority)
  assert.deepEqual(fromConfig(null), DEFAULT_SETTINGS)
})

test('toConfig：同键写回（sources 开关与 priority 并入 sources 对象）', () => {
  const patch = toConfig({
    ...DEFAULT_SETTINGS,
    sources: { ...DEFAULT_SETTINGS.sources, ddg: false },
    priority: ['baidu', 'bing', 'so360', 'ddg'],
    maxResults: 10,
    takeOver: 'force',
  })
  assert.equal(patch.sources.ddg, false)
  assert.deepEqual(patch.sources.priority, ['baidu', 'bing', 'so360', 'ddg'])
  assert.equal(patch.maxResults, 10)
  assert.equal(patch.takeOver, 'force')
})

test('validateSettings：全关/非法值给出字段提示；合法设置 ok', () => {
  const bad = validateSettings({
    ...DEFAULT_SETTINGS,
    sources: { ddg: false, bing: false, so360: false, baidu: false },
  })
  assert.equal(bad.ok, false)
  assert.match(bad.errors.sources, /至少启用一个搜索源/)
  assert.equal(validateSettings(DEFAULT_SETTINGS).ok, true)
})

test('createSettingsApi：传输缝可注入（离线假 fetch），load/save 走同键契约', async () => {
  const calls = []
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { config: { sources: { ddg: false } } } }),
    }
  }
  const api = createSettingsApi({ baseUrl: '/api/dsh-clsh-search', fetchImpl: fakeFetch, timeoutMs: 0 })
  const loaded = await api.load()
  assert.equal(loaded.sources.ddg, false)
  assert.equal(calls[0].url, '/api/dsh-clsh-search/settings')

  await api.save(DEFAULT_SETTINGS)
  assert.equal(calls[1].init.method, 'POST')
  const sent = JSON.parse(calls[1].init.body)
  assert.equal(sent.egoBudget, 15)
  assert.deepEqual(sent.sources.priority, DEFAULT_SETTINGS.priority)
})

test('createSettingsApi：错误信封可解释上抛', async () => {
  const api = createSettingsApi({
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: '保存失败（服务端）' } }) }),
    timeoutMs: 0,
  })
  await assert.rejects(() => api.load(), /保存失败（服务端）/)
})
