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
import { DEFAULT_TIMEOUT_MS, defaultLogPath } from './install.js'
import { findRtkBin, resolveRtkBin } from './resolve-bin.js'

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

/**
 * 探测 rtk 是否可用；缺失时整个插件退化为恒等（与 DeepTrial 同款 fail-safe）。
 * 二进制发现（resolve-bin 单源）：入参先经 resolveRtkBin 解析——config 原值（F-FINAL-1(i) 调用形）重跑
 * 发现（PATH → 官方落点兜底），已解析路径形幂等透传（A3）；绝不绕过发现逻辑。
 * @param {string} rtkBin - config.rtkBin 原值（或已解析结果，A3 透传）
 * @param {object} [resolveEnv] - 解析注入缝（测试 mkdtemp 注入；缺省真实环境）
 */
export function probeRtk(rtkBin, resolveEnv) {
  const bin = resolveRtkBin(rtkBin, resolveEnv)
  try {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore', timeout: 3000 })
    return r.status === 0
  } catch {
    return false
  }
}

/** 调 `rtk rewrite` 拿改写结果。⚠️ 只认非空 stdout（0.49.0 成功码 = 3，见 rewrite.js）。
 *  二进制发现同 probeRtk（resolve-bin 单源：F-FINAL-1(i) 种子=config 原值每调用重发现，窗口 a 功能恢复面）。 */
