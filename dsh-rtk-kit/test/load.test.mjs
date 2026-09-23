import test from 'node:test'
import assert from 'node:assert/strict'

// ⚠️ 冒烟测试（2026-09-23 事故教训）：纯模块测试 + node --check 都不解析 index.js 的
// import —— 当日"全绿"但插件因 zod/@deepseek-ai 依赖缺失根本无法加载，dsh web boot 崩溃。
// 本测试必须真 import 入口模块，缺依赖立刻红。修复依赖：/root/.dsh/plugins/ensure-deps.sh
test('插件入口可加载：依赖解析 + 导出契约完整', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(typeof mod.name, 'string')
  assert.ok(Array.isArray(mod.inject))
  assert.equal(typeof mod.apply, 'function')
  assert.ok(mod.Config && typeof mod.Config === 'object')
})
