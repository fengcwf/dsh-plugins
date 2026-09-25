// test/alert.test.mjs — 告警文件（Task 13）：~/.dsh/kb-alerts.md 追加式（带锁 appendFile 'a'，
// writeAtomic 不适用——追加语义不可整文件换新）；落盘前必过 secrets.redact（计数入行）；
// 告警触发 = 重试耗尽 / 连续失败阈值（txl 连续 2 次阈值范式）；告警汇总聚合统计。
// mkdtemp 真文件系统零 mock；异常全吞+留痕（不阻塞会话铁律）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { createAlert, ALERT_THRESHOLD } = await import('../lib/alert.js')

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBADAN\n-----END RSA PRIVATE KEY-----'

function mkFile(t, suffix = 'alert') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wiki-steward-t13-${suffix}-`))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return path.join(root, 'kb-alerts.md')
}

// ── ⑦ 脱敏 + 计数入行 ──────────────────────────────────────────────────────────

test('⑦ 告警落盘前必过 redact：三层哨兵全中和、计数入行、key 名保留', async (t) => {
  const file = mkFile(t)
  const alert = createAlert({ file, warn: () => {} })
  const r = await alert.append('retry-exhausted', `api_key=SECRETVALUE123 及 ${PEM} 及 token sk-abcdef123456`)
  assert.equal(r.ok, true)
  assert.equal(r.redacted, 3, '赋值形态+PEM 整块+token 各计 1（count 如实）')
  const content = fs.readFileSync(file, 'utf8')
  assert.ok(!content.includes('SECRETVALUE123'), '值段不落盘')
  assert.ok(!content.includes('BEGIN RSA'), 'PEM 整块不落盘')
  assert.ok(!content.includes('sk-abcdef123456'), 'token 不落盘')
  assert.ok(content.includes('api_key=<redacted>'), '赋值形态保 key 名')
  assert.match(content, /\(redacted:3\)/, '计数入行')
})

test('哨兵外内容原样 + 零中和也计数入行（redacted:0）', async (t) => {
  const file = mkFile(t)
  const alert = createAlert({ file, warn: () => {} })
  const r = await alert.append('summary', 'disk-usage-20240101 tokenizer: 词法分析 task-sku')
  assert.equal(r.redacted, 0)
  const content = fs.readFileSync(file, 'utf8')
  assert.ok(content.includes('disk-usage-20240101'), '非哨兵原样（over-redaction destroys memories）')
  assert.match(content, /\(redacted:0\)/, '计数入行（0 也在行内）')
})

test('追加语义：多次 append 只增不改（前缀逐字节不变，append-only）', async (t) => {
  const file = mkFile(t)
  const alert = createAlert({ file, warn: () => {} })
  await alert.append('a', '第一条')
  const first = fs.readFileSync(file, 'utf8')
  await alert.append('b', '第二条')
  const second = fs.readFileSync(file, 'utf8')
  assert.ok(second.startsWith(first), '既有内容逐字节前缀保留（appendFile a 语义）')
  assert.equal(second.split('\n').filter((l) => l.startsWith('- **')).length, 2, '两条告警行')
  assert.match(second, /`a` 第一条/)
  assert.match(second, /`b` 第二条/)
})

// ── 告警触发：连续失败阈值（txl 连续 2 次阈值范式）───────────────────────────────

test('连续失败阈值：满 2 连败告警恰一条；成功清零；再达阈值再告警（ALERT_THRESHOLD=2）', async (t) => {
  const file = mkFile(t)
  const alert = createAlert({ file, warn: () => {} })
  const w = alert.watch('queue-replay')
  assert.equal(ALERT_THRESHOLD, 2)
  await w.fail(new Error('f1'))
  assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', '', '第 1 连败未达阈值零告警')
  await w.fail(new Error('f2'))
  let content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n').filter((l) => l.startsWith('- **'))
  assert.equal(lines.length, 1, '满 2 连败告警恰一条')
  assert.match(content, /consecutive-failures/)
  assert.match(content, /连续 2 次失败/)
  assert.match(content, /f2/)
  w.ok() // 成功清零
  await w.fail(new Error('f3'))
  await w.fail(new Error('f4'))
  content = fs.readFileSync(file, 'utf8')
  assert.equal(content.split('\n').filter((l) => l.startsWith('- **')).length, 2, '清零后再次达阈值再告警')
  assert.match(content, /连续 2 次失败/, '清零重计（不累加成 4）')
})

// ── 告警汇总（timer 轻活三件套之一）────────────────────────────────────────────

test('告警汇总：零统计不落盘；非零聚合一行（计数齐）——汇总由 timer tick 驱动', async (t) => {
  const file = mkFile(t)
  const alert = createAlert({ file, warn: () => {} })
  const r0 = await alert.summarize({ committed: 0, flushes: 0, flushFailures: 0, redacted: 0, swallowed: 0 })
  assert.equal(r0.appended, false, '零统计不刷屏')
  assert.ok(!fs.existsSync(file) || fs.readFileSync(file, 'utf8') === '', '零统计零落盘')
  const r1 = await alert.summarize({ committed: 7, flushedTurns: 5, flushes: 2, flushFailures: 1, redacted: 3, swallowed: 1 })
  assert.equal(r1.appended, true)
  const content = fs.readFileSync(file, 'utf8')
  assert.match(content, /`summary`/)
  assert.match(content, /committed=7/)
  assert.match(content, /flushFailures=1/)
  assert.match(content, /swallowed=1/)
})

// ── ⑨ 异常全吞 + 留痕 ─────────────────────────────────────────────────────────

test('⑨ alert 异常全吞：目标是目录=软失败+warn 不上抛（warn 自身抛也吞）', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-steward-t13-alert-bad-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const asDir = path.join(root, 'kb-alerts.md')
  fs.mkdirSync(asDir) // 目标路径是目录 → appendFile 必败
  const warns = []
  const alert = createAlert({ file: asDir, warn: (l) => { warns.push(l); throw new Error('warn boom') } })
  const r = await alert.append('x', 'm')
  assert.equal(r.ok, false, '软失败结果')
  assert.ok(warns.length >= 1, '失败留痕（INV-15）')
  const r2 = await alert.summarize({ flushFailures: 1 })
  assert.equal(r2.ok, false)
})

test('告警文件父目录自动建（深路径）', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-steward-t13-alert-deep-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'a/b/c/kb-alerts.md')
  const alert = createAlert({ file, warn: () => {} })
  const r = await alert.append('x', 'deep')
  assert.equal(r.ok, true)
  assert.ok(fs.readFileSync(file, 'utf8').includes('deep'))
})
