// save-inflight 契约测试（T4 fix#2 回归）：保存在途再触发 → 不并飞、恰一次重存、零自我 conflict。
// 选型（报告同款口径）：保存编排纯函数 createSaveCoordinator（web/src/lib/save-client.js，App.vue 同源委托）
//   + 可控延迟真服务端端到端——真 node:http + 真 registerWebRoutes/saveNote（tmp vault 副本）+ 真 fs + 真 fetch；
//   延迟=环境注入（gate 门模拟 Ruling 5 慢盘：CIFS fsync 可超 2s），非行为 mock：被测编排/IO/锁全真。
// 场景（review finding #2 原文）：慢盘下保存飞行中继续触发 → 若并飞，第二次保存带旧 expectedMtime
//   → 服务端判陈旧锁 → 自我 conflict（「被他人修改过」误报）。
// 陷阱锁：choose:'overwrite' 会先把会话状态置 'saving' 再触发保存（待保存≠在途）——守卫判据必须是
//   在途标记而非 status==='saving'，否则覆盖保存会被守卫吞掉（卡死在 saving）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'
import { createEditorSession, reduceSession, createSaveCoordinator, SAVE_DEBOUNCE_MS } from '../web/src/lib/save-client.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-inflight', import.meta.url))
const PKG = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 真服务端 harness：真路由 + 真 saveNote + 保存请求延迟门（慢盘注入，可释放） */
async function startHarness(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const vault = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  fs.cpSync(path.join(FIXTURES, 'vault'), vault, { recursive: true })
  const routes = new Map()
  const ctx = {
    logger: { warn: () => {} },
    webServer: {
      register(route) {
        routes.set(`${route.kind}:${route.path}`, route)
        return () => routes.delete(`${route.kind}:${route.path}`)
      },
    },
    connection: { requestRejection: () => undefined },
  }
  registerWebRoutes(ctx, () => ({ vaultRoot: vault, ui: { pageSize: 50 } }), { distDir: path.join(PKG, 'web', 'dist') })
  let hold = null
  const arrivals = [] // 服务端视角：/ob/api/save 请求到达（守卫是否拦住并飞看这里）
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname
    const route = routes.get(`exact:${pathname}`) ?? routes.get('prefix:/ob')
    if (pathname === '/ob/api/save') {
      arrivals.push(Date.now())
      const gate = hold
      if (gate) {
        gate.then(() => route.handler(req, res)) // hold 期间挂起（慢盘 fsync 注入），释放后走真 handler
        return
      }
    }
    route.handler(req, res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    await new Promise((r) => server.close(r))
    fs.rmSync(vault, { recursive: true, force: true })
    fs.rmSync(TMP_ROOT, { recursive: true, force: true })
  })

  // 真客户端 IO（api.js 同形契约：成功 {data,...}；失败 {error:{code,message}}），真 fetch 往返
  const results = [] // 客户端视角：逐次保存的服务端真响应（含锁参数）
  async function requestJson(url, options = {}) {
    const res = await fetch(base + url, { ...options, headers: { accept: 'application/json', ...options.headers } })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.error?.message ?? `请求失败（HTTP ${res.status}）`)
    return body
  }
  const io = {
    saveFile: async (p, content, lock) => {
      const body = await requestJson('/ob/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, content, ...lock }),
      })
      results.push({ lock, data: body.data })
      return body
    },
    fetchFile: (p) => requestJson(`/ob/api/file?path=${encodeURIComponent(p)}`),
  }
  return {
    vault,
    io,
    arrivals,
    results,
    armHold() {
      let release
      const gate = new Promise((r) => { release = r })
      hold = gate
      return () => { hold = null; release() }
    },
  }
}

function coordinatorFor(h, note) {
  let session = createEditorSession(note)
  const c = createSaveCoordinator({
    getSession: () => session,
    setSession: (next) => { session = next },
    saveFile: h.io.saveFile,
    fetchFile: h.io.fetchFile,
  })
  return { c, getSession: () => session, setSession: (next) => { session = next } }
}

