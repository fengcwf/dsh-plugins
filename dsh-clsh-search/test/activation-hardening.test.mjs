// activation-hardening.test.mjs — t33（V-repair）：T18-B1 运行时激活失败关闭面
//
// 病形（V 卡 t31 实证）：installSettingsRoutes 顶层裸取 ctx.webServer/connection/configEditor——
// 顶层 inject 不含 → 真 cordis 抛 cannot get property "... " without inject → entry 未激活 →
// provider 从未注册（US-1 断）；166 例未抓=fake ctx 裸属性静默返 undefined。
// 关闭面：①外层探测 softService 形 ②调用点 try/catch（settings 不拖死主链）③判据加固
// （零 did not activate / 零 cannot get property）④fake-ctx 防呆（本文件自检）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { assertSearchProvider, createFakeCtx } from './helpers/fake-ctx.mjs'
import { apply } from '../lib/index.js'

const INDEX_JS = fileURLToPath(new URL('../lib/index.js', import.meta.url))

test('夹具防呆自检：裸属性访问抛（真 cordis cannot-get-property 同语义）、set 转正为已知键', () => {
  const fixture = createFakeCtx()
  assert.throws(() => fixture.ctx.webServer, /fake-ctx 防呆.*cannot get property "webServer" without inject/)
  assert.throws(() => fixture.ctx.connection, /防呆/)
  assert.throws(() => fixture.ctx.configEditor, /防呆/)
  assert.throws(() => fixture.ctx.plugin, /防呆/)
  // 已知键照常（inject 面）
  assert.doesNotThrow(() => fixture.ctx.web)
  assert.doesNotThrow(() => fixture.ctx.systemPrompt)
  assert.doesNotThrow(() => fixture.ctx.effect)
  assert.doesNotThrow(() => fixture.ctx.logger)
  // set 转正为已知键后可读（测试注入 seam 的常规用法）
  fixture.ctx.webServer = { register: () => () => {} }
  assert.equal(typeof fixture.ctx.webServer.register, 'function')
})

test('T18-B1 回归锁：严格 ctx 下 apply 全链可装载、provider 真注册（旧病形在此必炸）', () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  // 旧病形（顶层裸取未注入服务）会在防呆 ctx 下抛——修复后整链不炸装载
  assert.doesNotThrow(() => apply(fixture.ctx, {}), 'apply 全链可装载（T18-B1 关闭）')
  assertSearchProvider(fixture, 'dsh-clsh-search') // US-1 主链：provider 真注册
  const seen = fixture.state.warnings.join('\n')
  assert.doesNotMatch(seen, /cannot get property/, '零 cannot get property（判据加固）')
  assert.doesNotMatch(seen, /did not activate/, '零 did not activate（判据加固）')
})

test('T18-B1-②：settings 面故障不拖死 provider 主链（US-1 优先于 US-3）', () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  // 注册面故障 → mountRoutes 抛 → 调用点 try/catch 收口
  fixture.ctx.webServer = {
    register() {
      throw new Error('webServer 注册面故障')
    },
  }
  assert.doesNotThrow(() => apply(fixture.ctx, {}), 'settings 故障不炸装载')
  assertSearchProvider(fixture, 'dsh-clsh-search', ) // provider 照常注册（主链不拖死）
  const seen = fixture.state.warnings.join('\n')
  assert.match(seen, /settings 面挂载失败.*web_search 主链不受影响/, '故障 warn 留痕（不静默）')
  assert.doesNotMatch(seen, /cannot get property|did not activate/)
})

test('T18-B1-③ 判据加固：index.js 无外层裸取字面（grep 锁）+ 各场景零激活失败字样', () => {
  // grep 锁：外层不得出现对未注入服务的裸取字面（softService 形动态取名，字面不落）
  const source = readFileSync(INDEX_JS, 'utf8')
  assert.doesNotMatch(source, /ctx\.webServer|ctx\.connection|ctx\.configEditor/, '外层禁裸取未注入服务（T18-B1-① grep 锁）')

  // 多场景巡检：激活失败字样（did not activate / cannot get property）零出现
  const scenarios = [
    ['裸 ctx（无任何 seam）', (fixture) => {}],
    ['webServer 在场（非 cordis 面直装）', (fixture) => { fixture.ctx.webServer = { register: () => () => {} } }],
    ['plugin 在场 + seam 缺位（cordis 面 fail-open）', (fixture) => { fixture.ctx.plugin = () => () => {} }],
  ]
  for (const [label, setup] of scenarios) {
    const fixture = createFakeCtx({ searchProviderId: '' })
    setup(fixture)
    assert.doesNotThrow(() => apply(fixture.ctx, {}), `${label}：装载不炸`)
    assertSearchProvider(fixture, 'dsh-clsh-search')
    const seen = fixture.state.warnings.join('\n')
    assert.doesNotMatch(seen, /cannot get property/, `${label}：零 cannot get property`)
    assert.doesNotMatch(seen, /did not activate/, `${label}：零 did not activate`)
  }
})

test('修复后可装载性自查：真 cordis 形（ctx.plugin + 子插件 inject 供服务）全链激活', () => {
  const fixture = createFakeCtx({ searchProviderId: '' })
  const registered = []
  let routeTeardown = null
  fixture.ctx.plugin = (spec) => {
    assert.deepEqual(spec.inject, ['webServer', 'connection'], '子插件硬 inject 两件套')
    const subCtx = {
      effect(execute) {
        routeTeardown = execute()
        return routeTeardown
      },
      webServer: { register: (s) => { registered.push(s); return () => { const i = registered.indexOf(s); if (i >= 0) registered.splice(i, 1) } } },
      connection: { requestRejection: () => null },
    }
    spec.apply(subCtx)
    return () => { if (typeof routeTeardown === 'function') routeTeardown() }
  }
  assert.doesNotThrow(() => apply(fixture.ctx, {}), '真 cordis 形装载不炸')
  // 主链与 settings 面双激活（US-1 优先、US-3 在场）
  assertSearchProvider(fixture, 'dsh-clsh-search')
  assert.equal(registered.length, 1, 'settings 路由经子插件挂载')
  assert.equal(registered[0].path, '/api/dsh-clsh-search')
  const seen = fixture.state.warnings.join('\n')
  assert.doesNotMatch(seen, /cannot get property|did not activate/, '零激活失败字样（判据加固）')
  // 拆除成对
  fixture.runTeardowns()
  assert.equal(registered.length, 0, '路由随生命周期回收')
})
