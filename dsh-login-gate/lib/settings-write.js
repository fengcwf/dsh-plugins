// dsh-login-gate — 设置面写路径：可写白名单 + 合并校验（真 zod）+ 端口预检 + configEditor 缝。
// 契约来源：changes/2026-09-29-login-gate-settings TECH.md ADR-002/003 + task-11-context.md 裁定。
// 纪律：
//   - 白名单外/只读键携带 = 整单拒 not_editable（绝不静默丢键）；listenHost/upstreamPort/rewriteHost 只读展示。
//   - 值域预检在触达持久化缝之前：port 整数 1-65535（brief 裁定 4）、wsAllow 正则可编译
//     （坏正则写入会让 proxy.js apply 期 `new RegExp` 炸装载——写入面直接拒）。
//   - 端口可绑定性探测（net.createServer().listen 探测后立即 close）：占用拒 port_in_use + 占用提示；
//     port 未变更不探测（探测自身 listener 必误报）。
//   - R-16（2026-09-29 实测推翻重启假设，tester F-1）：配置写入经宿主 re-apply **即时生效**——
//     无 restartRequired 面（boot 比较/pendingRestart latch 已废），响应面 applied:true 恒定；
//     插件不主动重绑监听（INV-1），重绑由宿主重 apply 驱动；端口保存前 UI 警示断连（事前警示）。
//   - configEditor 缝（createApplyPatch）：change 形按 kb-context/lib/settings-write.js 契约
//     （edit(entry, cb) 的 cb 返回写入形），缺缝/缺入口/校验失败=结构化失败，绝不抛穿路由。
import net from 'node:net'
import { anonRuleRejection, ANON_RULE_LIMITS } from './anon-rules.js'

/** 可写白名单（顶层键）；其余键只读/不可见，POST 携带=整单拒 */
export const EDITABLE_KEYS = Object.freeze(['port', 'sessionDays', 'maxFailures', 'secureCookie', 'wsAllow', 'gzipPass', 'httpAnonymous'])

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 补丁白名单预检（纯函数）：形非法/空/白名单外叶子=结构化失败。
 * @param {object} patch 本次补丁
 * @returns {{ok:true} | {ok:false, code:'invalid'|'not_editable', message:string}}
 */
export function checkPatchEditable(patch) {
  if (!isPlainObject(patch)) return { ok: false, code: 'invalid', message: 'patch 必须是对象' }
  const keys = Object.keys(patch)
  if (keys.length === 0) return { ok: false, code: 'invalid', message: 'patch 为空（没有可写字段）' }
  for (const k of keys) {
    if (!EDITABLE_KEYS.includes(k)) {
      return {
        ok: false,
        code: 'not_editable',
        message: `字段「${k}」不可写（可写：${EDITABLE_KEYS.join('、')}；只读：listenHost、upstreamPort、rewriteHost）`,
      }
    }
  }
  return { ok: true }
}

const isInt = (v) => Number.isInteger(v)

/**
 * 值域预检（纯函数）：整数/布尔/正则可编译。zod Config 不含 .int() 约束且不查正则，
 * 这里补足 brief 裁定 4 的「整数 1-65535」与 wsAllow 可用性（坏正则=装载炸，必须写入面拒）。
 */
