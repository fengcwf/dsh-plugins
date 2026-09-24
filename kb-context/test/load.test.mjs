import test from 'node:test'
import assert from 'node:assert/strict'

// node:sqlite 实验性警告降噪（T5 起入口链含索引层）：只吞 ExperimentalWarning，其余警告照打（输出干净）
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w?.name !== 'ExperimentalWarning') console.error(String(w?.stack || w))
})

// ⚠️ 冒烟测试（2026-09-23 事故教训）：真 import 入口模块——缺依赖/断链立刻红
// （`node --check` 不解析 import；空测试集不算绿）。

test('插件入口可加载：依赖解析 + 导出契约完整', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'kb-context')
  assert.ok(Array.isArray(mod.inject))
  assert.equal(typeof mod.apply, 'function')
  assert.ok(mod.Config && typeof mod.Config.parse === 'function')
})

test('R13 回归：default 导出是 {inject, apply} 对象，不是工厂函数', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.default, 'object')
  assert.notEqual(typeof mod.default, 'function')
  assert.equal(mod.default.inject, mod.inject)
  assert.equal(mod.default.apply, mod.apply)
})

test('Config 全键默认值与契约精确一致', async () => {
  const { Config } = await import('../lib/index.js')
  const expected = {
    triggers: { words: [], entityPaths: [] },
    hotMap: { enabled: false, maxChars: 600 },
    budget: { maxSnippets: 3, maxTokens: 2000 },
    timeoutMs: 1500,
    scope: {
      indexAll: ['wiki', 'raw'],
      grepOnDemand: ['01-客户资料', '02-致远OA', '03-帆软报表', '04-用友', '05-医院成本', '08-unraid'],
    },
  }
  assert.deepEqual(Config.parse({}), expected)
  assert.deepEqual(Config.parse(undefined), expected)
})

test('Config 部分覆盖只改触达键（热改语义：每次读当前 config）', async () => {
  const { Config } = await import('../lib/index.js')
  const c = Config.parse({ triggers: { words: ['OA'] }, timeoutMs: 800 })
  assert.deepEqual(c.triggers, { words: ['OA'], entityPaths: [] })
  assert.equal(c.timeoutMs, 800)
  assert.equal(c.hotMap.enabled, false)
  assert.equal(c.hotMap.maxChars, 600)
  assert.equal(c.budget.maxSnippets, 3)
  assert.equal(c.budget.maxTokens, 2000)
  assert.deepEqual(c.scope.indexAll, ['wiki', 'raw'])
  assert.equal(c.scope.grepOnDemand.length, 6)
})

test('Config 拒绝错误类型（schema 真校验，非透传）', async () => {
  const { Config } = await import('../lib/index.js')
  assert.throws(() => Config.parse({ timeoutMs: '1500' }))
  assert.throws(() => Config.parse({ hotMap: { enabled: 'yes' } }))
  assert.throws(() => Config.parse({ budget: { maxTokens: 'two-thousand' } }))
  assert.throws(() => Config.parse({ scope: { indexAll: 'wiki' } }))
  assert.throws(() => Config.parse({ triggers: { words: 'OA' } }))
})

test('Config 默认值无可变共享引用（多次 parse 互不污染）', async () => {
  const { Config } = await import('../lib/index.js')
  const a = Config.parse({})
  a.triggers.words.push('污染')
  a.scope.indexAll.push('污染')
  const b = Config.parse({})
  assert.deepEqual(b.triggers.words, [])
  assert.deepEqual(b.scope.indexAll, ['wiki', 'raw'])
})

test('apply：非法配置留痕不静默（INV-15），合法配置零告警', async () => {
  const { apply } = await import('../lib/index.js')
  const warnings = []
  // 测试替身补宿主 ctx.on 缝（T5 apply 契约新增 pre-step 注册；告警断言零改动）
  const ctx = { on: () => {}, tools: { register: () => {} }, logger: { warn: (line) => warnings.push(line) } }
  apply(ctx, { timeoutMs: 'oops' })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /timeoutMs/)
  warnings.length = 0
  apply(ctx, { timeoutMs: 900 })
  assert.equal(warnings.length, 0)
  apply(ctx, undefined)
  assert.equal(warnings.length, 0)
})

test('apply：无 logger 时回落 console.warn（行为不丢）', async () => {
  const { apply } = await import('../lib/index.js')
  const recorded = []
  const orig = console.warn
  console.warn = (line) => recorded.push(line)
  try {
    apply({ on: () => {}, tools: { register: () => {} } }, { budget: { maxSnippets: 'many' } })
  } finally {
    console.warn = orig
  }
  assert.equal(recorded.length, 1)
  assert.match(recorded[0], /maxSnippets/)
})
