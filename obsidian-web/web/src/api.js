// api — /ob/ JSON 接口客户端（API 形：成功 {data, total?}；失败 {error:{code,message}}）
import { buildDownloadUrl, dispositionFilename } from './lib/download.js'
async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `请求失败（HTTP ${res.status}）`)
  }
  return body
}

export function fetchTree() {
  return requestJson('/ob/api/tree')
}

export function fetchFile(path) {
  return requestJson(`/ob/api/file?path=${encodeURIComponent(path)}`)
}

export function fetchBacklinks(path) {
  return requestJson(`/ob/api/backlinks?path=${encodeURIComponent(path)}`)
}

// 搜索（T3）：{data:{backend,degraded,query,results}, total}；score=排序权重非匹配概率（语义句在面板描述位）
export function fetchSearch(q, limit) {
  const params = new URLSearchParams({ q })
  if (limit != null) params.set('limit', String(limit))
  return requestJson(`/ob/api/search?${params}`)
}

function postJson(url, payload) {
  return requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// 保存（T4/OW-INV-3）：lock={expectedMtime|etag} 必带（无乐观锁不落盘，服务端同拒）；
// 返回 {data:{ok,...,diffUndo}} 或冲突 {data:{conflict:true,diffUndo:{before,incoming}}}（三选材料）
export function saveFile(path, content, lock) {
  return postJson('/ob/api/save', { path, content, ...lock })
}

// live 渲染（T4 分屏预览；ARC-1：前端零 markdown 解析，预览 HTML 全出自服务端唯一渲染源）
export function fetchRender(content) {
  return postJson('/ob/api/render', { content })
}

// 删除（T6/OW-US-6、OW-INV-5）：confirm=目标相对路径全等复述（服务端缺省拒，确认先于副作用）；
// 返回 {data:{ok, path, trashPath, warnings}}（ok:false 时 reason/message 给 UI 决策）
export function deleteFile(path, confirm) {
  return postJson('/ob/api/delete', { path, confirm })
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

// spec={password|null, autoPassword?}（改密三态；写权限清密码=服务端拒，OW-INV-1）
export function postSharePassword(token, spec) {
  return postJson('/ob/api/shares/password', { token, ...spec })
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
