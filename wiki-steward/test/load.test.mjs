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
  const ctx = { logger: { warn: (line) => warnings.push(line) }, on: () => {}, tools: { register: () => {} }, get: () => ({ interval: () => () => {} }) } // T9：apply 注册三事件缝；T12：tools 缝（缺失会另计 fail-open 留痕，见 wire.test）；T13：timer 缝（同款）
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
    apply({ on: () => {}, tools: { register: () => {} }, get: () => ({ interval: () => () => {} }) }, { secrets: { enabled: 'on' } })
  } finally {
    console.warn = orig
  }
  assert.equal(recorded.length, 1)
  assert.match(recorded[0], /secrets/)
})
