// e2e-blocked.test.mjs — W4-repair：W4-BLOCK-BODY-UNREACHABLE 关闭的端到端即停实证（发版前必闭环项）
// 全链：HTTP 打桩（globalThis.fetch）→ W3 真源（lib/sources/ddg.js）→ fetchHtml body 反爬判定 →
// aggregate 即停收口。离线：不触真网；200+挑战页样本走 fixtures/challenge-sample.html。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createAggregator } from '../lib/aggregate.js'
import { BLOCK_CODE, classifyBlock, isBlocked } from '../lib/ratelimit.js'
import { createSource as createDdgSource } from '../lib/sources/ddg.js'
import { Config } from '../lib/index.js'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

/** HTTP 打桩：替换 globalThis.fetch，返回固定响应并计数；用后还原。 */
async function withStubFetch(responder, run) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts })
    return responder(String(url), opts)
  }
  try {
    return await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

/** 假次源（W3 统一源形）：记录调用，用于断言「不切源」。 */
function spySource(name) {
  const calls = []
  return {
    name,
    enabled: true,
    calls,
    async search(query, signal) {
      calls.push({ query, signal })
      return { sources: [] }
    },
  }
}

test('e2e 即停：200+挑战页 → body 反爬判定命中，不重试不切源明示（W4-BLOCK-BODY-UNREACHABLE）', async () => {
  const challengeHtml = await readFile(path.join(FIXTURES, 'challenge-sample.html'), 'utf8')
  const ddg = createDdgSource(Config.parse({}))
  const bing = spySource('bing')
  const { aggregate } = createAggregator(Config.parse({}), [ddg, bing])

  await withStubFetch(
    async () => ({ ok: true, status: 200, text: async () => challengeHtml }),
    async (calls) => {
      const outcome = await aggregate('dsh 插件')
      assert.equal(outcome.ok, false)
      assert.equal(outcome.reason, 'blocked', '命中即停收口')
      assert.equal(calls.length, 1, '不重试（200 非重试态 + blocked 即抛，零二次请求）')
      assert.equal(bing.calls.length, 0, '不切源硬刚')
      assert.equal(outcome.error.code, BLOCK_CODE, '结构化错误码（classifyBlock body 分支可达实证）')
      assert.equal(outcome.error.kind, 'challenge-page', 'body 级分类命中挑战页特征')
      assert.match(outcome.blocks[0].text, /疑似反爬\/验证码/, '明示疑似反爬/验证码')
      assert.match(outcome.blocks[0].text, /命中即停|不重试/, '明示即停不重试')
    },
  )
})

test('e2e 状态类即停：HTTP 202 → err.status 判定命中，不重试不切源（K-5）', async () => {
  const ddg = createDdgSource(Config.parse({}))
  const bing = spySource('bing')
  const { aggregate } = createAggregator(Config.parse({}), [ddg, bing])
  await withStubFetch(
    // W4R-N1 关闭：stub 真实化——真实 fetch 对 2xx 返回 ok:true（原 ok:false 与 2xx 语义失真）；
    // 202 命中走 ok 分支后的 classifyBlock({status, body}) 状态类判定（与真实响应一致）。
    async () => ({ ok: true, status: 202, text: async () => '' }),
    async (calls) => {
      const outcome = await aggregate('q')
      assert.equal(outcome.ok, false)
      assert.equal(outcome.reason, 'blocked')
      assert.equal(calls.length, 1, '202 立即抛不耗重试（W3 语义）')
      assert.equal(bing.calls.length, 0, '不切源')
      assert.match(outcome.blocks[0].text, /疑似反爬\/验证码/)
    },
  )
})

test('e2e 正常 SERP 不误报：四源 fixtures 全部非 blocked（分类回归锁）', async () => {
  for (const name of ['ddg-sample.html', 'bing-sample.html', 'so360-sample.html', 'baidu-sample.html']) {
    const html = await readFile(path.join(FIXTURES, name), 'utf8')
    assert.equal(isBlocked({ status: 200, body: html }), false, `${name} 不得误报反爬`)
    assert.equal(classifyBlock({ status: 200, body: html }).blocked, false)
  }
  // 真源全链：200+正常 SERP → 正常解析收口（body 判定不干扰成功路径）
  const sample = await readFile(path.join(FIXTURES, 'ddg-sample.html'), 'utf8')
  const ddg = createDdgSource(Config.parse({}))
  const { aggregate } = createAggregator(Config.parse({}), [ddg])
  await withStubFetch(
    async () => ({ ok: true, status: 200, text: async () => sample }),
    async () => {
      const outcome = await aggregate('dsh 插件')
      assert.equal(outcome.ok, true, '正常 SERP 走成功路径')
      assert.ok(outcome.sources.length > 0, '解析出结果')
    },
  )
})
