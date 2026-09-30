// settings-write 单测（kb-context 设置面写路径：可改白名单 + 合并真校验 + configEditor 缝）：
// 被测件：lib/settings-write.js。纪律（裁定 2026-09-28）：可改=triggers.words/entityPaths、budget、
// timeoutMs、scope；hotMap/vaultRoot 只读（白名单外=整单拒）；数组整替、对象深合并；
// 校验=真 zod（Config.safeParse 生效面 inherited∪current∪patch）。
// 零 mock：zod Config 用真 lib/index.js 导出；configEditor 只承接宿主最小形（entries/edit）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../lib/index.js'
import { EDITABLE_PATHS, applyEditablePatch, checkPatchEditable, createApplyPatch, isEditablePath } from '../lib/settings-write.js'

test('可改白名单契约：8 叶子（0.4.0 增 triggerLog.enabled）；hotMap / vaultRoot 永不在列（裁定枚举外=只读展示）', () => {
  assert.deepEqual(EDITABLE_PATHS.map((p) => p.join('.')), [
    'triggers.words',
    'triggers.entityPaths',
    'budget.maxSnippets',
    'budget.maxTokens',
    'timeoutMs',
    'scope.indexAll',
    'scope.grepOnDemand',
    'triggerLog.enabled',
  ])
  for (const banned of [['hotMap'], ['hotMap', 'enabled'], ['hotMap', 'maxChars'], ['vaultRoot']]) {
    assert.equal(isEditablePath(banned), false, `不可改：${banned.join('.')}`)
  }
  assert.equal(isEditablePath(['timeoutMs']), true, '顶层标量叶子在白名单')
  assert.equal(isEditablePath(['scope', 'indexAll']), true)
  assert.equal(isEditablePath(['triggerLog', 'enabled']), true, 'kill switch 叶子在白名单（A-TL5）')
  assert.equal(isEditablePath(['triggerLog', 'capacity']), false, 'capacity 不可改（INV-TL4 环容量恒钳 ≤200 归读侧救济）')
  assert.equal(isEditablePath(['triggerLog']), false, '空对象=叶子（白名单无空对象路径）')
})

test('triggerLog.enabled kill switch 写入：白名单内合并+真 zod；外键同单=整单拒（A-TL5 语义不变）', () => {
  const ok = applyEditablePatch({ current: {}, patch: { triggerLog: { enabled: false } } }, Config)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.config, { triggerLog: { enabled: false } }, '最小写入形只含白名单叶子')
  assert.equal(ok.parsed.triggerLog.enabled, false, '真 zod 解析面生效（kill switch 可关）')
  const on = applyEditablePatch({ current: { triggerLog: { enabled: false } }, patch: { triggerLog: { enabled: true } } }, Config)
  assert.equal(on.ok, true)
  assert.equal(on.parsed.triggerLog.enabled, true, '可再开（可改非只关）')

  for (const patch of [{ triggerLog: { enabled: false }, hotMap: { enabled: true } }, { triggerLog: { enabled: false, capacity: 500 } }, { triggerLog: { enabled: 'yes' } }]) {
    const r = applyEditablePatch({ current: {}, patch }, Config)
    assert.equal(r.ok, false, `必拒：${JSON.stringify(patch)}`)
  }
  // 白名单外叶子整单拒语义不变：外键在单=整单不落盘（not_editable），与旧键同判
  const cross = applyEditablePatch({ current: {}, patch: { triggerLog: { enabled: false }, hotMap: { enabled: true } } }, Config)
  assert.equal(cross.code, 'not_editable', '白名单外叶子=整单拒（绝不静默丢键）')
  const cap = applyEditablePatch({ current: {}, patch: { triggerLog: { enabled: false, capacity: 500 } } }, Config)
  assert.equal(cap.code, 'not_editable', 'triggerLog.capacity 白名单外=整单拒')
  const badType = applyEditablePatch({ current: {}, patch: { triggerLog: { enabled: 'yes' } } }, Config)
  assert.equal(badType.code, 'invalid', '叶子在白名单但值类型非法=真 zod 拒（enabled 必须 boolean）')
})

