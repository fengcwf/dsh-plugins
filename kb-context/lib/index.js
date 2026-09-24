// kb-context — Obsidian vault 上下文注入插件（入口 / 壳）
// 职责边界：本文件只做导出契约 + Config 定义 + apply 挂载点；
// 检索/注入模块（trigger/search/inject/index-db/tools）由后续任务在 lib/ 平铺扩展。
// ⚠️ R13 教训：default 导出必须是 {inject, apply} 对象——工厂函数形态会被宿主静默忽略。
import { z } from 'zod'

export const name = 'kb-context'

// 暂不依赖宿主服务 API（后续注入/工具只走公开缝：pre-step、defineTool）
export const inject = []

// Config 全键一次性定义；语义 = 可配置热改（后续 handler 每次调用读当前 config，不启动时冻结）
// ⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认。
export const Config = z.object({
  // 触发条件：词面（words）∪ 索引实体（entityPaths）
  triggers: z.object({
    words: z.array(z.string()).default([]),
    entityPaths: z.array(z.string()).default([]),
  }).prefault({}),
  // 热图（vault 热点摘要）：默认关；开启后摘要长度上限（字符）
  hotMap: z.object({
    enabled: z.boolean().default(false),
    maxChars: z.number().default(600),
  }).prefault({}),
  // 注入预算：单次最多片段数 / token 上限
  budget: z.object({
    maxSnippets: z.number().default(3),
    maxTokens: z.number().default(2000),
  }).prefault({}),
  // 检索总超时（毫秒）：超时 fail-open 降级，不阻塞会话
  timeoutMs: z.number().default(1500),
  // 作用域（相对 vault 根）：indexAll = FTS5 索引目录；grepOnDemand = 按需 grep 目录
  scope: z.object({
    indexAll: z.array(z.string()).default(['wiki', 'raw']),
    grepOnDemand: z.array(z.string()).default([
      '01-客户资料', '02-致远OA', '03-帆软报表', '04-用友', '05-医院成本', '08-unraid',
    ]),
  }).prefault({}),
}).prefault({}) // 顶层同样容忍 undefined（热改路径上 rawConfig 可缺省 → 全默认；非法类型仍拒）

/** 警告出口：优先宿主 logger，缺位回落 console（行为不丢） */
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
  // 壳阶段唯一行为：配置防御性校验——非法配置留痕告警后 fail-open（INV-15 禁静默）。
  // 热改语义：后续 handler 每次调用读当前 config，此处不做启动时冻结。
  const parsed = Config.safeParse(rawConfig)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    warn(ctx, `[kb-context] 配置校验失败，回退默认值（fail-open）：${detail}`)
  }
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
