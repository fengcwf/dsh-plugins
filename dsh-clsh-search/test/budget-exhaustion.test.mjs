// budget-exhaustion.test.mjs — W5-repair：W5-BUDGET-RACE 关闭的行为探针（t16 探针 9/9 复现法）
//
// 全链：apply → provider.search → runSearch → guard.chain（预算唯一定时权威）→ aggregate。
// 修复面：预算耗尽（CHAIN_BUDGET_EXHAUSTED）收口明示块（Ruling-7 对预算类可达），绝不裸抛；
// 用户取消仍上抛（wiring.test 既有例锁定）。
// 注意（t16 附注）：guard 预算定时器 unref——挂起形负载必须 keep-alive 保事件环，否则提前退出。
import test from 'node:test'
import assert from 'node:assert/strict'

import { assertSearchProvider, createFakeCtx } from './helpers/fake-ctx.mjs'
import { apply } from '../lib/index.js'
import { CHAIN_BUDGET_CODE } from '../lib/guard.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 源行为三形：hang=挂起到 signal 中止；fail=快速普通失败；empty=快速空集。 */
function sourceWith(name, shape, { delayMs = 0 } = {}) {
  const calls = []
  return {
    name,
    enabled: true,
    calls,
    async search(query, signal) {
      calls.push(query)
      if (shape === 'hang') {
        return new Promise((resolve, reject) => {
          if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'))
            return
          }
          signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
        })
      }
      if (delayMs > 0) await sleep(delayMs)
      if (shape === 'fail') {
        const error = new Error('源失败')
        error.status = 503
        throw error
      }
      return { sources: [] }
    },
  }
}

/** 预算中止信号（guard 定时权威的 reason 同形）。 */
function budgetAbortSignal() {
  const controller = new AbortController()
  controller.abort(Object.assign(new Error('整链预算耗尽（探针预中止）'), { code: CHAIN_BUDGET_CODE }))
  return controller.signal
}

/**
 * 全链驱动：apply（真实 runSearch/guard/aggregate 接线）→ provider.search。
 * @returns {Promise<{threw: boolean, value?: object, error?: object}>}
 */
async function driveFullChain({ chainBudgetMs = 30, sources, outerSignal }) {
  const fixture = createFakeCtx({ searchProviderId: '' })
  apply(fixture.ctx, { chainBudgetMs }, { sources })
  const provider = assertSearchProvider(fixture, 'dsh-clsh-search')
  try {
    const value = await provider.search({ query: '预算探针' }, outerSignal)
    return { threw: false, value }
  } catch (error) {
    return { threw: true, error }
  }
}

test('全链预算耗尽 → 明示块集成测试（Ruling-7 预算类可达；修复前裸 throw）', async () => {
  const keepAlive = setInterval(() => {}, 5) // guard 预算定时器 unref：保事件环
  try {
    const hanging = sourceWith('ddg', 'hang')
    const next = sourceWith('bing', 'hang')
    const result = await driveFullChain({ chainBudgetMs: 30, sources: [hanging, next] })
    assert.equal(result.threw, false, '预算耗尽不得裸抛（W5-BUDGET-RACE 关闭）')
    const value = result.value
    // Ruling-7 ok:false 映射：明示块文本经 content 上行
    assert.equal(typeof value.content, 'string', '明示块经 content 上行')
    assert.match(value.content, /整链预算/, '明示块含预算耗尽事实')
    assert.match(value.content, /30ms/, '含预算值（K-6 明示面）')
    assert.match(value.content, /web_fetch/, '含降级建议')
    assert.deepEqual(value.sources, [])
    assert.equal(value.truncated, false)
    assert.equal(next.calls.length, 0, '预算耗尽后不再发起新源请求（K-6）')
  } finally {
    clearInterval(keepAlive)
  }
})

