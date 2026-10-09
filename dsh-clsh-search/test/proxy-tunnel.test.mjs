// proxy-tunnel.test.mjs — T5 CONNECT 隧道单测（US-13 / INV-17/18，P-9~P-12）
// 离线：全 seam 注入（假 socket / 假请求），零真实网络、零真实 socket 模块字面（INV-17 grep 面含 test/）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

import { BLOCK_CODE } from '../lib/ratelimit.js'
import { fetchHtml, openConnectTunnel, requestViaTunnel } from '../lib/sources/common.js'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const PROXY = { address: 'http://proxy.test:8080' }
const TARGET = { host: 'www.example.com', port: 443 }
const URL1 = 'https://www.example.com/search?q=test'

/** 假 socket（EventEmitter 形）：记录写入与销毁（P-12 断言面）。 */
class FakeSocket extends EventEmitter {
  constructor(label) {
    super()
    this.label = label
    this.destroyed = false
    this.writes = []
    this.destroyCalls = 0
  }
  write(chunk) {
    this.writes.push(String(chunk))
    return true
  }
  destroy(error) {
    this.destroyCalls += 1
    this.destroyed = true
    if (error) this.emit('error', error)
    return this
  }
  setTimeout() {
    return this
  }
  setNoDelay() {
    return this
  }
  end() {
    return this
  }
}

/** 假代理策略（复刻 t3 实测坑 P-9）：请求行方法 token 非大写 CONNECT 一律 502 拒。 */
function proxyPolicyAccepts(requestHead) {
  return /^CONNECT [^ \r\n]+:\d{1,5} HTTP\/1\.1\r\n/.test(requestHead)
}

/** 让假 socket 在监听器挂好后回写握手响应（macrotask，时序安全）。 */
function scheduleData(socket, payload) {
  setImmediate(() => socket.emit('data', Buffer.from(payload)))
}

const CONNECT_OK = 'HTTP/1.1 200 Connection Established\r\n\r\n'
const CONNECT_407 = 'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="p"\r\n\r\n'

test('P-9 方法大写：CONNECT 请求行必须大写，小写 connect 被代理拒（用例在场）', async () => {
  const raw = new FakeSocket('raw')
  scheduleData(raw, CONNECT_OK)
  const tunnel = await openConnectTunnel({
    proxy: PROXY,
    target: TARGET,
    timeoutMs: 500,
    dial: async () => raw,
    upgrade: async ({ socket }) => {
      const secure = new FakeSocket('secure')
      secure.peer = socket
      return secure
    },
  })
  const sent = raw.writes[0]
  assert.match(sent, /^CONNECT www\.example\.com:443 HTTP\/1\.1\r\n/, '请求行方法 token 为大写 CONNECT（P-9）')
  assert.equal(proxyPolicyAccepts(sent), true, '大写形过假代理策略')
  assert.equal(proxyPolicyAccepts('connect www.example.com:443 HTTP/1.1\r\n\r\n'), false, '小写 connect 被拒用例（实测代理 502）')
  tunnel.destroy()
})

test('P-10 407：结构化 proxy_auth_unsupported，命中即停（不重试不静默）', async () => {
  const raw = new FakeSocket('raw')
  let upgradeCalls = 0
  scheduleData(raw, CONNECT_407)
  await assert.rejects(
    () =>
      openConnectTunnel({
        proxy: PROXY,
        target: TARGET,
        timeoutMs: 500,
        dial: async () => raw,
        upgrade: async () => {
          upgradeCalls += 1
          return new FakeSocket('secure')
        },
      }),
    (error) => error.code === 'proxy_auth_unsupported' && error.status === 407 && /不支持代理认证/.test(error.message),
    '407 → 结构化报错（INV-18 明示不支持认证）',
  )
  assert.equal(upgradeCalls, 0, '407 不进 TLS 升级')
  assert.equal(raw.destroyed, true, '407 路径同样双层销毁收尾')
})

