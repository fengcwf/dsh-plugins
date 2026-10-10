// source-card.test.mjs — Task 5 / T-E 源管理大卡合并机械判据（候选 2 两段式定稿、R14 收编、INV-14 纪律、K-11/K-22）。
// UI 面无 DOM runner：沿 k-constraints 形制做源码面机械断言；零真联网（离线绿硬门禁）。
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'SourceCard.vue'), 'utf8')
const ROW = readFileSync(path.join(SRC_DIR, 'components', 'SourceRow.vue'), 'utf8')
const APP = readFileSync(path.join(SRC_DIR, 'App.vue'), 'utf8')

test('机械面：SourceCard/SourceRow ≤300 行、零条件渲染、零自造色（K-11/K-22）', () => {
  for (const [name, content] of [['SourceCard.vue', CARD], ['SourceRow.vue', ROW]]) {
    const lines = content.split('\n').length
    assert.ok(lines <= 300, `${name} ${lines} 行超 300 行上限`)
    assert.equal(/v-if/.test(content), false, `${name} 出现 v-if（K-11 禁条件渲染重交互）`)
    const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
    const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
    assert.equal(hexPattern.test(content), false, `${name} 出现硬编码 hex`)
    assert.equal(rgbPattern.test(content), false, `${name} 出现硬编码 rgb/hsl`)
  }
  assert.match(ROW, /<style scoped>/, 'SourceRow 缺 <style scoped>')
})

test('3B 定稿规格：行式两段（上排=源名+代理勾选+启停；下排缩进 44px=测试+最近结果）', () => {
  assert.match(ROW, /class="sr-top"/, '上排缺位')
  assert.match(ROW, /class="sr-bottom"/, '下排缺位')
  assert.match(ROW, /padding-left: 44px/, '下排缩进 44px 缺位（DESIGN.md 3B）')
  assert.match(ROW, /padding: 10px 2px 12px/, '行内边距缺位（3B 行高口径）')
  assert.match(CARD, /<SourceRow/, 'SourceCard 未使用 SourceRow 子组件')
})

test('行内 5 件控件齐：源名 / 启停 / 代理勾选 / 测试按钮 / 最近结果', () => {
  assert.match(ROW, /\{\{ label \}\}/, '源名缺位')
  assert.match(ROW, /@click="emit\('toggle'\)"/, '启停缺位')
  assert.match(ROW, /@click="emit\('proxy'\)"/, '代理勾选缺位')
  assert.match(ROW, /@click="emit\('probe'\)"/, '测试按钮缺位')
  assert.match(ROW, /\{\{ lastText \}\}/, '最近结果缺位')
  assert.match(ROW, /is-\$\{lastState\}/, '最近结果三态着色缺位')
  assert.match(ROW, /sr-badge/, '自定义徽标缺位')
})

test('R14 收编：SourceHealthRow 已删除且 web/src 零残留引用', () => {
  assert.equal(existsSync(path.join(SRC_DIR, 'components', 'SourceHealthRow.vue')), false, 'SourceHealthRow.vue 应已删除')
  for (const file of ['App.vue', 'components/SourceCard.vue', 'components/SourceRow.vue']) {
    assert.equal(readFileSync(path.join(SRC_DIR, file), 'utf8').includes('SourceHealthRow'), false, `${file} 存在残留引用`)
  }
  assert.equal(APP.includes('<SourceHealthRow'), false, 'App 不得再挂载源健康行')
})

