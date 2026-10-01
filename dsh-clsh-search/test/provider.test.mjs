// provider.test.mjs — Task 3：provider 注册与接管缝（假 ctx 集成）
// 断言面：K-1 ContentBlock[]（工具 handler 返回形）、K-3 幂等注册、K-10 让位三态、
// US-1 运行时兜底指针（resolveProvider 抛点语义模拟）、proposal 决策 1 边界（不动官方 provider）。
// 离线：不触网、不写盘；假 ctx 夹具复用 test/helpers/fake-ctx.mjs（W1 既定，勿另造）。
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertContentBlocks,
  assertNotContentBlocks,
  assertSearchProvider,
  createFakeCtx,
} from './helpers/fake-ctx.mjs'
import { apply, renderToolBlocks } from '../lib/index.js'

/**
 * 宿主 resolveProvider 抛点语义模拟（dsh-web lib/index.js:120-131 同形）：
 * 指针显式 → 该 id 必须已注册且 available()；未注册即抛 configured web provider 缺失。
 */
function resolveProviderLike(fixture) {
  const web = fixture.ctx.web
  const pool = fixture.state.searchProviders
  const configuredId = web.searchProviderId
  if (configuredId) {
    const provider = pool.find((entry) => entry.id === configuredId)
    if (!provider) throw new Error(`configured web provider "${configuredId}" is not registered`)
    if (typeof provider.available === 'function' && !provider.available()) {
      throw new Error(`configured web provider "${configuredId}" is registered but unavailable`)
    }
    return provider
  }
  const usable = pool.filter((entry) => typeof entry.available !== 'function' || entry.available())
  if (usable.length === 0) throw new Error('no usable web provider is registered')
  if (usable.length > 1) {
    throw new Error(`multiple usable web providers are registered (${usable.map((entry) => entry.id).join(', ')}); configure one explicitly`)
  }
  return usable[0]
}

/**
 * web_search 工具 handler 全链（假 ctx）：provider.search（seam 形）→ 宿主 output.render 形
 * 投影（dsh-tool-web lib/index.js:296-298 同契约：[{type:'text', text: ...}]）——K-1 断言面。
 */
async function webSearchHandler(fixture, request) {
  const provider = resolveProviderLike(fixture)
  return renderToolBlocks(await provider.search(request))
}

/**
 * 离线假源（W3 统一源形）：空结果。W5 起 provider.search 挂真聚合链（Ruling-7 接线），
 * 成功路径的锁定用例经 apply 注入缝喂假源——测试离线红线（不触网、不写真实 home）。
 */
function offlineSource(name = 'ddg') {
  return { name, enabled: true, search: async () => ({ sources: [] }) }
}

test('假 ctx 集成：apply() 后注册 id=dsh-clsh-search，handler 返回值守 ContentBlock[] 契约（K-1）', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  assert.doesNotThrow(() => apply(fixture.ctx, {}, { sources: [offlineSource()] }))
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  assert.equal(provider.id, 'dsh-clsh-search')
  assert.equal(provider.available(), true, '常规态（指针悬空）available() 必须 true')

  const request = { query: 'dsh 插件开发', maxResults: 8 }
  const value = await provider.search(request)
  // seam 形：宿主 WebSearchResult 契约（dsh-web types.d.ts:32-37）——capSources/formatSearchOutput 消费面
  assert.ok(Array.isArray(value.sources), 'seam 结果 sources 必须是数组')
  assert.equal(typeof value.truncated, 'boolean', 'seam 结果 truncated 必须是 boolean')
  assert.deepEqual(Object.keys(value).sort(), ['sources', 'truncated'], 'seam 结果键面 = WebSearchResult 封闭形')

  // K-1：web_search 工具 handler 返回值走 ContentBlock[] 形状断言
  const blocks = await webSearchHandler(fixture, request)
  assertContentBlocks(blocks, 'web_search handler 返回值')
  assert.equal(blocks.length, 1, '宿主 output.render 契约 = 单文本块')
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /No results found\./)
  // W2-RENDER-DRIFT 关闭后与宿主 formatSearchOutput 逐字节同输出（引用提示为宿主原文）
  assert.match(blocks[0].text, /Cite the relevant URLs above as markdown links in your answer\./)
  assert.match(blocks[0].text, /^External web content follows\./, '宿主 NOTICE 前置（同输出）')

  // K-1 反例：render 直返字符串（free-search issue #32 形）必须被 ContentBlock[] 契约拒
  assertNotContentBlocks('裸字符串渲染（free-search issue #32 形）', '字符串渲染')
})

