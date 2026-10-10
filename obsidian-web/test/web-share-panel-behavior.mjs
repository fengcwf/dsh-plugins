// 分享面板**接线行为测试**（C3 卡 2026-10-10）：真 vite 构建 + 真 chromium + 真组件（App.vue + 真
// NoteTree + 真 TreeContextMenu + 真 SharePanel + 真 ShareCreateDialog），零组件 mock、零 stub 事件。
// 为什么必须有它：`web-share-mgmt.test.mjs`（后端 HTTP 面）与源码形锁**都证不了「树右键 → 弹层目标」这条缝**——
// C3 交付时的空缝缺陷（SharePanel 通过 prop 收下 `shareRequest` 却从不读取其 path，弹层按旧值重置表单）
// 正是纯函数/源码断言全绿、真渲染才现形的那一类（教训同 FX-INV-6 / C2 的 Escape 失效）。
// 环境依赖：vite（devDependencies 已在）+ Playwright/Chromium（本机已装，2026-10-10 实测本机可跑）。起不来 = 整文件 skip（不 fail）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SHARE_TOKEN_SNAPSHOT } from '../lib/share-theme.js'

const WEB = fileURLToPath(new URL('../web', import.meta.url))
const HERE = path.dirname(fileURLToPath(import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../node_modules/.bin/vite', import.meta.url))
const HTML = path.join(WEB, 'tmp-c3-behavior.html')
const ENTRY = path.join(WEB, 'tmp-c3-behavior.js')

/** 假 /ob/ 后端载荷：树含一个目录 notes（+ 子项）+ 一个文件；分享列表混合 dir/file 两形 */
const TREE = [
  { name: 'notes', path: 'notes', type: 'dir', children: [
    { name: 'a.md', path: 'notes/a.md', type: 'file' },
    { name: 'sub', path: 'notes/sub', type: 'dir', children: [{ name: 'b.md', path: 'notes/sub/b.md', type: 'file' }] },
  ] },
  { name: 'INDEX.md', path: 'INDEX.md', type: 'file' },
]
const CREATED = {
  share: {
    token: 'T'.repeat(43), target: 'notes', targetType: 'dir', role: 'read', revoked: false, accessCount: 0,
    links: { path: `/ob_share/${'T'.repeat(43)}`, internal: `/ob_share/${'T'.repeat(43)}`, external: null },
  },
  password: null,
}
const SHARE_ROWS = [
  { token: 'D'.repeat(43), target: 'notes', targetType: 'dir', role: 'read', revoked: false, accessCount: 3,
    lastAccessAt: 1759999999999, links: { path: `/ob_share/${'D'.repeat(43)}`, internal: `/ob_share/${'D'.repeat(43)}`, external: null } },
  { token: 'F'.repeat(43), target: 'INDEX.md', targetType: 'file', role: 'read', revoked: true, accessCount: 0,
    lastAccessAt: null, links: { path: `/ob_share/${'F'.repeat(43)}`, internal: `/ob_share/${'F'.repeat(43)}`, external: null } },
]

function canRun() {
  if (!fs.existsSync(VITE_BIN)) return { ok: false, why: `vite 未安装（${VITE_BIN}）` }
  try {
    execFileSync('python3', ['-c', 'import playwright'], { stdio: 'ignore' })
  } catch { return { ok: false, why: 'python3 playwright 不可用（行为测试依赖真浏览器）' } }
  // 默认跑（2026-10-10 队长裁决）：本机实测链路可用，真浏览器全跑 0 skip。
  // 无浏览器/无图形环境可用 OW_BROWSER_E2E=0 显式关闭（诚实降级为 skip，不伪装成绿）。
  if (process.env.OW_BROWSER_E2E === '0') {
    return { ok: false, why: '显式关闭（OW_BROWSER_E2E=0）：跳过真浏览器行为测试' }
  }
  return { ok: true, why: '' }
}

const ENV = canRun()
let server = null
let PORT = 0
let BUILD_DIR = null
let DRIVER = null

/** 一次性构建预览产物（构建物 + 静态托管＝零预构建、零端口争用；口径同 web-context-menu-behavior.mjs） */
function buildPreview() {
  const outDir = path.join(HERE, '.tmp-c3-build')
  fs.rmSync(outDir, { recursive: true, force: true })
  const cfg = path.join(HERE, '.tmp-c3-vite.config.mjs')
  fs.writeFileSync(cfg, `import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  root: ${JSON.stringify(WEB)},
  base: './',
  plugins: [vue()],
  build: {
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: { input: ${JSON.stringify(HTML)} },
  },
})
`)
  execFileSync(VITE_BIN, ['build', '--config', cfg], { cwd: WEB, stdio: 'pipe', encoding: 'utf8' })
  fs.rmSync(cfg, { force: true })
  return outDir
}

async function serveDir(dir) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }
  const { createServer } = await import('node:http')
  const srv = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html'
    const abs = path.join(dir, rel)
    if (!abs.startsWith(dir) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404); res.end('not found'); return
    }
    res.writeHead(200, { 'content-type': mime[path.extname(abs)] ?? 'application/octet-stream' })
    fs.createReadStream(abs).pipe(res)
  })
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve))
  return { srv, port: srv.address().port }
}

