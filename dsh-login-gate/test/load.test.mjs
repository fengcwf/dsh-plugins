import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

// ⚠️ 冒烟测试（2026-09-23 事故教训）：真 import 入口模块——缺依赖/断链立刻红
// （`node --check` 不解析 import；空测试集不算绿）。
test('插件入口可加载：依赖解析 + 导出契约完整', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.name, 'string')
  assert.ok(Array.isArray(mod.inject))
  assert.equal(typeof mod.apply, 'function')
  assert.ok(mod.Config && typeof mod.Config === 'object')
})

// apply() 整体冒烟（假 ctx 真 apply + gate listener 不真监听端口的缝处理）：
// 门禁 effect 体真跑（真 createGateServer + 真 listen 尝试），但端口预占=EADDRINUSE 缝——
// listener 绝不真监听，同时验证「监听失败留痕不炸 + 拆除收敛」的运行时缝成立（B1/B2 整体形）。
test('apply() 整体冒烟：假 ctx 真 apply——B1/B2 注册面 + 门禁 effect 真跑（端口预占=不真监听）', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'dlg-load-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    rmSync(home, { recursive: true, force: true })
  })

  // 缝处理：预占端口——门禁 listener 的真 listen 必 EADDRINUSE（绝不真监听）
  const busy = http.createServer()
  await new Promise((resolve) => busy.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => busy.close(resolve)))
  const port = busy.address().port

  const effects = []
  const plugins = []
  const logs = []
  const ctx = {
    effect: (fn, label) => effects.push({ fn, label }),
    plugin: (spec) => plugins.push(spec),
    logger: { info: (line) => logs.push(String(line)) },
    get: () => undefined,
  }
  apply(ctx, { port, usersFile: join(home, 'users.json'), users: { boss: 'scrypt$16384$8$1$aa$bb' } })

  // 整体形：1 子插件缝（B1：硬 inject webServer/connection）+ 1 门禁 effect（label 在）
  assert.equal(plugins.length, 1, 'apply() 注册 webServer 子插件缝')
  assert.deepEqual(plugins[0].inject, ['webServer', 'connection'])
  assert.equal(effects.length, 1, 'apply() 收一个门禁 effect')
  assert.match(effects[0].label, /登录门禁/)

  // 真跑门禁 effect 体：真 createGateServer + 真 listen 尝试 → EADDRINUSE → 留痕不炸
  const dispose = effects[0].fn()
  assert.equal(typeof dispose, 'function', 'effect 返回拆除器')
  const deadline = Date.now() + 2000
  while (!logs.some((l) => l.includes('门禁监听失败')) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.ok(logs.some((l) => l.includes('门禁监听失败')), `监听失败留痕不炸（实得：${JSON.stringify(logs)}）`)

  dispose()
  dispose() // 幂等/不炸
  assert.ok(logs.some((l) => l.includes('已停止')), '拆除收敛留痕')
})
