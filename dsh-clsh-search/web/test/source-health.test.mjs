// source-health.test.mjs — Task 5 / T-E 合并面健康测试纪律（R23 探针 5s / R30 10s 截断 / INV-14 离线绿）。
// 原 SourceHealthRow 独立组件已并入 SourceRow（R14）：本文件改为断言合并面（SourceCard/SourceRow）的探针语义。
// 零真联网：本文件自身零网络调用面（自证断言在末）。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Config } from '../../lib/index.js'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'SourceCard.vue'), 'utf8')
const ROW = readFileSync(path.join(SRC_DIR, 'components', 'SourceRow.vue'), 'utf8')
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf8')

test('R23：单源探针超时 5s（Config.healthTimeoutMs 默认 5000）+ 合并面注记在位', () => {
  assert.equal(Config.parse({}).healthTimeoutMs, 5000, 'Config.healthTimeoutMs 默认应为 5000（R23）')
  assert.match(CARD, /超时 5s/, '合并面缺 R23 5s 超时注记')
})

test('R30：真联网 10s 总上限，超时源标「未测（超时截断）」如实展示', () => {
  assert.match(CARD, /未测（超时截断）/, 'R30 截断标注文案缺位')
  assert.match(CARD, /10s 总上限/, 'R30 总上限注记缺位')
  assert.match(CARD, /item\.detail === '未测（超时截断）'/, '截断映射分支缺位')
})

test('探针结果三要素（成败+耗时+条数）回填行 + busy 态', () => {
  assert.match(CARD, /resultCount \?\? 0\} 条/, '结果条数回填缺位')
  assert.match(CARD, /elapsedMs \?\? '—'\}ms/, '耗时回填缺位')
  assert.match(CARD, /state\.state = result\?\.ok === true \? 'ok' : 'fail'/, '成败判定缺位')
  assert.match(ROW, /busy \? '测试中…' : '测试'/, 'busy 态文案缺位')
  for (const state of ['idle', 'ok', 'fail']) {
    assert.ok(CARD.includes(`'${state}'`), `行状态缺 ${state} 态`)
  }
})

test('INV-14 离线绿自证：本测试文件零真联网调用面（fetch/XHR/node 网络模块）', () => {
  const netPattern = new RegExp('fet' + 'ch\\(|XML' + 'HttpRequest|node:' + '(http|https|net|tls|dns)')
  assert.equal(netPattern.test(SELF), false, '测试文件出现真联网调用面（INV-14 严禁进默认集）')
})
