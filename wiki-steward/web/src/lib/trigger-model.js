// trigger-model — 设置页签「手动触发 ingest」双动作状态机纯函数（.vue 只做展示）。
// 裁定语义=双动作：「扫描增量」（机械面 scan）/「触发蒸馏」（呼叫 headless 任务通道；
// 按钮绝不做 LLM 蒸馏——蒸馏由任务执行）。
export const TRIGGERS = ['scan', 'distill']

function idle() {
  return { status: 'idle', message: '', logFile: null, result: null }
}

export function initialTriggerState() {
  return { scan: idle(), distill: idle() }
}

export function beginTrigger(state, kind) {
  return { ...state, [kind]: { ...state[kind], status: 'running', message: '执行中…' } }
}

function scanMessage(result) {
  const s = result.summary ?? {}
  if (!result.ok) {
    return `扫描失败（exit ${result.exitCode}）：${String(result.output ?? '').split('\n')[0] || '无输出'}`
  }
  if (s.unknown === true) return '扫描完成（输出未能机械解析，原文见日志）'
  if ((s.pending ?? 0) === 0) return '扫描完成：无待编译素材'
  const fresh = (s.pendingFiles ?? []).filter((f) => f.status === 'ingest').length
  const re = (s.pendingFiles ?? []).filter((f) => f.status === 're_ingest').length
  return `扫描完成：待编译 ${s.pending} 条（新增 ${fresh} / 更新 ${re}），增量清单见日志`
}

function distillMessage(result) {
  return String(result.note ?? '')
}

/** 触发完成归位：scan=done/error（摘要文案）；distill=done/skipped/error（提示文案如实） */
export function finishTrigger(state, kind, result) {
  if (kind === 'scan') {
    return {
      ...state,
      scan: {
        status: result.ok ? 'done' : 'error',
        message: scanMessage(result),
        logFile: result.logFile ?? null,
        result,
      },
    }
  }
  const status = result.started === true ? 'done' : result.reason === 'spawn-failed' ? 'error' : 'skipped'
  return {
    ...state,
    distill: {
      status,
      message: distillMessage(result),
      logFile: result.logFile ?? null,
      result,
    },
  }
}
