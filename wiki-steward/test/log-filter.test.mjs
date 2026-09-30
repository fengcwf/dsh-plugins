// log-filter 单测（历史日志视图筛选模型纯函数 + 三能力组合锁，Phase 8 反馈轮④）。
// 被测件：web/src/lib/log-filter.js（筛选模型：默认态/类型多选/日期输入/查询串/空态文案）
// + web/src/lib/log-view.js toDisplayOrder（时间倒序展示序）+ web/src/lib/log-history.js（组合演练）。
// 三能力：①默认时间倒序（最新在上，翻旧追加于下方）②时间区间筛选（与翻旧联动）③类型多选（可叠加）。
// 零框架依赖 → node --test 直测；组合锁=真模块直调（容器数据流同款顺序，integration 形）。
import test from 'node:test'
import assert from 'node:assert/strict'

const {
  defaultFilters,
  typeSelection,
  toggleType,
  setDate,
  filtersActive,
  toQuery,
  emptyStateMessage,
} = await import('../web/src/lib/log-filter.js')
const { toDisplayOrder, lineKey } = await import('../web/src/lib/log-view.js')
const { initialHistory, applyLatest, applyOlder, canLoadOlder } = await import('../web/src/lib/log-history.js')

const IDS = ['cron:wiki-ingest', 'manual:scan', 'alerts:kb']
const L = (source, name, line, text, dateKey) => ({ source, label: `label:${source}`, name, line, text, dateKey })

// ── defaultFilters / filtersActive：缺省=无筛选（全选+无时间界）──────────────
test('defaultFilters：时间空界 + types=null（全选）= 现状行为；filtersActive=false', () => {
  const f = defaultFilters()
  assert.deepEqual(f, { since: '', until: '', types: null })
  assert.equal(filtersActive(f), false, '缺省不带任何筛选（API 缺省=现状行为的前端同款）')
  assert.deepEqual(toQuery(f), {}, '缺省不发筛选查询参')
})

test('filtersActive：时间界或类型收窄任一置位 = true', () => {
  assert.equal(filtersActive(setDate(defaultFilters(), 'since', '2026-09-01')), true)
  assert.equal(filtersActive(setDate(defaultFilters(), 'until', '2026-09-30')), true)
  assert.equal(filtersActive(toggleType(defaultFilters(), IDS, 'manual:scan')), true)
})

// ── 类型多选（能力③）：三来源多选开关，全选归一 null ─────────────────────────
test('typeSelection：types=null=全选；显式集合=逐 id 勾选态', () => {
  assert.deepEqual(typeSelection(defaultFilters(), IDS), IDS, '缺省全选')
  const f = toggleType(defaultFilters(), IDS, 'alerts:kb')
  assert.deepEqual(typeSelection(f, IDS), ['cron:wiki-ingest', 'manual:scan'])
})

test('toggleType：去选/加选往返；全选自动归一 types=null（回到缺省形）', () => {
  const f1 = toggleType(defaultFilters(), IDS, 'manual:scan') // 全选态去掉一个
  assert.deepEqual(f1.types, ['cron:wiki-ingest', 'alerts:kb'])
  const f2 = toggleType(f1, IDS, 'manual:scan') // 加回 → 全选
  assert.equal(f2.types, null, '全选归一 null（不发 type 参数=现状行为）')
  const f3 = toggleType(toggleType(f2, IDS, 'manual:scan'), IDS, 'alerts:kb')
  assert.deepEqual(f3.types, ['cron:wiki-ingest'], '连续去选两个 → 显式剩一个')
})

test('toggleType：可全不选（types=[]）——如实空选，不伪造条目', () => {
  let f = defaultFilters()
  for (const id of IDS) f = toggleType(f, IDS, id)
  assert.deepEqual(f.types, [], '三来源可全不选')
  assert.deepEqual(typeSelection(f, IDS), [])
  assert.equal(filtersActive(f), true)
})

test('toggleType：未知 id 不入集合（不编造来源）——状态原样不动', () => {
  const fromFull = toggleType(defaultFilters(), IDS, 'mystery')
  assert.equal(fromFull.types, null, '全选态遇未知 id 不动（不造显式集）')
  const fromExplicit = toggleType({ since: '', until: '', types: ['cron:wiki-ingest'] }, IDS, 'mystery')
  assert.deepEqual(fromExplicit.types, ['cron:wiki-ingest'], '显式集遇未知 id 不动')
})

// ── 时间输入（能力②）：起止日期置位 + 查询串归一 ─────────────────────────────
test('setDate：since/until 独立置位可清空；其余字段不动', () => {
  let f = setDate(defaultFilters(), 'since', '2026-09-01')
  f = setDate(f, 'until', '2026-09-30')
  assert.deepEqual(f, { since: '2026-09-01', until: '2026-09-30', types: null })
  f = setDate(f, 'since', '')
  assert.deepEqual(f, { since: '', until: '2026-09-30', types: null })
})

