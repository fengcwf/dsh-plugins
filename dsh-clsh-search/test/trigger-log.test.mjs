// trigger-log.test.mjs — T9 触发日志内存环单测（US-9 / INV-11~13）
// 离线：纯内存断言，零持久化、零网络。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { TRIGGER_LOG_ENTRY_KEYS, createTriggerLog } from '../lib/trigger-log.js'

const makeEntry = (index) => ({
  ts: 1000 + index,
  via: 'search',
  ok: true,
  elapsedMs: 10 + index,
  resultCount: index,
  queryDigest: { len: 6, first: '深度学习' },
  sources: [{ name: 'ddg', elapsedMs: 5, ok: true }],
})

test('默认容量 200：超出丢最旧（INV-11 内存环）', () => {
  const log = createTriggerLog()
  assert.equal(log.capacity, 200, '默认容量 200')
  for (let index = 0; index < 250; index += 1) {
    assert.equal(log.record(makeEntry(index)), true)
  }
  assert.equal(log.size(), 200, '环容量封顶 200')
  const entries = log.list()
  assert.equal(entries[0].ts, 1050, '最旧 50 条被丢（第 51 条起）')
  assert.equal(entries[entries.length - 1].ts, 1249, '最新在尾')
})

test('容量可配（Config 日志容量键透传）：小容量逐条覆写最旧', () => {
  const log = createTriggerLog({ capacity: 3 })
  assert.equal(log.capacity, 3)
  for (const index of [1, 2, 3, 4]) log.record(makeEntry(index))
  assert.equal(log.size(), 3)
  assert.deepEqual(log.list().map((entry) => entry.ts), [1002, 1003, 1004], '时间序，最旧被覆写')
  // 非法容量回落默认 200（fail-open 不炸）
  assert.equal(createTriggerLog({ capacity: 0 }).capacity, 200)
  assert.equal(createTriggerLog({ capacity: 1.5 }).capacity, 200)
  assert.equal(createTriggerLog({ capacity: 'big' }).capacity, 200)
})

test('list 时间序 + limit 取尾部；clear 清空计数并复位', () => {
  const log = createTriggerLog({ capacity: 5 })
  for (const index of [1, 2, 3]) log.record(makeEntry(index))
  assert.deepEqual(log.list().map((entry) => entry.ts), [1001, 1002, 1003], '时间序最旧在前')
  assert.deepEqual(log.list({ limit: 2 }).map((entry) => entry.ts), [1002, 1003], 'limit 取尾部 N 条')
  assert.equal(log.clear(), 3, '返回清掉条数')
  assert.equal(log.size(), 0)
  assert.deepEqual(log.list(), [])
  assert.equal(log.available(), true, 'clear 复位可用（重试缝）')
})

test('条目键闭集严格：query 明文/body/headers/杂键一律不入条目（INV-12）', () => {
  const log = createTriggerLog()
  log.record({
    ts: 1,
    via: 'search',
    ok: true,
    elapsedMs: 12,
    resultCount: 8,
    queryDigest: { len: 6, first: '深度学习' },
    sources: [],
    query: '深度学习 入门到精通',
    body: '<html>响应正文</html>',
    headers: { 'User-Agent': 'x' },
    request: '不该出现',
    note: '杂键',
  })
  const [entry] = log.list()
  assert.deepEqual(Object.keys(entry).sort(), [...TRIGGER_LOG_ENTRY_KEYS].sort(), '条目键恰为白名单闭集')
  assert.equal('query' in entry, false, '无 query 明文')
  assert.equal('body' in entry, false, '无响应正文')
  assert.equal('headers' in entry, false, '无请求头')
  assert.equal('note' in entry, false, '白名单外的键即弃')
  const json = JSON.stringify(entry)
  assert.equal(json.includes('入门到精通'), false, '完整查询词串零残留')
  assert.equal(json.includes('响应正文'), false, '正文串零残留')
})

