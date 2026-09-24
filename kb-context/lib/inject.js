// inject — kb-context pre-step 注入体 + 三件套去重 + fail-open（T5）
// 职责边界：注入体构造（<kb-context> 转义/出处/禁 model）、可见面 SHA-1 去重（纯函数 + 可注入观察器）、
// 同 turn 一次 + 同 query 10s 去重、AbortSignal.any 超时 fail-open、trigger→search→注入接线体。
// 触发判定归 lib/trigger.js（T4，经 matchTrigger 缝消费）；检索归 lib/search.js（T3，经 search 缝消费）；
// 索引库归 lib/index-db.js（T2）——本文件不碰索引。
// ⚠️ 官方姿势（dsh-time-context 范式，delta-spec §2）：先 `const decision = await next()`；
//   `decision.kind !== 'enter'` 早退原样返回；命中 `return {...decision, messages:[...decision.messages, 注入消息]}`；
//   注册 `{prepend:true}`（在 lib/index.js apply）。外层 signal 预中止按官方姿势原样返回（取消≠超时）。
// ⚠️ INV-5 防回归（ERR [2026-09-17]）：注入消息禁带 model 字段——键集由 buildInjectionInput 精确闭合，
//   且 createUserMessage 缝产物若夹带 model 一律拒收（注入体带 model 必须拒，不进会话）。
// ⚠️ INV-11 注入防伪造：片段文本 `<`→字面序列 `\u003c`（六字符，非真实 '<'）——伪闭合/开标签失去结构；
//   source 属性值再加 `"`→`\u0022`（safeLabelValue 口径，防属性逃逸）。
// ⚠️ timeoutMs:0（及负/非数）语义 = 立即超时而非不限时（与 T3 search 同语义）：不检索、fail-open 返回。
// ⚠️ 去重①②③ 全部只在**实际注入**时占用名额：跳过不记录（compaction 自愈与后续重试由此成立）。
import { createHash } from 'node:crypto'
import { Config } from './index.js'

/** 同 query 去重窗口（毫秒）：TECH §3「同 query 10s 去重」契约字面 */
export const QUERY_DEDUP_MS = 10_000

// 注入消息 source 契约字面量（delta-spec §2）
const SOURCE_KIND = 'plugin'
const SOURCE_PLUGIN = 'kb-context'
const SOURCE_FORM = 'recall'
const SECTION_NAME = 'kb-context'

/**
 * 文本体转义（INV-11）：`<` → 字面序列 `\u003c`（反斜杠开头六字符）。
 * 伪 `</kb-context>` / `<kb-context …>` 注入文本由此失去标签结构。
 */
export function escapeText(s) {
  return String(s).replace(/</g, '\\u003c')
}

