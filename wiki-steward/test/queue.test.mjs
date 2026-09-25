// test/queue.test.mjs — 写失败幂等队列 + 补跑账本 + timer tick（Task 13）
// 被测件：lib/queue.js —— 入队原子/幂等覆盖（同 dedupKey 同文件覆盖）/claim+lease 崩溃回收/TTL/
// retries 耗尽/指数退避+对称 jitter（RetryPolicySchema 参数形）/replay 保序 break/溢出不卡
// （slice 在 rename 之前）/createdAt epoch-ms（ISO 比较 NaN 坑反例）/补跑账本漏跑补做/burst 不重入。
// 时序纪律：假时钟（now 注入）+ fs.utimes 回拨 mtime 模拟 lease/tmp 超龄；mkdtemp 真文件系统零 mock。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  createQueue, createTick, dedupKeyFor, toEpochMillis, retryDelay,
  DEFAULT_BACKOFF, CLAIM_LEASE_MS, TMP_GRACE_MS, REPLAY_LIMIT,
} = await import('../lib/queue.js')

const T = 1_760_000_000_000 // 固定假时钟锚点（epoch ms）
const DAY = 86_400_000

function mkDir(t, suffix = 'queue') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wiki-steward-t13-${suffix}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 真实时钟队列（需要 utimes/真实过期语义时用） */
function liveQueue(dir, opts = {}) {
  return createQueue({ dir, warn: () => {}, ...opts })
}

/** 假时钟队列（T 锚点；测试完全掌控时间） */
function fakeQueue(dir, opts = {}) {
  let t = opts.startAt ?? T
  const q = createQueue({ dir, warn: opts.warn ?? (() => {}), now: () => t, random: () => 0.5, ...opts })
  return { q, at: (v) => { t = v }, now: () => t }
}

const readEntry = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
const listFiles = (dir) => fs.readdirSync(dir).sort()

// ── ① 幂等重入：同 dedupKey 同文件覆盖（txl「同 turn 重入=同文件覆盖」）────────────

test('① 幂等重入：同 dedupKey 二次入队 = 同文件覆盖，队列只有一份（契约形状锁定）', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir)
  const k = dedupKeyFor('ses_a', 1)
  assert.equal(k.length, 32, 'dedupKey = sha256 截 32（delta-spec §2）')
  const r1 = await q.enqueue({ dedupKey: k, payload: { target: '/x', head: 'H1', body: 'B1' } })
  assert.equal(r1.ok, true)
  const r2 = await q.enqueue({ dedupKey: k, payload: { target: '/x', head: 'H2', body: 'B2' } })
  assert.equal(r2.ok, true)
  const files = listFiles(dir)
  assert.equal(files.length, 1, '同键重入=同文件覆盖（不产生第二份）')
  assert.equal(files[0], `${k}.json`, '文件名=dedupKey（幂等锚点）')
  const entry = readEntry(dir, files[0])
  assert.equal(entry.payload.body, 'B2', '后写覆盖前写')
  assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'dedupKey', 'payload', 'retries'], '队列条目契约形状')
  assert.equal(entry.retries, 0)
  assert.equal(q.depth(), 1)
})

test('入队原子：tmp+rename 落盘即完整 JSON、零 .tmp 残留（入队本身也原子）', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir)
  await q.enqueue({ dedupKey: dedupKeyFor('ses_a', 1), payload: { body: 'x' } })
  await q.enqueue({ dedupKey: dedupKeyFor('ses_a', 2), payload: { body: 'y' } })
  for (const f of listFiles(dir)) {
    assert.ok(!f.endsWith('.tmp'), `零 tmp 残留：${f}`)
    JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) // 落盘即完整可解析
  }
  assert.equal(q.depth(), 2)
})

// ── ④ createdAt 必须 epoch ms（ISO 串比较 NaN 静默失效坑）────────────────────────

