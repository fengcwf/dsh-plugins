// delete-confirm — 删除双确认纯逻辑（OW-US-6 / OW-INV-5）：confirm=目标相对路径全等复述。
// 双保险两道（wiki-steward crud 教训同款语义，独立实现）：
//   ① UI 复核：confirmMatches 未过不出载荷（buildDeletePayload 返 null=不发请求，按钮禁用）
//   ② 服务端复核：deletePath 确认检查先于一切副作用，缺省/不符一律拒（缺省拒）
// 严格全等（不 trim/不改大小写）：错字/空白/大小写差异一律不匹配——复述确认的意义就在逐字。

/** 全等复述判定：typed 必须逐字等于目标相对路径（缺省/空值/空目标一律 false） */
export function confirmMatches(typed, path) {
  return typeof typed === 'string' && typed !== ''
    && typeof path === 'string' && path !== ''
    && typed === path
}

/** 客户端 crud 复核（schema required + 复核双保险）：匹配才出删除载荷，否则 null（不发请求） */
export function buildDeletePayload(path, typed) {
  return confirmMatches(typed, path) ? { path, confirm: typed } : null
}
