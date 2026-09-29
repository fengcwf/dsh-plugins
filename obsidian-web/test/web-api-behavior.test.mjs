// UI-fix-2 行为测试（ui-review F-1/F-2/F-3/F-4 闭环；parent=changes/2026-09-28-b2-effect-fix/reviews/ui-review.md）：
//   ① F-1：stub fetch 200 非 JSON（形 a）→ 可解释错误（message 含「JSON」）经 load-state 归 error 态；
//      200 JSON 非信封（形 b）→ loadNoteUnit 上抛归 error 态——信封解构收敛 lib，openPath 零 unhandled。
//   ② F-2：fetchFile/fetchBacklinks 透传 options.timeoutMs——到期 ctrl.abort + TimeoutError + timer 清理
//      （「请求层无超时」/ctrl.abort 删除/finally clearTimeout 删除都必须红，guard 防挂死）。
//   ③ F-3：写接口（save/create/rename/delete）不设前端超时（长任务语义），读接口维持 8s；读/写超时与错误
//      文案区分（服务端 message 原样透传）；写失败/超时后自动 reloadTree() 兜底（save=onSaveError / delete·rename=node-actions）。
//   ④ F-4：专注态下切阅读头「编辑/分享」面板自动退出专注。
// 纯新增测试（零改既有测试）；stub fetch / 计时器台账全走 finally 还原，测试自用 guard 走真定时器不进台账。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  fetchFile, fetchBacklinks, saveFile, postRename, deleteFile, postShareCreate, fetchRender,
} from '../web/src/api.js'
import { createLoadController, loadView } from '../web/src/lib/load-state.js'
import { loadNoteUnit } from '../web/src/lib/read-view.js'
import { createEditorSession, reduceSession, createSaveCoordinator } from '../web/src/lib/save-client.js'
import { createNodeActions } from '../web/src/lib/node-actions.js'

const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))
const realTimeout = globalThis.setTimeout // 测试自用 guard 计时器走真定时器（不进台账，防污染断言）

/** 挂起 promise（慢写/挂起形）：reject 出口供收尾，防悬挂 */
function pending() {
  let reject
  const promise = new Promise((_, rej) => { reject = rej })
  promise.catch(() => {}) // 兜底出口（防 unhandled）
  return { promise, reject }
}

/** stub fetch：记录 {url, init, signal}，handler 决定落定形 */
function stubFetch(handler) {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (url, init = {}) => {
    const call = { url, init, signal: init.signal }
    calls.push(call)
    return handler(call)
  }
  return { calls, restore: () => { globalThis.fetch = realFetch } }
}

/** 计时器台账：记录本窗口内 setTimeout 的 {id, ms, cleared}（断言「排没排超时计时器」「清没清理」） */
function stubTimers() {
  const realSet = globalThis.setTimeout
  const realClear = globalThis.clearTimeout
  const scheduled = []
  globalThis.setTimeout = (fn, ms, ...rest) => {
    const id = realSet(fn, ms, ...rest)
    scheduled.push({ id, ms, cleared: false })
    return id
  }
  globalThis.clearTimeout = (id) => {
    const rec = scheduled.find((r) => r.id === id)
    if (rec) rec.cleared = true
    realClear(id)
  }
  return { scheduled, restore: () => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear } }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// ── ① F-1：200 非 JSON / 非信封 → 可解释错误经状态机归 error 态 ─────────────────
test('F-1 形 a：200 非 JSON 信封 → 可解释错误（含「JSON」）经状态机归 error 态（零静默失败）', async () => {
  const s = stubFetch(() => Promise.resolve(new Response('<html>bad gateway</html>', { status: 200 })))
  try {
    await assert.rejects(
      fetchFile('a.md'),
      (e) => /JSON/.test(e.message) && /HTTP 200/.test(e.message),
      'F-1 形 a：requestJson 上抛可解释错误（message 含「JSON」+ HTTP 状态）',
    )
    // openPath 口径：错误全部走状态机（error 态可解释+重试），不再 TypeError 逃逸
    const ctl = createLoadController()
    const r = await ctl.run('a.md', () => loadNoteUnit({ fetchFile, fetchBacklinks }, 'a.md'))
    assert.equal(r.status, 'error', '坏信封必须归 error 态（不落 idle/不静默）')
    const view = loadView(ctl.getState())
    assert.equal(view.failed, true, 'error 态出可解释错误卡')
    assert.equal(view.kind, 'load')
    assert.match(view.message, /JSON/, '错误卡 message 含「JSON」')
  } finally {
    s.restore()
  }
})

