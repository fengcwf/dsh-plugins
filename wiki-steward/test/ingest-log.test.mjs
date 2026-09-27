// ingest-log 单测（设置页签 ingest 日志面：真实日志落点拼接 + 尾部 N 行 + 滚动加载）。
// 被测件：lib/ingest-log.js —— 来源发现（defaultLogSources）/真文件读取（readMergedLog）/
// 尾部切片+锚点游标（tailSlice）/scan 输出机械解析（summarizeScan）。
// 真被测件零 mock：lib/ingest-log.js 直接真调用真文件系统；每测试独立 mkdtemp 目录。
// 日志落点调研结论（2026-09-28 实测）：无统一 ingest 日志文件——
//   ① ~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log（dsh-cron.sh 写，夜间蒸馏任务 stdout/stderr+exit code）
//   ② ~/.dsh/logs/cron/wiki-ingest-scan-YYYYMMDD.log（面板「扫描增量」触发后写，本特性新增）
//   ③ ~/.dsh/kb-alerts.md（告警账本，dsh-cron.sh 失败行 + wiki-steward alert 面）
//   ingest-pipeline.py 本身无日志文件（仅 stdout）；vault 内 raw/observer/ 是素材非日志（不入面板）。
//   故面板语义 = 各来源拼接 + 逐行如实标注来源（禁编造统一日志）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  defaultLogSources,
  readMergedLog,
  tailSlice,
  summarizeScan,
  SOURCE_IDS,
} = await import('../lib/ingest-log.js')

function mkHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-steward-ingest-log-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  return home
}

