// client-install 单测（Task 4）—— 被测件：lib/client.install.js（安装控件 + 状态机，兄弟 chunk）+ lib/client.js 接入缝。
// 契约（task-4-brief 实现要点逐条 + DESIGN.md 增量「新控件与状态语义」1-6 逐字）：
//   ① chunk 形（跨卡契约 1）：window.__ModuleLoader__.load({id:'dsh-rtk-kit', chunk:'client.install.js', factory})，
//      chunk 名过宿主白名单 /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/；client.js 经 require.async('./client.install.js') 惰性取用；
//      require 白名单仅 react（零第三方 UI 库）。
//   ② 数据面（跨卡契约 2）：INSTALL_URL='api/rtk-kit/install'（与 lib/doctor-routes.js 导出常量锁等值，文档相对无前导斜杠）；
//      成功信封恰 {data:{record,verify}}；失败信封 {error:{code,message[,hint],verify?,record?,backupPath?}}；
//      INSTALL_ERROR_STATUS 6 分类码 + reinstall-in-progress→409 重入静默，前端 code 分派单源（禁第二份映射表）。
//   ③ 版本区数据（跨卡契约 3）：installSupported 驱动按钮门槛（false=不出按钮 + --warning 手动安装提示）；lastInstall 驱动记录行。
//   ④ 状态机（跨卡契约 4）：idle → running → ok | fail；running=按钮禁用+「安装中…」+阶段小字（下载 / 校验 / 落盘）+面板全按钮禁用（INV-5 单飞）；
//      ok=绿 ✓「重装完成 · rtk x.y.z」+自动复检刷新面板；fail=红条分类文案+「重试」+可展开 <details>（12px mono，含 .verify/.record/backupPath，R-3）。
//   ⑤ 触发面（US-1/D7）：真缺失/损坏/不可执行三态出故障条+「重新安装」；「在位但看不见」不出按钮；正常态零故障条零按钮。
//   ⑥ 记录行（US-5/P1）：版本区底部 12px --text-secondary「最近重装：<时间> · <版本> · 成功/失败」。
//   ⑦ 红线（跨卡契约 5）：零新增色板（DESIGN 基表 + 故障条底 rgba(216,57,49,0.08)）；每文件 ≤300 行；零二次确认弹窗。
// 测试红线（INV-4/INV-8）：fetch 全注入假实现（exports.__fetch 插桩），零真实网络、零真 home、零真实 rtk 执行。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require.async/ctx.slots/React 钩子/fetch），
// 被测逻辑=状态机、触发面与控件形本身，全真跑真断言（mini React runtime 驱动挂载/重渲染）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTALL_URL, INSTALL_ERROR_STATUS } from '../lib/doctor-routes.js'
import { getVersion } from '../lib/doctor.js'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const CHUNK_PATH = fileURLToPath(new URL('../lib/client.install.js', import.meta.url))
const source = fs.readFileSync(CLIENT_PATH, 'utf8')
const chunkSource = fs.existsSync(CHUNK_PATH) ? fs.readFileSync(CHUNK_PATH, 'utf8') : ''

// ── 工厂形加载 + mini React runtime（最小宿主形；client.js + 兄弟 chunk 同 runtime） ──────────

function loadPanel() {
  const loaded = []
  const chunkRegs = []
  const holder = { chunk: null }
  const runtime = { hooks: [], cursor: 0, pending: [], tree: null, renders: 0, Component: null, props: null }
  function expand(node) {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') return expand(node.type(node.props))
    const out = { type: node.type, props: { ...node.props } }
    if ('children' in out.props) out.props.children = expand(out.props.children)
    return out
  }
  runtime.render = () => {
    runtime.cursor = 0
    runtime.tree = expand(runtime.Component(runtime.props))
    runtime.renders += 1
  }
  runtime.flushEffects = () => {
    const list = runtime.pending.splice(0)
    for (const fn of list) fn()
  }
  runtime.mount = (Component, props) => {
    runtime.Component = Component
    runtime.props = props ?? {}
    runtime.render()
    runtime.flushEffects()
  }
  const reactStub = {
    createElement: (type, props, ...children) => {
      const merged = { ...(props ?? {}) }
      if (children.length > 0) merged.children = children.length === 1 ? children[0] : children
      return { type, props: merged }
    },
    useState: (init) => {
      const i = runtime.cursor++
      if (!(i in runtime.hooks)) runtime.hooks[i] = init
      return [runtime.hooks[i], (next) => {
        runtime.hooks[i] = typeof next === 'function' ? next(runtime.hooks[i]) : next
        runtime.render()
      }]
    },
    useEffect: (fn, deps) => {
      const i = runtime.cursor++
      const prev = runtime.hooks[i]
      const changed = prev === undefined
        || !deps || deps.length !== prev.deps.length || deps.some((d, k) => d !== prev.deps[k])
      runtime.hooks[i] = { fn, deps: deps ?? [] }
      if (changed) runtime.pending.push(fn)
    },
    useRef: (init) => {
      const i = runtime.cursor++
      if (!(i in runtime.hooks)) runtime.hooks[i] = { current: init }
      return runtime.hooks[i]
    },
  }
  const req = (name) => {
    if (name === 'react') return reactStub
    throw new Error(`unexpected require: ${name}`) // require 白名单断言执行面：非 react 一律炸
  }
  req.async = (spec) => {
    if (spec === './client.install.js' && holder.chunk) return Promise.resolve(holder.chunk)
    return Promise.reject(new Error(`unexpected chunk: ${spec}`))
  }
  const fn = new Function('window', source)
  fn({ __ModuleLoader__: { load: (m) => loaded.push(m) } })
  assert.equal(loaded.length, 1, 'client.js 必须登记一个模块')
  const mod = loaded[0].factory(req)
  if (chunkSource) {
    const cfn = new Function('window', chunkSource)
    cfn({ __ModuleLoader__: { load: (m) => chunkRegs.push(m) } })
    const reg = chunkRegs.find((r) => r.chunk === 'client.install.js')
    if (reg) holder.chunk = reg.factory(req)
  }
  return { loaded, chunkRegs, mod, chunk: holder.chunk, runtime }
}

