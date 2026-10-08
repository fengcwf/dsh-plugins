// dsh-login-gate — DeepSeek Harness 登录门禁插件（入口）
// 设计来源（源码分析见 README「致谢与机制来源」）：
//   clarknu/dsh-gateway    — scrypt 自描述哈希、HMAC 会话、secret 实时轮换、fail-closed
//   Aztech-Lab/dsh-3301    — 原生 DSH 会话获取（credentials.yaml 铸造 + authenticatedUrl API）、
//                             表单登录（密码每次登录只过线一次）、scrypt 参数、权限收紧
//   534119219/chicheng-gate— 门禁与 DSH 端口分层（网关端口 → 3080）、明文禁存
//   hongshuxifan321/dsh-mobile-app server/plugin — Cordis 插件生命周期（apply + ctx.effect）、
//                             Host/Origin loopback 改写、WS 隧道与逐跳头清理
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { createSessionManager } from './auth.js'
import { createRateLimiter } from './ratelimit.js'
import { loadUsers, createUserProvider } from './users.js'
import { createDshSession } from './dsh-session.js'
import { createForwarder } from './proxy.js'
import { createGateServer } from './gate.js'
import { createApplyPatch, createConfigReader, readEntryConfig } from './settings-write.js'
import { registerSettingsRoutes } from './settings-routes.js'
import { filterAnonymousRules } from './anon-rules.js'

export const name = 'login-gate'
export const inject = [] // 不依赖宿主服务 API：任何 dsh 版本均可加载（会话注入走 A/B/C 兼容链）

export const Config = z.object({
  enabled: z.boolean().default(true),
  listenHost: z.string().default('127.0.0.1'),
  port: z.number().min(1).max(65535).default(3500),
  upstreamPort: z.number().min(1).max(65535).default(3080),
  rewriteHost: z.boolean().default(true),
  sessionDays: z.number().min(1).max(3650).default(30),
  maxFailures: z.number().min(1).default(5),
  secureCookie: z.boolean().default(true),
  wsAllow: z.array(z.string()).default(['^/api/']),
  // HTTP 匿名放行前缀（正则串数组；**默认空 = 零开口**，行为与未配置时逐字一致）。
  // 命中 = 免会话直通（仍然只走 forwarder.forward，响应体不由门禁改写）；仅 GET/HEAD 放行。
  httpAnonymous: z.array(z.string()).default([]),
  gzipPass: z.boolean().default(true),
  users: z.record(z.string(), z.string()).default({}),
  usersFile: z.string().optional(),
})

// 数据面收口（2026-09-30）：门禁数据落源码位插件数据目录（旧落点 $DSH_HOME/login-gate/ 已废弃，
// 由 migrateLegacyGateData 启动一次性迁移）——~/.dsh 根目录不再产生门禁文件。
function gateDir() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'dsh-login-gate', 'data')
}
function secretFile() {
  return join(gateDir(), 'secret')
}

/**
 * 遗留落点一次性迁移（2026-09-30 数据面收口）：旧 `$DSH_HOME/login-gate/*`（secret/accounts.txt/
 * breakglass.txt/users.json/last-good-plugin.tar.gz 等）→ gateDir()。逐文件「新家已有=不覆盖」；
 * rename 同盘原子（0600 权限位随 inode 保留）；**无遗留 = 零副作用**（不 mkdir）；迁空后 rmdir。
 * 失败不阻塞加载——error 由 apply 留痕告警（INV-15 禁静默），旧落点留人工处置。
 */
export function migrateLegacyGateData() {
  const legacyDir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'login-gate')
  const target = gateDir()
  const moved = []
  if (!existsSync(legacyDir)) return { moved }
  try {
    for (const name of readdirSync(legacyDir)) {
      const from = join(legacyDir, name)
      const to = join(target, name)
      if (existsSync(to)) continue // 新家已有=不覆盖（防旧副本反灌）
      mkdirSync(target, { recursive: true })
      renameSync(from, to)
      moved.push(name)
    }
    try { rmdirSync(legacyDir) } catch { /* 残留（非空）= 留人工处置 */ }
    return { moved }
  } catch (e) {
    return { moved, error: String(e?.message ?? e) }
  }
}

