// 挂载与声明 integration 形测试（Task 12）：假 ctx 真 apply()——真 gh-auth 执行缝 + 真 settings-routes handler。
// 覆盖（验收逐条）：导出契约与挂载面（INV-9/R-4）、Config probeTimeoutMs 钳制落点（INV-5/ADR-004）、
// INV-7 四层逐层零回归（①resolve 包壳存活+stdin 守卫+拆除还原 ②web_fetch 门禁 ③工具集经 gh-auth.makeRunGh 收编执行
// ④awareness 注入）、设置面双层子插件挂载（kb-context 形）+ 撤路由（C-1 收敛释放）、deps.workspaceDir=宿主工作区、
// 声明面（package.json dsh.client + exports['./client'] + cordis.patch.yml 全键重述）。
// ⚠️ effect 语义（cordis 工厂形，rtk-kit 2026-09-29 e2e 教训 + 本卡真实 Context 复测）：execute 当场跑、返回函数才是拆除器。
//    拆除器形 `ctx.effect(() => { ...还原... })` 会在 setup 期当场还原、包壳即死——下方断言「apply 后包壳存活」专锁此坑。
// 安全（P-10/R-6）：ghBin 全程 'echo'（零真实凭据/零网络）；git 走 mkdtemp 临时仓（非 GitHub remote，不触 gh）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import * as mod from '../lib/index.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

// 假 ctx（cordis 工厂形 effect 语义忠实建模：execute 当场跑、返回函数=拆除器，teardown 逆序执行）
function makeCtx({ services = {}, resolve } = {}) {
  const calls = { tools: [], ons: [], plugins: [], effects: [], warns: [] }
  const disposables = []
  const ctx = {
    shell: { resolve: resolve ?? ((req) => ({ command: req.command })) },
    tools: { register: (t) => calls.tools.push(t) },
    on: (ev, fn) => calls.ons.push({ ev, fn }),
    effect: (execute, label) => {
      calls.effects.push({ label })
      const disposer = execute() // 工厂语义：当场执行 setup
      if (typeof disposer === 'function') disposables.push(disposer) // 返回函数=拆除器
      return disposer
    },
    plugin: (p) => calls.plugins.push(p),
    get: (name) => (Object.prototype.hasOwnProperty.call(services, name) ? services[name] : null),
    logger: { warn: (line) => calls.warns.push(String(line)) },
  }
  return { ctx, calls, disposables, disposeAll: () => { for (const d of disposables.splice(0).reverse()) d() } }
}

// 子插件激活建模（cordis 硬 inject 语义，kb-context B1 修复注释同义）：p.inject 的 provider 全在场才激活；
// 缺位=延迟激活（不 apply，数据面缺席不炸）——非 web 部署面形态（Ruling-3 核心证据用例走 provideWeb:false）。
function activate(plugins, { reject, provideWeb = true } = {}) {
  assert.equal(plugins.length, 1, 'apply 应挂一个设置面双层子插件')
  assert.deepEqual(plugins[0].inject, ['webServer', 'connection'], '内层子插件硬 inject 承载数据面')
  const specs = []
  const disposables = []
  if (!provideWeb) return { activated: false, specs, disposables, unmount: () => {} } // provider 缺位=延迟激活（不 apply）
  const child = {
    webServer: { register: (spec) => { specs.push(spec); return () => { spec.disposed = true } } },
    connection: { requestRejection: () => (typeof reject === 'function' ? reject() : reject) },
    effect: (execute) => { const d = execute(); if (typeof d === 'function') disposables.push(d); return d },
  }
  plugins[0].apply(child)
  return { activated: true, specs, disposables, unmount: () => { for (const d of disposables.splice(0).reverse()) d() } }
}

// 假 req/res（沿 settings-routes.test.mjs 形）
async function call(handler, { method = 'GET', url = '/api/github-ops/status', body } = {}) {
  const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  const req = Readable.from(data == null ? [] : [data])
  req.method = method; req.url = url; req.headers = { host: '127.0.0.1:3080' }
  const res = {
    statusCode: 0, headers: {}, body: null,
    writeHead(s, h) { this.statusCode = s; Object.assign(this.headers, h ?? {}) },
    setHeader(k, v) { this.headers[k] = v },
    end(b) { this.body = b ?? '' },
  }
  await handler(req, res)
  return { status: res.statusCode, headers: res.headers, text: res.body, json: res.body ? JSON.parse(res.body) : null }
}

