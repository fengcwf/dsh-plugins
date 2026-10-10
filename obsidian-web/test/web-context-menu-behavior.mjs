// 右键菜单**行为测试**（C2 卡 2026-10-09）：真 vite dev server + 真 chromium + 真 Vue 组件
// （零 mock 组件、零 stub 事件——DOM 事件与键盘都是浏览器原生派发）。
// 为什么必须有它：web-context-menu.test.mjs 锁的是纯函数与源码形，**锁不住运行时缝**——
// C2 的 Escape 失效缺陷（二次打开必现、纯函数全绿）正是只有真浏览器能抓到（教训同 FX-INV-6 口径）。
// 环境依赖：vite（devDependencies 已在）+ Playwright/Chromium（本机已装）；
// 依赖缺失或浏览器不可起 → **整文件 skip**（不 fail、不弱化既有断言——新测试不得让 CI 变红）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SHARE_TOKEN_SNAPSHOT } from '../lib/share-theme.js'

const WEB = fileURLToPath(new URL('../web', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../node_modules/.bin/vite', import.meta.url))
const HTML = path.join(WEB, 'tmp-c2-behavior.html')
const ENTRY = path.join(WEB, 'tmp-c2-behavior.js')

const MODEL = [
  { key: 'notes', label: 'notes', type: 'dir', children: [
    { key: 'notes/a.md', label: 'a.md', type: 'file' },
    { key: 'notes/sub', label: 'sub', type: 'dir', children: [{ key: 'notes/sub/b.md', label: 'b.md', type: 'file' }] },
  ] },
  { key: 'INDEX.md', label: 'INDEX.md', type: 'file' },
]

// ── 环境探测（缺依赖=skip 整文件，不 fail）────────────────────────────────────
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
  // 显式门（2026-10-10 修）：本机实测 vite+chromium 链路起不来（就绪探测 60s 超时），
  // 依赖「装了」不等于「跑得起来」。默认 skip，避免以环境故障冒充产品缺陷；
  return { ok: true, why: '' }
}

let ENV = canRun()
let server = null
let PORT = 0
let DRIVER = null // python3 驱动脚本路径（跑完随 .tmp-* 清理）
let BUILD_DIR = null // 预览构建物目录（跑完清理）
const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 起 vite dev server（strictPort，端口 0 先探空闲） */
/**
 * 构建预览 bundle（一次性）：vite build 出独立产物到 test/.tmp-c2-build/。
 * 为什么不是 dev server（2026-10-09 实测教训）：dev server 首跑要做依赖预构建（冷启动 30s+），
 * 叠加并发下 chromium 启动抖动 → 用例 30s 级超时假红（错因是环境不是被测行为）。
 * 构建物 + 静态托管 = 零预构建、零端口争用、秒级加载（IL-2：行为判据必须可复现）。
 */
function buildPreview() {
  const outDir = path.join(HERE, '.tmp-c2-build')
  fs.rmSync(outDir, { recursive: true, force: true })
  const cfg = path.join(HERE, '.tmp-c2-vite.config.mjs')
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

/** 静态托管构建物（Node 内置 http，零第三方依赖） */
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

/** 就绪探测：静态服务探活 + 首屏树渲染完成（把「环境启动」与「被测行为」解耦） */
async function waitReady() {
  const url = `http://127.0.0.1:${PORT}/tmp-c2-behavior.html`
  const deadline = Date.now() + 30000
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) break
    } catch { /* 未就绪，继续等 */ }
    if (Date.now() > deadline) throw new Error(`静态服务就绪探测超时 30s：${url}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  const py = path.join(HERE, '.tmp-c2-ready.py')
  fs.writeFileSync(py, `from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(${JSON.stringify(url)}, wait_until='networkidle', timeout=60000)
    pg.wait_for_selector('.el-tree-node', timeout=60000)
    b.close()
print('ready')
`)
  try {
    await runPython(py, 90000)
  } finally {
    fs.rmSync(py, { force: true })
  }
}

/**
 * spawn 派发驱动（本机实测 2026-08→2026-10 教训，2026-10-10 与 C3 卡同源修复）：
 * `execFileSync`/`spawnSync` **管道 stdout** 时，Chromium 驱动在本环境会死锁——
 * 同 server、同脚本、同 env 下 spawn 全 OK 而 spawnSync 全挂（C3 卡实测 2/2）。
 * 且 `NODE_USE_ENV_PROXY=1` + `http_proxy` 会把子进程到 127.0.0.1 的连接导向代理
 * → goto 连上却永不响应。两者都在此处收口，测试基建不再受宿主代理/同步管道影响。
 */
function runPython(py, timeoutMs) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    for (const k of ['NODE_USE_ENV_PROXY', 'http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete env[k]
    const child = spawn('python3', [py], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`驱动脚本超时 ${timeoutMs}ms：\n${out.slice(-1500)}\n${err.slice(-1500)}`))
    }, timeoutMs)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e) })
    child.on('exit', (code) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (code !== 0) reject(new Error(`驱动脚本退出码 ${code}：\n${out.slice(-1500)}\n${err.slice(-1500)}`))
      else resolve(out)
    })
  })
}

/** 写预览入口（真实组件 + fixture 模型 + dsw token 快照，零业务后端） */
function writeHarness() {
  const decl = Object.entries(SHARE_TOKEN_SNAPSHOT.light)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)};`).join('\n')
  fs.writeFileSync(HTML, `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>C2 behavior</title>
<style>:root {
${decl}
}</style></head>
<body><div id="app"></div>
<script>window.__C2_MODEL = ${JSON.stringify(MODEL)};</script>
<script type="module" src="/tmp-c2-behavior.js"></script>
</body></html>
`)
  fs.writeFileSync(ENTRY, `import { createApp, h } from 'vue'
import NoteTree from './src/components/NoteTree.vue'
import './src/styles.css'
window.__c2 = { last: null }
createApp({
  render: () => h('div', { class: 'ob-shell', style: 'height:100vh' }, [
    h('div'),
    h(NoteTree, {
      model: window.__C2_MODEL,
      selected: '',
      expanded: ['notes'],
      onDownload: (n) => { window.__c2.last = 'download:' + n.key },
      onRename: (n) => { window.__c2.last = 'rename:' + n.key },
      onDelete: (n) => { window.__c2.last = 'delete:' + n.key },
      onShare: (n) => { window.__c2.last = 'share:' + n.key },
    }),
    h('div'), h('div'),
  ]),
}).mount('#app')
`)
}

