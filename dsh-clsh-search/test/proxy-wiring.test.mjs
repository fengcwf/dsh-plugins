// proxy-wiring.test.mjs — T-A 代理接线双证（US-21/23，K-23，INV-27）
// 背景（t42 D4-14）：0.2.0 四源 fetchHtml 全不传 proxy，328/328 全绿也没抓到（测试面 grep proxy 零命中）。
// 本卡核心 = grep + 桩 tunnel 双证：桩注入（dial/upgrade/requestImpl）离线断言 proxy 真传到 fetchHtml
// 隧道面，**不真连代理**（K-27 / 离线绿硬门禁）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'

import { pickProxyAddress, proxyStatus, resolveProxyFor } from '../lib/sources/common.js'
import { createSource as createDdgSource } from '../lib/sources/ddg.js'
import { createSource as createBingSource } from '../lib/sources/bing.js'
import { createSource as createSo360Source } from '../lib/sources/so360.js'
import { createSource as createBaiduSource } from '../lib/sources/baidu.js'
import { createDiagnostics } from '../lib/diagnostics.js'
import { createTriggerLog } from '../lib/trigger-log.js'
import { Config } from '../lib/index.js'

const POOL = [{ id: 'main', label: '主力', address: 'http://proxy.test:8080' }]

/** Config 装置：useProxy 勾选 + 代理池（可空）。 */
function makeConfig({ useProxy = {}, proxies = POOL } = {}) {
  return Config.parse({ sources: { useProxy }, proxies })
}

/** 假 socket（EventEmitter 形）：记录写入与销毁。 */
class FakeSocket extends EventEmitter {
  constructor() {
    super()
    this.destroyed = false
    this.writes = []
  }
  write(chunk) {
    this.writes.push(String(chunk))
    return true
  }
  destroy() {
    this.destroyed = true
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

const CONNECT_OK = 'HTTP/1.1 200 Connection Established\r\n\r\n'

/** 桩 tunnel：dial 记账目标、回 CONNECT 200；requestImpl 回 200 + 可解析页（离线，零真连）。 */
function makeStubTunnel({ body = '<html><body>ok</body></html>' } = {}) {
  const dials = []
  const requests = []
  return {
    dials,
    requests,
    seams: {
      dial: async ({ host, port }) => {
        const raw = new FakeSocket()
        dials.push({ host, port })
        setImmediate(() => raw.emit('data', Buffer.from(CONNECT_OK)))
        return raw
      },
      upgrade: async () => new FakeSocket(),
      requestImpl: (options, callback) => {
        requests.push(options)
        const req = new EventEmitter()
        req.write = () => true
        req.setTimeout = () => {}
        req.destroy = () => {}
        req.end = () => {
          const res = new EventEmitter()
          res.statusCode = 200
          res.headers = {}
          callback(res)
          setImmediate(() => {
            res.emit('data', Buffer.from(body))
            res.emit('end')
          })
        }
        return req
      },
    },
  }
}

/** fetch 计数桩（断言走隧道时零 fetch）。 */
async function withFetchCounter(run) {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({}) }
  }
  try {
    return await run(() => calls)
  } finally {
    globalThis.fetch = original
  }
}

const SOURCE_FACTORIES = [
  ['ddg', createDdgSource],
  ['bing', createBingSource],
  ['so360', createSo360Source],
  ['baidu', createBaiduSource],
]

