// rename UI 调用链锁形（T13 / T5 交接：树操作入口→改名/移动→/ob/api/rename）
//   ③ 纯函数锁形：载荷键集恰形（{from,to[,overwrite]}——overwrite 仅显式覆盖时随行，
//      OW-INV-5 永不静默覆盖）+ T5 结果形 reason 全集分类（冲突/歧义留痕提示展示）+
//      调用链字面锁（/ob/api/rename 字面全树恰一处=api.js；前端零拼接——T10 三重锁同款）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRenamePayload, renameOutcome, renameWarningText, RENAME_REASONS } from '../web/src/lib/rename-view.js'

const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs))
    else out.push(abs)
  }
  return out
}

test('载荷锁形：{from,to} 键集恰此；空目标/未变更/缺源 → null；overwrite 仅显式 true 随行', () => {
  assert.deepEqual(buildRenamePayload({ from: 'notes/a.md', to: 'notes/b.md' }), { from: 'notes/a.md', to: 'notes/b.md' })
  assert.deepEqual(buildRenamePayload({ from: ' notes/a.md ', to: ' notes/c.md ' }), { from: 'notes/a.md', to: 'notes/c.md' }, '首尾空白剥除')
  assert.deepEqual(buildRenamePayload({ from: 'notes/a.md', to: 'notes/b.md', overwrite: true }), { from: 'notes/a.md', to: 'notes/b.md', overwrite: true })
  assert.deepEqual(buildRenamePayload({ from: 'notes/a.md', to: 'notes/b.md', overwrite: false }), { from: 'notes/a.md', to: 'notes/b.md' }, 'overwrite:false 不随行（缺省=不覆盖）')
  assert.equal(buildRenamePayload({ from: 'notes/a.md', to: '   ' }), null, '空目标不出载荷')
  assert.equal(buildRenamePayload({ from: 'notes/a.md', to: 'notes/a.md' }), null, '未变更不出载荷')
  assert.equal(buildRenamePayload({ from: 'notes/a.md', to: ' notes/a.md ' }), null, 'trim 后未变更不出载荷')
  assert.equal(buildRenamePayload({ from: '', to: 'notes/b.md' }), null, '缺源不出载荷')
  assert.equal(buildRenamePayload(null), null, '非法输入不出载荷')
  const keys = Object.keys(buildRenamePayload({ from: 'a.md', to: 'b.md' })).sort()
  assert.deepEqual(keys, ['from', 'to'], '载荷键集恰形（无多余字段）')
})

test('结果映射：T5 reason 全集分类 + rolledBack 如实 + warnings 留痕展示', () => {
  // reason 全集=lib/vault-ops.renameNote 契约字面（7 形，docs 注释同款）
  assert.deepEqual([...RENAME_REASONS].sort(), [
    'concurrent-modification', 'journal-limit', 'not-a-file', 'not-found',
    'same-path', 'target-exists', 'transaction-failed',
  ])
  // 成功：warnings（歧义不动/降级留痕）如实展示
  const ok = renameOutcome({ ok: true, rolledBack: false, warnings: ['歧义未改写：[[c]]'], changed: ['notes/a.md', 'notes/b.md'] })
  assert.equal(ok.kind, 'renamed')
  assert.equal(ok.ok, true)
  assert.equal(ok.canOverwrite, false)
  assert.equal(ok.changedCount, 2)
  assert.deepEqual(ok.warnings, ['歧义未改写：[[c]]'])
  // 冲突：target-exists → 可显式覆盖（OW-INV-5 永不静默覆盖=只提示不带 overwrite）
  const conflict = renameOutcome({ ok: false, reason: 'target-exists', message: '目标已存在：notes/b.md', rolledBack: false, warnings: [] })
  assert.equal(conflict.kind, 'target-exists')
  assert.equal(conflict.canOverwrite, true, '冲突给显式覆盖途径（不静默）')
  assert.equal(conflict.ok, false)
  // 回滚态：rolledBack 如实（绝不谎报成功）
  const rolled = renameOutcome({ ok: false, reason: 'transaction-failed', message: '事务中止', rolledBack: true, warnings: ['事务中止（x）：y'] })
  assert.equal(rolled.kind, 'rolled-back')
  assert.equal(rolled.rolledBack, true)
  assert.deepEqual(rolled.warnings, ['事务中止（x）：y'])
  // 其余 reason → 可解释拒（不冒充）
  for (const reason of ['same-path', 'not-found', 'not-a-file', 'journal-limit', 'concurrent-modification']) {
    const o = renameOutcome({ ok: false, reason, message: `m:${reason}`, rolledBack: false, warnings: [] })
    assert.equal(o.kind, 'failed', `${reason} → failed 类`)
    assert.equal(o.ok, false)
    assert.equal(o.message, `m:${reason}`, 'message 如实上抛')
    assert.equal(o.canOverwrite, false)
  }
  // 未知形 fail-closed（不炸不装好）
  assert.equal(renameOutcome(null).kind, 'failed')
  assert.equal(renameOutcome({}).kind, 'failed')
})

