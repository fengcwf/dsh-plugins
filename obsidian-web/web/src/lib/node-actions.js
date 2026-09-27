// node-actions — 树节点改名/删除编排（T6/T13）：容器薄、载荷与结果决策全在纯函数
//（rename-view.js 锁形；本模块只编排 I/O 与弹层状态——frontend-ui-engineering 容器/展示分离）。
// rename 面（T5 交接）：树操作入口→/ob/api/rename 多文件事务；冲突（target-exists）给显式覆盖
// 途径（OW-INV-5 永不静默覆盖）、歧义/降级 warnings 留痕提示展示、rolledBack 如实（绝不冒充成功）。
import { ref } from 'vue'
import { buildRenamePayload, renameOutcome, renameWarningText } from './rename-view.js'

/**
 * @param deps {{ deleteFile: Function, renameFile: Function, refreshTree: Function,
 *   clearOpenPaths: (path: string) => void, onRenameApplied: (from: string, to: string) => void,
 *   onNotice: (text: string) => void }}
 */
export function createNodeActions(deps) {
  const deleteTarget = ref(null)
  const deleteBusy = ref(false)
  const deleteError = ref('')
  const renameTarget = ref(null) // {path, canOverwrite}
  const renameBusy = ref(false)
  const renameError = ref('')
  const renameWarnings = ref('')

  // ── 删除（T6：双确认弹层→/ob/api/delete；成功刷新树并收拢打开态）──────────────
  function onDeleteNode(node) {
    deleteError.value = ''
    deleteTarget.value = { path: node.key }
  }

  function onDeleteCancel() {
    deleteTarget.value = null
    deleteError.value = ''
  }

  async function onDeleteConfirm(payload) {
    if (!payload || !deleteTarget.value) return // 双保险：无载荷不发请求（弹层复核 + 服务端缺省拒）
    deleteBusy.value = true
    deleteError.value = ''
    try {
      const { data } = await deps.deleteFile(payload.path, payload.confirm)
      if (!data.ok) {
        deleteError.value = `删除未完成（${data.reason}）：${data.message}`
        return
      }
      deleteTarget.value = null
      deps.clearOpenPaths(data.path)
      await deps.refreshTree()
      if (data.warnings?.length) deps.onNotice(data.warnings.join('；')) // 落点改名/收尾故障留痕（INV-15 风格）
    } catch (e) {
      deleteError.value = e.message
    } finally {
      deleteBusy.value = false
    }
  }

  // ── 改名/移动（T13 rename UI 入口：/ob/api/rename 事务面）────────────────────
  function onRenameNode(node) {
    renameError.value = ''
    renameWarnings.value = ''
    renameTarget.value = { path: node.key, canOverwrite: false }
  }

  function onRenameCancel() {
    renameTarget.value = null
    renameError.value = ''
    renameWarnings.value = ''
  }

  async function onRenameSubmit(payload) {
    if (!payload || !renameTarget.value) return // 载荷复核双保险：buildRenamePayload 不过不出请求
    renameBusy.value = true
    renameError.value = ''
    try {
      const { data } = await deps.renameFile(payload)
      const outcome = renameOutcome(data)
      renameWarnings.value = renameWarningText(outcome.warnings) // 冲突/歧义留痕（T5 warnings 面）
      if (outcome.kind === 'renamed') {
        const { from, to } = data
        renameTarget.value = null
        deps.onRenameApplied(from, to)
        await deps.refreshTree()
        if (renameWarnings.value) deps.onNotice(renameWarnings.value)
        return
      }
      if (outcome.kind === 'target-exists') {
        // 冲突=可解释 + 显式覆盖途径（再提交带 overwrite:true，永不静默覆盖）
        renameError.value = `${outcome.message}（可点「覆盖目标」显式替换）`
        renameTarget.value = { ...renameTarget.value, canOverwrite: true }
        return
      }
      renameError.value = outcome.kind === 'rolled-back'
        ? `改名未完成，已整体回滚：${outcome.message}`
        : outcome.message
      if (renameWarnings.value) deps.onNotice(renameWarnings.value) // 回滚/事务中止留痕同样展示
    } catch (e) {
      renameError.value = e.message
    } finally {
      renameBusy.value = false
    }
  }

  return {
    deleteTarget, deleteBusy, deleteError, onDeleteNode, onDeleteCancel, onDeleteConfirm,
    renameTarget, renameBusy, renameError, renameWarnings, onRenameNode, onRenameCancel, onRenameSubmit,
  }
}