test('导出契约与声明面（INV-9/R-4）：name/inject 不动 + 新增挂载面 + client 声明 + config 全键重述', () => {
  assert.equal(mod.name, 'github-ops', "lib/index.js name='github-ops' 不动（INV-9）")
  // Ruling-3：外层激活形维持 0.2.1（非 web 部署四层照常生效）；webServer/connection 由内层子插件承载
  assert.deepEqual(mod.inject, ['shell', 'tools'])
  assert.equal(typeof mod.apply, 'function')
  assert.ok(mod.Config && typeof mod.Config === 'object')
  // 声明面（Task 12 验收：exports['./client'] + dsh.client；模块 id=包名；patch 行 id/name 不动）
  const pkg = JSON.parse(read('../package.json'))
  assert.equal(pkg.name, 'dsh-github-ops', '模块 id=包名 dsh-github-ops（INV-9/R-4）')
  assert.equal(pkg.exports['./client'], './lib/client.js', "缺 exports['./client']=启动报错")
  assert.equal(pkg.dsh.client?.platform, 'web')
  assert.ok(Array.isArray(pkg.dsh.client?.inject) && pkg.dsh.client.inject.length > 0, 'dsh.client.inject 最小集')
  assert.equal(pkg.dsh.bundle?.patch, './cordis.patch.yml')
  const yml = read('../cordis.patch.yml')
  assert.match(yml, /id: github-ops/, 'patch 行 id 不动')
  assert.match(yml, /name: 'dsh-github-ops'/, 'patch 行 name=包名')
  assert.match(yml, /probeTimeoutMs: 3000/, 'INV-5 落点进 config（整行替换语义=全键重述）')
  for (const key of ['enabled', 'ghBin', 'enforceCommands', 'webFetchPolicy', 'registerRepoTools', 'allowDelete', 'awareness', 'ghTimeoutMs']) {
    assert.ok(yml.includes(`${key}:`), `cordis.patch.yml config 全键重述缺 ${key}`)
  }
})

test('Config probeTimeoutMs（INV-5 钳制落点）：min 1000 / max 600000 / default 3000', () => {
  assert.equal(mod.Config.parse({}).probeTimeoutMs, 3000)
  assert.equal(mod.Config.parse({ probeTimeoutMs: 4500 }).probeTimeoutMs, 4500)
  assert.equal(mod.Config.safeParse({ probeTimeoutMs: 999 }).success, false, '低于 1000 拒')
  assert.equal(mod.Config.safeParse({ probeTimeoutMs: 600001 }).success, false, '高于 600000 拒')
  assert.equal(mod.Config.safeParse({ probeTimeoutMs: 1000 }).success, true)
  assert.equal(mod.Config.safeParse({ probeTimeoutMs: 600000 }).success, true)
})

test('层① 命令强制层（INV-7）：resolve 包壳 apply 后存活 + stdin 守卫 + 卸载还原（工厂形 effect）', () => {
  const { ctx, disposeAll } = makeCtx()
  const before = ctx.shell.resolve
  mod.apply(ctx, {})
  // ⚠️ 核心回归断言（rtk-kit 2026-09-29 教训）：拆除器形会让包壳在 apply 期当场死掉
  const wrapped = ctx.shell.resolve
  assert.notEqual(wrapped, before, 'apply 后 resolve 应为包壳')
  const hit = wrapped({ command: 'curl https://api.github.com/repos/acme/widgets', stdin: null })
  assert.match(hit.command, /Authorization: Bearer \$\(gh auth token\)/, 'curl→GitHub API 注入认证头')
  assert.match(hit.command, /curl -H /)
  // stdin 守卫：进程内调用（带 stdin）永不改写
  const piped = wrapped({ command: 'curl https://api.github.com/repos/acme/widgets', stdin: 'payload' })
  assert.equal(piped.command, 'curl https://api.github.com/repos/acme/widgets', 'stdin != null 不改写')
  // 非 GitHub 命令不动
  assert.equal(wrapped({ command: 'ls -la', stdin: null }).command, 'ls -la')
  // 拆除=还原（C-1 收敛释放）：teardown 后改写消失
  disposeAll()
  const after = ctx.shell.resolve({ command: 'curl https://api.github.com/repos/acme/widgets', stdin: null })
  assert.equal(after.command, 'curl https://api.github.com/repos/acme/widgets', '卸载后 shell.resolve 还原')
})

