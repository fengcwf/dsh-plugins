import test from 'node:test'
import assert from 'node:assert/strict'

// ⚠️ 冒烟测试（2026-09-23 事故教训）：真 import 入口模块——缺依赖/断链立刻红
// （`node --check` 不解析 import；空测试集不算绿）。
// 真被测件零 mock：直接 import('../lib/index.js')，无宿主缝，输出干净。

test('插件入口可加载：依赖解析 + 导出契约完整', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'wiki-steward')
  assert.ok(Array.isArray(mod.inject))
  assert.equal(typeof mod.apply, 'function')
  assert.ok(mod.Config && typeof mod.Config.parse === 'function')
})

test('R13 回归：default 导出是 {inject, apply} 对象，不是工厂函数', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.default, 'object')
  assert.notEqual(typeof mod.default, 'function')
  assert.equal(mod.default.inject, mod.inject)
  assert.equal(mod.default.apply, mod.apply)
})

test('T12 工具注册收口钉住：inject = [\'tools\']（宿主 tools 服务缝；T8 壳期 [] 的演进终点）', async () => {
  const { inject } = await import('../lib/index.js')
  assert.deepEqual(inject, ['tools'])
})

test('Config 全键默认值与契约精确一致（delta-spec §2 整行 + T9 vaultRoot 补键）', async () => {
  const { Config } = await import('../lib/index.js')
  const expected = {
    // T9 裁定补键（task-9 报告申报）：delta-spec §2 未列 vaultRoot，但捕获必须落盘——
    // 与 kb-context R2 同名同默认（单一来源 DEFAULT_VAULT_ROOT），测试临时 root 注入通道。
    vaultRoot: '/mnt/unraid_data/Obsidian',
    capture: { bufferRounds: 3, enabled: true },
    write: { readOnly: true },
    queue: { maxRetries: 3, ttlDays: 7 },
    secrets: { enabled: true },
  }
  assert.deepEqual(Config.parse({}), expected)
  assert.deepEqual(Config.parse(undefined), expected)
})

test('Config 部分覆盖只改触达键（热改语义：每次读当前 config）', async () => {
  const { Config } = await import('../lib/index.js')
  const c = Config.parse({ capture: { bufferRounds: 5 }, write: { readOnly: false } })
  assert.deepEqual(c.capture, { bufferRounds: 5, enabled: true })
  assert.equal(c.write.readOnly, false)
  assert.equal(c.queue.maxRetries, 3, '未触达键 queue.maxRetries 保持默认（字面锁定）')
  assert.equal(c.queue.ttlDays, 7)
  assert.deepEqual(c.secrets, { enabled: true })
})

test('Config 拒绝错误类型（schema 真校验，非透传）', async () => {
  const { Config } = await import('../lib/index.js')
  assert.throws(() => Config.parse({ capture: { bufferRounds: '3' } }))
  assert.throws(() => Config.parse({ capture: { enabled: 'yes' } }))
  assert.throws(() => Config.parse({ write: { readOnly: 'true' } }))
  assert.throws(() => Config.parse({ queue: { maxRetries: 'three' } }))
  assert.throws(() => Config.parse({ secrets: { enabled: 1 } }))
  assert.throws(() => Config.parse({ vaultRoot: 1 }))
})

test('Config 默认值无可变共享引用（多次 parse 互不污染）', async () => {
  const { Config } = await import('../lib/index.js')
  const a = Config.parse({})
  a.capture.bufferRounds = 99
  a.write.readOnly = false
  const b = Config.parse({})
  assert.equal(b.capture.bufferRounds, 3)
  assert.equal(b.write.readOnly, true)
})

test('apply：非法配置留痕不静默（INV-15），合法配置零告警', async () => {
  const { apply } = await import('../lib/index.js')
  const warnings = []
  const ctx = { logger: { warn: (line) => warnings.push(line) }, on: () => {}, tools: { register: () => {} }, get: () => ({ interval: () => () => {} }), webServer: { register: () => () => {} }, connection: { requestRejection: () => undefined } } // T9：apply 注册三事件缝；T12：tools 缝（缺失会另计 fail-open 留痕，见 wire.test）；T13：timer 缝（同款）；本特性：webServer/connection 缝（缺失会另计留痕，见 ingest-wire.test）
  apply(ctx, { capture: { bufferRounds: '3' } })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /bufferRounds/)
  warnings.length = 0
  apply(ctx, { queue: { ttlDays: 14 } })
  assert.equal(warnings.length, 0)
  apply(ctx, undefined)
  assert.equal(warnings.length, 0)
})

test('apply：无 logger 时回落 console.warn（行为不丢）', async () => {
  const { apply } = await import('../lib/index.js')
  const recorded = []
  const orig = console.warn
  console.warn = (line) => recorded.push(line)
  try {
    apply({ on: () => {}, tools: { register: () => {} }, get: () => ({ interval: () => () => {} }), webServer: { register: () => () => {} }, connection: { requestRejection: () => undefined } }, { secrets: { enabled: 'on' } })
  } finally {
    console.warn = orig
  }
  assert.equal(recorded.length, 1)
  assert.match(recorded[0], /secrets/)
})

test('B1/B2 服务缝契约（2026-09-28 b1b2 修复波）：数据面经子插件硬 inject [\'webServer\',\'connection\']；effect 收到执行体、返回值=拆除器', async () => {
  const { apply } = await import('../lib/index.js')
  const pluginCalls = []
  const effects = []
  const warnings = []
  const registerCalls = []
  let disposerCalls = 0
  const ctx = {
    logger: { warn: (l) => warnings.push(l) },
    on: () => {},
    tools: { register: () => {} },
    get: (name) => (name === 'timer' ? { interval: () => () => {} } : undefined),
    // 子插件缝（宿主 _refresh 模拟）：服务齐即激活；effect 真语义（execute 立即跑、返回值=拆除器）
    plugin: (p) => {
      pluginCalls.push(p)
      p.apply({
        webServer: { register: (spec) => { registerCalls.push(spec); return () => { disposerCalls += 1 } } },
        connection: { requestRejection: () => undefined },
        logger: ctx.logger,
        get: ctx.get,
        effect: (execute, label) => { const teardown = execute(); effects.push({ label, teardown }); return teardown },
      })
      return {}
    },
  }
  apply(ctx, undefined)
  // 【新增 D4①】子注入契约：数据面子插件硬 inject 恰 ['webServer','connection']（外层 inject=['tools'] 不动，见上方 26 行）
  assert.equal(pluginCalls.length, 1)
  assert.deepEqual(pluginCalls[0].inject, ['webServer', 'connection'])
  // 【新增 D4②】拆除器契约：注册在 effect 执行体内当场发生、apply 返回后零自拆、返回值=拆除器（全撤、幂等）
  assert.equal(registerCalls.length, 1)
  assert.equal(disposerCalls, 0, '注册完即自拆=缺陷（B2 修复前必红）')
  assert.equal(effects.length, 1)
  assert.equal(typeof effects[0].teardown, 'function')
  effects[0].teardown()
  assert.equal(disposerCalls, 1, '拆除器全撤')
  effects[0].teardown()
  assert.equal(disposerCalls, 1, '拆除器幂等')
  assert.equal(warnings.length, 0, '健康路径零告警（既有告警计数契约零改动）')
})