test('预算耗尽错误码沿 error 面可达：源直抛 CHAIN_BUDGET_EXHAUSTED 同样收口明示块', async () => {
  const keepAlive = setInterval(() => {}, 5)
  try {
    const coded = sourceWith('ddg', 'fail')
    coded.search = async () => {
      throw Object.assign(new Error('整链预算耗尽（错误码路径）'), { code: CHAIN_BUDGET_CODE })
    }
    const result = await driveFullChain({ chainBudgetMs: 30000, sources: [coded] })
    assert.equal(result.threw, false, '错误码路径同样收口（不裸抛）')
    assert.match(result.value.content, /整链预算/)
  } finally {
    clearInterval(keepAlive)
  }
})

test('行为探针 9 变体：预算耗尽全收口明示块，0/9 THREW（对照 t16 探针复现法）', async () => {
  const keepAlive = setInterval(() => {}, 5)
  // 9 变体 = 3 触发位（源1在途 / 源2在途 / 起链前预中止）× 3 源形态（hang/fail/empty）的可行组合
  const scenarios = [
    { name: '①源1在途切断×hang', chainBudgetMs: 30, sources: [sourceWith('ddg', 'hang')] },
    { name: '②双挂起源×首源在途切断', chainBudgetMs: 30, sources: [sourceWith('ddg', 'hang'), sourceWith('bing', 'hang')] },
    { name: '③空集续试后次源在途切断', chainBudgetMs: 30, sources: [sourceWith('ddg', 'empty'), sourceWith('bing', 'hang')] },
    { name: '④失败留痕后次源在途切断', chainBudgetMs: 30, sources: [sourceWith('ddg', 'fail'), sourceWith('bing', 'hang')] },
    { name: '⑤起链前预中止×empty（零源调用）', chainBudgetMs: 30000, sources: [sourceWith('ddg', 'empty')], preAborted: true },
    { name: '⑥起链前预中止×hang（零源调用）', chainBudgetMs: 30000, sources: [sourceWith('ddg', 'hang')], preAborted: true },
    { name: '⑦错误码路径×fail 直抛', chainBudgetMs: 30000, sources: [Object.assign(sourceWith('ddg', 'fail'), {
      async search() { throw Object.assign(new Error('整链预算耗尽（错误码路径）'), { code: CHAIN_BUDGET_CODE }) },
    })] },
    { name: '⑧前置时间检查×慢空集越界', chainBudgetMs: 1, sources: [sourceWith('ddg', 'empty', { delayMs: 5 }), sourceWith('bing', 'empty')] },
    { name: '⑨失败+空集+挂起混合、末源在途切断', chainBudgetMs: 30, sources: [sourceWith('ddg', 'fail'), sourceWith('bing', 'empty'), sourceWith('so360', 'hang')] },
  ]
  const results = []
  try {
    for (const scenario of scenarios) {
      const result = await driveFullChain({
        chainBudgetMs: scenario.chainBudgetMs,
        sources: scenario.sources,
        outerSignal: scenario.preAborted ? budgetAbortSignal() : undefined,
      })
      if (result.threw) {
        results.push(`${scenario.name} THREW: ${result.error?.message ?? result.error}`)
        continue
      }
      const ok = typeof result.value?.content === 'string' && result.value.content.includes('整链预算')
      results.push(`${scenario.name} ${ok ? 'OK（明示块）' : 'RESOLVED-BUT-NO-BLOCK'}`)
    }
  } finally {
    clearInterval(keepAlive)
  }
  const threw = results.filter((line) => line.includes('THREW'))
  const noBlock = results.filter((line) => line.includes('RESOLVED-BUT-NO-BLOCK'))
  // 探针输出（报告引用）：9 变体 × {OK（明示块） | THREW | RESOLVED-BUT-NO-BLOCK}
  console.log('budget-exhaustion probe:\n  ' + results.join('\n  '))
  assert.equal(threw.length, 0, `修复后应 0/9 THREW，实得：\n${threw.join('\n')}`)
  assert.equal(noBlock.length, 0, `全部变体应收口明示块，实得：\n${noBlock.join('\n')}`)
  assert.equal(results.length, 9, '探针 9 变体全数执行')
})