test('P-10 零重试：fetchHtml 带代理遇 407 即抛，dial 恰一次（retries=3 不消耗）', async () => {
  let dialCalls = 0
  await assert.rejects(
    () =>
      fetchHtml(URL1, {
        timeoutMs: 300,
        retries: 3,
        proxy: PROXY,
        tunnelSeams: {
          dial: async () => {
            dialCalls += 1
            const raw = new FakeSocket('raw')
            scheduleData(raw, CONNECT_407)
            return raw
          },
          upgrade: async () => new FakeSocket('secure'),
        },
      }),
    (error) => error.code === 'proxy_auth_unsupported',
  )
  assert.equal(dialCalls, 1, '零重试零静默回落直连（P-10）')
})

test('P-11 第 1 层：CONNECT 建连/握手超时即失败收尾，socket 销毁', async () => {
  const raw = new FakeSocket('raw') // 不回任何数据
  const started = Date.now()
  await assert.rejects(
    () =>
      openConnectTunnel({
        proxy: PROXY,
        target: TARGET,
        timeoutMs: 30,
        dial: async () => raw,
        upgrade: async () => new FakeSocket('secure'),
      }),
    (error) => error.code === 'PROXY_LAYER_TIMEOUT' && error.name === 'TimeoutError',
  )
  assert.ok(Date.now() - started < 2000, '超时在 timeoutMs 量级触发（不挂死）')
  assert.equal(raw.destroyed, true, '失败收尾销毁 raw')
})

test('P-11 第 2 层：TLS 握手超时即失败收尾（raw 已建连也照销）', async () => {
  const raw = new FakeSocket('raw')
  scheduleData(raw, CONNECT_OK)
  await assert.rejects(
    () =>
      openConnectTunnel({
        proxy: PROXY,
        target: TARGET,
        timeoutMs: 30,
        dial: async () => raw,
        upgrade: () => new Promise(() => {}), // TLS 永不完成
      }),
    (error) => error.code === 'PROXY_LAYER_TIMEOUT',
  )
  assert.equal(raw.destroyed, true, 'TLS 层超时同样双层销毁')
})

test('P-11 第 3 层 + 外层 AbortSignal 桥接：HTTP 响应超时与外层取消各自生效', async () => {
  const raw = new FakeSocket('raw')
  const secure = new FakeSocket('secure')
  scheduleData(raw, CONNECT_OK)
  const hangRequest = () => {
    const req = new EventEmitter()
    req.write = () => true
    req.end = () => {}
    req.setTimeout = () => {}
    req.destroy = () => {}
    return req
  }
  await assert.rejects(
    () =>
      requestViaTunnel(URL1, {
        proxy: PROXY,
        timeoutMs: 30,
        dial: async () => raw,
        upgrade: async () => secure,
        requestImpl: hangRequest,
      }),
    (error) => error.code === 'PROXY_LAYER_TIMEOUT',
    'HTTP 响应层超时',
  )
  assert.equal(raw.destroyed, true, '超时收尾 raw 销毁')
  assert.equal(secure.destroyed, true, '超时收尾 secure 销毁')

  // 外层 signal 桥接：握手中途外层取消 → 以调用方原因失败（不误报层超时）
  const raw2 = new FakeSocket('raw2')
  const outer = new AbortController()
  const pending = openConnectTunnel({
    proxy: PROXY,
    target: TARGET,
    timeoutMs: 5000,
    signal: outer.signal,
    dial: async () => raw2,
    upgrade: async () => new FakeSocket('secure'),
  })
  setTimeout(() => outer.abort(new Error('调用方取消')), 10)
  await assert.rejects(() => pending, (error) => /调用方取消/.test(error.message), '外层中止原因透出（P-11 桥接）')
  assert.equal(raw2.destroyed, true, '外层中止同样收尾销毁')
})

/** 构造会回包的假请求实现（EventEmitter 形：req.end 后回调 res 并回流 body）。 */
function fakeRequest({ status = 200, headers = {}, body = '<html>ok</html>' } = {}) {
  return (options, callback) => {
    const req = new EventEmitter()
    req.write = () => true
    req.setTimeout = () => {}
    req.destroy = () => {}
    req.end = () => {
      const res = new EventEmitter()
      res.statusCode = status
      res.headers = headers
      callback(res)
      setImmediate(() => {
        res.emit('data', Buffer.from(body))
        res.emit('end')
      })
    }
    return req
  }
}

