// dsh-rtk-kit —— DeepSeek Harness 的 RTK（Rust Token Killer）集成插件
// ===============================设计来源（社区吸收）===============================
//   rtk-ai/rtk               —— `rtk rewrite` 单一事实源、awareness 三档、recall/逃生舱约定
//   DeepTrial/dsh-bash-rtk   —— executor `resolve()` 改写缝、三重守卫、rtk 缺失恒等回退、
//                               不打包 rtk 二进制、patch 默认 disabled 的安全安装法
//   pharaohnie/dsh-rtk-tools —— rtk_doctor 诊断工具；永不暴露 `rtk run`（sh -c 透传会绕过沙箱）
//   dd2673/dsh-rtk 等 rewrite 流派 —— pwsh/bash 改写形态参考
// 我们的改进（相对上述项目）：
//   1. 路由交给 `rtk rewrite`（链式命令感知），不维护手写白名单（白名单必然滞后于 rtk 版本）；
//   2. 用 `request.stdin == null` 识别"模型驱动的 shell 调用"，hook-runner 等内部调用永不改写
//      （否则 hook 的 JSON stdout 会被压缩破坏）；
//   3. 会话启动注入 awareness（各社区 rtk 插件均依赖 rtk init 写文件，不随插件装卸）；
//   4. 修正 `rtk rewrite` 0.49.0 成功码 = 3 的判定坑（只认非空 stdout）。
// ================================================================================
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { decideEligibility, isSafeRewrite, pickRewritten } from './rewrite.js'
import { awarenessText } from './awareness.js'

export const name = 'rtk-kit'
export const inject = ['shell', 'tools']

export const Config = z.object({
  enabled: z.boolean().default(true),
  rtkBin: z.string().default('rtk'),
  rewriteTimeoutMs: z.number().min(10).max(5000).default(150),
  conservative: z.boolean().default(true),
  exclude: z.array(z.string()).default([]),
  awareness: z.enum(['default', 'high', 'full', 'off']).default('default'),
  registerDoctorTool: z.boolean().default(true),
})

/** 探测 rtk 是否可用；缺失时整个插件退化为恒等（与 DeepTrial 同款 fail-safe）。 */
export function probeRtk(rtkBin) {
  try {
    const r = spawnSync(rtkBin, ['--version'], { stdio: 'ignore', timeout: 3000 })
    return r.status === 0
  } catch {
    return false
  }
}

/** 调 `rtk rewrite` 拿改写结果。⚠️ 只认非空 stdout（0.49.0 成功码 = 3，见 rewrite.js）。 */
function runRtkRewrite(rtkBin, command, timeoutMs) {
  try {
    const r = spawnSync(rtkBin, ['rewrite', command], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return pickRewritten(r.stdout)
  } catch {
    return undefined // fail-open：任何异常都原样放行
  }
}

export function apply(ctx, rawConfig) {
  const config = Config.parse(rawConfig ?? {})
  const available = config.enabled && probeRtk(config.rtkBin)

  // ── ① 命令改写：包一层 ctx.shell.resolve（与挂载哪个 executor 无关，沙箱语义原样保留）──
  const shell = ctx.shell
  const origResolve = shell.resolve.bind(shell)
  shell.resolve = (request) => {
    const spec = origResolve(request)
    try {
      // 模型驱动的调用 stdin 恒为空；hook-runner / 进程内插件会带 stdin payload —— 后者永不改写
      if (!available || request.stdin != null) return spec
      const d = decideEligibility(spec.command, { conservative: config.conservative, exclude: config.exclude })
      if (!d.eligible) return spec
      const rewritten = runRtkRewrite(config.rtkBin, spec.command, config.rewriteTimeoutMs)
      if (!isSafeRewrite(spec.command, rewritten)) return spec
      return { ...spec, command: rewritten }
    } catch {
      return spec // fail-open
    }
  }
  ctx.effect(() => {
    shell.resolve = origResolve
  })

  // ── ② 会话启动注入 awareness（随插件装卸，不污染 AGENTS.md）──
  const text = awarenessText(config.awareness)
  if (text) {
    ctx.on('agent/session-start', ({ agent }) => {
      try {
        agent.inject(
          createUserMessage({
            content: [{ type: 'text', text }],
            source: name,
          }),
        )
      } catch (error) {
        ctx.logger?.warn(`rtk-kit: awareness 注入失败：${String(error)}`)
      }
    })
  }

  // ── ③ rtk_doctor 诊断工具（吸收 pharaohnie 的 doctor 思想；不暴露 rtk run）──
  if (config.registerDoctorTool) {
    ctx.tools.register(
      defineTool({
        name: 'rtk_doctor',
        description:
          'Diagnose the RTK (Rust Token Killer) integration: binary availability, version, config, and recent token-savings summary. Use when compressed output looks wrong or you want to verify the integration.',
        parameters: {
          gain: {
            type: 'boolean',
            description: 'Include the `rtk gain` savings dashboard (default true).',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string', required: true, description: 'Diagnostic report.' } },
          },
          render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        execute(args) {
          const lines = []
          const ok = probeRtk(config.rtkBin)
          lines.push(`rtk available: ${ok ? 'yes' : 'no'} (bin: ${config.rtkBin})`)
          if (!ok) {
            lines.push('安装：brew install rtk / curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh')
            return { text: lines.join('\n') }
          }
          const version = spawnSync(config.rtkBin, ['--version'], { encoding: 'utf8', timeout: 3000 })
          lines.push(`version: ${(version.stdout ?? '').trim() || '(unknown)'}`)
          lines.push(`auto-rewrite: ${available ? 'on' : 'off'} | conservative: ${config.conservative} | awareness: ${config.awareness}`)
          if (args.gain !== false) {
            const gain = spawnSync(config.rtkBin, ['gain'], { encoding: 'utf8', timeout: 5000 })
            const out = (gain.stdout ?? '').trim().slice(0, 1200)
            lines.push('', '--- rtk gain (tail-capped) ---', out || '(no data yet)')
          }
          return { text: lines.join('\n') }
        },
      }),
    )
  }
}
