// buffer.test — 捕获缓冲 + 双轨落盘（Task 9 Slice 2）
// 被测件：lib/buffer.js — 每 3 轮强制 flush / 双轨路由（04-session_logs 新增 · conversation.md 追加）/
// writeAtomic 原子创建 · withFileLock 锁追加 / 失败重试 3 次退避 + 留痕 + 队列保留（幂等重试）/
// 落盘前 secrets.redact 双保险。零 mock：真文件系统 + mkdtemp 隔离（不碰真 vault）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { createBuffer, routeFor, getStats, resetStats } = await import('../lib/buffer.js')

// 固定时钟：2026-09-25 09:05（本地时区）→ 文件名时间戳 2026-09-25-09-05
const FIXED = new Date(2026, 8, 25, 9, 5)
const GENERIC_DIR = 'raw/04-session_logs'

function mkRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-steward-t9-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function cfg(root, { bufferRounds = 1, secrets = true } = {}) {
  return () => ({
    vaultRoot: root,
    capture: { bufferRounds, enabled: true },
    secrets: { enabled: secrets },
    write: { readOnly: true },
    queue: { maxRetries: 3, ttlDays: 7 },
  })
}

function mkBuffer(t, root, opts = {}) {
  const warnings = []
  const b = createBuffer({
    sessionId: opts.sessionId ?? 'ses_test_1',
    getCfg: cfg(root, opts),
    warn: (line) => warnings.push(line),
    now: () => FIXED,
    retryBaseMs: 1,      // 测试提速（生产默认 50 → 50/100/200 指数退避）
    lockWaitMs: opts.lockWaitMs ?? 100,
    ...opts.createOpts,
  })
  return { b, warnings }
}

const user = (text) => ({ role: 'user', text })
const asst = (text) => ({ role: 'assistant', text })

// ---------- 双轨路由（Q7b 裁决） ----------

test('routeFor：项目 token + 变更 token 双命中才路由 conversation.md；缺项目回退通用轨', () => {
  const r1 = routeFor('看 /opt/workdata/kb-plugins/changes/2026-09-23-vault-inventory-plugin-init/tasks.md')
  assert.deepEqual(r1, { kind: 'change', project: 'kb-plugins', change: '2026-09-23-vault-inventory-plugin-init' })
  const r2 = routeFor('追加 raw/projects/clsh-content/changes/2026-05-28-content-optimization/conversation.md')
  assert.deepEqual(r2, { kind: 'change', project: 'clsh-content', change: '2026-05-28-content-optimization' })
  // 月粒度变更 id（hugo-blog 先例）同样识别
  const r3 = routeFor('workdata/hugo-blog/changes/2026-06-hugo-blog-setup')
  assert.deepEqual(r3, { kind: 'change', project: 'hugo-blog', change: '2026-06-hugo-blog-setup' })
  // 仅有变更 id 无项目 → 保守回退通用轨（防垃圾目录，申报留白）
  assert.deepEqual(routeFor('changes/2026-09-23-only-id/ 提及'), { kind: 'generic' })
  assert.deepEqual(routeFor('普通闲聊内容'), { kind: 'generic' })
})

// ---------- 通用轨：04-session_logs 新增 ----------

