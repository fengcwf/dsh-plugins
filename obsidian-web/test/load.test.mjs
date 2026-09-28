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
    // 0.1.1 规格锁扩展（fix-boot-lock 后续裁定：索引库迁出 CIFS 落本地盘）：indexDir=索引库基目录，
    //   字面默认 `~/.dsh/cache/obsidian-web`（~ 展开/空串回落语义锁定 test/index-dir.test.mjs）
    indexDir: '~/.dsh/cache/obsidian-web',
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    ui: { pageSize: 50 },
    // T9 规格锁扩展（Ruling 见 task-9-report：server 组随分享服务接线扩 shareHost/trustProxy，
    // 与 T1 server.sharePort 同款扩展先例；trustProxy 缺省空=C2 IP 口径 XFF 一律忽略）
    // 0.2.0 fix-ui-port 规格修订（照 better-sidebar 路线，OW-INV-2 批注）：默认不再开自有端口——
    //   sharePort=null=分享面挂 ctx.webServer（dsh web 3080 同域 /ob_share）；number=独立 listener（可选）。
    //   对外契约 3500 /ob_share/<token> 由 login-gate/nginx 直通反代保持（PATH 契约非端口契约）。
    server: { sharePort: null, shareHost: '0.0.0.0', trustProxy: [] },
  }
  assert.deepEqual(Config.parse({}), expected)
  assert.deepEqual(Config.parse(undefined), expected, '顶层 .prefault 容忍 undefined → 全默认（T1 教训）')
  assert.deepEqual(Config.parse({}).server.trustProxy, [], 'trustProxy 缺省空数组（XFF 忽略口径）')
  assert.notEqual(Config.parse({}).server.trustProxy, Config.parse({}).server.trustProxy, '数组默认值不得共享引用')
})

test('Config 部分覆盖只改触达键（热改语义）', async () => {
  const { Config } = await import('../lib/index.js')
  const c = Config.parse({ share: { defaultTtlDays: 30 }, ui: { pageSize: 100 } })
  assert.equal(c.share.defaultTtlDays, 30)
  assert.equal(c.share.enabled, true, '未触达键保持默认')
  assert.equal(c.share.requirePasswordForWrite, true)
  assert.equal(c.ui.pageSize, 100)
  assert.equal(c.vaultRoot, '/mnt/unraid_data/Obsidian', '未触达键 vaultRoot 保持默认（字面锁定）')
  assert.equal(c.indexDir, '~/.dsh/cache/obsidian-web', '未触达键 indexDir 保持默认（字面锁定）')
  assert.equal(Config.parse({ indexDir: '/data/idx' }).indexDir, '/data/idx', 'indexDir 显式覆盖只改触达键')
  // 0.2.0 fix-ui-port：sharePort 双模式契约（null=挂 webServer 默认 / number=独立 listener 可选）
  assert.equal(c.server.sharePort, null, 'sharePort 默认 null=挂 webServer（默认不开自有端口）')
  assert.equal(Config.parse({ server: { sharePort: 4501 } }).server.sharePort, 4501, 'number=独立 listener 可选模式')
  assert.equal(Config.parse({ server: { sharePort: null } }).server.sharePort, null, '显式 null 合法（回 webServer 模式）')
})

test('Config 拒绝错误类型（schema 真校验，非透传）', async () => {
  const { Config } = await import('../lib/index.js')
  assert.throws(() => Config.parse({ vaultRoot: 123 }), 'vaultRoot 非字符串必须拒')
  assert.throws(() => Config.parse({ indexDir: 123 }), 'indexDir 非字符串必须拒')
  assert.throws(() => Config.parse({ share: { enabled: 'yes' } }), 'share.enabled 非布尔必须拒')
  assert.throws(() => Config.parse({ share: { defaultTtlDays: '7' } }), 'defaultTtlDays 非数字必须拒')
  assert.throws(() => Config.parse({ share: { requirePasswordForWrite: 1 } }), 'requirePasswordForWrite 非布尔必须拒')
  assert.throws(() => Config.parse({ ui: { pageSize: 'fifty' } }), 'pageSize 非数字必须拒')
  assert.throws(() => Config.parse({ server: { sharePort: '3500' } }), 'sharePort 非数字必须拒')
  assert.throws(() => Config.parse({ server: { sharePort: 70000 } }), 'sharePort 越界必须拒')
  assert.throws(() => Config.parse({ server: { sharePort: true } }), 'sharePort 布尔必须拒（nullable number 不含布尔）')
  assert.throws(() => Config.parse({ server: { sharePort: 0 } }), 'sharePort 下界必须拒')
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
