// lib/aggregate.js — 多源聚合器（Task 10；US-2/US-4，INV-1/INV-4/INV-5，K-1/K-4/K-5/K-6）
//
// 消费面（W3 既定接口）：source = {name, enabled, search(query, signal) → {sources:[{url,title,snippet,publishedAt?}]}}。
// 执行流：priority 序（Config.sources.priority）过滤已开源 → 缓存查（键=查询词+源名）→ 源调用
// （只传 query + signal，出网 payload 面在 W3 源层已守 K-4）→ 成功 clamp 1-10 收口；
// 错误经 ratelimit.classifyBlock 分类：命中即停类目（202/挑战页/验证码页/异常页）立即收口明示错误
// （不重试、不切换源，INV-5）；普通失败记入逐源失败记录后切换下一家（US-2）。
// 整链预算（K-6）：chainBudgetMs 到期后不再发起新源请求；在途请求经合成 signal 切断。
// 失败 outcome 带 blocks（ContentBlock[]，K-1）：全源失败/命中即停/预算耗尽三类明示块，含逐源
// 失败原因与发生时间（US-4：LLM 据此降级 web_fetch → ego-browser）。
import { CHAIN_BUDGET_CODE } from './guard.js'
import { classifyBlock, isBlockedError, toBlockedError } from './ratelimit.js'

const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/** 失败记录：逐源留痕（US-4 错误块内容面）。 */
function failureRecord(sourceName, error, now) {
  return {
    source: sourceName,
    code: typeof error.code === 'string' ? error.code : (error.name || 'SOURCE_FAILED'),
    reason: String(error.message || error),
    at: new Date(now()).toISOString(),
  }
}

/**
 * 跨源 URL 去重（US-15 / R27）：完整 URL 字符串相等判重——不做同域名合并；仅大小写或末尾斜杠
 * 差异的 URL 不合并。保留收集序中首个出现者：收集序 = 优先级序（orderedSources），故先出现者
 * 即优先级高者那条（R27 拍板）。被去重条目不计 resultCount（clamp 在去重之后，配额让给真正不同的结果）。
 * @param {Array<{url: string}>} items - 收集序条目（高优先在前）。
 * @returns {Array<{url: string}>} 去重后列表（原序、条目同引用）。
 */
export function dedupeByUrl(items) {
  const seenUrls = new Set()
  const distinct = []
  for (const item of items) {
    const url = item && typeof item.url === 'string' ? item.url : ''
    if (url.length === 0 || seenUrls.has(url)) continue
    seenUrls.add(url)
    distinct.push(item)
  }
  return distinct
}

