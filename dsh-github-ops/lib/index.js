// dsh-github-ops —— DeepSeek Harness 的 GitHub 集成插件：token 强制层 + 仓库管理工具集
// ===============================设计来源（社区吸收）===============================
//   DeepTrial/dsh-bash-rtk          —— executor `resolve()` 改写缝、fail-open、stdin 守卫思路
//   github/github-mcp-server        —— 工具命名/描述选型指导/--jq 投影/read-only 边界
//   PivotStackIntelligence/dsh-github —— 仓库管理操作面、危险操作显式确认、无任意 shell 透传
//   pharaohnie/dsh-rtk-tools        —— 安全设计：不暴露可绕过沙箱的透传命令
// 三层职责：
//   ① 命令强制层（resolve 缝）：curl/wget 打 GitHub API → 注入 `Bearer $(gh auth token)`；
//      git clone https → gh repo clone。token 只以命令替换出现，值不进日志/recall。
//   ② web_fetch 门禁（pre-execute）：API/原始文件主机匿名抓取 → deny/ask 并指路认证通道
//      （web_fetch 硬约束：匿名、不带凭据、不走代理 —— 这是 GitHub 调研撞 60/h 匿名墙的元凶）。
//   ③ 仓库管理工具集（defineTool）：10 个工具 ≈ 2k token schema（对比 GitHub MCP 45 工具 ≈ 12.8k），
//      全部经 gh CLI（hosts.yml 认证 = 绕开 dsh 子进程凭据擦除的存活路径）。
// ================================================================================
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { gateWebFetch, rewriteGithubCommand } from './enforce.js'
import { GITHUB_TOOL_SPECS, renderSteps } from './repo-tools.js'

export const name = 'github-ops'
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
})

const AWARENESS = `# GitHub 访问约定（token 优先）

调研/操作 GitHub 时**默认走认证通道**（匿名限额仅 60/h，认证 5000/h）：
- 仓库发现与管理优先用 \`github_repo_*\` 工具；读 API 数据用 \`gh api <path>\`（如 \`gh api repos/OWNER/REPO\`、\`gh api repos/OWNER/REPO/contents/PATH\`）；搜索用 \`gh search\`。
- bash 里的 curl/wget 打 GitHub API 会被自动注入 \`Authorization: Bearer $(gh auth token)\` 头；git clone https 会自动改走 \`gh repo clone\`。
- web_fetch 抓 api.github.com/raw.githubusercontent.com 会被拒绝（它无法带 token）——改走上面的通道。
- 遇 403/429 先跑 \`github_auth_status\` 看限额与 reset 时间；直连失败时可用代理重试（\`curl -x "$HTTPS_PROXY" ...\`）。`

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
  ctx.effect(() => {
    shell.resolve = origResolve
  })

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

  // ── ③ 仓库管理工具集（gh 后端：认证由 hosts.yml 提供，argv 永不含 token）──
  if (config.enabled && config.registerRepoTools) {
    const runGh = (argv) => {
      const r = spawnSync(config.ghBin, argv, {
        encoding: 'utf8',
        timeout: config.ghTimeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', PAGER: 'cat' },
      })
      return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1 }
    }
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
            const steps = spec.commands(args ?? {}, config).map(runGh)
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
        ctx.logger?.warn(`github-ops: awareness 注入失败：${String(error)}`)
      }
    })
  }
}
