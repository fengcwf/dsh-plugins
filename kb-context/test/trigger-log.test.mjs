// trigger-log 单测（10-A）：内存环记录面（INV-TL1 脱敏白名单 / INV-TL2 fail-open / INV-TL4 环本性）。
// 契约源：changes/2026-09-30-kb-context-trigger-log/TECH.md「实现面 1」+ constitution.md INV-TL1…5。
// 反例必含：①键集闭集机械断言（多键即红，INV-TL1）②自由文本不入日志（reason/channel 枚举强制）
//           ③record 全 try/catch 静默吞（坏 entry / 坏 isEnabled 不抛，INV-TL2）④环满丢最旧、恒 ≤capacity
//           ⑤isEnabled 现读（热关后 record 直接 no-op）⑥clear 清空后可继续用。
import test from 'node:test'
import assert from 'node:assert/strict'

const { createTriggerLog, ENTRY_KEYS, ENTRY_REASONS, ENTRY_CHANNELS } = await import('../lib/trigger-log.js')

/** 机械键集断言（INV-TL1：entry 键集==闭集白名单，多键/缺键即红） */
function assertKeySet(entry) {
  assert.deepEqual(Object.keys(entry).sort(), [...ENTRY_KEYS].sort(), 'entry 键集必须==闭集白名单')
}

const FULL = {
  ts: 1_000_000,
  hit: true,
  channel: 'words',
  matched: ['wiki'],
  snippets: 2,
  tokenEst: 42,
  elapsedMs: 7,
  reason: 'hit',
}

// ── S1：API 形状 + 环语义（A-TL4 / INV-TL4） ─────────────────────────────────

test('createTriggerLog → {record,list,clear,stats} 四件套（TECH 实现面 1 形状）', () => {
  const log = createTriggerLog({})
  assert.equal(typeof log.record, 'function')
  assert.equal(typeof log.list, 'function')
  assert.equal(typeof log.clear, 'function')
  assert.equal(typeof log.stats, 'function')
})

test('环满丢最旧：默认容量 200，250 条后长度恒 200、最旧被丢、list() 时间倒序', () => {
  const log = createTriggerLog({})
  for (let i = 0; i < 250; i++) log.record({ ...FULL, ts: i })
  const entries = log.list()
  assert.equal(entries.length, 200, '长度恒 ≤capacity(200)')
  assert.equal(entries[0].ts, 249, 'list() 时间倒序：最新在前')
  assert.equal(entries[199].ts, 50, '最旧 0..49 已丢（丢最旧）')
  assert.ok(entries.every((e) => e.ts >= 50), '被丢的必须是最旧')
  assert.equal(log.stats().count, 200)
  assert.equal(log.stats().capacity, 200)
})

test('自定义容量丢最旧（capacity=3）：第 4 条挤掉第 1 条', () => {
  const log = createTriggerLog({ capacity: 3 })
  for (const ts of [1, 2, 3, 4]) log.record({ ...FULL, ts })
  const entries = log.list()
  assert.equal(entries.length, 3)
  assert.deepEqual(entries.map((e) => e.ts), [4, 3, 2])
})

test('clear 清空可用：清空后 list 空、stats.count 0、继续 record 正常工作', () => {
  const log = createTriggerLog({})
  log.record(FULL)
  log.record({ ...FULL, ts: 2 })
  assert.equal(log.list().length, 2)
  log.clear()
  assert.deepEqual(log.list(), [])
  assert.equal(log.stats().count, 0)
  log.record({ ...FULL, ts: 3 })
  assert.equal(log.list().length, 1, 'clear 后环继续可用')
  assert.equal(log.list()[0].ts, 3)
})

// ── S2：INV-TL1 键集闭集 + 脱敏机械保证 ──────────────────────────────────────

test('INV-TL1 机械断言：entry 键集==闭集白名单 {ts,hit,channel,matched,snippets,tokenEst,elapsedMs,reason}', () => {
  const log = createTriggerLog({})
  log.record(FULL)
  for (const entry of log.list()) assertKeySet(entry)
  assert.deepEqual([...ENTRY_KEYS].sort(), [
    'channel', 'elapsedMs', 'hit', 'matched', 'reason', 'snippets', 'tokenEst', 'ts',
  ])
})