/**
 * 跑一段 python3+playwright 剧本，返回剧本打印的 JSON。
 * 剧本自己派发真 DOM 事件与真键盘（page.mouse / page.keyboard），零 stub。
 */
async function runScript(body) {
  const script = `import json, sys
from playwright.sync_api import sync_playwright
URL = ${JSON.stringify(`http://127.0.0.1:${PORT}/tmp-c2-behavior.html`)}
OUT = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1280,'height':800})
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(900)
${body}
    OUT['errors'] = errs[:8]
    b.close()
print('@@JSON@@' + json.dumps(OUT, ensure_ascii=False))
`
  const py = path.join(WEB, '.tmp-c2-driver.py')
  fs.writeFileSync(py, script)
  DRIVER = py
  const out = await runPython(py, 180000)
  const i = out.indexOf('@@JSON@@')
  assert.ok(i >= 0, `驱动脚本未输出 JSON 哨兵：\n${out.slice(-2000)}`)
  return JSON.parse(out.slice(i + 8))
}

const DISPATCH = `    def open_at(idx, x, y):
        pg.evaluate("([i,x,y])=>{const els=document.querySelectorAll('.el-tree-node');els[i].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:y}))}", [idx, x, y])
        pg.wait_for_timeout(500)
    def vis():
        return pg.locator('.ob-cm').is_visible()
    def active():
        return pg.evaluate("(document.activeElement?.textContent||'').trim()")
