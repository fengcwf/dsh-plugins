// 分享管理展示纯函数（T10 / OW-US-10）：web/src/lib/share-view.js——状态派生/链接行/表单载荷复核。
// 组件容器/展示分离（frontend-ui-engineering）：.vue 只做展示，业务逻辑全落纯函数（单测锁形）。
// ⑤ UI 侧镜像：写权限强制密码（OW-INV-1）在表单载荷层同样强制（auto 兜底），服务端再复核（双保险）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  shareStatus,
  statusLabel,
  describeRole,
  linkRows,
  formatTime,
  buildCreatePayload,
  buildRolePayload,
  shareRowView,
  targetTypeLabel,
} from '../web/src/lib/share-view.js'

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs))
    else out.push(abs)
  }
  return out
}

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

test('改密三态合流 buildRolePayload（T13：密码调整全走 postShareRole 载荷）+ 升写无密码拒', () => {
  assert.deepEqual(buildRolePayload({ role: 'read', passwordMode: 'auto' }), { role: 'read', autoPassword: true })
  assert.deepEqual(buildRolePayload({ role: 'read', passwordMode: 'custom', password: 'pw' }), { role: 'read', password: 'pw' })
  assert.deepEqual(buildRolePayload({ role: 'read', passwordMode: 'clear', hasPassword: true }), { role: 'read', password: null }, '清除=载荷合流（服务端 updateShareRole 同调清）')
  assert.equal(buildRolePayload({ role: 'read', passwordMode: 'custom', password: '' }), null, '自定义空密码不出载荷')
  assert.equal(buildRolePayload({ role: 'bogus' }), null, '非法角色不出载荷')
  assert.deepEqual(buildRolePayload({ role: 'read', passwordMode: 'none' }), { role: 'read' }, '不修改密码=role-only 载荷')
  assert.equal(buildRolePayload({ role: 'write', passwordMode: 'clear', hasPassword: true }), null, '写不可清密码（OW-INV-1）')
  const up = buildRolePayload({ role: 'write', passwordMode: 'auto' })
  assert.deepEqual(up, { role: 'write', autoPassword: true })
  assert.equal(buildRolePayload({ role: 'write', passwordMode: 'none' }), null, '升写无密码=不出载荷（按钮禁用双保险）')
})

test('死导出清理（T13 处置）：postSharePassword/buildPasswordSpec 全树零残留（密码调整合流 postShareRole）', () => {
  const roots = [fileURLToPath(new URL('../web/src', import.meta.url)), fileURLToPath(new URL('../lib', import.meta.url))]
  const hits = []
  for (const root of roots) {
    for (const abs of walk(root)) {
      if (!/\.(js|vue)$/.test(abs)) continue
      const raw = fs.readFileSync(abs, 'utf8')
      if (/\bpostSharePassword\b|\bbuildPasswordSpec\b/.test(raw)) hits.push(path.relative(process.cwd(), abs))
    }
  }
  assert.deepEqual(hits, [], `死导出残留：${hits.join(', ')}`)
})

// ── C3 目录分享：管理面行形态与标签（形态判断收在纯函数，组件零判断）──────────────────
test('C3 shareRowView：目录形态原样保留（同一引用=列表稳定）、笔记缺省形安全', () => {
  const dir = { target: 'notes', targetType: 'dir', role: 'read', revoked: false }
  assert.equal(shareRowView(dir), dir, '合法 dir 行原对象返回（零复制零改写——列表引用稳定）')
  assert.equal(shareRowView(dir).targetType, 'dir', '目录形态不丢')

  const file = { target: 'a.md', targetType: 'file' }
  assert.notEqual(shareRowView(file), file, 'file 行走规范化副本（补 targetType 安全默认）')
  assert.equal(shareRowView(file).targetType, 'file')
  assert.equal(shareRowView({ target: 'a.md' }).targetType, 'file', '缺 targetType 缺省=笔记形')

  // 畸形/非法 targetType 一律归笔记形（否则同行可渲出两个「目录」标记：标签 + 状态未定）
  assert.equal(shareRowView({ target: 'a.md', targetType: 'weird' }).targetType, 'file', '非法 targetType 归 file')
  assert.equal(shareRowView({ target: 'a.md', targetType: 'DIR' }).targetType, 'file', '大写不认（服务端口径=小写 dir）')
})

test('C3 shareRowView：非对象输入返回可展示兜底形（错误可见，不炸列表）', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const row = shareRowView(bad)
    assert.equal(row.targetType, 'file', '兜底=笔记形')
    assert.equal(row.revoked, true, '兜底走 revoked（状态列不冒充 active）')
    assert.ok(row.target.length > 0, '兜底目标非空（列表不出现空白行）')
    assert.equal(shareStatus(row), 'revoked', '兜底形状态派生=已撤销（错误可见）')
  }
})

test('C3 targetTypeLabel：dir→目录、其余→笔记（单一来源，两分支恒有值）', () => {
  assert.equal(targetTypeLabel('dir'), '目录')
  assert.equal(targetTypeLabel('file'), '笔记')
  assert.equal(targetTypeLabel(undefined), '笔记', '缺省形=笔记')
  assert.equal(targetTypeLabel('weird'), '笔记')
})

// ── C3 源码形锁：管理面标签走纯函数（组件不再内联三元判断）────────────────────────────
test('C3 源码锁：SharePanel 的形态标签走 targetTypeLabel（组件零形态判断）+ 行数据走 shareRowView', () => {
  const panel = fs.readFileSync(fileURLToPath(new URL('../web/src/components/SharePanel.vue', import.meta.url)), 'utf8')
  assert.match(panel, /targetTypeLabel\(scope\.row\.targetType\)/, '标签经纯函数（复盘弱点：内联三元会双写）')
  assert.ok(!/scope\.row\.targetType === 'dir' \?/.test(panel), '组件内零内联形态三元')
  assert.match(panel, /shareRowView/, '行数据经 shareRowView 规范化')
  assert.match(panel, /<el-table :data="rows"/, '表格消费规范化后的行（不是原始 shares）')
})
