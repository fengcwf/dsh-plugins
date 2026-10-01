// load.test.mjs — 冒烟（Task 2 / INV-8 载体）
// ⚠️ 工作区铁律（2026-09-23 事故教训）：测试全绿 ≠ 可加载——必须真 import('../lib/index.js')，
// 缺依赖/断链/语法裂立刻红（node --check 不解析 import，空测试集不算绿）。
// 离线：不触网、不写真实 home（夹具全内存捕获）。
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertContentBlocks,
  assertNoSection,
  assertNotContentBlocks,
  assertSearchProvider,
  assertSection,
  createFakeCtx,
} from './helpers/fake-ctx.mjs'

test('插件入口可加载：真 import + 导出契约完整（name / inject / Config / apply 四件套）', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'dsh-clsh-search')
  assert.ok(Array.isArray(mod.inject), 'inject 必须是数组')
  assert.deepEqual(mod.inject, ['web', 'systemPrompt'], '注入宿主服务：web（注册缝）+ systemPrompt（顺序策略缝）')
  assert.ok(mod.Config && typeof mod.Config.parse === 'function', 'Config 必须是可 parse 的 zod schema')
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.default, 'object', 'default 导出必须是对象（R13：工厂函数形会被宿主静默忽略）')
  assert.notEqual(typeof mod.default, 'function')
  assert.equal(mod.default.inject, mod.inject)
  assert.equal(mod.default.apply, mod.apply)
})

test('apply 在假 ctx 上装载：effect 缝建立且返回 undefined（cordis Invalid effect 面）、零告警', async () => {
  const { apply } = await import('../lib/index.js')
  const fixture = createFakeCtx()
  const returned = apply(fixture.ctx, { timeoutMs: 5000 })
  assert.equal(returned, undefined, 'apply 不得返回普通对象——cordis `_execute` 按 effect 校验会抛 Invalid effect')
  assert.equal(fixture.state.effects.length, 1, '生命周期 effect 必须挂上')
  assert.equal(fixture.state.effects[0].label, 'dsh-clsh-search: lifecycle')
  assert.equal(typeof fixture.state.effects[0].teardown, 'function', 'effect 必须返回拆除器（释放成对）')
  assert.equal(fixture.state.warnings.length, 0, '合法配置零告警')
  assert.equal(fixture.runTeardowns(), 1, 'fiber 卸载时拆除器被调用一次')
  assert.equal(fixture.state.effects.length, 0, '拆除后不再残留 effect 登记')
})

test('apply 非法配置留痕不静默：告警带键名、装载不抛（fail-open 回默认值）', async () => {
  const { apply } = await import('../lib/index.js')
  const fixture = createFakeCtx()
  assert.doesNotThrow(() => apply(fixture.ctx, { timeoutMs: 'oops', sources: { ddg: 'yes' } }))
  assert.equal(fixture.state.warnings.length, 1, '非法配置恰好一条告警')
  assert.match(fixture.state.warnings[0], /timeoutMs/, '告警必须点名违规键')
  assert.match(fixture.state.warnings[0], /defaults applied/, '告警必须说明已回退默认值')
  assert.equal(fixture.state.effects.length, 1, '配置坏了也不阻断装载（fail-open）')

  // 缺省/空配置同样零告警
  const bare = createFakeCtx()
  apply(bare.ctx, undefined)
  apply(bare.ctx, {})
  assert.equal(bare.state.warnings.length, 0)
})

test('apply 无 logger 时回落 console.warn（告警行为不丢）', async () => {
  const { apply } = await import('../lib/index.js')
  const recorded = []
  const originalWarn = console.warn
  console.warn = (line) => recorded.push(String(line))
  try {
    const bare = { effect: (execute) => execute() }
    apply(bare, { retries: 'many' })
  } finally {
    console.warn = originalWarn
  }
  assert.equal(recorded.length, 1, '无 logger 也必须留下告警')
  assert.match(recorded[0], /retries/)
})

test('夹具自检：注册面捕获 + 宿主同形重复注册错误 + 释放面计数', () => {
  const fixture = createFakeCtx({ searchProviderId: 'deepseek-official' })
  const provider = {
    id: 'dsh-clsh-search',
    available: () => true,
    search: async () => [{ type: 'text', text: 'ok' }],
  }
  const dispose = fixture.ctx.web.registerSearchProvider(provider)
  assertSearchProvider(fixture, 'dsh-clsh-search')
  assert.equal(fixture.ctx.web.searchProviderId, 'deepseek-official', '指针字段可读写（运行时兜底载体）')
  fixture.ctx.web.searchProviderId = 'dsh-clsh-search'
  assert.equal(fixture.ctx.web.searchProviderId, 'dsh-clsh-search')

  assert.throws(
    () => fixture.ctx.web.registerSearchProvider({ ...provider }),
    (error) => error.code === 'WEB_DUPLICATE_PROVIDER',
    '重复 id 必须抛宿主同形错误（K-3 幂等的测试载体）',
  )
  assert.throws(() => fixture.ctx.web.registerSearchProvider({ id: 'no-search' }), TypeError, '缺 search 函数必须拒')
  assert.throws(() => fixture.ctx.web.registerFetchProvider({}), TypeError, '缺 id 必须拒')

  fixture.ctx.web.registerFetchProvider({ id: 'http', fetch: async () => ({}) })
  assert.equal(fixture.state.fetchProviders.length, 1)

  dispose()
  assert.equal(fixture.state.searchProviders.length, 0, 'disposer 必须注销 provider（释放成对）')
  assert.equal(fixture.state.disposals, 1)
})

test('夹具自检：systemPrompt.section 捕获/拆除与 order 槽位', () => {
  const fixture = createFakeCtx()
  const dispose = fixture.ctx.systemPrompt.section({
    name: 'tool:web_search',
    order: fixture.ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH'),
    text: '顺序策略文案',
  })
  assertSection(fixture, 'tool:web_search', { order: 'TOOL_WEB_SEARCH' })
  assert.throws(() => fixture.ctx.systemPrompt.section({ text: '缺 name' }), TypeError)
  dispose()
  assertNoSection(fixture, 'tool:web_search')
  assert.equal(fixture.state.disposals, 1)
})

test('夹具自检：ContentBlock[] 断言助手正反例（K-1 载体）', () => {
  assertContentBlocks([{ type: 'text', text: '结果正文' }], 'text 块')
  assertContentBlocks([], '空结果数组')
  assertContentBlocks([{ type: 'text', text: '' }, { type: 'reasoning', text: '思考' }], '多块')

  assertNotContentBlocks('裸字符串渲染（free-search issue #32 形）', '字符串')
  assertNotContentBlocks({ type: 'text', text: '裸对象非数组' }, '裸对象')
  assertNotContentBlocks([{ type: 'markdown', text: '非法 type' }], '词汇外 type')
  assertNotContentBlocks([{ type: 'text' }], '缺 text 字段')
  assertNotContentBlocks([{ foo: 1 }], '裸字段对象')
})
