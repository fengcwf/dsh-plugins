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
import { registerSettingsRoutes } from './settings-routes.js'
import { createApplyPatch } from './settings-write.js'
import { matchTrigger } from './trigger.js'
import { search } from './search.js'
import { openReadOnlyDb } from './index-db.js'
import { buildTools, readPagesFromFs } from './tools.js'
import { collectEmptyState, isIndexHealthError } from './diagnose.js'
import { createTriggerLog, DEFAULT_CAPACITY } from './trigger-log.js'

export const name = 'kb-context'

// vault 根路径出厂默认（Controller 裁定② 2026-09-24；遗留清障⑪-d：原「R2」与 R-教训序列撞号已改）：
// Config schema 默认值与 tools.js salvage 回退共用此单一来源
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
  // vault 根路径（Controller 裁定②）：wiki_read fs 直读根——路径解析=vaultRoot 下相对路径 + realpath 防 symlink 逃逸
  vaultRoot: z.string().default(DEFAULT_VAULT_ROOT),
  // 作用域（相对 vault 根）：indexAll = FTS5 索引目录；grepOnDemand = 按需 grep 目录
  scope: z.object({
    indexAll: z.array(z.string()).default(['wiki', 'raw']),
    grepOnDemand: z.array(z.string()).default([
      '01-客户资料', '02-致远OA', '03-帆软报表', '04-用友', '05-医院成本', '08-unraid',
    ]),
  }).prefault({}),
  // 触发日志（0.4.0，TECH 架构图）：enabled=kill switch（默认开，per-call 现读热关即时生效）；
  // capacity=内存环上限（默认 200，INV-TL4「全局一份 200 条环」——readTriggerLogSettings 恒钳 ≤200）。
  // ⚠️ 外层 .optional()（区别于其余 .prefault({}) 节）：键缺省=读侧回填全默认（readTriggerLogSettings），
  //   Config.parse({}) 产物形不变——既有「Config 全键默认值」契约锁定测试（test/load.test.mjs）零改动；
  //   键在场时 zod 真校验（enabled 非 boolean / capacity 非 number 整单拒）。
  triggerLog: z.object({
    enabled: z.boolean().default(true),
    capacity: z.number().default(200),
  }).optional(),
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
 * triggerLog 配置现读（US-4 kill switch / INV-TL4 环本性）：per-call 读当前 raw 值——
 * enabled 热改即时生效（热关后 record 直接 no-op）；坏值救济=enabled 非 boolean 回默认开、
 * capacity 非正整数回 200 且**恒钳 ≤200**（INV-TL4「全局一份 200 条环」，配置想放大也不破）。
 * Config.safeParse 失败（他键坏不连坐）→ salvage raw triggerLog 节，同口径救济。
 */