/** 最小 ctx（slots 缝承接注册契约） */
function mkCtx(registered, injected) {
  return {
    slots: {
      inject: (name, setup) => { injected.push(name); return setup() },
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
}

/** 树内找全部匹配节点（数组 children 也下钻） */
function findAll(node, pred, out = []) {
  if (Array.isArray(node)) {
    for (const c of node) findAll(c, pred, out)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (typeof node.type === 'string' && pred(node)) out.push(node)
  if (node.props && node.props.children !== undefined) findAll(node.props.children, pred, out)
  return out
}
function find(node, pred) { return findAll(node, pred)[0] ?? null }
function texts(node, out = []) {
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { for (const c of node) texts(c, out); return out }
  if (node && typeof node === 'object' && node.props && node.props.children !== undefined) texts(node.props.children, out)
  return out
}
function textOf(tree) { return texts(tree).join(' ') }

const button = (tree, action) => find(tree, (n) => n.type === 'button' && n.props['data-rtk-action'] === action)
const segButton = (tree, period) => find(tree, (n) => n.type === 'button' && n.props['data-rtk-period'] === period)
const installRow = (tree, kind) => find(tree, (n) => n.props && n.props['data-rtk-install'] === kind)

/** 注入假 fetch（记录调用；路由表回信封；零真实网络/零真实 rtk——INV-4/INV-8 红线） */
function mkFetch(routes) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    const hit = routes[url]
    const body = typeof hit === 'function' ? await hit() : hit
    return { json: async () => body }
  }
  fn.calls = calls
  return fn
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) }

/** 挂载设置节（注册回调取组件 → mini runtime 挂载 → 首轮 effects 执行） */
function mountSection(routes) {
  const { mod, chunk, runtime } = loadPanel()
  const fake = mkFetch(routes)
  mod.__fetch = fake
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  const entry = registered.find((r) => r.decl.name === 'settings.section')
  runtime.mount(entry.component, { close: () => {} })
  return { mod, chunk, runtime, fake }
}

// ── 夹具（信封形照 Task 2/3 契约：成功 {data}；失败 {error:{code,message[,hint],verify?,record?,backupPath?}}） ──

const GAIN_OK = { data: { summary: { total_commands: 10, total_input: 100, total_output: 50, total_saved: 50, avg_savings_pct: 50 }, daily: [], weekly: [], monthly: [] } }
const GAIN_MISSING = { error: { code: 'RTK_UNAVAILABLE', message: 'rtk 执行失败（spawn 级）：ENOENT', hint: 'rtk 二进制缺失：请先安装 rtk' } }
const INSTALL_REC_OK = { time: '2026-10-04T12:00:00.000Z', version: '0.50.0', source: 'https://example.invalid/rtk.tar.gz', ok: true, error: null }
const INSTALL_REC_FAIL = { time: '2026-10-04T11:00:00.000Z', version: null, source: 'https://example.invalid/rtk.tar.gz', ok: false, error: 'CHECKSUM_MISMATCH' }
const VERIFY_OK = { available: true, version: '0.50.0', path: '/root/.local/bin/rtk', hint: null }
const VERSION_OK = { data: { available: true, version: '0.49.0', path: '/root/.local/bin/rtk', hint: null, lastInstall: null, installSupported: true } }
const VERSION_RECHECK = { data: { available: true, version: '0.50.0', path: '/root/.local/bin/rtk', hint: null, lastInstall: INSTALL_REC_OK, installSupported: true } }
const VERSION_GONE = { data: { available: false, version: null, path: '/root/.local/bin/rtk', hint: 'rtk 二进制缺失：请先安装 rtk', lastInstall: null, installSupported: true } }
const VERSION_BROKEN = { data: { available: false, version: null, path: '/root/.local/bin/rtk', hint: null, lastInstall: null, installSupported: true } }
const VERSION_CORRUPT = { data: { available: true, version: null, path: '/root/.local/bin/rtk', hint: null, lastInstall: null, installSupported: true } }
const VERSION_UNSUPPORTED = { data: { available: false, version: null, path: '/root/.local/bin/rtk', hint: 'rtk 二进制缺失：请先安装 rtk', lastInstall: null, installSupported: false } }
// F-FINAL-1(ii)（Ruling 2026-10-04）：installTargetMatch=引擎落点能否满足配置位（false=显式自定义路径缺失且≠落点位 → 按钮不出+手动提示）
const TARGET_MISMATCH_TEXT = 'rtkBin 指向自定义路径且该路径缺失，一键重装只落 ~/.local/bin/rtk（不满足配置位），请手动安装到该路径'
const VERSION_TARGET_MISMATCH = { data: { available: false, version: null, path: '/opt/custom/rtk', hint: 'rtk 二进制缺失：请先安装 rtk', lastInstall: null, installSupported: true, installTargetMatch: false } }
const VERSION_GONE_MATCH = { data: { ...VERSION_GONE.data, installTargetMatch: true } }
const VERSION_ERR = { error: { code: 'RTK_TIMEOUT', message: 'rtk 执行超时（5000ms）' } }
const HEALTH_OK = { data: [{ id: 'binary-exec', label: '二进制可执行', status: 'pass', detail: 'rtk 可执行' }] }

