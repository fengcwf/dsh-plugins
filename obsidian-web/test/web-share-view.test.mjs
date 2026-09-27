// 分享管理展示纯函数（T10 / OW-US-10）：web/src/lib/share-view.js——状态派生/链接行/表单载荷复核。
// 组件容器/展示分离（frontend-ui-engineering）：.vue 只做展示，业务逻辑全落纯函数（单测锁形）。
// ⑤ UI 侧镜像：写权限强制密码（OW-INV-1）在表单载荷层同样强制（auto 兜底），服务端再复核（双保险）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shareStatus,
  statusLabel,
  describeRole,
  linkRows,
  formatTime,
  buildCreatePayload,
  buildPasswordSpec,
  buildRolePayload,
} from '../web/src/lib/share-view.js'

const NOW = 1_700_000_000_000

// ── 状态派生（查看计数/状态列展示口径）────────────────────────────────────────
test('shareStatus：撤销/一次性消耗/过期/生效 四态派生优先级（revoked > consumed > expired > active）', () => {
  assert.equal(shareStatus({ revoked: true, consumedAt: NOW, expiresAt: NOW - 1 }, NOW), 'revoked', '撤销优先')
  assert.equal(shareStatus({ consumedAt: NOW, expiresAt: NOW - 1 }, NOW), 'consumed', '消耗次之')
  assert.equal(shareStatus({ expiresAt: NOW - 1 }, NOW), 'expired')
  assert.equal(shareStatus({ expiresAt: NOW + 1 }, NOW), 'active')
  assert.equal(shareStatus({ expiresAt: null }, NOW), 'active', '永不过期=生效')
  assert.equal(shareStatus(null, NOW), 'unknown')
  assert.equal(statusLabel({ revoked: true }, NOW), '已撤销')
  assert.equal(statusLabel({}, NOW), '生效中')
})

test('describeRole/formatTime：角色与时间展示（缺省形安全）', () => {
  assert.equal(describeRole('read'), '只读')
  assert.equal(describeRole('write'), '可写')
  assert.equal(describeRole('???'), '未知')
  assert.equal(formatTime(null), '—', '空时间占位')
  assert.equal(formatTime(undefined), '—')
  assert.equal(typeof formatTime(NOW), 'string')
})

// ── 链接行（OW-US-9：内外网地址都显示；前端零拼接只渲染服务端 links）───────────
test('linkRows：内网/外网两行恒显（外网未配置=空串占位引导设置页），不改写 URL', () => {
  const rows = linkRows({ internal: 'http://192.168.1.10:3500/ob_share/tok', external: 'https://s.example.com/ob_share/tok' })
  assert.deepEqual(rows, [
    { kind: '内网', url: 'http://192.168.1.10:3500/ob_share/tok' },
    { kind: '外网', url: 'https://s.example.com/ob_share/tok' },
  ])
  const bare = linkRows({ internal: 'http://h:1/ob_share/tok', external: null })
  assert.equal(bare[0].kind, '内网')
  assert.equal(bare[1].kind, '外网')
  assert.equal(bare[1].url, '', '外网未配置=空串占位（组件显式提示，非隐藏一行）')
  assert.deepEqual(linkRows(null), [{ kind: '内网', url: '' }, { kind: '外网', url: '' }], '缺 links 安全形')
})

// ── 表单载荷复核（组件零业务逻辑；⑤ 写权限强制密码 UI 镜像）──────────────────
test('buildCreatePayload：目标必填/角色锁定/ttlDays 整形化/oneShot 布尔化', () => {
  const payload = buildCreatePayload({ target: '  notes/a.md ', role: 'read', passwordMode: 'none', ttlDays: '7.9', oneShot: true })
  assert.deepEqual(payload, { target: 'notes/a.md', role: 'read', oneShot: true, ttlDays: 7 })
  assert.equal(buildCreatePayload({ target: '  ', role: 'read' }), null, '空目标不出载荷')
  assert.equal(buildCreatePayload({ target: 'a.md', role: 'read', passwordMode: 'custom', password: '' }), null, '自定义密码空串不出载荷')
  assert.equal(buildCreatePayload(null), null)
})

test('⑤ buildCreatePayload：写权限禁无密码（none 自动兜底 autoPassword），与 OW-INV-1 双保险', () => {
  const forced = buildCreatePayload({ target: 'notes', role: 'write', passwordMode: 'none' })
  assert.deepEqual(forced, { target: 'notes', role: 'write', oneShot: false, autoPassword: true }, '写+无密码模式 → 强制自动生成')
  const custom = buildCreatePayload({ target: 'notes', role: 'write', passwordMode: 'custom', password: 'pw123' })
  assert.deepEqual(custom, { target: 'notes', role: 'write', oneShot: false, password: 'pw123' })
})

test('buildPasswordSpec/buildRolePayload：改密三态 + 升写无密码拒（null 载荷=UI 阻止提交）', () => {
  assert.deepEqual(buildPasswordSpec({ passwordMode: 'auto' }), { autoPassword: true })
  assert.deepEqual(buildPasswordSpec({ passwordMode: 'custom', password: 'pw' }), { password: 'pw' })
  assert.deepEqual(buildPasswordSpec({ passwordMode: 'clear' }), { password: null })
  assert.equal(buildPasswordSpec({ passwordMode: 'custom', password: '' }), null, '自定义空密码不出载荷')
  assert.equal(buildPasswordSpec({ passwordMode: 'none' }), null, '未选模式不出载荷')
  const up = buildRolePayload({ role: 'write', passwordMode: 'auto' })
  assert.deepEqual(up, { role: 'write', autoPassword: true })
  assert.equal(buildRolePayload({ role: 'write', passwordMode: 'none' }), null, '升写无密码=不出载荷（按钮禁用双保险）')
  assert.deepEqual(buildRolePayload({ role: 'read', passwordMode: 'none' }), { role: 'read' }, '降读无需密码')
  assert.deepEqual(buildRolePayload({ role: 'read', passwordMode: 'custom', password: 'pw' }), { role: 'read', password: 'pw' })
})