/** 属性值转义（safeLabelValue 口径）：`<`→`\u003c`、`"`→`\u0022`，防标签伪造与属性逃逸 */
export function escapeAttrValue(s) {
  return String(s).replace(/</g, '\\u003c').replace(/"/g, '\\u0022')
}

/** 单片段渲染：`<kb-context source="path:startLine-endLine">片段</kb-context>`（框架标签不转义，片段转义） */
export function renderSnippet(hit) {
  const [startLine, endLine] = hit.lines
  const source = escapeAttrValue(`${hit.path}:${startLine}-${endLine}`)
  return `<kb-context source="${source}">${escapeText(hit.snippet)}</kb-context>`
}

/** 注入文本体：各片段独立块拼接（不伪装正文，防混淆/防投毒审计面） */
export function buildInjectionText(hits) {
  return hits.map(renderSnippet).join('\n')
}

/**
 * 注入输入（delta-spec §2 逐字形状）：`{content:[{type:'text', text}], source:{kind:'plugin',
 * plugin:'kb-context', form:'recall', sections:[{name:'kb-context', text}]}}`。
 * 键集精确闭合（content/source 两键）——**禁 model 字段**（INV-5 反例测试钉住）。
 */
export function buildInjectionInput(hits) {
  const text = buildInjectionText(hits)
  return {
    content: [{ type: 'text', text }],
    source: {
      kind: SOURCE_KIND,
      plugin: SOURCE_PLUGIN,
      form: SOURCE_FORM,
      sections: [{ name: SECTION_NAME, text }],
    },
  }
}

/** 可见面摘要（SHA-1，十六进制）：注入内容口径 = 消息可见文本 */
export function digestOf(text) {
  return createHash('sha1').update(String(text), 'utf8').digest('hex')
}

/** 消息可见文本抽取（与 trigger.messageText 同口径：字符串 content 容忍，text 部件拼接，非 text 忽略） */
export function visibleText(message) {
  const c = message?.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n')
}

/** 本插件注入消息判定（delta-spec §2 source 形状三键咬合） */
export function isRecallMessage(message) {
  const s = message?.source
  return s?.kind === SOURCE_KIND && s?.plugin === SOURCE_PLUGIN && s?.form === SOURCE_FORM
}

/**
 * 可见面 SHA-1 去重键（纯函数）：可见面**末条**本插件注入消息的可见文本摘要（delta-spec §2：扫 session
 * surface 末条本插件消息）；无则 null。
 * ⚠️ compaction 自愈语义：摘要完全派生自当前可见面——compaction 压掉旧注入消息后摘要随之消失，
 *   同内容允许重新注入（自愈上下文丢失）；跳过路径不写任何持久态，自愈无需清理。
 */
export function lastRecallDigest(surface) {
  if (!Array.isArray(surface)) return null
  for (let i = surface.length - 1; i >= 0; i--) {
    if (isRecallMessage(surface[i])) return digestOf(visibleText(surface[i]))
  }
  return null
}

/** raw 值挽救（config safeParse 失败路径）：有限非负数沿用（含 0=立即超时语义），否则回退默认 */
function salvageNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/** degraded 留痕（进返回不进会话）：键集 = {injected, degraded, reason?, detail?}，测试钉住 */
function diag(injected, degraded, reason, detail) {
  const out = { injected, degraded }
  if (reason !== undefined) out.reason = reason
  if (detail !== undefined) out.detail = detail
  return out
}

/**
 * agent/pre-step 注入 handler 工厂（官方 waterfall 姿势，注册 `{prepend:true}` 由 apply 负责）。
 *
 * 返回形状（测试逐例钉住）：
 * - `decision.kind !== 'enter'` / 外层 signal 预中止 / 无 degraded 的良性跳过（未触发、去重①②③、零命中）
 *   → **原样返回同一 decision 引用**（0 触发 0 token，INV-4）；
 * - degraded 一律留痕进返回不进会话（INV-15 禁静默）：`{...decision, kbContext: {injected, degraded,
 *   reason?, detail?}}`，degraded ∈ 'timeout' | 'error' | 'config'；reason ∈ 'no-trigger' | 'zero-hits' |
 *   'dedup-turn' | 'dedup-query' | 'dedup-surface' | 'model-field'；detail 仅 'error'（异常信息）；
 * - 注入成功 → `{...decision, messages:[...decision.messages, 注入消息]}`（config 踩 salvage 时附
 *   `kbContext: {injected:true, degraded:'config'}` 留痕）。
 *
 * 去重三件套（全部只在实际注入时占用名额）：
 * ② 同 turn 一次：以 payload.turn（Object.is）单槽记忆——恒占一槽，无 Map 泄漏面；
 * ③ 同 query 10s：query（trigger 剥离文本，delta-spec：直接作检索输入与去重键）→ 注入时刻表，
 *    每次访问剪除过期项（≤10s 流量窗口，有界）；
 * ① 可见面 SHA-1：见 lastRecallDigest（纯函数）——观察面经 observeSurface 缝注入（默认取
 *    decision.messages ?? payload.messages）。
 *
 * fail-open：`AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])` 包裹检索；
 * 任何异常/超时 → 原样 messages + degraded 留痕，会话不阻塞（A5）。timeoutMs:0（及负/非数 salvage 后）
 * = 立即超时，不检索。
 *
 * 热改（T1 验收语义）：每次调用对 configSource 当前值 Config.safeParse——禁启动冻结；safeParse 失败
 * salvage raw 数值键（保热改连续性），坏键回退默认并留痕 degraded:'config'。
 *
 * @param {object} deps
 * @param {(message: object, configSource: object|Function) => {matched: boolean, query: string, degraded?: 'config'}} deps.matchTrigger
 *   T4 真件（apply 接 lib/trigger.js）。
 * @param {(query: string, opts: {maxSnippets: number, maxTokens: number, timeoutMs: number}) => Promise<{hits: Array, degraded?: string}>|object} deps.search
 *   T3 检索缝（apply 接真实索引读路径）。
 * @param {(input: object) => object} deps.createUserMessage 宿主缝（@deepseek-ai/dsh-llm）。
 * @param {object|Function} [deps.configSource] 当前 raw 配置（getter 形式优先，T4 建议）。
 * @param {(payload: object, decision: object) => Array} [deps.observeSurface] 可见面观察器（默认 decision.messages ?? payload.messages）。
 * @param {() => number} [deps.now] 时钟缝（10s 去重窗测试锚定）。
 * @returns {(payload: {agent, messages, turn, step, signal}, next: Function) => Promise<object>} pre-step handler（函数名 kbContextRecall）
 */
export function createPreStepHandler({
  matchTrigger,
  search,
  createUserMessage,
  configSource = () => ({}),
  observeSurface = (payload, decision) => decision?.messages ?? payload?.messages ?? [],
  now = () => Date.now(),
}) {
  // ② 单槽 turn 记忆（恒占一槽）；③ query→注入时刻表（每次访问剪除 ≥10s 过期项，有界防 Map 泄漏）
  let hasInjectedTurn = false
  let lastInjectedTurn
  const recentQueries = new Map()

  const skip = (decision, configDegraded, reason) =>
    configDegraded === null ? decision : { ...decision, kbContext: diag(false, 'config', reason) }

  return async function kbContextRecall(payload, next) {
    const decision = await next()
    if (decision == null || decision.kind !== 'enter') return decision
    const signal = payload?.signal
    if (signal?.aborted) return decision // 官方姿势：外层取消原样返回（取消≠超时，不构造注入）

    // ⚠️ fail-open 信封覆盖整个注入流水线（configSource/matchTrigger/AbortSignal 构造全在内）：
    //   任何异常不得穿出 handler（「任何异常 return decision 原样 + 不注入」契约）
    try {
      // per-call 读当前 config（T1 热改语义）：safeParse 当前值，禁启动冻结
      const raw = typeof configSource === 'function' ? configSource() : configSource
      const parsed = Config.safeParse(raw)
      let budget
      let timeoutMs
      let configDegraded = null
      if (parsed.success) {
        budget = parsed.data.budget
        timeoutMs = parsed.data.timeoutMs
      } else {
        budget = {
          maxSnippets: salvageNumber(raw?.budget?.maxSnippets, 3),
          maxTokens: salvageNumber(raw?.budget?.maxTokens, 2000),
        }
        timeoutMs = salvageNumber(raw?.timeoutMs, 1500)
        configDegraded = 'config'
      }

      // 触发（T4 真件）：请求可见面上末条 source.kind==='user' 消息——plugin 注入消息天然不是候选（INV-3）
      const scan = (Array.isArray(decision.messages) && decision.messages.length > 0)
        ? decision.messages
        : (payload?.messages ?? [])
      let triggerMessage = null
      for (let i = scan.length - 1; i >= 0; i--) {
        if (scan[i]?.source?.kind === 'user') { triggerMessage = scan[i]; break }
      }
      if (triggerMessage === null) return skip(decision, configDegraded, 'no-trigger')

      const t = matchTrigger(triggerMessage, configSource)
      if (t?.degraded === 'config') configDegraded = 'config'
      if (!t?.matched) return skip(decision, configDegraded, 'no-trigger')

      // ② 同 turn 一次（检索前挡，省多余检索）
      if (hasInjectedTurn && Object.is(lastInjectedTurn, payload?.turn)) {
        return skip(decision, configDegraded, 'dedup-turn')
      }
      // ③ 同 query 10s（检索前挡；剪除过期项保持有界）
      const ts = now()
      for (const [q, at] of recentQueries) {
        if (ts - at >= QUERY_DEDUP_MS) recentQueries.delete(q)
      }
      if (recentQueries.has(t.query)) {
        return skip(decision, configDegraded, 'dedup-query')
      }

      // fail-open 信封（A5）：外层 signal + timeoutMs 竞速；timeoutMs:0 = 立即超时（T3 同语义）
      if (!(timeoutMs > 0)) return { ...decision, kbContext: diag(false, 'timeout') }
      const combined = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)])

      const result = await search(t.query, {
        maxSnippets: budget.maxSnippets,
        maxTokens: budget.maxTokens,
        timeoutMs,
      })
      // 超时（飞行中被中止 / search 内置 deadline 降级）→ fail-open：不注入，留痕进返回
      if (combined.aborted || result?.degraded === 'timeout') {
        return { ...decision, kbContext: diag(false, 'timeout') }
      }
      const hits = Array.isArray(result?.hits) ? result.hits : []
      if (hits.length === 0) return skip(decision, configDegraded, 'zero-hits') // 零命中不注入（空态诊断留缝 T7）

      const input = buildInjectionInput(hits)
      const message = createUserMessage(input)
      // INV-5 必拒：缝产物夹带 model 字段（或非法产物）不得进会话
      if (message == null || typeof message !== 'object' || 'model' in message) {
        return { ...decision, kbContext: diag(false, 'error', 'model-field') }
      }

      // ① 可见面 SHA-1 去重（纯函数 lastRecallDigest + 可注入观察器 observeSurface）
      const surface = observeSurface(payload, decision)
      if (digestOf(visibleText(message)) === lastRecallDigest(surface)) {
        return skip(decision, configDegraded, 'dedup-surface')
      }

      // 注入成功才占用 ②③ 名额（跳过不记录——compaction 自愈/重试由此成立）
      hasInjectedTurn = true
      lastInjectedTurn = payload?.turn
      recentQueries.set(t.query, ts)

      const out = { ...decision, messages: [...(decision.messages ?? []), message] }
      if (configDegraded !== null) out.kbContext = diag(true, 'config')
      return out
    } catch (e) {
      // 任何异常 fail-open：messages 原样 + degraded:'error' 留痕（INV-15 禁静默）
      return { ...decision, kbContext: diag(false, 'error', undefined, String(e?.message ?? e)) }
    }
  }
}