test('④ createdAt epoch：缺省入队落 now() 数字；ISO 入参归一为 epoch ms（绝不存原始串）', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir)
  await q.enqueue({ dedupKey: dedupKeyFor('s', 1), payload: {} })
  await q.enqueue({ dedupKey: dedupKeyFor('s', 2), payload: {}, createdAt: new Date(T).toISOString() })
  await q.enqueue({ dedupKey: dedupKeyFor('s', 3), payload: {}, createdAt: T + 5 })
  const a = readEntry(dir, `${dedupKeyFor('s', 1)}.json`)
  const b = readEntry(dir, `${dedupKeyFor('s', 2)}.json`)
  const c = readEntry(dir, `${dedupKeyFor('s', 3)}.json`)
  assert.equal(a.createdAt, T, '缺省 = now()（epoch ms 数字）')
  assert.equal(typeof a.createdAt, 'number', '必须是数字——ISO 串会让 TTL 比较 NaN 静默失效')
  assert.equal(b.createdAt, T, 'ISO 入参归一为 epoch ms')
  assert.equal(c.createdAt, T + 5)
  assert.equal(toEpochMillis('nonsense', T), T, '坏值回退 fallback（不落 NaN）')
  assert.equal(toEpochMillis(-1, T), T, '非正数回退 fallback')
})

test('④ TTL 回收（7 天）：超龄删/边界内留；手写 ISO createdAt 的陈旧条目同样被回收（坑反例）', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir)
  // 超龄 1 分钟 → 删；差 1 分钟满 7 天 → 留
  await q.enqueue({ dedupKey: dedupKeyFor('s', 1), payload: { n: 'old' }, createdAt: T - 7 * DAY - 60_000 })
  await q.enqueue({ dedupKey: dedupKeyFor('s', 2), payload: { n: 'fresh' }, createdAt: T - 7 * DAY + 60_000 })
  // 坑反例：手写条目 createdAt 存 ISO 串（模拟历史坏数据）——naive 比较 NaN → TTL 静默失效永不过期
  const k3 = 'c'.repeat(32)
  fs.writeFileSync(path.join(dir, `${k3}.json`), JSON.stringify({
    dedupKey: k3, payload: { n: 'iso-old' }, createdAt: new Date(T - 8 * DAY).toISOString(), retries: 0,
  }))
  const r = await q.replay({ handle: () => ({ ok: true }) })
  assert.equal(r.purgedTtl, 2, '超龄数字条目 + ISO 陈旧条目都被回收（绝不静默永生）')
  assert.equal(r.succeeded, 1, '新鲜条目照常处理')
  assert.equal(q.depth(), 0)
})

test('retries 耗尽：retries≥maxRetries 扫描即删；失败路径第 3 耗尽→删+报 exhausted', async (t) => {
  const dir = mkDir(t)
  const { q, at } = fakeQueue(dir)
  // (a) 手写 retries=3 条目 → 扫描侧删除
  const k = 'd'.repeat(32)
  fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify({ dedupKey: k, payload: {}, createdAt: T, retries: 3 }))
  // (b) 失败路径：0→1→2→3 三次尝试后耗尽
  const k2 = dedupKeyFor('s', 9)
  await q.enqueue({ dedupKey: k2, payload: { body: 'x' } })
  const seen = []
  const fail = (e) => { seen.push(e.retries); return { ok: false, error: new Error('boom') } }
  const r1 = await q.replay({ handle: fail }) // 尝试 1（retries=0）
  assert.equal(r1.failed, 1)
  assert.equal(r1.purgedExhausted, 1, '扫描侧：retries≥maxRetries 恰删+报（k）')
  assert.equal(r1.exhausted[0].dedupKey, k)
  at(T + 10_000)
  const r2 = await q.replay({ handle: fail }) // 尝试 2（retries=1）
  assert.equal(r2.exhausted.length, 0)
  at(T + 20_000)
  const r3 = await q.replay({ handle: fail }) // 尝试 3（retries=2）→ 3 耗尽
  assert.deepEqual(seen, [0, 1, 2], '恰 3 次尝试（MAX_RETRIES=3）')
  assert.equal(r3.exhausted.length, 1, '失败路径耗尽→删+报告（调用方据此告警）')
  assert.equal(r3.exhausted[0].dedupKey, k2)
  assert.equal(r3.exhausted[0].retries, 3)
  assert.equal(q.depth(), 0, '耗尽后零残留')
})