const INSTALL_OK = { data: { record: INSTALL_REC_OK, verify: VERIFY_OK } }
const INSTALL_FAIL_DOWNLOAD = {
  error: {
    code: 'DOWNLOAD_FAILED', message: '下载 rtk 失败：HTTP 502',
    verify: { available: false, version: null, path: '/root/.local/bin/rtk', hint: null },
    record: INSTALL_REC_FAIL, backupPath: '/root/.local/bin/rtk.bak.1759560000',
  },
}
const INSTALL_FAIL_REENTRY = { error: { code: 'reinstall-in-progress', message: '重装任务进行中（互斥单飞）' } }

// ── ① chunk 加载形（跨卡契约 1） ─────────────────────────────────────────────

test('chunk 加载形：__ModuleLoader__ 注册 id=dsh-rtk-kit + chunk=client.install.js（过宿主 CLIENT_CHUNK 白名单）', () => {
  const { chunkRegs, chunk } = loadPanel()
  const reg = chunkRegs.find((r) => r.chunk === 'client.install.js')
  assert.ok(reg, 'client.install.js 应有 __ModuleLoader__ 注册')
  assert.equal(reg.id, 'dsh-rtk-kit', 'chunk 注册 id=包名')
  assert.equal(typeof reg.factory, 'function')
  assert.match('client.install.js', /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/, 'chunk 名过宿主白名单')
  assert.ok(chunk, 'chunk 工厂可跑（无副作用炸）')
  for (const fn of ['installNeeded', 'runInstall', 'classifyInstallError', 'renderInstallRow', 'renderRecordRow']) {
    assert.equal(typeof chunk[fn], 'function', `exports 面缺 ${fn}`)
  }
  assert.equal(typeof chunk.INSTALL_URL, 'string')
})

test('兄弟 chunk 引用形：client.js 经 require.async("./client.install.js") 惰性取用（零构建多 chunk 先例形）', () => {
  assert.ok(source.includes("require.async("), 'client.js 应经 require.async 取兄弟 chunk')
  assert.ok(source.includes("'./client.install.js'"), 'chunk 引用 ./client.install.js')
})

// ── ② 数据面（跨卡契约 2） ──────────────────────────────────────────────────

test('数据面常量锁：chunk INSTALL_URL 与 doctor-routes 导出常量等值（文档相对无前导斜杠，issue #1707）', () => {
  const { chunk } = loadPanel()
  assert.equal(chunk.INSTALL_URL, INSTALL_URL, '前端常量与服务端常量锁等值')
  assert.equal(chunk.INSTALL_URL, 'api/rtk-kit/install')
  assert.ok(!chunk.INSTALL_URL.startsWith('/'), '文档相对（无前导斜杠）')
})

test('fetch 合约：runInstall 走 POST api/rtk-kit/install（body {} 服务端不读），成功信封恰读 {data:{record,verify}}', async () => {
  const { chunk } = loadPanel()
  const fake = mkFetch({ 'api/rtk-kit/install': INSTALL_OK })
  const out = await chunk.runInstall({ fetch: fake })
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].url, 'api/rtk-kit/install')
  assert.equal(fake.calls[0].init.method, 'POST')
  assert.equal(fake.calls[0].init.body, '{}')
  assert.equal(out.outcome, 'ok')
  assert.deepEqual(out.record, INSTALL_REC_OK, '成功信封 record')
  assert.deepEqual(out.verify, VERIFY_OK, '成功信封 verify')
})

test('code 分派单源：INSTALL_ERROR_STATUS 全键在 chunk 分派；client.js 零第二份 code→文案映射表', () => {
  const { chunk } = loadPanel()
  assert.equal(chunk.classifyInstallError({ code: 'DOWNLOAD_FAILED', message: 'x' }).stage, '下载')
  assert.equal(chunk.classifyInstallError({ code: 'CHECKSUM_MISMATCH', message: 'x' }).stage, '校验')
  for (const code of ['EXTRACT_FAILED', 'WRITE_FAILED', 'VERIFY_FAILED']) {
    assert.equal(chunk.classifyInstallError({ code, message: 'x' }).stage, '落盘', code + ' 归落盘类')
  }
  assert.equal(chunk.classifyInstallError({ code: 'PLATFORM_UNSUPPORTED', message: 'x' }).unsupported, true)
  assert.equal(chunk.classifyInstallError({ code: 'reinstall-in-progress', message: 'x' }).silent, true, '409 重入静默')
  assert.equal(chunk.classifyInstallError({ code: 'RTK_ERROR', message: 'x' }).stage, null, '未分类码走通用文案')
  // 服务端分类码面全覆盖（keys=6 分类码 + 重入）
  assert.deepEqual([...new Set(Object.keys(INSTALL_ERROR_STATUS))].sort(),
    ['CHECKSUM_MISMATCH', 'DOWNLOAD_FAILED', 'EXTRACT_FAILED', 'PLATFORM_UNSUPPORTED', 'VERIFY_FAILED', 'WRITE_FAILED', 'reinstall-in-progress'].sort())
  // 单源（禁第二份映射表）：client.js 不含任何分类码字面
  for (const code of Object.keys(INSTALL_ERROR_STATUS)) {
    assert.ok(!source.includes(code), `client.js 不应含分类码字面 ${code}（映射单源=client.install.js）`)
  }
})

// ── ③ 触发面（US-1 / D7 / INV-6） ───────────────────────────────────────────

