// 面板渲染纯函数单测（设置页签 Vue 面的框架无关纯模块，容器/展示分离——.vue 只做展示）。
// 被测件：web/src/lib/log-view.js（日志视图模型）/ web/src/lib/trigger-model.js（触发状态机）/
// web/src/lib/settings-model.js（设置展示模型）。零框架依赖 → node --test 直测。
import test from 'node:test'
import assert from 'node:assert/strict'

const { groupBySource, prependChunk, lineKey, shortTag } = await import('../web/src/lib/log-view.js')
const { initialTriggerState, beginTrigger, finishTrigger, TRIGGERS } = await import('../web/src/lib/trigger-model.js')
const { settingsGroups } = await import('../web/src/lib/settings-model.js')

const L = (source, name, line, text) => ({ source, label: `label:${source}`, name, line, text })

// ── log-view：来源分组（连续段）+ 滚动加载拼接 ───────────────────────────────
test('groupBySource：连续同来源段聚合（跨段重复来源不合并——保时间序）', () => {
  const lines = [L('a', 'f1', 1, 'x'), L('a', 'f1', 2, 'y'), L('b', 'f2', 1, 'z'), L('a', 'f3', 1, 'w')]
  const groups = groupBySource(lines)
  assert.deepEqual(groups.map((g) => [g.source, g.lines.length]), [['a', 2], ['b', 1], ['a', 1]])
  assert.equal(groups[0].label, 'label:a')
})

test('groupBySource：空输入 = 空分组', () => {
  assert.deepEqual(groupBySource([]), [])
})

test('prependChunk：更早块拼前 + 锚点键去重（滚动加载不重不漏）', () => {
  const current = [L('a', 'f', 3, 'c3'), L('a', 'f', 4, 'c4')]
  const older = [L('a', 'f', 2, 'c2'), L('a', 'f', 3, 'c3')]
  const merged = prependChunk(current, older)
  assert.deepEqual(merged.map((l) => l.text), ['c2', 'c3', 'c4'])
})

test('lineKey：锚点键 = source|name|line（同一行跨请求同键）', () => {
  assert.equal(lineKey(L('a', 'f', 7, 't')), 'a|f|7')
})

test('shortTag：三来源各有短标注（面板行首来源角标）；未知来源回退 id（不编造）', () => {
  assert.equal(typeof shortTag('cron:wiki-ingest'), 'string')
  assert.equal(typeof shortTag('manual:scan'), 'string')
  assert.equal(typeof shortTag('alerts:kb'), 'string')
  assert.ok(shortTag('cron:wiki-ingest').length > 0 && shortTag('cron:wiki-ingest').length <= 6)
  assert.equal(shortTag('mystery'), 'mystery')
})

// ── trigger-model：双动作触发状态机 ─────────────────────────────────────────
test('TRIGGERS = 扫描增量 / 触发蒸馏 双动作（裁定语义：按钮绝不做 LLM 蒸馏）', () => {
  assert.deepEqual(TRIGGERS, ['scan', 'distill'])
})

test('initialTriggerState：双动作初始 idle', () => {
  const s = initialTriggerState()
  assert.equal(s.scan.status, 'idle')
  assert.equal(s.distill.status, 'idle')
})

test('beginTrigger：进入 running（保持另一动作状态不动）', () => {
  const s0 = initialTriggerState()
  const s1 = beginTrigger(s0, 'scan')
  assert.equal(s1.scan.status, 'running')
  assert.equal(s1.distill.status, 'idle')
  assert.equal(s0.scan.status, 'idle', '纯函数不改原对象')
})

test('finishTrigger scan：成功=done + 增量清单摘要文案（pending 数/无待编译）', () => {
  let s = beginTrigger(initialTriggerState(), 'scan')
  s = finishTrigger(s, 'scan', {
    ok: true,
    exitCode: 0,
    summary: { total: 3, skipped: 2, pending: 1, pendingFiles: [{ status: 'ingest', subdir: '01-articles', name: 'a.md', modified: '' }] },
    logFile: '/tmp/x.log',
    output: 'raw',
  })
  assert.equal(s.scan.status, 'done')
  assert.match(s.scan.message, /1/, '摘要要带待编译条数')
  assert.equal(s.scan.logFile, '/tmp/x.log')

  s = finishTrigger(beginTrigger(s, 'scan'), 'scan', {
    ok: true,
    exitCode: 0,
    summary: { total: 3, skipped: 3, pending: 0, pendingFiles: [] },
    logFile: '/tmp/y.log',
    output: 'raw',
  })
  assert.equal(s.scan.status, 'done')
  assert.match(s.scan.message, /无待编译/)
})

