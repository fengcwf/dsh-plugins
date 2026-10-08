// hindsight-sync 单测（U1 机械转录引擎，LRN-047 真对真口径）。
// 被测件：lib/hindsight-sync.js 真引擎真落盘——假缝只在 I/O 边界（fetch 注入缝 + now 时间缝），
// 真 fs（mkdtemp vaultRoot/dataDir，绝不写真 home/vault）+ 真 secrets.redact + 真 fs-safe.writeAtomic + 真 alert 面。
// 锁面（合同验收逐条）：①分页聚合+bank_id :: URL 编码 %3A%3A+超时下限 ≥30s ②空 text/低质门禁跳过留痕
// ③bank+月聚合稳定 ID 命名+frontmatter 形+易变字段只进 frontmatter ④脱敏+原子写+注入缝
// ⑤同步日志 jsonl（同步日历数据源）+fail-open 告警进 kb-alerts ⑥幂等双态（sha256 同 skip 零写盘/变=重写）
// ⑦banks 配置空=发现全部 bank。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const { createHindsightSync, bankSlug, bankHash8, bankFileBase, monthKeyOf, isLowQuality, syncRanOnStamp, REQUEST_TIMEOUT_MS } = await import('../lib/hindsight-sync.js')

const BANK = 'coding-agent::dsh-plugins'

/** mkdtemp 注入缝：vaultRoot + dataDir 各自独立临时目录（绝不写真 home/vault） */
function mkEnv(t) {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-hs-vault-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-hs-data-'))
  t.after(() => {
    fs.rmSync(vaultRoot, { recursive: true, force: true })
    fs.rmSync(dataDir, { recursive: true, force: true })
  })
  return { vaultRoot, dataDir }
}

/** 假 fetch 注入缝（I/O 边界）：handler(url) 给载荷/抛错；记录 url 与 init（signal 取证） */
function makeFetch(handler) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const data = handler(String(url))
    if (data instanceof Error) throw data
    return { ok: true, status: 200, json: async () => data }
  }
  fn.calls = calls
  return fn
}

/** 分页假端点：按 limit/offset 切片返回 {items,total} */
function paged(items) {
  return (url) => {
    const u = new URL(url)
    const limit = Number(u.searchParams.get('limit'))
    const offset = Number(u.searchParams.get('offset'))
    return { items: items.slice(offset, offset + limit), total: items.length, limit, offset }
  }
}

const mem = (id, text, extra = {}) => ({
  id,
  text,
  context: `conversation of ${id}`,
  date: '2026-10-07T09:11:22.219000+00:00',
  fact_type: 'world',
  document_id: `conversation:session-${id}`,
  entities: 'user, knowledge:x',
  ...extra,
})

