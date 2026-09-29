// UI 面退化形测试（Task 15 收口，与 client-shell.test.mjs 分文件——后者 713 行已超限）：
//   ① 超时分级结果→分级卡终态不挂死（INV-5）+「状态 · 归因」标题口径（INV-10）；
//   ② repo-context 失败降级不炸栏目（INV-6）；③ UI 投影零明文对抗（INV-1/P-5/P-10）；
//   ④ 假 ctx 无 slots 注入 apply() 不炸（INV-6，index.js 与 client 壳两面）。
// 载入形：同 client-shell.test.mjs 第④节——真 client.ui.* chunk 工厂（fakeReact）+ 假 api + model 驱动 cards 纯渲染，
// 零 DOM 零网络；UI 投影只读结构化字段，原始串（stderr 等）绝不进树。
import test from 'node:test'
import assert from 'node:assert/strict'

const registrations = []
globalThis.window = { __ModuleLoader__: { load: (r) => registrations.push(r) } }
await import('../lib/client.js')
await import('../lib/client.ui.model.js')
await import('../lib/client.ui.project.js')
await import('../lib/client.ui.cards.js')
await import('../lib/client.ui.styles.js')
const indexMod = await import('../lib/index.js')

const fakeReact = { createElement: (type, props, ...children) => ({ __el: true, type, props: props ?? {}, children }) }
const uiChunkReg = (name) => registrations.find((r) => r.chunk === name)
const shellReg = registrations.find((r) => r.chunk === undefined)
function chunkModule(name) {
  const reg = uiChunkReg(name)
  assert.ok(reg, name + ' 应有 __ModuleLoader__ 注册')
  const req = (spec) => { assert.equal(spec, 'react'); return fakeReact }
  req.async = async (spec) => {
    if (spec === './client.ui.project.js') return chunkModule('client.ui.project.js')
    throw new Error('unexpected chunk: ' + spec)
  }
  return reg.factory(req)
}
const cards = chunkModule('client.ui.cards.js')
const modelMod = chunkModule('client.ui.model.js')

// —— 树遍历（fakeReact 元素）——
function collectNodes(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectNodes(n, out); return out }
  if (typeof node === 'string' || typeof node === 'number') return out
  if (node.__el) { out.push(node); for (const c of node.children) collectNodes(c, out) }
  return out
}
function collectStrings(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectStrings(n, out); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (node.__el) {
    for (const [k, v] of Object.entries(node.props ?? {})) {
      if (typeof v === 'string' && ['aria-label', 'title', 'placeholder', 'alt'].includes(k)) out.push(v)
    }
    for (const c of node.children) collectStrings(c, out)
  }
  return out
}
const classListOf = (el) => String(el.props?.className ?? '').split(/\s+/).filter(Boolean)
const hasClass = (node, cls) => collectNodes(node).some((el) => classListOf(el).includes(cls))
const findByClass = (node, cls) => collectNodes(node).find((el) => classListOf(el).includes(cls)) ?? null
const textsOf = (node) => collectStrings(node).join('\n')
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

// —— 假 api（route=响应体 {httpOk?,status?,body} / Error=传输失败 / 函数=悬挂响应）——
function fakeApi(routes) {
  const calls = []
  return {
    calls,
    base: 'api/github-ops/',
    fetch: async (path, init = {}) => {
      calls.push({ path, init })
      const route = routes[path]
      if (route instanceof Error) throw route
      if (typeof route === 'function') return route(init)
      if (!route) throw new Error('no route stub: ' + path)
      return {
        ok: route.httpOk ?? true,
        status: route.status ?? 200,
        json: async () => {
          if (route.jsonThrows) throw new Error('not json')
          return route.body ?? {}
        },
      }
    },
  }
}