export function readTriggerLogSettings(raw) {
  const parsed = Config.safeParse(raw)
  const t = parsed.success ? parsed.data.triggerLog : raw?.triggerLog
  const capacity = Number.isInteger(t?.capacity) && t.capacity > 0
    ? Math.min(t.capacity, DEFAULT_CAPACITY)
    : DEFAULT_CAPACITY
  return {
    enabled: typeof t?.enabled === 'boolean' ? t.enabled : true,
    capacity,
  }
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
  // 触发日志接线（10-A，TECH 实现面 4）：进程级单环（INV-TL4 全局一份，重启清空=内存环本性）；
  // enabled per-call 现读（kill switch 热关即时生效，热关后 record 直接 no-op）；capacity 现读钳 ≤200。
  // 记录缝 fail-open（INV-TL2）：日志自身任何异常静默吞，绝不影响触发/注入主链路。
  const triggerLog = createTriggerLog({
    capacity: readTriggerLogSettings(rawConfig).capacity,
    isEnabled: () => readTriggerLogSettings(rawConfig).enabled,
  })
  const handler = createPreStepHandler({
    matchTrigger,
    search: runSearch,
    createUserMessage,
    configSource: () => rawConfig,
    triggerLog,
  })
  ctx.on('agent/pre-step', handler, { prepend: true })

  // ---- 设置面数据面（/api/kb-context/settings，官方路由形，沿 wiki-steward 同款）----
  // B1 修复（R-4，T8-D1 §2/§3）双层子插件形（替代 softService 单次快照——apply 时序窗口结构性不可靠）：
  //  - 外层 inject=['tools'] 不动：工具面 + pre-step 在 headless/acp/sdk/web 全部署面照常；
  //  - 设置面数据改内层子插件硬 inject ['webServer','connection'] 承载：provider 缺位=延迟激活不炸装载、
  //    provider 到达自动补激活（宿主代管 fiber 生命周期，消灭「apply 时快照 null → 整段跳过」）；
  //  - configEditor 不进硬 inject（保持可缺位=只读部署如实）：per-request 惰性 ctx.get 求值——
  //    缺位=POST 503 write_unavailable、GET writable:false 如实，后到可见；
  //  - 半缺缝留痕（INV-15 不弱化）：告警专用 best-effort 探测（仅 warn，不参与注册决策；探测不抛）。
  // 双缺=非 web 部署面正常形态，数据面本就无处可注册，不告警（既有告警计数契约零改动）。
  const readCfg = () => {
    const p = Config.safeParse(rawConfig)
    const base = p.success ? p.data : Config.safeParse({}).data // 非法回退全默认（与 apply 告警面一致）
    // triggerLog 读侧回填（现读现值，10-B 设置节/kill switch 展示数据源）：键缺省=全默认，
    // 既有键语义零变化（只增面不改旧形，INV-TL3）
    return { ...base, triggerLog: readTriggerLogSettings(rawConfig) }
  }
  // 服务 best-effort 探测（只读、不抛、不参与注册决策）：cordis 代理在服务缺位/未 inject 时可能抛 → 收敛 null
  const probeService = (name) => {
    try {
      if (typeof ctx?.get === 'function') return ctx.get(name) ?? ctx.get(name, false) ?? null
    } catch { /* 探针收敛不抛 */ }
    return null
  }
  // configEditor 惰性求值（per-request，绝不做启动期单次快照）：取到=可写缝，缺位=null（写端点 503 如实）
  const lazyApplyPatch = () => {
    const svc = probeService('configEditor')
    if (svc === null || typeof svc.edit !== 'function' || typeof svc.entries !== 'function') return null
    return createApplyPatch({ configEditor: svc, entryId: 'kb-context', Config })
  }
  // 半缺缝（webServer/connection 只到其一）=接线异常，留痕（INV-15）；双缺不告警
  const wsProbe = probeService('webServer')
  const connProbe = probeService('connection')
  if ((wsProbe === null) !== (connProbe === null)) {
    warn(ctx, '[kb-context] webServer/connection 服务缝半缺，设置面数据（/api/kb-context/settings）未注册（fail-open：检索/注入面照常）')
  }
  // 子插件承载设置面数据注册（B2 修复，T8-D1 §4）：注册动作在 effect 执行体内当场跑、返回值=拆除器（label 留痕）；
  // 边界如实（复审 W-1 降格承诺）：当前 registerSettingsRoutes 为单次 register 形、无"注册一半"半拉状态；
  // 下方 catch 收敛环只覆盖已返回的 disposers——registerSettingsRoutes 内部若多资源中途 throw，内层资源不由外层收敛
  // （disposers 仅在成功 return 时交出），真收敛待多路由化时再做；拆除器覆盖全部已注册资源且幂等。
  try {
    if (typeof ctx?.plugin === 'function') {
      ctx.plugin({
        inject: ['webServer', 'connection'],
        apply(c) {
          if (typeof c?.effect !== 'function') return // 假 ctx 缺 effect 缝=跳过注册不告警（告警计数契约零弱化）
          c.effect(() => {
            const disposers = []
            try {
              disposers.push(...registerSettingsRoutes({
                register: (spec) => c.webServer.register(spec),
                connection: c.connection,
                getConfig: readCfg, // 热改现读（per-call 读语义）
                getApplyPatch: lazyApplyPatch, // configEditor 惰性（后到可见）
                triggerLog, // 触发日志环（10-B：GET /api/kb-context/logs + POST logs/clear 数据源）
                warn: (line) => warn(ctx, line),
              }))
            } catch (e) {
              for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } } // 收敛已返回的 disposers（多资源中途抛错不达，边界见上注）
              throw e // 再上抛（宿主 fiber 兜底收集；绝不吞错）
            }
            let disposed = false
            return () => {
              if (disposed) return
              disposed = true
              for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } }
            }
          }, 'kb-context: settings-routes')
        },
      })
    }
  } catch { /* ctx.plugin 缺位/异常 fail-open：装载不炸（等价宿主 _reload 兜底语义） */ }
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