test('INV-TL1：多键/缺键自动收敛到闭集（外部塞 extra 键不落环）', () => {
  const log = createTriggerLog({})
  log.record({ ...FULL, extra: '用户消息原文泄漏', message: '绝密正文', note: 'x' })
  const [entry] = log.list()
  assertKeySet(entry)
  assert.ok(!JSON.stringify(entry).includes('用户消息原文泄漏'), '白名单外键必须丢弃')
  assert.ok(!JSON.stringify(entry).includes('绝密正文'))
  // 缺键补齐（键集恒==白名单，不因缺键破形）
  log.clear()
  log.record({ hit: false })
  assertKeySet(log.list()[0])
})

test('INV-TL1：reason/channel 枚举强制——自由文本（如消息原文）不入日志', () => {
  const log = createTriggerLog({})
  log.record({ ...FULL, reason: '用户在消息里说了 wiki 索引的私事', channel: '用户原话当通道' })
  const [entry] = log.list()
  assert.ok(ENTRY_REASONS.includes(entry.reason), 'reason 必须收敛到闭集枚举')
  assert.equal(entry.reason, 'error', '非法 reason 收敛到 error（不落自由文本）')
  assert.equal(entry.channel, 'none', '非法 channel 收敛到 none')
  assert.ok(!JSON.stringify(entry).includes('私事'), '用户消息正文零落（INV-TL1 红线）')
})

test('reason 闭集增补成员 "dedup"（修复轮 2）：合法枚举原样保留、闭集表含 dedup', () => {
  const log = createTriggerLog({})
  log.record({ ...FULL, reason: 'dedup' })
  const [entry] = log.list()
  assert.equal(entry.reason, 'dedup', '合法枚举成员不得被收敛（dedup 保留）')
  assert.ok(ENTRY_REASONS.includes('dedup'), 'ENTRY_REASONS 必须含 dedup（去重跳过出口专用）')
  // 闭集表机械形状：七个成员一个不多一个不少
  assert.deepEqual([...ENTRY_REASONS].sort(), [
    'dedup', 'error', 'hit', 'no-hits', 'no-trigger-match', 'no-user-source', 'timeout',
  ])
})

test('INV-TL1：matched 只保字符串数组（配置词表/实体路径成员形），数值/对象成员剔除', () => {
  const log = createTriggerLog({})
  log.record({ ...FULL, matched: ['wiki', 42, null, { evil: 'x' }, 'INDEX.md'] })
  const [entry] = log.list()
  assert.deepEqual(entry.matched, ['wiki', 'INDEX.md'])
})

test('数值字段救济：非法 ts/hit/snippets/tokenEst/elapsedMs 回退安全值，不炸不漏文本', () => {
  const log = createTriggerLog({})
  log.record({ ...FULL, ts: '现在', hit: 'yes', snippets: 'many', tokenEst: NaN, elapsedMs: Infinity })
  const [entry] = log.list()
  assert.equal(typeof entry.ts, 'number')
  assert.equal(entry.hit, false, 'hit 强制 boolean')
  assert.equal(entry.snippets, 0)
  assert.equal(entry.tokenEst, 0)
  assert.equal(entry.elapsedMs, 0)
  assertKeySet(entry)
})

test('ts 缺省时用当前时间补齐（有限数），reason 缺省收敛 error', () => {
  const log = createTriggerLog({})
  log.record({})
  const [entry] = log.list()
  assert.ok(Number.isFinite(entry.ts) && entry.ts > 0)
  assert.ok(ENTRY_REASONS.includes(entry.reason))
})

// ── S3：INV-TL2 fail-open + triggerLog.enabled 现读（A-TL5 kill switch 语义） ──

test('INV-TL2：record 全 try/catch——坏 entry（getter 抛错）静默吞，不扰调用方', () => {
  const log = createTriggerLog({})
  const hostile = {
    get hit() { throw new Error('entry getter boom') },
    ts: 1,
    reason: 'hit',
  }
  assert.doesNotThrow(() => log.record(hostile), 'record 绝不抛（INV-TL2）')
  assert.equal(log.list().length, 0, '坏 entry 不入环（吞掉不半写）')
  log.record(FULL)
  assert.equal(log.list().length, 1, '坏 entry 不破坏后续正常记录')
})

test('INV-TL2：isEnabled 抛错时 record 静默吞（开关缝异常不扰主链路）', () => {
  const log = createTriggerLog({ isEnabled: () => { throw new Error('switch boom') } })
  assert.doesNotThrow(() => log.record(FULL))
  assert.deepEqual(log.list(), [])
  assert.doesNotThrow(() => log.stats(), 'stats 同样不抛')
})

test('INV-TL2：record 传 null/undefined/非对象静默吞', () => {
  const log = createTriggerLog({})
  for (const bad of [null, undefined, 42, 'text']) {
    assert.doesNotThrow(() => log.record(bad))
  }
  assert.equal(log.list().length, 0)
})

