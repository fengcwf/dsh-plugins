// api — /ob/ JSON 接口客户端（API 形：成功 {data, total?}；失败 {error:{code,message}}）
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