test('US-1/D7 触发面（单元）：真缺失/损坏/不可执行三态触发；正常态与「在位但看不见」不触发', () => {
  const { chunk } = loadPanel()
  const idle = { status: 'idle', data: null, error: null }
  const gainMiss = { status: 'error', error: { kind: 'missing', text: 'x' } }
  const gainErr = { status: 'error', error: { kind: 'error', text: 'x' } }
  assert.equal(chunk.installNeeded({ status: 'ok', data: { available: false, version: null, hint: 'h' } }, idle), true, '真缺失触发')
  assert.equal(chunk.installNeeded({ status: 'ok', data: { available: false, version: null, hint: null } }, idle), true, '损坏/不可执行（found 但执行失败）触发')
  assert.equal(chunk.installNeeded({ status: 'ok', data: { available: true, version: null } }, idle), true, '损坏（版本不可解析）触发')
  assert.equal(chunk.installNeeded({ status: 'ok', data: { available: true, version: '0.49.0' } }, idle), false, '正常态不触发')
  assert.equal(chunk.installNeeded({ status: 'error', error: { kind: 'timeout', text: 'x' } }, gainMiss), false, '「在位但看不见」（version 面错误信封）不出按钮')
  assert.equal(chunk.installNeeded(idle, gainMiss), true, '版本未裁定时 gain 自动面 spawn 级缺失触发（打开设置页即见）')
  assert.equal(chunk.installNeeded(idle, gainErr), false, 'gain 业务错误（非 spawn 级）不触发')
})

test('US-1/D7：真缺失（available:false）→ 故障条 ✗ +「rtk 不可用（缺失或损坏）」+「重新安装」按钮（DESIGN 1 形）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE })
  await settle()
  const row = installRow(runtime.tree, 'idle')
  assert.ok(row, '故障条应出现（DESIGN 1）')
  const text = textOf(row)
  assert.ok(text.includes('rtk 不可用（缺失或损坏）'), '主文案逐字（DESIGN 1）')
  assert.ok(findAll(row, (n) => /rtk-fail-mark/.test(n.props.className ?? '')).length > 0, '✗ icon（--danger）')
  const btn = button(row, 'install')
  assert.ok(btn, '右侧「重新安装」按钮')
  assert.equal(btn.props.children, '重新安装')
  assert.match(btn.props.className, /rtk-install-btn/)
})

test('US-1/D7：损坏/不可执行（available:false + hint:null）与损坏（version 不可解析）同触发故障条', async () => {
  for (const fixture of [VERSION_BROKEN, VERSION_CORRUPT]) {
    const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': fixture })
    await settle()
    button(runtime.tree, 'check-version').props.onClick()
    await settle()
    assert.ok(installRow(runtime.tree, 'idle'), '三态触发面应出故障条')
    assert.ok(button(runtime.tree, 'install'), '应出「重新安装」按钮')
  }
})

test('US-1：正常态（rtk 在位可用）零故障条零按钮（DESIGN 6）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': VERSION_OK })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  assert.equal(installRow(runtime.tree, 'idle'), null, '正常态零故障条')
  assert.equal(button(runtime.tree, 'install'), null, '正常态零「重新安装」按钮')
})

test('US-1/D7：「在位但看不见」（version 面错误信封）不出按钮不出故障条', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_ERR })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  assert.equal(installRow(runtime.tree, 'idle'), null, 'version 错误信封不出故障条（可见性归解析器）')
  assert.equal(button(runtime.tree, 'install'), null, 'version 错误信封不出按钮')
})

test('US-1：打开设置页即见故障条（gain 自动面 spawn 级缺失触发，零点击）', async () => {
  const { runtime, fake } = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE })
  await settle()
  assert.ok(installRow(runtime.tree, 'idle'), '无需点击即见故障条（验收 1「打开设置页」）')
  assert.ok(button(runtime.tree, 'install'), '无需点击即见按钮')
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/install').length, 0, '零点击零安装请求')
})

test('INV-6：installSupported=false → 按钮不出 + --warning「当前平台不支持一键重装，请按 README 手动安装」', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_UNSUPPORTED })
  await settle()
  assert.equal(button(runtime.tree, 'install'), null, '他平台按钮不出（INV-6）')
  const text = textOf(runtime.tree)
  assert.ok(text.includes('当前平台不支持一键重装，请按 README 手动安装'), '--warning 提示逐字（INV-6）')
  assert.ok(findAll(runtime.tree, (n) => /rtk-install-warn/.test(n.props.className ?? '')).length > 0, '--warning 着色接线')
})

test('INV-6：平台不支持与版本数据同源（installSupported 只读 version 面，跨卡契约 3）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': VERSION_UNSUPPORTED })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  assert.equal(button(runtime.tree, 'install'), null, '按钮不出')
  assert.ok(textOf(runtime.tree).includes('当前平台不支持一键重装，请按 README 手动安装'), '提示出现')
})

test('T4-F-1：installSupported 未裁定窗口保守不出按钮（gain判缺失 + version 未回包 → 故障条在场、零按钮零 unsupported 警示）', async () => {
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING,
    'api/rtk-kit/version': () => new Promise(() => {}), // 未裁定窗口：version 面永不回包（supported=undefined）
  })
  await settle()
  assert.ok(installRow(runtime.tree, 'idle'), '故障条在场（needed 如实）')
  assert.equal(button(runtime.tree, 'install'), null, '未裁定窗口零按钮（保守不出，消 unsupported 平台瞬态闪现）')
  assert.equal(installRow(runtime.tree, 'unsupported'), null, '未裁定≠不支持：零 unsupported 态')
  assert.ok(!textOf(runtime.tree).includes('当前平台不支持一键重装'), '未裁定窗口零手动安装警示')
})

test('F-FINAL-1(ii)：installTargetMatch:false → 按钮不出 + --warning 手动安装提示（防误导成功）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_TARGET_MISMATCH })
  await settle()
  assert.ok(installRow(runtime.tree, 'manual'), '手动提示态在场（故障条照出，needed 如实）')
  assert.ok(textOf(runtime.tree).includes('rtk 不可用（缺失或损坏）'), '故障条主文案照出')
  assert.equal(button(runtime.tree, 'install'), null, '按钮不出（引擎装不到配置位，防误导成功）')
  const text = textOf(runtime.tree)
  assert.ok(text.includes(TARGET_MISMATCH_TEXT), '手动安装提示逐字（F-FINAL-1(ii)）')
  assert.ok(!text.includes('当前平台不支持一键重装'), '窗口b 文案独立于 INV-6 平台文案（不误导为平台问题）')
  assert.ok(findAll(runtime.tree, (n) => /rtk-install-warn/.test(n.props.className ?? '')).length > 0, '--warning 着色接线')
})