function runRtkRewrite(rtkBin, command, timeoutMs, resolveEnv) {
  const bin = resolveRtkBin(rtkBin, resolveEnv)
  try {
    const r = spawnSync(bin, ['rewrite', command], {
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
  resolveEnv,
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
      runDoctorTool(args ?? {}, { rtkBin, doctorGain, autoRewrite, conservative, awareness, exec, timeoutMs, resolveEnv }),
  })
}

/**
 * 插件装载（cordis 入口：apply(ctx, rawConfig)）。
 * @param {object} ctx 宿主 ctx（shell/tools 缝 + effect/on/logger；webServer/connection 走软依赖子插件）
 * @param {object} rawConfig 配置（Config 零新键：安装面落点/超时全走代码默认 + deps 注入缝，红线 4）
 * @param {object} [deps] 安装面引擎注入缝（Task 3；cordis 只传两参 = 零行为差异）：
 *   {installEngine, installDir, logPath, timeoutMs, tmpdir, verifyTimeoutMs, exec, fetch, now, fs,
 *    resolveEnv, platform, arch}——exec/fetch/now/fs = 引擎 IO 注入缝（测试用）；
 *   落点/超时缺省 = 代码默认（~/.local/bin、~/.dsh/dsh-rtk-kit/install-log.json、60000ms）。
 */
export function apply(ctx, rawConfig, deps = {}) {
  const config = Config.parse(rawConfig ?? {})
  // 解析布景注入缝（测试用；缺省真实环境）——probe/rewrite/惰性复检/数据面共用（resolve-bin 契约）。
  const resolveEnv = deps.resolveEnv
  // F-FINAL-1(i)（Ruling 2026-10-04 种子修正）：**重解析种子=config 原值**（缺省裸名 'rtk'）——probeRtk /
  // runRtkRewrite / 惰性翻转 / rtk_doctor / 设置页数据面各调用点经 resolve-bin 单源**重发现**（A2 兜底：
  // PATH → ~/.local/bin → /usr/local/bin → /opt/homebrew/bin），不再「apply 解析一次向下传递」：
  // 解析后值当种子会把发现钉死到 boot 命中位（该位被删/装落他位即自愈不闭合，终审 F-FINAL-1 根因）。
  // 显式配置仍 A3 原值透传零覆盖（resolve-bin.js 语义面不动）。
  const rtkBin = config.rtkBin
  // F-03（Ruling b 2026-10-04）：available 只在装载期定初值，运行期经① 包壳惰性 stat 复检翻转（自愈不等重启）；
  // 禁每命令 spawnSync 复检（健康路径零开销）。
  let available = config.enabled && probeRtk(rtkBin, resolveEnv)

  // ── ① 命令改写：包一层 ctx.shell.resolve（与挂载哪个 executor 无关，沙箱语义原样保留）──
  const shell = ctx.shell
  const origResolve = shell.resolve.bind(shell)
  shell.resolve = (request) => {
    const spec = origResolve(request)
    try {
      // 模型驱动的调用 stdin 恒为空；hook-runner / 进程内插件会带 stdin payload —— 后者永不改写
      if (request.stdin != null) return spec
      if (!available) {
        // F-03（Ruling b 2026-10-04）：失能态惰性 stat 复检——仅 available=false 时查（stat 级零 spawn，
        // 健康路径零开销）；装后/外部手装自愈翻转不等重启；enabled:false 总开关语义不变（恒等放行不翻转）。
        // F-FINAL-1(i)：翻转判据与 runRtkRewrite 同种子=config 原值（findRtkBin(config.rtkBin,…)，窗口 a 功能恢复面）。
        if (!config.enabled || !findRtkBin(rtkBin, resolveEnv).found) return spec
        available = true
      }
      const d = decideEligibility(spec.command, { conservative: config.conservative, exclude: config.exclude })
      if (!d.eligible) return spec
      const rewritten = runRtkRewrite(rtkBin, spec.command, config.rewriteTimeoutMs, resolveEnv)
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
        rtkBin,
        doctorGain: config.doctorGain,
        autoRewrite: available,
        conservative: config.conservative,
        awareness: config.awareness,
        resolveEnv,
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
          c.effect(() => {
            try {
              // Task 3：安装面引擎 opts（跨卡契约 installOpts 形）——rtkBin=重解析种子 config 原值（F-FINAL-1(i)；
              // install 路由每请求 findRtkBin 重发现后作引擎输入）；
              // 落点/超时走代码默认 + deps 注入缝（红线 4：Config 零新键、cordis.patch.yml 零改动）。
              // exec/fetch/now/fs=引擎 IO 注入缝（测试用；undefined 时引擎 normalizeOpts 落真实默认）。
              const installOpts = {
                rtkBin,
                installDir: deps.installDir, // 落点单源（NEEDS_CONTEXT ① 方案②）：未注入=lib/install.js normalizeOpts 缺省（官方 install.sh 落点），本文件零落点字面
                logPath: deps.logPath ?? defaultLogPath(), // 兼作重装记录面落点（INV-10）
                timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                tmpdir: deps.tmpdir,
                verifyTimeoutMs: deps.verifyTimeoutMs,
                exec: deps.exec,
                fetch: deps.fetch,
                now: deps.now,
                fs: deps.fs,
              }
              return registerDoctorRoutes(c, {
                rtkBin,
                // 数据面执行缝（fix round 3，F-01 现象根因）：deps.exec 必须穿到 handler —— 此前只进
                // installOpts（引擎 IO），数据面三动作（version/gain/health）走 doctor.js 缺省真实
                // execFile；布景注入的假执行器到不了 handler → 布景「boot 真缺失」被真机 PATH 上的
                // rtk 顶掉（布景泄漏到真机）。生产 deps 缺省 → 仍走真实 execFile（零行为差异）。
                exec: deps.exec,
                resolveEnv: deps.resolveEnv,
                platform: deps.platform,
                arch: deps.arch,
                installEngine: deps.installEngine, // undefined = registerDoctorRoutes 缺省 reinstallRtk
                installOpts,
                warn: (msg) => ctx.logger?.warn?.(msg),
              })
            } catch (err) {
              // fail-open（INV-4）：引擎装配/注册链路失败（install.js 静态 import 在装载图内，模块级损坏不可 fail-open）只 logger.warn 不炸插件（改写/awareness/工具面照常）
              ctx.logger?.warn?.(`[rtk-kit] 设置页数据面注册失败（fail-open：改写/awareness/工具面照常）：${String(err?.message ?? err)}`)
              return () => {} // 注册失败=无拆除器路径（noop 保持 effect 契约、拆除幂等）
            }
          }, 'rtk-kit: doctor-routes')
        },
      })
    }
  } catch (err) {
    // T3-F-1：外层 catch 必须留痕（与 :209/:249 缺缝/注册失败留痕口径对齐）——静默零留痕=此类故障无迹可查
    ctx.logger?.warn?.(`[rtk-kit] 数据面子插件装配失败（fail-open：装载不炸，等价宿主 _reload 兜底语义）：${String(err?.message ?? err)}`)
  }
}
