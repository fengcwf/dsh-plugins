// lib/diagnostics.js — 诊断面（T13 / US-10/11/16，INV-14/15/20）
// 职责：本地自检清单（纯本地零出网）+ 单源探针 / 真联网测试（仅按钮触发，INV-14）+ 日志环与缓存面读清。
// 约定：
//   probe / online 直调源工厂 search（绕过缓存与 guard，task-A D16 形），超时走 Config.healthTimeoutMs；
//   online 总上限 10s（R30）：超预算源标注「未测（超时截断）」，绝不空等（逐源 Promise 竞速兜底）；
//   自检项形制 {id, label, status:'pass'|'fail', detail} + summary「N 项 · X 通过 / Y 失败」（rtk doctor 形）。
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'

import { assertPublicHttps } from './sources/common.js'

/** 真联网测试总上限（R30 拍板：10s；独立小上限，非 Config 管控键）。 */
export const ONLINE_TOTAL_BUDGET_MS = 10000

/** 探针查询词（无意义词；K-4：出网只发查询词与必要检索参数）。 */
const PROBE_QUERY = 'test'

/**
 * 创建诊断面。
 * @param {{config: object, validateConfig: Function, triggerLog: object, getGuard: () => object,
 *          clearCache: () => Promise<number>|number, sourcesById: () => Map<string, object>,
 *          hasWriteSeam: () => boolean}} deps
 * @returns {{selfCheck: Function, probe: Function, online: Function, logsView: Function,
 *            clearLogs: Function, clearCache: Function}}
 */