test('INV-14 纪律：probe/onlineTest 各恰 1 处仅按钮；onMounted 只拉本地统计', () => {
  assert.match(CARD, /@click="onOnlineTest"/, '卡头「真联网测试」按钮缺位')
  assert.match(CARD, /@probe="onProbe\(row\.id\)"/, '行内「测试」按钮接线缺位')
  assert.equal((CARD.match(/api\.probe\(/g) ?? []).length, 1, 'api.probe( 仅允许出现在按钮 handler')
  assert.equal((CARD.match(/api\.onlineTest\(/g) ?? []).length, 1, 'api.onlineTest( 仅允许出现在按钮 handler')
  const onMountedCalls = CARD.match(/onMounted\([^)]*\)/g) ?? []
  assert.deepEqual(onMountedCalls, ['onMounted(loadStats)'], 'onMounted 只允许挂本地统计加载')
  const statsBody = CARD.slice(CARD.indexOf('async function loadStats'), CARD.indexOf('/** 单源探针'))
  assert.match(statsBody, /api\.diagnostics\(\)/, 'loadStats 走本地 GET /diagnostics（非探针）')
  assert.equal(/api\.(probe|onlineTest)\(/.test(statsBody), false, '自动路径禁触探针/真联网（K-15）')
})

test('emit 整替形制 + ⠿ 拖拽排序（R25）+ R21 注记', () => {
  assert.match(CARD, /emit\('change', \{ sources: toggleSource/, '启停应 emit sources 整替')
  assert.match(CARD, /emit\('change', \{ useProxy:/, '代理勾选应 emit useProxy 整替')
  assert.match(CARD, /emit\('change', \{\s*custom: props\.custom\.map/, '自定义源代理勾选应 emit custom 整替')
  assert.match(CARD, /emit\('change', \{ priority: order \}\)/, '拖拽重排应 emit priority 整替')
  assert.match(CARD, /draggable="true"/, '拖拽把手形制缺位')
  assert.match(CARD, /@drop="onDrop\(row\.id\)"/, 'drop 重排接线缺位')
  assert.match(CARD, /境外源默认走代理\/国内源默认直连/, 'R21 默认态注记缺位')
  assert.match(CARD, /未测（超时截断）/, 'R30 截断标注缺位')
  assert.match(CARD, /超时 5s/, 'R23 探针超时注记缺位')
})

test('T-E2 降级按钮：键盘可达上移/下移 + hover/聚焦显形（零常态占位）', () => {
  assert.match(ROW, /aria-label="上移一位"/, '上移按钮缺位')
  assert.match(ROW, /aria-label="下移一位"/, '下移按钮缺位')
  assert.match(ROW, /@click="emit\('move', -1\)"/, '上移事件缺位')
  assert.match(ROW, /@click="emit\('move', 1\)"/, '下移事件缺位')
  assert.match(ROW, /:disabled="!canUp"/, '首行上移禁用缺位')
  assert.match(ROW, /:disabled="!canDown"/, '末行下移禁用缺位')
  assert.match(ROW, /position: absolute/, '降级按钮须 absolute 零常态占位（定稿密度不破坏）')
  assert.match(ROW, /opacity: 0; pointer-events: none/, '默认隐蔽缺位')
  assert.match(ROW, /\.sr-row:hover \.sr-step, \.sr-step:focus-within \{ opacity: 1/, 'hover/聚焦显形缺位')
  assert.match(CARD, /:can-up="row\.canUp"/, 'canUp 传参缺位')
  assert.match(CARD, /@move="onMove\(row\.id, \$event\)"/, 'SourceCard move 接线缺位')
})

test('T-E2 排序等价：拖拽与降级按钮同一 reorder 路径（priority 整替写回恰 1 处）', () => {
  const onDropBody = CARD.slice(CARD.indexOf('function onDrop'), CARD.indexOf('/** 上移/下移降级按钮'))
  const onMoveBody = CARD.slice(CARD.indexOf('function onMove'), CARD.indexOf('onMounted(loadStats)'))
  assert.match(onDropBody, /reorder\(/, '拖拽须走 reorder')
  assert.match(onMoveBody, /reorder\(/, '降级按钮须走 reorder（与拖拽等价）')
  const writes = CARD.match(/emit\('change', \{ priority: order \}\)/g) ?? []
  assert.equal(writes.length, 1, `priority 写回须单点（实得 ${writes.length}）`)
  assert.match(CARD, /function reorder\(fromIndex, toIndex\)/, '唯一 reorder 路径缺位')
})

test('T-G 装配：SourceCard props 补齐 + 空池降级提示接线（K-23 明示、紧贴源管理卡）+ ProxyCard 遗留绑定清零', () => {
  const srcStart = APP.indexOf('<SourceCard')
  const srcBlock = APP.slice(srcStart, APP.indexOf('/>', srcStart) + 2)
  assert.match(srcBlock, /:use-proxy="settings.useProxy"/, 'SourceCard 缺 useProxy prop（每源勾选数据源）')
  assert.match(srcBlock, /:custom="settings.custom"/, 'SourceCard 缺 custom prop（自定义源行数据源）')
  // 降级提示：紧贴源管理卡（SourceCard 之后、CustomSourceCard 之前），v-show 显隐（禁 v-if）
  const after = APP.slice(srcStart, APP.indexOf('<CustomSourceCard'))
  assert.match(after, /v-show="degradedSources\.length > 0"/, '降级提示须 v-show 按清单显隐')
  assert.match(after, /已勾选但未配代理地址，当前直连/, 'K-23 降级提示原文缺位（明示降级禁静默）')
  assert.equal(/v-if/.test(after), false, '降级提示禁 v-if（K-11）')
  // 口径镜像注记（common.js 含 node 静态导入不可进包 → App 侧镜像 + 本断言钉口径）
  assert.match(APP, /lib\/sources\/common\.js 的 proxyStatus/, '缺 proxyStatus 同口径镜像注记')
  assert.match(APP, /if \(pool\.length > 0\) return \[\]/, '非空池不列（= proxyStatus 语义）')
  assert.match(APP, /settings\.useProxy\?\.\[id\] === true/, '内置源勾选判定缺位')
  // ProxyCard 瘦身后遗留绑定清零（t54 披露闭环）
  const proxyStart = APP.indexOf('<ProxyCard')
  const proxyBlock = APP.slice(proxyStart, APP.indexOf('/>', proxyStart) + 2)
  assert.match(proxyBlock, /:proxies="settings\.proxies"/, 'ProxyCard 须接 proxies')
  assert.equal(/use-proxy|custom/.test(proxyBlock), false, 'ProxyCard 遗留勾选/自定义绑定应清零')
})
