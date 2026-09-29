// S2 加载状态机单测（delta-specs/ui-ca-wave.md S2 节 + p8-r3c-repro.md A5）：
//   ① idle→loading→timeout(8s)→error→retry 全流转（假时钟注入，勿真等 8s）；
//   ② 8 秒到期即使 Promise 未落定也复位 busy 并升级可解释超时态（A5 ②）；
//   ③ 请求身份：旧请求迟到响应不得覆盖新状态（A5 ①）；
//   ④ retry=重新发起（幂等）；超时族错误（TimeoutError/AbortError）归 timeout 态。
// 纯模块被测对象：web/src/lib/load-state.js（计时器注入面=测试假时钟）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LOAD_TIMEOUT_MS, LOAD_INITIAL, isTimeoutError, loadView, createLoadController,
} from '../web/src/lib/load-state.js'

/** 假时钟（注入 setTimer/clearTimer）：记录 delay、手动 fire，零真实等待 */
function makeClock() {
  let seq = 0
  const timers = new Map()
  const delays = []
  return {
    set: (fn, ms) => {
      const id = ++seq
      timers.set(id, { fn, ms })
      delays.push(ms)
      return id
    },
    clear: (id) => {
      timers.delete(id)
    },
    fire: () => {
      for (const [id, t] of [...timers]) {
        timers.delete(id)
        t.fn()
      }
    },
    pending: () => timers.size,
    delays: () => delays,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const withClock = () => {
  const clock = makeClock()
  const states = []
  const ctl = createLoadController({
    onState: (s) => states.push({ ...s }),
    setTimer: clock.set,
    clearTimer: clock.clear,
  })
  return { clock, states, ctl }
}

test('8 秒固定超时=8000ms 唯一源（用户定稿：不做设置项）+ 初值 idle', () => {
  assert.equal(LOAD_TIMEOUT_MS, 8000)
  assert.deepEqual({ ...LOAD_INITIAL }, { status: 'idle', path: '', message: '', attempt: 0 })
  const v = loadView(LOAD_INITIAL)
  assert.equal(v.busy, false)
  assert.equal(v.failed, false)
})

test('状态机全流转 idle→loading→timeout(8s)→(retry)loading→error→retry→loading→idle（假时钟）', async () => {
  const { clock, states, ctl } = withClock()
  assert.equal(ctl.getState().status, 'idle', '初始 idle')
  let calls = 0
  const task = () => {
    calls += 1
    if (calls === 1) return new Promise(() => {}) // 永不落定（P8-1「一直加载中」形）
    if (calls === 2) return Promise.reject(new Error('HTTP 500'))
    return Promise.resolve('ok-value')
  }

  const p1 = ctl.run('notes/a.md', task)
  assert.equal(ctl.getState().status, 'loading')
  assert.equal(clock.delays()[0], 8000, '计时器按 8000ms 注入（假时钟记录，非真等）')
  clock.fire() // 8 秒到期
  const r1 = await p1
  assert.equal(r1.status, 'timeout', '挂起请求 8 秒升级 timeout')

  const r2 = await ctl.retry() // retry #1 → 第二次调用失败
  assert.equal(r2.status, 'error')
  assert.equal(r2.message, 'HTTP 500')

  const r3 = await ctl.retry() // retry #2 → 成功
  assert.equal(r3.status, 'ok')
  assert.equal(r3.value, 'ok-value')

  assert.equal(calls, 3, '每次 run/retry 都重新发起 task')
  assert.deepEqual(states.map((s) => s.status), [
    'loading', 'timeout', 'loading', 'error', 'loading', 'idle',
  ], 'idle→loading→timeout(8s)→error→retry→loading→idle 全流转')
})

test('A5 ②：8 秒到期即使 Promise 未落定也复位 busy 并出可解释超时态（kind=timeout，可重试）', async () => {
  const { clock, states, ctl } = withClock()
  const p = ctl.run('notes/a.md', () => new Promise(() => {}))
  clock.fire()
  const r = await p
  assert.equal(r.status, 'timeout')
  const v = loadView(ctl.getState())
  assert.equal(v.busy, false, 'busy 同步复位（不再无限加载）')
  assert.equal(v.failed, true)
  assert.equal(v.kind, 'timeout', 'StateError timeout 形（含「8 秒」文案+重试插槽）')
  assert.equal(v.path, 'notes/a.md')
  assert.equal(clock.pending(), 0, '计时已了结')
  assert.deepEqual(states.map((s) => s.status), ['loading', 'timeout'])
})

test('A5 ① 请求身份：旧请求迟到响应一律 stale 丢弃，不得覆盖新状态', async () => {
  const { clock, states, ctl } = withClock()
  const dA = deferred()
  const dB = deferred()
  const pA = ctl.run('notes/a.md', () => dA.promise)
  const pB = ctl.run('notes/b.md', () => dB.promise)

  const rA = await pA
  assert.equal(rA.status, 'stale', '被顶掉的旧请求立即结算 stale')
  const countAfterSupersede = states.length

  dA.resolve('old-value') // 旧请求迟到落定
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(states.length, countAfterSupersede, '旧响应零状态写入')
  assert.equal(ctl.getState().status, 'loading', '新请求的 loading 不被旧响应打断')
  assert.equal(ctl.getState().path, 'notes/b.md')

  dB.resolve('new-value')
  const rB = await pB
  assert.equal(rB.status, 'ok')
  assert.equal(rB.value, 'new-value')
  assert.equal(ctl.getState().status, 'idle')
})

test('超时族错误（TimeoutError/AbortError=api.js 8s 中止上抛）归 timeout 态；其余错误归 error 且 message 如实', async () => {
  const { clock, ctl } = withClock()
  const timeoutErr = Object.assign(new Error('请求超时：8 秒内未收到响应'), { name: 'TimeoutError' })
  const r1 = await ctl.run('a', () => Promise.reject(timeoutErr))
  assert.equal(r1.status, 'timeout')
  assert.equal(ctl.getState().status, 'timeout')
  assert.equal(clock.pending(), 0)

  const r2 = await ctl.run('a', () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  assert.equal(r2.status, 'timeout')

  const r3 = await ctl.run('a', () => Promise.reject(new Error('HTTP 404')))
  assert.equal(r3.status, 'error')
  assert.equal(r3.message, 'HTTP 404')
  assert.equal(ctl.getState().status, 'error')
  assert.equal(loadView(ctl.getState()).kind, 'load')
  assert.ok(isTimeoutError(timeoutErr) && isTimeoutError({ name: 'AbortError' }))
  assert.equal(isTimeoutError(new Error('x')), false)
})

test('timeout 态保持到重试：迟到落定（含成功）不再翻态；retry=新 attempt 重新发起并采纳其结果', async () => {
  const { clock, states, ctl } = withClock()
  const d = deferred()
  let calls = 0
  const task = () => {
    calls += 1
    return calls === 1 ? d.promise : Promise.resolve('retry-value')
  }
  const p = ctl.run('a', task)
  clock.fire()
  await p
  const count = states.length

  d.resolve('late-success') // 迟到成功同样丢弃（api 8s 中止后不可达，防御性锁形）
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(ctl.getState().status, 'timeout', '超时态不被迟到响应改写')
  assert.equal(states.length, count)

  const r = await ctl.retry() // 新 attempt 重新发起
  assert.equal(r.status, 'ok')
  assert.equal(r.value, 'retry-value')
  assert.equal(calls, 2, 'retry 幂等重新发起 task')
  assert.equal(ctl.getState().status, 'idle')
})

test('无历史 task 的空 retry 安全结算 stale（树初载前点重试不炸）', async () => {
  const { ctl } = withClock()
  assert.equal((await ctl.retry()).status, 'stale')
})

test('loadView 展示面映射：idle/loading/timeout/error → busy/failed/kind', () => {
  assert.deepEqual(
    [loadView({ status: 'idle' }).busy, loadView({ status: 'loading' }).busy],
    [false, true],
  )
  const t = loadView({ status: 'timeout', path: 'p' })
  assert.deepEqual([t.failed, t.kind, t.path], [true, 'timeout', 'p'])
  const e = loadView({ status: 'error', message: 'm' })
  assert.deepEqual([e.failed, e.kind, e.message], [true, 'load', 'm'])
})

test('dispose 了结在途计时（组件卸载防悬挂），在途 run 结算 stale', async () => {
  const { clock, ctl } = withClock()
  const p = ctl.run('a', () => new Promise(() => {}))
  assert.equal(clock.pending(), 1)
  ctl.dispose()
  assert.equal(clock.pending(), 0)
  assert.equal((await p).status, 'stale')
})
