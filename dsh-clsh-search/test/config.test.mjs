// config.test.mjs — Config 面回归锁（Task 1 / INV-9 / K-9）
// 断言依据 = R5 确认表（TECH.md §4「Config 面（zod，INV-9 全键默认值=R5 确认值）」）。
// 离线、不写真实 home：只做 schema 解析断言，不触网不落盘。
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

const { Config } = await import('../lib/index.js')

const HOME = os.homedir()

/** R5 确认表逐字面（12000 / 3 / 30000 / 8 / 600000 / 15 / auto / 四源 true / priority=ddg,bing,so360,baidu / 三落点） */
const R5 = {
  sources: {
    ddg: true,
    bing: true,
    so360: true,
    baidu: true,
    priority: ['ddg', 'bing', 'so360', 'baidu'],
  },
  timeoutMs: 12000,
  retries: 3,
  chainBudgetMs: 30000,
  maxResults: 8,
  cacheTtlMs: 600000,
  egoBudget: 15,
  takeOver: 'auto',
  dataDir: path.join(HOME, '.dsh', 'dsh-clsh-search'),
  cacheDir: path.join(HOME, '.dsh', 'cache', 'dsh-clsh-search'),
  logDir: path.join(HOME, '.dsh', 'logs', 'dsh-clsh-search'),
}

test('Config 全键默认值与 R5 确认表逐项一致', () => {
  const fromEmpty = Config.parse({})
  assert.deepEqual(fromEmpty, R5, '空 config 解析结果必须与 R5 表逐键一致')
  assert.deepEqual(Config.parse(undefined), R5, '未传 config（undefined）同样回落 R5 全键默认')
})

test('Config 键面封闭：无缺键、无 R5 之外的新增键', () => {
  const cfg = Config.parse({})
  assert.deepEqual(
    Object.keys(cfg).sort(),
    Object.keys(R5).sort(),
    'Config 键集合必须与 R5 表键集合一致（多键=超范围，缺键=漏配）',
  )
})

test('R5 路径字面：`~` 按 os.homedir() 展开，默认值与用户填写值同口径', () => {
  const cfg = Config.parse({})
  for (const key of ['dataDir', 'cacheDir', 'logDir']) {
    assert.equal(cfg[key], R5[key], `${key} 默认值 = R5 字面展开后绝对路径`)
    assert.ok(!cfg[key].startsWith('~'), `${key} 输出不得残留波浪号字面（必须已展开）`)
    assert.ok(path.isAbsolute(cfg[key]), `${key} 必须是绝对路径`)
  }
  // 用户在 patch/profile 里仍可写 `~` 字面：解析时同规则展开
  assert.equal(Config.parse({ dataDir: '~/my-data' }).dataDir, path.join(HOME, 'my-data'))
  assert.equal(Config.parse({ cacheDir: '~' }).cacheDir, HOME)
  // 绝对路径原样保留（K-7 可配）
  assert.equal(Config.parse({ logDir: '/var/log/clsh' }).logDir, '/var/log/clsh')
})

test('四源开关单独可配、priority 可重排（K-9 源开关面）', () => {
  const cfg = Config.parse({ sources: { ddg: false, priority: ['bing', 'baidu'] } })
  assert.equal(cfg.sources.ddg, false, '单源可关')
  assert.equal(cfg.sources.bing, true, '未触达的开关回落默认 true')
  assert.equal(cfg.sources.so360, true)
  assert.equal(cfg.sources.baidu, true)
  assert.deepEqual(cfg.sources.priority, ['bing', 'baidu'], 'priority 覆盖生效（可重排）')
  // 非法源 id 拒绝（schema 真校验，不是透传）
  assert.throws(() => Config.parse({ sources: { priority: ['google'] } }), 'priority 只收四源词汇')
})

test('maxResults clamp 1-10：越界截断非放行，默认 8', () => {
  assert.equal(Config.parse({}).maxResults, 8)
  assert.equal(Config.parse({ maxResults: 99 }).maxResults, 10, '上限截到 10')
  assert.equal(Config.parse({ maxResults: 0 }).maxResults, 1, '下限截到 1')
  assert.equal(Config.parse({ maxResults: -3 }).maxResults, 1)
  assert.equal(Config.parse({ maxResults: 5 }).maxResults, 5, '区间内原样')
  // 类型非法仍拒绝（clamp 不等于放行任意类型）
  assert.throws(() => Config.parse({ maxResults: '8' }))
  assert.throws(() => Config.parse({ maxResults: 8.5 }))
})

test('takeOver 三态枚举：auto / force / off 合法，其余拒绝', () => {
  assert.equal(Config.parse({}).takeOver, 'auto')
  assert.equal(Config.parse({ takeOver: 'force' }).takeOver, 'force')
  assert.equal(Config.parse({ takeOver: 'off' }).takeOver, 'off')
  assert.throws(() => Config.parse({ takeOver: 'yes' }))
  assert.throws(() => Config.parse({ takeOver: true }))
})

test('数值项 schema 真校验：类型/符号非法即拒（非透传）', () => {
  assert.throws(() => Config.parse({ timeoutMs: '1500' }), '字符串数字必须拒')
  assert.throws(() => Config.parse({ timeoutMs: -1 }), '非正超时必须拒')
  assert.throws(() => Config.parse({ retries: -1 }), '负重试必须拒')
  assert.throws(() => Config.parse({ chainBudgetMs: 0 }), '零整链预算必须拒')
  assert.throws(() => Config.parse({ cacheTtlMs: 'ten' }))
  assert.throws(() => Config.parse({ egoBudget: 'fifteen' }))
  assert.throws(() => Config.parse({ sources: { ddg: 'yes' } }), '开关必须是 boolean')
  assert.throws(() => Config.parse({ dataDir: 123 }), '落点必须是字符串')
  assert.throws(() => Config.parse(null), 'null 不是缺省：schema 拒（缺省归一由 resolveConfig 承担）')
  assert.throws(() => Config.parse('timeoutMs=1'), '非对象 config 必须拒')
})

test('部分覆盖只改触达键：未触达键回落 R5 默认（热改语义）', () => {
  const cfg = Config.parse({ timeoutMs: 800, takeOver: 'off' })
  assert.equal(cfg.timeoutMs, 800)
  assert.equal(cfg.takeOver, 'off')
  assert.equal(cfg.retries, R5.retries)
  assert.equal(cfg.chainBudgetMs, R5.chainBudgetMs)
  assert.equal(cfg.maxResults, R5.maxResults)
  assert.equal(cfg.cacheTtlMs, R5.cacheTtlMs)
  assert.equal(cfg.egoBudget, R5.egoBudget)
  assert.deepEqual(cfg.sources, R5.sources, '未触达 sources 整组回落 R5')
  assert.equal(cfg.dataDir, R5.dataDir)
  assert.equal(cfg.cacheDir, R5.cacheDir)
  assert.equal(cfg.logDir, R5.logDir)
})

test('多次 parse 无可变共享引用：一次污染不影响后续解析', () => {
  const a = Config.parse({})
  a.sources.priority.push('polluted')
  a.sources.ddg = false
  const b = Config.parse({})
  assert.deepEqual(b.sources.priority, ['ddg', 'bing', 'so360', 'baidu'], 'priority 数组不共享引用')
  assert.equal(b.sources.ddg, true, '开关不共享引用')
  assert.deepEqual(b, R5, '污染后再次解析仍与 R5 一致')
})