const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')
const readOut = (env, name) => fs.readFileSync(path.join(env.vaultRoot, 'raw', '06-hindsight', name), 'utf8')
const readLog = (env) =>
  fs.readFileSync(path.join(env.dataDir, 'hindsight-sync-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const bodyOf = (fileText) => fileText.replace(/^---\n[\s\S]*?\n---\n/, '')

// ── ① fetch 聚合：/memories/list 全量分页 + bank_id :: URL 编码 %3A%3A + 超时下限 ────────
test('① fetch 聚合：memories/list 全量分页；bank_id 含 :: 必 URL 编码 %3A%3A；单请求超时 ≥30s + signal 下传', async (t) => {
  const env = mkEnv(t)
  const items = [mem('a1', '第一条足够长的记忆文本'), mem('a2', '第二条足够长的记忆文本'), mem('a3', '第三条足够长的记忆文本'), mem('a4', '第四条足够长的记忆文本'), mem('a5', '第五条足够长的记忆文本')]
  const fetch = makeFetch(paged(items))
  const engine = createHindsightSync({ ...env, banks: [BANK], fetch, pageSize: 2, timeoutMs: 5, now: () => new Date('2026-10-08T12:00:00Z') })
  assert.ok(engine.timeoutMs >= 30_000, '单请求超时下限 ≥30s（侦察 A 卡 recall 首调 HTTP:000；配置只能更长不能更短）')
  assert.ok(REQUEST_TIMEOUT_MS >= 30_000, 'REQUEST_TIMEOUT_MS 常量 ≥30s')
  const got = await engine.fetchBankMemories(BANK)
  assert.equal(got.length, 5, '全量分页聚合（5 条跨 3 页）')
  const urls = fetch.calls.map((c) => c.url)
  assert.ok(urls[0].includes('/v1/default/banks/coding-agent%3A%3Adsh-plugins/memories/list'), 'bank_id 含 :: 必须 URL 编码 %3A%3A（实测坑）')
  assert.ok(!urls.some((u) => u.includes('::')), 'URL 中绝不出现裸 ::')
  assert.deepEqual(urls.map((u) => new URL(u).searchParams.get('offset')), ['0', '2', '4'], 'offset 分页递进至全量')
  for (const c of fetch.calls) assert.ok(c.init.signal instanceof AbortSignal, '每次请求下传 AbortSignal（超时中止面）')
})

// ── ② 低质门禁：空 text/低质条目跳过并留痕（防垃圾进 vault）────────────────────────────
test('② 低质门禁：空 text/空白/过短条目跳过留痕，不进 vault；其余如实转录', async (t) => {
  const env = mkEnv(t)
  const items = [
    mem('skip-empty', ''),
    mem('skip-blank', '   \n\t '),
    mem('skip-short', 'abc'),
    mem('keep-1', '这是一条足够长的正常记忆内容'),
  ]
  const engine = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(paged(items)), now: () => new Date('2026-10-08T12:00:00Z') })
  const r = await engine.syncBank(BANK)
  assert.equal(r.ok, true)
  assert.equal(r.skipped, 3, '空/空白/过短三条门禁跳过')
  assert.equal(r.facts, 1)
  const file = readOut(env, 'coding-agent--dsh-plugins-ad942f05-2026-10.md')
  assert.match(file, /keep-1/, '正常条目如实转录')
  assert.doesNotMatch(file, /skip-empty|skip-blank|skip-short/, '低质条目绝不进 vault')
  const line = readLog(env)[0]
  assert.equal(line.skipped, 3, '同步日志跳过数=3（留痕）')
  assert.deepEqual(line.skipped_ids.sort(), ['skip-blank', 'skip-empty', 'skip-short'], '跳过条目 id 留痕（防垃圾进 vault 且可审计）')
  assert.equal(isLowQuality({ text: 'x' }), true, '低质判定边界（单字符）')
  assert.equal(isLowQuality({ text: '七个字以内短句' }), true, '低质判定边界（7 字符=跳过）')
  assert.equal(isLowQuality({ text: '足够长的记忆正文' }), false, '8 字符起=正常文本非低质（CJK 口径）')
})

