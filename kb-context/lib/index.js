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
import { buildTools, readPagesFromFs } from './tools.js'
import { collectEmptyState, isIndexHealthError } from './diagnose.js'

export const name = 'kb-context'

// vault 根路径出厂默认（R2 裁定 2026-09-24）：Config schema 默认值与 tools.js salvage 回退共用此单一来源
export const DEFAULT_VAULT_ROOT = '/mnt/unraid_data/Obsidian'

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
  // vault 根路径（R2 裁定）：wiki_read fs 直读根——路径解析=vaultRoot 下相对路径 + realpath 防 symlink 逃逸
  vaultRoot: z.string().default(DEFAULT_VAULT_ROOT),
  // 作用域（相对 vault 根）：indexAll = FTS5 索引目录；grepOnDemand = 按需 grep 目录
  scope: z.object({
    indexAll: z.array(z.string()).default(['wiki', 'raw']),
    grepOnDemand: z.array(z.string()).default([
      '01-客户资料', '02-致远OA', '03-帆软报表', '04-用友', '05-医院成本', '08-unraid',
    ]),
  }).prefault({}),
}).prefault({}) // 顶层同样容忍 undefined（热改路径上 rawConfig 可缺省 → 全默认；非法类型仍拒）

// 工厂 scope 默认（静态字面派生——非用户配置冻结；热改 scope 由调用方 opts.scope 现读传入，缺省回落此值。
// T7 空态诊断的 excluded 判据数据源：调用方缺 scope 时仍有确定性的 grepOnDemand/indexAll 可判）
export const FACTORY_SCOPE = Object.freeze(Config.safeParse({}).data.scope)

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
 * 读侧检索缝（T2→T3 接线 + T7 空态生产缝）：活跃库存在才只读打开（缺库=空态零命中，不建库零副作用）；
 * 检索异常中原样上抛，由 pre-step handler fail-open 兜住。
 * ⚠️ T7：零命中且非 timeout 降级 → 附 emptyState（collectEmptyState 只读观察：fs 在场性 + docs/chunks
 *   查询，绝不建库）——inject 诊断注入与 wiki_search 软增共用同一生产缝。
 * ⚠️ failed 可达性：坏库首查询抛 node:sqlite 健康面错误（探针实证 errcode 26/1）——转
 *   {hits:[], emptyState: failed} 而非上抛（坏库可解释，A4）；其余异常照旧上抛（T3 契约不改）。
 *   **failed 生产判据 = openError（本缝仅此一处生产传入）**；diagnose 的 problems/degraded 为预留缝
 *   未接线（本调用不传、无生产写入点）——接线任务已登记终审 triage（Important #2 注释级裁定）。
 *   诊断自身异常一律吞掉不破坏检索主链路（消费侧 normalize 空 → 回退 T5 identity）。
 * scope：opts.scope（config 热读，inject/tools 现传）缺省回落 FACTORY_SCOPE。
 */
export function runSearch(query, opts) {
  const dbPath = resolveIndexDbPath()
  const scope = opts?.scope ?? FACTORY_SCOPE
  const withEmptyState = (result, extra = {}) => {
    if (!(Array.isArray(result?.hits) && result.hits.length === 0) || result.degraded === 'timeout') return result
    try {
      const es = collectEmptyState({ dbPath, query, scope, ...extra })
      if (es !== null) result.emptyState = es
    } catch { /* 诊断不破坏检索主链路 */ }
    return result
  }
  if (!fs.existsSync(dbPath)) return withEmptyState({ hits: [] })
  let db
  try {
    db = openReadOnlyDb(dbPath)
  } catch (e) {
    return withEmptyState({ hits: [] }, { openError: String(e?.message ?? e) })
  }
  try {
    let result
    try {
      result = search(db, query, opts)
    } catch (e) {
      // 健康面错误（NOTADB/坏库/缺表）→ failed 空态；其余异常保持上抛（T3：调用方 fail-open 兜）
      if (isIndexHealthError(e)) return withEmptyState({ hits: [] }, { db, openError: String(e?.message ?? e) })
      throw e
    }
    return withEmptyState(result, { db })
  } finally {
    try { db.close() } catch { /* 尽力关闭 */ }
  }
}

/**
 * 读侧页面读取缝（T6 接线，R1 改判 2026-09-24：fs 直读磁盘现状，弃用索引重组）：root 取 opts.root
 *（config vaultRoot，per-call 热改），缺省回退 DEFAULT_VAULT_ROOT；readPagesFromFs 逐路径软错误
 * 不整体炸（detpecca 范式），意外读异常原样上抛由 defineTool 错误结果承载。读侧零写零建库不变。
 */
function runReadPages(paths, opts) {
  return readPagesFromFs(opts?.root ?? DEFAULT_VAULT_ROOT, paths, opts)
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
