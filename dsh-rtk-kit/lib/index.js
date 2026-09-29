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
import { runDoctorTool } from './doctor.js'
import { registerDoctorRoutes } from './doctor-routes.js'

export const name = 'rtk-kit'
export const inject = ['shell', 'tools']
// webServer/connection = 软依赖（TECH.md ADR 接线形）：经内层 ctx.plugin({inject:['webServer','connection']}) 子插件
// 承载设置页数据面 + softService 缺缝探测 fail-open。⚠️ 不进外层 inject——外层硬 inject 会使缺缝部署整插件
// pending（resolve 改写缝与 awareness 随之失效，破坏 constitution 既有语义冻结）。

export const Config = z.object({
  enabled: z.boolean().default(true),
  rtkBin: z.string().default('rtk'),
  rewriteTimeoutMs: z.number().min(10).max(5000).default(150),
  conservative: z.boolean().default(true),
  exclude: z.array(z.string()).default([]),
  awareness: z.enum(['default', 'high', 'full', 'off']).default('default'),
  registerDoctorTool: z.boolean().default(true),
  // rtk_doctor 是否输出 gain 统计段（INV-6 瘦身：缺省 false=只出轻诊断三行，省 350-420 token/次；
  // true 时统计段仍受工具参数 gain!==false 门控——完整统计唯一入口=设置页面板）
  doctorGain: z.boolean().default(false),
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

/**
 * rtk_doctor 工具定义工厂（Task 8 瘦身）：执行体单源走 lib/doctor.js runDoctorTool（→ getVersion/getGain，
 * 零 spawnSync）；deps.exec 为测试注入缝（零真实 rtk，INV-4）。defineTool 全库恰此一处（零新增会话工具，INV-2）。
 * gain 段门控（INV-6）：config.doctorGain 缺省 false 不输出；true 时仍受工具参数 gain!==false 门控。
 */
export function buildDoctorTool({
  rtkBin = 'rtk',
  doctorGain = false,
  autoRewrite = false,
  conservative = true,
  awareness = 'default',
  exec,
  timeoutMs,
} = {}) {
  return defineTool({
    name: 'rtk_doctor',
    description:
      'Diagnose the RTK (Rust Token Killer) integration: binary availability, version, and config; token-savings summary only when the `doctorGain` option is on. Use when compressed output looks wrong or you want to verify the integration.',
    parameters: {
      gain: {
        type: 'boolean',
        description: 'Include the `rtk gain` savings dashboard (default false; requires config `doctorGain: true`).',
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
    execute: (args) =>
      runDoctorTool(args ?? {}, { rtkBin, doctorGain, autoRewrite, conservative, awareness, exec, timeoutMs }),
  })
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
  // 工厂形 effect（cordis 0.2.0-rc.1 实测：execute 当场跑、返回函数才是拆除器）：拆除时还原 resolve。
  // ⚠️ 勿写成 ctx.effect(() => { shell.resolve = origResolve }) 拆除器形——工厂语义下它当场还原、包壳即死
  //（2026-09-29 e2e 实锤：拆除器形 apply 后包壳存活=false，改写缝从未生效；工厂形存活=true、teardown 还原=true）
  ctx.effect(() => () => {
    shell.resolve = origResolve
  }, 'rtk-kit: resolve-rewrite')

  // ── ② 会话启动注入 awareness（随插件装卸，不污染 AGENTS.md）──
  const text = awarenessText(config.awareness)
  if (text) {
    ctx.on('agent/session-start', ({ agent }) => {
      try {
        agent.inject(
          createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: name },
          }),
        )
      } catch (error) {
        ctx.logger?.warn(`rtk-kit: awareness 注入失败：${String(error)}`)
      }
    })
  }

  // ── ③ rtk_doctor 诊断工具（吸收 pharaohnie 的 doctor 思想；永不暴露透传执行子命令）──
  if (config.registerDoctorTool) {
    ctx.tools.register(
      buildDoctorTool({
        rtkBin: config.rtkBin,
        doctorGain: config.doctorGain,
        autoRewrite: available,
        conservative: config.conservative,
        awareness: config.awareness,
      }),
    )
  }

  // ── ④ 设置页数据面（/api/rtk-kit/*）：webServer/connection 软依赖接线（照 wiki-steward/lib/index.js 同形）──
  //   内层子插件硬 inject ['webServer','connection'] 承载（provider 缺位=延迟激活不炸装载、到达自动补激活）；
  //   缺缝探测留痕（fail-open：跳过注册不炸装载）：双缺/半缺各留痕恰一；
  //   注册动作在 effect 执行体内当场跑、返回值=拆除器（工厂形语义）、拆除幂等。
  const softService = (svcName, probe) => {
    try {
      if (typeof ctx?.get === 'function') {
        const a = ctx.get(svcName)
        if (probe(a)) return a
        const b = ctx.get(svcName, false) // 非严格：提供者未激活也认（懒补接面）
        if (probe(b)) return b
      }
    } catch { /* cordis 代理在服务缺位时抛——走兜底 */ }
    try {
      if (probe(ctx?.[svcName])) return ctx[svcName]
    } catch { /* 同上 */ }
    return null
  }
  const wsProbe = softService('webServer', (s) => typeof s?.register === 'function')
  const connProbe = softService('connection', (s) => typeof s?.requestRejection === 'function')
  if (wsProbe === null && connProbe === null) {
    ctx.logger?.warn?.('[rtk-kit] webServer/connection 服务缝缺失，设置页数据面（/api/rtk-kit/*）未注册（fail-open：改写/awareness/工具面照常）')
  } else if ((wsProbe === null) !== (connProbe === null)) {
    ctx.logger?.warn?.('[rtk-kit] webServer/connection 服务缝半缺，设置页数据面（/api/rtk-kit/*）未注册（fail-open：改写/awareness/工具面照常）')
  }
  try {
    if (typeof ctx?.plugin === 'function') {
      ctx.plugin({
        inject: ['webServer', 'connection'],
        apply(c) {
          if (typeof c?.effect !== 'function') return // 缺 effect 缝=无拆除器路径，跳过注册（零残留）
          // 工厂形：注册当场跑、返回函数才是拆除器（registerDoctorRoutes 内部拆除幂等、收敛不抛）
          c.effect(
            () =>
              registerDoctorRoutes(c, {
                rtkBin: config.rtkBin,
                warn: (msg) => ctx.logger?.warn?.(msg),
              }),
            'rtk-kit: doctor-routes',
          )
        },
      })
    }
  } catch { /* ctx.plugin 缺位/异常 fail-open：装载不炸（等价宿主 _reload 兜底语义） */ }
}
