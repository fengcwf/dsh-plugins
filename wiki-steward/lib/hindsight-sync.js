// hindsight-sync — Hindsight 记忆 → raw/06-hindsight/ 机械转录引擎（U1 核心，纯机械，绝不 LLM 语义编译——宪法红线）。
// 依据：changes/2026-10-07-hindsight-sync/solution-design.md §2/§3 + R-4/R-5/R-6 裁定。
//   R-4 同步对象=memories/facts（/memories/list 全量分页；knowledge pages body 实测全 0 不做）；
//   R-5 聚合非一条一文件（05-holographic 1091 垃圾事故教训）：bank + 月 → 一个素材文件；
//   R-6 落点 raw/06-hindsight/<bank-slug>-<hash8>-<YYYY-MM>.md 稳定 ID 命名（禁日期前缀文件名——防每夜新文件→
//   wiki 重复页爆炸）。⚠️ 2026-10-08 repair-r2 文件名规则修订（F2）：slug 有碰撞角（如 'coding-agent' 与
//   'coding-agent::公共' 同归 'coding-agent'——CJK 归 '-' 后尾连字符被 trim），故 bank_id sha256 前 8 位
//   确定性后缀分名（bankFileBase），两 bank 绝不互覆（拒写方案会让合法第二 bank 永远写不进=丢数据，已否决）。
// 幂等语义：同 bank 同月重复同步 = 同一文件（body sha256 同 → skip 零写盘；变 → 重写落盘=re_ingest 语义）。
// ⚠️ 易变字段（timestamp/is_stale）只进 frontmatter 绝不进 body（否则每夜 re_ingest）。
// 安全面（宪法红线 vault 侧写）：body 落盘前必过 secrets.redact；原子写 fs-safe.writeAtomic（O_EXCL+fsync+rename）；
// vaultRoot/dataDir 注入缝（测试 mkdtemp，绝不写真 home/vault）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { writeAtomic, withFileLock } from './fs-safe.js'
import { redact } from './secrets.js'
import { bodyHash } from './mark.js'
import { createAlert } from './alert.js'

/** 单请求超时下限（侦察 A 卡实测 recall 首调 HTTP:000——客户端 fetch 必须 ≥30s） */
export const REQUEST_TIMEOUT_MS = 30_000
/** 分页步长（/memories/list?limit&offset） */
export const PAGE_SIZE = 100
/** 低质门禁：text trim 后不足此长 = 跳过（防 05-holographic 式垃圾进 vault；8 兼顾 CJK 短句） */
export const MIN_TEXT_LEN = 8

/** bank_id → 文件名 slug（`::`→`--`，其余非 [A-Za-z0-9._-] 归 `-`；确定性、稳定 ID） */
export function bankSlug(bank) {
  const s = String(bank ?? '')
    .trim()
    .replace(/::/g, '--')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s === '' ? 'bank' : s
}

/**
 * bank_id → 确定性短哈希（sha256 前 8 位 hex）——文件名分名后缀（F2 碰撞角收口）。
 * 只认 bank_id 原文（非 slug）：同 slug 不同 bank 必得不同后缀，绝不互覆。
 */
export function bankHash8(bank) {
  return createHash('sha256').update(String(bank ?? ''), 'utf8').digest('hex').slice(0, 8)
}

/** 文件名基名（不含月份/扩展名）：<bank-slug>-<hash8>；同 slug 异 bank 分名（碰撞角：两 bank 绝不互覆） */
export function bankFileBase(bank) {
  return `${bankSlug(bank)}-${bankHash8(bank)}`
}

/** 条目月份桶：date（ISO）→ YYYY-MM；缺失回退 timestamp；再缺回退 fallbackMonth（同步时刻月） */
export function monthKeyOf(item, fallbackMonth) {
  const raw = String(item?.date ?? item?.timestamp ?? '')
  const m = /^(\d{4})-(\d{2})/.exec(raw)
  return m ? `${m[1]}-${m[2]}` : String(fallbackMonth)
}

/** 低质门禁（空 text/低质跳过）：trim 后 < MIN_TEXT_LEN 即跳过留痕，不进 vault */
export function isLowQuality(item) {
  return String(item?.text ?? '').trim().length < MIN_TEXT_LEN
}