test('F-1 形 b：200 JSON 非信封 → loadNoteUnit 上抛（含「JSON」）归 error 态；正常信封解构 {file,backlinks}；App 信封解构收敛 lib', async () => {
  const bad = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })))
  try {
    await assert.rejects(
      loadNoteUnit({ fetchFile, fetchBacklinks }, 'a.md'),
      (e) => /JSON/.test(e.message),
      '非信封 JSON=可解释错误（含「JSON」），绝不抛 TypeError（unhandled=静默失败根因）',
    )
    const ctl = createLoadController()
    const r = await ctl.run('a.md', () => loadNoteUnit({ fetchFile, fetchBacklinks }, 'a.md'))
    assert.equal(r.status, 'error')
    assert.match(loadView(ctl.getState()).message, /JSON/)
  } finally {
    bad.restore()
  }
  const ok = stubFetch((call) => Promise.resolve(call.url.includes('backlinks')
    ? jsonResponse({ data: { backlinks: ['x.md'] } })
    : jsonResponse({ data: { path: 'a.md', content: 'c' } })))
  try {
    const unit = await loadNoteUnit({ fetchFile, fetchBacklinks }, 'a.md')
    assert.deepEqual(unit, { file: { path: 'a.md', content: 'c' }, backlinks: ['x.md'] }, '正常信封→读取单元')
  } finally {
    ok.restore()
  }
  // 回归锁：信封解构不得回到 App（b.data.backlinks 形=TypeError 逃逸根因，ui-review F-1 证据行）
  const app = fs.readFileSync(`${WEB_SRC}/App.vue`, 'utf8')
  assert.ok(!/\.data\.backlinks/.test(app), '信封解构收敛 loadNoteUnit（App 内不得出现 .data.backlinks 形）')
  assert.match(app, /loadNoteUnit\(\{ fetchFile, fetchBacklinks \}, path\)/, '打开单元走 loadNoteUnit（坏信封→error 态，零 unhandled）')
})

// ── ② F-2：timeoutMs 透传=真行为（abort + TimeoutError + timer 清理）────────────
test('F-2：fetchFile/fetchBacklinks 透传 options.timeoutMs——到期 ctrl.abort + TimeoutError + timer 清理（回潮必红）', async () => {
  const timers = stubTimers()
  const s = stubFetch((call) => (call.url.includes('backlinks')
    ? Promise.resolve(jsonResponse({ data: { backlinks: [] } }))
    : new Promise((_, reject) => {
        call.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })))
  try {
    const p = fetchFile('a.md', { timeoutMs: 20 })
    const outcome = await Promise.race([
      p.then((v) => ({ ok: v }), (e) => ({ err: e })),
      new Promise((r) => realTimeout(() => r({ guard: true }), 5000)), // 回潮保险：无超时=挂起不挂死，必红
    ])
    assert.ok(!outcome.guard, '「请求层无超时」回潮必红：timeoutMs=20 不落定')
    assert.equal(outcome.err?.name, 'TimeoutError', '到期中止以 TimeoutError 上抛（可解释超时）')
    assert.match(outcome.err.message, /超时/)
    assert.equal(s.calls[0].signal.aborted, true, '到期 ctrl.abort() 必须执行（删 ctrl.abort 必红）')
    const timerRec = timers.scheduled.find((r) => r.ms === 20)
    assert.ok(timerRec, 'timeoutMs=20 必须透传成计时器（包装层不放行 options=回潮必红）')
    assert.equal(timerRec.cleared, true, 'settle 后 timer 必须清理（删 finally clearTimeout 必红）')
    // 二次调用不受残留 timer 影响（timeoutMs=0 不排计时器=同步窗口断言，防外部计时器混入）
    const before2 = timers.scheduled.length
    const p2 = fetchBacklinks('b.md', { timeoutMs: 0 })
    assert.equal(timers.scheduled.length, before2, 'timeoutMs=0 不排计时器（仅首调一个）')
    const r2 = await p2
    assert.deepEqual(r2.data.backlinks, [])
    assert.equal(s.calls[1].signal.aborted, false, '二次调用信号不被残留 timer 中止')
  } finally {
    s.restore()
    timers.restore()
  }
})

// ── ③ F-3：写不设前端超时 / 读写文案区分 / 写失败自动 reloadTree 兜底 ────────────
test('F-3：写接口（save/create/rename/delete）不设前端超时（长任务语义），读接口维持 8s', async () => {
  const timers = stubTimers()
  const hang = pending()
  const s = stubFetch(() => hang.promise)
  try {
    const writes = [
      saveFile('a.md', 'x', { expectedMtime: 1 }), // save
      postShareCreate({ path: 'a.md', role: 'read' }), // create
      postRename({ from: 'a.md', to: 'b.md' }), // rename
      deleteFile('a.md', 'a.md'), // delete
    ].map((p) => p.catch((e) => e))
    assert.equal(timers.scheduled.length, 0, '写路径不得排前端超时计时器（回加 8s 必红）')
    const reads = [fetchFile('a.md'), fetchRender('x')].map((p) => p.catch((e) => e)) // 渲染=读计算（write:false）
    assert.deepEqual(timers.scheduled.map((r) => r.ms), [8000, 8000], '读接口（含渲染读计算）维持 8s=LOAD_TIMEOUT_MS')
    hang.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) // 全部落定收尾
    await Promise.all([...writes, ...reads])
    // 清理口径只认本测试排的读计时器（8000 形），防 node:test 内部计时器混入误报
    const readTimers = timers.scheduled.filter((r) => r.ms === 8000)
    assert.equal(readTimers.length, 2, '恰两个读计时器（file+render）')
    assert.ok(readTimers.every((r) => r.cleared), '落定后读计时器全清理')
  } finally {
    s.restore()
    timers.restore()
  }
})