/** 成功路径的 dial/upgrade seam（握手 200 + 记账销毁）。 */
function makeSeams({ requestImpl }) {
  const raw = new FakeSocket('raw')
  const secure = new FakeSocket('secure')
  scheduleData(raw, CONNECT_OK)
  return {
    raw,
    secure,
    seams: {
      dial: async () => raw,
      upgrade: async () => secure,
      requestImpl,
    },
  }
}

test('P-12 双层显式销毁：成功路径结束即销毁 raw 与 secure（req.destroy 不带下层，实测坑）', async () => {
  const { raw, secure, seams } = makeSeams({ requestImpl: fakeRequest() })
  const response = await requestViaTunnel(URL1, { proxy: PROXY, timeoutMs: 500, ...seams })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '<html>ok</html>')
  assert.equal(raw.destroyed, true, 'rawDestroyed=true')
  assert.equal(secure.destroyed, true, 'secureDestroyed=true')
  assert.ok(raw.destroyCalls >= 1 && secure.destroyCalls >= 1, '两层各被显式 destroy')
})

test('P-14 解压后回收：gzip / br 响应体解压成 HTML（classifyBlock 输入面前提）', async () => {
  const gzipBody = zlib.gzipSync(Buffer.from('<p>gzip 解压后</p>'))
  const gz = makeSeams({ requestImpl: fakeRequest({ headers: { 'content-encoding': 'gzip' }, body: gzipBody.toString('binary') }) })
  // fakeRequest 以 Buffer.from(body) 回放：binary 形保字节
  gz.seams.requestImpl = (options, callback) => {
    const req = new EventEmitter()
    req.write = () => true
    req.setTimeout = () => {}
    req.destroy = () => {}
    req.end = () => {
      const res = new EventEmitter()
      res.statusCode = 200
      res.headers = { 'content-encoding': 'gzip' }
      callback(res)
      setImmediate(() => {
        res.emit('data', gzipBody)
        res.emit('end')
      })
    }
    return req
  }
  const response = await requestViaTunnel(URL1, { proxy: PROXY, timeoutMs: 500, ...gz.seams })
  assert.equal(await response.text(), '<p>gzip 解压后</p>', 'gzip 解压后交给 text()')

  const brBody = zlib.brotliCompressSync(Buffer.from('<p>br 解压后</p>'))
  const br = makeSeams({
    requestImpl: (options, callback) => {
      const req = new EventEmitter()
      req.write = () => true
      req.setTimeout = () => {}
      req.destroy = () => {}
      req.end = () => {
        const res = new EventEmitter()
        res.statusCode = 200
        res.headers = { 'content-encoding': 'br' }
        callback(res)
        setImmediate(() => {
          res.emit('data', brBody)
          res.emit('end')
        })
      }
      return req
    },
  })
  const response2 = await requestViaTunnel(URL1, { proxy: PROXY, timeoutMs: 500, ...br.seams })
  assert.equal(await response2.text(), '<p>br 解压后</p>', 'br 解压后交给 text()')
})

test('classifyBlock 输入面（status + 解压 HTML）保留：代理路径反爬命中即停（INV-5 链路不变）', async () => {
  const challenge = await readFile(path.join(FIXTURES, 'challenge-sample.html'), 'utf8')
  const { seams } = makeSeams({ requestImpl: fakeRequest({ body: challenge }) })
  await assert.rejects(
    () => fetchHtml(URL1, { timeoutMs: 500, retries: 2, proxy: PROXY, tunnelSeams: seams }),
    (error) => error.code === BLOCK_CODE,
    'blocked 分类在代理路径照常命中（classifyBlock 吃到 status + HTML）',
  )
  // 正常 SERP 文本原样返回（成功面）
  const ok = makeSeams({ requestImpl: fakeRequest({ body: '<html><body>真实 html</body></html>' }) })
  const html = await fetchHtml(URL1, { timeoutMs: 500, retries: 0, proxy: PROXY, tunnelSeams: ok.seams })
  assert.equal(html, '<html><body>真实 html</body></html>')
})