test('层① 配置开关（INV-7 零回归）：enabled:false/enforceCommands:false 请求期透传', () => {
  for (const config of [{ enabled: false }, { enforceCommands: false }]) {
    const { ctx, disposeAll } = makeCtx()
    mod.apply(ctx, config)
    const r = ctx.shell.resolve({ command: 'curl https://api.github.com/api.github.com/x', stdin: null })
    assert.equal(r.command, 'curl https://api.github.com/api.github.com/x', `${JSON.stringify(config)} 不改写`)
    disposeAll()
  }
})

test('层② web_fetch 门禁（INV-7）：deny/ask 决策 + 非目标放行 + off 不注册', async () => {
  for (const [policy, kind] of [['deny', 'deny'], ['ask', 'ask']]) {
    const { ctx, calls, disposeAll } = makeCtx()
    mod.apply(ctx, { webFetchPolicy: policy })
    const gate = calls.ons.find((o) => o.ev === 'tools/pre-execute')?.fn
    assert.ok(gate, `webFetchPolicy=${policy} 应注册 pre-execute 门禁`)
    const next = () => 'NEXT'
    const denied = await gate({ name: 'web_fetch', arguments: { url: 'https://api.github.com/repos/x' } }, next)
    assert.equal(denied.kind, kind, 'GitHub API 主机按策略回拒')
    assert.equal(await gate({ name: 'web_fetch', arguments: { url: 'https://example.com/x' } }, next), 'NEXT', '非目标主机放行')
    assert.equal(await gate({ name: 'bash', arguments: { command: 'ls' } }, next), 'NEXT', '非 web_fetch 放行')
    disposeAll()
  }
  const off = makeCtx()
  mod.apply(off.ctx, { webFetchPolicy: 'off' })
  assert.equal(off.calls.ons.find((o) => o.ev === 'tools/pre-execute'), undefined, 'off 不注册门禁')
  off.disposeAll()
})

test('层③ 工具集（INV-7）：11 个工具注册 + runGh 收编 gh-auth.makeRunGh 真执行 + 开关', async () => {
  const { ctx, calls, disposeAll } = makeCtx()
  mod.apply(ctx, { ghBin: 'echo', registerRepoTools: true })
  assert.equal(calls.tools.length, 11, 'github_* 工具 11 个（INV-7 零回归）')
  const search = calls.tools.find((t) => t.name === 'github_repo_search')
  assert.ok(search)
  // 真执行缝：spec.commands → gh-auth.makeRunGh(ghBin='echo') spawnSync（零真实凭据）
  const out = await search.execute({ query: 'hello' }, undefined)
  assert.match(out.text, /search repos hello/, '工具输出经收编后的 makeRunGh 执行器产出')
  assert.equal(typeof out.text, 'string')
  disposeAll()
  const off = makeCtx()
  mod.apply(off.ctx, { ghBin: 'echo', registerRepoTools: false })
  assert.equal(off.calls.tools.length, 0)
  off.disposeAll()
})

test('层④ awareness 注入（INV-7）：session-start 注入约定文案 + 开关', () => {
  const { ctx, calls, disposeAll } = makeCtx()
  mod.apply(ctx, {})
  const hook = calls.ons.find((o) => o.ev === 'agent/session-start')?.fn
  assert.ok(hook, 'awareness 应注册 session-start 注入')
  const msgs = []
  hook({ agent: { inject: (m) => msgs.push(m) } })
  assert.equal(msgs.length, 1)
  assert.match(JSON.stringify(msgs[0]), /GitHub 访问约定/, '注入 GitHub 访问约定文案')
  disposeAll()
  const off = makeCtx()
  mod.apply(off.ctx, { awareness: false })
  assert.equal(off.calls.ons.find((o) => o.ev === 'agent/session-start'), undefined, 'awareness:false 不注册')
  off.disposeAll()
})

test('层⑤ 设置面挂载（kb-context 形）：双层子插件 + 真 handler 鉴权 + 撤路由（C-1 收敛释放）', async () => {
  const { ctx, calls, disposeAll } = makeCtx()
  mod.apply(ctx, { ghBin: 'echo' })
  const { activated, specs, unmount } = activate(calls.plugins, { reject: 401 })
  assert.equal(activated, true, 'web 面 provider 在场=激活')
  assert.equal(specs.length, 1, '单 prefix 注册')
  assert.equal(specs[0].kind, 'prefix')
  assert.equal(specs[0].path, '/api/github-ops')
  // 真 handler 真鉴权缝（INV-3）
  const r = await call(specs[0].handler, { url: '/api/github-ops/status' })
  assert.equal(r.status, 401)
  assert.equal(r.json.code, 'GHO-AUTH-01')
  assert.equal(r.json.ok, false)
  // 撤销：撤路由（审计 W 教训反着做）
  unmount()
  assert.equal(specs[0].disposed, true, '卸载应撤路由')
  disposeAll()
})

