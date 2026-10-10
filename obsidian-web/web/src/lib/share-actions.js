// share-actions — 树节点「分享」动作编排（C3 卡 2026-10-09）：目录也可分享的单一入口。
// 契约（合同 C3 + 后端诊断 round5-diagnosis §C）：
//   - 后端 createShare 的 target 本就是**任意 vault 内相对路径**，`lstatSync` 后
//     targetType = isDirectory() ? 'dir' : 'file'——**无「仅文件」限制**（lib/share.js:334 亲核）。
//     故本模块**不做类型分流**：目录与笔记走完全同一条链路（零分支、零第二套）。
//   - 复用既有 SharePanel 业务编排（createNodeActions 同款容器模式）：本模块只持有「待分享目标」
//     这一状态与 I/O 编排，**不另起一套分享创建链路**（ShareCreateDialog 载荷复核仍在
//     lib/share-view.js buildCreatePayload，密码/角色不变量零复制）。
//   - 组件零业务逻辑（ARC-6）：App.vue 只做 `shareTarget = node` 的搬运，本模块付行动作与载荷。
// 红线：前端零拼接分享 URL（只渲染服务端下发 links）；本模块不引入任何 URL 字面量。
import { ref } from 'vue'
import { buildCreatePayload } from './share-view.js'

/** 目录/文件分享的默认表单（与 ShareCreateDialog blank() 同形，单一来源口径） */
export function shareFormFor(path) {
  return {
    target: typeof path === 'string' ? path : '',
    role: 'read',
    passwordMode: 'none',
    password: '',
    ttlDays: 7,
    oneShot: false,
  }
}

/**
 * 树右键「分享」→ 新建分享载荷（纯函数，单测锁形）。
 * 目录与文件同形：仅把 target 置为节点路径（目录路径=目录分享，后端据 lstat 自判 targetType）。
 * @returns {object|null} 过 buildCreatePayload 复核的载荷；空路径=拒绝（不出载荷）
 */
export function sharePayloadFor(path) {
  return buildCreatePayload(shareFormFor(path))
}

/**
 * 分享目标态（容器薄壳）：App 持有「谁要被分享」，SharePanel 接收并打开创建弹层。
 * @param deps {{ onNotice: (text: string) => void, goSharePanel: () => void }}
 */
export function createShareActions(deps = {}) {
  const shareTarget = ref(null) // {path, kind}——kind 仅作展示/说明用，业务不据其分流

  /**
   * 树节点「分享」入口（文件与目录同路）：置目标 + 切分享面板（弹层由 SharePanel 开）。
   * ⚠️ 调用方（App.vue）的 watch(activePanel) 只在**切离**分享面板时清目标——本函数置目标与
   * 切面板同 tick 发生，调用方若无条件清会抹掉刚下发的目标（C3 真实空缝：SharePanel 收不到
   * path → 弹层空目标）。职责边界在调用方，本模块只回答「置/清」。
   */
  function onShareFrom(node) {
    if (!node || typeof node.key !== 'string' || node.key === '') {
      deps.onNotice?.('分享目标为空（未取到节点路径）')
      return
    }
    shareTarget.value = { path: node.key, kind: node.type === 'dir' ? 'dir' : 'file' }
    deps.goSharePanel?.()
  }

  /** 清目标（切离分享面板/卸载时调用）：目标置空后 SharePanel 回到「手动新建」形态 */
  function onShareClear() {
    shareTarget.value = null
  }

  return { shareTarget, onShareFrom, onShareClear }
}
