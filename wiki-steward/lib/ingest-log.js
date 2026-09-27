// ingest-log — 设置页签 ingest 日志面的读取与拼接（纯机械，禁编造）。
// 日志落点调研结论（2026-09-28 实测，本模块=结论的机械承载）：无统一 ingest 日志文件——
//   ① ~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log：dsh-cron.sh 写（夜间蒸馏任务 21-wiki-ingest 的
//      stdout/stderr + exit code + SKIP 行）；
//   ② ~/.dsh/logs/cron/wiki-ingest-scan-YYYYMMDD.log：设置面板「扫描增量」触发后写（本特性新增，
//      落点沿 cron 日志家族命名，见 lib/ingest-trigger.js）；
//   ③ ~/.dsh/kb-alerts.md：告警账本（dsh-cron.sh 失败行 + wiki-steward alert 面，夜间任务读后清空）；
//   ④ ingest-pipeline.py 本身无日志文件（仅 stdout，机械面结果由②承接）；
//   ⑤ vault 内 raw/observer/observer-*.md 是素材（健康日报）非运行日志——不入面板（禁编造语义）。
// 故面板语义 = 各来源拼接 + 逐行如实标注来源（id/label/文件名/行号），绝不冒充统一日志。
// 顺序口径 =（dateKey, 文件名, 行号）升序：dateKey 取文件名 YYYYMMDD；告警账本行内时间戳
// （"- [YYYY-MM-DD …]"）优先，无时间戳行回退文件 mtime 日（留痕形态不编造行内时间）。
import fs from 'node:fs'
import path from 'node:path'

export const SOURCE_IDS = ['cron:wiki-ingest', 'manual:scan', 'alerts:kb']

const LABELS = {
  'cron:wiki-ingest': '夜间蒸馏任务日志（dsh-cron wiki-ingest）',
  'manual:scan': '手动扫描增量（设置面板触发）',
  'alerts:kb': '告警账本（kb-alerts）',
}

const DATE_RE = /^(\d{8})$/
const ALERT_LINE_DATE_RE = /^\s*-?\s*\[(\d{4})-(\d{2})-(\d{2})[^\]]*\]/
const DEFAULT_MAX_FILE_BYTES = 512 * 1024
const DEFAULT_PAGE_LIMIT = 200

/** 本地时区 YYYYMMDD（与 dsh-cron.sh `date +%Y%m%d` 同口径） */
function dateStamp(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/**
 * 三个真实日志来源的发现规约（id/label/落点/文件名匹配）。
 * @param {{home: string}} opts home=宿主家目录（测试注入 mkdtemp；生产=os.homedir()）
 */
export function defaultLogSources({ home }) {
  const cronDir = path.join(home, '.dsh', 'logs', 'cron')
  return [
    {
      id: 'cron:wiki-ingest',
      label: LABELS['cron:wiki-ingest'],
      kind: 'files',
      dir: cronDir,
      pattern: /^wiki-ingest-(\d{8})\.log$/,
      order: 1,
    },
    {
      id: 'manual:scan',
      label: LABELS['manual:scan'],
      kind: 'files',
      dir: cronDir,
      pattern: /^wiki-ingest-scan-(\d{8})\.log$/,
      order: 2,
    },
    {
      id: 'alerts:kb',
      label: LABELS['alerts:kb'],
      kind: 'file',
      file: path.join(home, '.dsh', 'kb-alerts.md'),
      order: 3,
      // 告警账本行内时间戳优先（dsh-cron.sh alert 行形 `- [YYYY-MM-DD HH:MM:SS] …`）
      lineDate: (text) => {
        const m = ALERT_LINE_DATE_RE.exec(text)
        return m === null ? null : `${m[1]}${m[2]}${m[3]}`
      },
    },
  ]
}

/** 单文件读取：超限只读尾段（面板看最新）+ 丢可能被截断的首行 + truncated 留痕 */
function readTail(filePath, name, maxFileBytes) {
  const stat = fs.statSync(filePath)
  const truncated = stat.size > maxFileBytes
  const fd = fs.openSync(filePath, 'r')
  try {
    const size = truncated ? maxFileBytes : stat.size
    const buf = Buffer.alloc(size)
    fs.readSync(fd, buf, 0, size, truncated ? stat.size - size : 0)
    let text = buf.toString('utf8')
    if (truncated) {
      const nl = text.indexOf('\n')
      text = nl === -1 ? '' : text.slice(nl + 1) // 首行可能只剩半截 → 丢弃（禁编造半行）
    }
    return { text, truncated }
  } finally {
    fs.closeSync(fd)
  }
}

function splitLines(text) {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop() // 行尾换行不算空行
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
}

/**
 * 跨来源真文件拼接。
 * @param {Array} sources defaultLogSources 形
 * @param {{maxFileBytes?: number}} [opts]
 * @returns {Array<{source,label,name,line,text,dateKey,truncated?}>} （dateKey,文件名,行号）升序
 */
export function readMergedLog(sources, opts = {}) {
  const maxFileBytes = Number.isFinite(opts.maxFileBytes) && opts.maxFileBytes > 0 ? opts.maxFileBytes : DEFAULT_MAX_FILE_BYTES
  const out = []
  for (const s of sources) {
    const files = []
    if (s.kind === 'files') {
      let names = []
      try {
        names = fs.readdirSync(s.dir).sort()
      } catch {
        names = [] // 目录缺席=空来源，不抛（留痕在 truncated 外：无文件可截断）
      }
      for (const name of names) {
        const m = s.pattern.exec(name)
        if (m === null) continue
        files.push({ filePath: path.join(s.dir, name), name, fileDate: DATE_RE.test(m[1] ?? '') ? m[1] : null })
      }
    } else if (s.kind === 'file') {
      const name = path.basename(s.file)
      files.push({ filePath: s.file, name, fileDate: null })
    }
    for (const f of files) {
      let read
      try {
        read = readTail(f.filePath, f.name, maxFileBytes)
      } catch {
        continue // 读失败=该文件缺席（不编造行）
      }
      const fallbackDate = f.fileDate ?? (() => {
        try {
          return dateStamp(fs.statSync(f.filePath).mtime)
        } catch {
          return '00000000'
        }
      })()
      const lines = splitLines(read.text)
      lines.forEach((text, idx) => {
        const lineDate = typeof s.lineDate === 'function' ? s.lineDate(text) : null
        out.push({
          source: s.id,
          label: s.label,
          name: f.name,
          line: idx + 1,
          text,
          dateKey: lineDate ?? fallbackDate,
          ...(read.truncated ? { truncated: true } : {}),
        })
      })
    }
  }
  out.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1
    : a.name < b.name ? -1 : a.name > b.name ? 1
      : a.line - b.line || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0)))
  return out
}