test('F-FINAL-1(ii)：installTargetMatch true / 未裁定（undefined）→ 按钮照出（门控只收窄误导窗口，undefined≠false）', async () => {
  const a = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE_MATCH })
  await settle()
  assert.ok(button(a.runtime.tree, 'install'), 'match:true 按钮照出')
  assert.ok(!textOf(a.runtime.tree).includes(TARGET_MISMATCH_TEXT), 'match:true 零手动提示')
  const b = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE }) // 旧夹具无该字段=undefined
  await settle()
  assert.ok(button(b.runtime.tree, 'install'), '未裁定窗口按钮照出（undefined≠false，防误伤主场景）')
})

// ── ④ 状态机（DESIGN 2/3，idle → running → ok | fail） ───────────────────────

test('DESIGN 状态机 idle→running：点击即执行无二次确认（POST install 恰一次）+「安装中…」+ 阶段小字（下载 / 校验 / 落盘）', async () => {
  const { runtime, fake } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/install': () => new Promise(() => {}), // 挂起：running 态
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/install').length, 1, '点击即执行恰一次（无二次确认）')
  const row = installRow(runtime.tree, 'running')
  assert.ok(row, 'running 态在场')
  const text = textOf(row)
  assert.ok(text.includes('安装中…'), '文案「安装中…」')
  assert.ok(text.includes('下载 / 校验 / 落盘'), '阶段小字（下载 / 校验 / 落盘）')
  assert.ok(installRow(runtime.tree, 'stage'), '阶段小字节点')
})

test('DESIGN 状态机 running：面板内全部操作按钮禁用（INV-5 单飞）', async () => {
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/install': () => new Promise(() => {}),
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  for (const action of ['install', 'check-version', 'run-health']) {
    const btn = button(runtime.tree, action)
    assert.ok(btn, `按钮 ${action} 在场`)
    assert.equal(btn.props.disabled, true, `running 态 ${action} 禁用`)
  }
  for (const period of ['day', 'week', 'month', 'all']) {
    assert.equal(segButton(runtime.tree, period).props.disabled, true, `running 态周期切换 ${period} 禁用`)
  }
})

test('INV-5 并发单飞：running 中并发点击只发一次请求（防抖/禁用）', async () => {
  const { runtime, fake } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/install': () => new Promise(() => {}),
  })
  await settle()
  const btn = button(runtime.tree, 'install')
  btn.props.onClick() // 连点三次（同一 pre-render 处理器=真实双击/连点窗口）
  btn.props.onClick()
  btn.props.onClick()
  await settle()
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/install').length, 1, '并发点击恰一次请求（INV-5）')
  assert.equal(button(runtime.tree, 'install').props.onClick, undefined, 'running 态按钮无 onClick（禁用态不接线）')
})

test('DESIGN 状态机 ok：绿 ✓「重装完成 · rtk x.y.z」+ 自动复检刷新面板（version + health 各自动一次）', async () => {
  let vcalls = 0
  const { runtime, fake } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING,
    // version 面：首次=故障（出按钮），复检=新版本（面板刷新）
    'api/rtk-kit/version': () => { vcalls += 1; return vcalls === 1 ? VERSION_GONE : VERSION_RECHECK },
    'api/rtk-kit/health': HEALTH_OK, 'api/rtk-kit/install': INSTALL_OK,
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  const row = installRow(runtime.tree, 'ok')
  assert.ok(row, 'ok 态在场')
  const text = textOf(row)
  assert.ok(text.includes('重装完成 · rtk 0.50.0'), 'ok 文案逐字（DESIGN 2）')
  assert.ok(findAll(row, (n) => /rtk-ok-mark/.test(n.props.className ?? '')).length > 0, '绿 ✓（--success）')
  assert.equal(installRow(runtime.tree, 'idle'), null, 'ok 后故障条消失（状态迁移）')
  assert.equal(installRow(runtime.tree, 'fail'), null)
  // 自动复检（US-2/D5）：version + health 各自动一次
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/version').length >= 1, true, '自动复检 version')
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/health').length, 1, '自动复检 health（健康面板刷新）')
  // 刷新面板：版本结果行回显复检后版本
  const block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'version')
  assert.ok(textOf(block).includes('rtk 0.50.0'), '复检后版本结果行刷新')
})

test('US-3/D6 DESIGN 状态机 fail：红条分类文案（下载）+「重试」按钮 + 可展开详情（含 .verify/.record/backupPath，R-3）', async () => {
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/health': HEALTH_OK, 'api/rtk-kit/install': INSTALL_FAIL_DOWNLOAD,
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  const row = installRow(runtime.tree, 'fail')
  assert.ok(row, 'fail 态红条在场')
  const text = textOf(row)
  assert.ok(text.includes('重装失败（下载）'), '分类文案按 code（下载类）')
  assert.ok(text.includes('下载 rtk 失败：HTTP 502'), '失败原因原文（不吞错）')
  const retry = button(row, 'install-retry')
  assert.ok(retry, '「重试」按钮')
  assert.equal(retry.props.children, '重试')
  const details = installRow(runtime.tree, 'details')
  assert.ok(details, '<details> 可展开详情')
  const dtext = textOf(details)
  assert.ok(dtext.includes('code: DOWNLOAD_FAILED'), '详情含 code')
  assert.ok(dtext.includes('verify'), '详情含 .verify（R-3）')
  assert.ok(dtext.includes('record'), '详情含 .record（R-3）')
  assert.ok(dtext.includes('backupPath'), '详情含旧版 .bak 位置（R-3）')
  assert.ok(dtext.includes('/root/.local/bin/rtk.bak.1759560000'), 'backupPath 原值进详情')
})