/** 读取或创建会话签名 secret（0600） */
function loadOrCreateSecret() {
  const f = secretFile()
  try {
    if (existsSync(f)) {
      const v = readFileSync(f, 'utf8').trim()
      if (v) return v
    }
  } catch { /* fallthrough: 重新生成 */ }
  const secret = randomBytes(32).toString('base64')
  try {
    mkdirSync(gateDir(), { recursive: true })
    writeFileSync(f, secret, { mode: 0o600 })
  } catch { /* 只读文件系统等：退回内存 secret（重启后会话失效，不影响可用性） */ }
  return secret
}

/** 防御性归一化：宿主未做 schema 校验时也能工作 */
function normalize(raw, log) {
  const c = raw ?? {}
  // 安全边界键：非字符串项一律丢弃（数字 123 会变成未锚定正则 /123/，匹配面不可控）；
  // 坏规则（未锚定 / 纯通配 / 零宽锚点 / 目标不绝对）按 lib/anon-rules.js 契约一并丢弃并留痕
  // （复审 F1：规则内容只校验「可编译」不校验「不构成通配」→ 写入面与装载层**双道**判据）。
  const anon = filterAnonymousRules(c.httpAnonymous)
  const httpAnonymous = anon.rules
  if (anon.dropped.length) {
    for (const d of anon.dropped) {
      const shown = typeof d.rule === 'string' ? JSON.stringify(d.rule) : Object.prototype.toString.call(d.rule)
      log?.(`⚠️ httpAnonymous 规则已丢弃（${d.reason}）：${shown}（合法形=以 ^ 开头、目标为 / 绝对前缀、非通配）`)
    }
  }
  return {
    enabled: c.enabled !== false,
    listenHost: typeof c.listenHost === 'string' && c.listenHost ? c.listenHost : '127.0.0.1',
    port: Number.isInteger(c.port) && c.port > 0 ? c.port : 3500,
    upstreamPort: Number.isInteger(c.upstreamPort) && c.upstreamPort > 0 ? c.upstreamPort : 3080,
    rewriteHost: c.rewriteHost !== false,
    sessionDays: Number.isInteger(c.sessionDays) && c.sessionDays > 0 ? c.sessionDays : 30,
    maxFailures: Number.isInteger(c.maxFailures) && c.maxFailures > 0 ? c.maxFailures : 5,
    secureCookie: c.secureCookie !== false,
    wsAllow: Array.isArray(c.wsAllow) && c.wsAllow.length ? c.wsAllow.map(String) : ['^/api/'],
    httpAnonymous,
    gzipPass: c.gzipPass !== false,
    users: c.users && typeof c.users === 'object' ? c.users : {},
    usersFile: typeof c.usersFile === 'string' && c.usersFile ? c.usersFile : undefined,
  }
}