test('白名单内合并：对象深合并、数组整替；返回最小写入形 + 真 zod 解析面', () => {
  const r = applyEditablePatch({
    inherited: { triggers: { words: ['a'], entityPaths: ['e1'] }, timeoutMs: 1500 },
    current: { triggers: { words: ['x'] } },
    patch: { triggers: { entityPaths: ['e2'] }, budget: { maxTokens: 900 } },
  }, Config)
  assert.equal(r.ok, true)
  assert.deepEqual(r.config, { triggers: { words: ['x'], entityPaths: ['e2'] }, budget: { maxTokens: 900 } })
  assert.deepEqual(r.parsed.triggers.words, ['x'], 'current 覆盖层保留（深合并非整替）')
  assert.deepEqual(r.parsed.triggers.entityPaths, ['e2'], '数组整替')
  assert.equal(r.parsed.budget.maxTokens, 900)
  assert.equal(r.parsed.budget.maxSnippets, 3, '缺省键由 zod 真解析补齐')
})

test('白名单外叶子=整单拒（not_editable）：hotMap / vaultRoot / 未知键同判；空 patch=bad_patch', () => {
  for (const patch of [{ hotMap: { enabled: true } }, { vaultRoot: '/x' }, { nope: 1 }, { budget: { maxTokens: 1, nope: 2 } }]) {
    const r = applyEditablePatch({ current: {}, patch }, Config)
    assert.equal(r.ok, false, `必拒：${JSON.stringify(patch)}`)
    assert.equal(r.code, 'not_editable')
    assert.match(r.message, /不在可改白名单/)
  }
  assert.equal(checkPatchEditable({}).code, 'bad_patch')
  assert.equal(checkPatchEditable('x').code, 'bad_patch')
  assert.equal(checkPatchEditable({ budget: {} }).code, 'not_editable', '空对象=叶子（白名单无空对象路径）→ 白名单外判 not_editable')
})

test('类型非法=invalid（真 zod 校验生效面，非透传）；生效面含 inherited 层', () => {
  const r = applyEditablePatch({ current: {}, patch: { timeoutMs: '800' } }, Config)
  assert.equal(r.code, 'invalid')
  assert.match(r.message, /配置校验失败/)

  const bad = applyEditablePatch({ inherited: { budget: { maxTokens: 'x' } }, current: {}, patch: { timeoutMs: 1 } }, Config)
  assert.equal(bad.ok, false, 'inherited 层非法同样拒')

  const bad2 = applyEditablePatch({ current: {}, patch: { triggers: { words: 'OA' } } }, Config)
  assert.equal(bad2.code, 'invalid', 'words 必须数组')
})

test('createApplyPatch：configEditor 缝真实调用序（预检→entries→edit(change)）→ ok + 最小写入形', async () => {
  const seen = {}
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'kb-context' } }],
      edit: async (entry, change) => { seen.next = change({ triggers: { words: ['a'] } }, { timeoutMs: 1500 }) },
    },
    entryId: 'kb-context',
    Config,
  })
  const r = await applyPatch({ timeoutMs: 900 })
  assert.equal(r.ok, true)
  assert.deepEqual(seen.next, { triggers: { words: ['a'] }, timeoutMs: 900 })
  assert.deepEqual(r.config, seen.next)
})

test('createApplyPatch：无入口=no_entry；edit 抛错=结构化失败；白名单外绝不叫醒 edit', async () => {
  const noEntry = createApplyPatch({ configEditor: { entries: () => [], edit: async () => {} }, entryId: 'kb-context', Config })
  const r1 = await noEntry({ timeoutMs: 1 })
  assert.equal(r1.code, 'no_entry')

  const boom = createApplyPatch({
    configEditor: { entries: () => [{ options: { id: 'kb-context' } }], edit: async () => { throw new Error('patch locked') } },
    entryId: 'kb-context',
    Config,
  })
  const r2 = await boom({ timeoutMs: 1 })
  assert.equal(r2.code, 'edit_failed')
  assert.match(r2.message, /patch locked/)

  let called = 0
  const guard = createApplyPatch({
    configEditor: { entries: () => [{ options: { id: 'kb-context' } }], edit: async () => { called += 1 } },
    entryId: 'kb-context',
    Config,
  })
  const r3 = await guard({ vaultRoot: '/x' })
  assert.equal(r3.code, 'not_editable')
  assert.equal(called, 0)
})
