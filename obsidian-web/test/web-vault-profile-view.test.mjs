// vault-profiles-view — 档案 UI 纯函数（T12）：健康状态标签/探针摘要/表单校验/换 vault 提示（T10）。
// 提示文案锁形：切换需重启生效 + 各 vault 各配（外网域名等）——UI 提示面（OW-US-13 交接第 6 条）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  switchHint, healthBadge, probeSummary, validateProfileForm,
} from '../web/src/lib/vault-profiles-view.js'

test('换 vault 提示锁形（T10 提示面）：含「重启生效」+「外网域名」+「各配」', () => {
  const hint = switchHint()
  assert.equal(typeof hint, 'string')
  for (const word of ['重启', '外网域名', '各配']) {
    assert.ok(hint.includes(word), `换 vault 提示缺「${word}」`)
  }
})

test('健康状态标签锁形：三态 {label,type}——ok/degraded/unreachable', () => {
  assert.deepEqual(Object.keys(healthBadge('ok')).sort(), ['label', 'type'])
  assert.equal(healthBadge('ok').type, 'success')
  assert.equal(healthBadge('degraded').type, 'warning')
  assert.equal(healthBadge('unreachable').type, 'danger')
  assert.ok(healthBadge('ok').label.length > 0)
  assert.ok(healthBadge('degraded').label.length > 0)
  assert.ok(healthBadge('unreachable').label.length > 0)
})

test('探针摘要锁形：可读/可写/延迟三探针一目了然', () => {
  const text = probeSummary({
    readable: { ok: true, error: null },
    writable: { ok: false, error: 'EACCES' },
    latencyMs: 12,
    samples: [12],
    status: 'degraded',
  })
  assert.ok(text.includes('可读'), '缺可读探针')
  assert.ok(text.includes('可写'), '缺可写探针')
  assert.ok(text.includes('延迟') && text.includes('12'), '缺延迟数值')
})

test('表单校验（载荷复核纯函数，双保险）：合法过、空名/相对路径拒且可解释', () => {
  assert.deepEqual(validateProfileForm({ name: 'SMB 仓', path: '/mnt/smb/v' }), { ok: true })
  assert.equal(validateProfileForm({ name: '  ', path: '/mnt/smb/v' }).ok, false)
  assert.equal(validateProfileForm({ name: 'x', path: 'relative/dir' }).ok, false)
  assert.equal(validateProfileForm({ name: 'x', path: '/mnt/a\0b' }).ok, false)
  for (const form of [{ name: '  ', path: '/a' }, { name: 'x', path: 'rel' }]) {
    assert.ok(validateProfileForm(form).error.length > 0, '错误信息必须可解释非空')
  }
})
