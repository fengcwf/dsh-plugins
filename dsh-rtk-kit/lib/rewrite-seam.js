// dsh-rtk-kit/rewrite-seam.js —— 改写缝挂载 + 进程内命中计数（观测与健康同源，禁第二套逻辑）
// ============================ Round 3 生产缺陷（A2）修复核心 ============================
// 生产现象（changes/2026-10-03-rtk-reinstall/reports/production-verify-report.md）：
//   0.4.0 装载正常（rtk_doctor 在场）但 `ctx.shell.resolve` 包壳零效果（history.db delta=0）。
// 宿主机制（只读排查结论）：shell 执行器是 cordis Service，宿主会在配置 reconcile /
//   executor 重载时 dispose + 重挂（`Fiber.restart()` = dispose + reload，新实例新 impl 对象）；
//   旧的**实例级**覆写只活在旧实例上，重载后不存活 → 缝未挂载。
// 挂法（抗重载，最小且可测的一种）：**原型级包壳**——把包壳挂在 resolve 属主（类原型，实例
//   自有属性时退回实例）上；宿主随后创建的同类新实例经原型链天然继承包壳，跨重载/跨 realm
//   存活。拆除做**身份校验**（只还原仍是自己的包壳），不误伤后挂者。
// 观测（FINDINGS-1/4）：挂载处 / 首命中处各一条 `[rtk-kit]` info 留痕 + 本模块计数器——
//   「装了没被调用」（有挂载痕、零首命中）vs「压根没装/被覆盖」（零挂载痕）日志可判。
// 健康（FINDINGS-2）：lib/doctor.js「自动改写缝已挂载」读本模块 hitCount（与首命中留痕同源）。
// ================================================================================

/** 日志锚（可检索；与 index.js 装载行同前缀）。 */
export const SEAM_LOG_ANCHOR = '[rtk-kit]'

/**
 * 包壳留痕出口（Round 4，fix round 2 判定 (A) 观测失效）：
 * 三锚（apply 装载 / 包壳已安装 / 包壳首次命中）此前只走 `ctx.logger.info`，而宿主 cordis
 * 在 web profile 下**只注册了两个 exporter**——内建 buffer（levels.default 缺省=1=silence，
 * 仅进内存环形缓冲，无人消费）+ app-boot 的 diagnostics（levels {default:2}=warn/error）。
 * 生产 dsh-web.log 全程 0 条 `[info]`、0 条其他插件的 info（334 行 `[login-gate]` 全部是
 * `console.log`，不是 logger）⇒ **三锚在宿主 info 出口上必然不可见**，观测链断在第一跳。
 * 修法：三锚除 logger.info 外**同文走 console**（stdout，被 start-dsh.sh 的 `>>$LOG 2>&1`
 * 重定向进 dsh-web.log —— login-gate 334 行实证该出口必然可见）。console 失败静默（绝不因
 * 留痕炸装载/命中路径）。
 * @param {string} msg - 已含 SEAM_LOG_ANCHOR 前缀的留痕文本
 */
function emitSeamLog(msg) {
  try {
    console.log(msg)
  } catch {
    /* 留痕出口失败绝不影响包壳路径 */
  }
}

/** 包壳标记（跨模块幂等判重 + teardown 身份校验；Symbol.for = 跨 realm 同一符号）。 */
const WRAP_MARK = Symbol.for('rtk-kit:rewrite-seam.wrapper')

/**
 * 进程内改写缝状态（唯一事实源：首命中留痕与健康项都读它，禁第二套逻辑）。
 * hitCount > 0 = 缝被真实调用（挂载并命中）；= 0 = 未挂载/未命中。
 */
export const rewriteSeamState = {
  mountCount: 0, // 成功挂载次数（重挂可观测）
  hitCount: 0, // 包壳被调用次数（>0 = 缝被真实使用）
  rewriteCount: 0, // 实际改写次数（command 被换写）
  passthroughCount: 0, // 恒等放行次数（含 stdin/不合格/超时/不安全）
  mountLevel: null, // 'prototype' | 'instance'（最近一次挂载面）
  lastMountAt: null,
  lastHitAt: null,
}

/** 状态快照（健康项/诊断读取口）。 */
export function snapshotRewriteSeamState() {
  return { ...rewriteSeamState }
}

