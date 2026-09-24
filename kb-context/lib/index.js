// kb-context — Obsidian vault 上下文注入插件（入口 / 壳）
// 职责边界：本文件只做导出契约 + Config 定义 + apply 挂载点；
// 检索/注入模块（trigger/search/inject/index-db/tools）由后续任务在 lib/ 平铺扩展。
// ⚠️ R13 教训：default 导出必须是 {inject, apply} 对象——工厂函数形态会被宿主静默忽略。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createPreStepHandler } from './inject.js'
import { matchTrigger } from './trigger.js'
import { search } from './search.js'
import { openReadOnlyDb } from './index-db.js'
import { buildTools, readPagesFromDb } from './tools.js'

export const name = 'kb-context'

// 宿主服务缝：ctx.tools（T6 工具注册）——工具定义只走公开缝 defineTool（@deepseek-ai/dsh-tools，dsh-rtk-kit 同款姿势）
export const inject = ['tools']

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

/**
 * 活跃索引库路径（TECH §1 数据面 `~/.dsh/kb-index/`；文件名 active.db 呼应 T2 refresh(activePath)
 * 的「活跃库」语义——copy-on-write 激活后的只读消费面）。每次调用现算（os.homedir() 可被 HOME 导向，
 * 测试隔离用）。
 */
export function resolveIndexDbPath() {
  return path.join(os.homedir(), '.dsh', 'kb-index', 'active.db')
}

/**
 * 读侧检索缝（T2→T3 接线）：活跃库存在才只读打开（缺库=空态零命中，不建库零副作用——空态诊断留缝 T7）；
 * 检索异常原样上抛，由 pre-step handler fail-open 兜住。
 */
function runSearch(query, opts) {
  const dbPath = resolveIndexDbPath()
  if (!fs.existsSync(dbPath)) return { hits: [] }
  const db = openReadOnlyDb(dbPath)
  try {
    return search(db, query, opts)
  } finally {
    try { db.close() } catch { /* 尽力关闭 */ }
  }
}

/**
 * 读侧页面读取缝（T6 接线）：活跃库存在才只读打开（缺库=全缺失态，不建库零副作用——与 runSearch 同纪律）；
 * readPagesFromDb 逐路径软错误不整体炸（detpecca 范式），意外读异常原样上抛由 defineTool 错误结果承载。
 */
function runReadPages(paths, opts) {
  const dbPath = resolveIndexDbPath()
  const db = fs.existsSync(dbPath) ? openReadOnlyDb(dbPath) : null
  try {
    return readPagesFromDb(db, paths, opts)
  } finally {
    try { db?.close() } catch { /* 尽力关闭 */ }
  }
}

export function apply(ctx, rawConfig) {
  // 配置防御性校验：非法配置留痕告警后 fail-open（INV-15 禁静默）。
  // 热改语义：handler 每次调用读当前 config（safeParse 当前值），此处不做启动时冻结。
  const parsed = Config.safeParse(rawConfig)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    warn(ctx, `[kb-context] 配置校验失败，回退默认值（fail-open）：${detail}`)
  }
  // T6 主动检索工具接线（独立于 pre-step 缝：ctx.on 缺失也要注册工具）；
  // 宿主工具缝缺失 fail-open 留痕不静默（INV-15），不阻断 pre-step 注册
  if (typeof ctx?.tools?.register === 'function') {
    for (const tool of buildTools({
      defineTool,
      search: runSearch,
      readPages: runReadPages,
      configSource: () => rawConfig,
    })) {
      ctx.tools.register(tool)
    }
  } else {
    warn(ctx, '[kb-context] 宿主 ctx.tools 缺失，wiki_search/wiki_read 未注册（fail-open）')
  }
  // pre-step 注入接线（T4 trigger → T3 search → T5 注入，官方 waterfall 姿势）
  if (typeof ctx?.on !== 'function') {
    // 非宿主上下文（缺 ctx.on 缝）无法注册——fail-open 留痕不静默（INV-15）
    warn(ctx, '[kb-context] 宿主 ctx.on 缺失，pre-step 注入未注册（fail-open）')
    return
  }
  const handler = createPreStepHandler({
    matchTrigger,
    search: runSearch,
    createUserMessage,
    configSource: () => rawConfig,
  })
  ctx.on('agent/pre-step', handler, { prepend: true })
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