`

test('行为：环境就绪（vite + chromium 可起）', { skip: !ENV.ok }, () => {
  assert.ok(ENV.ok, ENV.why)
})

test('行为（真浏览器）：右键唤出菜单 + role=menu/menuitem + 首项聚焦', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
${DISPATCH}
    pg.locator('.el-tree-node__expand-icon').first.click()
    pg.wait_for_timeout(400)
    open_at(1, 400, 260)
    OUT['visible'] = vis()
    OUT['role'] = pg.locator('.ob-cm').get_attribute('role')
    OUT['items'] = pg.locator('.ob-cm-item').all_inner_texts()
    OUT['active'] = active()
    OUT['box'] = pg.locator('.ob-cm').bounding_box()
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.equal(r.visible, true, '右键唤出：菜单可见')
  assert.equal(r.role, 'menu', '菜单根 role=menu')
  assert.deepEqual(r.items, ['改名/移动', '下载', '删除', '分享'], '文件行=四项（含占位分享）')
  assert.equal(r.active, '改名/移动', '打开即聚焦首项（键盘可达性起点）')
  assert.equal(r.box.x, 400, '无溢出时落在指针处（left=指针 x）')
})

test('行为（真浏览器）：方向键/Home/End 环移 + Enter 触发上抛 + Escape 关闭（含二次打开回归）', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
${DISPATCH}
    pg.locator('.el-tree-node__expand-icon').first.click()
    pg.wait_for_timeout(400)
    # 第一次打开（文件行，四项）
    open_at(1, 400, 260)
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(150)
    OUT['down1'] = active()
    pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(150)
    OUT['up1'] = active()
    pg.keyboard.press('End'); pg.wait_for_timeout(150)
    OUT['end'] = active()
    pg.keyboard.press('Home'); pg.wait_for_timeout(150)
    OUT['home'] = active()
    pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(150)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    OUT['afterEnter'] = pg.evaluate('window.__c2.last')
    OUT['closedAfterEnter'] = not vis()
    # 第二次打开（**目录行** → 项集 4→3，旧实现焦点失效链在此触发）
    open_at(0, 400, 260)
    OUT['reopenVisible'] = vis()
    OUT['reopenItems'] = pg.locator('.ob-cm-item').all_inner_texts()
    OUT['reopenActive'] = active()
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    OUT['escClosed'] = not vis()
    # 第三次：文件行再开再 Escape（项集 3→4 反向变化同样要通）
    open_at(1, 400, 260)
    OUT['thirdActive'] = active()
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    OUT['thirdEsc'] = not vis()
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.equal(r.down1, '下载', 'ArrowDown → 下一项')
  assert.equal(r.up1, '改名/移动', 'ArrowUp → 上一项')
  assert.equal(r.end, '分享', 'End → 末项')
  assert.equal(r.home, '改名/移动', 'Home → 首项')
  assert.equal(r.afterEnter, 'download:notes/a.md', 'Enter 在当前项上抛（业务缝通）')
  assert.equal(r.closedAfterEnter, true, '选中即关闭')
  assert.deepEqual(r.reopenItems, ['下载', '删除', '分享'], '目录行=三项（无改名，契约同界）')
  assert.equal(r.reopenActive, '下载', '二次打开仍聚焦首项（bugfix：索引闭包陈旧曾使其失效）')
  assert.equal(r.escClosed, true, '二次打开后 Escape 仍能关闭（bugfix 回归锁）')
  assert.equal(r.thirdActive, '改名/移动', '三次打开（项集 3→4）焦点正确')
  assert.equal(r.thirdEsc, true, '三次打开 Escape 关闭')
})

test('行为（真浏览器）：点击外部关闭 + 视口边缘翻转（右下角指针）', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
${DISPATCH}
    pg.locator('.el-tree-node__expand-icon').first.click()
    pg.wait_for_timeout(400)
    open_at(1, 400, 260)
    pg.mouse.click(900, 700)
    pg.wait_for_timeout(400)
    OUT['outsideClosed'] = not vis()
    # 边缘翻转：指针贴视口右下角 (1272, 792)
    open_at(1, 1272, 792)
    OUT['flipBox'] = pg.locator('.ob-cm').bounding_box()
    OUT['viewport'] = [1280, 800]
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # 仅右缘 / 仅下缘
    open_at(1, 1272, 200)
    OUT['flipX'] = pg.locator('.ob-cm').bounding_box()
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    open_at(1, 300, 792)
    OUT['flipY'] = pg.locator('.ob-cm').bounding_box()
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.equal(r.outsideClosed, true, '点击外部关闭')
  const f = r.flipBox
  assert.ok(f.x + f.width <= 1280, `翻转后右缘不越界：${f.x}+${f.width}`)
  assert.ok(f.y + f.height <= 800, `翻转后下缘不越界：${f.y}+${f.height}`)
  assert.ok(f.x < 1272 && f.y < 792, '确实翻转到指针左/上侧（非原样溢出）')
  assert.ok(r.flipX.x + r.flipX.width <= 1280, '仅右缘溢出：X 翻转')
  assert.equal(r.flipX.y, 200, '仅右缘溢出：Y 不动')
  assert.ok(r.flipY.y + r.flipY.height <= 800, '仅下缘溢出：Y 翻转')
  assert.equal(r.flipY.x, 300, '仅下缘溢出：X 不动')
})

test('行为（真浏览器）：目录行无改名项 + 分享项上抛（占位，不接后端）', { skip: !ENV.ok }, async () => {
  const r = await runScript(`
${DISPATCH}
    pg.locator('.el-tree-node__expand-icon').first.click()
    pg.wait_for_timeout(400)
    open_at(0, 400, 260)
    OUT['items'] = pg.locator('.ob-cm-item').all_inner_texts()
    # 点「分享」项：用文本定位器一次命中（循环 nth 重查在菜单重渲染后会失焦报错）
    pg.locator('.ob-cm-item', has_text='分享').first.click()
    pg.wait_for_timeout(500)
    OUT['share'] = pg.evaluate('window.__c2.last')
    OUT['closed'] = not vis()
`)
  assert.deepEqual(r.errors, [], `控制台零错误：${JSON.stringify(r.errors)}`)
  assert.deepEqual(r.items, ['下载', '删除', '分享'], '目录行三项（改名不出=服务端契约同界）')
  assert.equal(r.share, 'share:notes', '分享项 emit action=share（C2 只出缝不接后端）')
  assert.equal(r.closed, true, '点击项后关闭')
})

// ── 生命周期：整文件前后各起停一次 vite（避免每 test 重启拖慢）──────────────────
test.before(async () => {
  ENV = canRun()
  if (!ENV.ok) return
  writeHarness()
  BUILD_DIR = buildPreview()
  const srv = await serveDir(BUILD_DIR)
  server = srv.srv
  PORT = srv.port
  await waitReady()
})

test.after(() => {
  try { server?.close() } catch { /* 收尾不炸 */ }
  for (const f of [HTML, ENTRY, DRIVER]) {
    try { if (f) fs.rmSync(f, { force: true }) } catch { /* 清理失败不 fail */ }
  }
  try { if (BUILD_DIR) fs.rmSync(BUILD_DIR, { recursive: true, force: true }) } catch { /* 同上 */ }
})
