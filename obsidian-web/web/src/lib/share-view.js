// share-view — 分享管理展示纯函数（T10 / OW-US-9/10）：状态派生/链接行/表单载荷复核。
// 组件容器/展示分离（frontend-ui-engineering）：.vue 只做展示，业务逻辑全落本模块（单测锁形）。
// 红线：本模块与组件零拼接分享 URL（前端只渲染服务端下发 links——OW-US-9 根治 URL 拼接坑；
// 分享路径段只存在于服务端 share.js SHARE_URL_PREFIX + share-links.buildShareLinks）。
// ⑤ UI 侧双保险：写权限强制密码（OW-INV-1）在表单载荷层同样强制（无既有密码=必须给密码/自动生成），
// 服务端再复核（updateShareRole/createShare 不变量）。

/** 分享状态派生（优先级：撤销 > 一次性消耗 > 过期 > 生效）——管理列表状态列展示口径 */
export function shareStatus(share, now = Date.now()) {
  if (!share || typeof share !== 'object') return 'unknown'
  if (share.revoked === true) return 'revoked'
  if (share.consumedAt != null) return 'consumed'
  if (share.expiresAt != null && now >= share.expiresAt) return 'expired'
  return 'active'
}

export const STATUS_LABELS = Object.freeze({
  active: '生效中',
  revoked: '已撤销',
  consumed: '已消耗',
  expired: '已过期',
  unknown: '未知',
})

export function statusLabel(share, now = Date.now()) {
  return STATUS_LABELS[shareStatus(share, now)]
}

export function describeRole(role) {
  return role === 'read' ? '只读' : role === 'write' ? '可写' : '未知'
}

export function formatTime(ms) {
  if (ms == null) return '—'
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

/** 链接行（OW-US-9：内外网地址都显示）：内网/外网两行恒显——外网未配置=空串占位引导设置页 */
export function linkRows(links) {
  return [
    { kind: '内网', url: links?.internal ?? '' },
    { kind: '外网', url: links?.external ?? '' },
  ]
}

function passwordSpec(mode, form) {
  if (mode === 'auto') return { autoPassword: true }
  if (mode === 'custom') {
    const pw = String(form?.password ?? '')
    return pw === '' ? null : { password: pw }
  }
  if (mode === 'clear') return { password: null }
  return null // none 或非法形
}

/** 改密载荷复核：三态（auto/custom/clear）——空自定义密码/未选模式不出载荷 */
export function buildPasswordSpec(form) {
  return passwordSpec(form?.passwordMode, form)
}

/** 新建分享载荷复核：目标必填、角色锁定、写禁无密码（none 自动兜底 autoPassword）、ttlDays 整形化 */
export function buildCreatePayload(form) {
  if (!form || typeof form !== 'object') return null
  const target = String(form.target ?? '').trim()
  if (target === '') return null
  const role = form.role === 'write' ? 'write' : 'read'
  const mode = ['none', 'auto', 'custom'].includes(form.passwordMode) ? form.passwordMode : 'none'
  const effective = role === 'write' && mode === 'none' ? 'auto' : mode // OW-INV-1：写必有密码（自动兜底）
  const payload = { target, role, oneShot: form.oneShot === true }
  if (effective !== 'none') {
    const spec = passwordSpec(effective, form)
    if (spec === null) return null
    Object.assign(payload, spec)
  }
  const ttl = Number(form.ttlDays)
  if (Number.isFinite(ttl) && ttl > 0) payload.ttlDays = Math.floor(ttl)
  return payload
}

/** 角色/密码调整载荷复核：升写无密码（且无既有密码）=不出载荷；写不可清密码（OW-INV-1 双保险） */
export function buildRolePayload(form) {
  if (!form || typeof form !== 'object') return null
  const role = form.role === 'write' ? 'write' : form.role === 'read' ? 'read' : null
  if (role === null) return null
  const mode = ['none', 'auto', 'custom', 'clear'].includes(form.passwordMode) ? form.passwordMode : 'none'
  const payload = { role }
  if (mode !== 'none') {
    const spec = passwordSpec(mode, form)
    if (spec === null) return null
    if (role === 'write' && spec.password === null) return null // 写不可清密码
    Object.assign(payload, spec)
  } else if (role === 'write' && form.hasPassword !== true) {
    return null // 升写且无既有密码：必须给密码或自动生成
  }
  return payload
}
