// Hindsight 设置节纯模块单测（2026-10-07 波 t12）：web/src/lib/hindsight-model.js
// （日历聚合 / 状态徽标判定 / 时间校验 / L2 三态 / 动作状态机）+ api.js 端点形
// （文档相对 api/wiki-steward/hindsight/*，无前导斜杠——B 卡实测坑）+ dist 字面判据（LRN-045 防假绿）。
// 零 mock：纯函数直测；api 端点=源码结构扫描；dist=真构建物字节（pnpm build 后必绿，陈旧=红）。
import test from 'node:test'
import assert from 'node:assert/strict'

const {
  aggregateSyncCalendar, statusBadges, isValidHhmm, normalizeHhmm, l2View,
  initialActionState, beginAction, finishAction, ACTIONS,
} = await import('../web/src/lib/hindsight-model.js')

// ── 日历聚合（「按日计数条」数据源：sync-log dateKey 聚合）────────────────────
test('aggregateSyncCalendar：逐日聚合——runs/facts/skipped/errors 计数、banks 去重排序、dateKey 降序、pct 相对峰值', () => {
  const lines = [
    { ts: '2026-10-06T03:25:01Z', bank: 'beta', facts: 3, skipped: 0 },
    { ts: '2026-10-07T03:25:01Z', bank: 'alpha::repo', facts: 5, skipped: 1 },
    { ts: '2026-10-07T04:00:00Z', bank: 'beta', facts: 7, skipped: 2, error: 'boom' },
  ]
  const { days, dropped, total } = aggregateSyncCalendar(lines)
  assert.equal(total, 3, 'total=输入行数（全量口径）')
  assert.equal(dropped, 0)
  assert.deepEqual(days.map((d) => d.dateKey), ['2026-10-07', '2026-10-06'], 'dateKey 降序（最近在前）')
  const d7 = days[0]
  assert.equal(d7.runs, 2, '同日两次同步=2 runs')
  assert.equal(d7.facts, 12, 'facts 逐行累加（5+7）')
  assert.equal(d7.skipped, 3)
  assert.equal(d7.errors, 1, '带 error 行计 errors（失败零静默）')
  assert.deepEqual(d7.banks, ['alpha::repo', 'beta'], 'banks 去重+字典序')
  assert.equal(d7.pct, 100, '峰值日 pct=100')
  assert.equal(days[1].pct, 25, '3/12=25%（计数条长度口径）')
})

test('aggregateSyncCalendar：畸形行（ts 非 YYYY-MM-DD）不进日桶、计入 dropped 如实；limit 截前 N 天不改 total', () => {
  const bad = aggregateSyncCalendar([{ ts: '坏行' }, { ts: '' }, { ts: '2026-10-07T01:00:00Z', bank: 'a', facts: 2 }])
  assert.equal(bad.dropped, 2, '畸形行如实计数（不静默丢弃）')
  assert.equal(bad.total, 3)
  assert.deepEqual(bad.days.map((d) => d.dateKey), ['2026-10-07'])
  const empty = aggregateSyncCalendar(null)
  assert.deepEqual(empty, { days: [], dropped: 0, total: 0 }, '空/缺输入=空日历零炸')
  const lines = [
    { ts: '2026-10-05T01:00:00Z', facts: 1 },
    { ts: '2026-10-06T01:00:00Z', facts: 2 },
    { ts: '2026-10-07T01:00:00Z', facts: 3 },
  ]
  const limited = aggregateSyncCalendar(lines, { limit: 1 })
  assert.equal(limited.days.length, 1, 'limit 只截展示面')
  assert.equal(limited.days[0].dateKey, '2026-10-07')
  assert.equal(limited.total, 3, 'total 保持全量口径')
})

