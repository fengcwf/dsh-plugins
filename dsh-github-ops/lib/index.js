// dsh-github-ops —— DeepSeek Harness 的 GitHub 集成插件：token 强制层 + 仓库管理工具集 + 设置栏目数据面
// ===============================设计来源（社区吸收）===============================
//   DeepTrial/dsh-bash-rtk          —— executor `resolve()` 改写缝、fail-open、stdin 守卫思路
//   github/github-mcp-server        —— 工具命名/描述选型指导/--jq 投影/read-only 边界
//   PivotStackIntelligence/dsh-github —— 仓库管理操作面、危险操作显式确认、无任意 shell 透传
//   pharaohnie/dsh-rtk-tools        —— 安全设计：不暴露可绕过沙箱的透传命令
//   kb-context                      —— 设置面数据面双层子插件挂载形（lib/index.js:212-242 先例）
// 五层职责：
//   ① 命令强制层（resolve 缝）：curl/wget 打 GitHub API → 注入 `Bearer $(gh auth token)`；
//      git clone https → gh repo clone。token 只以命令替换出现，值不进日志/recall。
//   ② web_fetch 门禁（pre-execute）：API/原始文件主机匿名抓取 → deny/ask 并指路认证通道
//      （web_fetch 硬约束：匿名、不带凭据、不走代理 —— 这是 GitHub 调研撞 60/h 匿名墙的元凶）。
//   ③ 仓库管理工具集（defineTool）：11 个工具 ≈ 2k token schema（对比 GitHub MCP 45 工具 ≈ 12.8k），
//      全部经 gh CLI（hosts.yml 认证 = 绕开 dsh 子进程凭据擦除的存活路径）；执行器收编 gh-auth.makeRunGh。
//   ④ 会话启动注入 GitHub 约定（行为默认值的教学层）。
//   ⑤ 设置栏目数据面（/api/github-ops/*，ADR-002）：settings-routes 8 端点双层子插件挂载。
// ================================================================================
import { z } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { gateWebFetch, rewriteGithubCommand } from './enforce.js'
import { GITHUB_TOOL_SPECS, renderSteps } from './repo-tools.js'
import * as ghAuth from './gh-auth.js'
import { registerSettingsRoutes } from './settings-routes.js'

export const name = 'github-ops'
// Ruling-3（kb-context 形双层激活语义）：外层只硬 inject ['shell','tools']——维持 0.2.1 激活语义，
// 非 web 部署面（headless/acp/sdk）四层照常生效；设置数据面由内层子插件硬 inject ['webServer','connection']
// 承载（web 面才激活，provider 缺位=延迟激活不炸装载=INV-6 fail-open）。
export const inject = ['shell', 'tools']

export const Config = z.object({
  enabled: z.boolean().default(true),
  ghBin: z.string().default('gh'),
  enforceCommands: z.boolean().default(true),
  webFetchPolicy: z.enum(['deny', 'ask', 'off']).default('deny'),
  registerRepoTools: z.boolean().default(true),
  allowDelete: z.boolean().default(false),
  awareness: z.boolean().default(true),
  ghTimeoutMs: z.number().min(1000).max(600000).default(60000),
  // INV-5 钳制落点（ADR-004）：访问检验探针独立超时（gh-auth/Settings-routes 只透传不钳制）
  probeTimeoutMs: z.number().min(1000).max(600000).default(3000),
})

const AWARENESS = `# GitHub 访问约定（token 优先）

调研/操作 GitHub 时**默认走认证通道**（匿名限额仅 60/h，认证 5000/h）：
- 仓库发现与管理优先用 \`github_repo_*\` 工具；读 API 数据用 \`gh api <path>\`（如 \`gh api repos/OWNER/REPO\`、\`gh api repos/OWNER/REPO/contents/PATH\`）；搜索用 \`gh search\`。
- bash 里的 curl/wget 打 GitHub API 会被自动注入 \`Authorization: Bearer $(gh auth token)\` 头；git clone https 会自动改走 \`gh repo clone\`。
- web_fetch 抓 api.github.com/raw.githubusercontent.com 会被拒绝（它无法带 token）——改走上面的通道。
- 遇 403/429 先跑 \`github_auth_status\` 看限额与 reset 时间；直连失败时可用代理重试（\`curl -x "$HTTPS_PROXY" ...\`）。`