test('留痕文案：warnings 如实拼接（零吞字）；空/缺省=空串', () => {
  assert.equal(renameWarningText(['a', 'b']), 'a；b')
  assert.equal(renameWarningText(['a']), 'a')
  assert.equal(renameWarningText([]), '')
  assert.equal(renameWarningText(undefined), '')
})

test('调用链字面锁：/ob/api/rename 字面全树恰一处（api.js）+ 前端零拼接', () => {
  const hits = []
  for (const abs of walk(WEB_SRC)) {
    const raw = fs.readFileSync(abs, 'utf8')
    // 只认**字符串字面量**（注释里的路径是文档，不是拼接面）
    for (const m of raw.matchAll(/['"`]\/ob\/api\/rename['"`]/g)) hits.push(path.relative(WEB_SRC, abs))
  }
  assert.deepEqual(hits, ['api.js'], 'rename 端点字面恰一处（红线：禁止半路拼 URL）')
  const api = fs.readFileSync(path.join(WEB_SRC, 'api.js'), 'utf8')
  assert.match(api, /postJson\('\/ob\/api\/rename',\s*payload\)/, 'postRename 载荷原样过（buildRenamePayload 键集已锁）')
  // 调用链：RenameDialog 组装载荷纯函数 + App 编排走 api.postRename
  const dialog = fs.readFileSync(path.join(WEB_SRC, 'components/RenameDialog.vue'), 'utf8')
  assert.match(dialog, /buildRenamePayload/, 'RenameDialog 载荷复核双保险（纯函数锁形）')
  const app = fs.readFileSync(path.join(WEB_SRC, 'App.vue'), 'utf8')
  assert.match(app, /renameFile|postRename/, 'App 编排走 api.renameFile')
})

// ── M1（T13 review 随行收口）：rolledBack 全分支透传——服务端回滚标记如实进 UI 决策，绝不吞 ──
test('M1 rolledBack 透传：成功/冲突/失败全分支如实带服务端 rolledBack（含 ok:true 混形不冒充）', () => {
  const okRolled = renameOutcome({ ok: true, rolledBack: true, changed: ['notes/a.md'] })
  assert.equal(okRolled.kind, 'renamed')
  assert.equal(okRolled.rolledBack, true, 'ok 混形下 rolledBack 仍须如实透传（不因成功分支被吞）')
  const okPlain = renameOutcome({ ok: true, rolledBack: false, changed: [] })
  assert.equal(okPlain.rolledBack, false)
  const clash = renameOutcome({ ok: false, reason: 'target-exists', rolledBack: true, message: 'm' })
  assert.equal(clash.kind, 'target-exists')
  assert.equal(clash.rolledBack, true, '冲突分支 rolledBack 透传')
  const failed = renameOutcome({ ok: false, reason: 'transaction-failed', rolledBack: true, message: 'm' })
  assert.equal(failed.kind, 'rolled-back')
  assert.equal(failed.rolledBack, true)
  const plainFail = renameOutcome({ ok: false, reason: 'not-a-file', rolledBack: false, message: 'm' })
  assert.equal(plainFail.rolledBack, false, '无回滚如实 false（缺省/显式 false 同判）')
  const absent = renameOutcome({ ok: false, reason: 'not-found', message: 'm' })
  assert.equal(absent.rolledBack, false, '缺省形不虚构回滚')
})
