// obsidian-web — Obsidian vault Web 管理插件（入口 / 壳）
// 职责边界：本文件只做导出契约 + Config 定义 + apply 挂载缝位；
// 业务模块（vault-ops/share/render/redact）与 web/ 前端构建物由后续任务（T2-T13）在此壳上叠加。
// ⚠️ R13 教训：default 导出必须是 {inject, apply} 对象——工厂函数形态会被宿主静默忽略。
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { registerWebRoutes } from './web-routes.js'
import { createShareServer } from './share-server.js'
import { createIndexService } from './index-service.js'
import { DEFAULT_INDEX_DIR_BASE } from './index-store.js'

// /ob/ UI 静态构建物默认位（web/dist 随包分发，见 web/README.md）
const DEFAULT_DIST_DIR = fileURLToPath(new URL('../web/dist', import.meta.url))

export const name = 'obsidian-web'

// vault 根路径出厂默认（delta-specs/obsidian-web.md §2 Config 契约）：
// Config schema 默认值与后续 vault-ops 路径围栏共用此单一来源
export const DEFAULT_VAULT_ROOT = '/mnt/unraid_data/Obsidian'

// 宿主服务缝（服务名实测核对 dsh checkout：dsh-host-webserver `super(ctx, "webServer")`、
// dsh-client-connection `super(ctx, "connection")`）：
//   - webServer：T2+ 起 `ctx.webServer.register({kind, path, handler})` 挂 /ob/ UI 与 REST（同域 3080）
//   - connection：`ctx.connection.requestRejection(request)` 鉴权缝（OW-INV-8，见 apply 内缝位注释）
export const inject = ['webServer', 'connection']