test('handler 返回值有结果时仍守 ContentBlock[]：markdown 来源清单渲染（K-1）', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  apply(fixture.ctx, {})
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  provider.search = async () => ({
    sources: [
      { url: 'https://example.com/a', title: '页 A', snippet: '摘 A', publishedAt: '2026-10-01' },
      { url: 'https://example.com/b' },
    ],
    truncated: true,
  })
  const blocks = await webSearchHandler(fixture, { query: 'x' })
  assertContentBlocks(blocks, '带来源的 handler 返回值')
  assert.match(blocks[0].text, /\[页 A\]\(https:\/\/example\.com\/a\)/)
  assert.match(blocks[0].text, /— 摘 A \(2026-10-01\)/, '宿主 meta 形（` — snippet (date)`）')
  assert.match(blocks[0].text, /\[example\.com\]\(https:\/\/example\.com\/b\)/, '无 title 回落 hostname（宿主渲染同口径）')
  assert.match(blocks[0].text, /\(Showing the first 2 sources/, 'truncated 注记必须渲染（宿主原文）')
})

test('重复 apply 注册幂等：不抛 WEB_DUPLICATE_PROVIDER、同 id 只留一份（K-3）', () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  assert.doesNotThrow(() => apply(fixture.ctx, {}))
  assert.doesNotThrow(() => apply(fixture.ctx, {}), '重复 apply 不得抛 WEB_DUPLICATE_PROVIDER（K-3）')
  assert.doesNotThrow(() => apply(fixture.ctx, {}))
  const ours = fixture.state.searchProviders.filter((entry) => entry.id === 'dsh-clsh-search')
  assert.equal(ours.length, 1, '幂等：同 id 只保留一份注册')
  assert.equal(fixture.state.warnings.length, 0, '幂等跳过走 trace 不告警（热重载常态）')

  // 释放成对：拆除器回收本次注册，拆后不残留
  assert.ok(fixture.runTeardowns() >= 1, '拆除器被 fiber 卸载调用')
  assert.equal(
    fixture.state.searchProviders.filter((entry) => entry.id === 'dsh-clsh-search').length,
    0,
    '拆除后本插件注册释放',
  )
})

test('takeOver=auto 显式他家指针：让位不接管——available()=false + 告警日志 + 指针不动（K-10）', async () => {
  const fixture = createFakeCtx({ searchProviderId: 'other-provider' })
  fixture.ctx.web.registerSearchProvider({
    id: 'other-provider',
    available: () => true,
    search: async () => ({ sources: [], truncated: false }),
  })
  apply(fixture.ctx, { takeOver: 'auto' })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  assert.equal(provider.available(), false, '让位态 available() 必须 false（K-10）')
  assert.equal(fixture.ctx.web.searchProviderId, 'other-provider', '让位态不得改指针')
  assert.equal(fixture.state.warnings.length, 1, '让位必须输出警告日志')
  assert.match(fixture.state.warnings[0], /让位/)
  assert.match(fixture.state.warnings[0], /other-provider/)
  // resolveProvider 抛点语义：显式指针解析到他家 provider，本插件不抢占（US-7）
  assert.equal(resolveProviderLike(fixture).id, 'other-provider')
})

