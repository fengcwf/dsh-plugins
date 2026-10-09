// sources-common.test.mjs — Task 3（t17）：重试退避（C3）与响应体上限（W3-3）
// 断言面：① retryBackoffMs 默认 300（Config schema）且驱动指数退避时序（递增）
// ② 可配（改 Config 值 → 观测间隔随之缩放）③ 退避只覆盖可重试瞬态（5xx/网络失败/body 读失败），
// 4xx 零退避零等待 ④ 外层 signal 中止：退避中立即结束不空等、发出前中止零出网、永不重试
// ⑤ 超限 = 普通失败（content-length 预检零读取 / 实际字节判定 / 真 Response 流式计数），
// 零重试、不入 blocked 类（ratelimit.js 特征表不动）⑥ K-9：两键零字面、四源只从 Config 读。
// 离线：fetch 全程打桩，零真网。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { Config } from '../lib/index.js'
import { fetchHtml, assertConfig } from '../lib/sources/common.js'

const URL_PROBE = 'https://x.example/probe'

function stubFetch(t) {
  const calls = []
  let script = [() => new Response('<html>ok</html>', { status: 200 })]
  let cursor = 0
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ at: Date.now(), url: String(url), opts })
    const step = script[Math.min(cursor, script.length - 1)]
    cursor += 1
    return step(calls.length)
  })
  return { calls, setScript: (s) => { script = s; cursor = 0 } }
}

test('retryBackoffMs 默认 300（Config schema）且驱动指数退避：两段时间间隔随基数递增', async (t) => {
  const cfg = Config.parse({})
  assert.equal(cfg.retryBackoffMs, 300, '默认 300（R32，schema 唯一定义处）')
  assert.equal(cfg.maxResponseBytes, 1048576, '默认 1MiB（R32）')

  const { calls, setScript } = stubFetch(t)
  setScript([
    () => new Response('', { status: 500 }),
    () => new Response('', { status: 500 }),
    () => new Response('<html>ok</html>', { status: 200 }),
  ])
  const html = await fetchHtml(URL_PROBE, {
    timeoutMs: 5000, retries: 2,
    retryBackoffMs: cfg.retryBackoffMs, maxResponseBytes: cfg.maxResponseBytes,
  })
  assert.equal(html, '<html>ok</html>')
  assert.equal(calls.length, 3, '两次重试 + 首次')
  const gap1 = calls[1].at - calls[0].at
  const gap2 = calls[2].at - calls[1].at
  assert.ok(gap1 >= 280, `第 1 次重试前退避 ≥ 基数 300（实测 ${gap1}ms）`)
  assert.ok(gap2 >= 570, `第 2 次重试前退避 = 2×基数 600（实测 ${gap2}ms）`)
  assert.ok(gap2 > gap1, '间隔递增（指数形）')
})

test('retryBackoffMs 可配：Config 值缩放观测间隔（20ms 基数 → 短间隔仍递增）', async (t) => {
  const cfg = Config.parse({ retryBackoffMs: 20 })
  assert.equal(cfg.retryBackoffMs, 20, '键可配（K-9）')
  const { calls, setScript } = stubFetch(t)
  setScript([
    () => new Response('', { status: 500 }),
    () => new Response('', { status: 500 }),
    () => new Response('<html>ok</html>', { status: 200 }),
  ])
  const started = Date.now()
  await fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, retryBackoffMs: cfg.retryBackoffMs })
  const gap1 = calls[1].at - calls[0].at
  const gap2 = calls[2].at - calls[1].at
  assert.ok(gap1 >= 16 && gap2 >= 33 && gap2 > gap1, `20/40 形间隔（实测 ${gap1}/${gap2}）`)
  assert.ok(Date.now() - started < 300, '总时长随配置缩短（对照默认 900ms）')
})

test('退避只覆盖可重试瞬态：5xx/网络失败/body 读失败入环，4xx 零退避零等待', async (t) => {
  const { calls, setScript } = stubFetch(t)
  // 4xx：立即抛、单次出网、不等 5 秒退避
  setScript([() => new Response('', { status: 404 })])
  const started4xx = Date.now()
  await assert.rejects(
    () => fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, retryBackoffMs: 5000 }),
    (error) => error.status === 404,
  )
  assert.equal(calls.length, 1, '4xx 不重试')
  assert.ok(Date.now() - started4xx < 1500, '4xx 零退避（若入环必等 5s×2）')

  // 网络失败 → 重试且退避
  const before = calls.length
  setScript([
    () => { throw new TypeError('fetch failed') },
    () => new Response('<html>recovered</html>', { status: 200 }),
  ])
  const htmlNet = await fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, retryBackoffMs: 20 })
  assert.equal(htmlNet, '<html>recovered</html>')
  assert.ok(calls[before + 1].at - calls[before].at >= 16, '网络失败重试前有退避')

  // body 读失败 → 重试且退避（W3-2 口径不变）
  const beforeBody = calls.length
  setScript([
    () => ({ ok: true, status: 200, text: async () => { throw new Error('body stream broken') } }),
    () => ({ ok: true, status: 200, text: async () => '<html>recovered</html>' }),
  ])
  const htmlBody = await fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, retryBackoffMs: 20 })
  assert.equal(htmlBody, '<html>recovered</html>')
  assert.ok(calls[beforeBody + 1].at - calls[beforeBody].at >= 16, 'body 读失败重试前有退避')
})