/** 归零（测试隔离用；生产永不调用）。 */
export function resetRewriteSeamState() {
  rewriteSeamState.mountCount = 0
  rewriteSeamState.hitCount = 0
  rewriteSeamState.rewriteCount = 0
  rewriteSeamState.passthroughCount = 0
  rewriteSeamState.mountLevel = null
  rewriteSeamState.lastMountAt = null
  rewriteSeamState.lastHitAt = null
}

/** 找 `resolve` 的属主：实例自有属性优先，否则沿原型链上第一个拥有者（= 类方法面）。 */
function findResolveOwner(obj) {
  let cur = obj
  while (cur != null) {
    if (Object.prototype.hasOwnProperty.call(cur, 'resolve')) return cur
    cur = Object.getPrototypeOf(cur)
  }
  return obj
}

/**
 * 把命令改写包壳挂到 shell 服务的 `resolve` 上（原型级 = 抗宿主重载/重挂）。
 * @param {object} opts
 * @param {object} opts.shell - `ctx.shell`（cordis traceable 代理或裸 Service 实例均可）
 * @param {(request: object, spec: object) => object} opts.handle - 改写决策体（index.js 单源持有：
 *   stdin 跳过 / 惰性翻转 / decideEligibility / runRtkRewrite / isSafeRewrite；返回最终 spec）
 * @param {object} [opts.logger] - ctx.logger（info/debug 留痕缝）
 * @returns {{unmount: () => void, level: string, owner: object}}
 */
export function mountRewriteSeam({ shell, handle, logger } = {}) {
  // cordis traceable 代理可用 symbols.original 取裸实例；无 tracker 的裸对象直接用
  const raw = shell?.[Symbol.for('cordis.original')] ?? shell
  const owner = findResolveOwner(raw)
  const current = owner?.resolve
  // 幂等重挂：若属主上已是我方包壳，剥掉它、接续真正的原始方法（单层包壳，不链式叠娃）
  const prior = typeof current === 'function' ? current[WRAP_MARK] : undefined
  const orig = prior ? prior.orig : current
  if (typeof orig !== 'function') {
    throw new TypeError('rtk-kit: shell.resolve 不是函数，改写缝无法挂载')
  }
  let firstHit = true // 本包壳（本次挂载）首命中留痕恰一次
  const wrapper = function rtkRewriteSeam(request) {
    const spec = orig.call(this, request)
    rewriteSeamState.hitCount += 1 // 进程内命中计数（健康项读它——与留痕同一行、同一状态源）
    rewriteSeamState.lastHitAt = new Date().toISOString()
    if (firstHit) {
      firstHit = false
      const hitMsg = `${SEAM_LOG_ANCHOR} rewrite-seam 包壳首次命中（seam first hit, mount#${rewriteSeamState.mountCount} hit=${rewriteSeamState.hitCount}）`
      logger?.info?.(hitMsg)
      emitSeamLog(hitMsg) // Round 4：宿主 info 无出口 → 同文走 console（dsh-web.log 必然可见）
    }
    let out
    try {
      out = handle(request, spec)
    } catch (err) {
      logger?.debug?.(`${SEAM_LOG_ANCHOR} rewrite-seam 决策体异常恒等放行（fail-open）：${String(err?.message ?? err)}`)
      return spec
    }
    if (out?.command !== spec?.command) rewriteSeamState.rewriteCount += 1
    else rewriteSeamState.passthroughCount += 1
    return out
  }
  wrapper[WRAP_MARK] = { orig, owner }
  owner.resolve = wrapper
  const level = owner === raw ? 'instance' : 'prototype'
  rewriteSeamState.mountCount += 1
  rewriteSeamState.mountLevel = level
  rewriteSeamState.lastMountAt = new Date().toISOString()
  const mountMsg = `${SEAM_LOG_ANCHOR} rewrite-seam 包壳已安装（seam mounted, level=${level}）`
  logger?.info?.(mountMsg)
  emitSeamLog(mountMsg) // Round 4：宿主 info 无出口 → 同文走 console（dsh-web.log 必然可见）
  return {
    level,
    owner,
    // 身份校验还原：只有当前仍是「我的包壳」才还原为 orig——后挂者的包壳绝不误伤
    //（宿主重载顺序倒置时旧 teardown 迟到，正是生产缺陷的一类根因）。
    unmount() {
      if (owner.resolve === wrapper) owner.resolve = orig
    },
  }
}