// ── ③ 聚合与落盘（R-5/R-6）：bank+月稳定 ID 命名 + frontmatter 形 + 易变字段只进 frontmatter ──
test('③ 聚合落盘：bank+月 → <bank-slug>-<hash8>-<YYYY-MM>.md（禁日期前缀；repair-r2 F2 确定性分名）；frontmatter 六字段；timestamp/is_stale 绝不进 body', async (t) => {
  const env = mkEnv(t)
  const items = [
    mem('m-sep-1', '九月的记忆内容甲条', { date: '2026-09-30T10:00:00+00:00', timestamp: '2026-09-30T10:00:00+00:00', is_stale: false }),
    mem('m-oct-1', '十月的记忆内容甲条', { date: '2026-10-07T09:11:22+00:00', timestamp: '2026-10-07T15:44:55Z', is_stale: true }),
    mem('m-oct-2', '十月的记忆内容乙条', { date: '2026-10-02T08:00:00+00:00', timestamp: '2026-10-02T08:00:00+00:00', is_stale: true }),
  ]
  const engine = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(paged(items)), now: () => new Date('2026-10-08T12:00:00Z') })
  const r = await engine.syncBank(BANK)
  assert.equal(r.ok, true)
  const names = fs.readdirSync(path.join(env.vaultRoot, 'raw', '06-hindsight')).sort()
  assert.deepEqual(names, ['coding-agent--dsh-plugins-ad942f05-2026-09.md', 'coding-agent--dsh-plugins-ad942f05-2026-10.md'], 'bank+月各一文件（R-5 聚合非一条一文件）')
  for (const n of names) assert.ok(n.startsWith('coding-agent--dsh-plugins-ad942f05-'), `稳定 ID 命名禁日期前缀：${n}`)
  assert.equal(bankSlug(BANK), 'coding-agent--dsh-plugins', 'slug 规则：::→-- 确定性')
  assert.equal(bankHash8(BANK), 'ad942f05', 'hash8=sha256(bank_id) 前 8 位（字面钉死——规则变更必红）')
  assert.equal(bankFileBase(BANK), 'coding-agent--dsh-plugins-ad942f05', '文件名基名=<slug>-<hash8>（字面钉死）')
  assert.equal(monthKeyOf({ date: '2026-10-07T09:11:22+00:00' }, '2026-01'), '2026-10', '月桶取 date')
  assert.equal(monthKeyOf({ timestamp: '2026-08-01T00:00:00Z' }, '2026-01'), '2026-08', 'date 缺失回退 timestamp')
  assert.equal(monthKeyOf({}, '2026-01'), '2026-01', '双缺回退同步时刻月（确定性兜底）')
  const oct = readOut(env, names[1])
  // frontmatter 六字段 + 易变字段
  assert.match(oct, /^title: "Hindsight 记忆转录：coding-agent::dsh-plugins 2026-10"$/m, 'title')
  assert.match(oct, /^date: "2026-10-01"$/m, 'date=月份桶稳定值（幂等友好）')
  assert.match(oct, /^tags: \[hindsight, memories, "coding-agent--dsh-plugins"\]$/m, 'tags')
  assert.match(oct, /^source: hindsight$/m, 'source: hindsight')
  assert.match(oct, /^fact_count: 2$/m, 'fact_count')
  assert.match(oct, /^sha256: "[0-9a-f]{64}"$/m, 'sha256（body 哈希）')
  assert.match(oct, /^latest_timestamp: "2026-10-07T15:44:55Z"$/m, '易变 timestamp 只进 frontmatter')
  assert.match(oct, /^stale_count: 2$/m, '易变 is_stale 只进 frontmatter（计数）')
  // 易变字段绝不进 body（否则每夜 re_ingest）
  const body = bodyOf(oct)
  assert.doesNotMatch(body, /15:44:55/, 'timestamp 字面绝不进 body')
  assert.doesNotMatch(body, /is_stale/, 'is_stale 字面绝不进 body')
  // body=机械转录稳定字段 + sha256 与 body 实测一致（mark.bodyHash INV-13 同源口径）
  assert.match(body, /### m-oct-1\n\n十月的记忆内容甲条/, '机械转录 id+text')
  assert.match(body, /- context: conversation of m-oct-2/, 'context 转录')
  assert.match(body, /- meta: fact_type=world; document_id=conversation:session-m-oct-2; entities=user, knowledge:x/, '稳定 meta 转录')
  const fmHash = /^sha256: "([0-9a-f]{64})"/m.exec(oct)[1]
  assert.equal(fmHash, sha256Hex(body), 'frontmatter sha256 = body 实测哈希（与 ingest 三态同口径）')
  const sorted = [...body.matchAll(/^### (\S+)$/gm)].map((m) => m[1])
  assert.deepEqual(sorted, [...sorted].sort(), 'body 确定性排序（id 升序——二次同步同序）')
})

// ── ④ 安全面：脱敏（宪法红线）+ 原子写 + vaultRoot 注入缝 ───────────────────────────────
test('④ 安全面：落盘前过 secrets.redact（密文不进 vault）；writeAtomic 原子写零 .tmp 残留；只写注入 vaultRoot', async (t) => {
  const env = mkEnv(t)
  const items = [
    mem('sec-1', '配置泄露样本 api_key=SECRETVALUE12345 与 sk-abcdef1234567890 同处一条记忆正文'),
  ]
  const engine = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(paged(items)), now: () => new Date('2026-10-08T12:00:00Z') })
  const r = await engine.syncBank(BANK)
  assert.equal(r.ok, true)
  const target = path.join(env.vaultRoot, 'raw', '06-hindsight', 'coding-agent--dsh-plugins-ad942f05-2026-10.md')
  const file = fs.readFileSync(target, 'utf8')
  assert.doesNotMatch(file, /SECRETVALUE12345|sk-abcdef1234567890/, '密文绝不进 vault（宪法红线：vault 侧写必过脱敏）')
  assert.match(file, /<redacted>/, '脱敏占位符如实落盘')
  assert.ok(target.startsWith(env.vaultRoot), '只写注入 vaultRoot（mkdtemp 缝，绝不写真 home/vault）')
  assert.equal(readLog(env)[0].redacted >= 2, true, '脱敏计数入同步日志（可审计）')
  const residue = fs.readdirSync(path.join(env.vaultRoot, 'raw', '06-hindsight')).filter((n) => n.endsWith('.tmp'))
  assert.deepEqual(residue, [], '原子写零 .tmp 残留（fs-safe.writeAtomic：O_EXCL+fsync+rename）')
})