// ── 状态徽标判定（状态条：diagnose/sync_status 官方口径，取不到不编造）────────
test('statusBadges：L1 启用 + synced（activeOps===0 主判据）→ l1-on / sync-synced / bank·fact 计数徽标', () => {
  const badges = statusBadges({
    enabled: true,
    sync_status: { bank: 'alpha::repo', activeOps: 0, synced: true },
    banks: [
      { id: 'alpha::repo', fact_count: 4 },
      { id: 'beta', fact_count: 1 },
      { id: 'gamma' }, // fact_count 缺=按 0 汇总，不编造
    ],
    warnings: [],
  })
  const keys = badges.map((b) => b.key)
  assert.deepEqual(keys, ['l1-on', 'sync-synced', 'banks'])
  assert.equal(badges[1].label, '已同步')
  assert.equal(badges[2].label, 'bank 3 · fact 5', 'bank 数/fact_count 官方字段汇总')
})

test('statusBadges：sync_status 取不到=「同步状态未知」如实 + activeOps>0=「同步中」+ warnings 计数徽标', () => {
  const unknown = statusBadges({ warnings: ['banks 清单获取失败：x'] })
  assert.deepEqual(unknown.map((b) => b.key), ['l1-unknown', 'sync-unknown', 'banks', 'warnings'])
  assert.equal(unknown[0].label, 'L1 状态未知', 'enabled 缺=未知，不编造')
  assert.equal(unknown[1].tone, 'warn')
  assert.equal(unknown[3].label, '警告 1')
  const active = statusBadges({ enabled: false, sync_status: { bank: 'b', activeOps: 2, synced: false } })
  assert.deepEqual(active.map((b) => b.key), ['l1-off', 'sync-active', 'banks'])
  assert.equal(active[1].label, '同步中（2 进行中）')
})

// ── 时间校验（HH:MM 同步时间输入）──────────────────────────────────────────
test('时间校验：isValidHhmm/normalizeHhmm 严格 HH:MM（00:00–23:59），非法=null 不改写输入', () => {
  assert.equal(isValidHhmm('03:25'), true)
  assert.equal(isValidHhmm('00:00'), true)
  assert.equal(isValidHhmm('23:59'), true)
  assert.equal(isValidHhmm('24:00'), false)
  assert.equal(isValidHhmm('3:25'), false, '不补零凑合法')
  assert.equal(isValidHhmm('03-25'), false)
  assert.equal(isValidHhmm(''), false)
  assert.equal(isValidHhmm(null), false)
  assert.equal(normalizeHhmm(' 03:25 '), '03:25', 'trim 后返回')
  assert.equal(normalizeHhmm('bad'), null, '非法=null（调用方如实报错）')
})

// ── L2 只读徽标展示（「⏳ 待重启」+ disabled 三态）──────────────────────────
test('l2View：disabled 三态判定 + 「⏳ 待重启」徽标常驻（L2 写配置需重启，写按钮后置）', () => {
  const off = l2View({ config: { path: '/home/u/.hindsight/coding-agent.json', exists: true, disabled: true } })
  assert.equal(off.state, 'disabled')
  assert.match(off.stateLabel, /已停用/)
  assert.equal(off.badge, '⏳ 待重启')
  assert.match(off.note, /重启/)
  assert.equal(l2View({ config: { disabled: false } }).state, 'enabled')
  assert.equal(l2View({ config: { exists: false, disabled: null } }).state, 'unknown', '配置缺位=未知不编造')
  assert.equal(l2View(null).state, 'unknown')
})

// ── 动作状态机（sync / toggle / time）──────────────────────────────────────
test('动作状态机：idle → running → done|error，message 如实原文；纯函数不改原对象', () => {
  assert.deepEqual(ACTIONS, ['sync', 'toggle', 'time'])
  const s0 = initialActionState()
  for (const k of ACTIONS) assert.equal(s0[k].status, 'idle')
  const s1 = beginAction(s0, 'sync')
  assert.equal(s1.sync.status, 'running')
  assert.equal(s0.sync.status, 'idle', '纯函数不改原对象')
  assert.equal(finishAction(s1, 'sync', { ok: true, message: '同步已启动（detached）' }).sync.status, 'done')
  const err = finishAction(s1, 'sync', { ok: false, message: 'HTTP 500' })
  assert.equal(err.sync.status, 'error')
  assert.equal(err.sync.message, 'HTTP 500', '错误原文如实（不吞不改写）')
})