test('US-3/D6 分类分派：CHECKSUM_MISMATCH→校验、EXTRACT/WRITE/VERIFY_FAILED→落盘（红条分类 3 桶）', async () => {
  const cases = [
    ['CHECKSUM_MISMATCH', '重装失败（校验）'],
    ['EXTRACT_FAILED', '重装失败（落盘）'],
    ['WRITE_FAILED', '重装失败（落盘）'],
    ['VERIFY_FAILED', '重装失败（落盘）'],
    ['RTK_ERROR', '重装失败'],
  ]
  for (const [code, label] of cases) {
    const { runtime } = mountSection({
      'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
      'api/rtk-kit/install': { error: { code, message: 'msg-' + code } },
    })
    await settle()
    button(runtime.tree, 'install').props.onClick()
    await settle()
    const row = installRow(runtime.tree, 'fail')
    assert.ok(row, code + ' fail 态在场')
    assert.ok(textOf(row).includes(label), code + ' → ' + label)
  }
})

test('DESIGN 状态机 fail→running（重试）：「重试」点击=再发一次 install 请求', async () => {
  let n = 0
  let vcalls = 0
  const { runtime, fake } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING,
    'api/rtk-kit/version': () => { vcalls += 1; return vcalls === 1 ? VERSION_GONE : VERSION_RECHECK },
    'api/rtk-kit/health': HEALTH_OK,
    'api/rtk-kit/install': () => { n += 1; return n === 1 ? INSTALL_FAIL_DOWNLOAD : INSTALL_OK },
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  assert.ok(installRow(runtime.tree, 'fail'), '首装失败')
  button(runtime.tree, 'install-retry').props.onClick()
  await settle()
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/install').length, 2, '重试=再发一次请求')
  assert.ok(installRow(runtime.tree, 'ok'), '重试成功进 ok 态')
})

test('重入静默（INV-5/409）：reinstall-in-progress → 零红条不重复弹错（回 idle）', async () => {
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/install': INSTALL_FAIL_REENTRY,
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  assert.equal(installRow(runtime.tree, 'fail'), null, '409 零红条（不重复弹错）')
  assert.ok(!textOf(runtime.tree).includes('重装失败'), '409 零错误文案')
  assert.ok(installRow(runtime.tree, 'idle'), '静默回 idle（按钮恢复）')
})

test('fail：fetch 抛错（断网）→ 通用红条 + 详情含 message（US-3 断网路径）', async () => {
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/install': () => Promise.reject(new Error('network down')),
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  const row = installRow(runtime.tree, 'fail')
  assert.ok(row, '断网 fail 态')
  assert.ok(textOf(row).includes('network down'), '失败原因原文')
  assert.ok(textOf(installRow(runtime.tree, 'details')).includes('network down'), '详情含 message')
})

test('T4-F-2：doInstall 链末端 .catch 兜底——异常复位 busyRef + 回 idle + 留痕（面板绝不卡 running/永久禁用）', async () => {
  const warns = []
  const origWarn = console.warn
  console.warn = (m) => warns.push(String(m))
  try {
    const { runtime, chunk } = mountSection({
      'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
      'api/rtk-kit/install': () => new Promise(() => {}),
    })
    await settle()
    const realRun = chunk.runInstall
    chunk.runInstall = () => Promise.reject(new Error('chain boom')) // 注入链上异常（runInstall 自身全捕获，兜底防链/回调异常）
    button(runtime.tree, 'install').props.onClick()
    await settle()
    assert.equal(installRow(runtime.tree, 'running'), null, '不卡 running 态')
    assert.ok(installRow(runtime.tree, 'idle'), '回 idle（故障条恢复）')
    assert.ok(button(runtime.tree, 'install'), '「重新安装」恢复（busyRef 已复位）')
    chunk.runInstall = realRun
    button(runtime.tree, 'install').props.onClick()
    await settle()
    assert.ok(installRow(runtime.tree, 'running'), '复位后点击真正再执行（非静默丢弃=单飞锁未卡死）')
    assert.ok(warns.some((m) => m.includes('chain boom')), '兜底留痕（console.warn 含异常原文）')
  } finally {
    console.warn = origWarn
  }
})

// ── ⑤ 记录行（US-5 / P1） ───────────────────────────────────────────────────

test('US-5：lastInstall → 版本区底部「最近重装：<时间> · <版本> · 成功/失败」（12px --text-secondary 小字）', async () => {
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_OK,
    'api/rtk-kit/version': { data: { ...VERSION_OK.data, lastInstall: INSTALL_REC_OK } },
  })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  const row = installRow(runtime.tree, 'record')
  assert.ok(row, '记录行在场（P1）')
  assert.ok(textOf(row).includes('最近重装：2026-10-04T12:00:00.000Z · 0.50.0 · 成功'), '记录行形（US-5）')
  assert.match(row.props.className, /rtk-install-record/)
  // 失败记录同样回显（成功/失败 双态）
  const h2 = mountSection({
    'api/rtk-kit/gain': GAIN_OK,
    'api/rtk-kit/version': { data: { ...VERSION_OK.data, lastInstall: INSTALL_REC_FAIL } },
  })
  await settle()
  button(h2.runtime.tree, 'check-version').props.onClick()
  await settle()
  assert.ok(textOf(installRow(h2.runtime.tree, 'record')).includes('最近重装：2026-10-04T11:00:00.000Z · - · 失败'), '失败记录回显')
})

test('US-5：lastInstall=null → 无记录行', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': VERSION_OK })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  assert.equal(installRow(runtime.tree, 'record'), null, '无记录不渲染记录行')
})

