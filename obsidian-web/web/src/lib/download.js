// download — 前端下载纯逻辑（T7：OW-US-7 / OW-INV-9）：URL 构造 / Content-Disposition 回读 /
// 浏览器落盘缝 / 下载编排。组件零业务逻辑（T2/T4 纪律）；DOM 缝显式注入（view-state 注入 localStorage 同款）。
// 服务端域拒走 200 {data:{ok:false, reason, message}} 信封（T5/T6 惯例）——编排层按 ok 分流：
//   流（blob）→ 落盘；域拒/异常 → onError 可解释提示（限额超限绝不静默）。

/** 下载 URL（path 全量 percent-encode；相对寻址=同域 3080 惯例） */
export function buildDownloadUrl(path) {
  return `/ob/api/download?path=${encodeURIComponent(path)}`
}

/** Content-Disposition 回读：filename*=UTF-8''pct 优先（RFC 5987），filename= 兜底，缺失/坏编码回退 fallback */
export function dispositionFilename(headerValue, fallback = 'download') {
  const v = String(headerValue ?? '')
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(v)
  if (star) {
    try {
      const decoded = decodeURIComponent(star[1])
      if (decoded) return decoded
    } catch { /* 坏编码：落 filename= 兜底 */ }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/.exec(v)
  if (quoted && quoted[1]) return quoted[1]
  const bare = /filename\s*=\s*([^;]+)/.exec(v)
  if (bare && bare[1].trim()) return bare[1].trim()
  return fallback
}

/** 浏览器落盘（DOM 缝显式注入）：objectURL → a[download] 点击 → revoke 回收 */
export function saveBlob(blob, filename, env) {
  const e = env ?? { doc: globalThis.document, url: globalThis.URL }
  const href = e.url.createObjectURL(blob)
  const a = e.doc.createElement('a')
  a.href = href
  a.download = filename
  e.doc.body.appendChild(a)
  a.click()
  a.remove()
  e.url.revokeObjectURL(href)
}

/**
 * 下载编排（App 只接线）：成功=落盘一次；域拒/请求异常=onError 提示（不落盘、不静默）。
 * @param io {{fetchDownload: (path) => Promise<any>, saveBlob: (blob, filename) => void, onError: (message) => void}}
 */
export async function runDownload(path, io) {
  try {
    const r = await io.fetchDownload(path)
    if (!r.ok) {
      io.onError(`下载被拒（${r.reason}）：${r.message}`)
      return r
    }
    io.saveBlob(r.blob, r.filename)
    return r
  } catch (err) {
    const message = String(err?.message ?? err)
    io.onError(message)
    return { ok: false, reason: 'request-failed', message }
  }
}
