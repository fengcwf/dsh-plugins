// log-modal.test.mjs — Task 21 触发日志弹层机械判据（INV-11 明示 / INV-12 脱敏 / R28 清空 / INV-13 不可用面 / K-11）。
// UI 面无 DOM runner：沿 k-constraints 形制做源码面机械断言；本文件零真联网调用（离线绿硬门禁）。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'LogModal.vue'), 'utf8')
const STYLES = readFileSync(path.join(SRC_DIR, 'styles.css'), 'utf8')

test('机械面：LogModal ≤300 行、零 v-if、零自造色（K-11/K-22）', () => {
  const lines = CARD.split('\n').length
  assert.ok(lines <= 300, `组件 ${lines} 行超 300 行上限`)
  assert.equal(/v-if/.test(CARD), false, '组件出现 v-if（K-11 禁条件渲染重交互）')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
  assert.equal(hexPattern.test(CARD), false, '组件出现硬编码 hex')
  assert.equal(rgbPattern.test(CARD), false, '组件出现硬编码 rgb/hsl')
})

test('640 居中 Modal（候选 1 定稿）+ 样式全组件 scoped（不碰全局样式面）', () => {
  assert.match(CARD, /width: 640px/, 'Modal 宽度应为 640px（候选 1 定稿）')
  assert.match(CARD, /justify-content: center/, 'Modal 须居中')
  assert.match(CARD, /<style scoped>/, '组件缺 <style scoped>')
  assert.equal(/lm-/.test(STYLES), false, 'styles.css 出现 lm- 类（Task 21 禁碰共享样式面）')
})

test('尾部 N 行 + 滚动（kc 形制）+ 容量提示 N/capacity', () => {
  assert.match(CARD, /TAIL_ROWS = 50/, '尾部行数常量缺位（kc 形制 50）')
  assert.match(CARD, /slice\(-TAIL_ROWS\)/, '尾部截取缺位')
  assert.match(CARD, /overflow: auto/, '列表滚动样式缺位')
  assert.match(CARD, /`\$\{entries\.value\.length\} \/ \$\{capacity\.value\} 条`/, '容量提示 N/capacity 缺位')
})

test('INV-11 可见明示：「不落盘、重启即清空」在场', () => {
  assert.match(CARD, /不落盘/, 'INV-11「不落盘」文案缺位')
  assert.match(CARD, /重启即清空/, 'INV-11「重启即清空」文案缺位')
})

test('INV-12 脱敏摘要：queryDigest len+首词渲染，零完整查询词', () => {
  assert.match(CARD, /queryDigestText/, '脱敏摘要渲染函数缺位')
  assert.match(CARD, /digest\.first/, '首词（first）渲染缺位')
  assert.match(CARD, /digest\.len/, '长度（len）渲染缺位')
  assert.equal(/item\.query(?!Digest)/.test(CARD), false, '组件出现原始 query 字段渲染（INV-12 违例）')
  assert.equal(/query:/.test(CARD), false, '组件出现 query 明文字段面（INV-12 违例）')
})

test('R28：「清空日志」按钮 → api.clearLogs() 恰 1 处（只清内存环）', () => {
  assert.match(CARD, /@click="onClearLogs"/, '清空日志按钮缺位')
  const calls = CARD.match(/api\.clearLogs\(/g) ?? []
  assert.equal(calls.length, 1, `api.clearLogs( 仅允许出现在按钮 handler（实得 ${calls.length}）`)
  assert.match(CARD, /已清空内存环/, '清空反馈文案缺位')
})

test('日志不可用明示（503 logs_unavailable）+ hint 可执行下一步 + 重试', () => {
  assert.match(CARD, /logs_unavailable/, 'logs_unavailable 判定缺位')
  assert.match(CARD, /日志不可用/, '「日志不可用」可见明示缺位')
  assert.match(CARD, /errorInfo\.hint/, 'hint（可执行下一步）渲染缺位')
  assert.match(CARD, /@click="loadLogs"/, '「重试」按钮缺位')
})

test('✓/✗ 自绘徽标 + 开合纪律：api.logs 仅在 open 打开时拉取（本地读面）', () => {
  assert.match(CARD, /✓ 成功/, '✓ 徽标文案缺位')
  assert.match(CARD, /✗ 失败/, '✗ 徽标文案缺位')
  assert.match(CARD, /v-show="props\.open"/, '开合应走 v-show（禁条件渲染口径）')
  assert.match(CARD, /watch\(\s*\(\) => props\.open/, 'open watch 缺位')
  const logCalls = CARD.match(/api\.logs\(/g) ?? []
  assert.equal(logCalls.length, 1, `api.logs( 仅允许出现在 loadLogs（实得 ${logCalls.length}）`)
  assert.match(CARD, /emit\('close'\)/, '关闭事件缝缺位')
})
