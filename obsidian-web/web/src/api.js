// api — /ob/ JSON 读接口客户端（API 形：成功 {data, total?}；失败 {error:{code,message}}）
async function requestJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
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
