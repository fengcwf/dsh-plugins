// vault-profiles-view — vault 目录档案 UI 纯函数（T12/OW-US-13）：健康状态标签、探针摘要、
// 表单校验（载荷复核双保险——服务端同判）、换 vault 提示（T10 提示面：重启生效+各配）。
// 测试锁形：test/web-vault-profile-view.test.mjs。

/** 换 vault 提示（T10：外网域名等设置随 vault 各配；切换需重启生效——不冒充热改） */
export function switchHint() {
  return '切换 vault 需重启/重载插件生效；外网域名等设置随 vault 各配（每个 vault 单独配置）。'
}

/** 健康三探针状态 → 徽标（ok/degraded/unreachable） */
export function healthBadge(status) {
  if (status === 'ok') return { label: '健康', type: 'success' }
  if (status === 'degraded') return { label: '降级（慢盘/只读）', type: 'warning' }
  return { label: '不可达（不可读）', type: 'danger' }
}

/** 探针摘要一目了然：可读/可写/延迟（OW-US-13 三探针） */
export function probeSummary(health) {
  const mark = (ok) => (ok ? '✓' : '✗')
  return `可读 ${mark(health.readable.ok)}｜可写 ${mark(health.writable.ok)}｜延迟 ${health.latencyMs ?? '-'}ms`
}

/** 档案表单校验（载荷复核：不过不出载荷；服务端 vault-profiles.js 同判双保险） */
export function validateProfileForm(form) {
  const name = typeof form?.name === 'string' ? form.name.trim() : ''
  if (name === '' || name.length > 64) return { ok: false, error: '名称必须是 1-64 字符非空名称' }
  const p = form?.path
  if (typeof p !== 'string' || p === '') return { ok: false, error: '路径必须是已挂载 SMB/NFS 绝对路径' }
  if (p.includes('\0')) return { ok: false, error: '路径含非法字符' }
  if (!p.startsWith('/')) return { ok: false, error: '路径必须是绝对路径（已挂载 SMB/NFS 路径）' }
  return { ok: true }
}
