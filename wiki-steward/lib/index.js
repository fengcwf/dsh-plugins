// wiki-steward — Obsidian vault 写侧记账插件（入口 / 壳，Task 8）
// 职责边界：本文件只做导出契约 + Config 定义 + apply 挂载点（fail-open 配置校验）；
// 业务模块由后续任务在 lib/ 平铺扩展：capture/buffer（T9）、validate（T10）、mark（T11）、
// crud（T12）、queue（T13）、alert（T13）；共享写安全基元在 lib/fs-safe.js（T8 建，T11/T12 消费）。
// ⚠️ R13 教训：default 导出必须是 {inject, apply} 对象——工厂函数形态会被宿主静默忽略。
// ⚠️ T8 裁定（壳期自裁，入 task-8 报告）：inject = [] —— 壳期零宿主服务依赖（login-gate 先例
//   「任何 dsh 版本均可加载」）：T9 捕获走 ctx.on('agent/turn-stopping') 事件缝无需服务注入；
//   T11/T12 注册工具面时再扩为 ['tools']（kb-context/rtk-kit 先例）、T13 timer 同理——过早声明
//   未消费的服务会把 apply 挂起在服务缺席的宿主上（capture 主链路不能死）。
import { z } from 'zod'

export const name = 'wiki-steward'
export const inject = []

// Config 全键一次性定义（delta-spec §2 整行进 cordis.patch.yml，config 整行替换语义）；
// 语义 = 可配置热改（后续 handler 每次调用读当前 config，不启动时冻结）。
// ⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认。
export const Config = z.object({
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
  // 配置防御性校验：非法配置留痕告警后 fail-open（INV-15 禁静默）。
  // 热改语义：handler 每次调用读当前 config（safeParse 当前值），此处不做启动时冻结。
  const parsed = Config.safeParse(rawConfig)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    warn(ctx, `[wiki-steward] 配置校验失败，回退默认值（fail-open）：${detail}`)
  }
  // 业务接线留缝（T9-T13）：捕获 ctx.on('agent/turn-stopping')、工具 ctx.tools.register、
  // timer 轻活——由后续任务在本函数扩展；壳期零注册零副作用。
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
