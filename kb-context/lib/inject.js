// inject — kb-context pre-step 注入体 + 三件套去重 + fail-open（T5）
// 职责边界：注入体构造（<kb-context> 转义/出处/禁 model）、可见面 SHA-1 去重（纯函数 + 可注入观察器）、
// 同 turn 一次 + 同 query 10s 去重、超时 fail-open（AbortSignal.any 竞速 + handler 级 abort-rejecting
//   Promise.race 硬中断）、trigger→search→注入接线体。
// 触发判定归 lib/trigger.js（T4，经 matchTrigger 缝消费）；检索归 lib/search.js（T3，经 search 缝消费）；
// 索引库归 lib/index-db.js（T2）——本文件不碰索引。
// ⚠️ 官方姿势（dsh-time-context 范式，delta-spec §2）：先 `const decision = await next()`；
//   `decision.kind !== 'enter'` 早退原样返回；命中 `return {...decision, messages:[...decision.messages, 注入消息]}`；
//   注册 `{prepend:true}`（在 lib/index.js apply）。外层 signal 预中止按官方姿势原样返回（取消≠超时）。
// ⚠️ INV-5 防回归（ERR [2026-09-17]）：注入消息禁带 model 字段——键集由 buildInjectionInput 精确闭合，
//   且 createUserMessage 缝产物若夹带 model 一律拒收（注入体带 model 必须拒，不进会话）。
// ⚠️ INV-11 注入防伪造：片段文本 `<`→字面序列 `\u003c`（六字符，非真实 '<'）——伪闭合/开标签失去结构；
//   source 属性值再加 `"`→`\u0022`（safeLabelValue 口径，防属性逃逸）。
// ⚠️ INV-11 脱敏哨兵（delta-spec §4.4）：片段体注入前过 lib/redact.js 三层中和（PEM 整块 / 赋值形态保 key /
//   token 形态）→ 占位符 `<redacted>` + 计数。redact 在 **raw 域先行**（先转义会黏合词边界，`<sk-…` 类哨兵
//   漏检），占位符经 split/join 抽走回填保字面；框架标记（source 属性）**不过 redact**——防误伤出处（sk- 类
//   路径名不得把 provenance 咬掉）。中和计数随 kbContext 状态返回（detail:{redacted:N}）。
// ⚠️ timeoutMs:0（及负/非数）语义 = 立即超时而非不限时（与 T3 search 同语义）：不检索、fail-open 返回。
// ⚠️ 去重①②③ 全部只在**实际注入**时占用名额：跳过不记录（compaction 自愈与后续重试由此成立）。
// ⚠️ T7 空态五态诊断（A4）：触发命中+零命中+检索缝携带合法 emptyState → 注入一条短诊断
//   `<kb-context state="五态" hint="≤200 解释+建议">…</kb-context>`（state/hint 属性 + hint 正文）；
//   **仅触发命中路径**——未触发仍 identity 早退 0 注入 0 token（INV-4 不破）；emptyState 缺位/非法
//   （stub 或未诊断缝）回退 T5 零命中 identity；诊断消息与片段注入同纪律占①②③名额（实际注入才占）。
import { createHash } from 'node:crypto'
import { Config, FACTORY_SCOPE } from './index.js'
import { redact, REDACTED } from './redact.js'
import { normalizeEmptyState } from './diagnose.js'

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

/**
 * 片段体管线：redact（INV-11 脱敏哨兵，raw 域保词边界）→ escapeText（INV-11 防伪造）。
 * 占位符 `<redacted>` 经 split/join 抽走回填保字面（测试断言注入文本含真实 `<redacted>`）。
 */
function safeBody(raw) {
  const { text, count } = redact(raw)
  return { body: text.split(REDACTED).map(escapeText).join(REDACTED), count }
}

/** 逐片段渲染 + 中和计数聚合（框架标记不过 redact——source 属性防误伤，provenance 保持精确） */
function renderHits(hits) {
  let redacted = 0
  const blocks = hits.map((hit) => {
    const [startLine, endLine] = hit.lines
    const source = escapeAttrValue(`${hit.path}:${startLine}-${endLine}`)
    const { body, count } = safeBody(hit.snippet)
    redacted += count
    return `<kb-context source="${source}">${body}</kb-context>`
  })
  return { text: blocks.join('\n'), redacted }
}

/** 单片段渲染：`<kb-context source="path:startLine-endLine">片段</kb-context>`（框架标签不转义，片段先中和再转义） */
export function renderSnippet(hit) {
  return renderHits([hit]).text
}

/** 注入文本体：各片段独立块拼接（不伪装正文，防混淆/防投毒审计面） */
export function buildInjectionText(hits) {
  return renderHits(hits).text
}

