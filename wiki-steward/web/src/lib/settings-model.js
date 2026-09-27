// settings-model — 设置页签「相关设置」展示模型纯函数（只读展示；.vue 只做展示）。
// 本波可改项最小集 = ∅（用户需求是"查看"；改 config=走 cordis config 热改语义，不在本面板）。
// vaultRoot / write.readOnly 展示带 INV-7 注记（语义勿动：默认只读，写类工具需显式开启）。
export function settingsGroups(data) {
  const cfg = data?.config ?? {}
  const channel = data?.channel ?? {}
  const sources = data?.sources ?? []
  const yn = (v) => (v === true ? 'true' : v === false ? 'false' : String(v ?? ''))

  const channelValue = channel.available
    ? (channel.running ? '可用（任务执行中）' : '可用')
    : '不可用'
  const channelNote = channel.available
    ? '蒸馏由任务执行（headless 任务 dsh-cron wiki-ingest）：面板只负责触发，不做 LLM 蒸馏'
    : '通道不可用：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill'

  const rows = [
    { key: 'vaultRoot', value: String(cfg.vaultRoot ?? ''), note: '捕获双轨落点根（模型不可改）', editable: false },
    { key: 'write.readOnly', value: yn(cfg.write?.readOnly), note: 'INV-7 默认只读：wiki_write/wiki_delete/wiki_rename 需显式开启才动手', editable: false },
    { key: 'capture.enabled', value: yn(cfg.capture?.enabled), note: '会话捕获开关', editable: false },
    { key: 'capture.bufferRounds', value: yn(cfg.capture?.bufferRounds), note: '缓冲轮数（每 N 轮强制双轨落盘）', editable: false },
    { key: 'queue.maxRetries', value: yn(cfg.queue?.maxRetries), note: '失败幂等队列重试上限', editable: false },
    { key: 'queue.ttlDays', value: yn(cfg.queue?.ttlDays), note: '队列条目 TTL（天）', editable: false },
    { key: 'secrets.enabled', value: yn(cfg.secrets?.enabled), note: '落盘/注入前哨兵脱敏', editable: false },
    { key: 'log.sources', value: sources.map((s) => s.label).join(' / '), note: '无统一日志文件——各来源拼接，逐行如实标注来源', editable: false },
    { key: 'distill.channel', value: channelValue, note: channelNote, editable: false },
    { key: 'distill.logFile', value: String(channel.logFile ?? ''), note: '蒸馏任务日志（dsh-cron 写）', editable: false },
    { key: 'distill.taskFile', value: String(channel.taskFile ?? ''), note: '夜间蒸馏任务指令（21-wiki-ingest）', editable: false },
  ]

  return [
    { title: 'wiki-steward Config（只读展示，可改项=∅）', rows },
  ]
}