test('F-3：读/写超时与错误文案区分（服务端 message 原样透传）', async () => {
  const abortStub = stubFetch(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  try {
    const readErr = await fetchFile('a.md').catch((e) => e)
    assert.equal(readErr.name, 'TimeoutError')
    assert.match(readErr.message, /^请求超时：\d+ 秒内未收到响应$/, '读超时文案（不带写语义）')
    const writeErr = await saveFile('a.md', 'x', { expectedMtime: 1 }).catch((e) => e)
    assert.equal(writeErr.name, 'TimeoutError')
    assert.match(writeErr.message, /^写入超时：/, '写超时文案与读区分（F-3）')
    assert.match(writeErr.message, /刷新目录/, '写超时提示=先刷新目录对齐服务端事实再决定是否重试')
  } finally {
    abortStub.restore()
  }
  const failStub = stubFetch(() => Promise.resolve(new Response('oops', { status: 502 })))
  try {
    const readErr = await fetchFile('a.md').catch((e) => e)
    assert.equal(readErr.message, '请求失败（HTTP 502）', '读兜底错误文案')
    const writeErr = await deleteFile('a.md', 'a.md').catch((e) => e)
    assert.equal(writeErr.message, '写入失败（HTTP 502）', '写兜底错误文案与读区分（F-3）')
  } finally {
    failStub.restore()
  }
  const serverStub = stubFetch(() => Promise.resolve(jsonResponse({ error: { code: 'bad_request', message: '缺少乐观锁' } }, 400)))
  try {
    assert.equal((await fetchFile('a.md').catch((e) => e)).message, '缺少乐观锁', '服务端域消息原样透传（读）')
    assert.equal((await saveFile('a.md', 'x', {}).catch((e) => e)).message, '缺少乐观锁', '服务端域消息原样透传（写，不改写）')
  } finally {
    serverStub.restore()
  }
})

test('F-3：写失败/超时后自动 reloadTree() 兜底（save=onSaveError 钩子；delete/rename=node-actions）', async () => {
  // save：saveFile 拒（写超时形）→ onSaveError 必回调（App 接线 reloadTree）
  let session = reduceSession(createEditorSession({ path: 'notes/a.md', content: 'x', mtime: 1 }), { type: 'edit', content: 'y' })
  const saveErrors = []
  const c = createSaveCoordinator({
    getSession: () => session,
    setSession: (next) => { session = next },
    saveFile: async () => {
      throw Object.assign(new Error('写入超时：服务端可能仍在执行，请先刷新目录再决定是否重试'), { name: 'TimeoutError' })
    },
    fetchFile: async () => ({ data: {} }),
    onSaveError: (e) => { saveErrors.push(e) },
  })
  await c.triggerSave()
  assert.equal(saveErrors.length, 1, '写失败必须回调 onSaveError（reloadTree 兜底接线点；删钩子调用必红）')
  assert.equal(session.status, 'dirty')
  assert.match(session.error, /写入超时/, '写超时文案如实进会话错误（可解释）')

  // delete/rename：写失败（异常/域失败）→ refreshTree 必被调（node-actions 兜底）
  const refreshes = []
  const io = {
    deleteFile: async () => { throw new Error('写入失败（HTTP 502）') },
    renameFile: async () => ({ data: { ok: false, reason: 'transaction-failed', rolledBack: true, message: '回滚' } }),
    refreshTree: async () => { refreshes.push(1) },
    clearOpenPaths: () => {},
    onRenameApplied: () => {},
    onNotice: () => {},
  }
  const a = createNodeActions(io)
  a.onDeleteNode({ key: 'notes/a.md' })
  await a.onDeleteConfirm({ path: 'notes/a.md', confirm: 'notes/a.md' })
  assert.equal(refreshes.length, 1, '删除写失败后必须自动 reloadTree()（F-3）')
  assert.equal(a.deleteError.value, '写入失败（HTTP 502）')
  a.onRenameNode({ key: 'notes/a.md' })
  await a.onRenameSubmit({ from: 'notes/a.md', to: 'notes/b.md' })
  assert.equal(refreshes.length, 2, '改名写失败后必须自动 reloadTree()（F-3）')
  assert.match(a.renameError.value, /改名未完成/)
})

// ── ④ F-4：专注态切「编辑/分享」面板退出专注 ───────────────────────────────────
test('F-4：专注态下切阅读头「编辑/分享」动作自动退出专注（focusMode=false）', () => {
  const app = fs.readFileSync(`${WEB_SRC}/App.vue`, 'utf8')
  assert.match(app, /const onEditPanel = \(\) => \{[^}]*focusMode\.value = false/, '编辑面板切换退出专注（阅读列独占语义不被稀释）')
  assert.match(app, /const onSharePanel = \(\) => \{[^}]*focusMode\.value = false/, '分享面板切换退出专注')
})
