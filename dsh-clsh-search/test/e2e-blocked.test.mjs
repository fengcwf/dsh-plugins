// e2e-blocked.test.mjs — W4-repair：W4-BLOCK-BODY-UNREACHABLE 关闭的端到端即停实证（发版前必闭环项）
// 全链：HTTP 打桩（globalThis.fetch）→ W3 真源（lib/sources/ddg.js）→ fetchHtml body 反爬判定 →
// aggregate 即停收口。离线：不触真网；200+挑战页样本走 fixtures/challenge-sample.html。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 测试面显式直连（R21 默认 ddg/bing 勾选走代理；本组用例不测代理 → 显式关闭，避免空池明示错误 K-23）
const DIRECT = { sources: { useProxy: { ddg: false, bing: false, so360: false, baidu: false } } }

import { createAggregator } from '../lib/aggregate.js'
import { BLOCK_CODE, classifyBlock, isBlocked } from '../lib/ratelimit.js'
import { createSource as createDdgSource } from '../lib/sources/ddg.js'
import { assertPublicHttps, fetchHtml, isBlockedIpLiteral } from '../lib/sources/common.js'
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
  const ddg = createDdgSource(Config.parse({ ...DIRECT }))
  const bing = spySource('bing')
  const { aggregate } = createAggregator(Config.parse({ ...DIRECT }), [ddg, bing])

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
  const ddg = createDdgSource(Config.parse({ ...DIRECT }))
  const bing = spySource('bing')
  const { aggregate } = createAggregator(Config.parse({ ...DIRECT }), [ddg, bing])
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
  const ddg = createDdgSource(Config.parse({ ...DIRECT }))
  const { aggregate } = createAggregator(Config.parse({ ...DIRECT }), [ddg])
  await withStubFetch(
    async () => ({ ok: true, status: 200, text: async () => sample }),
    async () => {
      const outcome = await aggregate('dsh 插件')
      assert.equal(outcome.ok, true, '正常 SERP 走成功路径')
      assert.ok(outcome.sources.length > 0, '解析出结果')
    },
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// 出站门禁（INV-15 / K-16，T2）：assertPublicHttps 单测矩阵。离线：纯字面判定 + lookup 注入，
// 零真实 DNS / 零真实出网。
// ─────────────────────────────────────────────────────────────────────────────

test('出站门禁：https 公网地址通过；http 明文与非 https scheme 被拒（INV-15）', async () => {
  await assertPublicHttps('https://www.bing.com/search?q=test')
  await assertPublicHttps('https://html.duckduckgo.com/html/?q=probe')
  await assertPublicHttps('https://x.example/probe')
  for (const url of ['http://example.com/', 'http://www.baidu.com/s?wd=q', 'ftp://example.com/', 'ws://example.com/']) {
    await assert.rejects(
      () => assertPublicHttps(url),
      (error) => error.code === 'BAD_TARGET' && error.reason === 'scheme',
      `http 明文/非 https 必须拒：${url}`,
    )
  }
  await assert.rejects(() => assertPublicHttps('not a url'), (error) => error.code === 'BAD_TARGET' && error.reason === 'unparsable')
})

test('出站门禁：内网/回环/链路本地/云元数据矩阵逐类被拒（INV-15 SSRF）', async () => {
  const blocked = [
    // localhost 家族与单标签内网名
    'https://localhost/', 'https://app.localhost/', 'https://printer.local/', 'https://nas.internal/',
    'https://router.home.arpa/', 'https://fileserver.lan/', 'https://intranet/',
    // IPv4 回环 / 内网 / CGNAT / 协议段
    'https://127.0.0.1/', 'https://127.8.8.8/', 'https://10.1.2.3/', 'https://192.168.0.41/',
    'https://172.16.0.1/', 'https://172.31.255.255/', 'https://100.64.0.1/', 'https://192.0.0.1/',
    'https://0.0.0.0/',
    // 链路本地 + 云元数据
    'https://169.254.169.254/', 'https://169.254.0.1/',
    // IPv6 回环 / 未指定 / 链路本地 / 唯一本地 / 映射
    'https://[::1]/', 'https://[::]/', 'https://[fe80::1]/', 'https://[fc00::1]/', 'https://[fd12:3456::1]/',
    'https://[::ffff:127.0.0.1]/', 'https://[::ffff:169.254.169.254]/',
  ]
  for (const url of blocked) {
    await assert.rejects(
      () => assertPublicHttps(url),
      (error) => error.code === 'BAD_TARGET' && error.reason === 'host',
      `非公网目标必须拒：${url}`,
    )
  }
})

test('出站门禁：云元数据 169.254.169.254 及映射形专项被拒（INV-15）', async () => {
  for (const url of ['https://169.254.169.254/latest/meta-data/', 'https://[::ffff:169.254.169.254]/', 'https://169.254.170.2/']) {
    await assert.rejects(() => assertPublicHttps(url), (error) => error.code === 'BAD_TARGET' && error.reason === 'host', `云元数据必须拒：${url}`)
  }
  assert.equal(isBlockedIpLiteral('169.254.169.254'), true, '字面判定同口径')
})

test('出站门禁：公网边界负例不过度封锁（放行面）', async () => {
  for (const url of ['https://8.8.8.8/', 'https://172.32.0.1/', 'https://192.169.0.1/', 'https://100.128.0.1/', 'https://[2606:4700::1111]/']) {
    await assertPublicHttps(url, {})
    assert.equal(isBlockedIpLiteral(url.includes('[') ? url.slice(url.indexOf('[') + 1, url.indexOf(']')) : url.slice('https://'.length, -1)), false, `公网地址不得误伤：${url}`)
  }
  assert.equal(isBlockedIpLiteral('172.32.0.1'), false, '172.32 越出 172.16/12 不得误伤')
  assert.equal(isBlockedIpLiteral('::ffff:8.8.8.8'), false, '映射公网 v4 不得误伤')
})

test('出站门禁：DNS 解析后 IP 同段核验防解析绕过（lookup 注入，离线 stub）', async () => {
  const lookupOf = (addresses) => async () => addresses.map((address) => ({ address, family: 4 }))
  await assert.rejects(
    () => assertPublicHttps('https://evil.example.com/', { lookup: lookupOf(['10.0.0.5']) }),
    (error) => error.code === 'BAD_TARGET' && error.reason === 'resolved',
    '解析到内网 IP 必须拒',
  )
  await assert.rejects(
    () => assertPublicHttps('https://evil.example.com/', { lookup: lookupOf(['93.184.216.34', '127.0.0.1']) }),
    (error) => error.code === 'BAD_TARGET' && error.reason === 'resolved',
    '任一解析 IP 非公网即拒',
  )
  await assertPublicHttps('https://evil.example.com/', { lookup: lookupOf(['93.184.216.34']) })
  await assert.rejects(
    () => assertPublicHttps('https://nx.example.com/', { lookup: async () => { throw new Error('ENOTFOUND') } }),
    (error) => error.code === 'BAD_TARGET' && error.reason === 'resolve',
    '解析失败 fail-closed',
  )
})

test('出站门禁：URL 内嵌凭据被拒（P-5 / K-4）', async () => {
  for (const url of ['https://user:pass@example.com/', 'https://admin@example.com/']) {
    await assert.rejects(() => assertPublicHttps(url), (error) => error.code === 'BAD_TARGET' && error.reason === 'credentials', `内嵌凭据必须拒：${url}`)
  }
})

test('出站门禁不可绕过：fetchHtml 被拒目标零 fetch 调用（门禁先于出网，K-16）', async () => {
  for (const url of ['http://example.com/', 'https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/']) {
    await withStubFetch(
      async () => {
        throw new Error('stub：门禁拒绝后不应有任何出网调用')
      },
      async (calls) => {
        await assert.rejects(() => fetchHtml(url, { timeoutMs: 1000, retries: 0 }), (error) => error.code === 'BAD_TARGET')
        assert.equal(calls.length, 0, `门禁拒绝即零出网：${url}`)
      },
    )
  }
  // 正例：公网 https 目标照常走 fetch（门禁放行不误伤主链）
  await withStubFetch(
    async () => ({ ok: true, status: 200, text: async () => '<html></html>' }),
    async (calls) => {
      const html = await fetchHtml('https://x.example/probe', { timeoutMs: 1000, retries: 0 })
      assert.equal(html, '<html></html>')
      assert.equal(calls.length, 1, '放行面照常出网')
    },
  )
})

test('出站门禁零第三方依赖（P-4 / K-8）：common.js 导入面白名单', async () => {
  const source = await readFile(new URL('../lib/sources/common.js', import.meta.url), 'utf8')
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
  assert.ok(specifiers.length > 0, '导入面可扫描')
  for (const spec of specifiers) {
    assert.ok(
      spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'),
      `禁第三方导入（P-4）：${spec}`,
    )
  }
  assert.ok(!/\brequire\s*\(/.test(source), '纯 ESM 零 require')
  assert.equal(isBlockedIpLiteral('8.8.8.8'), false, '同步字面判定可直测')
})