// —— 数据面结构化形样本（与 lib/settings-routes.js 响应形逐字段对齐；退化形=真链同款 code）——
const ONCE_F = 'ghp_once_t15_foxtrot_0123456789abcd'
const STATUS_OK = {
  ok: true, stage: 'status', code: null, status: 200, login: 'fengcwf', message: '本地认证状态投影（零明文）', elapsedMs: 3, hint: null, quota: null,
  hosts: [{ host: 'github.com', activeAccount: 'fengcwf', gitProtocol: 'ssh', hasToken: true, users: 1 }],
  accounts: [{ login: 'fengcwf', active: true, configured: true, verified: true }],
}
const VERIFY_OK = { ok: true, stage: 'verify', code: null, status: 200, login: 'fengcwf', message: '逐账号验证完成', elapsedMs: 5, hint: null, quota: null, accounts: [{ login: 'fengcwf', verified: true, state: 'success', error: null }] }
const HEALTH_OK = {
  ok: true, stage: 'health', code: null, status: 200, login: 'fengcwf', message: '三段自检通过', elapsedMs: 6, hint: null, quota: null,
  sections: {
    config: { ok: true, message: '配置合成复检通过', switches: { enforceCommands: true } },
    gh: { ok: true, message: 'gh CLI 可用', version: 'gh 2.62.0', elapsedMs: 2 },
    credentials: { ok: true, message: '凭据在位（零明文投影）', hostsPath: '/home/u/.config/gh/hosts.yml', active: 'fengcwf', accounts: 1 },
  },
}
const REPO_OK = {
  ok: true, stage: 'repo-context', code: null, status: 200, login: 'fengcwf', message: '仓库上下文（git + gh api 摘要）', elapsedMs: 9, hint: null, quota: null,
  git: { branch: 'main', remotes: [{ name: 'origin', url: 'github.com/fengcwf/dsh-plugins.git' }] },
  repo: { fullName: 'fengcwf/dsh-plugins', stars: 12, issues: 3, defaultBranch: 'main' },
}
const BASE_ROUTES = { status: { body: STATUS_OK }, 'accounts/verify': { body: VERIFY_OK }, health: { body: HEALTH_OK }, 'repo-context': { body: REPO_OK } }
const CARD_TITLES = ['认证状态', '访问检验', '插件自检', 'Token 维护', '多账号库', '仓库上下文']
// 真链同款退化形响应（code/hint 逐字=gh-auth 分级输出）
const TIMEOUT_BODY = {
  ok: false, stage: 'auth-connect', code: 'GHO-AUTH-CONNECT-01', status: null, login: 'fengcwf',
  message: '执行超时（>3000ms）', elapsedMs: 3012, hint: '执行超时（>3000ms）：网络慢或 gh 卡住，可调大 probeTimeoutMs 后重试', quota: null,
}
const FORBIDDEN_BODY = {
  ok: false, stage: 'auth-connect', code: 'GHO-AUTH-CONNECT-04', status: 403, login: 'fengcwf',
  message: 'HTTP 403: Forbidden', elapsedMs: 210, hint: '权限不足：token 缺少所需 scope 或被组织策略限制', quota: null,
}

// ================= ① 超时分级→UI 不挂死（INV-5）+ 归因标题口径（INV-10） =================

test('超时分级结果→UI 不挂死：busy→终态 error +「执行超时」归因标题 + 重新检查入口（INV-5/R-1 同法）', async () => {
  let release
  const model = modelMod.createModel({ api: fakeApi({ ...BASE_ROUTES, check: () => new Promise((res) => { release = res }) }) })
  await model.actions.boot()
  const pending = model.actions.check()
  assert.equal(model.getState().check.phase, 'loading', 'busy 态先行')
  await settle()
  release({ ok: true, status: 200, json: async () => TIMEOUT_BODY })
  await pending
  const state = model.getState()
  assert.equal(state.check.phase, 'error', '超时分级出结果=终态，绝不悬挂 loading')
  const tree = cards.renderSettingsView(state, model.actions)
  const err = findByClass(tree, 'gho-error-card')
  assert.ok(err, '分级错误卡在场')
  const title = textsOf(findByClass(err, 'gho-error-title') ?? err)
  assert.match(title, /执行超时/, '归因标题=执行超时（NN 01 口径，不得误标鉴权缝归因）')
  assert.equal(title.includes('来源受限'), false, 'GHO-AUTH-CONNECT-* 是探针业务码，不是鉴权缝 GHO-AUTH-*')
  assert.match(textsOf(err), /probeTimeoutMs/, '修复指引贯通（INV-10）')
  assert.ok(textsOf(tree).includes('重新检查'), '恢复入口在场（不挂死）')
  assert.equal(hasClass(tree, 'gho-btn-busy'), false, '终态无残留 busy 按钮')
  for (const t of CARD_TITLES) assert.ok(textsOf(tree).includes(t), '六卡照常渲染：' + t)
})

test('探针 403 归因标题口径（INV-10）：GHO-AUTH-CONNECT-04 →「403 · 权限不足」（不得误显「来源受限」）', async () => {
  const model = modelMod.createModel({ api: fakeApi({ ...BASE_ROUTES, check: { body: FORBIDDEN_BODY } }) })
  await model.actions.boot()
  await model.actions.check()
  const err = findByClass(cards.renderSettingsView(model.getState(), model.actions), 'gho-error-card')
  assert.ok(err, '分级错误卡在场')
  const title = textsOf(findByClass(err, 'gho-error-title') ?? err)
  assert.match(title, /403 · 权限不足/, '状态 · 归因（NN 04 口径）')
  assert.equal(title.includes('来源受限'), false)
  assert.match(textsOf(err), /scope|组织策略/, '修复指引贯通')
})

// ================= ② repo-context 失败降级不炸栏目（INV-6） =================