export function apply(ctx, rawConfig) {
  const log = (...args) => {
    const line = args.join(' ')
    try { ctx.logger?.info?.(line) } catch { /* logger 不可用时仅控制台 */ }
    console.log('[login-gate] ' + line)
  }
  // 数据面收口（2026-09-30）：遗留 $DSH_HOME/login-gate/ 一次性迁移（无遗留零副作用；失败留痕不阻塞）
  const mig = migrateLegacyGateData()
  if (mig.error) log('⚠️ 遗留门禁数据迁移失败（旧落点留人工处置）：' + mig.error)
  else if (mig.moved.length) log('遗留门禁数据已迁移至 plugins/dsh-login-gate/data/：' + mig.moved.join(', '))

  const cfg = normalize(rawConfig, log)
  if (!cfg.enabled) return

  const { users, warnings, usersFile } = loadUsers({ users: cfg.users, usersFile: cfg.usersFile })
  warnings.forEach((w) => log('⚠️ ' + w))
  // 热加载账号表：usersFile 变更（hash-password.mjs --write）无需重启
  const getUsers = createUserProvider({ users: cfg.users, usersFile: cfg.usersFile })

  // secret 持有器：logout-all 时轮换并持久化 → 全部已发会话立即作废（dsh-gateway 机制）
  const holder = { secret: loadOrCreateSecret() }
  const rotateSecret = () => {
    holder.secret = randomBytes(32).toString('base64')
    try { writeFileSync(secretFile(), holder.secret, { mode: 0o600 }) } catch { /* 内存态轮换 */ }
  }

  const sessions = createSessionManager({ getSecret: () => holder.secret })
  const limiter = createRateLimiter({ maxFailures: cfg.maxFailures })
  const dshSession = createDshSession({ ctx, upstreamPort: cfg.upstreamPort, log })
  const strip = new Set([sessions.cookieName]) // 门禁会话 cookie 不转发给上游
  const forwarder = createForwarder({
    upstreamHost: '127.0.0.1',
    upstreamPort: cfg.upstreamPort,
    rewriteHost: cfg.rewriteHost,
    gzipPass: cfg.gzipPass,
    wsAllow: cfg.wsAllow,
    getNativeCookie: () => dshSession.ensure(),
    stripCookieNames: strip,
    onUpstreamUnauthorized: () => dshSession.invalidate(),
  })

  const userCount = Object.keys(users).length
  if (userCount === 0) {
    log(`⚠️ 未配置任何登录用户（fail-closed）：所有人将看到配置提示页。配置方式：`)
    log(`   1) usersFile（推荐）：node tools/hash-password.mjs --write <用户名>   生成并写入 ${usersFile}`)
    log(`   2) 或在 settings.yaml 的 login-gate 配置里填写 users（值为 scrypt$... 哈希）`)
  }

  // ---- 设置面数据面（/api/login-gate/settings，官方路由形，照 kb-context B1/B2）----
  // B1 双层子插件形：外层不动（门禁/反代照常）；设置面数据由内层子插件硬 inject
  // ['webServer','connection'] 承载——provider 缺位=延迟激活不炸装载、到达自动补激活。
  // configEditor 不进硬 inject（保持可缺位=只读部署如实）：per-request 惰性 ctx.get 求值，
  // 缺位=POST 503 write_unavailable、GET writable:false 如实，后到可见。
  // 服务 best-effort 探测（只读、不抛、不参与注册决策）：cordis 代理在服务缺位时可能抛 → 收敛 null
  const probeService = (name) => {
    try { if (typeof ctx?.get === 'function') return ctx.get(name) ?? ctx.get(name, false) ?? null } catch { /* 探针收敛不抛 */ }
    return null
  }
  // R-12：GET 配置=已保存面优先（configEditor entry 现读 overlay written∪boot），缺缝/缺入口回退 rawConfig；
  // 语义=「返回已保存值」（R-16：写入经宿主 re-apply 即时生效，实测推翻重启假设——tester F-1）
  const readCfg = createConfigReader({
    getBase: () => rawConfig,
    readSaved: () => readEntryConfig(probeService('configEditor'), 'login-gate'),
    normalize: (c) => normalize(c, log), // 同款坏规则丢条+告警（设置面现读路径亦不留静默）
  })
  const lazyApplyPatch = () => {
    const svc = probeService('configEditor')
    if (svc === null || typeof svc.edit !== 'function' || typeof svc.entries !== 'function') return null
    return createApplyPatch({ configEditor: svc, entryId: 'login-gate', Config })
  }
  // F-2（Task 14）：半缺缝告警判据=注册实际结果——启动期探针会误报（webServer 服务尚未就绪时判「半缺」、
  // 稍后注入到位注册成功），故不在 apply() 期探；注册现场判定见 effect 执行体内（注入成功不告警/失败才 warn）。
  // B2：注册动作在 effect 执行体内当场跑、返回值=拆除器；catch 收敛环覆盖已返回的 disposers
  try {
    if (typeof ctx?.plugin === 'function') {
      ctx.plugin({
        inject: ['webServer', 'connection'],
        apply(c) {
          if (typeof c?.effect !== 'function') return // 假 ctx 缺 effect 缝=跳过注册不告警
          c.effect(() => {
            const disposers = []
            try {
              // F-2：注册现场判定服务缝（此刻注入面为真值，非启动期探针快照）——只到其一=接线异常如实
              // 留痕；注入齐=注册成功不告警；注册抛错=下方 F7 收敛告警（行为不变，只动告警逻辑）。
              if ((c?.webServer == null) !== (c?.connection == null)) {
                log('⚠️ webServer/connection 服务缝半缺（注册现场判定，接线异常留痕），设置面数据（/api/login-gate/settings）注册面不完整（fail-open：门禁/反代照常）')
              }
              const routeDisposers = registerSettingsRoutes({
                register: (spec) => c.webServer.register(spec),
                connection: c.connection,
                getConfig: readCfg, // 已保存面优先现读（R-12）
                getUsers,
                usersFile,
                getApplyPatch: lazyApplyPatch, // configEditor 惰性（后到可见）
                getSession: (req) => sessions.verifyCookie(req.headers.cookie), // 防自锁身份源①（直连/回环）
                warn: (line) => log(line),
              })
              for (const d of routeDisposers) if (typeof d === 'function') disposers.push(d) // F8：非函数不进收敛环
            } catch (e) {
              for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } }
              throw e // 再上抛（宿主 fiber 兜底收集；绝不吞错）
            }
            let disposed = false
            return () => {
              if (disposed) return
              disposed = true
              for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } }
            }
          }, 'login-gate: settings-routes')
        },
      })
    }
  } catch (e) {
    // F7：fail-open 不吞痕——留一行（含 e.name；警告纪律不插值 e.message）
    log(`⚠️ 设置面注册失败（${e?.name ?? 'Error'}），本部署无设置面数据（fail-open：门禁/反代照常）`)
  }

  ctx.effect(() => {
    const server = createGateServer({
      users,
      getUsers,
      sessions,
      limiter,
      forwarder,
      onLogoutAll: rotateSecret,
      sessionMode: () => dshSession.mode(),
      secureCookie: cfg.secureCookie,
      sessionDays: cfg.sessionDays,
      httpAnonymous: cfg.httpAnonymous,
      log,
    })
    server.on('error', (e) => log(`门禁监听失败：${e.message}（检查端口 ${cfg.port} 是否被占用/监听地址是否可用）`))
    try {
      server.listen(cfg.port, cfg.listenHost, () => {
        log(`登录门禁已启动：http://${cfg.listenHost}:${cfg.port} → 127.0.0.1:${cfg.upstreamPort}`)
        log(`账号数：${userCount}（usersFile: ${usersFile}）；会话 ${cfg.sessionDays} 天；失败锁定：连续 ${cfg.maxFailures} 次后指数退避`)
        log(`反代姿态：Host/Origin 改写=${cfg.rewriteHost ? '开（loopback 形式，安全边界=本门禁登录）' : '关（需自行配置 dsh trustedHosts）'}；WS 放行：${cfg.wsAllow.join(', ')}`)
        if (cfg.httpAnonymous.length) {
          log(`⚠️ HTTP 匿名放行已开启（前缀×GET/HEAD 双锁，响应仍由上游决定）：${cfg.httpAnonymous.join(', ')}`)
        }
      })
    } catch (e) {
      log(`门禁启动异常：${e.message}`)
    }
    return () => {
      try { server.close() } catch { /* 已关闭 */ }
      log('已停止（登录门禁已关闭）')
    }
  }, 'login-gate: 表单登录门禁与认证反代')
}
