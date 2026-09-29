// 面板渲染纯函数单测（设置页签 Vue 面的框架无关纯模块，容器/展示分离——.vue 只做展示）。
// 被测件：web/src/lib/log-view.js（日志视图模型）/ web/src/lib/trigger-model.js（触发状态机）/
// web/src/lib/settings-model.js（设置展示模型）/ web/src/lib/log-history.js（历史记录数据面状态机，
// Task F1 历史入口复用）/ web/src/lib/view-model.js（panel.js 挂载视图选择）。零框架依赖 → node --test 直测。
import test from 'node:test'
import assert from 'node:assert/strict'

const { groupBySource, prependChunk, lineKey, shortTag } = await import('../web/src/lib/log-view.js')
const { initialTriggerState, beginTrigger, finishTrigger, TRIGGERS } = await import('../web/src/lib/trigger-model.js')
const { settingsGroups } = await import('../web/src/lib/settings-model.js')
const { initialHistory, applyLatest, applyOlder, applyError, canLoadOlder, PAGE_SIZE } = await import('../web/src/lib/log-history.js')
const { resolveView } = await import('../web/src/lib/view-model.js')

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

// ── log-history：历史记录数据面状态机（Task F1 历史入口；尾部 N 行 + 滚动加载语义保持）──
test('initialHistory：空态起点（无行/无游标/无来源/无错）+ PAGE_SIZE=尾部 N 行分页常量', () => {
  const h = initialHistory()
  assert.deepEqual(h.lines, [])
  assert.deepEqual(h.meta, { hasMore: false, cursor: null, sources: [], stale: false })
  assert.equal(h.error, '')
  assert.ok(Number.isInteger(PAGE_SIZE) && PAGE_SIZE > 0, '单页行数须为正整数（尾部 N 行语义）')
})

test('applyLatest：整页替换（尾部 N 行）+ 清错 + meta 归一（stale 严格 === true 判定——与原面板语义一致）', () => {
  const prev = applyError(initialHistory(), new Error('旧错'))
  const data = { lines: [L('a', 'f', 5, 'c5')], hasMore: true, cursor: 'k1', sources: [{ id: 'a', label: 'A' }], stale: true }
  const h = applyLatest(prev, data)
  assert.deepEqual(h.lines.map((l) => l.text), ['c5'])
  assert.equal(h.meta.hasMore, true)
  assert.equal(h.meta.cursor, 'k1')
  assert.equal(h.meta.stale, true)
  assert.equal(h.error, '', '新页载入清错')
  const plain = applyLatest(prev, { lines: [], hasMore: false, cursor: null, sources: [] })
  assert.equal(plain.meta.stale, false, '缺席=严格 === true 判定为 false（非真值化，语义保持）')
})

test('applyOlder：滚动加载拼前（prependChunk 锚点键去重不重不漏）+ 来源标注沿用既有 meta + stale 归一', () => {
  let h = applyLatest(initialHistory(), {
    lines: [L('a', 'f', 3, 'c3'), L('a', 'f', 4, 'c4')],
    hasMore: true, cursor: 'k1', sources: [{ id: 'a', label: 'A' }],
  })
  h = applyOlder(h, {
    lines: [L('a', 'f', 2, 'c2'), L('a', 'f', 3, 'c3')], // 含锚点重复行
    hasMore: false, cursor: null,
  })
  assert.deepEqual(h.lines.map((l) => l.text), ['c2', 'c3', 'c4'], '更早块拼前 + 去重')
  assert.deepEqual(h.meta.sources, [{ id: 'a', label: 'A' }], '来源标注沿用既有 meta（与原面板语义一致）')
  assert.equal(h.meta.hasMore, false)
  assert.equal(h.meta.stale, false, 'stale 归一为布尔（缺席=false）')
})

test('applyError：错误如实留痕（不吞不编造）+ 已载行保留；canLoadOlder 仅 hasMore 才滚', () => {
  const ready = applyLatest(initialHistory(), { lines: [L('a', 'f', 1, 'c1')], hasMore: true, cursor: 'k', sources: [] })
  const h = applyError(ready, new Error('fetch failed'))
  assert.equal(h.error, 'fetch failed')
  assert.deepEqual(h.lines.map((l) => l.text), ['c1'], '已载行保留')
  assert.equal(canLoadOlder(h), true)
  const done = applyOlder(h, { lines: [], hasMore: false, cursor: null })
  assert.equal(canLoadOlder(done), false, '翻到底=不再滚')
  assert.equal(canLoadOlder(initialHistory()), false, '空态无更早')
})

