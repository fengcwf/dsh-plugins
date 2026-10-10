// block-202.test.mjs — T-B 202 条件化（INV-24 / K-24，K-5 受控修订；R4/R5/R6）
// 语义：202 先经注入的 probeParse 试解析——≥3 条且标题/URL 双字段非空才豁免「202 状态」类目；
// 挑战页/验证码页/异常页三类 body 类目无条件照判；缺省未传 probeParse = fail-closed 照旧 blocked。
// 背景（t42 D3）：ddg 直连 5 次里 4 次返 202 但页面能解析出结果——本卡救的正是该场景。
// 离线：stub fetch（202 响应），零出网（K-15）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { fetchHtml } from '../lib/sources/common.js'
import { BLOCK_CODE } from '../lib/ratelimit.js'
import { createSource as createDdgSource } from '../lib/sources/ddg.js'
import { createCustomSource } from '../lib/sources/custom.js'
import { Config } from '../lib/index.js'

// 测试面显式直连（R21 默认 ddg/bing 勾选走代理；本组用例不测代理 → 显式关闭 K-23 空池明示）
const DIRECT = { sources: { useProxy: { ddg: false, bing: false, so360: false, baidu: false } } }

/** 202 响应桩（离线）。 */
async function with202(body, run) {
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 202, headers: { get: () => null }, text: async () => body })
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

const OK_PAGE = '<html><body>正常页</body></html>'
const items = (n, patch = []) => Array.from({ length: n }, (_, i) => ({
  title: `标题${i}`,
  url: `https://a.example/${i}`,
  snippet: '',
  ...patch[i],
}))

const OPTS = { timeoutMs: 500, retries: 0 }

test('202 + probeParse 解析 ≥3 条有效结果 → 豁免 blocked，html 原样返回（INV-24 主判据）', async () => {
  const html = await with202(OK_PAGE, () => fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => items(3) }))
  assert.equal(html, OK_PAGE, '202 + 可解析 SERP 不再被误杀（t42 救援场景）')
})

test('202 + <3 条 → 仍 blocked（status-202，命中即停）', async () => {
  await with202(OK_PAGE, () => assert.rejects(
    () => fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => items(2) }),
    (error) => error.code === BLOCK_CODE && error.status === 202,
  ))
})

test('202 + 3 条但标题/URL 有空 → 仍 blocked（双字段非空判据，R6）', async () => {
  const lopsided = items(3, [{ title: '' }, { url: '   ' }])
  await with202(OK_PAGE, () => assert.rejects(
    () => fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => lopsided }),
    (error) => error.code === BLOCK_CODE,
    '字段空的条目不计数（有效条 <3 → 不豁免）',
  ))
})

test('202 + probeParse 抛错 → 仍 blocked（fail-closed）', async () => {
  await with202(OK_PAGE, () => assert.rejects(
    () => fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => { throw new Error('解析炸了') } }),
    (error) => error.code === BLOCK_CODE,
    '解析器异常不豁免（fail-closed，K-24）',
  ))
})

test('202 + 未传 probeParse → 仍 blocked（缺省 fail-closed，K-24 硬要求）', async () => {
  await with202(OK_PAGE, () => assert.rejects(
    () => fetchHtml('https://www.example.com/x', OPTS),
    (error) => error.code === BLOCK_CODE && /202/.test(error.message),
  ))
})

test('202 + 挑战页 body + probeParse 达标 → 仍 blocked（三类 body 类目无条件，K-5 修订口径）', async () => {
  const challenge = await readFile(new URL('./fixtures/challenge-sample.html', import.meta.url), 'utf8')
  await with202(challenge, () => assert.rejects(
    () => fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => items(5) }),
    (error) => error.code === BLOCK_CODE && /挑战页/.test(error.message),
    '豁免只免「202 状态」类目——挑战页照判（命中即停不破）',
  ))
})

test('202 + 异常 HTML（非根形）+ probeParse 达标 → 仍 blocked（异常类目无条件）', async () => {
  await with202('504 Gateway Timeout', () => assert.rejects(
    () => fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => items(5) }),
    (error) => error.code === BLOCK_CODE && /异常|非 HTML 根形/.test(error.message),
  ))
})

test('200 正常响应不受 probeParse 影响（无 202 不触发豁免判定）', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => OK_PAGE })
  try {
    const html = await fetchHtml('https://www.example.com/x', { ...OPTS, probeParse: () => items(1) })
    assert.equal(html, OK_PAGE, '200 + probeParse 在场照常返回（豁免判定仅 202 触发）')
  } finally {
    globalThis.fetch = original
  }
})

test('ddg 真源 + 202 + 可解析 fixture → search 成功出 ≥3 条（t42 救援场景端到端）', async () => {
  const fixture = await readFile(new URL('./fixtures/ddg-sample.html', import.meta.url), 'utf8')
  const source = createDdgSource(Config.parse({ ...DIRECT }))
  await with202(fixture, async () => {
    const outcome = await source.search('probe', undefined)
    assert.ok(outcome.sources.length >= 3, `202 + 可解析 SERP 豁免后正常出结果（实得 ${outcome.sources.length} 条）`)
    assert.ok(outcome.sources.every((item) => item.url && item.title), '双字段非空（解析面原样）')
  })
})

test('custom 真源 + 202 + 可解析页 → parseCustomSerp 注入豁免（解析器回调面）', async () => {
  const page = '<html><body>'
    + '<div class="r"><a href="https://a.example/1">标题一</a></div>'
    + '<div class="r"><a href="https://a.example/2">标题二</a></div>'
    + '<div class="r"><a href="https://a.example/3">标题三</a></div>'
    + '</body></html>'
  const item = {
    id: 'my-src', label: '我的源', urlTemplate: 'https://search.example.com/?q={query}',
    itemSelector: '.r', titleSelector: 'a', linkSelector: 'a',
  }
  const source = createCustomSource(item, Config.parse({ ...DIRECT }))
  await with202(page, async () => {
    const outcome = await source.search('probe', undefined)
    assert.equal(outcome.sources.length, 3, 'custom：202 + 可解析页豁免（parseCustomSerp 注入，P-17 零反向依赖）')
  })
})

test('机械判据：四源 + custom 各传 probeParse（接线 grep 双证）', async () => {
  for (const file of ['ddg.js', 'bing.js', 'so360.js', 'baidu.js']) {
    const content = await readFile(new URL(`./../lib/sources/${file}`, import.meta.url), 'utf8')
    assert.match(content, /probeParse: parseSerp/, `${file}：fetchHtml 注入 parseSerp`)
  }
  const custom = await readFile(new URL('./../lib/sources/custom.js', import.meta.url), 'utf8')
  assert.match(custom, /probeParse: \(page\) => parseCustomSerp/, 'custom.js：注入 parseCustomSerp 闭包')
})