test('通用轨：首轮 flush 新增形态文件名（<标题> - YYYY-MM-DD-HH-MM.md）+ frontmatter source: capture + redact 双保险', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const { b, warnings } = mkBuffer(t, root)
  await b.commit(1, [
    user('实现 Task 9：会话捕获与缓冲双轨'),
    asst('好的，token sk-abcdef123456 已处理'),
  ])
  const expected = path.join(root, GENERIC_DIR, '实现 Task 9：会话捕获与缓冲双轨 - 2026-09-25-09-05.md')
  assert.ok(fs.existsSync(expected), `形态文件名应存在：${expected}`)
  const content = fs.readFileSync(expected, 'utf8')
  assert.match(content, /^---\ntitle: "实现 Task 9：会话捕获与缓冲双轨"\ndate: 2026-09-25\nsource: capture\nsession: "ses_test_1"\n---/)
  assert.match(content, /# 实现 Task 9：会话捕获与缓冲双轨/)
  assert.match(content, /## Turn 1 — 2026-09-25 09:05/)
  assert.match(content, /\*\*user\*\*:\n实现 Task 9：会话捕获与缓冲双轨/)
  // 落盘前必过 secrets.redact：sk- 哨兵中和、计数入统计
  assert.ok(!content.includes('sk-abcdef123456'), 'sk- 哨兵不得落盘')
  assert.ok(content.includes('<redacted>'))
  const s = getStats()
  assert.equal(s.committed, 1)
  assert.equal(s.flushes, 1)
  assert.equal(s.flushedTurns, 1)
  assert.ok(s.redacted >= 1, 'redact 计数入统计')
  assert.equal(warnings.length, 0, '健康路径零留痕')
})

test('通用轨：次轮 flush 追加同一文件（单文件、frontmatter 仅一份、Turn 各一段）', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const { b } = mkBuffer(t, root)
  await b.commit(1, [user('标题会话'), asst('第一轮')])
  await b.commit(2, [user('第二问'), asst('第二答')])
  const files = fs.readdirSync(path.join(root, GENERIC_DIR))
  assert.equal(files.length, 1, '两轮共用同一文件')
  const content = fs.readFileSync(path.join(path.join(root, GENERIC_DIR), files[0]), 'utf8')
  assert.equal(content.match(/^---$/gm).length, 2, 'frontmatter 开/闭界各一，仅一份')
  assert.match(content, /## Turn 1 /)
  assert.match(content, /## Turn 2 /)
  assert.equal(content.match(/<!-- source: capture /g).length, 2, '每 chunk 一条机器 marker')
  assert.equal(content.indexOf('第二答') > content.indexOf('第一轮'), true, '追加保序')
})

// ---------- 变更轨：conversation.md 追加 ----------

test('变更轨：命中既有 conversation.md → 追加，既有语义内容逐字节前缀保留（禁改既有）', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const dir = path.join(root, 'raw/projects/p1/changes/2026-09-23-foo-bar')
  fs.mkdirSync(dir, { recursive: true })
  const existing = '# Phase 1 需求澄清\n\n既有语义内容不可改动'
  fs.writeFileSync(path.join(dir, 'conversation.md'), existing)
  const { b } = mkBuffer(t, root)
  await b.commit(1, [user('同步 /opt/workdata/p1/changes/2026-09-23-foo-bar/tasks.md 进度'), asst('done')])
  const content = fs.readFileSync(path.join(dir, 'conversation.md'), 'utf8')
  assert.equal(content.startsWith(existing), true, '既有内容逐字节前缀保留')
  assert.match(content, /<!-- source: capture session=ses_test_1 turns=1-1 seq=1 -->/)
  assert.match(content, /\*\*user\*\*:\n同步 \/opt\/workdata\/p1\/changes\/2026-09-23-foo-bar\/tasks\.md 进度/)
})

test('变更轨：目标不存在 → 建目录新增 conversation.md（frontmatter source: capture + project/change 机器标记）', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const { b } = mkBuffer(t, root)
  await b.commit(1, [user('记录 raw/projects/p2/changes/2026-05-28-content-optimization/ 的捕获')])
  const target = path.join(root, 'raw/projects/p2/changes/2026-05-28-content-optimization/conversation.md')
  assert.ok(fs.existsSync(target), '白名单内新增（raw/projects）')
  const content = fs.readFileSync(target, 'utf8')
  assert.match(content, /^---\nsource: capture\nproject: p2\nchange: 2026-05-28-content-optimization\nsession: "ses_test_1"\ndate: 2026-09-25\n---/)
  assert.match(content, /## Turn 1 /)
})

// ---------- 缓冲 3 轮 + 崩溃丢 ≤3 轮（Q7a） ----------

test('缓冲：每 3 轮强制 flush；崩溃（缓冲丢弃）前后磁盘丢失恰 ≤3 轮', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const dir = path.join(root, GENERIC_DIR)
  const allDisk = () => {
    if (!fs.existsSync(dir)) return ''
    return fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
  }
  // 时代 1：b1 缓冲 2 轮在内存（此刻崩溃=丢 2 轮 ≤3，未上盘）→ 第 3 轮强制 flush 全部上盘
  const { b: b1 } = mkBuffer(t, root, { bufferRounds: 3 })
  await b1.commit(1, [user('t1-user'), asst('t1-a')])
  await b1.commit(2, [user('t2-user'), asst('t2-a')])
  assert.equal(fs.existsSync(dir), false, '2 轮 < 3 轮：只在内存（此刻崩溃即丢 2 轮 ≤3）')
  await b1.commit(3, [user('t3-user'), asst('t3-a')])
  assert.equal(fs.existsSync(dir), true, '第 3 轮强制 flush：3 轮齐落盘')
  assert.ok(allDisk().includes('## Turn 1') && allDisk().includes('t3-user'))
  // 崩溃注入①：b1 缓冲恰为空时弃用 → 已提交轮零丢失
  // 时代 2：b2 缓冲 t4、t5（2 轮在内存）→ 崩溃注入②：此刻整体丢失 → 丢恰 2 轮 ≤3
  const countBefore = fs.readdirSync(dir).length
  const { b: b2 } = mkBuffer(t, root, { bufferRounds: 3, sessionId: 'ses_test_1' })
  await b2.commit(4, [user('t4-user')])
  await b2.commit(5, [user('t5-user')])
  assert.equal(fs.readdirSync(dir).length, countBefore, '2 轮仍在内存：未上盘')
  // b2 被弃用（模拟 flush 前 kill），t4/t5 永不落盘——丢失面=缓冲内 2 轮
  // 时代 3：b3 重启后从 0 缓冲，第 3 轮 flush
  const { b: b3 } = mkBuffer(t, root, { bufferRounds: 3, sessionId: 'ses_test_1' })
  await b3.commit(6, [user('t6-user')])
  await b3.commit(7, [user('t7-user')])
  await b3.commit(8, [user('t8-user')])
  const all = allDisk()
  assert.ok(all.includes('t6-user') && all.includes('t8-user'), '重启后轮次落盘')
  assert.ok(!all.includes('t4-user') && !all.includes('t5-user'), '崩溃丢失面恰为缓冲内 2 轮（≤3）')
  assert.ok(all.includes('t1-user') && all.includes('t3-user'), '崩溃前已 flush 轮次无丢失')
})

