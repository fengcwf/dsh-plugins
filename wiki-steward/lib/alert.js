// alert — 告警文件 ~/.dsh/kb-alerts.md（Task 13；delta-spec §1 + INV-15 面）
// 职责边界：只做告警追加/阈值触发/汇总，不认队列与捕获语义。
// 形态裁定：
//   · **追加式**（writeAtomic 不适用——告警只增不改，整文件换新会吞并发追加的行）：
//     withFileLock + appendFile 'a'（锁不碰数据文件，T8 契约同款）
//   · **落盘前必过 secrets.redact**（INV-11；计数入行 `(redacted:N)`——0 也入行，逐行可审计）
//   · 告警触发 = 重试耗尽（queue 报 exhausted）/ **连续失败阈值**（txl 连续 2 次阈值范式，
//     ALERT_THRESHOLD=2：满阈值告警、成功清零重计）
//   · 告警汇总 = timer 轻活第三件（聚合统计一行 + 调用方归零）
// 异常全吞+留痕（不阻塞会话铁律）：append/summarize 永不抛；warn 自身抛也吞。
// 零第三方运行时依赖（node:fs / node:path + 本包 fs-safe/secrets）。
import fs from 'node:fs'
import path from 'node:path'
import { withFileLock } from './fs-safe.js'
import { redact } from './secrets.js'

/** 连续失败阈值（txl 范式：连续 2 次即告警） */
export const ALERT_THRESHOLD = 2

/**
 * 创建告警面。
 * @param {{
 *   file: string,              // 告警文件（~/.dsh/kb-alerts.md）
 *   warn?: (line: string) => void,
 *   now?: () => Date|number,   // 时间注入缝
 *   threshold?: number,        // 连续失败阈值（缺省 2）
 *   lockWaitMs?: number,
 * }} opts
 */
export function createAlert({
  file,
  warn = () => {},
  now = () => new Date(),
  threshold = ALERT_THRESHOLD,
  lockWaitMs = 250,
} = {}) {
  if (typeof file !== 'string' || file === '') throw new TypeError('createAlert: file 必须是非空字符串')
  const counters = new Map()
  const stamp = () => {
    const d = now()
    return (d instanceof Date ? d : new Date(d)).toISOString()
  }

  /**
   * 追加一行告警（脱敏后落盘，计数入行）。永不抛。
   * @param {string} kind 告警类别（retry-exhausted / consecutive-failures / summary / …）
   * @param {string} message 告警正文（落盘前必过 redact）
   * @returns {Promise<{ok: boolean, redacted?: number, error?: Error}>}
   */
  async function append(kind, message) {
    try {
      const r = redact(String(message))
      const line = `- **${stamp()}** \`${String(kind)}\` ${r.text} (redacted:${r.count})\n`
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await withFileLock(
        file,
        async () => {
          await fs.promises.appendFile(file, line, 'utf8') // 'a' 追加：只增不改（writeAtomic 不适用）
        },
        { waitMs: lockWaitMs },
      )
      return { ok: true, redacted: r.count }
    } catch (e) {
      try {
        warn(`[wiki-steward] alert 落盘失败（吞+留痕，不阻塞）：${e?.message ?? e}`)
      } catch { /* warn 自身抛也吞（不阻塞铁律） */ }
      return { ok: false, error: e }
    }
  }

  /**
   * 连续失败观测器（txl 阈值范式）：每 key 独立计数；满 threshold 告警（每 threshold 倍数再告）；
   * ok() 清零重计。
   */
  function watch(key) {
    return {
      /** 记一次失败（返回 Promise 供调用方 await；不 await 也不抛） */
      fail(err) {
        const n = (counters.get(key) ?? 0) + 1
        counters.set(key, n)
        if (n % threshold === 0) {
          return append('consecutive-failures', `${key}: 连续 ${n} 次失败：${err?.message ?? err}`)
        }
        return Promise.resolve({ ok: true, redacted: 0, below: true })
      },
      /** 成功清零（重计） */
      ok() {
        counters.set(key, 0)
      },
      /** 当前连续失败数（观测） */
      count() {
        return counters.get(key) ?? 0
      },
    }
  }

  /**
   * 告警汇总（timer 轻活）：统计聚合成一行；零统计不落盘（防刷屏）。永不抛。
   * @param {Record<string, number>} stats
   * @returns {Promise<{ok: boolean, appended: boolean, redacted?: number, error?: Error}>}
   */
  async function summarize(stats) {
    try {
      const entries = Object.entries(stats ?? {}).filter(([, v]) => typeof v === 'number')
      if (entries.length === 0 || entries.every(([, v]) => v === 0)) return { ok: true, appended: false }
      const r = await append('summary', entries.map(([k, v]) => `${k}=${v}`).join(' '))
      return { ...r, appended: r.ok === true }
    } catch (e) {
      try {
        warn(`[wiki-steward] alert 汇总失败（吞+留痕）：${e?.message ?? e}`)
      } catch { /* 吞 */ }
      return { ok: false, appended: false, error: e }
    }
  }

  return { append, watch, summarize }
}