// ── ⑤ 同步日志（同步日历数据源）+ 失败 fail-open + 告警进 kb-alerts ────────────────────
test('⑤ 同步日志：每 bank 一行 jsonl（时间/bank/条数/写入文件/跳过数/sha256 前后值）；失败 fail-open + 告警进 kb-alerts', async (t) => {
  const env = mkEnv(t)
  const items = [mem('log-1', '日志样本记忆内容甲条'), mem('log-2', '日志样本记忆内容乙条')]
  const engine = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(paged(items)), now: () => new Date('2026-10-08T12:00:00Z') })
  await engine.syncBank(BANK)
  const line = readLog(env)[0]
  assert.match(line.ts, /^\d{4}-\d{2}-\d{2}T/, '时间戳（同步日历时间轴）')
  assert.equal(line.bank, BANK, 'bank')
  assert.equal(line.facts, 2, '条数')
  assert.equal(line.skipped, 0, '跳过数')
  const f = line.files[0]
  assert.equal(f.file, 'raw/06-hindsight/coding-agent--dsh-plugins-ad942f05-2026-10.md', '写入文件（vault 相对路径）')
  assert.equal(f.fact_count, 2, '写入文件条数')
  assert.equal(f.action, 'created', '首同步=created')
  assert.equal(f.sha256_before, null, 'sha256 前值（无文件=null）')
  assert.match(f.sha256_after, /^[0-9a-f]{64}$/, 'sha256 后值')
  // 失败 fail-open：fetch 抛 → 不抛出、结果如实、告警进 kb-alerts（INV-15 禁静默）
  const engine2 = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(() => new Error('conn refused')), now: () => new Date('2026-10-08T13:00:00Z') })
  const r = await engine2.syncAll()
  assert.equal(r.ok, false, '失败如实（fail-open 不吞）')
  assert.equal(r.errors.length, 1, '错误入结果')
  assert.equal(r.banks[0].ok, false)
  const alerts = fs.readFileSync(path.join(env.dataDir, 'kb-alerts.md'), 'utf8')
  assert.match(alerts, /hindsight-sync/, '告警进 kb-alerts（复用 alert.js 形）')
  assert.match(alerts, /conn refused/, '失败原因留痕')
  const failLine = readLog(env).at(-1)
  assert.equal(failLine.error.includes('conn refused'), true, '失败行同样落同步日志（不静默）')
})