test('takeOver=force 强制接管：指针抢占到 dsh-clsh-search、available()=true（K-10）', () => {
  const fixture = createFakeCtx({ searchProviderId: 'other-provider' })
  fixture.ctx.web.registerSearchProvider({
    id: 'other-provider',
    available: () => true,
    search: async () => ({ sources: [], truncated: false }),
  })
  apply(fixture.ctx, { takeOver: 'force' })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  assert.equal(provider.available(), true, 'force 抢占态 available() 必须 true')
  assert.equal(fixture.ctx.web.searchProviderId, 'dsh-clsh-search', 'force 抢占=只写指针字段')
  assert.equal(fixture.state.warnings.length, 0, 'force 不告警（用户显式开启）')
  assert.equal(resolveProviderLike(fixture).id, 'dsh-clsh-search')
  assert.equal(
    fixture.state.searchProviders.some((entry) => entry.id === 'other-provider'),
    true,
    '他家 provider 不被 unregister（proposal 决策 1 边界）',
  )
})

test('takeOver=off 不接管：不注册 provider、不动指针（K-10）', () => {
  const fixture = createFakeCtx({ searchProviderId: 'deepseek-official' })
  apply(fixture.ctx, { takeOver: 'off' })
  assert.equal(fixture.state.searchProviders.length, 0, 'off 不注册 provider')
  assert.equal(fixture.ctx.web.searchProviderId, 'deepseek-official', 'off 不动指针')
  assert.equal(fixture.state.warnings.length, 0)
  // resolveProvider 抛点语义照旧（本插件不介入，off=完全关断）
  assert.throws(() => resolveProviderLike(fixture), /is not registered/)
})

test('运行时兜底指针：悬空/deepseek-official → apply 补指，web_search 不再报 provider 缺失（US-1）', async () => {
  // （a）指针悬空：补指前 resolveProvider 抛点语义复现
  const dangling = createFakeCtx({ searchProviderId: '' })
  assert.throws(() => resolveProviderLike(dangling), /no usable web provider is registered/, '补指前：悬空指针无可选 provider')
  apply(dangling.ctx, {}, { sources: [offlineSource()] })
  assert.equal(dangling.ctx.web.searchProviderId, 'dsh-clsh-search', '悬空 → 补指针到本插件')
  await resolveProviderLike(dangling).search({ query: '测试' })

  // （b）指针仍为 deepseek-official：现状报错形精确复现 → 补指后消失
  const stuck = createFakeCtx({ searchProviderId: 'deepseek-official' })
  assert.throws(
    () => resolveProviderLike(stuck),
    /configured web provider "deepseek-official" is not registered/,
    '补指前：现状报错（US-1 病灶）精确复现',
  )
  apply(stuck.ctx, {}, { sources: [offlineSource()] })
  assert.equal(stuck.ctx.web.searchProviderId, 'dsh-clsh-search', 'deepseek-official → 补指针到本插件')
  await resolveProviderLike(stuck).search({ query: '测试' })

  // （c）自指指针：不重复改写、照常可用
  const self = createFakeCtx({ searchProviderId: 'dsh-clsh-search' })
  apply(self.ctx, {})
  assert.equal(self.ctx.web.searchProviderId, 'dsh-clsh-search')
  assert.equal(self.state.warnings.length, 0)
})

test('边界：官方 provider 原样在场、注册面只增不删（proposal 决策 1）', () => {
  const fixture = createFakeCtx({ searchProviderId: 'deepseek-official' })
  fixture.ctx.web.registerSearchProvider({
    id: 'deepseek-official',
    available: () => true,
    search: async () => ({ sources: [], truncated: false }),
  })
  apply(fixture.ctx, { takeOver: 'auto' })
  assert.equal(
    fixture.state.searchProviders.some((entry) => entry.id === 'deepseek-official'),
    true,
    '官方 provider 必须原样在场（不 unregister、不覆盖）',
  )
  assert.equal(fixture.state.searchProviders.length, 2, '注册面只增不删')
  assert.equal(fixture.ctx.web.searchProviderId, 'dsh-clsh-search', '指针补到本插件（官方 provider 保留不动）')
})

test('handler 请求契约：缺 query / 空 query 拒（WebSearchRequest 契约面）', async () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  apply(fixture.ctx, {})
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  await assert.rejects(() => provider.search({}), /query/)
  await assert.rejects(() => provider.search({ query: '   ' }), /query/)
  await assert.rejects(() => provider.search(undefined), /query/)
})