// ── ⑤ 指数退避 + 对称 jitter（RetryPolicySchema 参数形：initialDelayMs/maxDelayMs/jitterRatio）──

test('⑤ retryDelay 形状：指数 2^n、对称 jitter（±jitterRatio 等距）、maxDelayMs 封顶', () => {
  const backoff = { initialDelayMs: 500, maxDelayMs: 10_000, jitterRatio: 0.1 }
  const half = () => 0.5 // 零 jitter
  assert.equal(retryDelay(1, backoff, half), 500, '初值 500ms（官方 RetryPolicySchema 初值）')
  assert.equal(retryDelay(2, backoff, half), 1000)
  assert.equal(retryDelay(3, backoff, half), 2000)
  assert.equal(retryDelay(4, backoff, half), 4000)
  assert.equal(retryDelay(8, backoff, half), 10_000, 'min(500·2^7, 10000) 封顶')
  assert.equal(retryDelay(1, backoff, () => 0), 450, '对称下界 -10%')
  assert.equal(retryDelay(1, backoff, () => 1), 550, '对称上界 +10%')
  assert.equal(retryDelay(1, backoff, () => 0.25), 475, '对称：0.25 侧 -5%')
  assert.equal(retryDelay(1, backoff, () => 0.75), 525, '对称：0.75 侧 +5%（与 0.25 等距）')
  assert.equal(retryDelay(0, backoff, half), 500, 'failures≤1 按 1 计（首败即初值）')
})

test('⑤ release 退避落 nextRunAt：首败 = createdAt+500ms（零 jitter 注入），未到期前不被再 claim', async (t) => {
  const dir = mkDir(t)
  const { q, at } = fakeQueue(dir) // random:()=>0.5 → 零 jitter 精确形状
  await q.enqueue({ dedupKey: dedupKeyFor('s', 1), payload: { body: 'x' } })
  const r1 = await q.replay({ handle: () => ({ ok: false }) })
  assert.equal(r1.released, 1)
  const entry = readEntry(dir, `${dedupKeyFor('s', 1)}.json`)
  assert.equal(entry.retries, 1)
  assert.equal(entry.nextRunAt, T + 500, '退避 = initialDelayMs·2^0（零 jitter 精确值）')
  // 未到期：下一轮不 claim（保序：到期头条目未到，后续条目同样等待）
  const r2 = await q.replay({ handle: () => ({ ok: true }) })
  assert.equal(r2.claimed, 0, 'nextRunAt 未到不 claim')
  at(T + 500)
  const r3 = await q.replay({ handle: () => ({ ok: true }) })
  assert.equal(r3.succeeded, 1, '到期即处理')
})

// ── ② lease 过期回收（崩溃回收）────────────────────────────────────────────────

