// rename-view — 改名/移动 UI 纯函数（T13 rename UI 入口 / T5 交接：/ob/api/rename）
// 容器/展示分离：RenameDialog/App 只搬运事件，载荷与结果决策全落本模块（单测锁形）。
// 契约（lib/vault-ops.renameNote + web-routes renameHandler）：
//   请求 {from, to, overwrite?:true}（缺省不覆盖——OW-INV-5 永不静默覆盖同名）
//   响应 {ok, from, to, reason, message, changed[], rewritten[], skipped[], rolledBack, warnings[]}
//   reason ∈ same-path|not-found|not-a-file|target-exists|journal-limit|concurrent-modification|transaction-failed

/** T5 结果形 reason 全集（服务端契约字面；renameOutcome fail-closed 兜未知形） */
export const RENAME_REASONS = Object.freeze([
  'same-path', 'not-found', 'not-a-file', 'target-exists', 'journal-limit', 'concurrent-modification', 'transaction-failed',
])

/** 载荷复核（双保险：不出非法载荷）：trim；空目标/未变更/缺源 → null；
 *  overwrite 仅显式 true 随行（false/缺省不带字段——服务端缺省=不覆盖） */
export function buildRenamePayload(form) {
  if (!form || typeof form !== 'object') return null
  const from = String(form.from ?? '').trim()
  const to = String(form.to ?? '').trim()
  if (from === '' || to === '' || from === to) return null
  const payload = { from, to }
  if (form.overwrite === true) payload.overwrite = true
  return payload
}

/** 结果分类（UI 按 kind 决策；warnings/rolledBack 如实展示，绝不冒充成功）：
 *  renamed=成功 | target-exists=冲突（可显式覆盖途径 canOverwrite） | rolled-back=事务回滚 | failed=可解释拒
 *  M1（T14 随行收口）：rolledBack 全分支如实透传服务端标记（成功/冲突/失败形均不吞，
 *  ok:true 混形下也不虚构 false） */
export function renameOutcome(result) {
  const base = {
    kind: 'failed', ok: false, canOverwrite: false, rolledBack: false,
    message: '', warnings: [], changedCount: 0,
  }
  if (!result || typeof result !== 'object') return base
  const warnings = Array.isArray(result.warnings) ? [...result.warnings] : []
  const changedCount = Array.isArray(result.changed) ? result.changed.length : 0
  const rolledBack = result.rolledBack === true
  const message = typeof result.message === 'string' ? result.message : ''
  if (result.ok === true) {
    return { ...base, kind: 'renamed', ok: true, rolledBack, warnings, changedCount, message }
  }
  if (result.reason === 'target-exists') {
    return { ...base, kind: 'target-exists', canOverwrite: true, rolledBack, warnings, changedCount, message }
  }
  if (rolledBack) {
    return { ...base, kind: 'rolled-back', rolledBack: true, warnings, changedCount, message }
  }
  return { ...base, rolledBack, warnings, changedCount, message }
}

/** 留痕文案（T5 warnings 面：歧义不动/降级/事务中止逐条如实展示；空=空串） */
export function renameWarningText(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return ''
  return warnings.filter((w) => typeof w === 'string' && w !== '').join('；')
}