test('finishTrigger scan：失败=error + 错误留痕（不吞不编造）', () => {
  const s = finishTrigger(beginTrigger(initialTriggerState(), 'scan'), 'scan', {
    ok: false,
    exitCode: 1,
    summary: { total: null, skipped: null, pending: null, pendingFiles: [], unknown: true },
    logFile: '/tmp/z.log',
    output: 'python: boom',
  })
  assert.equal(s.scan.status, 'error')
  assert.ok(s.scan.message.length > 0)
})

test('finishTrigger distill：started=done + 「蒸馏由任务执行」提示；未启动=skipped + reason 如实', () => {
  let s = finishTrigger(beginTrigger(initialTriggerState(), 'distill'), 'distill', {
    started: true,
    reason: 'started',
    note: '蒸馏由任务执行：已触发 headless 任务',
    logFile: '/tmp/d.log',
  })
  assert.equal(s.distill.status, 'done')
  assert.match(s.distill.message, /蒸馏由任务执行/)
  assert.equal(s.distill.logFile, '/tmp/d.log')

  for (const [reason, expect] of [['already-running', 'skipped'], ['channel-unavailable', 'skipped']]) {
    const r = finishTrigger(beginTrigger(s, 'distill'), 'distill', { started: false, reason, note: '提示文案', logFile: '/tmp/d.log' })
    assert.equal(r.distill.status, expect)
    assert.ok(r.distill.message.includes('提示文案'))
  }
})

// ── settings-model：Config 面只读展示（vaultRoot/write.readOnly 展示，INV-7 语义勿动）──
test('settingsGroups：Config 全键只读展示 + vaultRoot/write.readOnly 带 INV-7 注记 + 通道/来源行', () => {
  const data = {
    config: {
      vaultRoot: '/mnt/unraid_data/Obsidian',
      capture: { bufferRounds: 3, enabled: true },
      write: { readOnly: true },
      queue: { maxRetries: 3, ttlDays: 7 },
      secrets: { enabled: true },
    },
    readOnly: true,
    channel: { available: true, running: false, cronScript: '/root/bin/dsh-cron.sh', taskFile: '/root/bin/tasks/21-wiki-ingest.md', logFile: '/x/wiki-ingest.log' },
    sources: [{ id: 'cron:wiki-ingest', label: '夜间蒸馏任务日志' }, { id: 'manual:scan', label: '手动扫描日志' }, { id: 'alerts:kb', label: '告警账本' }],
  }
  const groups = settingsGroups(data)
  const flat = groups.flatMap((g) => g.rows)
  const keys = flat.map((r) => r.key)
  assert.ok(keys.includes('vaultRoot'))
  assert.ok(keys.includes('write.readOnly'))
  assert.ok(keys.includes('capture.enabled'))
  assert.ok(keys.includes('queue.maxRetries'))
  assert.ok(keys.includes('secrets.enabled'))
  const readOnlyRow = flat.find((r) => r.key === 'write.readOnly')
  assert.equal(readOnlyRow.value, 'true')
  assert.match(readOnlyRow.note, /INV-7|只读/, 'write.readOnly 必须带 INV-7 语义注记')
  const vaultRow = flat.find((r) => r.key === 'vaultRoot')
  assert.equal(vaultRow.value, '/mnt/unraid_data/Obsidian')
  // 展示面=只读（本波可改项最小集=∅）：每行不得带可写暗示字段
  for (const r of flat) assert.equal(r.editable, false)
  // 来源与通道如实展示（禁编造统一日志）
  const sourceRow = flat.find((r) => r.key === 'log.sources')
  assert.equal(sourceRow.value, '夜间蒸馏任务日志 / 手动扫描日志 / 告警账本')
  const channelRow = flat.find((r) => r.key === 'distill.channel')
  assert.match(channelRow.value, /可用/)
  assert.match(channelRow.note, /蒸馏由任务执行|夜间任务/, '通道注记必须提示蒸馏执行面')
})

test('settingsGroups：通道不可用如实标注（不编造按钮语义）', () => {
  const groups = settingsGroups({
    config: { vaultRoot: '/v', capture: { bufferRounds: 3, enabled: true }, write: { readOnly: true }, queue: { maxRetries: 3, ttlDays: 7 }, secrets: { enabled: true } },
    readOnly: true,
    channel: { available: false, running: false, cronScript: '/missing', taskFile: '/missing', logFile: '/x/y.log' },
    sources: [],
  })
  const flat = groups.flatMap((g) => g.rows)
  const channelRow = flat.find((r) => r.key === 'distill.channel')
  assert.match(channelRow.value, /不可用/)
  assert.ok(channelRow.note.length > 0)
})