test('resolveProxyFor 语义（T-A2 修订）：勾选开取池首项、关/未知源直连、空池自动直连 + 降级标志', () => {
  const on = makeConfig({ useProxy: { ddg: true } })
  assert.deepEqual(resolveProxyFor(on, 'ddg'), { address: 'http://proxy.test:8080' }, '勾选开 → 池首项（走哪套=池首项，B2）')
  // R21 默认态：ddg/bing 默认走（境外）、so360/baidu 默认直连（国内）
  assert.deepEqual(resolveProxyFor(makeConfig({}), 'bing'), { address: 'http://proxy.test:8080' }, '境外源默认走代理（R21）')
  assert.equal(resolveProxyFor(makeConfig({}), 'so360'), undefined, '国内源默认直连（R21）')
  const off = makeConfig({ useProxy: { ddg: false, bing: false, so360: false, baidu: false } })
  assert.equal(resolveProxyFor(off, 'bing'), undefined, '显式不勾 → 直连')
  assert.equal(resolveProxyFor(on, 'ghost'), undefined, '未知源 → 直连')
  assert.equal(pickProxyAddress(on), 'http://proxy.test:8080', '池首项选取单源')
  // T-A2（产品裁定 2026-10-10）：空池 + 勾选 = 自动直连 + 可探测降级标志（不抛错，开箱即用不破）
  const empty = makeConfig({ useProxy: { ddg: true }, proxies: [] })
  assert.equal(resolveProxyFor(empty, 'ddg'), undefined, '空池 + 勾选 → 直连（不抛 PROXY_UNAVAILABLE）')
  assert.deepEqual(proxyStatus(empty, 'ddg'), { wantProxy: true, active: false, degraded: true, reason: 'proxy-pool-empty' }, '降级标志可探测（UI 提示「已勾选但未配代理地址，当前直连」）')
  assert.deepEqual(proxyStatus(on, 'ddg'), { wantProxy: true, active: true, degraded: false }, '池非空勾选 → 无降级')
  assert.deepEqual(proxyStatus(off, 'ddg'), { wantProxy: false, active: false, degraded: false }, '不勾 → 无降级')
})

test('四源接线：proxy 真传到 fetchHtml 隧道面（桩 tunnel，逐源断言，离线零真连）', async () => {
  for (const [id, createSource] of SOURCE_FACTORIES) {
    const stub = makeStubTunnel()
    const config = makeConfig({ useProxy: { [id]: true } })
    config.tunnelSeams = stub.seams // 注入桩（生产缺省=真实现）
    const source = createSource(config)
    await withFetchCounter(async (fetchCalls) => {
      const outcome = await source.search('probe', undefined)
      assert.deepEqual(outcome.sources, [], '空页解析不抛（接线面测试锚）')
      assert.equal(stub.dials.length, 1, `${id}：走隧道恰一次建连`)
      assert.deepEqual(stub.dials[0], { host: 'proxy.test', port: 8080 }, `${id}：CONNECT 目标 = 代理地址（proxy 真传到 fetchHtml）`)
      assert.equal(fetchCalls(), 0, `${id}：走隧道时 fetch 零调用（不静默直连）`)
      assert.equal(stub.requests.length, 1, `${id}：隧道内真发一请求`)
    })
  }
})

test('勾选关 → 直连 fetch 面（dial 零调用）；显式不勾优先于 R21 默认', async () => {
  for (const [id, createSource] of SOURCE_FACTORIES) {
    const stub = makeStubTunnel()
    const config = makeConfig({ useProxy: { ddg: false, bing: false, so360: false, baidu: false } })
    config.tunnelSeams = stub.seams
    const source = createSource(config)
    const original = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls += 1
      return { ok: true, status: 200, text: async () => '<html><body>ok</body></html>' }
    }
    try {
      await source.search('probe', undefined)
    } finally {
      globalThis.fetch = original
    }
    assert.equal(fetchCalls, 1, `${id}：直连走 fetch 面恰一次`)
    assert.equal(stub.dials.length, 0, `${id}：直连零隧道建连（不误走代理）`)
  }
})

