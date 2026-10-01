// strategy.test.mjs — Task 12：工具调用顺序策略注入（US-4/US-6，K-4 文字面，W1-N3 槽位语义）
// 离线：假 ctx 夹具复用（systemPrompt.section 捕获槽），不触网。
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertNoSection,
  assertSection,
  createFakeCtx,
} from './helpers/fake-ctx.mjs'
import {
  buildStrategyText,
  DEFAULT_BUDGET_MIRROR,
  installStrategy,
  STRATEGY_ORDER_NAME,
  STRATEGY_SECTION_NAME,
  STRATEGY_TEXT,
} from '../lib/strategy.js'
import { apply, Config } from '../lib/index.js'

test('systemPrompt.section 注册：name 与 order 槽位正确（W1-N3 语义补齐=TOOLS_SDK 真键）', () => {
  const fixture = createFakeCtx()
  const dispose = installStrategy(fixture.ctx)
  const section = assertSection(fixture, STRATEGY_SECTION_NAME)
  assert.equal(section.order, STRATEGY_ORDER_NAME, 'order 经 getSectionOrder 真键解析（W1-N3 补齐）')
  assert.equal(section.text, STRATEGY_TEXT)
  assert.equal(typeof dispose, 'function')
  dispose()
  assertNoSection(fixture, STRATEGY_SECTION_NAME)
})

test('注入幂等：重复 installStrategy 不重复注册，拆除后可重装', () => {
  const fixture = createFakeCtx()
  installStrategy(fixture.ctx)
  installStrategy(fixture.ctx)
  installStrategy(fixture.ctx)
  assert.equal(fixture.state.sections.filter((s) => s.name === STRATEGY_SECTION_NAME).length, 1, '幂等：恰注册一次')
  assert.equal(fixture.state.warnings.length, 0, '幂等不告警')
})

test('五要素文案 grep：vault+记忆 / web_search / web_fetch / ego-browser 仅兜底 / 15 次（US-6）', () => {
  for (const keyword of ['vault+记忆', 'web_search', 'web_fetch', 'ego-browser 仅兜底', '15 次']) {
    assert.ok(STRATEGY_TEXT.includes(keyword), `文案必须含五要素：${keyword}`)
  }
  // 分级进入条件与失败判据在场
  assert.match(STRATEGY_TEXT, /先查本地/, '第 1 级进入条件')
  assert.match(STRATEGY_TEXT, /失败判据与降级触发器/, '失败判据小节')
  assert.match(STRATEGY_TEXT, /预算熔断说明/, '熔断说明小节')
})

test('降级触发器描述：全源失败 → web_fetch → ego-browser 顺序链（US-4 引导面）', () => {
  const chainLine = STRATEGY_TEXT.split('\n').find((line) => line.includes('降级触发器'))
  assert.ok(chainLine, '必须有降级触发器行')
  const failAt = chainLine.indexOf('全源失败')
  const fetchAt = chainLine.indexOf('web_fetch')
  const egoAt = chainLine.indexOf('ego-browser')
  assert.ok(failAt >= 0 && fetchAt > failAt && egoAt > fetchAt, '降级链顺序=全源失败 → web_fetch → ego-browser')
  assert.match(STRATEGY_TEXT, /错误块含逐源失败原因与发生时间/, '失败判据含错误块内容面')
  assert.match(STRATEGY_TEXT, /人机验证立即停手/, '验证码停手语义（INV-5 文字面）')
})

test('K-4 文字面：文案无凭据明文、无本地绝对路径外泄', () => {
  assert.doesNotMatch(STRATEGY_TEXT, /\/root\/|\/home\/|[A-Za-z]:\\|~\//, '不得含本地绝对路径')
  assert.doesNotMatch(STRATEGY_TEXT, /(?:api[_-]?key|secret|token|password)\s*[:=]/i, '不得含凭据键值明文')
  assert.match(STRATEGY_TEXT, /credential-ref/, '凭据只提 env 名引用机制')
  assert.match(STRATEGY_TEXT, /不出网/, '隐私红线在场')
})

test('index.js 注入点接线：apply() 即注册顺序策略 section（Task 12 落地实证）', () => {
  const fixture = createFakeCtx()
  apply(fixture.ctx, {})
  assertSection(fixture, STRATEGY_SECTION_NAME, { order: STRATEGY_ORDER_NAME })
  assert.equal(fixture.state.effects.length, 1, '仍守 W1 单 effect 生命周期缝')
  fixture.runTeardowns()
  assertNoSection(fixture, STRATEGY_SECTION_NAME, '拆除成对')
})

test('W5-STRATEGY-HARDCODED-BUDGET：文案预算数值改读 Config（可配后文案不误导）', () => {
  // 自定义预算 → 文案插值，无默认字面残留
  const custom = buildStrategyText(Config.parse({ egoBudget: 20, chainBudgetMs: 60000 }))
  assert.match(custom, /20 次/, 'egoBudget 插值')
  assert.match(custom, /60 秒/, 'chainBudgetMs 插值（秒）')
  assert.doesNotMatch(custom, /15 次/, '自定义预算后不得残留默认字面')
  assert.doesNotMatch(custom, /30 秒/)

  // 镜像与 Config schema 默认同源（测试钉死，防文案漂移）
  const defaults = Config.parse({})
  assert.equal(DEFAULT_BUDGET_MIRROR.egoBudget, defaults.egoBudget, '镜像 egoBudget=Config 默认')
  assert.equal(DEFAULT_BUDGET_MIRROR.chainBudgetMs, defaults.chainBudgetMs, '镜像 chainBudgetMs=Config 默认')
  assert.equal(STRATEGY_TEXT, buildStrategyText(defaults), '缺省文案=Config 默认预算插值')

  // 注入面：installStrategy 带 config 即按其预算值注入
  const fixture = createFakeCtx()
  installStrategy(fixture.ctx, Config.parse({ egoBudget: 7, chainBudgetMs: 9000 }))
  const section = assertSection(fixture, STRATEGY_SECTION_NAME)
  assert.match(section.text, /7 次/)
  assert.match(section.text, /9 秒/)
  // 固定要素面不受插值影响
  for (const keyword of ['vault+记忆', 'web_search', 'web_fetch', 'ego-browser 仅兜底']) {
    assert.ok(section.text.includes(keyword), `固定要素仍在：${keyword}`)
  }
})

test('W5-STRATEGY-DISPOSE-ASYM：拆除对称 + 身份校验（幂等、陈旧拆除器零作用）', () => {
  // 幂等：多次调用拆除器零作用，拆除恰一次
  const fixture = createFakeCtx()
  const release = installStrategy(fixture.ctx)
  release()
  release()
  assert.equal(fixture.state.disposals, 1, '拆除恰一次（对称：不重复回收）')
  assertNoSection(fixture, STRATEGY_SECTION_NAME)

  // 身份校验：陈旧拆除器不得误拆新安装（与 W2-IDEMPOTENT-DISPOSE 同类）
  const fixture2 = createFakeCtx()
  const first = installStrategy(fixture2.ctx)
  first()
  const second = installStrategy(fixture2.ctx) // 重装新实例
  assertSection(fixture2, STRATEGY_SECTION_NAME)
  first() // 陈旧拆除器再调 → 零作用
  assertSection(fixture2, STRATEGY_SECTION_NAME, '陈旧拆除器不得误拆新安装')
  assert.equal(fixture2.state.disposals, 1, '陈旧调用不产生第二次拆除')
  second()
  assertNoSection(fixture2, STRATEGY_SECTION_NAME)
  assert.equal(fixture2.state.disposals, 2, '新装的拆除器正常回收')
})
