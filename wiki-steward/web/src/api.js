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
    fetchLogs: (limit, cursor, filters) => {
      const q = new URLSearchParams()
      if (limit != null) q.set('limit', String(limit))
      if (cursor != null) q.set('cursor', String(cursor))
      // 筛选扩参（Phase 8 反馈轮④）：since/until/type 仅置位才发（缺省=现状行为，向后兼容）；
      // 空串值（如 type= 全不选）如实透传——与缺席可区分
      for (const [k, v] of Object.entries(filters ?? {})) {
        if (v != null) q.set(k, String(v))
      }
      const qs = q.toString()
      return requestJson(`${base}/ingest/logs${qs === '' ? '' : `?${qs}`}`)
    },
    scan: () => requestJson(`${base}/ingest/scan`, { method: 'POST' }),
    distill: () => requestJson(`${base}/ingest/distill`, { method: 'POST' }),
    // ── Hindsight 同步面（2026-10-07 波 t12）：端点=文档相对 api/wiki-steward/hindsight/*——
    //    无前导斜杠（B 卡实测坑：前导斜杠绕文档基址 404）。base 由挂载缝注入 'api/wiki-steward'
    //    （lib/client.js API_BASE 同值）；口径=lib/hindsight-routes.js 4 端点 + settings 写面（时间热改）。
    fetchHindsightStatus: () => requestJson(`${base}/hindsight/status`),
    fetchHindsightSyncLog: (since, until) => {
      const q = new URLSearchParams()
      if (since) q.set('since', String(since))
      if (until) q.set('until', String(until))
      const qs = q.toString()
      return requestJson(`${base}/hindsight/sync-log${qs === '' ? '' : `?${qs}`}`)
    },
    syncHindsight: () => requestJson(`${base}/hindsight/sync`, { method: 'POST' }),
    toggleHindsight: (enabled) =>
      requestJson(`${base}/hindsight/toggle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: Boolean(enabled) }),
      }),
    // 同步时间热改走 Hindsight 专属写面（R-29 唯一写入口：/hindsight/settings，3 叶白名单）——
    // 通用 /settings 已摘 hindsight 叶（整单拒），面板写路径不再穿通用白名单面
    saveHindsightSettings: (patch) =>
      requestJson(`${base}/hindsight/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch }),
      }),
    // 通用设置面写入（rows 表单消费；hindsight 键已摘——not_editable 整单拒）
    saveSettings: (patch) =>
      requestJson(`${base}/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patch }),
      }),
  }
}