// ── ⑥ 幂等双态：同内容零写盘 skip / 内容变=重写（re_ingest 语义）────────────────────────
test('⑥ 幂等：同内容二次同步=零写盘（sha256 同 skip）；内容变=sha256 更新落盘（re_ingest）——双态锁定', async (t) => {
  const env = mkEnv(t)
  const items = [mem('idem-1', '幂等样本记忆内容甲条', { date: '2026-10-07T09:00:00+00:00' })]
  const fetch1 = makeFetch(paged(items))
  const engine = createHindsightSync({ ...env, banks: [BANK], fetch: fetch1, now: () => new Date('2026-10-08T12:00:00Z') })
  const r1 = await engine.syncBank(BANK)
  assert.equal(r1.files[0].action, 'created')
  const target = path.join(env.vaultRoot, 'raw', '06-hindsight', 'coding-agent--dsh-plugins-ad942f05-2026-10.md')
  const before = { text: fs.readFileSync(target, 'utf8'), ino: fs.statSync(target).ino, mtime: fs.statSync(target).mtimeMs }
  // 二跑同内容 → skip 零写盘（inode 不变=writeAtomic 未执行——零写盘硬证据）
  const engine2 = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(paged(items)), now: () => new Date('2026-10-08T13:00:00Z') })
  const r2 = await engine2.syncBank(BANK)
  assert.equal(r2.files[0].action, 'skipped', '同内容二次同步=skip（sha256 同）')
  assert.equal(r2.files[0].sha256_before, r2.files[0].sha256_after, 'sha256 前后同值')
  const after = { text: fs.readFileSync(target, 'utf8'), ino: fs.statSync(target).ino, mtime: fs.statSync(target).mtimeMs }
  assert.equal(after.ino, before.ino, '零写盘（inode 未变）')
  assert.equal(after.text, before.text, '文件逐字节未变')
  // 内容变 → 重写落盘（re_ingest 语义）
  const changed = [{ ...items[0], text: '幂等样本记忆内容甲条（已更新的更长正文）' }]
  const engine3 = createHindsightSync({ ...env, banks: [BANK], fetch: makeFetch(paged(changed)), now: () => new Date('2026-10-08T14:00:00Z') })
  const r3 = await engine3.syncBank(BANK)
  assert.equal(r3.files[0].action, 'updated', '内容变=updated（重写落盘）')
  assert.notEqual(r3.files[0].sha256_after, r3.files[0].sha256_before, 'sha256 更新（re_ingest 触发面）')
  const after3 = { text: fs.readFileSync(target, 'utf8'), ino: fs.statSync(target).ino }
  assert.notEqual(after3.ino, before.ino, '重写=原子替换（inode 变）')
  assert.match(after3.text, /已更新的更长正文/, '新内容如实落盘')
  assert.equal(fs.statSync(target).mtimeMs >= before.mtime, true, '时间轴如实')
})

// ── ⑦ banks 配置空=发现全部 bank（R-4 现阶段只 dsh-plugins 有料，发现面留全量）──────────
test('⑦ banks 空=发现全部 bank：/banks 清单逐 bank 各自聚合落盘+各自日志行', async (t) => {
  const env = mkEnv(t)
  const fetch = makeFetch((url) => {
    if (url.endsWith('/v1/default/banks')) return { items: [{ id: BANK }, { bank_id: 'coding-agent::公共' }] }
    if (url.includes('dsh-plugins')) return paged([mem('d1', 'dsh-plugins bank 的记忆内容')])(url)
    return paged([mem('g1', '公共 bank 的记忆内容甲')])(url)
  })
  const engine = createHindsightSync({ ...env, banks: [], fetch, now: () => new Date('2026-10-08T12:00:00Z') })
  const r = await engine.syncAll()
  assert.equal(r.ok, true)
  assert.equal(r.banks.length, 2, '发现面=2 bank')
  const names = fs.readdirSync(path.join(env.vaultRoot, 'raw', '06-hindsight')).sort()
  assert.deepEqual(names, ['coding-agent--dsh-plugins-ad942f05-2026-10.md', 'coding-agent-a3906a67-2026-10.md'], '各 bank 各自稳定命名落盘（<slug>-<hash8>-<月>.md：slug=CJK 非安全字符归 -、去边；hash8=分名防同 slug 互覆）')
  const lines = readLog(env)
  assert.deepEqual(lines.map((l) => l.bank).sort(), [BANK, 'coding-agent::公共'].sort(), '每 bank 一行 jsonl')
})