test('fix#2：保存在途再触发 → 不并飞、恰一次重存、零自我 conflict（慢盘场景）', async (t) => {
  const h = await startHarness(t)
  const note = (await h.io.fetchFile('notes/a.md')).data
  const { c, getSession, setSession } = coordinatorFor(h, note)
  const violations = []

  setSession(reduceSession(getSession(), { type: 'edit', content: '第二版' }))
  const release = h.armHold()
  const p1 = c.triggerSave() // 保存 #1 在途（服务端 hold=慢盘 fsync 未完）
  await sleep(150)
  if (h.arrivals.length !== 1) violations.push(`#1 到达数 ${h.arrivals.length} != 1`)

  // 保存飞行中继续触发（finding 原文：防抖 600ms 后再触发）
  setSession(reduceSession(getSession(), { type: 'edit', content: '第三版' }))
  c.scheduleSave()
  await sleep(SAVE_DEBOUNCE_MS + 300) // 防抖触发已到期（#1 仍在途）
  if (h.arrivals.length !== 1) {
    violations.push(`在途并飞：防抖触发又发了保存（到达数 ${h.arrivals.length} != 1）→ 旧 expectedMtime 自我 conflict 风险`)
  }
  if (h.results.some((r) => r.data.conflict)) violations.push('在途期间已出 conflict')

  release()
  await p1
  // 恰一次重存：排队触发经防抖重存一次，随后收敛（多一次/少一次都在收敛窗现身）
  const deadline = Date.now() + 5000
  while (h.results.length < 2 && Date.now() < deadline) await sleep(50)
  await sleep(SAVE_DEBOUNCE_MS + 500)
  if (h.arrivals.length !== 2) violations.push(`保存次数 ${h.arrivals.length} != 2（非恰一次重存）`)
  if (h.results.some((r) => r.data.conflict)) {
    violations.push(`自我 conflict（「被他人修改过」误报）：conflict 序列 ${JSON.stringify(h.results.map((r) => Boolean(r.data.conflict)))}`)
  }
  const disk = fs.readFileSync(path.join(h.vault, 'notes/a.md'), 'utf8')
  if (disk !== '第三版') violations.push(`盘上内容非最新稿：${JSON.stringify(disk)}`)
  if (getSession().status !== 'clean') violations.push(`会话未收敛 clean：${getSession().status}`)
  const [first, re] = h.results
  if (re && first && re.lock.expectedMtime !== first.data.mtime) {
    violations.push(`重存未用新 mtime 上锁：${JSON.stringify(re.lock.expectedMtime)} vs #1 回执 ${JSON.stringify(first.data.mtime)}`)
  }
  assert.deepEqual(violations, [], `fix#2 回归失败：\n- ${violations.join('\n- ')}`)
})

test('fix#2：在途多次触发合流 → 排队恰一次重存（不重复落盘）', async (t) => {
  const h = await startHarness(t)
  const note = (await h.io.fetchFile('notes/a.md')).data
  const { c, getSession, setSession } = coordinatorFor(h, note)

  setSession(reduceSession(getSession(), { type: 'edit', content: '多触发稿' }))
  const release = h.armHold()
  const p1 = c.triggerSave()
  await sleep(150)
  c.triggerSave() // 在途触发 ×3（手动保存 + 防抖 + undo 类直接触发的合流）
  c.scheduleSave()
  c.triggerSave()
  await sleep(SAVE_DEBOUNCE_MS + 300)
  release()
  await p1
  const deadline = Date.now() + 5000
  while (h.results.length < 2 && Date.now() < deadline) await sleep(50)
  await sleep(SAVE_DEBOUNCE_MS + 500)
  assert.equal(h.arrivals.length, 2, `在途 3 次触发应排队合流为恰一次重存，实际保存 ${h.arrivals.length} 次`)
  assert.ok(h.results.every((r) => !r.data.conflict), `零自我 conflict：${JSON.stringify(h.results.map((r) => Boolean(r.data.conflict)))}`)
  assert.equal(fs.readFileSync(path.join(h.vault, 'notes/a.md'), 'utf8'), '多触发稿', '盘上=最新稿')
  assert.equal(getSession().status, 'clean')
})

test('fix#2 陷阱锁：choose:overwrite 的待保存态不被在途守卫吞（status=saving ≠ 在途）', async (t) => {
  const h = await startHarness(t)
  const note = (await h.io.fetchFile('notes/a.md')).data
  const { c, getSession, setSession } = coordinatorFor(h, { ...note, mtime: 1 }) // 陈旧锁注入 → 必出 conflict

  setSession(reduceSession(getSession(), { type: 'edit', content: '覆盖稿' }))
  await c.triggerSave()
  assert.equal(h.results[0].data.conflict, true, '陈旧锁 → conflict 三选材料')
  assert.equal(getSession().status, 'conflict')

  setSession(reduceSession(getSession(), { type: 'choose', choice: 'overwrite' })) // ← 状态先置 'saving' 再触发保存
  await c.triggerSave()
  assert.equal(h.arrivals.length, 2, '覆盖保存必须真的发出（不得被在途守卫吞掉卡死在 saving）')
  assert.equal(h.results[1].data.ok, true, `覆盖保存应成功：${JSON.stringify(h.results[1].data)}`)
  assert.equal(getSession().status, 'clean')
  assert.equal(fs.readFileSync(path.join(h.vault, 'notes/a.md'), 'utf8'), '覆盖稿', '盘上=我方覆盖稿')
})