test('toQuery：仅发置位参（since/until 原样透传、type=选中 id 逗串；全选归一不发）', () => {
  assert.deepEqual(toQuery(setDate(defaultFilters(), 'since', '2026-09-01')), { since: '2026-09-01' })
  const both = toQuery(setDate(setDate(defaultFilters(), 'since', '2026-09-01'), 'until', '2026-09-30'))
  assert.deepEqual(both, { since: '2026-09-01', until: '2026-09-30' })
  const typed = toQuery(toggleType(defaultFilters(), IDS, 'alerts:kb'))
  assert.deepEqual(typed, { type: 'cron:wiki-ingest,manual:scan' })
  const none = toQuery({ since: '', until: '', types: [] })
  assert.deepEqual(none, { type: '' }, '全不选=显式空串（与缺省缺席可区分）')
})

test('toQuery：三能力叠加 = since+until+type 同时发（组合正确）', () => {
  let f = setDate(defaultFilters(), 'since', '2026-09-01')
  f = setDate(f, 'until', '2026-09-28')
  f = toggleType(f, IDS, 'manual:scan')
  assert.deepEqual(toQuery(f), { since: '2026-09-01', until: '2026-09-28', type: 'cron:wiki-ingest,alerts:kb' })
})

// ── 空结果态（如实，不伪造）──────────────────────────────────────────────────
test('emptyStateMessage：三态如实——全不选/有筛选无匹配/无筛选无记录，各说各话不冒充', () => {
  const none = emptyStateMessage({ since: '', until: '', types: [] })
  assert.match(none, /未选任何来源/)
  const filtered = emptyStateMessage(setDate(defaultFilters(), 'since', '2026-09-01'))
  assert.match(filtered, /筛选/)
  const empty = emptyStateMessage(defaultFilters())
  assert.match(empty, /暂无日志/)
})

// ── 能力① 组合锁：默认时间倒序 + 翻旧追加于下方（去重/闸门语义保持）──────────
test('能力① toDisplayOrder：时间倒序（最新在上）——存储升序的逆序视图，不改数据面语义', () => {
  const asc = [L('a', 'f', 1, 'old', '20260927'), L('a', 'f', 2, 'mid', '20260928'), L('a', 'f', 3, 'new', '20260929')]
  const view = toDisplayOrder(asc)
  assert.deepEqual(view.map((l) => l.text), ['new', 'mid', 'old'], '最新在最上')
  assert.deepEqual(asc.map((l) => l.text), ['old', 'mid', 'new'], '原数组不动（纯视图）')
})

test('能力① 组合：打开=最新页在上；「加载更早」旧块追加于下方（prependChunk 去重 + hasMore 闸门保持）', () => {
  const page1 = { lines: [L('a', 'f', 3, 'c3', '20260929'), L('a', 'f', 4, 'c4', '20260930')], hasMore: true, cursor: 'k1', sources: [] }
  let h = applyLatest(initialHistory(), page1)
  assert.deepEqual(toDisplayOrder(h.lines).map((l) => l.text), ['c4', 'c3'], '打开弹层：最新条目在最上')
  assert.equal(canLoadOlder(h), true)
  h = applyOlder(h, { lines: [L('a', 'f', 2, 'c2', '20260928'), L('a', 'f', 3, 'c3', '20260929')], hasMore: false, cursor: null })
  const view = toDisplayOrder(h.lines)
  assert.deepEqual(view.map((l) => l.text), ['c4', 'c3', 'c2'], '翻旧追加于下方 + 锚点去重（不重不漏）')
  assert.equal(canLoadOlder(h), false, '闸门语义保持（hasMore=false 不再翻）')
  assert.equal(new Set(view.map(lineKey)).size, view.length, '展示面零重复键')
})

// ── 能力②③ 组合锁：翻旧后过滤仍生效 + 类型可叠加（容器数据流同款顺序）────────
test('能力②③ 组合：翻旧后时间/类型过滤仍生效（各页同参），叠加展示序仍倒序', () => {
  // 容器顺序：每次请求 toQuery(filters) 同参 → 服务端过滤页 → applyLatest/applyOlder 累积
  const filters = setDate(toggleType(defaultFilters(), IDS, 'manual:scan'), 'until', '2026-09-29')
  assert.deepEqual(toQuery(filters), { until: '2026-09-29', type: 'cron:wiki-ingest,alerts:kb' })
  // 服务端过滤后的页（只含区间内+选中来源；页2=更早块，同参过滤）
  const page1 = { lines: [L('cron:wiki-ingest', 'f', 2, 'b', '20260929'), L('alerts:kb', 'g', 1, 'a', '20260929')], hasMore: true, cursor: 'k1', sources: [] }
  const page2 = { lines: [L('cron:wiki-ingest', 'f', 1, 'z', '20260927')], hasMore: false, cursor: null, sources: [] }
  let h = applyLatest(initialHistory(), page1)
  h = applyOlder(h, page2)
  const view = toDisplayOrder(h.lines)
  assert.deepEqual(view.map((l) => l.text), ['a', 'b', 'z'], '翻旧追加于下方（20260929 两条在上、20260927 更早块落下方）且过滤仍生效（组合正确）')
  for (const l of view) {
    assert.ok(l.dateKey <= '20260929', `区间外条目不得出现：${l.dateKey}`)
    assert.notEqual(l.source, 'manual:scan', '未选来源不得出现')
  }
})
