// settings-write 单测（设置面写路径：可改白名单 + 合并真校验 + configEditor 缝）：
// 被测件：lib/settings-write.js —— applyEditablePatch 纯函数 + createApplyPatch 宿主写缝。
// 纪律（裁定 2026-09-28「写路径走 settings 服务或 ctx.webServer API——沿 wiki-steward 同款官方形」）：
//   · 白名单外叶子=整单拒（not_editable），绝不静默丢键；vaultRoot/write.readOnly 永不可改（INV-7）；
//   · 合并=对象深合并、数组整替；校验=真 zod（Config.safeParse 生效面 inherited∪current∪patch）；
//   · createApplyPatch=host configEditor.edit 缝（dsh-settings 服务同款持久化缝）：缺入口/edit 抛错=结构化失败。
// 零 mock：zod Config 用真 lib/index.js 导出；configEditor 只承接宿主最小形（entries/edit）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../lib/index.js'
import { EDITABLE_PATHS, HINDSIGHT_EDITABLE_PATHS, applyEditablePatch, createApplyPatch, isEditablePath, checkPatchEditable } from '../lib/settings-write.js'

test('可改白名单契约：7 叶子（R-29 摘 hindsight 三项——面板唯一写入口）；HINDSIGHT 专属面 3 叶；vaultRoot / write.readOnly 永不在列（INV-7 语义勿动）', () => {
  // 断言修订理由（Task F3，验收③）：白名单随「配置面写入持久化」由 5 叶子扩为 7 叶子（+ingest.schedule 两项）。
  // 断言修订理由（2026-10-07 波 t19，R-29 P0 双源根治）：t9 曾扩 3 叶 hindsight——现**摘除**（通用面
  // rows/POST settings 整单拒写），唯一写入口=Hindsight 面板（HINDSIGHT_EDITABLE_PATHS 专属写缝）；
  // 原 7 叶子逐条仍在列，vaultRoot/write.readOnly 禁改断言与越界整单拒语义原样保留。
  assert.deepEqual(EDITABLE_PATHS.map((p) => p.join('.')), [
    'capture.enabled',
    'capture.bufferRounds',
    'queue.maxRetries',
    'queue.ttlDays',
    'secrets.enabled',
    'ingest.schedule.enabled',
    'ingest.schedule.time',
  ])
  // R-29 专属写面（面板唯一入口的协议层白名单）
  assert.deepEqual(HINDSIGHT_EDITABLE_PATHS.map((p) => p.join('.')), [
    'hindsight.enabled',
    'hindsight.sync.schedule.enabled',
    'hindsight.sync.schedule.time',
  ], 'hindsight 专属白名单 3 叶（/hindsight/* 端点消费）')
  // 摘叶判死：通用白名单对 hindsight 键整单拒（双源根治——rows/POST settings 面不再可写）
  for (const banned of [['hindsight', 'enabled'], ['hindsight', 'sync', 'schedule', 'enabled'], ['hindsight', 'sync', 'schedule', 'time']]) {
    assert.equal(isEditablePath(banned), false, `通用面不可写（R-29 摘叶）：${banned.join('.')}`)
  }
  assert.equal(checkPatchEditable({ hindsight: { enabled: true } }).code, 'not_editable', '通用面写 hindsight 键=整单拒（后写覆盖先写根除）')
  assert.equal(checkPatchEditable({ hindsight: { enabled: true } }, HINDSIGHT_EDITABLE_PATHS).ok, true, '专属面可写（面板唯一入口）')
  assert.equal(checkPatchEditable({ capture: { enabled: true } }, HINDSIGHT_EDITABLE_PATHS).code, 'not_editable', '专属面同样受限（3 叶之外整单拒）')
  for (const banned of [['vaultRoot'], ['write', 'readOnly'], ['write'], []]) {
    assert.equal(isEditablePath(banned), false, `不可改：${banned.join('.')}`)
  }
  assert.equal(isEditablePath(['capture', 'enabled']), true)
})

test('白名单内合并：对象深合并、数组整替；返回最小写入形 + 真 zod 解析面', () => {
  const r = applyEditablePatch({
    inherited: { capture: { enabled: true, bufferRounds: 3 }, queue: { maxRetries: 3 } },
    current: { capture: { bufferRounds: 5 } },
    patch: { capture: { enabled: false }, queue: { maxRetries: 1 } },
  }, Config)
  assert.equal(r.ok, true)
  assert.deepEqual(r.config, { capture: { enabled: false, bufferRounds: 5 }, queue: { maxRetries: 1 } }, '写入形=current∪patch（inherited 不落盘）')
  assert.equal(r.parsed.capture.enabled, false)
  assert.equal(r.parsed.capture.bufferRounds, 5, 'current 覆盖层保留（深合并非整替）')
  assert.equal(r.parsed.queue.maxRetries, 1)
  assert.equal(r.parsed.queue.ttlDays, 7, '缺省键由 zod 真解析补齐')
})

test('白名单外叶子=整单拒（not_editable）：write.readOnly / vaultRoot / 未知键同判', () => {
  for (const patch of [
    { write: { readOnly: false } },
    { vaultRoot: '/tmp/x' },
    { nope: 1 },
    { capture: { enabled: true, nope: 2 } },
  ]) {
    const r = applyEditablePatch({ current: {}, patch }, Config)
    assert.equal(r.ok, false, `必拒：${JSON.stringify(patch)}`)
    assert.equal(r.code, 'not_editable')
    assert.match(r.message, /不在可改白名单/)
  }
})