test('空池 + 勾选 → 自动直连 + 降级标志（T-A2：零隧道建连、走 fetch 面成功）', async () => {
  for (const [id, createSource] of SOURCE_FACTORIES) {
    const stub = makeStubTunnel()
    const config = makeConfig({ useProxy: { [id]: true }, proxies: [] })
    config.tunnelSeams = stub.seams
    const source = createSource(config)
    const original = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls += 1
      return { ok: true, status: 200, text: async () => '<html><body>ok</body></html>' }
    }
    try {
      const outcome = await source.search('probe', undefined)
      assert.deepEqual(outcome.sources, [], `${id}：空池勾选自动直连（不抛错，开箱即用不破）`)
    } finally {
      globalThis.fetch = original
    }
    assert.equal(fetchCalls, 1, `${id}：走直连 fetch 面恰一次`)
    assert.equal(stub.dials.length, 0, `${id}：零隧道建连（直连）`)
    assert.equal(proxyStatus(config, id).degraded, true, `${id}：降级标志可探测（明示非静默）`)
  }
})

test('diagnostics probe() 空池勾选下与真实取数一致（都直连）+ 降级标志回传（T-A2）', async () => {
  // 勾选 + 空池：真实取数 = 自动直连；探针同语义直连成功，且结果带 proxyDegraded 供 UI 提示
  const emptyPoolConfig = makeConfig({ useProxy: { ddg: true }, proxies: [] })
  const triggerLog = createTriggerLog({ capacity: 10 })
  const diagnostics = createDiagnostics({
    config: emptyPoolConfig,
    validateConfig: (candidate) => Config.safeParse(candidate),
    triggerLog,
    getGuard: () => ({ egoUsed: () => 0, egoLimit: () => 15 }),
    clearCache: async () => 0,
    sourcesById: () => new Map([['ddg', createDdgSource(emptyPoolConfig)]]),
    hasWriteSeam: () => true,
  })
  const original = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    return { ok: true, status: 200, text: async () => '<html><body>ok</body></html>' }
  }
  try {
    const result = await diagnostics.probe('ddg')
    assert.equal(result.ok, true, '探针直连成功（与真实取数一致：都直连，不抛）')
    assert.equal(fetchCalls, 1, '探针走直连 fetch 面')
    assert.equal(result.proxyDegraded, true, '结果带降级标志（供 UI 提示「已勾选但未配代理地址，当前直连」）')
  } finally {
    globalThis.fetch = original
  }
  // 对照：显式不勾 → 探针直连成功且无降级标志
  const directConfig = makeConfig({ useProxy: { ddg: false, bing: false, so360: false, baidu: false } })
  const direct = createDiagnostics({
    config: directConfig,
    validateConfig: (candidate) => Config.safeParse(candidate),
    triggerLog,
    getGuard: () => ({ egoUsed: () => 0, egoLimit: () => 15 }),
    clearCache: async () => 0,
    sourcesById: () => new Map([['ddg', createDdgSource(directConfig)]]),
    hasWriteSeam: () => true,
  })
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '<html><body>ok</body></html>' })
  try {
    const ok = await direct.probe('ddg')
    assert.equal(ok.ok, true, '直连探针成功（勾选关语义一致）')
    assert.equal(ok.proxyDegraded, false, '不勾无降级标志')
  } finally {
    globalThis.fetch = original
  }
})

test('grep 双证：四源 fetchHtml 调用均含 proxy（机械判据，0.2.0 教训面）', async () => {
  for (const file of ['ddg.js', 'bing.js', 'so360.js', 'baidu.js']) {
    const content = await readFile(new URL(`../lib/sources/${file}`, import.meta.url), 'utf8')
    const calls = content.match(/fetchHtml\(buildUrl\(q\), \{[^}]*\}\)/g) ?? []
    assert.equal(calls.length, 1, `${file}：fetchHtml 调用恰一处`)
    assert.match(calls[0], /proxy: resolveProxyFor\(config, name\)/, `${file}：fetchHtml 调用含 proxy（接线在场）`)
    assert.match(content, /import \{[^}]*resolveProxyFor[^}]*\} from '\.\/common\.js'/, `${file}：resolveProxyFor 导入在场`)
  }
})