// ── ⑧ 碰撞角（repair-r2 F2）：两 bank 归同 slug → 确定性 hash8 分名，绝不互覆 ──────────
test('⑧ 碰撞角：coding-agent 与 coding-agent::公共 同归 slug → hash8 分名落不同文件，绝不互覆', async (t) => {
  const env = mkEnv(t)
  assert.equal(bankSlug('coding-agent'), bankSlug('coding-agent::公共'), '碰撞前提实证：两 bank 同归 slug=coding-agent（CJK 归 - 后尾连字符被 trim）')
  assert.equal(bankSlug('coding-agent'), 'coding-agent')
  assert.equal(bankFileBase('coding-agent'), 'coding-agent-cc928dc9', '基名字面钉死（规则变更必红）')
  assert.equal(bankFileBase('coding-agent::公共'), 'coding-agent-a3906a67', '同 slug 异 bank → 异 hash8=分名')
  const fetch = makeFetch((url) => {
    if (url.includes('/memories/list')) {
      return url.includes('coding-agent%3A%3A')
        ? paged([mem('g1', '公共 bank 的记忆内容甲')])(url)
        : paged([mem('c1', 'coding-agent bank 的记忆内容')])(url)
    }
    return {}
  })
  const engine = createHindsightSync({ ...env, banks: ['coding-agent', 'coding-agent::公共'], fetch, now: () => new Date('2026-10-08T12:00:00Z') })
  const r = await engine.syncAll()
  assert.equal(r.ok, true, '两 bank 同步均成功（拒写方案=第二 bank 写不进=丢数据，已否决）')
  const dir = path.join(env.vaultRoot, 'raw', '06-hindsight')
  const names = fs.readdirSync(dir).sort()
  assert.deepEqual(names, ['coding-agent-a3906a67-2026-10.md', 'coding-agent-cc928dc9-2026-10.md'], '同 slug 两 bank 落不同文件（hash8 分名）')
  const a = fs.readFileSync(path.join(dir, 'coding-agent-cc928dc9-2026-10.md'), 'utf8')
  const b = fs.readFileSync(path.join(dir, 'coding-agent-a3906a67-2026-10.md'), 'utf8')
  assert.match(a, /bank=coding-agent ·/, 'A 文件标头 bank=coding-agent（归属可审计）')
  assert.match(a, /c1/, 'A 文件只含 A 记忆')
  assert.doesNotMatch(a, /g1/, 'A 文件绝不含 B 记忆（互覆=必现此红）')
  assert.match(b, /bank=coding-agent::公共 ·/, 'B 文件标头 bank=原文')
  assert.match(b, /g1/, 'B 文件只含 B 记忆')
  assert.doesNotMatch(b, /c1/, 'B 文件绝不含 A 记忆')
  assert.ok(!fs.existsSync(path.join(dir, 'coding-agent-2026-10.md')), '无裸 slug 文件（分名后缀恒在）')
  // 二跑幂等不换名（确定性：同 bank 同月恒同文件）
  const engine2 = createHindsightSync({ ...env, banks: ['coding-agent', 'coding-agent::公共'], fetch, now: () => new Date('2026-10-08T13:00:00Z') })
  const r2 = await engine2.syncAll()
  assert.equal(r2.ok, true)
  assert.deepEqual(fs.readdirSync(dir).sort(), names, '二次同步零新文件（稳定 ID 命名）')
  assert.deepEqual(r2.banks.map((x) => x.files[0].action), ['skipped', 'skipped'], '同内容二跑=skip 零写盘（幂等双态与分名并存）')
})

// ── ⑨ 补跑判据 syncRanOnStamp（repair-r2 F1 定时调度面）────────────────────────────
test('⑨ 补跑判据：syncRanOnStamp——同步日志当日有行（含失败行）=已跑；跨日/文件缺/畸形行不作数', async (t) => {
  const env = mkEnv(t)
  const logFile = path.join(env.dataDir, 'hindsight-sync-log.jsonl')
  assert.equal(syncRanOnStamp(logFile, '20261008'), false, '文件缺=无记录（可补跑）')
  assert.equal(syncRanOnStamp(logFile, 'bad-stamp'), false, '非法 stamp=不作数')
  fs.writeFileSync(logFile, [
    JSON.stringify({ ts: '2026-10-08T03:25:01.000Z', bank: 'x', facts: 1 }),
    '{bad json',
    JSON.stringify({ ts: '2026-10-07T03:25:01.000Z', bank: 'x', facts: 0, error: 'boom' }),
  ].join('\n') + '\n', 'utf8')
  assert.equal(syncRanOnStamp(logFile, '20261008'), true, '当日有行=已跑（不补跑）')
  assert.equal(syncRanOnStamp(logFile, '20261007'), true, '失败行同样计=已跑（防重复触发刷告警）')
  assert.equal(syncRanOnStamp(logFile, '20261006'), false, '无行之日=可补跑')
})