/**
 * T7 空态诊断文本体（裁定形状）：`<kb-context state="五态" hint="≤200 解释+建议">hint</kb-context>`。
 * 属性走 escapeAttrValue（safeLabelValue 口径——hint 可含路径/引号，防属性逃逸与标签伪造）；
 * 正文走 safeBody 管线（redact 脱敏哨兵 → escapeText 防伪，与 T5 片段同管线）。返回中和计数供 kbContext 留痕。
 */
export function buildEmptyStateText({ state, hint }) {
  const { body, count } = safeBody(hint)
  return {
    text: `<kb-context state="${escapeAttrValue(state)}" hint="${escapeAttrValue(hint)}">${body}</kb-context>`,
    redacted: count,
  }
}

/**
 * 注入输入（delta-spec §2 逐字形状）：`{content:[{type:'text', text}], source:{kind:'plugin',
 * plugin:'kb-context', form:'recall', sections:[{name:'kb-context', text}]}}`。
 * 键集精确闭合（content/source 两键）——**禁 model 字段**（INV-5 反例测试钉住）。
 * ⚠️ text 进 createUserMessage 前已经 safeBody 中和（INV-11 §4.4）。
 */
export function buildInjectionInput(hits) {
  return injectionInputFromText(renderHits(hits).text)
}

/** 文本体 → 注入输入（§2 形状单点）；handler 经 renderHits 拿中和计数后复用本函数 */
function injectionInputFromText(text) {
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

/** 竞速中止可识别标记（Symbol）：combined 中止时 race reject 的错误携带——与 search 自身异常区分（后者落 degraded:'error'） */
const RACE_ABORT = Symbol('kb-context.race-abort')

/**
 * abort-rejecting 竞速伴 promise：combined 一旦中止即以携带 RACE_ABORT 标记的错误 reject。
 * handler 级超时硬中断（零 T3 依赖）——search 不自我限时/挂死也保证 timeoutMs 内 fail-open。
 * race 落定后 Promise.race 已挂处理器，后续 reject 不构成 unhandledRejection。
 */
function rejectOnAbort(signal) {
  return new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('kb-context: search aborted'), { [RACE_ABORT]: true }))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}