export function checkPatchValues(patch) {
  if (!isPlainObject(patch)) return { ok: false, code: 'invalid', message: 'patch 必须是对象' }
  if ('port' in patch && !(isInt(patch.port) && patch.port >= 1 && patch.port <= 65535)) {
    return { ok: false, code: 'invalid', message: '端口必须是 1-65535 的整数' }
  }
  if ('sessionDays' in patch && !(isInt(patch.sessionDays) && patch.sessionDays >= 1 && patch.sessionDays <= 3650)) {
    return { ok: false, code: 'invalid', message: '会话天数必须是 1-3650 的整数' }
  }
  if ('maxFailures' in patch && !(isInt(patch.maxFailures) && patch.maxFailures >= 1)) {
    return { ok: false, code: 'invalid', message: '失败锁定次数必须是不小于 1 的整数' }
  }
  for (const k of ['secureCookie', 'gzipPass']) {
    if (k in patch && typeof patch[k] !== 'boolean') return { ok: false, code: 'invalid', message: `字段「${k}」必须是布尔值` }
  }
  if ('wsAllow' in patch) {
    const v = patch.wsAllow
    if (!Array.isArray(v)) return { ok: false, code: 'invalid', message: 'wsAllow 必须是字符串数组' }
    for (const rule of v) {
      if (typeof rule !== 'string' || rule === '') return { ok: false, code: 'invalid', message: 'wsAllow 每条必须是非空字符串' }
      if (rule === 'any') continue // 通配记号（proxy.js 语义），豁免正则检查
      try {
        new RegExp(rule) // eslint-disable-line no-new
      } catch {
        return { ok: false, code: 'invalid', message: `wsAllow 不是合法正则：${rule}` }
      }
    }
  }
  if ('httpAnonymous' in patch) {
    const v = patch.httpAnonymous
    if (!Array.isArray(v)) return { ok: false, code: 'invalid', message: 'httpAnonymous 必须是字符串数组' }
    if (v.length > ANON_RULE_LIMITS.maxCount) {
      return { ok: false, code: 'invalid', message: `httpAnonymous 最多 ${ANON_RULE_LIMITS.maxCount} 条规则` }
    }
    for (const rule of v) {
      // 安全边界键：**不提供 'any' 式通配**（wsAllow 的 any 只作用于 WS 握手，此处放行的是 HTTP 面）
      // 且规则内容须满足**锚定前缀**契约（与装载层 index.js/gate.js 共用 lib/anon-rules.js 同一判据）：
      // 拒空串 / 拒纯通配（.*、.+、^/.* 等可匹配任意路径形）/ 拒零宽锚点（^、^$）/
      // 拒未锚定（须 ^ 开头，保证「精确前缀」语义不可退化为「路径包含」）/ 拒目标非绝对路径。
      // 只查「可编译」不查「不构成通配」= 一次误配即把整站翻成匿名免登（复审 F1 Critical）。
      const why = anonRuleRejection(rule)
      if (why) {
        return {
          ok: false, code: 'invalid',
          message: `httpAnonymous 规则不合法：${why}（${typeof rule === 'string' ? JSON.stringify(rule) : Object.prototype.toString.call(rule)}；合法形=以 ^ 开头的 / 绝对前缀，如 '^/ob_share/'）`,
        }
      }
    }
  }
  return { ok: true }
}

/** 白名单 + 值域合并预检 */
export function validatePatch(patch) {
  const pre = checkPatchEditable(patch)
  if (!pre.ok) return pre
  return checkPatchValues(patch)
}

/**
 * 合并+校验一次设置写入（纯函数，真 zod 校验）。
 * @param {{inherited?:object, current:object, patch:object}} args 生效面三层：继承层/当前覆盖层/本次补丁
 * @param {import('zod').ZodType} Config 插件 Config（zod）
 * @returns {{ok:true, config:object, effective:object} | {ok:false, code:string, message:string}}
 */