// ── Task 5 收口：验收 1-4 各态 + 状态机五态（US/INV 可追溯；真实注入落点 mkdtemp，INV-8） ────────────────

test('验收 1/US-1 态 1：人为移除/损坏注入落点 rtk（mkdtemp 真 fs）→ 故障条+「重新安装」；在位正常 → 零故障条零按钮', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-state1-'))
  const dir = path.join(root, 'bin')
  fs.mkdirSync(dir, { recursive: true })
  const bin = path.join(dir, 'rtk')
  const seed = (bytes, mode) => { fs.writeFileSync(bin, bytes); fs.chmodSync(bin, mode) }
  // 态 1 数据源真跑（真 fs + 真 execFile 执行 mkdtemp 假 rtk，零真实 rtk/零真 home；resolveEnv 显式空=零真机回落）；
  // version 信封照 doctor-routes version 面组装形（getVersion 结果 + lastInstall + installSupported）
  const envelope = async () => ({
    data: { ...(await getVersion({ rtkBin: bin, resolveEnv: { path: '', homedir: '' } })), lastInstall: null, installSupported: true },
  })
  const show = async (fixture) => {
    const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': fixture })
    await settle()
    button(runtime.tree, 'check-version').props.onClick() // 版本仅按钮触发（INV-11）
    await settle()
    return runtime.tree
  }
  // ① 在位正常（可执行 + 版本可解析）
  seed('#!/bin/sh\necho "rtk 1.0.0"\n', 0o755)
  let fixture = await envelope()
  assert.equal(fixture.data.available, true, '① 在位正常：available:true')
  assert.equal(fixture.data.version, '1.0.0')
  let tree = await show(fixture)
  assert.equal(installRow(tree, 'idle'), null, '① 正常态零故障条')
  assert.equal(button(tree, 'install'), null, '① 正常态零按钮')
  // ② 人为移除 → 真缺失（hint 与 found 同门控，INV-9）
  fs.rmSync(bin)
  fixture = await envelope()
  assert.equal(fixture.data.available, false, '② 移除 → 缺失态')
  assert.ok(fixture.data.hint, '② 真缺失带安装提示（INV-9）')
  tree = await show(fixture)
  assert.ok(installRow(tree, 'idle'), '② 移除 → 故障条')
  assert.ok(button(tree, 'install'), '② 移除 →「重新安装」按钮')
  // ③ 损坏（坏 shebang：在场可执行但执行必败=找到但执行失败窗口）
  seed('#!/nonexistent/rtk-test-interp\necho hi\n', 0o755)
  fixture = await envelope()
  assert.equal(fixture.data.available, false, '③ 损坏 → 不可用态')
  assert.equal(fixture.data.hint, null, '③ 找到但执行失败不带安装提示（INV-9 窗口B）')
  tree = await show(fixture)
  assert.ok(installRow(tree, 'idle'), '③ 损坏 → 故障条')
  assert.ok(button(tree, 'install'), '③ 损坏 →「重新安装」按钮')
  // ④ 不可执行（X_OK 门槛不命中=缺失态触发）
  seed('#!/bin/sh\necho "rtk 1.0.0"\n', 0o644)
  fixture = await envelope()
  assert.equal(fixture.data.available, false, '④ 不可执行 → 不可用态')
  tree = await show(fixture)
  assert.ok(installRow(tree, 'idle'), '④ 不可执行 → 故障条')
  assert.ok(button(tree, 'install'), '④ 不可执行 →「重新安装」按钮')
})

test('验收 3/US-3 态 3：断网超时（fetch 超时 reject 形）→ 红条 +「重试」+ 详情（不吞错）', async () => {
  const timeoutErr = new Error('fetch timeout')
  timeoutErr.name = 'TimeoutError'
  const { runtime } = mountSection({
    'api/rtk-kit/gain': GAIN_MISSING, 'api/rtk-kit/version': VERSION_GONE,
    'api/rtk-kit/install': () => Promise.reject(timeoutErr),
  })
  await settle()
  button(runtime.tree, 'install').props.onClick()
  await settle()
  const row = installRow(runtime.tree, 'fail')
  assert.ok(row, '超时 fail 态红条在场')
  assert.ok(textOf(row).includes('fetch timeout'), '超时原因原文（不吞错）')
  assert.ok(button(row, 'install-retry'), '「重试」按钮')
  assert.ok(textOf(installRow(runtime.tree, 'details')).includes('fetch timeout'), '详情含 message')
})