/** 失败块渲染（K-1 载体）：单 text 块，含逐源原因 + 发生时间 + 降级建议。 */
function renderFailureBlocks(headline, failures, advice) {
  const lines = [headline]
  if (failures.length > 0) {
    lines.push('逐源失败记录（含发生时间）：')
    for (const failure of failures) {
      lines.push(`- ${failure.source}：${failure.reason}（${failure.at}，code=${failure.code}）`)
    }
  }
  lines.push(advice)
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * 创建聚合器。
 * @param {object} config - Config.parse 产物（sources 组 / maxResults / chainBudgetMs，K-9 单一事实源）。
 * @param {Array<{name: string, enabled: boolean, search: Function}>} sourceList - W3 统一源形。
 * @param {{cache?: {get: Function, set: Function}, now?: () => number}} [options] - 缓存与时钟注入。
 * @returns {{aggregate: (query: string, signal?: AbortSignal) => Promise<object>}}
 */
export function createAggregator(config, sourceList, options = {}) {
  if (!config || typeof config !== 'object' || !config.sources || !Array.isArray(config.sources.priority)) {
    throw new TypeError('createAggregator: config 需要 Config.parse 产物（含 sources.priority）')
  }
  if (!Number.isInteger(config.maxResults) || !Number.isInteger(config.chainBudgetMs)) {
    throw new TypeError('createAggregator: config 缺 maxResults/chainBudgetMs 数值键（K-9）')
  }
  if (!Array.isArray(sourceList)) {
    throw new TypeError(`createAggregator: sourceList 必须是数组，got ${typeName(sourceList)}`)
  }
  const cache = options.cache ?? null
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  if (options.cache !== undefined && (cache === null || typeof cache.get !== 'function' || typeof cache.set !== 'function')) {
    throw new TypeError('createAggregator: cache 若在场必须带 get/set')
  }
  if (options.now !== undefined && typeof options.now !== 'function') {
    throw new TypeError('createAggregator: now 若在场必须是函数')
  }

  /** 执行序：priority 驱动；未列入 priority 的已开源追加在后（防御形）。 */
  function orderedSources() {
    const byName = new Map(sourceList.map((source) => [source.name, source]))
    const seen = new Set()
    const ordered = []
    for (const id of config.sources.priority) {
      const source = byName.get(id)
      if (!source || seen.has(id)) continue
      seen.add(id)
      ordered.push(source)
    }
    for (const source of sourceList) {
      if (!seen.has(source.name)) {
        seen.add(source.name)
        ordered.push(source)
      }
    }
    return ordered.filter((source) => source.enabled !== false && config.sources[source.name] !== false)
  }

  /**
   * 执行一次聚合检索。
   * @param {string} query - 查询词（出网只传本参数，K-4）。
   * @param {AbortSignal} [signal] - 外层取消信号（W2-SIGNAL-DANGLING 接通点：与预算信号合成后
   *   传入每源 search）。
   * @returns {Promise<object>} 成功 {ok:true, result:{sources, truncated}, sources, truncated, failures, fromCache}
   *   （result=seam 封闭形 [sources, truncated]，W4-OUTCOME-ADAPTER；扁平键为兼容别名）；
   *   失败 {ok:false, reason, failures, blocks, error}（blocks=ContentBlock[] 明示错误块，K-1）。
   */
  async function aggregate(query, signal, hooks = {}) {
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new TypeError('aggregate: query 必须是非空字符串')
    }
    /** 逐源事件旁路面（T13 埋点：喂 trigger-log 逐源耗时/成败；钩子异常绝不炸主链）。 */
    const emitSource = (payload) => {
      if (!hooks || typeof hooks.onSourceEvent !== 'function') return
      try {
        hooks.onSourceEvent(payload)
      } catch { /* 日志旁路面 fail-open */ }
    }
    const trimmed = query.trim()
    const startAt = now()
    const deadline = startAt + config.chainBudgetMs
    const failures = []

    // 预算权威统一（W5-BUDGET-RACE 关闭 / Ruling-14）：guard.chain 的合成 signal 是唯一预算定时权威
    // （其中止原因 code=CHAIN_BUDGET_EXHAUSTED）；本函数不再自置预算定时器——只保留 deadline 前置
    // 时间检查让位（无 guard 信号的裸调用路径）与「预算耗尽 → 明示块」收口（Ruling-7 对预算类可达）。
    const budgetError = Object.assign(
      new Error(`dsh-clsh-search: 整链预算 ${config.chainBudgetMs}ms 耗尽（K-6）`),
      { code: CHAIN_BUDGET_CODE },
    )
    /** 预算耗尽判定：错误本体带码，或合成/外层 signal 的中止原因带码（guard 定时权威面）。 */
    const budgetExhausted = (error) =>
      Boolean(error && error.code === CHAIN_BUDGET_CODE)
      || Boolean(signal && signal.aborted && signal.reason && signal.reason.code === CHAIN_BUDGET_CODE)

    const budgetOutcome = (cause) => ({
      ok: false,
      reason: 'chain-budget',
      failures,
      blocks: renderFailureBlocks(
        `搜索链路未产出结果：整链预算 ${config.chainBudgetMs}ms 耗尽，已停止发起新源请求（K-6）。`,
        failures,
        '建议降级：web_fetch 定点抓取 → ego-browser 兜底（工具调用顺序策略）。',
      ),
      error: cause && cause.code === CHAIN_BUDGET_CODE ? cause : budgetError,
    })

    // 源调用信号（K-4 契约形恒为 AbortSignal）：外层 signal 在场则合成跟随（AbortSignal.any 内部
    // 托管，无监听器回收面）；缺席给独立信号。预算/取消中止经外层 signal 传导进合成信号切断在途。
    const sourceSignal = signal ? AbortSignal.any([signal]) : new AbortController().signal

    for (const source of orderedSources()) {
      // 预算耗尽收口明示块（Ruling-7/Ruling-14）；用户取消仍上抛（协作取消语义，不吞成普通失败）
      if (signal && signal.aborted) {
        if (budgetExhausted()) return budgetOutcome(signal.reason ?? budgetError)
        throw signal.reason ?? new Error('aggregate: aborted')
      }
      if (now() >= deadline) return budgetOutcome(budgetError)

        // 缓存查（键=查询词+源名；仅缓存非空结果，防挑战页空集污染）
        // 缓存查（键=查询词+源名；仅缓存非空结果）。best-effort（W4-CACHE-FAIL-OPEN）：
        // 读写故障静默降级为无缓存，绝不炸掉检索主流程。
        if (cache) {
          let cached
          try {
            cached = await cache.get(trimmed, source.name)
          } catch {
            cached = undefined
          }
          if (cached) {
            // 防御性同口径（US-15 单点守卫）：去重上线前写入的旧缓存条目可能含重复——读面同样去重
            const clamped = dedupeByUrl(cached.sources).slice(0, config.maxResults)
            // W4-CACHE-TRUNCATED-LOST 关闭：缓存随读返回原始截断标志，二次查询 truncated 不丢
            const truncated = Boolean(cached.truncated)
            return {
              ok: true,
              result: { sources: clamped, truncated },
              sources: clamped,
              truncated,
              failures,
              fromCache: true,
            }
          }
        }

        let result
        const attemptStarted = now()
        try {
          result = await source.search(trimmed, sourceSignal)
          emitSource({ name: source.name, elapsedMs: now() - attemptStarted, ok: true })
        } catch (error) {
          emitSource({ name: source.name, elapsedMs: now() - attemptStarted, ok: false, code: error && error.code ? String(error.code) : undefined })
          // 预算耗尽收口明示块（Ruling-7/Ruling-14）：CHAIN_BUDGET_EXHAUSTED 不裸抛
          if (budgetExhausted(error)) {
            return budgetOutcome(error.code === CHAIN_BUDGET_CODE ? error : (signal.reason ?? budgetError))
          }
          // 用户取消优先上抛（协作取消语义，不吞成普通失败）
          if (signal && signal.aborted) throw (signal.reason ?? new Error('aggregate: aborted'))
          // 命中即停类目：不重试、不切换源（INV-5）
          if (isBlockedError(error)) {
            return {
              ok: false,
              reason: 'blocked',
              failures,
              blocks: renderFailureBlocks(
                error.message,
                failures,
                '命中即停：不重试、不再切换源。请降级 web_fetch 定点抓取或按顺序策略转 ego-browser/人工处理。',
              ),
              error,
            }
          }
          const classification = classifyBlock({ status: error.status, body: error.body })
          if (classification.blocked) {
            const blockedError = toBlockedError(classification, { source: source.name, status: error.status })
            return {
              ok: false,
              reason: 'blocked',
              failures,
              blocks: renderFailureBlocks(
                blockedError.message,
                failures,
                '命中即停：不重试、不再切换源。请降级 web_fetch 定点抓取或按顺序策略转 ego-browser/人工处理。',
              ),
              error: blockedError,
            }
          }
          // 普通失败：记录后切换下一家（US-2）
          failures.push(failureRecord(source.name, error, now))
          continue
        }

        const rawSources = Array.isArray(result && result.sources) ? result.sources : []
        const usable = rawSources.filter((item) => item && typeof item.url === 'string' && item.url.length > 0)
        if (usable.length === 0) {
          // W4-EMPTY-CUTOFF 关闭：单源 0 条=无产出，继续下一家（空集不缓存、不算失败）
          continue
        }
        // 跨源 URL 去重（US-15/R27）：收口前单点生效——完整字符串相等判重、保留优先级高者
        // （收集序=优先级序）；被去重条目不计 resultCount（clamp 在去重之后）。
        const distinct = dedupeByUrl(usable)
        const clamped = distinct.slice(0, config.maxResults)
        const truncated = distinct.length > config.maxResults
        if (cache) {
          // best-effort（W4-CACHE-FAIL-OPEN）：缓存写故障（同步/异步抛）不影响已成功结果
          try {
            await cache.set(trimmed, source.name, { sources: clamped, truncated })
          } catch {
            // 降级为不缓存
          }
        }
        return {
          ok: true,
          // W4-OUTCOME-ADAPTER 关闭：result=seam 封闭形 [sources, truncated]（接线适配点，测试锁定）；
          // 扁平 sources/truncated 为兼容别名（t15 接线 lib/index.js 不在本卡面，Ruling-7 语义不破）
          result: { sources: clamped, truncated },
          sources: clamped,
          truncated,
          failures,
          fromCache: false,
        }
      }
      if (failures.length === 0) {
        // W4-EMPTY-CUTOFF 关闭：全源皆空（零失败）才收空结果块（渲染面 = No results found.）
        return {
          ok: true,
          result: { sources: [], truncated: false },
          sources: [],
          truncated: false,
          failures,
          fromCache: false,
        }
      }
      return {
        ok: false,
        reason: 'all-failed',
        failures,
        blocks: renderFailureBlocks(
          '搜索链路失败：全部源未产出结果（已停止自动重试）。',
          failures,
          '建议降级：web_fetch 定点抓取 → ego-browser 兜底（工具调用顺序策略）。',
        ),
        error: new Error('dsh-clsh-search: all sources failed'),
      }
  }

  return { aggregate }
}