/**
 * agent/pre-step 注入 handler 工厂（官方 waterfall 姿势，注册 `{prepend:true}` 由 apply 负责）。
 *
 * 返回形状（测试逐例钉住）：
 * - `decision.kind !== 'enter'` / 外层 signal 预中止 / 无 degraded 的良性跳过（未触发、去重①②③、
 *   零命中且无合法 emptyState——T7 回退缝）→ **原样返回同一 decision 引用**（0 触发 0 token，INV-4）；
 * - degraded 一律留痕进返回不进会话（INV-15 禁静默）：`{...decision, kbContext: {injected, degraded,
 *   reason?, detail?}}`，degraded ∈ 'timeout' | 'error' | 'config' | 'redacted'（注入前脱敏中和计数 >0）；
 *   reason ∈ 'no-trigger' | 'zero-hits' | 'dedup-turn' | 'dedup-query' | 'dedup-surface' | 'model-field'；
 *   detail：'error'→异常信息字符串；注入成功且中和 >0 → `{redacted: N}`（INV-11 §4.4 计数随状态返回）；
 * - 注入成功 → `{...decision, messages:[...decision.messages, 注入消息]}`（config 踩 salvage **或** 中和计数
 *   >0 时附 kbContext 留痕：degraded:'config' 优先、计数进 detail；N=0 干净注入不加键——沿「无 degraded
 *   不留痕」，测试钉住）。
 *
 * 去重三件套（全部只在实际注入时占用名额）：
 * ② 同 turn 一次：以 payload.turn（Object.is）单槽记忆——恒占一槽，无 Map 泄漏面；
 * ③ 同 query 10s：query（trigger 剥离文本，delta-spec：直接作检索输入与去重键）→ 注入时刻表，
 *    每次访问剪除过期项（≤10s 流量窗口，有界）；
 * ① 可见面 SHA-1：见 lastRecallDigest（纯函数）——观察面经 observeSurface 缝注入（默认取
 *    decision.messages ?? payload.messages）。
 *
 * fail-open：`AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])` 构造 combined——
 * 既前瞻作 `opts.signal` 传入 search（T3/T6 消费缝），又对 search(...) 做 **abort-rejecting
 * `Promise.race` 硬中断**（不寄生 T3 自觉限时：search 挂死/不返回也在 timeoutMs 内 fail-open，
 * spec §4 步骤 3「检索超时会话不阻塞」在 handler 边界成立）。combined 中止 → race 以可识别错误
 * reject → 按 fail-open 口径原样 messages + degraded:'timeout' 留痕；其他异常照旧 degraded:'error'。
 * timeoutMs:0（及负/非数 salvage 后）= 立即超时，不检索。
 *
 * 热改（T1 验收语义）：每次调用对 configSource 当前值 Config.safeParse——禁启动冻结；safeParse 失败
 * salvage raw 数值键（保热改连续性），坏键回退默认并留痕 degraded:'config'。
 *
 * @param {object} deps
 * @param {(message: object, configSource: object|Function) => {matched: boolean, query: string, degraded?: 'config'}} deps.matchTrigger
 *   T4 真件（apply 接 lib/trigger.js）。
 * @param {(query: string, opts: {maxSnippets: number, maxTokens: number, timeoutMs: number, signal?: AbortSignal}) => Promise<{hits: Array, degraded?: string}>|object} deps.search
 *   T3 检索缝（apply 接真实索引读路径）；opts.signal = combined（前瞻给 T3/T6 消费，超时硬中断不依赖它）。
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

      // 竞速接线（handler 级硬中断，零 T3 依赖）：combined 前瞻作 search opts.signal（T3/T6 消费缝），
      // 同时对 search(...) 做 abort-rejecting Promise.race——search 挂死/不返回也在 timeoutMs 内 fail-open
      let result
      try {
        result = await Promise.race([
          search(t.query, {
            maxSnippets: budget.maxSnippets,
            maxTokens: budget.maxTokens,
            timeoutMs,
            signal: combined,
            // T7：scope 现读随行（空态诊断 excluded 判据数据源）；salvage 路径回退出厂 FACTORY_SCOPE
            scope: parsed.success ? parsed.data.scope : FACTORY_SCOPE,
          }),
          rejectOnAbort(combined),
        ])
      } catch (e) {
        // combined 中止（超时/取消）→ fail-open 口径留痕 timeout；其余异常交外层信封（degraded:'error'）
        if (e?.[RACE_ABORT] === true || combined.aborted) {
          return { ...decision, kbContext: diag(false, 'timeout') }
        }
        throw e
      }
      // 超时（晚到前已中止 / search 内置 deadline 降级）→ fail-open：不注入，留痕进返回
      if (combined.aborted || result?.degraded === 'timeout') {
        return { ...decision, kbContext: diag(false, 'timeout') }
      }
      const hits = Array.isArray(result?.hits) ? result.hits : []
      if (hits.length === 0) {
        // T7 空态五态诊断（仅触发命中路径，INV-4 不破）：合法 emptyState → 注入一条短诊断
        //（与片段注入同管线：INV-5 键集 / INV-11 转义+中和 / ①②③ 同纪律占名额）；
        // 缺位/非法（stub 或未诊断缝）→ 回退 T5 零命中 identity
        const es = normalizeEmptyState(result?.emptyState)
        if (es === null) return skip(decision, configDegraded, 'zero-hits')
        const { text, redacted } = buildEmptyStateText(es)
        const message = createUserMessage(injectionInputFromText(text))
        if (message == null || typeof message !== 'object' || 'model' in message) {
          return { ...decision, kbContext: diag(false, 'error', 'model-field') }
        }
        const surface = observeSurface(payload, decision)
        if (digestOf(visibleText(message)) === lastRecallDigest(surface)) {
          return skip(decision, configDegraded, 'dedup-surface')
        }
        // 诊断是实际注入 → 占②③名额（与片段注入同纪律；跳过不记录语义不变）
        hasInjectedTurn = true
        lastInjectedTurn = payload?.turn
        recentQueries.set(t.query, ts)
        const out = { ...decision, messages: [...(decision.messages ?? []), message] }
        if (configDegraded !== null || redacted > 0) {
          out.kbContext = diag(true, configDegraded ?? 'redacted', undefined, redacted > 0 ? { redacted } : undefined)
        }
        return out
      }

      const { text, redacted } = renderHits(hits)
      const input = injectionInputFromText(text)
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
      // 中和计数随 kbContext 状态返回（INV-11 §4.4）：N>0 才留痕（degraded:'redacted'）；
      // config salvage 与中和并存时 degraded:'config' 优先、计数仍进 detail；N=0 不加键（无 degraded 不留痕）
      if (configDegraded !== null || redacted > 0) {
        out.kbContext = diag(true, configDegraded ?? 'redacted', undefined, redacted > 0 ? { redacted } : undefined)
      }
      return out
    } catch (e) {
      // 任何异常 fail-open：messages 原样 + degraded:'error' 留痕（INV-15 禁静默）
      return { ...decision, kbContext: diag(false, 'error', undefined, String(e?.message ?? e)) }
    }
  }
}
