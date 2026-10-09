// custom-source.test.mjs — Task 22 自定义源编辑器机械判据 + 行为面（INV-15/16、R7/R25/R34、K-16/K-17）。
// 行为面走权威纯函数/门禁（lib 面）：Config zod item refine / assertPublicHttps 字面拒 / validateSelector fail-closed。
// 零真联网（INV-14 离线绿）：仅测字面 IP 与 scheme 拒绝路径，绝不触发 DNS。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Config } from '../../lib/index.js'
import { assertPublicHttps } from '../../lib/sources/common.js'
import { SUPPORTED_SELECTOR_SYNTAX, validateSelector } from '../../lib/selector.js'
import { QUERY_PLACEHOLDER, buildSearchUrl } from '../../lib/sources/custom.js'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'CustomSourceCard.vue'), 'utf8')
const APP = readFileSync(path.join(SRC_DIR, 'App.vue'), 'utf8')

test('机械面：CustomSourceCard ≤300 行、零条件渲染、零自造色、样式 scoped（K-11/K-22）', () => {
  const lines = CARD.split('\n').length
  assert.ok(lines <= 300, `组件 ${lines} 行超 300 行上限`)
  assert.equal(/v-if/.test(CARD), false, '组件出现 v-if（K-11 禁条件渲染重交互）')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
  assert.equal(hexPattern.test(CARD), false, '组件出现硬编码 hex')
  assert.equal(rgbPattern.test(CARD), false, '组件出现硬编码 rgb/hsl')
  assert.match(CARD, /<style scoped>/, '组件缺 <style scoped>')
  assert.match(CARD, /v-show="expanding"/, '行内展开应走 v-show（禁条件渲染口径）')
})

test('R7 填写引导在场：{query} 占位示例 + 三项选择器说明 + 支持列表', () => {
  assert.match(CARD, /https:\/\/search\.example\.com\/\?q=\{query\}/, '{query} 占位示例缺位')
  for (const label of ['结果项选择器', '标题选择器', '链接选择器']) {
    assert.ok(CARD.includes(label), `选择器引导缺「${label}」`)
  }
  assert.match(CARD, /\{\{ SUPPORTED_SELECTOR_SYNTAX \}\}/, 'SUPPORTED_SELECTOR_SYNTAX 支持列表渲染缺位')
  assert.ok(SUPPORTED_SELECTOR_SYNTAX.length > 0, '支持列表文案源为空')
})

test('K-16 文字面：「必须 https 起头，禁止内网 / 回环 / 169.254.169.254」在位', () => {
  assert.match(CARD, /必须 https 起头，禁止内网 \/ 回环 \/ 169\.254\.169\.254/, 'K-16 文字面缺位')
  assert.match(CARD, /不进请求/, 'K-17「选择器不进请求」注记缺位')
})

test('INV-15 行为面：出站门禁字面拒（http 明文 + 内网/回环/链路本地/云元数据，零 DNS）', async () => {
  for (const url of [
    'http://127.0.0.1/',
    'https://127.0.0.1/',
    'https://10.1.2.3/',
    'https://192.168.0.1/',
    'https://172.16.0.1/',
    'https://169.254.169.254/',
    'https://[::1]/',
  ]) {
    await assert.rejects(async () => assertPublicHttps(url), `应拒绝 ${url}`)
  }
})

test('INV-15/16 行为面：custom 项 zod refine（https 强制 + {query} 必填 + id 唯一）', () => {
  const base = {
    id: 'x1', label: '示例', urlTemplate: 'https://a.example/?q={query}',
    itemSelector: '.item', titleSelector: 'h3 a', linkSelector: 'h3 a',
  }
  assert.ok(Config.parse({ sources: { custom: [base] } }), '合法项应通过')
  assert.throws(() => Config.parse({ sources: { custom: [{ ...base, urlTemplate: 'http://a.example/?q={query}' }] } }), 'http 明文应拒')
  assert.throws(() => Config.parse({ sources: { custom: [{ ...base, urlTemplate: 'https://a.example/?q=x' }] } }), '缺 {query} 应拒')
  assert.throws(() => Config.parse({ sources: { custom: [base, { ...base }] } }), 'id 重复应拒')
})

test('INV-16 行为面：validateSelector fail-closed——超集报错并给支持列表', () => {
  assert.deepEqual(validateSelector('.result-item h3 a'), { ok: true, errors: [] })
  const bad = validateSelector('a:hover')
  assert.equal(bad.ok, false, '超集选择器应拒')
  assert.match(bad.errors[0], /不受支持/, '应给拒绝原因')
  assert.ok(bad.errors[0].includes(SUPPORTED_SELECTOR_SYNTAX), '报错须附支持列表（不静默降级）')
})

test('R34 + 镜像防漂移：web 面 QUERY_PLACEHOLDER = lib 同值；占位展开语义', () => {
  assert.equal(QUERY_PLACEHOLDER, '{query}')
  assert.ok(CARD.includes("const QUERY_PLACEHOLDER = '{query}'"), 'web 镜像缺位或值漂移')
  assert.equal(buildSearchUrl('https://a.example/?q={query}', 'x y'), 'https://a.example/?q=x%20y')
})

test('形制：行内展开表单 + 编辑/删除双向 + R25 混排序号 + App 挂载（P-6）', () => {
  assert.match(CARD, /@click="onSubmit"/, '提交按钮缺位')
  assert.match(CARD, /@click="onEdit\(item\)"/, '编辑入口缺位')
  assert.match(CARD, /@click="onDelete\(item\.id\)"/, '删除入口缺位（增删双向）')
  assert.match(CARD, /emit\('change', \{ custom: props\.custom\.filter/, '删除应数组整替写回')
  assert.match(CARD, /orderOf\(item\.id\)/, '混排序号渲染缺位（R25）')
  assert.match(CARD, /props\.priority\.indexOf/, '混排序号应取自统一排序序')
  assert.match(APP, /<CustomSourceCard/, 'App.vue 挂载缺位（不挂载=半成品，队长 P-6 裁定）')
})