test('triggerLog.enabled 现读语义：热关后 record 直接 no-op（零新增），热开恢复记录', () => {
  let enabled = true
  const log = createTriggerLog({ isEnabled: () => enabled })
  log.record({ ...FULL, ts: 1 })
  assert.equal(log.list().length, 1)
  enabled = false // 热关（不重建实例）
  log.record({ ...FULL, ts: 2 })
  log.record({ ...FULL, ts: 3 })
  assert.equal(log.list().length, 1, '热关后零新增 entry（A-TL5）')
  assert.equal(log.stats().enabled, false, 'stats 现读 enabled')
  enabled = true // 热开
  log.record({ ...FULL, ts: 4 })
  assert.deepEqual(log.list().map((e) => e.ts), [4, 1], '热开恢复；旧条目保留（关不清环）')
})

test('list() 时间倒序且为快照（外改不污染环）', () => {
  const log = createTriggerLog({})
  log.record({ ...FULL, ts: 1 })
  log.record({ ...FULL, ts: 2 })
  const entries = log.list()
  assert.deepEqual(entries.map((e) => e.ts), [2, 1])
  entries.pop()
  assert.equal(log.list().length, 2, 'list() 返回独立数组（调用方改它不破环）')
  // 浅拷贝（复审修复轮 2）：改 entry 本体/排序 matched 也不污染环内真身
  const [first] = log.list()
  first.hit = false
  first.matched.reverse()
  first.matched.push('污染')
  const again = log.list()
  assert.equal(again[0].hit, true, 'entry 本体改动不入环')
  assert.deepEqual(again[0].matched, ['wiki'], 'matched 数组改动不入环（切片隔离）')
})

test('容量参数救济：capacity 非法（0/负/NaN/非整数）回退 200，环不塌', () => {
  for (const capacity of [0, -5, NaN, 1.5, 'x']) {
    const log = createTriggerLog({ capacity })
    assert.equal(log.stats().capacity, 200, `capacity=${capacity} 必须回退 200`)
    for (let i = 0; i < 205; i++) log.record({ ...FULL, ts: i })
    assert.equal(log.list().length, 200)
  }
})

// ── S4：Config 面（TECH 架构图 triggerLog:{enabled(默认 true), capacity(默认 200)}） ──

test('readTriggerLogSettings：缺省=enabled true / capacity 200（默认开，Q3 裁决）', async () => {
  const { readTriggerLogSettings } = await import('../lib/index.js')
  assert.deepEqual(readTriggerLogSettings(undefined), { enabled: true, capacity: 200 })
  assert.deepEqual(readTriggerLogSettings({}), { enabled: true, capacity: 200 })
  assert.deepEqual(readTriggerLogSettings({ triggerLog: {} }), { enabled: true, capacity: 200 })
})

test('readTriggerLogSettings：显式覆盖 + 坏值救济（enabled 非 boolean 默认开；capacity 恒 ≤200 钳制）', async () => {
  const { readTriggerLogSettings } = await import('../lib/index.js')
  assert.deepEqual(readTriggerLogSettings({ triggerLog: { enabled: false } }), { enabled: false, capacity: 200 })
  assert.deepEqual(readTriggerLogSettings({ triggerLog: { capacity: 50 } }), { enabled: true, capacity: 50 })
  // 环容量恒 ≤200（INV-TL4「全局一份 200 条环」）：配置想放大也钳到 200
  assert.equal(readTriggerLogSettings({ triggerLog: { capacity: 500 } }).capacity, 200)
  assert.equal(readTriggerLogSettings({ triggerLog: { capacity: 0 } }).capacity, 200)
  assert.equal(readTriggerLogSettings({ triggerLog: { capacity: 'x' } }).capacity, 200)
  assert.equal(readTriggerLogSettings({ triggerLog: { enabled: 'yes' } }).enabled, true, '坏 enabled 回退默认开')
})

test('Config 校验 triggerLog 节（zod 真校验非透传）：enabled 非 boolean / capacity 非 number 拒', async () => {
  const { Config } = await import('../lib/index.js')
  assert.throws(() => Config.parse({ triggerLog: { enabled: 'yes' } }))
  assert.throws(() => Config.parse({ triggerLog: { capacity: 'two' } }))
  const ok = Config.parse({ triggerLog: { enabled: false } })
  assert.equal(ok.triggerLog.enabled, false)
  assert.equal(ok.triggerLog.capacity, 200, '嵌套默认补齐')
})
