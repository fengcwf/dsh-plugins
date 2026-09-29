// load-state — S2 加载状态机（delta-specs/ui-ca-wave.md S2 节 + 用户定稿 3：idle/loading/timeout/error，
// 8 秒固定超时→可解释错误态+重试；设计正本 candidate-a.md 6，根因证据 p8-r3c-repro.md §3/§7 A5）。
// 纯模块纪律：计时器注入（测试假时钟勿真等 8s）、请求身份（attempt 单调递增，旧响应不得覆盖新状态）、
// 超时/中止错误分类（api.js 的 8s AbortController 中止以 TimeoutError 形上抛，本模块归一族）。

/** 8 秒固定超时（用户定稿：不做设置项）——api.js 中止阈值与状态机升级阈值同源 */
export const LOAD_TIMEOUT_MS = 8000

/** 状态机初值（idle=无在途加载/已就绪） */
export const LOAD_INITIAL = Object.freeze({ status: 'idle', path: '', message: '', attempt: 0 })

/** 超时/中止族错误判定（api.js 超时中止抛 name='TimeoutError'；fetch 原生中止为 AbortError） */
export function isTimeoutError(err) {
  const name = err?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/**
 * 状态机展示面（.vue 只消费此模型）：
 *   busy=贴布局骨架（Loading）；failed=可解释错误卡（kind 对应 ui-base.stateErrorModel：timeout|load）。
 */
export function loadView(state) {
  const s = state ?? LOAD_INITIAL
  const failed = s.status === 'timeout' || s.status === 'error'
  return {
    status: s.status,
    busy: s.status === 'loading',
    failed,
    kind: s.status === 'timeout' ? 'timeout' : s.status === 'error' ? 'load' : 'notice',
    path: String(s.path ?? ''),
    message: String(s.message ?? ''),
  }
}

/**
 * 加载控制器（idle→loading→timeout|error→retry 环；test/web-load-state.test.mjs 假时钟锁形）：
 *   run(path, task) → Promise<{status:'ok'|'error'|'timeout'|'stale', value?, message?}>
 *     - loading 即置；8 秒计时（setTimer/clearTimer 注入，缺省宿主）到期：**即使 task 未落定**
 *       也升级 timeout 态（busy 复位，出 StateError timeout 形+重试）——A5 ②；
 *     - task 先落定：ok→idle；超时族错误→timeout；其余错误→error（message 如实）；
 *     - 请求身份（A5 ①）：attempt 单调递增；新 run 顶掉旧 attempt，旧 attempt 的迟到响应
 *       一律 {status:'stale'} 丢弃，绝不覆盖新状态。
 *   retry() → 重新发起上一次 task（A5 ③：读取面=fetchFile+fetchBacklinks 两条请求重发，幂等）。
 *   dispose() → 清计时并了结在途（组件卸载防悬挂）。
 */
export function createLoadController({ onState = () => {}, setTimer, clearTimer, timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  const schedule = setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = clearTimer ?? ((t) => clearTimeout(t))
  let state = LOAD_INITIAL
  let seq = 0 // 请求身份计数（单调递增）
  let last = null // { path, task }（retry 数据面）
  let active = null // { id, path, timer, resolve }（在途 attempt；null=无）

  const setState = (next) => {
    state = next
    onState(next)
  }

  /** 了结 attempt 的计时与在途位（幂等；返回是否本 attempt 在途） */
  function endAttempt(attempt) {
    if (active !== attempt) return false
    active = null
    if (attempt.timer != null) {
      cancel(attempt.timer)
      attempt.timer = null
    }
    return true
  }

  function finish(attempt, result) {
    if (!endAttempt(attempt)) return // 迟到响应（旧请求）：丢弃，不覆盖新状态（请求身份）
    const base = { path: attempt.path, attempt: attempt.id }
    if (result.status === 'ok') setState({ ...base, status: 'idle', message: '' })
    else if (result.status === 'timeout') setState({ ...base, status: 'timeout', message: '' })
    else setState({ ...base, status: 'error', message: result.message })
    attempt.resolve(result)
  }

  function run(path, task) {
    last = { path, task }
    if (active) {
      // 新请求接管：旧 attempt 立即失效并结算 'stale'（其迟到落定走 finish 丢弃分支）
      const prev = active
      endAttempt(prev)
      prev.resolve({ status: 'stale' })
    }
    const attempt = { id: ++seq, path: String(path ?? ''), timer: null, resolve: null }
    active = attempt
    setState({ status: 'loading', path: attempt.path, message: '', attempt: attempt.id })
    return new Promise((resolve) => {
      attempt.resolve = resolve
      attempt.timer = schedule(() => {
        if (!endAttempt(attempt)) return
        setState({ status: 'timeout', path: attempt.path, message: '', attempt: attempt.id })
        resolve({ status: 'timeout' })
      }, timeoutMs)
      Promise.resolve()
        .then(() => task())
        .then(
          (value) => finish(attempt, { status: 'ok', value }),
          (err) => finish(
            attempt,
            isTimeoutError(err)
              ? { status: 'timeout' }
              : { status: 'error', message: String(err?.message ?? err) },
          ),
        )
    })
  }

  return {
    run,
    retry: () => (last ? run(last.path, last.task) : Promise.resolve({ status: 'stale' })),
    getState: () => state,
    dispose: () => {
      if (active) {
        const cur = active
        endAttempt(cur)
        cur.resolve({ status: 'stale' })
      }
    },
  }
}