test('ingest.schedule 可改：深合并非整替 + 真 zod 校验（时间 HH:MM / 开关 boolean）', () => {
  const r = applyEditablePatch({
    current: { ingest: { schedule: { enabled: true, time: '00:25' } } },
    patch: { ingest: { schedule: { time: '23:30' } } },
  }, Config)
  assert.equal(r.ok, true)
  assert.deepEqual(r.config, { ingest: { schedule: { enabled: true, time: '23:30' } } }, '深合并非整替（enabled 保留）')
  assert.equal(r.parsed.ingest.schedule.time, '23:30')

  const r2 = applyEditablePatch({ current: {}, patch: { ingest: { schedule: { enabled: false } } } }, Config)
  assert.equal(r2.ok, true)
  assert.deepEqual(r2.parsed.ingest.schedule, { enabled: false, time: '00:25' }, '缺省时间由 zod 真解析补齐')
})

test('ingest.schedule 校验：非法时间/非法开关=invalid（时间格式 HH:MM 严格拒 25:00/0:25/数值形）', () => {
  for (const patch of [
    { ingest: { schedule: { time: '25:00' } } },
    { ingest: { schedule: { time: '0:25' } } },
    { ingest: { schedule: { time: '0025' } } },
    { ingest: { schedule: { time: 2500 } } },
    { ingest: { schedule: { enabled: 'yes' } } },
  ]) {
    const r = applyEditablePatch({ current: {}, patch }, Config)
    assert.equal(r.ok, false, `必拒：${JSON.stringify(patch)}`)
    assert.equal(r.code, 'invalid')
    assert.match(r.message, /配置校验失败/)
  }
})

test('patch 形非法=bad_patch；空 patch=bad_patch（无可改叶子）', () => {
  assert.equal(applyEditablePatch({ current: {}, patch: 'x' }, Config).code, 'bad_patch')
  assert.equal(applyEditablePatch({ current: {}, patch: null }, Config).code, 'bad_patch')
  assert.equal(applyEditablePatch({ current: {}, patch: {} }, Config).code, 'bad_patch')
})

test('类型非法=invalid（真 zod 校验生效面，非透传）', () => {
  const r = applyEditablePatch({ current: {}, patch: { capture: { bufferRounds: '3' } } }, Config)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'invalid')
  assert.match(r.message, /配置校验失败/)

  const r2 = applyEditablePatch({ current: {}, patch: { secrets: { enabled: 1 } } }, Config)
  assert.equal(r2.code, 'invalid')
})

test('生效面校验含 inherited 层：inherited 取值也参与真校验（合并三层后判）', () => {
  const bad = applyEditablePatch({ inherited: { capture: { bufferRounds: 'x' } }, current: {}, patch: { capture: { enabled: true } } }, Config)
  assert.equal(bad.ok, false, 'inherited 层非法同样拒')
  const good = applyEditablePatch({ inherited: { capture: { bufferRounds: 4 } }, current: {}, patch: { capture: { enabled: false } } }, Config)
  assert.equal(good.ok, true)
  assert.equal(good.parsed.capture.bufferRounds, 4)
})

test('createApplyPatch：configEditor 缝真实调用序（entries→edit(change)）→ ok + 最小写入形', async () => {
  const seen = {}
  const configEditor = {
    entries: () => [{ options: { id: 'wiki-steward' } }],
    edit: async (entry, change) => {
      seen.entry = entry
      seen.next = change({ capture: { bufferRounds: 5 } }, { capture: { enabled: true, bufferRounds: 3 } })
    },
  }
  const applyPatch = createApplyPatch({ configEditor, entryId: 'wiki-steward', Config })
  const r = await applyPatch({ capture: { enabled: false } })
  assert.equal(r.ok, true)
  assert.equal(seen.entry.options.id, 'wiki-steward')
  assert.deepEqual(seen.next, { capture: { bufferRounds: 5, enabled: false } }, '写入形=current∪白名单 patch')
  assert.deepEqual(r.config, seen.next)
})

test('createApplyPatch：无入口=no_entry；edit 抛错=结构化失败（绝不抛穿路由）', async () => {
  const noEntry = createApplyPatch({ configEditor: { entries: () => [], edit: async () => {} }, entryId: 'wiki-steward', Config })
  const r1 = await noEntry({ capture: { enabled: false } })
  assert.equal(r1.ok, false)
  assert.equal(r1.code, 'no_entry')

  const boom = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async () => { throw new Error('patch locked') },
    },
    entryId: 'wiki-steward',
    Config,
  })
  const r2 = await boom({ capture: { enabled: false } })
  assert.equal(r2.ok, false)
  assert.equal(r2.code, 'edit_failed')
  assert.match(r2.message, /patch locked/)
})

test('createApplyPatch：白名单外键在 edit 前即拒（edit 绝不被叫醒）', async () => {
  let called = 0
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async () => { called += 1 },
    },
    entryId: 'wiki-steward',
    Config,
  })
  const r = await applyPatch({ write: { readOnly: false } })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'not_editable')
  assert.equal(called, 0, '不可改字段绝不触达持久化缝')
})