// ---------- 失败留痕缝：重试 3 次退避 → 保留 → 治愈后幂等重试 ----------

test('flush 失败：重试 3 次退避 → 留痕 + 轮次保留内存；治愈后重试恰好落盘一次（幂等）', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const target = path.join(root, GENERIC_DIR, '实现 Task 9：会话捕获与缓冲双轨 - 2026-09-25-09-05.md')
  const { b, warnings } = mkBuffer(t, root)
  // 障碍注入：目标位置放目录 → append/create 均真实失败（零 mock 真失败面）
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.mkdirSync(target)
  const r1 = await b.commit(1, [user('实现 Task 9：会话捕获与缓冲双轨'), asst('secret-round unique-alpha-111')])
  assert.equal(r1.flushed, false, '失败不上抛，返回软结果')
  assert.equal(getStats().flushFailures, 1, '重试 3 次耗尽计 1 次失败')
  assert.equal(warnings.length, 1, 'kbContext/alert 风格留痕（warn 不抛）')
  assert.match(warnings[0], /flush 失败/)
  // 治愈：移除障碍 → 直接 flush（幂等重试：内容恰好一次）
  fs.rmSync(target, { recursive: true, force: true })
  const r2 = await b.flush()
  assert.equal(r2.flushed, true)
  const content = fs.readFileSync(target, 'utf8')
  assert.equal(content.match(/unique-alpha-111/g).length, 1, '失败重试不产生重复内容')
  assert.equal(content.match(/<!-- source: capture /g).length, 1, 'marker 恰一条')
  const before = content
  const r3 = await b.flush()
  assert.equal(r3.flushed, false, '队列已空 → no-op')
  assert.equal(fs.readFileSync(target, 'utf8'), before, '重复 flush 零写入（幂等）')
})