function writeHarness() {
  const decl = Object.entries(SHARE_TOKEN_SNAPSHOT.light)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)};`).join('\n')
  fs.writeFileSync(HTML, `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>C3 behavior</title>
<style>:root {
${decl}
}</style></head>
<body><div id="app"></div>
<script>window.__C3 = { tree: ${JSON.stringify(TREE)}, created: ${JSON.stringify(CREATED)}, rows: ${JSON.stringify(SHARE_ROWS)}, calls: [] };</script>
<script type="module" src="/tmp-c3-behavior.js"></script>
</body></html>
`)
  // 真 App.vue 挂载 + fetch 拦截（假 /ob/ 后端：只提供树/分享列表/创建三个端点，行为与真路由同形）
  fs.writeFileSync(ENTRY, `import { createApp } from 'vue'
import App from './src/App.vue'
import './src/styles.css'

const J = (obj, status = 200) => Promise.resolve(new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json' },
}))
window.fetch = (url, init = {}) => {
  const u = String(url)
  window.__C3.calls.push((init.method ?? 'GET') + ' ' + u)
  if (u.includes('/ob/api/tree')) return J({ data: { nodes: window.__C3.tree } })
  if (u.includes('/ob/api/shares/create')) return J({ data: window.__C3.created })
  if (u.includes('/ob/api/shares')) return J({ data: { shares: window.__C3.rows } })
  if (u.includes('/ob/api/backlinks')) return J({ data: { backlinks: [] } })
  if (u.includes('/ob/api/share-settings')) return J({ data: { settings: { externalBaseUrl: '', lanHost: '' }, sharePort: null } })
  return J({ error: { code: 'not_found', message: 'stub: ' + u } }, 404)
}
window.localStorage.clear()
createApp(App).mount('#app')
`)
}

/** spawn 驱动（见 runScript 注释②）：实时收流，退出码非 0 或超时即带尾部输出失败 */
function runPython(py) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [py], { env: driverEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`驱动脚本超时 180s：\n${out.slice(-1500)}\n${err.slice(-1500)}`))
    }, 180000)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => {
      if (settled) return
      settled = true; clearTimeout(timer); reject(e)
    })
    child.on('exit', (code) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (code !== 0) reject(new Error(`驱动脚本退出码 ${code}：\n${out.slice(-1500)}\n${err.slice(-1500)}`))
      else resolve(out)
    })
  })
}

/** 剥代理环境变量（见 runScript 注释①：否则 Chromium 连不上本机 http 服务） */
function driverEnv() {
  const env = { ...process.env }
  for (const k of ['NODE_USE_ENV_PROXY', 'http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) {
    delete env[k]
  }
  return env
}

async function runScript(body) {
  const py = path.join(WEB, '.tmp-c3-driver-async.py')
  const script = `import json
