// lib/guard.js — 预算熔断单调守卫（Task 11；K-6 / INV-6）
//
// 语义（INV-6 / ERR-005 教训）：
// - ego-browser 兜底计数：任务级、严格单调递增（仅增不减、无 reset 面——任何路径不可清零绕过熔断），
//   每次 spendEgo() 调用即计数（含熔断后的调用——防「catch 后重试」套利），超过预算即抛明确错误，
//   文案含「预算熔断」与预算值；
// - 整链预算入口（chain）：每次检索一个预算作用域，承载 chainBudgetMs（默认 30000，K-9 从 Config 读）
//   的 deadline/check()/signal 三面；signal = 外层 signal 与预算到期的合成 AbortSignal
//   （W2-SIGNAL-DANGLING 的消费缝：外层取消传导、预算到期切断在途）。
// 实现内无无界循环与自递归（K-6 grep 判据）。

/** ego 兜底预算熔断错误码。 */
export const EGO_BUDGET_CODE = 'EGO_BUDGET_EXHAUSTED'
/** 整链预算耗尽错误码。 */
export const CHAIN_BUDGET_CODE = 'CHAIN_BUDGET_EXHAUSTED'

const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/**
 * 创建预算熔断守卫。
 * @param {{egoBudget: number, chainBudgetMs: number}} config - Config.parse 产物子集
 *   （egoBudget 默认 15、chainBudgetMs 默认 30000，K-9 单一事实源=Config schema 默认值）。
 * @param {{now?: () => number}} [options] - 时钟注入（测试用）。
 * @returns {{spendEgo: Function, egoUsed: Function, egoRemaining: Function, egoLimit: Function,
 *   chain: (signal?: AbortSignal) => {deadline: number, remaining: Function, check: Function,
 *   signal: AbortSignal, dispose: Function}}}
 */
export function createGuard(config, options = {}) {
  if (!config || typeof config !== 'object') {
    throw new TypeError(`createGuard: config 必须是 Config.parse 产物，got ${typeName(config)}`)
  }
  if (!Number.isInteger(config.egoBudget) || config.egoBudget < 0) {
    throw new TypeError('createGuard: config.egoBudget 必须是非负整数（来自 Config，K-9）')
  }
  if (!Number.isInteger(config.chainBudgetMs) || config.chainBudgetMs < 1) {
    throw new TypeError('createGuard: config.chainBudgetMs 必须是正整数（来自 Config，K-9）')
  }
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  if (options.now !== undefined && typeof options.now !== 'function') {
    throw new TypeError('createGuard: now 若在场必须是函数')
  }

  /** 任务级 ego 计数：闭包持有、仅增不减、无任何 reset 出口（单调性=熔断不可绕过）。 */
  let used = 0

  function egoBudgetError(usedCount) {
    const error = new Error(
      `预算熔断：ego-browser 兜底预算耗尽（上限 ${config.egoBudget} 次，已用 ${usedCount} 次）——` +
        '不再执行兜底调用，请向用户明示（K-6/INV-6）',
    )
    error.code = EGO_BUDGET_CODE
    error.budget = config.egoBudget
    return error
  }

  function chainBudgetError() {
    const error = new Error(
      `预算熔断：整链预算 ${config.chainBudgetMs}ms 耗尽——不再发起新源请求，请降级或向用户明示（K-6）`,
    )
    error.code = CHAIN_BUDGET_CODE
    error.budget = config.chainBudgetMs
    return error
  }

  return {
    /**
     * 花费一次 ego-browser 兜底额度：计数先增后判（熔断后的调用同样计数，防重试套利）。
     * INV-20 接线：strategy.js 的 ego 兜底引导块输出缝复用本计数（语义=引导次数，R33 拍板），
     * 超预算抛出由缝内 catch 承接（引导块不被熔断拦住）——本函数与 K-6 熔断面语义不变（单调、超限抛）。
     * @returns {number} 本次调用后的已用次数。
     * @throws {Error} 超预算时抛（code=EGO_BUDGET_EXHAUSTED，文案含预算熔断与预算值）。
     */
    spendEgo() {
      used += 1
      if (used > config.egoBudget) throw egoBudgetError(used)
      return used
    },
    /** 已用次数（单调读数）。 */
    egoUsed: () => used,
    /** 剩余额度（不为负）。 */
    egoRemaining: () => Math.max(0, config.egoBudget - used),
    /** 预算上限（Config 读数）。 */
    egoLimit: () => config.egoBudget,

    /**
     * 每次检索的整链预算入口：deadline / check() / 合成 signal 三面。
     * @param {AbortSignal} [outerSignal] - 外层取消信号（与预算到期合成，传导给在途源调用）。
     * @returns {{deadline: number, remaining: Function, check: Function, signal: AbortSignal, dispose: Function}}
     */
    chain(outerSignal) {
      const startAt = now()
      const deadline = startAt + config.chainBudgetMs
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(chainBudgetError()), Math.max(0, deadline - now()))
      if (typeof timer.unref === 'function') timer.unref()
      const onOuterAbort = () => controller.abort(outerSignal.reason)
      if (outerSignal) {
        if (outerSignal.aborted) controller.abort(outerSignal.reason)
        else outerSignal.addEventListener('abort', onOuterAbort, { once: true })
      }
      return {
        deadline,
        remaining: () => deadline - now(),
        /** 预算判据：到期即抛（调用方在发起新请求前调用）。 */
        check() {
          if (now() >= deadline) throw chainBudgetError()
        },
        /** 合成 signal：预算到期或外层中止即 aborted（传给聚合器/源调用）。 */
        signal: controller.signal,
        /** 释放定时器与外层监听（成对回收）。 */
        dispose() {
          clearTimeout(timer)
          if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
        },
      }
    },
  }
}