// ── api.js 端点形（文档相对，无前导斜杠——B 卡实测坑）────────────────────────
test('api.js 端点形：hindsight/* 与 settings 全走 ${base} 拼接（文档相对），零前导斜杠字面', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../web/src/api.js', import.meta.url), 'utf8')
  for (const ep of ['hindsight/status', 'hindsight/sync-log', 'hindsight/sync', 'hindsight/toggle']) {
    assert.ok(src.includes('${base}/' + ep), `缺 \${base}/${ep} 拼接形（文档相对端点）`)
  }
  assert.ok(src.includes('${base}/settings'), '时间热改走 settings 写面（${base}/settings）')
  assert.doesNotMatch(src, /['"`]\/(?:api\/)?(?:wiki-steward\/)?hindsight/, '禁前导斜杠端点字面（B 卡实测 404 坑）')
})

// ── 组件纪律 + 六控件落位（§4 表逐行）──────────────────────────────────────
test('六控件落位：HindsightSyncPanel.vue 含 §4 表六个语义键 + 文案可判形；组件 ≤300 行（.vue 只做展示）', async () => {
  const fs = await import('node:fs')
  const vue = fs.readFileSync(new URL('../web/src/components/HindsightSyncPanel.vue', import.meta.url), 'utf8')
  for (const role of ['status-bar', 'sync-button', 'sync-calendar', 'sync-time', 'l1-toggle', 'l2-badges']) {
    assert.ok(vue.includes(`data-hs-role="${role}"`), `缺语义键 data-hs-role="${role}"（§4 表逐行落位）`)
  }
  for (const text of ['Hindsight 同步', '立即同步', '同步日历', '待重启', 'L1 同步启停', 'L2 记忆插件启停']) {
    assert.ok(vue.includes(text), `缺控件文案「${text}」（dist 字面判据同源）`)
  }
  assert.ok(vue.split('\n').length <= 300, '组件 ≤300 行（工作区 UI 约定）')
})

// ── dist 字面判据（LRN-045 防假绿）：新控件语义键/文案进构建物 + dist 色值零命中 ──
test('dist 字面判据：web/dist/panel.js 含新控件语义键/文案/hindsight 端点形（构建物已重建非陈旧）', async () => {
  const fs = await import('node:fs')
  const js = fs.readFileSync(new URL('../web/dist/panel.js', import.meta.url), 'utf8')
  for (const role of ['status-bar', 'sync-button', 'sync-calendar', 'sync-time', 'l1-toggle', 'l2-badges']) {
    assert.ok(js.includes(role), `web/dist/panel.js 缺语义键 ${role}——dist 陈旧，先跑 pnpm build（LRN-045）`)
  }
  for (const text of ['立即同步', '同步日历', '待重启']) {
    assert.ok(js.includes(text), `web/dist/panel.js 缺文案「${text}」——dist 陈旧，先跑 pnpm build`)
  }
  assert.ok(js.includes('hindsight/status'), '构建物含 hindsight 端点形（数据面走 api/wiki-steward/hindsight/*）')
})

test('dist 色值锁：web/dist/style.css 零手写色值（hex 仅容 minifier 对 transparent 的等价改写 #0000）+ 零 rgb/hsl + 零暗色分支', async () => {
  const fs = await import('node:fs')
  const css = fs.readFileSync(new URL('../web/dist/style.css', import.meta.url), 'utf8')
  // esbuild 压缩把 CSS 关键字 transparent 改写为 #0000（等价改写，非手写色值）；除此以外任何 hex
  // =混入硬编码色值必红。色板唯一来源=--dsw-alias-* token（源码面 hex/rgb/hsl 零命中由 web-panel.test.mjs 钉住）。
  const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
  for (const h of hexes) assert.equal(h.toLowerCase(), '#0000', `dist 样式混入硬编码色值 ${h}（token 唯一色板）`)
  assert.doesNotMatch(css, /rgba?\(/i, 'dist 样式禁硬编码 rgb/rgba')
  assert.doesNotMatch(css, /hsla?\(/i, 'dist 样式禁硬编码 hsl/hsla')
  assert.doesNotMatch(css, /prefers-color-scheme/, 'dist 样式禁暗色分支（随宿主别名适配）')
  assert.match(css, /var\(--dsw-alias-/, 'dist 样式色板来自 dsh token（非硬编码）')
})
