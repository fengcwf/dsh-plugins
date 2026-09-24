// wiki-steward — Obsidian vault 写侧记账插件（入口；T8 壳 → T9 捕获接线）
// 职责边界：导出契约 + Config 定义 + apply 挂载点（fail-open 配置校验 + 捕获三事件缝接线）；
// 捕获语义在 lib/capture.js（投影/中和/状态机）、落盘在 lib/buffer.js（缓冲/双轨/锁/重试）；
// 后续任务平铺扩展：validate（T10）、mark（T11）、crud（T12）、queue/alert（T13）。
// ⚠️ R13 教训：default 导出必须是 {inject, apply} 对象——工厂函数形态会被宿主静默忽略。
// ⚠️ T9 裁定（task-9 报告申报②）：inject 维持 []——捕获全走 ctx.on 公开事件缝
//   （session/event + agent/turn-stopping + session/disposed），零宿主服务消费（sessionQuery 不需要：
//   projectSessionConversation 官方语义在 capture.js 本地复刻）；T11/T12 扩 ['tools']、T13 timer 同理。
import { z } from 'zod'
import { createCaptureState, observe, stopping, turnEnded, isSubagentHeader } from './capture.js'
import { createBuffer, bumpStat } from './buffer.js'

export const name = 'wiki-steward'
export const inject = []

// vault 根路径出厂默认（kb-context R2 裁定同构，单一来源）：
// T9 补键裁定——delta-spec §2 Config 未列 vaultRoot，但捕获必须落盘（测试临时 root 注入 +
// 操作员逃生阀都需要此键），load 测试契约同步，偏离面入 task-9 报告。
export const DEFAULT_VAULT_ROOT = '/mnt/unraid_data/Obsidian'

// Config 全键一次性定义（delta-spec §2 整行进 cordis.patch.yml，config 整行替换语义）；
// 语义 = 可配置热改（handler 每次调用经 readCfg() 现读当前 rawConfig，不启动时冻结）。
// ⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认。
export const Config = z.object({
  // vault 根（T9 补键）：捕获双轨落点的根；kb-context 同名同默认
  vaultRoot: z.string().default(DEFAULT_VAULT_ROOT),
  // 捕获（T9）：turn-stopping 收口进缓冲，每 bufferRounds 轮强制 flush 双轨落盘
  capture: z.object({
    bufferRounds: z.number().default(3),
    enabled: z.boolean().default(true),
  }).prefault({}),
  // 写侧（T12）：默认只读（INV-7）——wiki_write/wiki_delete 需显式开启才动手
  write: z.object({
    readOnly: z.boolean().default(true),
  }).prefault({}),
  // 失败幂等队列（T13）：重试上限 + 条目 TTL（天）
  queue: z.object({
    maxRetries: z.number().default(3),
    ttlDays: z.number().default(7),
  }).prefault({}),
  // 脱敏（T8，INV-11）：落盘/注入前哨兵中和开关（lib/secrets.js）
  secrets: z.object({
    enabled: z.boolean().default(true),
  }).prefault({}),
}).prefault({}) // 顶层同样容忍 undefined（热改路径上 rawConfig 可缺省 → 全默认；非法类型仍拒）

/** 警告出口：优先宿主 logger，缺位回落 console（行为不丢；kb-context 同款） */
function warn(ctx, line) {
  try {
    if (ctx?.logger?.warn) {
      ctx.logger.warn(line)
      return
    }
  } catch { /* logger 抛错也不阻塞加载 */ }
  console.warn(line)
}

export function apply(ctx, rawConfig) {
  // 配置防御性校验：非法配置留痕告警后 fail-open（INV-15 禁静默）。只在 apply 期告警一次
  // （事件路径热改读取不重复告警，防刷屏）。
  const parsed = Config.safeParse(rawConfig)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    warn(ctx, `[wiki-steward] 配置校验失败，回退默认值（fail-open）：${detail}`)
  }
  const defaults = Config.parse({})
  /** 热改语义：每次事件现读当前 rawConfig（非法时回退全默认——与 apply 期告警面一致） */
  const readCfg = () => {
    const p = Config.safeParse(rawConfig)
    return p.success ? p.data : defaults
  }

  // ---- 捕获接线（T9；Q7a/Q17 组合裁定）----
  // 三缝：session/event（投影+completed 校验）+ agent/turn-stopping（收口）+ session/disposed（收尾 flush）。
  // 每缝独立 try/catch 吞+留痕——捕获绝不阻塞会话（turn-stopping 是 serial 钩子，上抛=挡收口）。
  /** sessionId → {capture: 状态机, buffer: 单会话缓冲} */
  const slots = new Map()

  const slotFor = (session) => {
    let slot = slots.get(session.id)
    if (slot === undefined) {
      slot = {
        capture: createCaptureState(),
        buffer: createBuffer({
          sessionId: session.id,
          getCfg: readCfg,
          warn: (line) => warn(ctx, line),
        }),
      }
      slots.set(session.id, slot)
    }
    return slot
  }

  const swallow = (where, e) => {
    bumpStat('swallowed', 1)
    warn(ctx, `[wiki-steward] 捕获 ${where} 异常已吞（不阻塞会话）：${e?.message ?? e}`)
  }

  ctx.on('session/event', async (session, event) => {
    try {
      if (!readCfg().capture.enabled) return // 热改门：禁用即零捕获（不建 slot）
      if (!session || isSubagentHeader(session.header)) return // ② subagent/fork 不捕获（tianxingleo 范式）
      if (event?.type === 'turn/end') {
        // completed 才提交（Q7a 组合：turn-stopping 收口 + turn/end 校验；aborted/error 双清）
        const slot = slots.get(session.id)
        if (slot === undefined) return
        const toCommit = turnEnded(slot.capture, event.data?.turn, event.data?.reason?.kind)
        if (toCommit !== null && toCommit.length > 0) {
          await slot.buffer.commit(event.data.turn, toCommit) // 落盘失败内部吞+留痕，commit 永不 reject
        }
        return
      }
      observe(slotFor(session).capture, event) // user/assistant 投影入缓冲（subagent 已在上方排除）
    } catch (e) {
      swallow('session/event', e)
    }
  })

  ctx.on('agent/turn-stopping', async ({ agent, turn }) => {
    try {
      if (!readCfg().capture.enabled) return
      const session = agent?.session
      if (!session || isSubagentHeader(session.header)) return
      stopping(slotFor(session).capture, turn) // 收口：uncommitted → pending（completed 才提交）
    } catch (e) {
      swallow('turn-stopping', e) // ⑥ 异常必须吞——serial 钩子上抛会阻塞会话收口
    }
  })

  ctx.on('session/disposed', async (session) => {
    try {
      const slot = slots.get(session?.id)
      if (slot === undefined) return
      await slot.buffer.flush() // 收尾余量：正常关闭不系统性丢最后 <3 轮（Q7a 崩溃上界之外的常态面）
      slots.delete(session.id) // 会话生命周期态回收（防 Map 泄漏）
    } catch (e) {
      swallow('session/disposed', e)
    }
  })
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