function normalizeLimit(limit, dflt = DEFAULT_PAGE_LIMIT) {
  const n = Number(limit)
  if (!Number.isFinite(n) || n <= 0) return dflt
  return Math.min(Math.floor(n), 1000)
}

/**
 * 尾部 N 行 + 滚动加载（锚点游标=返回块最旧行，追加新日志不破坏回翻）。
 * cursor=null → 最新块；cursor=锚点 → 锚点之前的更早块；锚点失效 → 空页 + stale 留痕。
 */
export function tailSlice(merged, { limit, cursor } = {}) {
  const pageLimit = normalizeLimit(limit)
  let end = merged.length
  if (cursor !== null && cursor !== undefined && cursor !== '') {
    let anchor = null
    try {
      const c = typeof cursor === 'string' ? JSON.parse(cursor) : cursor
      if (c && typeof c === 'object') anchor = c
    } catch {
      anchor = null
    }
    const idx = anchor === null ? -1 : merged.findIndex((l) => l.source === anchor.s && l.name === anchor.f && l.line === anchor.i)
    if (idx === -1) {
      return { lines: [], hasMore: false, cursor: null, stale: true }
    }
    end = idx
  }
  const start = Math.max(0, end - pageLimit)
  const lines = merged.slice(start, end)
  return {
    lines,
    hasMore: start > 0,
    cursor: start > 0 ? JSON.stringify({ s: lines[0].source, f: lines[0].name, i: lines[0].line }) : null,
  }
}

/**
 * ingest-pipeline.py scan --summary 输出的机械解析（形见 2026-09-28 实测样例，禁语义编造）。
 * 解析不出的形 → 全 null + unknown:true（如实，不猜）。
 */
export function summarizeScan(output) {
  const text = typeof output === 'string' ? output : ''
  const num = (re) => {
    const m = re.exec(text)
    return m === null ? null : Number(m[1])
  }
  const dirs = /^\s*扫描目录:\s*(.+)$/m.exec(text)
  const pendingFiles = []
  for (const line of text.split('\n')) {
    const m = /^\s*(🆕|🔄)\s+\[([^\]]+)\]\s+(.+?)\s+\(([^)]*)\)\s*$/.exec(line)
    if (m === null) continue
    pendingFiles.push({
      status: m[1] === '🆕' ? 'ingest' : 're_ingest',
      subdir: m[2],
      name: m[3],
      modified: m[4],
    })
  }
  const total = num(/总文件数:\s*(\d+)/)
  return {
    dirs: dirs === null ? null : dirs[1].trim(),
    total,
    skipped: num(/已编译:\s*(\d+)/),
    pending: num(/待编译:\s*(\d+)/),
    pendingFiles,
    ...(total === null ? { unknown: true } : {}),
  }
}
