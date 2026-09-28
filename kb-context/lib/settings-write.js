// settings-write — kb-context 设置面写路径（配置展示/可改）：可改白名单 + 合并校验 + configEditor 缝。
// 契约（裁定 2026-09-28）：kb-context 加客户端模块+设置命名空间（triggers.words/entityPaths、budget、
// timeoutMs、scope 展示+可改——热改语义本就支持 per-call 读）；写路径走 ctx.webServer API（沿 wiki-steward
// 同款官方形，见 lib/settings-routes.js）→ host configEditor 缝（@deepseek-ai/dsh-config-editor——
// dsh-settings 服务同款持久化缝：校验→落 profile patch→reconcile 热生效）。
// 纪律：白名单外叶子=整单拒（not_editable，绝不静默丢键）；hotMap/vaultRoot 只读展示（裁定枚举外）；
// 合并=对象深合并、数组整替；校验=真 zod（Config.safeParse 合并后的生效面 inherited∪current∪patch）。

/** 可改字段白名单（叶子路径）：触发词面/索引实体、注入预算、检索超时、作用域 */
export const EDITABLE_PATHS = Object.freeze([
  Object.freeze(['triggers', 'words']),
  Object.freeze(['triggers', 'entityPaths']),
  Object.freeze(['budget', 'maxSnippets']),
  Object.freeze(['budget', 'maxTokens']),
  Object.freeze(['timeoutMs']),
  Object.freeze(['scope', 'indexAll']),
  Object.freeze(['scope', 'grepOnDemand']),
])

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 收集 patch 全部叶子路径（数组/标量=叶子） */
function leafPaths(value, prefix = [], out = []) {
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) out.push(prefix) // 空对象=叶子（拒绝：白名单里没有空对象路径）
    for (const k of keys) leafPaths(value[k], [...prefix, k], out)
  } else {
    out.push(prefix)
  }
  return out
}

function samePath(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** 路径在白名单内（叶子全等） */
export function isEditablePath(path) {
  return EDITABLE_PATHS.some((p) => samePath(p, path))
}

function mergeInto(base, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(base[k])) mergeInto(base[k], v)
    else base[k] = v // 数组/标量整替
  }
  return base
}

function getPath(obj, path) {
  let cur = obj
  for (const k of path) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined
    cur = cur[k]
  }
  return cur
}

/** 按白名单从 patch 抽出最小写入形（只含白名单叶子；未含的键绝不落盘） */
function projectEditable(patch) {
  const out = {}
  for (const p of EDITABLE_PATHS) {
    const v = getPath(patch, p)
    if (v === undefined) continue
    let node = out
    for (const k of p.slice(0, -1)) node = node[k] ??= {}
    node[p[p.length - 1]] = v
  }
  return out
}

/**
 * 补丁白名单预检（纯函数）：形非法/空/白名单外叶子=结构化失败。
 * createApplyPatch 在触达持久化缝**之前**先过此检（不可改字段绝不叫醒 edit）。
 * @param {object} patch 本次补丁
 * @returns {{ok:true} | {ok:false, code:string, message:string}}
 */
export function checkPatchEditable(patch) {
  if (!isPlainObject(patch)) return { ok: false, code: 'bad_patch', message: 'patch 必须是对象' }
  const leaves = leafPaths(patch).filter((p) => p.length > 0)
  if (leaves.length === 0) return { ok: false, code: 'bad_patch', message: 'patch 为空（无可改叶子）' }
  for (const p of leaves) {
    if (!isEditablePath(p)) {
      return { ok: false, code: 'not_editable', message: `字段 ${p.join('.')} 不在可改白名单（仅可改：${EDITABLE_PATHS.map((x) => x.join('.')).join('、')}）` }
    }
  }
  return { ok: true }
}

/**
 * 合并+校验一次设置写入（纯函数，真 zod 校验）。
 * @param {{inherited?:object, current:object, patch:object}} args 生效面三层：继承层/当前覆盖层/本次补丁
 * @param {import('zod').ZodType} Config 插件 Config（zod）
 * @returns {{ok:true, config:object, parsed:object} | {ok:false, code:string, message:string}}
 */
export function applyEditablePatch({ inherited = {}, current = {}, patch }, Config) {
  const pre = checkPatchEditable(patch)
  if (!pre.ok) return pre
  const minimal = projectEditable(patch) // 白名单外的键绝不进写入形（双保险：上面已整单拒）
  const effective = mergeInto(structuredClone(inherited), structuredClone(current))
  mergeInto(effective, minimal)
  const parsed = Config.safeParse(effective)
  if (!parsed.success) {
    return { ok: false, code: 'invalid', message: `配置校验失败：${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` }
  }
  return { ok: true, config: mergeInto(structuredClone(current), minimal), parsed: parsed.data }
}

/**
 * 宿主写缝：configEditor.edit（dsh-settings 服务同款持久化缝）。缺缝/缺入口/校验失败=结构化失败，
 * 绝不抛穿路由。
 * @param {object} args
 * @param {{entries:Function, edit:Function}} args.configEditor 宿主 configEditor 服务
 * @param {string} args.entryId 本插件 loader 行 id（cordis.patch.yml insert 行 id）
 * @param {object} args.Config zod Config
 * @returns {(patch:object)=>Promise<{ok:boolean, config?:object, code?:string, message?:string}>}
 */
export function createApplyPatch({ configEditor, entryId, Config }) {
  return async function applyPatch(patch) {
    try {
      const pre = checkPatchEditable(patch) // 白名单预检：不可改字段绝不触达持久化缝
      if (!pre.ok) return pre
      const entries = typeof configEditor?.entries === 'function' ? configEditor.entries() : []
      const entry = entries.find((e) => e?.options?.id === entryId)
      if (entry === undefined) {
        return { ok: false, code: 'no_entry', message: `配置入口 ${entryId} 不在活动表（插件未挂载或被替换）` }
      }
      let applied = null
      await configEditor.edit(entry, (current, inherited) => {
        const r = applyEditablePatch({ inherited: inherited ?? {}, current: current ?? {}, patch }, Config)
        if (!r.ok) {
          const err = new Error(r.message)
          err.code = r.code
          throw err
        }
        applied = r.config
        return r.config
      })
      return { ok: true, config: applied }
    } catch (e) {
      return { ok: false, code: typeof e?.code === 'string' ? e.code : 'edit_failed', message: String(e?.message ?? e) }
    }
  }
}