from playwright.sync_api import sync_playwright
URL = ${JSON.stringify(`http://127.0.0.1:${PORT}/tmp-c3-behavior.html`)}
OUT = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(URL, wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_selector('.el-tree-node', timeout=60000)
    pg.wait_for_timeout(600)
${body}
    OUT['errors'] = errs[:8]
    b.close()
print('@@JSON@@' + json.dumps(OUT, ensure_ascii=False))
`
  fs.writeFileSync(py, script)
  DRIVER = py
  const out = await runPython(py)
  const i = out.indexOf('@@JSON@@')
  assert.ok(i >= 0, `驱动脚本未输出 JSON 哨兵：\n${out.slice(-2000)}`)
  return JSON.parse(out.slice(i + 8))
}

/** 打开「目录」行右键 → 点「分享」（真 DOM 事件，与用户操作同路径） */
const OPEN_DIR_SHARE = `
    pg.locator('.el-tree-node__expand-icon').first.click()
    pg.wait_for_timeout(400)
    pg.evaluate("()=>{const els=document.querySelectorAll('.el-tree-node');els[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:200}))}")
    pg.wait_for_timeout(400)
    pg.locator('.ob-cm-item', has_text='分享').first.click()
    pg.wait_for_timeout(700)
`
const DIALOG_STATE = `
    dlg = pg.locator('.el-dialog').last
    OUT['dialogVisible'] = dlg.is_visible()
    OUT['dialogTarget'] = pg.evaluate("()=>{const ds=[...document.querySelectorAll('.el-dialog')].filter(d=>d.offsetParent!==null);const d=ds[ds.length-1];const i=d?.querySelector('input');return i? i.value : null}")
    # el-menu 的激活态是 .is-active（无 aria-current）——按类名取，不按属性取
    OUT['panelActive'] = pg.evaluate("()=>[...document.querySelectorAll('.el-menu-item')].filter(e=>e.className.includes('is-active')).map(e=>e.textContent.trim())")
`

test('行为：环境就绪（vite + chromium 可起）', { skip: !ENV.ok }, () => {
  assert.ok(ENV.ok, ENV.why)
})

// ── ① 目录可分享：树右键「分享」→ 分享面板 + 新建弹层「目标路径」= 目录路径（C3 空缝回归锁）────
test('行为（真浏览器）：目录右键分享 → 弹层目标=目录路径 + 目录提示 + 面板已切到分享', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
${OPEN_DIR_SHARE}
${DIALOG_STATE}
    OUT['hint'] = pg.locator('.ob-hint').all_inner_texts()
    OUT['calls'] = pg.evaluate('window.__C3.calls')
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.equal(r.dialogVisible, true, '右键分享 → 新建分享弹层已开')
  assert.equal(r.dialogTarget, 'notes', '弹层目标路径=被右键的目录（空缝缺陷回归锁：旧实现此值为空串或笔记路径）')
  assert.deepEqual(r.panelActive, ['分享'], '树右键分享已把中央面板切到「分享」（App→面板编排通）')
  assert.ok(r.hint.some((t) => t.includes('当前待分享=目录')), `面板目录形态提示在场：${JSON.stringify(r.hint)}`)
  assert.ok(r.calls.some((c) => c.includes('/ob/api/shares')), '分享面板已拉分享列表（激活即刷新）')
})

// ── ② 目录分享创建：POST 载荷 target=目录 + 结果弹层展示服务端下发链接（前端零拼接）────
test('行为（真浏览器）：创建目录分享 → 载荷 target=notes + 结果弹层链接受服务端下发', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
${OPEN_DIR_SHARE}
    pg.locator('.el-dialog').last.locator('button', has_text='创建').click()
    pg.wait_for_timeout(800)
    OUT['calls'] = pg.evaluate('window.__C3.calls')
    OUT['resultTitle'] = pg.evaluate("()=>{const ds=[...document.querySelectorAll('.el-dialog')].filter(d=>d.offsetParent!==null);return ds.map(d=>(d.querySelector('.el-dialog__title')||{}).textContent||'')}")
    OUT['links'] = pg.evaluate("()=>[...document.querySelectorAll('.ob-share-link-url')].map(e=>e.textContent)")
    OUT['resultTarget'] = pg.evaluate("()=>[...document.querySelectorAll('.ob-share-target')].map(e=>e.textContent)")
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.ok(r.calls.some((c) => c.startsWith('POST /ob/api/shares/create')), '创建走了既有 shares/create 端点（零第二套创建流程）')
  assert.ok(r.links.includes(`/ob_share/${'T'.repeat(43)}`), `结果弹层展示服务端下发链接（前端零拼接）：${JSON.stringify(r.links)}`)
  assert.ok(r.resultTarget.includes('notes'), '结果弹层目标=目录路径')
})

// ── ③ 管理面 dir 形态：目标列带「目录」标签、dir 行仍可撤销；笔记行零回归 ────────────────
test('行为（真浏览器）：管理面 dir/file 两形（目录标签+链接+撤销）、笔记形态不变', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
    pg.evaluate("()=>{const b=[...document.querySelectorAll('.el-menu-item')].find(x=>x.textContent.trim()==='分享');b.click()}")
    pg.wait_for_timeout(900)
    OUT['rows'] = pg.evaluate("()=>[...document.querySelectorAll('.el-table__body tr')].map(tr=>tr.innerText.replace(/\\\\n+/g,' | '))")
    OUT['tags'] = pg.evaluate("()=>[...document.querySelectorAll('.el-table__body .el-tag')].map(e=>e.textContent.trim())")
    OUT['rowCount'] = pg.evaluate("()=>document.querySelectorAll('.el-table__body tr').length")
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.equal(r.rowCount, 2, '两条分享各一行（dir + file）')
  assert.deepEqual(r.tags, ['目录', '笔记'], '形态标签：目录行=「目录」、笔记行=「笔记」（不是「笔记」写死）')
  assert.ok(r.rows[0].includes('notes') && r.rows[0].includes('3'), '目录行展示路径与查看计数（同链路数据面）')
  assert.ok(r.rows[0].includes(`/ob_share/${'D'.repeat(43)}`), '目录行展示服务端下发链接（可复制口径同笔记）')
  assert.ok(r.rows[1].includes('已撤销'), '笔记行状态派生零回归（revoked 仍为「已撤销」）')
})

test.before(async () => {
  if (!ENV.ok) return
  writeHarness()
  BUILD_DIR = buildPreview()
  const srv = await serveDir(BUILD_DIR)
  server = srv.srv
  PORT = srv.port
})

test.after(() => {
  try { server?.close() } catch { /* 收尾不炸 */ }
  for (const f of [HTML, ENTRY, DRIVER]) {
    try { if (f) fs.rmSync(f, { force: true }) } catch { /* 清理失败不 fail */ }
  }
  try { if (BUILD_DIR) fs.rmSync(BUILD_DIR, { recursive: true, force: true }) } catch { /* 同上 */ }
})