/**
 * 补跑判据（定时调度面，F1）：同步日志 jsonl 当日已有任一行（含失败行）= 当日已跑过。
 * @param {string} logFile 同步日志路径（data/hindsight-sync-log.jsonl，引擎同源）
 * @param {string} stamp YYYYMMDD（lib/ingest-trigger.js dateStamp 同口径）
 * 读失败/文件缺=无记录（false）——补触发语义安全：同步幂等（sha256 三态 skip）+ 单飞旗标兜底，绝不互覆。
 */
export function syncRanOnStamp(logFile, stamp) {
  const d = String(stamp ?? '')
  const dateKey = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : ''
  if (dateKey === '') return false
  let text
  try {
    text = fs.readFileSync(logFile, 'utf8')
  } catch {
    return false
  }
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    try {
      if (String(JSON.parse(raw)?.ts ?? '').slice(0, 10) === dateKey) return true
    } catch { /* 畸形行不作数（hindsight-routes 同口径：畸形行跳过计数） */ }
  }
  return false
}

/**
 * body = 纯机械转录（确定性：id 升序；仅稳定字段 id/text/context/fact_type/document_id/entities）。
 * ⚠️ 易变字段（timestamp/is_stale）绝不进 body——本函数是该红线的唯一渲染面。
 */