function writeLog(home, rel, text) {
  const p = path.join(home, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
  return p
}

// ── 来源发现 ────────────────────────────────────────────────────────────────
test('defaultLogSources：三来源各归其位（cron 任务日志 / 手动扫描日志 / 告警账本），id 稳定', (t) => {
  const home = mkHome(t)
  const sources = defaultLogSources({ home })
  assert.deepEqual(sources.map((s) => s.id), SOURCE_IDS)
  const [cron, manual, alerts] = sources
  assert.equal(cron.dir, path.join(home, '.dsh', 'logs', 'cron'))
  assert.equal(manual.dir, path.join(home, '.dsh', 'logs', 'cron'))
  assert.equal(alerts.file, path.join(home, '.dsh', 'kb-alerts.md'))
  for (const s of sources) assert.ok(s.label && s.label.length > 0, `${s.id} 必须带来源标注文案`)
})

// ── 真文件读取 + 拼接 ────────────────────────────────────────────────────────
test('readMergedLog：跨来源真文件拼接，逐行带来源 id/label/文件名/行号，按（日期,文件名,行）升序', async (t) => {
  const home = mkHome(t)
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20260927.log', 'A1\nA2\n')
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20260928.log', 'B1\nB2\n')
  writeLog(home, '.dsh/logs/cron/wiki-ingest-scan-20260928.log', 'S1\n')
  writeLog(home, '.dsh/kb-alerts.md', '- [2026-09-27 08:00:00] cron:hourly-check exit=1\n- [2026-09-28 09:00:00] cron:wiki-ingest exit=1\n')

  const merged = readMergedLog(defaultLogSources({ home }))
  const keys = merged.map((l) => `${l.source}|${l.name}|${l.line}`)
  assert.deepEqual(keys, [
    // 20260927：告警行（kb-alerts.md 行内时间戳 2026-09-27）与 cron 当日文件按（日期,文件名,行）升序
    'alerts:kb|kb-alerts.md|1',
    'cron:wiki-ingest|wiki-ingest-20260927.log|1',
    'cron:wiki-ingest|wiki-ingest-20260927.log|2',
    // 20260928：文件名字典序 kb-alerts.md < wiki-ingest-20260928.log < wiki-ingest-scan-20260928.log
    'alerts:kb|kb-alerts.md|2',
    'cron:wiki-ingest|wiki-ingest-20260928.log|1',
    'cron:wiki-ingest|wiki-ingest-20260928.log|2',
    'manual:scan|wiki-ingest-scan-20260928.log|1',
  ])
  for (const l of merged) {
    assert.ok(l.label && l.label.length > 0, '每行必须带来源 label（如实标注来源）')
    assert.equal(typeof l.text, 'string')
    assert.equal(typeof l.dateKey, 'string')
    assert.ok(/^\d{8}$/.test(l.dateKey), `dateKey 必须是 YYYYMMDD：${l.dateKey}`)
  }
  assert.equal(merged[0].text, '- [2026-09-27 08:00:00] cron:hourly-check exit=1')
})

test('readMergedLog：告警账本行内时间戳优先于文件名日期；无时间戳行回退文件日期（形合法）', async (t) => {
  const home = mkHome(t)
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20991231.log', 'L\n')
  writeLog(home, '.dsh/kb-alerts.md', 'orphan-no-timestamp\n- [2026-09-29 10:00:00] old\n')
  const merged = readMergedLog(defaultLogSources({ home }))
  const alerts = merged.filter((l) => l.source === 'alerts:kb')
  const dated = alerts.find((l) => l.text.includes('old'))
  const orphan = alerts.find((l) => l.text === 'orphan-no-timestamp')
  assert.equal(dated.dateKey, '20260929', '行内时间戳优先')
  assert.match(orphan.dateKey, /^\d{8}$/, '无时间戳行回退文件日期（形合法，不编造行内时间）')
  assert.equal(merged.at(-1).name, 'wiki-ingest-20991231.log', '远期日期文件排最后（顺序确定性）')
})

test('readMergedLog：空目录/缺文件 = 空拼接不抛；非匹配文件名不入来源', async (t) => {
  const home = mkHome(t)
  writeLog(home, '.dsh/logs/cron/backup-20260928.log', 'not-mine\n')
  writeLog(home, '.dsh/logs/cron/wiki-ingest.lock', '')
  const merged = readMergedLog(defaultLogSources({ home }))
  assert.deepEqual(merged, [])
})

test('readMergedLog：超限文件只读尾段并留痕 truncated（尾部优先：面板看的是最新）', async (t) => {
  const home = mkHome(t)
  const big = ['x'.repeat(100), 'KEEP-A', 'KEEP-B'].join('\n') + '\n'
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20260928.log', big)
  const merged = readMergedLog(defaultLogSources({ home }), { maxFileBytes: 80 })
  assert.ok(merged.some((l) => l.text === 'KEEP-B'), '尾部行必须在')
  assert.equal(merged.filter((l) => l.text === 'x'.repeat(100)).length, 0, '头部超限行不读')
  assert.ok(merged.every((l) => l.truncated === true), '截断文件的行必须留痕 truncated（不冒充全文）')
})

// ── 尾部 N 行 + 滚动加载（锚点游标）──────────────────────────────────────────
test('tailSlice：cursor=null 取尾部 limit 行；hasMore/cursor 齐全；锚点=返回块最旧行', async (t) => {
  const home = mkHome(t)
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20260928.log', 'l1\nl2\nl3\nl4\nl5\n')
  const merged = readMergedLog(defaultLogSources({ home }))
  const page = tailSlice(merged, { limit: 2 })
  assert.deepEqual(page.lines.map((l) => l.text), ['l4', 'l5'])
  assert.equal(page.hasMore, true)
  assert.deepEqual(JSON.parse(page.cursor), { s: 'cron:wiki-ingest', f: 'wiki-ingest-20260928.log', i: 4 })
})

test('tailSlice：滚动加载=按锚点回取更早块，拼接不重不漏', async (t) => {
  const home = mkHome(t)
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20260928.log', 'l1\nl2\nl3\nl4\nl5\n')
  const merged = readMergedLog(defaultLogSources({ home }))
  const p1 = tailSlice(merged, { limit: 2 })
  const p2 = tailSlice(merged, { limit: 2, cursor: p1.cursor })
  assert.deepEqual(p2.lines.map((l) => l.text), ['l2', 'l3'])
  assert.equal(p2.hasMore, true)
  const p3 = tailSlice(merged, { limit: 2, cursor: p2.cursor })
  assert.deepEqual(p3.lines.map((l) => l.text), ['l1'])
  assert.equal(p3.hasMore, false)
  assert.equal(p3.cursor, null)
  const all = [...p3.lines, ...p2.lines, ...p1.lines].map((l) => l.text)
  assert.deepEqual(all, ['l1', 'l2', 'l3', 'l4', 'l5'], '三页拼接=完整日志，不重不漏')
})

test('tailSlice：游标锚点失效（日志被换走）= 空页 + stale 留痕，不抛不编造', async (t) => {
  const home = mkHome(t)
  writeLog(home, '.dsh/logs/cron/wiki-ingest-20260928.log', 'l1\n')
  const merged = readMergedLog(defaultLogSources({ home }))
  const ghost = JSON.stringify({ s: 'cron:wiki-ingest', f: 'gone.log', i: 3 })
  const page = tailSlice(merged, { limit: 2, cursor: ghost })
  assert.deepEqual(page.lines, [])
  assert.equal(page.hasMore, false)
  assert.equal(page.cursor, null)
  assert.equal(page.stale, true)
})

test('tailSlice：空日志 = 空页不抛', () => {
  const page = tailSlice([], { limit: 10 })
  assert.deepEqual(page.lines, [])
  assert.equal(page.hasMore, false)
  assert.equal(page.cursor, null)
})

// ── scan 输出机械解析（ingest-pipeline.py scan --summary 真实形）──────────────
test('summarizeScan：真实 scan --summary 输出形 → {total, skipped, pending, pendingFiles}（不编造）', () => {
  const output = [
    '📊 Ingest Pipeline Scan',
    '   扫描目录: 01-articles, 02-papers, 03-transcripts',
    '   总文件数: 591',
    '   已编译:   141',
    '   待编译:   450',
    '',
    '📋 待编译文件:',
    '   🔄 [04-session_logs] 2026-05-05-任务目标.md (2026-05-08 04:00)',
    '   🆕 [01-articles] 2026-09-28-新素材.md (2026-09-28 07:00)',
  ].join('\n')
  const s = summarizeScan(output)
  assert.equal(s.total, 591)
  assert.equal(s.skipped, 141)
  assert.equal(s.pending, 450)
  assert.equal(s.dirs, '01-articles, 02-papers, 03-transcripts')
  assert.deepEqual(s.pendingFiles, [
    { status: 're_ingest', subdir: '04-session_logs', name: '2026-05-05-任务目标.md', modified: '2026-05-08 04:00' },
    { status: 'ingest', subdir: '01-articles', name: '2026-09-28-新素材.md', modified: '2026-09-28 07:00' },
  ])
})

test('summarizeScan：无待编译形（✅ 无待编译文件）→ pending=0 空清单', () => {
  const output = [
    '📊 Ingest Pipeline Scan',
    '   扫描目录: 01-articles',
    '   总文件数: 3',
    '   已编译:   3',
    '   待编译:   0',
    '',
    '✅ 无待编译文件',
  ].join('\n')
  const s = summarizeScan(output)
  assert.equal(s.pending, 0)
  assert.deepEqual(s.pendingFiles, [])
})

test('summarizeScan：非 scan 输出/空串 = 全 null 不抛不编造', () => {
  for (const output of ['', 'python: command not found', 'Traceback (most recent call last):']) {
    const s = summarizeScan(output)
    assert.equal(s.total, null)
    assert.equal(s.pending, null)
    assert.deepEqual(s.pendingFiles, [])
    assert.equal(s.unknown, true)
  }
})