test('② lease 过期回收：超龄 .processing 归还 pending 并被处理；新鲜 claim 不动（在途不抢）', async (t) => {
  const dir = mkDir(t)
  const q = liveQueue(dir, { warn: () => {} })
  const k = dedupKeyFor('s', 1)
  await q.enqueue({ dedupKey: k, payload: { body: 'x' } })
  // 模拟崩溃：claim 到 .processing 后进程死掉（mtime 停在 11 分钟前 > lease 10min）
  fs.renameSync(path.join(dir, `${k}.json`), path.join(dir, `${k}.json.processing`))
  const old = new Date(Date.now() - CLAIM_LEASE_MS - 60_000)
  fs.utimesSync(path.join(dir, `${k}.json.processing`), old, old)
  const handled = []
  const r1 = await q.replay({ handle: (e) => { handled.push(e.dedupKey); return { ok: true } } })
  assert.equal(r1.reclaimed, 1, '超龄 claim 归还')
  assert.deepEqual(handled, [k], '归还后同轮即被处理（漏跑不丢）')
  assert.equal(listFiles(dir).length, 0)
  // 新鲜 claim（在途）：绝不回收绝不处理
  const k2 = dedupKeyFor('s', 2)
  await q.enqueue({ dedupKey: k2, payload: { body: 'y' } })
  fs.renameSync(path.join(dir, `${k2}.json`), path.join(dir, `${k2}.json.processing`))
  const r2 = await q.replay({ handle: () => { throw new Error('不应被调用') } })
  assert.equal(r2.reclaimed, 0, '新鲜 claim 不回收')
  assert.equal(r2.claimed, 0, '在途条目不重复处理')
  assert.ok(fs.existsSync(path.join(dir, `${k2}.json.processing`)), 'claim 保持原状')
})

test('.tmp 宽限 60s：新鲜 tmp（在途写）不动、超龄 tmp 清理（txl TMP_GRACE 同款）', async (t) => {
  const dir = mkDir(t)
  const q = liveQueue(dir, { warn: () => {} })
  const fresh = path.join(dir, 'a.json.1.2.deadbeef.tmp')
  const stale = path.join(dir, 'b.json.1.3.cafebabe.tmp')
  fs.writeFileSync(fresh, '{')
  fs.writeFileSync(stale, '{')
  const old = new Date(Date.now() - TMP_GRACE_MS - 1000)
  fs.utimesSync(stale, old, old)
  await q.replay({ handle: () => ({ ok: true }) })
  assert.ok(fs.existsSync(fresh), '新鲜 tmp 不动（并发写者安全）')
  assert.ok(!fs.existsSync(stale), '超龄 tmp 清理')
})

// ── ③ slice-before-rename：溢出不卡 .processing ─────────────────────────────────

test('③ 溢出不卡：每轮处理上限 slice 在 rename 之前——超出条目留 pending 可续 claim、零 .processing 残留', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir, { roundLimit: 2 })
  for (let i = 1; i <= 5; i++) await q.enqueue({ dedupKey: dedupKeyFor('s', i), payload: { i } })
  const r = await q.replay({ handle: () => ({ ok: true }) })
  assert.equal(r.claimed, 2, '本轮只 claim 上限内的 2 条（slice 在 rename 之前）')
  assert.equal(r.succeeded, 2)
  const files = listFiles(dir)
  assert.equal(files.filter((f) => f.endsWith('.json')).length, 3, '溢出 3 条留 pending（下轮可续）')
  assert.equal(files.filter((f) => f.endsWith('.processing')).length, 0, '零 .processing 残留（不卡）')
  assert.equal(REPLAY_LIMIT, 20, '默认轮上限（txl REPLAY_LIMIT 同值）')
})

// ── ⑥ replay 保序 break ────────────────────────────────────────────────────────

test('⑥ replay 保序 break：首个可重试失败即停——后续条目不被跳序处理、未处理 claim 全归还', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir)
  await q.enqueue({ dedupKey: dedupKeyFor('s', 1), payload: { n: 'A' }, createdAt: T + 1 })
  await q.enqueue({ dedupKey: dedupKeyFor('s', 2), payload: { n: 'B' }, createdAt: T + 2 })
  await q.enqueue({ dedupKey: dedupKeyFor('s', 3), payload: { n: 'C' }, createdAt: T + 3 })
  const seen = []
  const r = await q.replay({
    handle: (e) => {
      seen.push(e.payload.n)
      return e.payload.n === 'B' ? { ok: false, error: new Error('retryable') } : { ok: true }
    },
  })
  assert.deepEqual(seen, ['A', 'B'], '保序：B 失败即停，C 不被跳序处理')
  assert.equal(r.broke, true)
  assert.equal(r.succeeded, 1)
  assert.equal(r.failed, 1)
  assert.equal(r.unclaimed, 1, '未处理 claim 归还（不卡 .processing 至 lease 超时）')
  const files = listFiles(dir)
  assert.equal(files.filter((f) => f.endsWith('.processing')).length, 0, '零 .processing 残留')
  assert.equal(files.filter((f) => f.endsWith('.json')).length, 2, 'B（已 release）与 C 都在 pending')
})