// Config 全键（delta-specs/obsidian-web.md §2）：vaultRoot / share / ui / server 四组。
// 语义 = 可配置热改（后续 handler 每次调用读当前 config，不启动时冻结）。
// ⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认（T1 教训）。
export const Config = z.object({
  // vault 根路径：所有读写/下载/分享/目录维护的文件系统根（T12 起叠加 realpath 路径围栏，OW-INV-7）
  vaultRoot: z.string().default(DEFAULT_VAULT_ROOT),
  // 索引库基目录（0.1.1 迁出 CIFS，fix-boot-lock）：索引=可重建零损失缓存（ARC-2）落本地盘，
  // 每 vault 一库 `<indexDir>/<vault 名-哈希>/`；缺省/空串/纯空白 → 出厂默认 `~/.dsh/cache/obsidian-web/`
  // （`~` 按 os.homedir() 展开；解析语义单一来源=index-store.resolveIndexDir，测试锁定）
  indexDir: z.string().default(DEFAULT_INDEX_DIR_BASE),
  // 分享模型（PRODUCT OW-INV-1，v1.1）：逐条显式生成、默认不对外；写权限强制访问密码
  share: z.object({
    enabled: z.boolean().default(true),
    defaultTtlDays: z.number().int().min(1).default(7),
    requirePasswordForWrite: z.boolean().default(true),
  }).prefault({}),
  // UI 面（T2/T13）：树/列表分页大小
  ui: z.object({
    pageSize: z.number().int().min(1).default(50),
  }).prefault({}),
  // 分享服务（T9 接）：独立 HTTP 入口（server.sharePort），生命周期独立、可单独关停（OW-INV-10）
  // T9 扩展（load.test 契约锁同步，Ruling 见 task-9-report）：shareHost=绑定面（分享面=唯一公开放行
  // 面，默认全接口；要收口 loopback 反代场景显式配 127.0.0.1）；trustProxy=显式可信代理清单（C2 IP
  // 口径：缺省空=一切 XFF 忽略、限流键=socket.remoteAddress only）。
  server: z.object({
    sharePort: z.number().int().min(1).max(65535).default(3500),
    shareHost: z.string().default('0.0.0.0'),
    trustProxy: z.array(z.string()).default([]),
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
 * 挂载（T1 = 壳：只做配置防御校验 + 缝位就位，不注册任何路由/服务）。
 * 后续任务在此叠加：
 *   T2+  UI 与 REST（ctx.webServer.register）→ T4/T5 写安全 → T7 导出 → T8 分享模型 →
 *   T9 分享服务独立入口（server.sharePort）→ T10 管理页 → T11 索引 → T12 目录档案 → T13 构建物。
 */
export function apply(ctx, rawConfig) {
  // 配置防御性校验：非法配置留痕告警后 fail-open（INV-15 禁静默）。
  // 热改语义：handler 每次调用读当前 config（safeParse 当前值），此处不做启动时冻结。
  const parsed = Config.safeParse(rawConfig)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    warn(ctx, `[obsidian-web] 配置校验失败，回退默认值（fail-open）：${detail}`)
  }

  // ── OW-INV-8 鉴权缝（web-routes 每条 /ob/ REST 与 UI 路由逐条套用，handler 第一行）──────
  //   const rejection = ctx.connection.requestRejection({ headers: request.headers })
  //   → 401/403 直接回拒（Host/Origin 围栏 + 签名 cookie，防 DNS rebinding/跨站）。
  // secret 一律走 ctx.credentials（key 不进设置面）；对外签名场景另走 HMAC（先例 dsh-webhook-github）。

  // ── OW-INV-10 暴露面（主 UI 面零新增暴露）────────────────────────────────────────────
  // 主 UI 与 REST 一律 `ctx.webServer.register` 挂 dsh web 同域 3080（不自起端口、不加公开面、
  // 复用宿主既有鉴权边界）；分享服务（server.sharePort=3500）是唯一独立入口，生命周期独立可
  // 单独关停（T9 接线 + 关停演练），放行面恰 `/ob_share/<token>` 一处（PRODUCT OW-INV-2/6），
  // share.enabled=false 时全 404（fail-closed，PRODUCT OW-INV-1 默认不对外）。

  // ── T2 接线：/ob/ UI 静态面 + JSON 读接口（树/读+live 渲染/反链）────────────────────────
  // 缺宿主缝（独立测试/非宿主上下文）不炸不注册；有缝则挂载并把 dispose 交 ctx.effect 收敛。
  if (typeof ctx?.webServer?.register === 'function' && typeof ctx?.connection?.requestRejection === 'function') {
    // 热改语义：getConfig 每次请求现读当前配置（不启动时冻结）
    const getConfig = () => {
      const current = Config.safeParse(rawConfig)
      return current.success ? current.data : Config.parse({})
    }

    // ── T11 接线：索引三保险（OW-US-11/OW-INV-11：保存即增量+30min 对账+手动刷新）────────
    // 生命周期同 T9 惯例：缺 ctx.effect 收敛缝 → 索引不启动（timer 生命周期不可控 fail-closed）
    //   + 留痕（INV-15）；检索仍走 scan 兜底、/ob/api/index/refresh 503 可解释（行为不丢）。
    // 索引库=<indexDir>/<vault 名-哈希>/（0.1.1 迁出 CIFS 落本地盘，ARC-2 展示索引可全量重建；
    //   旧落点 <vaultRoot>/.ob-index/ 检测留痕）；vaultRoot/indexDir 绑定=启动时配置值
    //   （热改可解释拒不冒充；多根档案=T12 设置页 vault 目录档案数据面）；fts 后端注入
    //   search.backends.fts=零 API 变化接管 T3 检索缝。
    let indexService = null
    if (typeof ctx.effect === 'function') {
      // fix-boot-lock fail-open 网兜：索引库是展示面（ARC-2 可重建零损失）——任何索引面故障绝不炸
      //   插件装载。createIndexService 内部已对建库/开库失败 fail-open（degraded 留痕+自愈重试），
      //   此层是最后防线（意外异常同样放行装载+留痕，INV-15 禁静默）。
      try {
        const cfg = getConfig()
        indexService = createIndexService({ vaultRoot: cfg.vaultRoot, indexDir: cfg.indexDir, warn: (line) => warn(ctx, line) })
        ctx.effect(() => indexService.stop())
        indexService.start().catch((err) => {
          warn(ctx, `[obsidian-web] 索引启动补跑失败（scan 兜底仍可用，30min 定时器重试）：${err?.message ?? err}`)
        })
      } catch (err) {
        indexService = null
        warn(ctx, `[obsidian-web] 索引服务启动失败（fail-open：插件继续装载，检索走 scan 兜底，/ob/api/index/refresh 503）：${err?.message ?? err}`)
      }
    } else {
      warn(ctx, '[obsidian-web] 缺 ctx.effect 收敛缝：索引服务未启动（检索走 scan 兜底，/ob/api/index/refresh 503）')
    }
    const dispose = registerWebRoutes(ctx, getConfig, {
      distDir: DEFAULT_DIST_DIR,
      search: indexService === null ? undefined : { backends: { fts: indexService.ftsBackend } },
      index: indexService === null ? undefined : { refresh: () => indexService.refresh() },
    })
    if (typeof ctx.effect === 'function') ctx.effect(dispose)

    // ── T9 接线：分享服务独立入口（OW-INV-10：独立 listener、生命周期独立可单独关停）────────
    // 放行面恰 `/ob_share/<token>` 一处（OW-INV-2）；share.enabled=false → 面整体关（不绑定/自关）。
    // 缺 ctx.effect 收敛缝 → 不开公开面（生命周期不可控 fail-closed）+ 留痕（INV-15 禁静默）。
    if (typeof ctx.effect === 'function') {
      const initial = parsed.success ? parsed.data : Config.parse({})
      const shareServer = createShareServer({
        getConfig,
        port: initial.server.sharePort,
        host: initial.server.shareHost,
      })
      ctx.effect(() => shareServer.close())
      shareServer.start().catch((err) => {
        warn(ctx, `[obsidian-web] 分享服务启动失败（server.sharePort=${initial.server.sharePort}）：${err?.message ?? err}`)
      })
    } else {
      warn(ctx, '[obsidian-web] 缺 ctx.effect 收敛缝：分享服务未启动（公开面生命周期不可控，fail-closed）')
    }
  }
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
