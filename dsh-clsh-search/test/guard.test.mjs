// guard.test.mjs — Task 11：预算熔断单调守卫（K-6 / INV-6）
// 离线：假时钟注入，不触网不写盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CHAIN_BUDGET_CODE, createGuard, EGO_BUDGET_CODE } from '../lib/guard.js'
import { Config } from '../lib/index.js'

test('默认预算熔断：第 egoBudget+1 次（默认第 16 次）熔断，文案含预算熔断与预算值（K-6）', () => {
  const config = Config.parse({}) // 默认 egoBudget=15（K-9 单一事实源=Config schema）
  assert.equal(config.egoBudget, 15)
  const guard = createGuard(config)
  for (let i = 1; i <= 15; i += 1) {
    assert.equal(guard.spendEgo(), i, `第 ${i} 次在预算内`)
  }
  assert.equal(guard.egoRemaining(), 0)
  assert.throws(
    () => guard.spendEgo(),
    (error) => {
      assert.equal(error.code, EGO_BUDGET_CODE)
      assert.equal(error.budget, 15)
      assert.match(error.message, /预算熔断/, '文案必须含预算熔断')
      assert.match(error.message, /15/, '文案必须含预算值')
      assert.match(error.message, /不再执行/, '文案必须明示停止')
      return true
    },
    '第 16 次必须熔断（K-6）',
  )
})

test('egoBudget 可配（K-9）：自定义预算的熔断点与文案预算值同步', () => {
  const guard = createGuard(Config.parse({ egoBudget: 3 }))
  assert.equal(guard.egoLimit(), 3)
  guard.spendEgo()
  guard.spendEgo()
  guard.spendEgo()
  assert.throws(() => guard.spendEgo(), (error) => {
    assert.equal(error.code, EGO_BUDGET_CODE)
    assert.match(error.message, /3/, '文案预算值=自定义值')
    return true
  })
})

test('计数单调性：熔断后继续计数不减、无任何清零/重置面（K-6 不可绕过）', () => {
  const guard = createGuard(Config.parse({ egoBudget: 2 }))
  guard.spendEgo()
  guard.spendEgo()
  assert.throws(() => guard.spendEgo())
  assert.equal(guard.egoUsed(), 3, '熔断后的调用同样计数（防 catch 后重试套利）')
  assert.throws(() => guard.spendEgo())
  assert.equal(guard.egoUsed(), 4, '计数只增不减')
  assert.ok(guard.egoUsed() >= 4, '单调读数')
  // 无 reset/clear/release 面：对象自身与原型链均无清零出口
  assert.equal(guard.reset, undefined, '无 reset 面')
  assert.equal(guard.clear, undefined, '无 clear 面')
  const ownAndProto = [...Object.keys(guard), ...Object.keys(Object.getPrototypeOf(guard) ?? {})]
  assert.equal(ownAndProto.some((key) => /reset|clear|release/i.test(key)), false, '键面无任何清零语义出口')
})

test('整链预算入口 chain()：到期 check() 抛、remaining 递减（K-6 预算面）', () => {
  let clock = 1000
  const guard = createGuard(Config.parse({ chainBudgetMs: 30000 }), { now: () => clock })
  const chain = guard.chain()
  try {
    assert.equal(chain.deadline, 31000)
    assert.equal(chain.remaining(), 30000)
    assert.doesNotThrow(() => chain.check(), '预算内不抛')
    clock += 29999
    assert.doesNotThrow(() => chain.check())
    clock += 1
    assert.throws(() => chain.check(), (error) => {
      assert.equal(error.code, CHAIN_BUDGET_CODE)
      assert.match(error.message, /预算熔断|整链预算/, '明示预算耗尽')
      assert.match(error.message, /30000/, '含预算值')
      return true
    })
  } finally {
    chain.dispose()
  }
})

test('chain signal 合成（W2-SIGNAL-DANGLING 消费缝）：外层中止传导、预算到期切断', async () => {
  const guard = createGuard(Config.parse({ chainBudgetMs: 30000 }))
  // 外层中止 → 合成 signal 中止
  const outer = new AbortController()
  const chain = guard.chain(outer.signal)
  assert.equal(chain.signal.aborted, false)
  outer.abort(new Error('外层取消'))
  assert.equal(chain.signal.aborted, true, '外层中止传导到合成 signal')
  chain.dispose()

  // 已中止的外层 signal → 合成 signal 即刻中止
  const pre = new AbortController()
  pre.abort(new Error('预先取消'))
  const chain2 = guard.chain(pre.signal)
  assert.equal(chain2.signal.aborted, true)
  chain2.dispose()

  // 预算到期 → 合成 signal 中止（真实 10ms 预算，等待 abort 事件）
  const guard2 = createGuard(Config.parse({ chainBudgetMs: 10 }))
  const chain3 = guard2.chain()
  await new Promise((resolve) => {
    chain3.signal.addEventListener('abort', resolve, { once: true })
  })
  assert.equal(chain3.signal.aborted, true, '预算到期切断在途')
  assert.equal(chain3.signal.reason.code, CHAIN_BUDGET_CODE)
  chain3.dispose()
})

test('createGuard 入参校验：config 键面非法即拒（K-9 单一事实源）', () => {
  assert.throws(() => createGuard(undefined), /config/)
  assert.throws(() => createGuard({ egoBudget: '15', chainBudgetMs: 30000 }), /egoBudget/)
  assert.throws(() => createGuard({ egoBudget: 15, chainBudgetMs: 0 }), /chainBudgetMs/)
  assert.throws(() => createGuard(Config.parse({}), { now: 'tick' }), /now/)
})

test('K-6 grep 断言：guard.js 与 aggregate.js 无无界 while / do 循环 / 递归重试结构', async () => {
  const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib')
  /** 花括号配平切出每个 function 的声明体（含声明行），供自递归检测。 */
  function functionBodies(source) {
    const out = []
    for (const m of source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
      let depth = 1
      let i = m.index + m[0].length
      while (depth > 0 && i < source.length) {
        const ch = source[i]
        if (ch === '{') depth += 1
        if (ch === '}') depth -= 1
        i += 1
      }
      out.push({ fn: m[1], body: source.slice(m.index, i) })
    }
    return out
  }
  for (const file of ['guard.js', 'aggregate.js']) {
    const source = await readFile(path.join(libDir, file), 'utf8')
    assert.doesNotMatch(source, /\bwhile\b/, `${file} 不得含 while 循环（K-6 无界循环面）`)
    assert.doesNotMatch(source, /\bdo\s*\{/, `${file} 不得含 do-while 循环（K-6）`)
    assert.doesNotMatch(source, /setInterval|arguments\.callee/, `${file} 不得含定时重试循环/自指调用（K-6）`)
    for (const { fn, body } of functionBodies(source)) {
      const selfCalls = [...body.matchAll(new RegExp(`(?<![.\\w$])${fn}\\s*\\(`, 'g'))].length - 1
      assert.equal(selfCalls, 0, `${file}: ${fn} 不得自我递归调用（K-6 递归重试面）`)
    }
  }
})