export function applyEditablePatch({ inherited = {}, current = {}, patch }, Config) {
  const pre = validatePatch(patch)
  if (!pre.ok) return pre
  const minimal = {} // 白名单投影：未含的键绝不落盘（双保险，上面已整单拒）
  for (const k of EDITABLE_KEYS) {
    if (Object.hasOwn(patch, k)) minimal[k] = patch[k]
  }
  const effective = { ...structuredClone(inherited), ...structuredClone(current), ...minimal }
  const parsed = Config.safeParse(effective)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid',
      message: `配置校验失败：${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
    }
  }
  return { ok: true, config: { ...structuredClone(current), ...minimal }, effective: parsed.data }
}

/**
 * 端口可绑定性探测：bind 探测后立即 close。返回 true=可绑定、false=被占用/不可用。
 * @param {number} port 目标端口
 * @param {string} [host] 监听地址（与门禁 listenHost 同值）
 */
export function probePortBindable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.listen({ port, host }, () => {
      srv.close(() => resolve(true))
    })
  })
}

/**
 * 端口写入预检：port 未变更不探测（自身 listener 占用即误报）；变更→可绑定性探测。
 * @param {{patch:object, current:object, probePort?:(port:number, host:string)=>Promise<boolean>}} args
 * @returns {Promise<{ok:true} | {ok:false, code:'port_in_use', message:string}>}
 */
export async function precheckPort({ patch, current, probePort = probePortBindable }) {
  if (!isPlainObject(patch) || !Object.hasOwn(patch, 'port')) return { ok: true }
  const currentPort = (current ?? {}).port
  if (patch.port === currentPort) return { ok: true }
  const host = typeof (current ?? {}).listenHost === 'string' && current.listenHost ? current.listenHost : '127.0.0.1'
  const free = await probePort(patch.port, host)
  if (!free) {
    return { ok: false, code: 'port_in_use', message: `端口 ${patch.port} 已被占用（${host}），请更换端口或先释放占用该端口的进程` }
  }
  return { ok: true }
}

/**
 * 宿主写缝：configEditor.edit（dsh-settings 服务同款持久化缝）。缺缝/缺入口/校验失败=结构化失败，
 * 绝不抛穿路由。change 形按 kb-context/lib/settings-write.js createApplyPatch 契约：
 * edit(entry, cb) 的 cb(current, inherited) 返回写入形（current∪白名单补丁）。
 * @param {object} args
 * @param {{entries:Function, edit:Function}} args.configEditor 宿主 configEditor 服务
 * @param {string} args.entryId 本插件 loader 行 id（cordis.patch.yml insert 行 id）
 * @param {object} args.Config zod Config
 * @returns {(patch:object)=>Promise<{ok:boolean, config?:object, effective?:object, code?:string, message?:string}>}
 */
export function createApplyPatch({ configEditor, entryId, Config }) {
  return async function applyPatch(patch) {
    try {
      const pre = validatePatch(patch) // 预检：不可改字段/坏值绝不触达持久化缝
      if (!pre.ok) return pre
      const entries = typeof configEditor?.entries === 'function' ? configEditor.entries() : []
      const entry = entries.find((e) => e?.options?.id === entryId)
      if (entry === undefined) {
        return { ok: false, code: 'no_entry', message: `配置入口 ${entryId} 不在活动表（插件未挂载或被替换）` }
      }
      let applied = null
      let effective = null
      await configEditor.edit(entry, (current, inherited) => {
        const r = applyEditablePatch({ inherited: inherited ?? {}, current: current ?? {}, patch }, Config)
        if (!r.ok) {
          const err = new Error(r.message)
          err.code = r.code
          throw err
        }
        applied = r.config
        effective = r.effective
        return r.config
      })
      return { ok: true, config: applied, effective }
    } catch (e) {
      return { ok: false, code: typeof e?.code === 'string' ? e.code : 'edit_failed', message: String(e?.message ?? e) }
    }
  }
}

/**
 * 读 configEditor entry 的已保存显式配置（R-12）：entries() 现读 `entry.options.config`
 * （dsh-config-editor 实测形：edit() 的 current 即 structuredClone(entry.options.config ?? {})）。
 * 缺缝/缺入口/异常→null（调用方回退 base）。
 */
export function readEntryConfig(configEditor, entryId) {
  try {
    if (typeof configEditor?.entries !== 'function') return null
    const entry = configEditor.entries().find((e) => e?.options?.id === entryId)
    const saved = entry?.options?.config
    return isPlainObject(saved) ? saved : null
  } catch {
    return null
  }
}

/**
 * 已保存面优先配置现读（R-12）：saved（configEditor entry 现读）overlay 于 base（boot/rawConfig），
 * saved 键优先（written∪boot）；缺缝回退 base；normalize 补 zod 缺省。
 * 语义=「GET 返回已保存值」（R-16：写入经宿主 re-apply 即时生效，无「生效需重启」面）。
 */
export function createConfigReader({ getBase, readSaved = () => null, normalize = (x) => x }) {
  return () => {
    let saved = null
    try {
      saved = readSaved()
    } catch {
      saved = null // 现读失败按缺位收敛（回退 base，绝不抛穿 GET）
    }
    const base = getBase() ?? {}
    return normalize({ ...base, ...(isPlainObject(saved) ? saved : {}) })
  }
}