export function renderBody(bank, month, facts) {
  const head = `<!-- hindsight-sync 机械转录（绝不 LLM 语义编译）：bank=${bank} · month=${month} · 同步产物非人工素材（re_ingest 例外见 solution-design.md） -->`
  const parts = [head, '']
  for (const f of [...facts].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    parts.push(`### ${f.id}`, '')
    parts.push(String(f.text).trim(), '')
    const ctx = String(f.context ?? '').trim()
    if (ctx !== '') parts.push(`- context: ${ctx}`)
    const meta = []
    if (f.fact_type != null && String(f.fact_type).trim() !== '') meta.push(`fact_type=${String(f.fact_type).trim()}`)
    if (f.document_id != null && String(f.document_id).trim() !== '') meta.push(`document_id=${String(f.document_id).trim()}`)
    if (f.entities != null && String(f.entities).trim() !== '') meta.push(`entities=${String(f.entities).trim()}`)
    if (meta.length > 0) parts.push(`- meta: ${meta.join('; ')}`)
    parts.push('')
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
}

const yq = (v) => JSON.stringify(String(v))

/**
 * frontmatter：title/date/tags/source: hindsight/fact_count/sha256 + 易变字段（latest_timestamp/stale_count——只在这里，绝不进 body）。
 * date=<YYYY-MM>-01（月份桶稳定值——幂等友好，非每夜变值）；sha256=body 哈希（mark.bodyHash INV-13 同源，与 ingest 三态判定同口径）。
 */
export function renderFrontmatter({ title, month, bankSlug: slug, factCount, sha256, latestTimestamp, staleCount }) {
  return [
    '---',
    `title: ${yq(title)}`,
    `date: ${yq(`${month}-01`)}`,
    `tags: [hindsight, memories, ${yq(slug)}]`,
    'source: hindsight',
    `fact_count: ${factCount}`,
    `sha256: ${sha256}`, // 裸值（0.8.1 t22，R-27② 次责面）：纯 hex 无需引号——与 mark.js「key: value 形」既定口径一致
    `latest_timestamp: ${yq(latestTimestamp)}`,
    `stale_count: ${staleCount}`,
    '---',
    '',
  ].join('\n')
}

/** 读既有文件的 frontmatter sha256（幂等比对基准；无文件/无字段=null） */
async function readExistingHash(target) {
  try {
    const text = await fs.promises.readFile(target, 'utf8')
    const m = /^sha256:\s*"?([0-9a-f]{64})"?/m.exec(text)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/**
 * 同步引擎工厂。
 * @param {{
 *   vaultRoot: string,        // vault 根（注入缝：测试 mkdtemp，绝不写真 vault）
 *   dataDir: string,          // 数据落点（同步日志/告警；注入缝：测试 mkdtemp）
 *   apiUrl?: string,          // 默认 http://127.0.0.1:8888（侦察实测零鉴权）
 *   banks?: string[],         // 空=全部 bank（R-4 现阶段只 dsh-plugins 有料）
 *   fetch?: typeof fetch,     // I/O 注入缝（测试假 fetch）
 *   now?: () => Date,         // 时间注入缝
 *   timeoutMs?: number,       // 单请求超时（下限 REQUEST_TIMEOUT_MS）
 *   pageSize?: number,
 *   alert?: { append: Function }, // 告警注入缝（缺省自建 kb-alerts.md 同款 alert.js 面）
 * }} opts
 */
export function createHindsightSync(opts = {}) {
  const vaultRoot = opts.vaultRoot
  const dataDir = opts.dataDir
  if (typeof vaultRoot !== 'string' || vaultRoot === '') throw new TypeError('createHindsightSync: vaultRoot 必须是非空字符串')
  if (typeof dataDir !== 'string' || dataDir === '') throw new TypeError('createHindsightSync: dataDir 必须是非空字符串')
  const apiUrl = String(opts.apiUrl ?? 'http://127.0.0.1:8888').replace(/\/+$/, '')
  const fetchImpl = opts.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new TypeError('createHindsightSync: fetch 不可用（提供 opts.fetch）')
  const now = typeof opts.now === 'function' ? opts.now : () => new Date()
  // 单请求超时下限（侦察 A 卡：recall 首调 HTTP:000）——配置只能更长，绝不能更短
  const timeoutMs = Math.max(REQUEST_TIMEOUT_MS, Number(opts.timeoutMs) || 0)
  const pageSize = Math.max(1, Number(opts.pageSize) || PAGE_SIZE)
  const alert = opts.alert ?? createAlert({ file: path.join(dataDir, 'kb-alerts.md'), now })
  const logFile = path.join(dataDir, 'hindsight-sync-log.jsonl')
  const outDir = path.join(vaultRoot, 'raw', '06-hindsight')

  const request = async (url) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res || res.ok !== true) throw new Error(`hindsight-sync HTTP ${res?.status ?? 0}：${url}`)
    return res.json()
  }

  /** /memories/list 全量分页（bank_id 含 :: 必须 URL 编码 %3A%3A——实测坑） */
  async function fetchBankMemories(bank) {
    const items = []
    let offset = 0
    for (;;) {
      const url = `${apiUrl}/v1/default/banks/${encodeURIComponent(bank)}/memories/list?limit=${pageSize}&offset=${offset}`
      const data = await request(url)
      const pageItems = Array.isArray(data?.items) ? data.items : []
      items.push(...pageItems)
      const total = Number(data?.total ?? items.length)
      offset += pageItems.length
      if (pageItems.length === 0 || offset >= total) break
    }
    return items
  }

  /** bank 清单发现（banks 配置空=全部）；形兼容 {items|banks|[...] } 与条目 string|{id|bank_id|bank|name} */
  async function listBanks() {
    const data = await request(`${apiUrl}/v1/default/banks`)
    const rows = Array.isArray(data) ? data : (data?.items ?? data?.banks ?? [])
    return rows
      .map((e) => (typeof e === 'string' ? e : (e?.id ?? e?.bank_id ?? e?.bank ?? e?.name ?? '')))
      .map((s) => String(s).trim())
      .filter((s) => s !== '')
  }

  /** 同步日志追加（每次同步一行 jsonl =「同步日历」数据源）；永不抛 */
  async function appendSyncLog(line) {
    try {
      await fs.promises.mkdir(path.dirname(logFile), { recursive: true })
      await withFileLock(logFile, async () => {
        await fs.promises.appendFile(logFile, `${JSON.stringify(line)}\n`, 'utf8')
      })
    } catch { /* 日志失败不阻塞同步（fail-open）；告警面已另有留痕 */ }
  }

  /** 单 bank 同步：门禁→分月聚合→脱敏→原子写/幂等 skip→日志。失败 fail-open + 告警，不抛。 */
  async function syncBank(bank) {
    const ts = new Date(now()).toISOString()
    const fallbackMonth = ts.slice(0, 7)
    try {
      const rawItems = await fetchBankMemories(bank)
      // id 去重（保首个）+ 低质门禁跳过留痕（防垃圾进 vault）
      const byId = new Map()
      for (const it of rawItems) {
        const id = String(it?.id ?? '').trim()
        if (id === '' || byId.has(id)) continue
        byId.set(id, it)
      }
      const skippedItems = []
      const kept = []
      for (const it of byId.values()) {
        if (isLowQuality(it)) {
          skippedItems.push(String(it.id))
          continue
        }
        kept.push(it)
      }
      // 分月聚合（R-5）：bank+月 → 一文件
      const buckets = new Map()
      for (const it of kept) {
        const month = monthKeyOf(it, fallbackMonth)
        if (!buckets.has(month)) buckets.set(month, [])
        buckets.get(month).push(it)
      }
      const files = []
      let redactedTotal = 0
      for (const [month, facts] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const slug = bankSlug(bank)
        const base = bankFileBase(bank) // <slug>-<hash8>：同 slug 异 bank 确定性分名（F2 碰撞角绝不互覆）
        const rel = path.posix.join('raw', '06-hindsight', `${base}-${month}.md`)
        const target = path.join(vaultRoot, 'raw', '06-hindsight', `${base}-${month}.md`)
        // 机械转录 + 落盘前脱敏（宪法红线 vault 侧写必过 secrets.redact）→ body 哈希（INV-13 同源）
        const red = redact(renderBody(bank, month, facts))
        redactedTotal += red.count
        const body = red.text
        const shaAfter = bodyHash(body)
        const shaBefore = await readExistingHash(target)
        const latestTimestamp = facts
          .map((f) => String(f.timestamp ?? f.date ?? ''))
          .sort()
          .pop() ?? ''
        const staleCount = facts.filter((f) => f.is_stale === true).length
        const fm = renderFrontmatter({
          title: `Hindsight 记忆转录：${bank} ${month}`,
          month,
          bankSlug: slug,
          factCount: facts.length,
          sha256: shaAfter,
          latestTimestamp,
          staleCount,
        })
        let action = 'updated'
        if (shaBefore === null) action = 'created'
        else if (shaBefore === shaAfter) action = 'skipped' // 幂等：同内容二次同步=零写盘
        if (action !== 'skipped') {
          await fs.promises.mkdir(outDir, { recursive: true })
          await writeAtomic(target, `${fm}${body}`) // O_EXCL+fsync+rename（mark.js 同款纪律）
        }
        files.push({ file: rel, month, fact_count: facts.length, action, sha256_before: shaBefore, sha256_after: shaAfter })
      }
      const line = { ts, bank, facts: kept.length, skipped: skippedItems.length, skipped_ids: skippedItems.slice(0, 20), redacted: redactedTotal, files }
      await appendSyncLog(line)
      return { ok: true, bank, facts: kept.length, skipped: skippedItems.length, files }
    } catch (e) {
      // fail-open + 告警进 kb-alerts（INV-15 禁静默）；错误正文过脱敏
      const msg = redact(`hindsight-sync 同步失败 bank=${bank}：${(e && e.message) || e}`).text
      await alert.append('hindsight-sync', msg)
      await appendSyncLog({ ts, bank, facts: 0, skipped: 0, files: [], error: msg })
      return { ok: false, bank, facts: 0, skipped: 0, files: [], error: msg }
    }
  }

  /** 全量同步（fail-open：单 bank 失败不拖垮其余；返回逐 bank 结果，不抛） */
  async function syncAll() {
    let banks = Array.isArray(opts.banks) ? opts.banks.filter((b) => String(b).trim() !== '') : []
    const errors = []
    if (banks.length === 0) {
      try {
        banks = await listBanks()
      } catch (e) {
        const msg = redact(`hindsight-sync bank 清单获取失败：${(e && e.message) || e}`).text
        await alert.append('hindsight-sync', msg)
        return { ok: false, banks: [], errors: [msg] }
      }
    }
    const results = []
    for (const bank of banks) {
      const r = await syncBank(bank)
      if (!r.ok) errors.push(r.error)
      results.push(r)
    }
    return { ok: errors.length === 0, banks: results, errors }
  }

  return { syncAll, syncBank, listBanks, fetchBankMemories, timeoutMs, pageSize, logFile, outDir }
}