test('repo-context 失败降级不炸栏目：传输失败/硬失败各一形 → 栏目六卡照常 + 卡内降级', async () => {
  const transport = modelMod.createModel({ api: fakeApi({ ...BASE_ROUTES, 'repo-context': new Error('ECONNREFUSED') }) })
  await transport.actions.boot()
  assert.equal(transport.getState().repo.phase, 'error', 'repo 传输失败=卡内降级')
  const tree = cards.renderSettingsView(transport.getState(), transport.actions)
  for (const t of CARD_TITLES) assert.ok(textsOf(tree).includes(t), '降级不炸栏目（六卡齐）：' + t)
  const err = findByClass(tree, 'gho-error-card')
  assert.ok(err, 'repo 卡出分级降级提示')
  assert.match(textsOf(err), /网络请求失败|刷新/, '降级形带修复指引')
  const hard = modelMod.createModel({ api: fakeApi({ ...BASE_ROUTES, 'repo-context': { body: { ok: false, stage: 'repo-context', code: 'GHO-REPO-CONTEXT-99', status: null, login: null, message: '退出码 128', elapsedMs: 4, hint: '未知错误：请结合 message 归因', quota: null } } }) })
  await hard.actions.boot()
  assert.equal(hard.getState().repo.phase, 'error', '业务硬失败（非 -07）=分级降级')
  const tree2 = cards.renderSettingsView(hard.getState(), hard.actions)
  for (const t of CARD_TITLES) assert.ok(textsOf(tree2).includes(t), '硬失败同样不炸栏目：' + t)
})

// ================= ③ UI 投影零明文对抗（INV-1/P-5/P-10） =================

test('UI 投影零明文：一次性假 token 保存链 + 原始串面（stderr/argv 形）绝不进树', async () => {
  const api = fakeApi({
    ...BASE_ROUTES,
    token: { body: { ok: true, stage: 'token', code: null, status: 200, login: 'fengcwf', message: 'token 已经 stdin 写入 hosts.yml（单一认证源）', elapsedMs: 7, hint: null, quota: null, noop: false } },
    // 敌意原始串面：stderr/argv 回显形（合同 1：UI 绝不渲染原始串）
    check: { body: { ok: false, stage: 'auth-connect', code: 'GHO-AUTH-CONNECT-03', status: 401, login: null, message: 'HTTP 401: Bad credentials', elapsedMs: 9, hint: 'token 无效或已过期：请在设置栏目更新 token', quota: null, stderr: `raw ${ONCE_F} argv=--with-token https://user:pass@host/x` } },
  })
  const model = modelMod.createModel({ api })
  await model.actions.boot()
  model.actions.setTokenDraft(ONCE_F)
  await model.actions.saveToken(model.getState().token.draft)
  assert.equal(model.getState().token.draft, '', '保存即清空（INV-1）')
  assert.equal(JSON.parse(api.calls.find((c) => c.path === 'token').init.body).token, ONCE_F, 'token 只进请求体（stdin 链路）')
  await model.actions.check()
  const texts = textsOf(cards.renderSettingsView(model.getState(), model.actions))
  for (const secret of [ONCE_F, 'user:pass@']) assert.equal(texts.includes(secret), false, `UI 投影零明文：${secret}`)
  assert.equal(/gh[pousr]_[A-Za-z0-9_]{16,}/.test(texts), false, 'token 形态串不进树')
  assert.equal(/github_pat_[A-Za-z0-9_]{16,}/.test(texts), false, 'PAT 形态串不进树')
  assert.equal(texts.includes('argv=--with-token'), false, 'stderr 原始串面零渲染')
  assert.match(texts, /401 · token 无效/, '白名单归因字段正常显示（擦除的是凭据不是事实）')
})

// ================= ④ 假 ctx 无 slots 注入：apply() 不炸（INV-6） =================

test('假 ctx 无 slots 注入：client 壳 apply() 不炸零注册；index apply() 不炸且层①包壳照常', () => {
  // client 壳面（inject=['slots']）：槽位方缺席=该面缺席
  assert.ok(shellReg, 'client.js 注册在场')
  const shellCalls = { warns: 0 }
  const shellMod = shellReg.factory((spec) => { assert.equal(spec, 'react'); return fakeReact })
  let dispose
  assert.doesNotThrow(() => { dispose = shellMod.apply({ logger: { warn: () => { shellCalls.warns++ } } }) }, '无 slots ctx 绝不炸 apply')
  assert.equal(typeof dispose, 'function')
  assert.ok(shellCalls.warns >= 1, '缺席面留 warn 痕迹')
  // index 面（inject=['shell','tools']）：无 slots/webServer/connection/plugin 的假 ctx
  const before = (req) => req
  const ctx = { shell: { resolve: before }, effect: () => {}, on: () => {}, tools: { register: () => {} }, logger: { warn: () => {} } }
  assert.doesNotThrow(() => indexMod.apply(ctx, {}), '假 ctx 无 slots 注入绝不炸装载')
  assert.notEqual(ctx.shell.resolve, before, '层①包壳照常在场（数据面缺席≠四层死，Ruling-3）')
  assert.match(ctx.shell.resolve({ command: 'curl https://api.github.com/x', stdin: null }).command, /gh auth token/)
})