test('queryDigest 只含 len 与首词：整句误传也只留首词限量前缀（INV-12）', () => {
  const log = createTriggerLog()
  log.record(makeEntry(1))
  log.record({ ts: 2, via: 'search', ok: true, queryDigest: { len: 20, first: '深度学习 入门 到 精通', secret: 'x' } })
  log.record({ ts: 3, via: 'search', ok: true, queryDigest: 'not-an-object' })
  log.record({ ts: 4, via: 'search', ok: true })
  const entries = log.list()
  assert.deepEqual(entries[0].queryDigest, { len: 6, first: '深度学习' })
  assert.deepEqual(entries[1].queryDigest, { len: 20, first: '深度学习' }, '首词截断：整句只留第一个词')
  assert.deepEqual(Object.keys(entries[1].queryDigest).sort(), ['first', 'len'], 'digest 键恰两枚，杂键即弃')
  assert.deepEqual(entries[2].queryDigest, { len: 0, first: '' }, '非法 digest 回落安全默认')
  assert.deepEqual(entries[3].queryDigest, { len: 0, first: '' }, '缺省 digest 安全默认')
  // 超长首词截断
  const log2 = createTriggerLog()
  log2.record({ ts: 1, queryDigest: { len: 3, first: 'x'.repeat(200) } })
  assert.equal(log2.list()[0].queryDigest.first.length, 32, '首词截 32 字符上限')
})

test('sources 项键闭集：name/elapsedMs/ok/code?，逐源杂键即弃', () => {
  const log = createTriggerLog()
  log.record({
    ts: 1,
    sources: [
      { name: 'ddg', elapsedMs: 12, ok: true, code: 'SEARCH_BLOCKED_SUSPECTED', query: '明文' },
      { name: 'bing', elapsedMs: 30, ok: false },
      { nameless: true },
    ],
  })
  const [entry] = log.list()
  assert.equal(entry.sources.length, 2, '非法项（无 name）丢弃')
  assert.deepEqual(Object.keys(entry.sources[0]).sort(), ['code', 'elapsedMs', 'name', 'ok'], '项键恰白名单')
  assert.equal('query' in entry.sources[0], false, '逐源明细无 query')
  assert.deepEqual(Object.keys(entry.sources[1]).sort(), ['elapsedMs', 'name', 'ok'], '无 code 不带该键')
})

test('fail-open：写入异常不抛、available 可探测、不影响主链（INV-13）', () => {
  const log = createTriggerLog()
  assert.equal(log.available(), true, '初始可用')
  const trap = {}
  Object.defineProperty(trap, 'ts', {
    get() {
      throw new Error('读取条目炸了')
    },
  })
  let threw = false
  let result = null
  try {
    result = log.record(trap)
  } catch {
    threw = true
  }
  assert.equal(threw, false, 'record 绝不抛（主链隔离）')
  assert.equal(result, false, '失败如实返回 false（不静默吞成成功）')
  assert.equal(log.available(), false, 'available() 探测到不可用')
  assert.equal(log.record(makeEntry(1)), false, '不可用后拒写（不半写）')
  assert.equal(log.size(), 0, '半写零残留')
  assert.equal(log.clear(), 0)
  assert.equal(log.available(), true, 'clear 复位后恢复')
  assert.equal(log.record(makeEntry(2)), true, '恢复后正常记录')
})

test('stats：逐源最近耗时与成败聚合（US-16 复用日志环，R29）', () => {
  const log = createTriggerLog()
  log.record({ ts: 1, sources: [{ name: 'ddg', elapsedMs: 10, ok: true }, { name: 'bing', elapsedMs: 20, ok: false }] })
  log.record({ ts: 2, sources: [{ name: 'ddg', elapsedMs: 30, ok: false }] })
  const stats = log.stats()
  assert.deepEqual(stats.map((stat) => stat.name), ['bing', 'ddg'], '按源名稳定排序')
  const ddg = stats.find((stat) => stat.name === 'ddg')
  assert.equal(ddg.count, 2)
  assert.equal(ddg.okCount, 1)
  assert.equal(ddg.failCount, 1)
  assert.equal(ddg.lastMs, 30, '最近一次耗时')
  assert.equal(ddg.lastOk, false, '最近一次成败')
  assert.deepEqual(log.list({ limit: 1 })[0].sources.length, 1)
})

test('零持久化 + 零依赖：模块无存储与模块引用面（INV-11 / K-8 机械面）', async () => {
  const source = await readFile(new URL('../lib/trigger-log.js', import.meta.url), 'utf8')
  assert.equal(/fs|writeFile|open\(/.test(source), false, '零持久化调用面（verify grep 同口径）')
  const moduleLines = source.split('\n').filter((line) => /^\s*(import|export .* from|const .*require\()/.test(line) && /from\s+['"]/.test(line))
  assert.deepEqual(moduleLines, [], '零模块引用（自包含，K-8/P-4）')
  assert.equal(/eval\s*\(|new\s+Function/.test(source), false, '零求值面')
})