// ── payload 落盘前脱敏（secrets.js 消费面：queue payload 序列化前）────────────────

test('队列 payload 落盘前必过 redact（哨兵不进队列文件），计数回传', async (t) => {
  const dir = mkDir(t)
  const { q } = fakeQueue(dir)
  const r = await q.enqueue({
    dedupKey: dedupKeyFor('s', 1),
    payload: { target: '/x', head: 'api_key=SECRETVALUE123', body: 'token sk-abcdef123456 与 disk-usage-20240101' },
  })
  assert.equal(r.ok, true)
  assert.equal(r.redacted, 2, '两次中和计数如实')
  const raw = fs.readFileSync(path.join(dir, `${dedupKeyFor('s', 1)}.json`), 'utf8')
  assert.ok(!raw.includes('SECRETVALUE123'), '赋值形态值段不落盘')
  assert.ok(!raw.includes('sk-abcdef123456'), 'token 不落盘')
  assert.ok(raw.includes('api_key=<redacted>'), '赋值形态保 key 名')
  assert.ok(raw.includes('disk-usage-20240101'), '哨兵外内容原样（不过度中和）')
})

// ── ⑨ 异常全吞 + 留痕（不阻塞会话铁律）────────────────────────────────────────

test('⑨ 异常全吞+留痕：handle 抛错=失败计数+release 不上抛；坏目录=enqueue/replay 软失败+warn', async (t) => {
  const dir = mkDir(t)
  const warns = []
  const { q } = fakeQueue(dir, { warn: (l) => warns.push(l) })
  await q.enqueue({ dedupKey: dedupKeyFor('s', 1), payload: { body: 'x' } })
  const r = await q.replay({ handle: () => { throw new Error('handler boom') } })
  assert.equal(r.failed, 1, '抛错按失败计')
  assert.equal(r.released, 1, 'release 保底（不丢条目）')
  // 坏目录（dir 路径是个文件）：mkdir 失败 → 软结果 + warn，绝不抛
  const asFile = path.join(dir, 'not-a-dir')
  fs.writeFileSync(asFile, 'x')
  const q2 = createQueue({ dir: asFile, warn: (l) => warns.push(l), now: () => T })
  const r2 = await q2.enqueue({ dedupKey: dedupKeyFor('s', 2), payload: {} })
  assert.equal(r2.ok, false)
  const r3 = await q2.replay({ handle: () => ({ ok: true }) })
  assert.equal(r3.ok, false)
  assert.ok(warns.length >= 2, '失败面留痕（INV-15 禁静默）')
})

// ── 补跑账本 + timer tick（A6 的账本半边）───────────────────────────────────────