/** 警告出口：优先宿主 logger，缺位回落 console（行为不丢，kb-context 同形） */
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
  const config = Config.parse(rawConfig ?? {})

  // ── ① 命令强制层：包一层 ctx.shell.resolve（模型驱动的调用才改写：stdin == null 守卫）──
  const shell = ctx.shell
  const origResolve = shell.resolve.bind(shell)
  shell.resolve = (request) => {
    const spec = origResolve(request)
    try {
      if (!config.enabled || !config.enforceCommands || request.stdin != null) return spec
      const r = rewriteGithubCommand(spec.command)
      return r.changed ? { ...spec, command: r.command } : spec
    } catch {
      return spec // fail-open
    }
  }
  // 工厂形 effect（cordis 语义实测：execute 当场跑、返回函数才是拆除器——rtk-kit 2026-09-29 e2e 同款教训）：
  // ⚠️ 勿写成 ctx.effect(() => { shell.resolve = origResolve }) 拆除器形——工厂语义下它当场还原、包壳即死
  //（0.2.1 命令强制层从未生效的根因；本卡真实 Context 双向复测：拆除器形存活=false、工厂形存活=true 且 teardown 还原=true）
  ctx.effect(() => () => {
    shell.resolve = origResolve
  }, 'github-ops: resolve-rewrite')

  // ── ② web_fetch 门禁（pre-execute 只有 allow/ask/deny 三种决策，正好够用）──
  if (config.enabled && config.webFetchPolicy !== 'off') {
    ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name === 'web_fetch') {
        const url = exec.arguments && typeof exec.arguments === 'object' ? /** @type {any} */ (exec.arguments).url : undefined
        const gate = gateWebFetch(String(url ?? ''))
        if (gate.action === 'deny') {
          return config.webFetchPolicy === 'deny'
            ? { kind: 'deny', reason: gate.reason }
            : { kind: 'ask', reason: gate.reason }
        }
      }
      return next()
    })
  }

  // ── ③ 仓库管理工具集（gh 后端：认证由 hosts.yml 提供，argv 永不含 token；runGh 收编 gh-auth.makeRunGh）──
  if (config.enabled && config.registerRepoTools) {
    const runGh = ghAuth.makeRunGh({ ghBin: config.ghBin, timeoutMs: config.ghTimeoutMs })
    for (const spec of GITHUB_TOOL_SPECS) {
      ctx.tools.register(
        defineTool({
          name: spec.name,
          description: spec.description,
          parameters: spec.parameters,
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { text: { type: 'string', required: true, description: 'Command output (compact projection).' } },
            },
            render: (_args, value) => [{ type: 'text', text: value.text }],
          },
          execute(args) {
            const steps = spec.commands(args ?? {}, config).map((argv) => runGh(argv))
            return { text: renderSteps(steps) }
          },
        }),
      )
    }
  }

  // ── ④ 会话启动注入 GitHub 约定（行为默认值的教学层）──
  if (config.enabled && config.awareness) {
    ctx.on('agent/session-start', ({ agent }) => {
      try {
        agent.inject(createUserMessage({ content: [{ type: 'text', text: AWARENESS }], source: name }))
      } catch (error) {
        warn(ctx, `github-ops: awareness 注入失败：${String(error)}`)
      }
    })
  }

  // ── ⑤ 设置栏目数据面（/api/github-ops/*，ADR-002）：双层子插件挂载（kb-context/lib/index.js:212-242 先例形）──
  // 内层子插件硬 inject ['webServer','connection'] 承载（Ruling-3：web 面才激活，非 web 面延迟激活=数据面缺席不炸）；
  // 注册动作在 effect 执行体内当场跑、返回值=拆除器（撤路由）；卸载=撤路由与挂载（C-1 收敛释放，审计 W 教训反着做）。
  if (config.enabled) {
    // 热改现读（per-call）：health 配置合成段经 deps.Config.safeParse 消费（{ok,switches,issues} 形，Task 11 契约）
    const cfgNow = () => {
      const p = Config.safeParse(rawConfig ?? {})
      return p.success ? p.data : Config.safeParse({}).data
    }
    // deps.workspaceDir=宿主工作区（carry-over②，Ruling 批准）：ctx.workspaceRegistry.list() 表头（注册表显示序第一个）；
    // 惰性 getter=每请求现读（后建工作区可见）；registry 缺位回落 settings-routes 内建默认 process.cwd() 并留痕一次。
    let fallbackWarned = false
    const workspaceDir = () => {
      try {
        const reg = typeof ctx?.get === 'function' ? ctx.get('workspaceRegistry') : null
        const list = typeof reg?.list === 'function' ? reg.list() : null
        const first = Array.isArray(list) ? list.find((w) => w && typeof w.path === 'string' && w.path) : null
        if (first) return first.path
      } catch { /* 宿主 registry 求值失败 fail-open */ }
      if (!fallbackWarned) {
        fallbackWarned = true
        warn(ctx, '[github-ops] 宿主 workspaceRegistry 缺位：repo-context 工作区回落 process.cwd()（可能非用户工作区，NEEDS_CONTEXT 记档）')
      }
      return undefined
    }
    try {
      if (typeof ctx?.plugin === 'function') {
        ctx.plugin({
          inject: ['webServer', 'connection'],
          apply(c) {
            if (typeof c?.effect !== 'function') return // 假 ctx 缺 effect 缝=跳过注册不炸（INV-6）
            c.effect(() => {
              const disposers = []
              try {
                const deps = {
                  register: (spec) => c.webServer.register(spec),
                  connection: c.connection,
                  Config,
                  getConfig: () => rawConfig ?? {}, // 热改现读（per-call）
                  ghAuth,
                  // 热改现读执行器（ghBin/ghTimeoutMs per-call 重建；stdin 精确擦除/有界输出由 makeRunGh 统一）
                  runGh: (argv, opts = {}) => ghAuth.makeRunGh({ ghBin: cfgNow().ghBin, timeoutMs: cfgNow().ghTimeoutMs })(argv, opts),
                  cacheTtlMs: 30_000, // ADR-006 TTL ≤30s（settings-routes 内另有硬顶）
                  warn: (line) => warn(ctx, line),
                }
                Object.defineProperty(deps, 'workspaceDir', { get: workspaceDir, enumerable: true }) // 惰性：每请求现读宿主工作区
                disposers.push(...registerSettingsRoutes(deps))
              } catch (e) {
                for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } } // 收敛已返回的 disposers
                throw e // 再上抛（宿主 fiber 兜底收集；绝不吞错）
              }
              let disposed = false
              return () => {
                if (disposed) return
                disposed = true
                for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } }
              }
            }, 'github-ops: settings-routes')
          },
        })
      }
    } catch { /* ctx.plugin 缺位/异常 fail-open：装载不炸（等价宿主 _reload 兜底语义） */ }
  }
}
