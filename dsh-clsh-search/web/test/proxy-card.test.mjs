// proxy-card.test.mjs — Task 23 代理配置卡机械判据 + 行为面（US-13、INV-18/R20/R21、K-19/K-15/K-11）。
// 行为面走权威纯函数/门禁（lib 面）：Config proxyItem refine / useProxy 默认映射 / resolveProxyForItem 诚实面。
// 零真联网（INV-14 离线绿）。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Config } from '../../lib/index.js'
import { proxyStatusForItem, resolveProxyForItem } from '../../lib/sources/custom.js'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'ProxyCard.vue'), 'utf8')
const APP = readFileSync(path.join(SRC_DIR, 'App.vue'), 'utf8')

test('机械面：ProxyCard ≤300 行、零条件渲染、零自造色、样式 scoped（K-11/K-22）', () => {
  const lines = CARD.split('\n').length
  assert.ok(lines <= 300, `组件 ${lines} 行超 300 行上限`)
  assert.equal(/v-if/.test(CARD), false, '组件出现 v-if（K-11 禁条件渲染重交互）')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
  assert.equal(hexPattern.test(CARD), false, '组件出现硬编码 hex')
  assert.equal(rgbPattern.test(CARD), false, '组件出现硬编码 rgb/hsl')
  assert.match(CARD, /<style scoped>/, '组件缺 <style scoped>')
})

test('K-19 文字面：「不支持代理认证」明示 + user:pass@ 拒收在位', () => {
  assert.match(CARD, /本插件不支持代理认证/, 'K-19「不支持代理认证」明示文案缺位')
  assert.match(CARD, /user:pass@/, '凭据形态拒收提示缺位')
  assert.match(CARD, /includes\('@'\)/, '凭据形态判定缺位')
})

test('形制（T-F 瘦身后）：代理池增删改 + 每源勾选零残留 + 空池明示原文 + proxyId backlog 注记', () => {
  assert.match(CARD, /@click="onSubmit"/, '池提交（增/改）缺位')
  assert.match(CARD, /@click="onEdit\(item\)"/, '池编辑缺位')
  assert.match(CARD, /@click="onDelete\(item\.id\)"/, '池删除缺位')
  // T-F：每源代理勾选已移至源管理卡（SourceCard/SourceRow）——本卡零残留
  assert.doesNotMatch(CARD, /onToggleSource|onToggleCustom/, '每源开关函数已移出本卡')
  assert.equal(/use-proxy|useProxy/.test(CARD), false, '每源代理勾选字面零残留')
  assert.doesNotMatch(CARD, /role="switch"/, '开关控件零残留')
  assert.match(CARD, /每源是否走代理已移至源管理卡/, '卡片说明缺「已移至源管理卡」指引（用户不迷路）')
  assert.match(CARD, /不静默回落直连/, '空池明示错误文案缺位（0.2.0 poolError 原文·诚实面）')
  assert.match(CARD, /proxyId/, 'proxyId backlog 注记缺位')
  assert.match(CARD, /INV-19/, 'INV-19 不自扩键注记缺位')
})

test('R21 行为面：useProxy 默认映射 = ddg/bing 走代理、so360/baidu 直连（与 Config 默认值一致）', () => {
  const defaults = Config.parse({}).sources.useProxy
  assert.equal(defaults.ddg, true, 'ddg 默认应走代理（R21）')
  assert.equal(defaults.bing, true, 'bing 默认应走代理（R21）')
  assert.equal(defaults.so360, false, 'so360 默认应直连（R21）')
  assert.equal(defaults.baidu, false, 'baidu 默认应直连（R21）')
})

test('INV-18/R20 行为面：proxyItem 双 refine——凭据形态与畸形地址拒（zod）', () => {
  const base = { id: 'p1', label: '主力', address: '192.168.0.41:7890' }
  assert.ok(Config.parse({ proxies: [base] }), '合法代理项应通过')
  assert.throws(() => Config.parse({ proxies: [{ ...base, address: 'user:pass@192.168.0.41:7890' }] }), '凭据形态应拒')
  assert.throws(() => Config.parse({ proxies: [{ ...base, address: 'not-an-address' }] }), '畸形地址应拒')
  assert.throws(() => Config.parse({ proxies: [base, { ...base }] }), 'id 重复应拒')
})

test('诚实面：resolveProxyForItem 空池自动直连 + 降级标志（T-A2 产品裁定）+ 池首项主力口径', () => {
  assert.equal(resolveProxyForItem({ useProxy: false }, { proxies: [] }), undefined, '未勾选应回直连')
  // T-A2（产品裁定 2026-10-10）：空池勾选 = 自动直连 + 可探测降级标志（替代旧 PROXY_UNAVAILABLE 抛错）
  assert.equal(resolveProxyForItem({ useProxy: true }, { proxies: [] }), undefined, '空池勾选自动直连（不抛，开箱即用不破）')
  assert.deepEqual(
    proxyStatusForItem({ useProxy: true }, { proxies: [] }),
    { wantProxy: true, active: false, degraded: true, reason: 'proxy-pool-empty' },
    '降级标志可探测（UI 提示「已勾选但未配代理地址，当前直连」）',
  )
  const pool = [
    { id: 'p1', label: '主力', address: '192.168.0.41:7890' },
    { id: 'p2', label: '备用', address: '127.0.0.1:7891' },
  ]
  assert.deepEqual(resolveProxyForItem({ useProxy: true }, { proxies: pool }), { address: '192.168.0.41:7890' }, '当前口径=池首项主力')
})

test('保存链 + 挂载（P-6）：emit 整替形制（勾选写回已移出）+ App 五卡序（代理配置在接管与隐私之后、诊断之前）', () => {
  assert.match(CARD, /emit\('change', \{ proxies:/, '池写回应 emit proxies 整替')
  assert.doesNotMatch(CARD, /emit\('change', \{ useProxy:/, '勾选写回已移出本卡（T-F 瘦身）')
  assert.match(APP, /<ProxyCard/, 'App.vue 挂载缺位（不挂载=半成品，队长 P-6 裁定）')
  const iTakeover = APP.indexOf('<TakeoverCard')
  const iProxy = APP.indexOf('<ProxyCard')
  const iDiag = APP.indexOf('<DiagnosticsCard')
  assert.ok(iProxy > iTakeover, '代理配置须在接管与隐私之后（五卡序）')
  assert.ok(iDiag > iProxy, '诊断须在代理配置之后（五卡序，INV-21）')
})