test('外层 signal 中止：退避中立即结束不空等，发出前中止零出网、永不重试（K-6）', async (t) => {
  const { calls, setScript } = stubFetch(t)
  setScript([() => { throw new TypeError('fetch failed') }])
  const controller = new AbortController()
  const reason = new Error('chain budget exhausted')
  const started = Date.now()
  // 首次失败立即进入 8s 退避；50ms 处 abort → 秒回（不等退避走完）
  const pending = assert.rejects(
    () => fetchHtml(URL_PROBE, {
      timeoutMs: 5000, retries: 5, retryBackoffMs: 8000, signal: controller.signal,
    }),
    (error) => error === reason,
  )
  setTimeout(() => controller.abort(reason), 50)
  await pending
  assert.ok(Date.now() - started < 1500, '退避立即结束，不空等 8s')
  assert.equal(calls.length, 1, '中止后不再发起后续尝试')

  // 发出前中止：零出网
  const preAborted = new AbortController()
  preAborted.abort(reason)
  const before = calls.length
  await assert.rejects(
    () => fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, retryBackoffMs: 20, signal: preAborted.signal }),
    (error) => error === reason,
  )
  assert.equal(calls.length, before, '已中止不触网')
})

test('超限 content-length 预检：声明超限零读取即中止，普通失败零重试、不入 blocked 类', async (t) => {
  const { calls, setScript } = stubFetch(t)
  let textCalls = 0
  setScript([() => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name === 'content-length' ? '999999' : null) },
    text: async () => { textCalls += 1; return '<html>should never be read</html>' },
  })])
  await assert.rejects(
    () => fetchHtml(URL_PROBE, {
      timeoutMs: 5000, retries: 2, retryBackoffMs: 20, maxResponseBytes: 1024,
    }),
    (error) => {
      assert.equal(error.code, 'RESPONSE_TOO_LARGE', '结构化普通失败码')
      assert.notEqual(error.blocked, true, '不入 INV-5 blocked 类（ratelimit 特征表不动）')
      assert.equal(error.status, undefined, '非 HTTP 状态失败、非反爬分类')
      return true
    },
  )
  assert.equal(textCalls, 0, '声明超限 → 中止读取（零 text 调用）')
  assert.equal(calls.length, 1, '超限零重试（确定性失败）')
})

test('超限实际字节判定：无 content-length 时按实际字节（text 回退路径），普通失败零重试', async (t) => {
  const { calls, setScript } = stubFetch(t)
  setScript([() => ({ ok: true, status: 200, text: async () => 'x'.repeat(4096) })])
  await assert.rejects(
    () => fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, maxResponseBytes: 512 }),
    (error) => error.code === 'RESPONSE_TOO_LARGE',
  )
  assert.equal(calls.length, 1, '超限零重试')

  // 上限足够 → 照常成功（不误伤；HTML 根形过 classifyBlock）
  const okHtml = `<html><body>${'y'.repeat(256)}</body></html>`
  setScript([() => new Response(okHtml, { status: 200 })])
  const html = await fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 2, maxResponseBytes: 1048576 })
  assert.equal(html, okHtml, '未超限正常返回')
})

test('真 Response 流式路径：逐块计数超限即 cancel 流并抛普通失败', async (t) => {
  const { calls, setScript } = stubFetch(t)
  setScript([() => new Response('z'.repeat(65536), { status: 200 })])
  await assert.rejects(
    () => fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 1, maxResponseBytes: 1024 }),
    (error) => error.code === 'RESPONSE_TOO_LARGE',
  )
  assert.equal(calls.length, 1, '流式超限同样零重试')
})

test('K-9 自证：两键在 common.js 与四源零字面、四源只从 Config 读、assertConfig 守卫回填', async () => {
  const root = new URL('../lib/sources/', import.meta.url)
  const files = ['common.js', 'ddg.js', 'bing.js', 'so360.js', 'baidu.js']
  const literalRe = /\b(retryBackoffMs|maxResponseBytes)\s*[:=]\s*[0-9]/
  for (const file of files) {
    const content = await readFile(new URL(file, root), 'utf8')
    assert.ok(!literalRe.test(content), `${file} 两键零字面数值（默认值只在 Config schema，K-9）`)
    if (file !== 'common.js') {
      assert.ok(content.includes('retryBackoffMs: config.retryBackoffMs'), `${file} 退避基数从 Config 读`)
      assert.ok(content.includes('maxResponseBytes: config.maxResponseBytes'), `${file} 体上限从 Config 读`)
    }
  }
  // 结构守卫：缺新键的裸配置必须被拒（须经 Config.parse 回填）
  assert.throws(
    () => assertConfig({ sources: { ddg: true }, timeoutMs: 1000, retries: 1 }),
    TypeError,
    '缺 retryBackoffMs/maxResponseBytes 的手搓配置必须拒（K-9）',
  )
  const cfg = Config.parse({})
  assert.equal(typeof cfg.retryBackoffMs, 'number')
  assert.equal(typeof cfg.maxResponseBytes, 'number')
})

test('参数校验：非法 retryBackoffMs/maxResponseBytes 即刻 TypeError（零出网）', async (t) => {
  const { calls } = stubFetch(t)
  await assert.rejects(
    () => fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 1, retryBackoffMs: -1 }),
    TypeError,
  )
  await assert.rejects(
    () => fetchHtml(URL_PROBE, { timeoutMs: 5000, retries: 1, maxResponseBytes: 0 }),
    TypeError,
  )
  assert.equal(calls.length, 0, '参数非法在门禁与出网之前拒绝')
})