test('T3 语义不破：proxy 缺省走既有 fetch 面，入参与退避/上限校验原样（回归锚）', async () => {
  // proxy 校验确定性失败：零 dial 零重试
  let dialCalls = 0
  await assert.rejects(
    () =>
      fetchHtml(URL1, {
        timeoutMs: 300,
        retries: 3,
        proxy: { address: 'http://user:pass@proxy.test:8080' },
        tunnelSeams: {
          dial: async () => {
            dialCalls += 1
            return new FakeSocket('raw')
          },
        },
      }),
    TypeError,
    '凭据形态代理地址即拒（INV-18）',
  )
  assert.equal(dialCalls, 0, '确定性校验失败零出网零重试')
  await assert.rejects(() => fetchHtml(URL1, { timeoutMs: 300, retries: 0, retryBackoffMs: -1 }), TypeError, 'T3 入参校验原样')
  await assert.rejects(() => fetchHtml(URL1, { timeoutMs: 300, retries: 0, maxResponseBytes: 0 }), TypeError, 'T3 入参校验原样')
})

test('INV-17 机械面：socket/HTTP 客户端模块字面只在唯一出网文件（源码面扫描）', async () => {
  const needles = ['node:' + 'ne' + 't', 'node:' + 'tl' + 's']
  const root = fileURLToPath(new URL('../', import.meta.url))
  const scanDirs = ['lib', 'web/src', 'web/test', 'test']
  const hits = []
  async function walk(dir) {
    const { readdir } = await import('node:fs/promises')
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        await walk(full)
      } else if (/\.(js|mjs|vue|css)$/.test(entry.name)) {
        const content = await readFile(full, 'utf8')
        if (needles.some((needle) => content.includes(needle))) hits.push(path.relative(root, full))
      }
    }
  }
  for (const dir of scanDirs) await walk(path.join(root, dir))
  assert.deepEqual(hits, ['lib/sources/common.js'], `socket 模块字面唯一命中应为 lib/sources/common.js，实得 ${JSON.stringify(hits)}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// T6：重定向自实现（P-13）+ Accept-Encoding 协商与解压一致性（P-14）
// ─────────────────────────────────────────────────────────────────────────────

/** 多跳 seam：每次 dial 新建假 socket 并记账 CONNECT 目标（跨 host 重建断言面：目标在请求行）。 */
function makeMultiSeams({ requestImpl }) {
  const dials = []
  return {
    dials,
    seams: {
      dial: async ({ host, port }) => {
        const raw = new FakeSocket('raw')
        scheduleData(raw, CONNECT_OK)
        dials.push({ host, port, raw })
        return raw
      },
      upgrade: async () => new FakeSocket('secure'),
      requestImpl,
    },
  }
}

/** 从各跳 CONNECT 请求行取隧道目标 host（P-13 跨 host 重建的机械判据）。 */
function connectTargets(dials) {
  return dials.map((d) => /^CONNECT ([^:]+):/.exec(d.raw.writes[0])[1])
}

/** 脚本化假请求：按 url 分派 {status, headers, body, hang}；记录调用序列。 */
function scriptedRequest(script) {
  const calls = []
  const impl = (options, callback) => {
    calls.push({ url: options.url, headers: options.headers, method: options.method })
    const step = script(options.url)
    const req = new EventEmitter()
    req.write = () => true
    req.setTimeout = () => {}
    req.destroy = () => {}
    req.end = () => {
      if (step.hang) return
      const res = new EventEmitter()
      res.statusCode = step.status ?? 200
      res.headers = step.headers ?? {}
      callback(res)
      setImmediate(() => {
        if (step.body) res.emit('data', Buffer.from(step.body))
        res.emit('end')
      })
    }
    return req
  }
  return { impl, calls }
}

test('P-13 重定向自实现 + 跨 host 重建隧道（www.bing.com → cn.bing.com 实景形）', async () => {
  const { impl, calls } = scriptedRequest((url) => {
    if (url.startsWith('https://www.bing.com/')) {
      return { status: 302, headers: { location: 'https://cn.bing.com/search?q=test' } }
    }
    return { status: 200, body: '<html><body>cn.bing 终页</body></html>' }
  })
  const { dials, seams } = makeMultiSeams({ requestImpl: impl })
  const response = await requestViaTunnel('https://www.bing.com/search?q=test', { proxy: PROXY, timeoutMs: 500, ...seams })
  assert.equal(response.status, 200, '302 被消费，终页状态外露')
  assert.equal(await response.text(), '<html><body>cn.bing 终页</body></html>')
  assert.deepEqual(calls.map((c) => c.url), ['https://www.bing.com/search?q=test', 'https://cn.bing.com/search?q=test'], '逐跳 URL 自控跟随（非 https 自动重定向）')
  assert.deepEqual(connectTargets(dials), ['www.bing.com', 'cn.bing.com'], '跨 host 重定向逐跳重建隧道（CONNECT 目标换新 host）')
})

test('P-13 同 host 重定向：同 host 逐跳重建（Connection: close 语义）正确收口', async () => {
  const { impl, calls } = scriptedRequest((url) => {
    if (url.endsWith('/start')) return { status: 301, headers: { location: '/mid' } }
    if (url.endsWith('/mid')) return { status: 307, headers: { location: '/final' } }
    return { status: 200, body: '<html>同 host 终页</html>' }
  })
  const { dials, seams } = makeMultiSeams({ requestImpl: impl })
  const response = await requestViaTunnel('https://www.example.com/start', { proxy: PROXY, timeoutMs: 500, ...seams })
  assert.equal(await response.text(), '<html>同 host 终页</html>')
  assert.equal(calls.length, 3, '三跳各自请求')
  assert.deepEqual(connectTargets(dials), ['www.example.com', 'www.example.com', 'www.example.com'], '同 host 逐跳重建隧道（CONNECT 目标同 host）')
})

test('P-13 深度上限与环拒绝（禁无限跟随）', async () => {
  // 链式 302：/r0 → /r1 → …（每跳新路径）→ 超限拒
  const chain = scriptedRequest((url) => {
    const index = Number(url.split('/r')[1])
    return { status: 302, headers: { location: `/r${index + 1}` } }
  })
  const chainSeams = makeMultiSeams({ requestImpl: chain.impl })
  await assert.rejects(
    () => requestViaTunnel('https://www.example.com/r0', { proxy: PROXY, timeoutMs: 500, ...chainSeams.seams }),
    (error) => error.code === 'TOO_MANY_REDIRECTS' && /上限/.test(error.message),
    '超深度上限即拒',
  )
  assert.ok(chain.calls.length <= 7, '跳数有界（不无限跟随）')
  // 环：A → B → A
  const loop = scriptedRequest((url) => {
    if (url.endsWith('/a')) return { status: 302, headers: { location: 'https://www.example.com/b' } }
    return { status: 302, headers: { location: 'https://www.example.com/a' } }
  })
  const loopSeams = makeMultiSeams({ requestImpl: loop.impl })
  await assert.rejects(
    () => requestViaTunnel('https://www.example.com/a', { proxy: PROXY, timeoutMs: 500, ...loopSeams.seams }),
    (error) => error.code === 'REDIRECT_LOOP',
    '成环快拒（访问集判定）',
  )
  assert.equal(loop.calls.length, 2, '环在第 2 跳即拒（不等深度上限）')
})

test('P-13 重定向目标必经出站门禁（防 redirect 绕过，INV-15）', async () => {
  for (const location of ['http://www.example.com/downgrade', 'https://127.0.0.1/internal', 'https://169.254.169.254/meta']) {
    const { impl } = scriptedRequest(() => ({ status: 302, headers: { location } }))
    const { seams } = makeMultiSeams({ requestImpl: impl })
    await assert.rejects(
      () => requestViaTunnel('https://www.example.com/start', { proxy: PROXY, timeoutMs: 500, ...seams }),
      (error) => error.code === 'BAD_TARGET',
      `重定向到 ${location} 必须被门禁拒`,
    )
  }
})

test('P-14 Accept-Encoding 协商 + 解压矩阵（br/gzip/deflate）与重定向链一致', async () => {
  const zlib = await import('node:zlib')
  const cases = [
    ['br', zlib.brotliCompressSync(Buffer.from('<p>br 跳后</p>'))],
    ['gzip', zlib.gzipSync(Buffer.from('<p>gzip 跳后</p>'))],
    ['deflate', zlib.deflateSync(Buffer.from('<p>deflate 跳后</p>'))],
  ]
  for (const [encoding, payload] of cases) {
    const { impl, calls } = scriptedRequest((url) => {
      if (url.endsWith('/start')) return { status: 302, headers: { location: '/end' } }
      return { status: 200, headers: { 'content-encoding': encoding }, body: payload }
    })
    const { seams } = makeMultiSeams({ requestImpl: impl })
    const response = await requestViaTunnel('https://www.example.com/start', { proxy: PROXY, timeoutMs: 500, ...seams })
    assert.equal(calls[0].headers['Accept-Encoding'], 'gzip, br, deflate', '请求显式协商压缩面（P-14）')
    assert.equal(await response.text(), `<p>${encoding} 跳后</p>`, `${encoding} 解压后回收（重定向链每跳各自解压）`)
  }
})

test('P-14 解压后才交 classifyBlock：重定向链尾 challenge 样本 blocked 命中（INV-5 输入面）', async () => {
  const challenge = await readFile(path.join(FIXTURES, 'challenge-sample.html'), 'utf8')
  const { impl } = scriptedRequest((url) => {
    if (url.endsWith('/search?q=test')) return { status: 302, headers: { location: 'https://cn.bing.com/landing' } }
    return { status: 200, body: challenge }
  })
  const { seams } = makeMultiSeams({ requestImpl: impl })
  await assert.rejects(
    () => fetchHtml('https://www.bing.com/search?q=test', { timeoutMs: 500, retries: 2, proxy: PROXY, tunnelSeams: seams }),
    (error) => error.code === BLOCK_CODE,
    '重定向链尾解压 HTML 交 classifyBlock 命中（blocked）',
  )
})

test('T6 确定性失败零重试：REDIRECT_LOOP 不进重试环（dial 有界）', async () => {
  const loop = scriptedRequest((url) => {
    if (url.endsWith('/a')) return { status: 302, headers: { location: 'https://www.example.com/b' } }
    return { status: 302, headers: { location: 'https://www.example.com/a' } }
  })
  const { dials, seams } = makeMultiSeams({ requestImpl: loop.impl })
  await assert.rejects(
    () => fetchHtml('https://www.example.com/a', { timeoutMs: 500, retries: 3, proxy: PROXY, tunnelSeams: seams }),
    (error) => error.code === 'REDIRECT_LOOP',
  )
  assert.equal(dials.length, 2, '零重试：dial 恰两跳即止（retries=3 不消耗）')
})

// ─────────────────────────────────────────────────────────────────────────────
// T26 复核：classifyBlock 输入面 = status + 解压后 HTML（INV-5 链路未因 K-18 放宽而破）
// ─────────────────────────────────────────────────────────────────────────────

test('T26 classifyBlock 输入面：压缩传输的 challenge 解压后仍命中 blocked（INV-5 不破）', async () => {
  const zlib = await import('node:zlib')
  const challenge = await readFile(path.join(FIXTURES, 'challenge-sample.html'), 'utf8')
  for (const [encoding, pack] of [
    ['gzip', (s) => zlib.gzipSync(Buffer.from(s))],
    ['br', (s) => zlib.brotliCompressSync(Buffer.from(s))],
  ]) {
    const { seams } = makeMultiSeams({
      requestImpl: fakeRequest({ headers: { 'content-encoding': encoding }, body: pack(challenge) }),
    })
    await assert.rejects(
      () => fetchHtml(URL1, { timeoutMs: 500, retries: 0, proxy: PROXY, tunnelSeams: seams }),
      (error) => error.code === BLOCK_CODE,
      `${encoding} 传输的 challenge：解压后 HTML 交 classifyBlock 命中（输入面=解压文本，非压缩字节）`,
    )
    // 对照：同编码的正常 SERP 文本不误报（status+解压 HTML 双输入面正常工作）
    const ok = makeMultiSeams({
      requestImpl: fakeRequest({ headers: { 'content-encoding': encoding }, body: pack('<html><body>正常页面</body></html>') }),
    })
    const html = await fetchHtml(URL1, { timeoutMs: 500, retries: 0, proxy: PROXY, tunnelSeams: ok.seams })
    assert.equal(html, '<html><body>正常页面</body></html>', `${encoding} 解压后文本原样回收（非误判面）`)
  }
})
