// source-health.test.mjs — Task 20 源健康行机械判据（K-11 零自造色/禁 v-if、K-15 出网仅按钮、R23/R30、INV-14）。
// UI 面无 DOM runner：沿 k-constraints 形制做源码面机械断言；本文件自身零真联网调用（INV-14 离线绿硬门禁）。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Config } from '../../lib/index.js'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'SourceHealthRow.vue'), 'utf8')
const STYLES = readFileSync(path.join(SRC_DIR, 'styles.css'), 'utf8')
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf8')

test('机械面：SourceHealthRow ≤300 行、零 v-if、零自造色（K-11/K-22）', () => {
  const lines = CARD.split('\n').length
  assert.ok(lines <= 300, `组件 ${lines} 行超 300 行上限`)
  assert.equal(/v-if/.test(CARD), false, '组件出现 v-if（K-11 禁条件渲染重交互）')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
  assert.equal(hexPattern.test(CARD), false, '组件出现硬编码 hex')
  assert.equal(rgbPattern.test(CARD), false, '组件出现硬编码 rgb/hsl')
})

test('样式隔离：样式全在组件内 <style scoped>，styles.css 零 sh- 类（不碰共享样式面）', () => {
  assert.match(CARD, /<style scoped>/, '组件缺 <style scoped>')
  assert.equal(/sh-/.test(STYLES), false, 'styles.css 出现 sh- 类（Task 20 禁碰共享样式面）')
  for (const cls of ['.sh-card', '.sh-row', '.sh-status', '.sh-btn']) {
    assert.ok(CARD.includes(cls), `组件缺 ${cls} 定义或使用`)
  }
})

test('R23：单源探针超时 5s（Config.healthTimeoutMs 默认 5000）+ 组件注记在位', () => {
  assert.equal(Config.parse({}).healthTimeoutMs, 5000, 'Config.healthTimeoutMs 默认应为 5000（R23）')
  assert.match(CARD, /超时 5s/, '组件缺 R23 5s 超时注记')
})

test('单源探针仅按钮触发（INV-14）：api.probe 恰 1 处、onMounted 只拉本地统计', () => {
  assert.match(CARD, /@click="onProbe\(source\.id\)"/, '行内「测试」按钮须 click 触发 probe')
  const probeCalls = CARD.match(/api\.probe\(/g) ?? []
  assert.equal(probeCalls.length, 1, `api.probe( 仅允许出现在按钮 handler（实得 ${probeCalls.length}）`)
  const onMountedCalls = CARD.match(/onMounted\([^)]*\)/g) ?? []
  assert.deepEqual(onMountedCalls, ['onMounted(loadStats)'], 'onMounted 只允许挂本地统计加载')
  const statsBody = CARD.slice(CARD.indexOf('async function loadStats'), CARD.indexOf('/** 单源探针'))
  assert.match(statsBody, /api\.diagnostics\(\)/, 'loadStats 走本地 GET /diagnostics（非探针）')
  assert.equal(/api\.(probe|onlineTest)\(/.test(statsBody), false, '自动路径禁触任何探针/真联网调用（K-15）')
})

test('R30：真联网测试仅按钮触发、10s 总上限、超时源标「未测（超时截断）」', () => {
  assert.match(CARD, /@click="onOnlineTest"/, '「真联网测试」须为独立按钮 click 触发')
  const onlineCalls = CARD.match(/api\.onlineTest\(/g) ?? []
  assert.equal(onlineCalls.length, 1, `api.onlineTest( 仅允许出现在按钮 handler（实得 ${onlineCalls.length}）`)
  assert.match(CARD, /未测（超时截断）/, 'R30 截断标注文案缺位')
  assert.match(CARD, /result\?\.truncated === true/, 'truncated 标记处理缺位')
  assert.match(CARD, /10s/, '组件缺 R30 10s 总上限注记')
})

test('四态状态机 idle/loading/ok/error + ✓/✗ 自绘徽标 + 行形制四要素', () => {
  for (const state of ['idle', 'loading', 'ok', 'error']) {
    assert.ok(CARD.includes(`'${state}'`), `状态机缺 ${state} 态`)
  }
  assert.match(CARD, /✓ 成功/, '✓ 徽标文案缺位')
  assert.match(CARD, /✗ 失败/, '✗ 徽标文案缺位')
  assert.match(CARD, /\{\{ source\.label \}\}/, '行形制缺源名')
  assert.match(CARD, /statusText\(rowOf\(source\.id\)\)/, '行形制缺状态列')
  assert.match(CARD, /elapsedText\(rowOf\(source\.id\)\)/, '行形制缺耗时列')
  assert.match(CARD, /row\.ok \? '✓ 成功' : '✗ 失败'/, '行形制缺成功/失败判定')
})

test('INV-14 离线绿自证：本测试文件零真联网调用面（fetch/XHR/node 网络模块）', () => {
  const netPattern = new RegExp('fet' + 'ch\\(|XML' + 'HttpRequest|node:' + '(http|https|net|tls|dns)')
  assert.equal(netPattern.test(SELF), false, '测试文件出现真联网调用面（INV-14 严禁进默认集）')
})
