// api — /wiki-steward/api JSON 接口客户端（API 形：成功 {data}；失败 {error:{code,message}}，
// 与 kb/obsidian-web web/src/api.js 惯例一致）。
async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `请求失败（HTTP ${res.status}）`)
  }
  return body.data
}

/** @param {string} base 形如 '/wiki-steward/api' */
export function createApi(base) {
  return {
    fetchSettings: () => requestJson(`${base}/ingest/settings`),
    fetchLogs: (limit, cursor) => {
      const q = new URLSearchParams()
      if (limit != null) q.set('limit', String(limit))
      if (cursor != null) q.set('cursor', String(cursor))
      const qs = q.toString()
      return requestJson(`${base}/ingest/logs${qs === '' ? '' : `?${qs}`}`)
    },
    scan: () => requestJson(`${base}/ingest/scan`, { method: 'POST' }),
    distill: () => requestJson(`${base}/ingest/distill`, { method: 'POST' }),
  }
}
