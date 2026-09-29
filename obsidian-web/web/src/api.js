// api — /ob/ JSON 接口客户端（API 形：成功 {data, total?}；失败 {error:{code,message}}）
// A5（p8-r3c-repro.md §3/§7）：AbortController + 读接口 8 秒超时中止——服务端挂起（如 /ob/api/backlinks
// 全库同步扫描 47.4s）不再无限等待；到期 ctrl.abort() 并上抛 name='TimeoutError'（可解释超时，
// 由 web/src/lib/load-state.js 归入 timeout 态）。阈值 LOAD_TIMEOUT_MS（8000，用户定稿）唯一源。
// F-1（ui-review 形 a）：200 但 body 非 JSON（null 信封，如反代错误页）上抛「响应不是有效 JSON（HTTP n）」
// → 经 load-state 归 error 态（可解释+重试），不再让 TypeError 逃出加载状态机（静默失败回归）。
// F-3（ui-review）：写接口（save/create/rename/delete 等长任务）不设前端超时（WRITE_TIMEOUT_MS=0）；
// 读/写超时与错误文案区分；写失败/超时后由调用方自动 reloadTree() 兜底（App.vue / node-actions）。
import { buildDownloadUrl, dispositionFilename } from './lib/download.js'
import { LOAD_TIMEOUT_MS, isTimeoutError } from './lib/load-state.js'

/** 写接口不设前端超时（F-3 长任务语义：全库改链 47s 级慢写——杀超时只会让用户在服务端仍在执行时得到误导性二次错误） */
const WRITE_TIMEOUT_MS = 0
/** 写超时提示（F-3：与读超时文案区分——写结果不确定，先刷新目录对齐服务端事实再决定是否重试） */
const WRITE_TIMEOUT_HINT = '服务端可能仍在执行，请先刷新目录再决定是否重试'

async function requestJson(url, options = {}) {
  const { timeoutMs = LOAD_TIMEOUT_MS, write = false, ...init } = options
  const ctrl = new AbortController()
  let timedOut = false
  const timer = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, timeoutMs)
    : null
  try {
    const res = await fetch(url, {
      ...init,
      headers: { accept: 'application/json', ...init.headers },
      signal: ctrl.signal,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(body?.error?.message ?? (write ? `写入失败（HTTP ${res.status}）` : `请求失败（HTTP ${res.status}）`))
    }
    if (body == null) {
      // F-1 形 a：200 非 JSON 信封 → 可解释错误（含「JSON」），经 load-state 归 error 态（零静默失败）
      throw new Error(write ? `写入响应不是有效 JSON（HTTP ${res.status}）` : `响应不是有效 JSON（HTTP ${res.status}）`)
    }
    return body
  } catch (e) {
    if (timedOut || isTimeoutError(e)) {
      throw Object.assign(new Error(write ? `写入超时：${WRITE_TIMEOUT_HINT}` : `请求超时：${Math.round(timeoutMs / 1000)} 秒内未收到响应`), {
        name: 'TimeoutError',
        timeoutMs,
      })
    }
    throw e
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

export function fetchTree() {
  return requestJson('/ob/api/tree')
}

// F-2：读包装层透传 options（requestJson 已收 options.timeoutMs——测试可注入短超时锁中止链；
// 缺省=LOAD_TIMEOUT_MS 读 8s，行为不变）
export function fetchFile(path, options) {
  return requestJson(`/ob/api/file?path=${encodeURIComponent(path)}`, options)
}

export function fetchBacklinks(path, options) {
  return requestJson(`/ob/api/backlinks?path=${encodeURIComponent(path)}`, options)
}

// 搜索（T3）：{data:{backend,degraded,query,results}, total}；score=排序权重非匹配概率（语义句在面板描述位）
export function fetchSearch(q, limit) {
  const params = new URLSearchParams({ q })
  if (limit != null) params.set('limit', String(limit))
  return requestJson(`/ob/api/search?${params}`)
}

// 写通道（F-3）：默认写语义=不设前端超时（WRITE_TIMEOUT_MS=0）+ 写错误/超时文案；
// 读计算型 POST（fetchRender）显式 { write:false } 回读语义（维持 8s）。
function postJson(url, payload, options = {}) {
  const { write = true, ...rest } = options
  return requestJson(url, {
    timeoutMs: write ? WRITE_TIMEOUT_MS : LOAD_TIMEOUT_MS,
    write,
    ...rest,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...rest.headers },
    body: JSON.stringify(payload),
  })
}

// 保存（T4/OW-INV-3）：lock={expectedMtime|etag} 必带（无乐观锁不落盘，服务端同拒）；
// 返回 {data:{ok,...,diffUndo}} 或冲突 {data:{conflict:true,diffUndo:{before,incoming}}}（三选材料）
export function saveFile(path, content, lock) {
  return postJson('/ob/api/save', { path, content, ...lock })
}

// live 渲染（T4 分屏预览；ARC-1：前端零 markdown 解析，预览 HTML 全出自服务端唯一渲染源）
// 渲染=读计算（write:false）：维持读 8s，不随写长任务语义挂起
export function fetchRender(content) {
  return postJson('/ob/api/render', { content }, { write: false })
}

// 删除（T6/OW-US-6、OW-INV-5）：confirm=目标相对路径全等复述（服务端缺省拒，确认先于副作用）；
// 返回 {data:{ok, path, trashPath, warnings}}（ok:false 时 reason/message 给 UI 决策）
export function deleteFile(path, confirm) {
  return postJson('/ob/api/delete', { path, confirm })
}

// 改名/移动（T13 rename UI 入口 / T5 事务）：payload={from, to, overwrite?:true}（载荷复核
// web/src/lib/rename-view.js buildRenamePayload——overwrite 仅显式 true 随行，OW-INV-5 永不静默覆盖）；
// 返回 {data:{ok, from, to, reason, message, changed[], rolledBack, warnings[]}}（域结果 200 信封）
export function postRename(payload) {
  return postJson('/ob/api/rename', payload)
}

// 下载（T7/OW-US-7、OW-INV-9）：单 md=文本流、目录=zip 流；域拒（限额超限/回收站/门拒）走
// 200 {data:{ok:false, reason, message}} 信封（T5/T6 惯例）——按 content-type 分流非信封流与信封拒。
// origin：浏览器同源相对寻址留空；测试传宿主 base（Node 无 origin）。
export async function fetchDownload(path, origin = '') {
  const res = await fetch(`${origin}${buildDownloadUrl(path)}`)
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await res.json().catch(() => null)
    const data = body?.data ?? {}
    return {
      ok: false,
      reason: data.reason ?? `http-${res.status}`,
      message: data.message ?? body?.error?.message ?? `请求失败（HTTP ${res.status}）`,
    }
  }
  if (!res.ok) return { ok: false, reason: `http-${res.status}`, message: `请求失败（HTTP ${res.status}）` }
  const blob = await res.blob()
  return {
    ok: true,
    blob,
    filename: dispositionFilename(res.headers.get('content-disposition'), path.split('/').pop() || 'download'),
    contentType,
  }
}