test('账本 tick：先查补跑账本——间隔跳变→missed 计数+catchUp 通知 job+原子落盘', async (t) => {
  const root = mkDir(t, 'ledger')
  const ledgerFile = path.join(root, 'schedule-ledger.json')
  let t0 = T
  const calls = []
  const jobs = [{
    name: 'queue-replay',
    run: async (info) => { calls.push(info); return { madeUp: 5 } },
  }]
  const mkTick = () => createTick({ ledgerFile, jobs, intervalMs: 60_000, now: () => t0, warn: () => {} })
  const tick1 = mkTick()
  const r1 = await tick1.tick()
  assert.equal(r1.ok, true)
  assert.equal(r1.missed, 0, '首跑无账本=零漏跑')
  assert.equal(calls[0].catchUp, false)
  t0 += 3 * 60_000 // web 重启丢 tick：3 个间隔只跑 1 次 → 漏 2
  const tick2 = mkTick() // 新实例=模拟重启后新进程
  const r2 = await tick2.tick()
  assert.equal(r2.missed, 2, '跳变 3 间隔 - 本次 = 漏 2 tick')
  assert.equal(r2.catchUp, true, '补做标记')
  assert.equal(calls[1].missed, 2)
  assert.equal(calls[1].catchUp, true, 'job 收到补做上下文（先查账本再干活）')
  const state = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))
  assert.equal(state.jobs['queue-replay'].runs, 2)
  assert.equal(state.jobs['queue-replay'].missed, 2, '漏跑计数入账本')
  assert.equal(state.jobs['queue-replay'].madeUp, 10, '补做量入账本')
  assert.equal(state.jobs['queue-replay'].lastRunAt, t0)
  assert.equal(state.updatedAt, t0)
  assert.ok(!fs.readdirSync(root).some((f) => f.endsWith('.tmp')), '账本原子写零 tmp 残留')
})

test('burst 不重入：同实例并发 tick 只跑一个；跨实例靠 LeaseLock——忙时 skip（不排队不重入）', async (t) => {
  const root = mkDir(t, 'reentry')
  const ledgerFile = path.join(root, 'schedule-ledger.json')
  let release
  const gate = new Promise((r) => { release = r })
  let runs = 0
  const jobs = [{ name: 'queue-replay', run: async () => { runs += 1; await gate; return {} } }]
  const tick1 = createTick({ ledgerFile, jobs, intervalMs: 60_000, now: () => T, warn: () => {} })
  const p1 = tick1.tick()
  while (runs === 0) await new Promise((r) => setTimeout(r, 5)) // 等 tick1 拿到锁并开跑（防竞态）
  const r2 = await tick1.tick()
  assert.equal(r2.skipped, 'reentrant', '同实例 burst：第二发直接跳过')
  const tick2 = createTick({ ledgerFile, jobs, intervalMs: 60_000, now: () => T, warn: () => {}, lockWaitMs: 0 })
  const r3 = await tick2.tick()
  assert.equal(r3.skipped, 'busy', '跨实例：LeaseLock 被占 → 立即跳过（不重入）')
  assert.equal(runs, 1, '工作恰跑一次')
  release()
  const r1 = await p1
  assert.equal(r1.ok, true)
  // 释放后可再跑
  const r4 = await tick2.tick()
  assert.equal(r4.ok, true)
})

test('⑨ timer tick 异常全吞+留痕：单 job 抛错不影响他 job；坏账本文件=空账本起步不抛', async (t) => {
  const root = mkDir(t, 'tickerr')
  const ledgerFile = path.join(root, 'schedule-ledger.json')
  fs.writeFileSync(ledgerFile, '{ 坏 JSON')
  const warns = []
  const jobs = [
    { name: 'bad-job', run: async () => { throw new Error('job boom') } },
    { name: 'good-job', run: async () => ({ madeUp: 1 }) },
  ]
  const tick = createTick({ ledgerFile, jobs, intervalMs: 60_000, now: () => T, warn: (l) => warns.push(l) })
  const r = await tick.tick()
  assert.equal(r.ok, true, 'tick 整体不抛（异常全吞）')
  assert.equal(r.jobs['bad-job'].ok, false)
  assert.equal(r.jobs['good-job'].ok, true, '单 job 失败不拖垮他 job')
  assert.ok(warns.length >= 1, '留痕')
  const state = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))
  assert.equal(state.jobs['good-job'].runs, 1, '坏账本=空账本起步，新账目照记')
})
