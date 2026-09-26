import test from 'node:test'
import assert from 'node:assert/strict'

// ⚠️ 冒烟测试（2026-09-23 事故教训）：真 import 入口模块——缺依赖/断链立刻红
// （`node --check` 不解析 import；空测试集不算绿）。

test('插件入口可加载：依赖解析 + 导出契约完整', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'obsidian-web')
  assert.ok(Array.isArray(mod.inject))
  assert.equal(typeof mod.apply, 'function')
  assert.ok(mod.Config && typeof mod.Config.parse === 'function')
})

test('缝位就位：inject 声明 webServer（OW-INV-10 同域 3080）+ connection（OW-INV-8 鉴权缝）', async () => {
  const mod = await import('../lib/index.js')
  assert.deepEqual([...mod.inject].sort(), ['connection', 'webServer'], '宿主服务缝名不得漂移（实测核对 dsh checkout 服务名）')
})

test('R13 回归：default 导出是 {inject, apply} 对象，不是工厂函数', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.default, 'object')
  assert.notEqual(typeof mod.default, 'function')
  assert.equal(mod.default.inject, mod.inject)
  assert.equal(mod.default.apply, mod.apply)
})

test('Config 全键默认值与契约精确一致（delta-specs §2）', async () => {
  const { Config } = await import('../lib/index.js')
  const expected = {
    vaultRoot: '/mnt/unraid_data/Obsidian',
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    ui: { pageSize: 50 },
    server: { sharePort: 3500 },
  }
  assert.deepEqual(Config.parse({}), expected)
  assert.deepEqual(Config.parse(undefined), expected, '顶层 .prefault 容忍 undefined → 全默认（T1 教训）')
})

test('Config 部分覆盖只改触达键（热改语义）', async () => {
  const { Config } = await import('../lib/index.js')
  const c = Config.parse({ share: { defaultTtlDays: 30 }, ui: { pageSize: 100 } })
  assert.equal(c.share.defaultTtlDays, 30)
  assert.equal(c.share.enabled, true, '未触达键保持默认')
  assert.equal(c.share.requirePasswordForWrite, true)
  assert.equal(c.ui.pageSize, 100)
  assert.equal(c.vaultRoot, '/mnt/unraid_data/Obsidian', '未触达键 vaultRoot 保持默认（字面锁定）')
  assert.equal(c.server.sharePort, 3500)
})

test('Config 拒绝错误类型（schema 真校验，非透传）', async () => {
  const { Config } = await import('../lib/index.js')
  assert.throws(() => Config.parse({ vaultRoot: 123 }), 'vaultRoot 非字符串必须拒')
  assert.throws(() => Config.parse({ share: { enabled: 'yes' } }), 'share.enabled 非布尔必须拒')
  assert.throws(() => Config.parse({ share: { defaultTtlDays: '7' } }), 'defaultTtlDays 非数字必须拒')
  assert.throws(() => Config.parse({ share: { requirePasswordForWrite: 1 } }), 'requirePasswordForWrite 非布尔必须拒')
  assert.throws(() => Config.parse({ ui: { pageSize: 'fifty' } }), 'pageSize 非数字必须拒')
  assert.throws(() => Config.parse({ server: { sharePort: '3500' } }), 'sharePort 非数字必须拒')
  assert.throws(() => Config.parse({ server: { sharePort: 70000 } }), 'sharePort 越界必须拒')
})

test('Config 默认值无可变共享引用（多次 parse 互不污染）', async () => {
  const { Config } = await import('../lib/index.js')
  const a = Config.parse({})
  a.share.enabled = false
  a.ui.pageSize = 1
  const b = Config.parse({})
  assert.equal(b.share.enabled, true)
  assert.equal(b.ui.pageSize, 50)
})

test('apply：非法配置留痕不静默（INV-15），合法配置零告警', async () => {
  const { apply } = await import('../lib/index.js')
  const warnings = []
  const ctx = { logger: { warn: (line) => warnings.push(line) } }
  apply(ctx, { ui: { pageSize: 'oops' } })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /ui\.pageSize/)
  warnings.length = 0
  apply(ctx, { vaultRoot: '/tmp/vault' })
  assert.equal(warnings.length, 0, '合法配置零告警')
  apply(ctx, undefined)
  assert.equal(warnings.length, 0, '缺省配置走默认零告警')
})

test('apply：无 logger 时回落 console.warn（行为不丢）', async () => {
  const { apply } = await import('../lib/index.js')
  const recorded = []
  const orig = console.warn
  console.warn = (line) => recorded.push(line)
  try {
    apply({}, { server: { sharePort: 'nope' } })
  } finally {
    console.warn = orig
  }
  assert.equal(recorded.length, 1)
  assert.match(recorded[0], /server\.sharePort/)
})