// ── 分享管理（T10 / OW-US-10）+ 设置（OW-US-9）────────────────────────────────
// 红线「禁止半路拼分享 URL」：前端零拼接——分享链接一律取服务端下发 data.share.links
//（{path, internal, external}，内外网地址都显示），本文件与组件不含任何分享 URL 路径段拼接。
export function fetchShares() {
  return requestJson('/ob/api/shares')
}

export function postShareCreate(payload) {
  return postJson('/ob/api/shares/create', payload)
}

export function postShareRevoke(token) {
  return postJson('/ob/api/shares/revoke', { token })
}

// payload={role, password?|autoPassword?}（升写强制密码——UI buildRolePayload + 服务端双保险）
export function postShareRole(token, payload) {
  return postJson('/ob/api/shares/role', { token, ...payload })
}

export function fetchShareSettings() {
  return requestJson('/ob/api/share-settings')
}

export function postShareSettings(patch) {
  return postJson('/ob/api/share-settings', patch)
}

// ── vault 目录档案（T12/OW-US-13）：列表/新增/删除/健康检查/切换 ────────────────────
// 切换语义（T11 交接）：activate 返回 restartRequired:true——运行期根不热改，重启生效（见 message）。
export function fetchVaultProfiles() {
  return requestJson('/ob/api/vault-profiles')
}

export function addVaultProfile(name, profilePath) {
  return postJson('/ob/api/vault-profiles/add', { name, path: profilePath })
}

export function deleteVaultProfile(id) {
  return postJson('/ob/api/vault-profiles/delete', { id })
}

// payload={id} 或 {path} 双入口 → {data:{health:{readable,writable,latencyMs,samples,status}}}
export function checkVaultProfileHealth(payload) {
  return postJson('/ob/api/vault-profiles/health', payload)
}

export function activateVaultProfile(id) {
  return postJson('/ob/api/vault-profiles/activate', { id })
}