test('状态机五态收口（验收 1-4/INV-6）：idle/running/ok/fail/unsupported 逐态节点+文案（US/INV 可追溯）', () => {
  const { chunk } = loadPanel()
  const base = { needed: true, supported: true, error: null, version: null, onInstall: () => {} }
  // ① idle（验收 1）：故障条 +「重新安装」
  const idle = chunk.renderInstallRow({ ...base, phase: 'idle' })
  assert.equal(idle.props['data-rtk-install'], 'idle')
  assert.ok(textOf(idle).includes('rtk 不可用（缺失或损坏）') && button(idle, 'install'), 'idle=故障条+「重新安装」')
  // ② running（验收 2）：「安装中…」+ 阶段小字（下载 / 校验 / 落盘）
  const running = chunk.renderInstallRow({ ...base, phase: 'running' })
  assert.ok(textOf(running).includes('安装中…'), 'running=「安装中…」')
  assert.ok(textOf(running).includes('下载 / 校验 / 落盘'), 'running=阶段小字（下载 / 校验 / 落盘）')
  assert.ok(installRow(running, 'stage'), '阶段小字节点在场')
  // ③ ok（验收 2）：绿 ✓「重装完成 · rtk x.y.z」
  const ok = chunk.renderInstallRow({ ...base, phase: 'ok', needed: false, version: '9.9.9' })
  assert.equal(ok.props['data-rtk-install'], 'ok')
  assert.ok(textOf(ok).includes('重装完成 · rtk 9.9.9'), 'ok=完成文案逐字')
  // ④ fail（验收 3）：红条分类 +「重试」+ 详情
  const fail = chunk.renderInstallRow({ ...base, phase: 'fail', error: { code: 'CHECKSUM_MISMATCH', message: 'x' } })
  assert.equal(fail.props['data-rtk-install'], 'fail')
  assert.ok(textOf(fail).includes('重装失败（校验）'), 'fail=分类文案（校验桶）')
  assert.ok(button(fail, 'install-retry'), 'fail=「重试」按钮')
  assert.ok(installRow(fail, 'details'), 'fail=可展开详情（R-3）')
  // ⑤ 平台不支持（INV-6）：按钮恒不出 + --warning 手动安装
  const unsup = chunk.renderInstallRow({ ...base, phase: 'idle', supported: false })
  assert.equal(unsup.props['data-rtk-install'], 'unsupported')
  assert.equal(button(unsup, 'install'), null, 'unsupported=按钮恒不出')
  assert.ok(textOf(unsup).includes('当前平台不支持一键重装，请按 README 手动安装'), 'unsupported=手动安装提示逐字')
})

// ── ⑥ token / 红线（跨卡契约 5） ────────────────────────────────────────────

test('token 断言：色值仅 DESIGN.md 基表 + 故障条底 rgba(216,57,49,0.08)（零新增色板）', () => {
  const allowed = new Set([
    '#ffffff', '#f7f8fa', '#e5e6eb', '#1f2329', '#646a73', '#3370ff', '#2ea44f', '#d83931', '#d97706',
    'rgba(216,57,49,0.08)',
  ])
  const strip = (code) => code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  for (const [name, code] of [['client.js', source], ['client.install.js', chunkSource]]) {
    // 注释里的 issue 编号/文档引用不算色值——只扫真代码（剥注释同红线口径）
    const found = strip(code).match(/#[0-9a-fA-F]{3,8}\b|rgba\([^)]*\)/g) ?? []
    for (const c of found) assert.ok(allowed.has(c.toLowerCase()), `${name} 出现新增色板值 ${c}`)
  }
  assert.ok(chunkSource.includes('rgba(216,57,49,0.08)'), '故障条底派生值在场（DESIGN 唯一新增值）')
})

test('token 断言（DESIGN 逐字）：故障条 8px 12px/6px/1px --border/上下 12px；按钮 28px 禁用 50%；记录行 8px 上距零阴影；详情 12px mono', () => {
  const css = chunkSource
  assert.ok(/\.rtk-install-bar\{[^}]*padding:8px 12px[^}]*\}/.test(css), '故障条内边距 8px 12px')
  assert.ok(/\.rtk-install-bar\{[^}]*border:1px solid var\(--border\)[^}]*\}/.test(css), '描边 1px --border')
  assert.ok(/\.rtk-install-bar\{[^}]*border-radius:6px[^}]*\}/.test(css), '圆角 6px')
  assert.ok(/\.rtk-install-bar\{[^}]*margin:12px 0[^}]*\}/.test(css), '与上下行距 12px')
  assert.ok(/\.rtk-install-btn\{[^}]*height:28px[^}]*\}/.test(css), '按钮高 28px')
  assert.ok(/\.rtk-install-btn:disabled\{[^}]*opacity:\.5/.test(css), '禁用态 50% 透明度')
  assert.ok(/\.rtk-install-record\{[^}]*margin-top:8px[^}]*font-size:12px[^}]*color:var\(--text-secondary\)[^}]*\}/.test(css), '记录行 12px --text-secondary 上距 8px')
  assert.ok(!css.includes('box-shadow'), '记录行不加卡片阴影（基表 A 稿铁律）')
  assert.ok(/\.rtk-install-details\{[^}]*ui-monospace[^}]*font-size:12px[^}]*\}/.test(css), '错误详情 12px mono')
  // 字号/间距只走基表阶梯（4/8/12/16/24 + 13/14 + 按钮 28px + 描边 1px）
  const px = [...css.matchAll(/(\d+)px/g)].map((m) => Number(m[1]))
  for (const v of px) assert.ok([1, 4, 6, 8, 12, 13, 14, 16, 24, 28].includes(v), `chunk 出现阶梯外 px 值 ${v}`)
})

test('红线：零第三方 UI 库（require 白名单仅 react）、零文档绝对 URL、零二次确认弹窗、组件 ≤300 行', () => {
  for (const [name, code] of [['client.js', source], ['client.install.js', chunkSource]]) {
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    const requires = [...stripped.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
    assert.deepEqual([...new Set(requires)], ['react'], `${name} require 白名单仅 react`)
    assert.ok(!/['"`]\//.test(stripped), `${name} 零以 / 开头的字符串字面（一律文档相对）`)
    assert.ok(!/fetch\(\s*['"`]\//.test(stripped), `${name} 零 fetch('/ 绝对 URL`)
    assert.ok(!stripped.includes('element-plus') && !stripped.includes('antd'), `${name} 零第三方 UI 库字面`)
    assert.ok(!/\bconfirm\s*\(/.test(stripped) && !/\balert\s*\(/.test(stripped), `${name} 零二次确认弹窗（US-2/D5）`)
    assert.ok(!/^\s*import\s/m.test(stripped), `${name} 零 ESM import（工厂形 CJS，零构建链）`)
  }
  assert.ok(source.split('\n').length <= 300, `lib/client.js 行数 ${source.split('\n').length} > 300`)
  assert.ok(chunkSource.split('\n').length <= 300, `lib/client.install.js 行数 ${chunkSource.split('\n').length} > 300`)
})
