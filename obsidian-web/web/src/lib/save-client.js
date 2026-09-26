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

/**
 * 保存编排器（fix#2 在途守卫 + 排队重存）：I/O 全注入（api.js 真实现），编排逻辑在此锁形单测
 * （test/save-inflight.test.mjs）。App.vue 只接线会话状态与 I/O，不持有保存时序。
 * 语义：
 *   · 同一时刻至多一笔保存在途（inFlight 包住 saveFile 往返）；在途期间的触发不并飞，置 pending
 *     排队，save_ok 后经防抖恰一次重存（重存钩子：pending || 草稿又改）。慢盘（Ruling 5：CIFS fsync
 *     可超 2s）下并飞会用旧 expectedMtime 撞服务端陈旧锁 → 自我 conflict（fix#2 根因）。
 *   · 守卫判据=inFlight 而非 session.status==='saving'：choose:'overwrite' 会先把状态置 'saving'
 *     再触发保存（待保存≠在途），用 status 判据会把覆盖保存自己吞掉（卡死在 saving）。
 *   · 冲突期间的 pending 由三选承接：overwrite 的重存即承接（triggerSave 起步即清 pending）；
 *     reload 丢弃我方稿，pending 随下次保存自然清零。
 */
export function createSaveCoordinator({
  getSession, setSession, saveFile, fetchFile, onFileSaved, debounceMs = SAVE_DEBOUNCE_MS,
}) {
  const debouncer = createDebouncer(() => { void triggerSave() }, debounceMs)
  let inFlight = false
  let pending = false

  async function triggerSave() {
    const current = getSession()
    if (!current) return
    if (inFlight) { pending = true; return } // 在途守卫：排队不并飞（fix#2）
    pending = false // 本次保存承接排队触发
    debouncer.cancel()
    const savedDraft = current.draft
    setSession(reduceSession(getSession(), { type: 'save_start' }))
    try {
      let r
      try {
        inFlight = true
        r = await saveFile(current.path, savedDraft, lockParamsFor(current))
      } finally {
        inFlight = false
      }
      if (r.data.conflict) {
        // 冲突（OW-INV-3）：零写入，转三选弹层（覆盖/重载/对比）
        setSession(reduceSession(getSession(), { type: 'conflict', result: r.data }))
        return
      }
      setSession(reduceSession(getSession(), { type: 'save_ok', result: r.data }))
      if (pending || getSession().draft !== savedDraft) debouncer.schedule() // 保存期间又触发/又改了 → 恰一次重存
      const f = await fetchFile(current.path)
      onFileSaved?.(current.path, f.data)
    } catch (e) {
      setSession(reduceSession(getSession(), { type: 'save_error', message: e.message }))
    }
  }

  return {
    triggerSave,
    scheduleSave: () => debouncer.schedule(),
    cancelScheduled: () => debouncer.cancel(),
  }
}