export function createDiagnostics(deps) {
  const { config, validateConfig, triggerLog, getGuard, sourcesById, hasWriteSeam } = deps
  const clearCacheImpl = deps.clearCache

  /** 本地自检（纯本地零出网，K-15）：逐项 {id,label,status,detail} + 汇总 + 运行时读数。 */
  async function selfCheck() {
    const items = []
    const add = (id, label, ok, detail) => items.push({ id, label, status: ok ? 'pass' : 'fail', detail: String(detail ?? '') })

    let configOk = false
    try {
      configOk = validateConfig(config) && validateConfig(config).success === true
    } catch {
      configOk = false
    }
    add('config', 'Config 可读且合法', configOk, configOk ? 'Config 复检通过' : 'Config 复检失败')

    const idMap = sourcesById()
    const priority = Array.isArray(config?.sources?.priority) ? config.sources.priority : []
    const unknown = priority.filter((id) => !idMap.has(id))
    const duplicated = priority.filter((id, index) => priority.indexOf(id) !== index)
    // 源表项（T10 补强：与 priority 项分立——源表可构造 ≠ 词表一致）
    add('sources', '源表可构造（内置+自定义）', idMap.size > 0,
      idMap.size > 0 ? `共 ${idMap.size} 源（内置四源 + 自定义）` : '无可用源')
    // priority 词表一致性项（R25 混排：未知/重复任一命中即 fail，不抛；未列入 priority 的开源由聚合器按序追加）
    add('priority', 'priority 词表一致（无未知无重复）', unknown.length === 0 && duplicated.length === 0,
      unknown.length > 0 ? `未知源：${unknown.join(',')}`
        : duplicated.length > 0 ? `重复源：${duplicated.join(',')}`
          : priority.length === idMap.size ? `priority ${priority.length} 项全排列一致`
            : `priority ${priority.length} 项 + ${idMap.size - priority.length} 源按序追加`)

    add('write-seam', '配置写缝（configEditor）在场', hasWriteSeam() === true, hasWriteSeam() ? '写路径可用' : '写缝缺位（只读如实）')

    let cacheOk = false
    let cacheDetail = ''
    try {
      const probeDir = await mkdtemp(path.join(config.cacheDir, '.selftest-'))
      await rm(probeDir, { recursive: true, force: true })
      cacheOk = true
      cacheDetail = '缓存目录可写（mkdtemp 探针已回收）'
    } catch (error) {
      cacheDetail = `缓存目录不可写：${error?.message ?? error}`
    }
    add('cache-dir', '缓存目录可写', cacheOk, cacheDetail)

    add('trigger-log', '触发日志内存环可用', triggerLog.available() === true,
      triggerLog.available() ? `环内 ${triggerLog.size()} 条 / 容量 ${triggerLog.capacity}` : '日志不可用（INV-13 明示）')

    let gateOk = false
    try {
      await assertPublicHttps('https://example.com/')
      await assertPublicHttps('http://example.com/').catch((error) => {
        if (error?.code !== 'BAD_TARGET') throw error
      })
      gateOk = true
    } catch {
      gateOk = false
    }
    add('outbound-gate', '出站门禁在位（INV-15）', gateOk, gateOk ? 'https 放行 / http 拒收' : '门禁行为异常')

    const passed = items.filter((item) => item.status === 'pass').length
    const guard = typeof getGuard === 'function' ? getGuard() : null
    return {
      items,
      summary: `${items.length} 项 · ${passed} 通过 / ${items.length - passed} 失败`,
      log: { available: triggerLog.available(), used: triggerLog.size(), capacity: triggerLog.capacity },
      ego: guard ? { used: guard.egoUsed(), limit: guard.egoLimit() } : { used: 0, limit: 0 },
      stats: triggerLog.stats(),
    }
  }

  /** 单源探针（INV-14 仅按钮）：绕过缓存与 guard，单源超时 = Config.healthTimeoutMs。 */
  async function probe(sourceId) {
    const started = Date.now()
    const source = sourcesById().get(String(sourceId))
    if (!source) return { source: String(sourceId), ok: false, elapsedMs: 0, resultCount: 0, detail: '未知源' }
    try {
      const result = await source.search(PROBE_QUERY, AbortSignal.timeout(config.healthTimeoutMs))
      const count = Array.isArray(result?.sources) ? result.sources.length : 0
      return { source: source.name, ok: true, elapsedMs: Date.now() - started, resultCount: count, detail: `命中 ${count} 条` }
    } catch (error) {
      return { source: source.name ?? String(sourceId), ok: false, elapsedMs: Date.now() - started, resultCount: 0, detail: String(error?.code ?? error?.message ?? 'probe failed') }
    }
  }

  /** 真联网测试（R30）：按 priority 序串行，总上限（缺省 10s）；超预算源标注「未测（超时截断）」不空等。 */
  async function online({ budgetMs } = {}) {
    const totalBudget = Number.isInteger(budgetMs) && budgetMs > 0 ? budgetMs : ONLINE_TOTAL_BUDGET_MS
    const started = Date.now()
    const deadline = started + totalBudget
    const results = []
    let truncated = false
    for (const [id, source] of sourcesById()) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        truncated = true
        results.push({ source: id, ok: false, elapsedMs: 0, resultCount: 0, detail: '未测（超时截断）' })
        continue
      }
      const budget = Math.min(config.healthTimeoutMs, remaining)
      const attemptStarted = Date.now()
      let settled
      try {
        settled = await Promise.race([
          source.search(PROBE_QUERY, AbortSignal.timeout(budget)).then(
            (result) => ({ ok: true, count: Array.isArray(result?.sources) ? result.sources.length : 0 }),
            (error) => ({ ok: false, detail: String(error?.code ?? error?.message ?? 'probe failed') }),
          ),
          new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ ok: false, timeout: true }), budget)
            if (typeof timer.unref === 'function') timer.unref()
          }),
        ])
      } catch (error) {
        settled = { ok: false, detail: String(error?.message ?? 'probe failed') }
      }
      const elapsedMs = Date.now() - attemptStarted
      if (settled.timeout) {
        truncated = true
        results.push({ source: id, ok: false, elapsedMs, resultCount: 0, detail: '未测（超时截断）' })
      } else if (settled.ok) {
        results.push({ source: id, ok: true, elapsedMs, resultCount: settled.count, detail: `命中 ${settled.count} 条` })
      } else {
        results.push({ source: id, ok: false, elapsedMs, resultCount: 0, detail: settled.detail })
      }
    }
    return { results, totalMs: Date.now() - started, truncated, budgetMs: totalBudget }
  }

  /** 日志环读面：环不可用抛 503 logs_unavailable（INV-13 如实）。 */
  function logsView() {
    if (!triggerLog.available()) {
      const error = new Error('日志不可用（内存环写失败，INV-13）')
      error.code = 'logs_unavailable'
      error.status = 503
      throw error
    }
    return { entries: triggerLog.list(), capacity: triggerLog.capacity, enabled: true, available: true }
  }

  function clearLogs() {
    return { cleared: triggerLog.clear() }
  }

  async function clearCache() {
    const cleared = await clearCacheImpl()
    return { cleared: typeof cleared === 'number' ? cleared : 0 }
  }

  return { selfCheck, probe, online, logsView, clearLogs, clearCache }
}