test('层⑤ deps 缝：runGh（gh-auth 收编）真执行 + workspaceDir=宿主 registry 工作区', async () => {
  // 宿主工作区=临时 git 仓（remote 非 GitHub：不触 gh，零网络零凭据）
  const ws = mkdtempSync(join(tmpdir(), 'gho-ws-'))
  execFileSync('git', ['init', '-q'], { cwd: ws })
  execFileSync('git', ['remote', 'add', 'origin', 'https://gitlab.example/ctxws/unique-ctx-ws.git'], { cwd: ws })
  const { ctx, calls, disposeAll } = makeCtx({
    services: { workspaceRegistry: { list: () => [{ id: 'w1', path: ws, title: 'ws', sessionIds: [] }] } },
  })
  mod.apply(ctx, { ghBin: 'echo' })
  const { activated, specs, unmount } = activate(calls.plugins, {})
  assert.equal(activated, true, 'web 面 provider 在场=激活')
  // deps.workspaceDir 注入宿主工作区（勿留 process.cwd()）：remote 必须来自临时仓而非插件目录
  const rc = await call(specs[0].handler, { url: '/api/github-ops/repo-context' })
  assert.equal(rc.status, 200)
  assert.equal(rc.json.git.remotes[0].url, 'https://gitlab.example/ctxws/unique-ctx-ws.git', 'repo-context 走宿主工作区 git remote')
  assert.equal(rc.json.repo, null, '非 GitHub remote 不触 gh')
  assert.match(rc.json.hint, /非 GitHub 主机/)
  // deps.runGh 收编真执行：/check 三段探针经 gh-auth.makeRunGh（ghBin='echo' → 输出非 JSON 归因）
  const ck = await call(specs[0].handler, { method: 'POST', url: '/api/github-ops/check', body: {} })
  assert.equal(ck.status, 200)
  assert.equal(ck.json.ok, false)
  assert.equal(ck.json.stage, 'local-config', '探针①真实执行过（echo 输出无法解析为 JSON 的归因）')
  unmount()
  disposeAll()
})

test('非 web 部署面（Ruling-3 核心证据）：无 webServer/connection provider → 数据面延迟激活缺席，四层（含层①包壳）照常存活', () => {
  const { ctx, calls, disposeAll } = makeCtx()
  const before = ctx.shell.resolve
  mod.apply(ctx, { ghBin: 'echo' }) // 外层 inject=['shell','tools'] 恒可激活（0.2.1 语义，headless/acp/sdk 同）
  const m = activate(calls.plugins, { provideWeb: false })
  assert.equal(m.activated, false, 'provider 缺位=内层子插件延迟激活（不 apply）')
  assert.equal(m.specs.length, 0, '数据面缺席不炸装载（INV-6 fail-open）')
  // 四层照常存活（本裁决核心断言：数据面缺席≠四层死）
  assert.notEqual(ctx.shell.resolve, before, '层①包壳在场')
  assert.match(ctx.shell.resolve({ command: 'curl https://api.github.com/repos/x', stdin: null }).command, /Bearer \$\(gh auth token\)/)
  assert.equal(calls.tools.length, 11, '层③工具集照常注册')
  assert.ok(calls.ons.find((o) => o.ev === 'tools/pre-execute'), '层②门禁照常注册')
  assert.ok(calls.ons.find((o) => o.ev === 'agent/session-start'), '层④awareness 照常注册')
  disposeAll()
  assert.equal(ctx.shell.resolve({ command: 'curl https://api.github.com/repos/x', stdin: null }).command, 'curl https://api.github.com/repos/x', '卸载还原照常（工厂形拆除器）')
})

test('fail-open（INV-6）：ctx.plugin 缺位不炸装载；enabled:false 不挂设置面', () => {
  const bare = makeCtx()
  delete bare.ctx.plugin
  assert.doesNotThrow(() => mod.apply(bare.ctx, {}), 'ctx.plugin 缺位 fail-open')
  bare.disposeAll()
  const off = makeCtx()
  mod.apply(off.ctx, { enabled: false })
  assert.equal(off.calls.plugins.length, 0, 'enabled:false 全层关（含设置面）')
  off.disposeAll()
})