test('追加锁语义：stale 锁目录 → 短 waitMs 超时计入失败且内容保留；释放锁后成功（T8 锁无 stale 自愈的消费侧留白处置）', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const target = path.join(root, GENERIC_DIR, '实现 Task 9：会话捕获与缓冲双轨 - 2026-09-25-09-05.md')
  const { b, warnings } = mkBuffer(t, root, { lockWaitMs: 40 })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.mkdirSync(`${target}.lock`) // 模拟持锁进程崩溃残留（T8 withFileLock 无 stale 自愈）
  const r1 = await b.commit(1, [user('实现 Task 9：会话捕获与缓冲双轨'), asst('locked-unique-222')])
  assert.equal(r1.flushed, false)
  assert.equal(getStats().flushFailures, 1, 'ELOCKTIMEOUT 走同一失败面（保留队列）')
  assert.ok(warnings.length >= 1)
  assert.equal(fs.existsSync(target), false, '锁超时临界区绝不执行（fn 不落盘）')
  fs.rmSync(`${target}.lock`, { recursive: true, force: true }) // 释放 stale 锁
  const r2 = await b.flush()
  assert.equal(r2.flushed, true)
  const content = fs.readFileSync(target, 'utf8')
  assert.equal(content.match(/locked-unique-222/g).length, 1, '释放后重试恰好一次')
})

test('并发追加：两会话缓冲同目标 Promise.all → 锁串行化，内容互不撕裂', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const dir = path.join(root, 'raw/projects/p1/changes/2026-09-23-foo-bar')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'conversation.md'), 'seed')
  const { b: b1 } = mkBuffer(t, root, { sessionId: 'sesA' })
  const { b: b2 } = mkBuffer(t, root, { sessionId: 'sesB' })
  const [r1, r2] = await Promise.all([
    b1.commit(1, [user('raw/projects/p1/changes/2026-09-23-foo-bar alpha-unique-333')]),
    b2.commit(1, [user('raw/projects/p1/changes/2026-09-23-foo-bar beta-unique-444')]),
  ])
  assert.equal(r1.flushed, true)
  assert.equal(r2.flushed, true)
  const content = fs.readFileSync(path.join(dir, 'conversation.md'), 'utf8')
  assert.ok(content.startsWith('seed'), '既有前缀保留')
  assert.equal(content.match(/alpha-unique-333/g).length, 1)
  assert.equal(content.match(/beta-unique-444/g).length, 1)
  assert.equal(content.match(/<!-- source: capture /g).length, 2, '两 chunk 均完整落盘')
})

// ---------- 配置面：secrets 开关 ----------

test('secrets.enabled=false → 落盘原文（操作员显式关闭脱敏），计数为零', async (t) => {
  resetStats()
  const root = mkRoot(t)
  const { b } = mkBuffer(t, root, { secrets: false })
  await b.commit(1, [user('标题开关'), asst('raw-token sk-abcdef123456 保留')])
  const dir = path.join(root, GENERIC_DIR)
  const content = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8')
  assert.ok(content.includes('sk-abcdef123456'), '显式关闭后写原文')
  assert.equal(getStats().redacted, 0)
})