// ── view-model：panel.js 挂载视图选择（历史入口只挂日志视图）──────────────────
test('resolveView："log"=日志视图（历史入口）；缺省/未知=全量面板（mount(el,{apiBase}) 契约向后兼容）', () => {
  assert.equal(resolveView('log'), 'log')
  assert.equal(resolveView(undefined), 'full')
  assert.equal(resolveView('x'), 'full')
  assert.equal(resolveView(null), 'full')
})

// ── Task F2：web/src/styles.css 对齐 dsh token + §3.2 几何（历史弹层日志视图面=设置节子件）────
// 依据：changes/2026-09-29-settings-ingest-controls/diagnostic-report.md §3.2/§3.3#6（壳按 §3.2 重做，
// 日志面与 rowCard/banner 语义对齐）+ §5.1（F2 ★ styles.css 全面对齐 §3.2）。
const fs = await import('node:fs')
const STYLES = fs.readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8')

/** 取样式表内单条规则体 */
function styleRule(cls, suffix = '') {
  const m = STYLES.match(new RegExp(`\\.${cls}${suffix}\\s*\\{([^}]*)\\}`))
  assert.ok(m, `styles.css 缺 .${cls}${suffix} 规则`)
  return m[1]
}

test('F2 styles.css：dsh token 唯一色板（零硬编码色值）——禁 hex/rgb/hsl，暗色随宿主别名适配', () => {
  assert.doesNotMatch(STYLES, /#[0-9a-fA-F]{3,8}\b/, '禁硬编码 hex（唯一色板来源=--dsw-alias-*）')
  assert.doesNotMatch(STYLES, /rgba?\(/i, '禁硬编码 rgb/rgba')
  assert.doesNotMatch(STYLES, /hsla?\(/i, '禁硬编码 hsl/hsla')
  assert.doesNotMatch(STYLES, /prefers-color-scheme|data-ds-dark-theme/, '禁暗色分支（别名重定义即适配）')
})

test('F2 styles.css：§3.2 几何逐项——按钮 36px/radius-md/0 14px/14px 22px/disabled .4/focus 环、primary 双 token、标题 16px/24px 500、注记 12px/18px tertiary', () => {
  // 注：styles.css 为可读形（冒号后有空格），属性值断言一律容空白——断言语义=几何值本身
  const btn = styleRule('ws-btn')
  assert.match(btn, /height:\s*36px/, '按钮高 36px')
  assert.match(btn, /border-radius:\s*var\(--dsw-radius-md\)/, '按钮 radius-md')
  assert.match(btn, /padding:\s*0 14px/, '按钮 padding 0 14px')
  assert.match(btn, /font-size:\s*14px/, '按钮 14px')
  assert.match(btn, /line-height:\s*22px/, '按钮 22px 行高')
  const disabled = styleRule('ws-btn', ':disabled')
  assert.match(disabled, /opacity:\s*0?\.4/, 'disabled opacity .4（§3.2）')
  assert.match(STYLES, /\.ws-btn:focus-visible\s*\{[^}]*var\(--dsw-focus-ring-color/, 'focus 环引 --dsw-focus-ring-* token')
  const primary = styleRule('ws-btn-primary')
  assert.match(primary, /background:\s*var\(--dsw-alias-button-primary-fill\)/, 'primary 底=button-primary-fill')
  assert.match(primary, /color:\s*var\(--dsw-alias-label-primary-foreground\)/, 'primary 字=label-primary-foreground')
  const ghost = styleRule('ws-btn-ghost')
  assert.match(ghost, /height:\s*28px/, '行内小按钮 28px（zGbnIq rowActions 形）')
  assert.match(ghost, /border-radius:\s*var\(--dsw-radius-sm\)/, '行内小按钮 radius-sm')
  const title = styleRule('ws-title')
  assert.match(title, /font-size:\s*16px/, '标题 16px（§3.2 title）')
  assert.match(title, /font-weight:\s*500/, '标题 500')
  assert.match(title, /line-height:\s*24px/, '标题 24px 行高')
  const note = styleRule('ws-note')
  assert.match(note, /font-size:\s*12px/, '注记 12px')
  assert.match(note, /line-height:\s*18px/, '注记 18px 行高')
  assert.match(note, /var\(--dsw-alias-label-tertiary\)/, '注记 tertiary（§3.2 description）')
  const root = styleRule('ws-root')
  assert.match(root, /font-size:\s*14px/, '视图根 14px（§3.2 section 字号）')
  assert.match(root, /line-height:\s*22px/, '视图根 22px 行高')
  assert.match(root, /gap:\s*12px/, '视图根 gap 12px（§3.2 节容器）')
})
