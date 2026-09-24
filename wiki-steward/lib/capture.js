// capture — 会话捕获语义纯函数（Task 9；delta-spec §2 捕获契约：turn-stopping 收口 +
// completed 校验 + projectSessionConversation 语义 + sanitize + subagent 判别）。
// 职责边界：只做内存语义（投影/中和/状态机），零磁盘零事件注册——落盘归 buffer.js（T9），
// 事件接线归 index.js apply（T9）。零第三方依赖（不 import 任何 dsh 包：官方
// projectSessionConversation 未从 dsh-session-reference 导出，isCompactCheckpointSource 语义
// 一行复刻 `source.kind === 'compact-checkpoint'`，零新 peer）。
//
// 裁定锚点：
//   - 投影语义 = 官方 projectSessionConversation（dsh-session-reference:126-160）：仅 user/assistant
//     文本；user 面收 `source.kind==='user'`（真实输入）与 `'compact-checkpoint'`（compaction 摘要，
//     官方同收）；注入体（plugin/cron/skill 等任意其它 producer kind）与 tool/developer/system 面全排除。
//   - sanitize（txl 范式，T9 裁定）：黑名单标签整体剥除 + 字面 `<>` 框架标记还原后中和。
//     黑名单非泛化（HTML/比较号正文不动）；新增注入体需扩 INJECTION_TAGS（申报留白）。
//   - subagent 判别（tianxingleo identity.mjs 范式）：`header.origin==='subagent' ||
//     header.parentSession !== undefined` 不捕获（fork 血缘同样保守排除，Q17 裁定面）。
//   - 收口状态机（Q7a 组合裁定）：turn-stopping 收口进 pending → turn/end `kind==='completed'`
//     才提交；aborted/error 双清（pending+uncommitted 都不落盘）；同 turn 多次收口合并（steer 重入
//     不丢内容）；异号 completed 不消费 pending（防御）。
//   - 脱敏分工：投影时 sanitize（注入中和）→ 落盘前 secrets.redact（buffer.js 双保险第二道）。

/** 注入标签黑名单（冻结防运行期篡改）：dsh/Claude 系注入体已知标签（含属性形） */
export const INJECTION_TAGS = Object.freeze(['system-reminder', 'skill_content', 'available_skills'])

/**
 * 注入中和（txl sanitize 范式）：①字面 `<>` 框架转义还原（dsh stringifyTagSafeJson 定界防伪形——
 * 注入体被转义后仍要能识别）②成对黑名单块整体剥除（标签+内容）③残留裸标签/未闭合标签剥除。
 * 非泛化：黑名单之外的 `<...>`（HTML、比较号、代码讨论）逐字保留。
 * 已知代价（申报）：正文里字面讨论这些标签的段落同样被剥；`<>` 还原会改写字面 JSON 转义序列。
 * @param {string} text
 * @returns {string} 中和后文本
 */
export function sanitize(text) {
  let out = String(text)
  out = out.replace(/\\u003c/gi, '<') // ① 框架转义标记还原（\\u003C 亦收，大小写不敏感）
  for (const tag of INJECTION_TAGS) {
    // ② 成对块（开标签容许属性形 <skill_content name="x">；闭标签容许空白）
    out = out.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '')
    // ③ 残留裸标签（开/闭、含属性形）
    out = out.replace(new RegExp(`<\\/?${tag}(?:\\s[^>]*)?>`, 'gi'), '')
  }
  return out
}

/**
 * text 块抽取（官方 textContent 同语义，dsh-session-reference:235-237）：仅 text 块、`\n` 连接；
 * 额外容错 string 形（防御，官方无此形）。
 * @param {unknown} content
 * @returns {string}
 */
export function textContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((b) => (b && b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))
    .join('\n')
}

/**
 * 单事件投影（projectSessionConversation 语义 + sanitize 第一道）：
 * user/message（kind=user|compact-checkpoint）与 assistant/message → `{role, text}`；其余全 null。
 * sanitize 后空文本 → null（不入缓冲）。
 * @param {{type: string, data?: any}|null} event session/event 形状
 * @returns {{role: 'user'|'assistant', text: string}|null}
 */
export function projectSessionEvent(event) {
  if (!event || typeof event !== 'object') return null
  if (event.type === 'user/message') {
    const kind = event.data?.source?.kind
    if (kind !== 'user' && kind !== 'compact-checkpoint') return null // 注入体排除（producer kind 白名单形）
    const text = sanitize(textContent(event.data?.content))
    return text !== '' ? { role: 'user', text } : null
  }
  if (event.type === 'assistant/message') {
    const text = sanitize(textContent(event.data?.message?.content))
    return text !== '' ? { role: 'assistant', text } : null
  }
  return null // tool/developer/system/attempt/边界标记…全排除（reasoning 不作为 text 块出现）
}

/**
 * subagent 判别（tianxingleo 范式，Q17 裁定面）：origin=subagent 或 parentSession 在场 → 不捕获。
 * @param {{origin?: string, parentSession?: string}|undefined} header session.header
 * @returns {boolean}
 */
export function isSubagentHeader(header) {
  if (!header || typeof header !== 'object') return false
  return header.origin === 'subagent' || header.parentSession !== undefined
}

/**
 * 每会话捕获状态机（纯内存）：uncommitted=已投影未收口消息；pending=turn-stopping 收口暂存。
 * @returns {{uncommitted: Array<{role: string, text: string}>, pending: {turn: number, entries: Array}|null}}
 */
export function createCaptureState() {
  return { uncommitted: [], pending: null }
}

/**
 * session/event 观察：投影通过则入 uncommitted（subagent/禁用判定在接线层，本函数纯投影管道）。
 * @param {ReturnType<typeof createCaptureState>} state
 * @param {{type: string, data?: any}} event
 * @returns {{role: string, text: string}|null} 入缓冲的条目（便于调用方计数）
 */
export function observe(state, event) {
  const entry = projectSessionEvent(event)
  if (entry) state.uncommitted.push(entry)
  return entry
}

/**
 * turn-stopping 收口：uncommitted 并入 pending（同 turn 多次收口=合并，steer 重入不丢；
 * pending 异 turn 残留同样并入——内容优先于轮次归属，轮次以最新收口为准）。
 * @param {ReturnType<typeof createCaptureState>} state
 * @param {number} turn
 */
export function stopping(state, turn) {
  state.pending = {
    turn,
    entries: [...(state.pending?.entries ?? []), ...state.uncommitted],
  }
  state.uncommitted = []
}

/**
 * turn/end 校验（completed 才提交）：
 *   - completed 且 pending.turn 匹配 → 返回待提交 entries，消费 pending；uncommitted 留存（steer 残留
 *     骑到下一轮，成功路径内容不丢）。
 *   - completed 但 pending 缺失/异号 → null，pending 不动（防御，等自己的 end）。
 *   - aborted/error/其它 kind → 双清（pending+uncommitted 全丢，aborted/error 不落盘），返回 null。
 * @param {ReturnType<typeof createCaptureState>} state
 * @param {number} turn
 * @param {string} kind turn/end reason.kind
 * @returns {Array|null} 待提交 entries
 */
export function turnEnded(state, turn, kind) {
  const matched = state.pending !== null && state.pending.turn === turn
  if (kind !== 'completed') {
    state.pending = null
    state.uncommitted = []
    return null
  }
  if (!matched) return null
  const entries = state.pending.entries
  state.pending = null
  return entries
}
