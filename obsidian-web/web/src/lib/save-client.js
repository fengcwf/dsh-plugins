// save-client — 保存会话状态机（纯函数，组件零逻辑；OW-US-3/4、OW-INV-3 前端面）
// 语义：无乐观锁不落盘（lockParamsFor 只出 expectedMtime——服务端同口径）；
//   冲突三选（覆盖/重载/对比）显式选择后才继续；diff undo=保存前快照一键还原（内存级）。
// 保存防抖（delta-spec §3）：SAVE_DEBOUNCE_MS ≥500ms（web-edit.test.mjs 机械门锁定）。

/** 保存防抖（delta-spec §3：保存防抖 ≥500ms） */
export const SAVE_DEBOUNCE_MS = 600
/** 预览渲染防抖（预览联动；不受 §3 下限约束） */
export const PREVIEW_DEBOUNCE_MS = 300

/** 打开会话：note={path, content, mtime, etag}（readNote wire 形） */
export function createEditorSession(note) {
  return {
    path: note.path,
    draft: note.content ?? '',
    mtime: note.mtime,
    etag: note.etag,
    status: 'clean', // clean | dirty | saving | conflict
    diffUndo: null, // 最近一次成功保存的 {before, after}（undo 材料）
    conflict: null, // 冲突结果 {conflict, diffUndo:{before,incoming}}（三选材料）
    comparing: false,
    error: '',
  }
}

/** 保存锁参数（OW-INV-3：无乐观锁不落盘——这里永远带 expectedMtime） */
export function lockParamsFor(state) {
  return { expectedMtime: state.mtime }
}

/**
 * 会话状态机（纯函数）：
 *   edit{content} | save_start | save_ok{result} | conflict{result}
 *   | choose{choice:'overwrite'|'reload'|'compare'} | undo | save_error{message}
 */
export function reduceSession(state, event) {
  switch (event.type) {
    case 'edit':
      return { ...state, draft: event.content, status: 'dirty', error: '' }
    case 'save_start':
      return { ...state, status: 'saving', error: '' }
    case 'save_ok':
      return {
        ...state,
        status: 'clean',
        mtime: event.result.mtime,
        etag: event.result.etag,
        diffUndo: event.result.diffUndo,
        conflict: null,
        comparing: false,
        error: '',
      }
    case 'conflict':
      return { ...state, status: 'conflict', conflict: event.result, error: '' }
    case 'choose': {
      const before = state.conflict?.diffUndo?.before
      if (event.choice === 'overwrite') {
        // 覆盖：以盘上现 mtime 为新乐观锁，草稿保持我方内容，重新保存
        return { ...state, status: 'saving', mtime: before.mtime, etag: before.etag, comparing: false, error: '' }
      }
      if (event.choice === 'reload') {
        // 重载：草稿回盘上内容（before.content），与盘一致 → clean
        return {
          ...state,
          status: 'clean',
          draft: before.content,
          mtime: before.mtime,
          etag: before.etag,
          conflict: null,
          comparing: false,
          error: '',
        }
      }
      // 对比：双快照俱在（before=盘上 / incoming=我方），弹层出 diff 视图
      return { ...state, comparing: true, error: '' }
    }
    case 'undo':
      // diff undo：回到保存前快照（内存级；随后由调用方落盘）
      return { ...state, draft: state.diffUndo.before.content, status: 'dirty', error: '' }
    case 'save_error':
      return { ...state, status: 'dirty', error: event.message }
    default:
      return state
  }
}

/** 防抖器（真实定时器）：连击合流一次；flush 立即执行；cancel 吞掉 */
export function createDebouncer(fn, ms) {
  let timer = null
  let lastArgs = []
  return {
    schedule(...args) {
      lastArgs = args
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn(...lastArgs)
      }, ms)
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      fn(...lastArgs)
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
