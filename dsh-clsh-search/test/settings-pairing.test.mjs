// settings-pairing.test.mjs — t27（repair-round-2）：settings 读写配对（W65-B1）+ W1/N1/N2 关闭面
//
// 真对真配对：registerSettingsRoutes 处理器 × createSettingsApi fetchImpl 桥接（离线假 req/res）。
// 探针口径（W65-B1）：预置 timeoutMs=5000/sources.ddg=false → load 读回、save 不被默认值覆写。
// 离线：mkdtemp 注入 + 假 configEditor（宿主 configEditor.edit 同形），不触网、不写真实 home。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import {
  API_PREFIX,
  createApplyPatch,
  registerSettingsRoutes,
} from '../lib/settings-routes.js'
import { Config, apply } from '../lib/index.js'
import { createSettingsApi } from '../web/src/lib/settings-api.js'
import { createFakeCtx } from './helpers/fake-ctx.mjs'

const WEB_DIST = fileURLToPath(new URL('../web/dist', import.meta.url))

/** fetchImpl 桥：把 createSettingsApi 的请求送进 registerSettingsRoutes 的 handler（假 req/res）。 */
function bridgeFetch(handler) {
  return async (url, init = {}) => {
    const req = Readable.from(init.body ? [Buffer.from(String(init.body))] : [])
    req.method = init.method ?? 'GET'
    req.url = String(url)
    req.headers = init.headers ?? {}
    const rec = { status: null, headers: null, body: null }
    const res = {
      writeHead(status, headers) {
        rec.status = status
        rec.headers = headers ?? {}
      },
      end(body) {
        rec.body = body ?? null
      },
    }
    await handler(req, res)
    return {
      ok: rec.status < 400,
      status: rec.status,
      json: async () => JSON.parse(String(rec.body)),
    }
  }
}

/** 假 configEditor（宿主 configEditor.edit 同形）：entries/edit + 内存 current 持久面。 */
function editorStub(initial) {
  const state = { current: structuredClone(initial), edits: 0 }
  return {
    state,
    configEditor: {
      entries: () => [{ options: { id: 'dsh-clsh-search' } }],
      async edit(entry, fn) {
        state.edits += 1
        state.current = structuredClone(fn(structuredClone(state.current), {}))
      },
    },
  }
}

/** 装置：真 registerSettingsRoutes（含 applyPatch 写缝）+ 假 configEditor。 */
function setupPairing(initial) {
  const editor = editorStub(initial)
  const captured = []
  const disposers = registerSettingsRoutes({
    register: (spec) => {
      captured.push(spec)
      return () => captured.splice(captured.indexOf(spec), 1)
    },
    connection: null,
    getConfig: () => structuredClone(editor.state.current),
    applyPatch: createApplyPatch({ configEditor: editor.configEditor, entryId: 'dsh-clsh-search', Config }),
    distDir: WEB_DIST,
    warn: () => {},
  })
  assert.equal(captured.length, 1)
  return { editor, handler: captured[0].handler, disposers }
}

test('W65-B1 真对真配对：load 读回已存值、save 后持久面不被默认值覆写（探针口径）', async () => {
  const preset = {
    timeoutMs: 5000,
    sources: { ddg: false, bing: true, so360: true, baidu: true, priority: ['ddg', 'bing', 'so360', 'baidu'] },
  }
  const { editor, handler } = setupPairing(preset)
  const api = createSettingsApi({ fetchImpl: bridgeFetch(handler), timeoutMs: 0 })

  // load 读回已存值（修复前：信封错位 → 读回全默认 = 数据重置级）
  const loaded = await api.load()
  assert.equal(loaded.timeoutMs, 5000, 'load 读回预置 timeoutMs（W65-B1 核心）')
  assert.equal(loaded.sources.ddg, false, 'load 读回预置 sources.ddg=false')

  // save（改一项）：持久面其余值不被默认值覆写
  const saved = await api.save({ ...loaded, maxResults: 3 })
  assert.equal(editor.state.current.timeoutMs, 5000, 'save 不重置 timeoutMs')
  assert.equal(editor.state.current.sources.ddg, false, 'save 不重置 sources.ddg')
  assert.equal(editor.state.current.maxResults, 3, 'save 改动落盘')
  assert.equal(saved.maxResults, 3, 'save 回显=归一后模型')

  // 再 load：探针口径复验（不被默认值覆写）
  const reloaded = await api.load()
  assert.equal(reloaded.timeoutMs, 5000, '复验：二次 load 仍 5000')
  assert.equal(reloaded.sources.ddg, false, '复验：二次 load 仍 ddg=false')
  assert.equal(reloaded.maxResults, 3)
  assert.equal(editor.state.edits, 1, 'load 不触写缝、save 恰写一次')
})

test('W65-B1 信封统一：GET={data:{config, editable, writable}}、写回={data:{ok, config}}，客户端归一读 data.config', async () => {
  const { handler } = setupPairing({ timeoutMs: 12000 })
  const getRes = await bridgeFetch(handler)('api/dsh-clsh-search/settings', {})
  const getBody = await getRes.json()
  assert.ok(getBody.data.config, 'GET 信封 data.config 在场（客户端归一读点）')
  assert.equal(getBody.data.config.timeoutMs, 12000)
  assert.ok(Array.isArray(getBody.data.editable), 'editable 白名单在场（与 config 同 data 层）')
  assert.equal(getBody.data.writable, true)

  const putRes = await bridgeFetch(handler)('api/dsh-clsh-search/settings', {
    method: 'PUT',
    body: JSON.stringify({ patch: { maxResults: 5 } }),
  })
  const putBody = await putRes.json()
  assert.equal(putBody.data.config.maxResults, 5, '写回信封 data.config')
  assert.equal(putBody.data.ok, true)
})

test('W65-W1 内层子插件形：ctx.plugin({inject:[webServer, connection]}) 接线 + seam 缺位 warn 可见', async () => {
  // cordis 面（ctx.plugin 在场）：子插件形注册 + seam 缺位 fail-open warn 可见
  const fixture = createFakeCtx()
  const pluginCalls = []
  const pluginDisposals = []
  fixture.ctx.plugin = (spec) => {
    pluginCalls.push(spec)
    return () => { pluginDisposals.push(true) }
  }
  apply(fixture.ctx, {})
  assert.equal(pluginCalls.length, 1, '内层子插件形注册（wiki-steward 同款）')
  assert.deepEqual(pluginCalls[0].inject, ['webServer', 'connection'], 'webServer/connection 进子插件 inject（顶层 inject 不动）')
  assert.equal(typeof pluginCalls[0].apply, 'function')
  assert.ok(fixture.state.warnings.some((w) => /fail-open/.test(w)), 'seam 缺位 warn 可见（W65-W1：skip 路径升级）')

  // 子插件 apply 在 seam 在场时挂载路由（effect 缝形）
  const registered = []
  const subCtx = {
    effect(execute, label) {
      assert.equal(label, 'dsh-clsh-search: settings-routes')
      return execute()
    },
    webServer: { register: (spec) => { registered.push(spec); return () => registered.splice(0, 1) } },
    connection: { requestRejection: () => null },
  }
  pluginCalls[0].apply(subCtx)
  assert.equal(registered.length, 1, '子插件 apply 挂载 settings 路由')
  assert.equal(registered[0].path, API_PREFIX)

  // 非 cordis 面（无 plugin 的裸/测试 ctx）：缺缝 trace 静默（单元面零告警断言限该面保持）
  const bare = createFakeCtx()
  apply(bare.ctx, {})
  assert.equal(bare.state.warnings.length, 0, '非 cordis 面缺缝静默（不进告警面）')
})

test('W65-N2 坏 JSON 回 400 bad_json（不再 500）', async () => {
  const { handler } = setupPairing({})
  const rec = { status: null, body: null }
  const req = Readable.from([Buffer.from('{not json')])
  req.method = 'PUT'
  req.url = `${API_PREFIX}/settings`
  req.headers = {}
  await handler(req, {
    writeHead(status) { rec.status = status },
    end(body) { rec.body = body ?? null },
  })
  assert.equal(rec.status, 400, '坏 JSON=客户端错误 400（W65-N2）')
  assert.equal(JSON.parse(rec.body).error.code, 'bad_json')
})

test('W65-N1 静态面 realpath 前缀核：symlink 逃逸不 200（W65-N1 补核）', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-static-'))
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-outside-'))
  try {
    await writeFile(path.join(dir, 'main.js'), 'export const ok = 1', 'utf8')
    await writeFile(path.join(outside, 'secret.js'), 'export const secret = 1', 'utf8')
    await mkdir(path.join(dir, 'links'), { recursive: true })
    await symlink(path.join(outside, 'secret.js'), path.join(dir, 'links', 'escape.js'))
    const captured = []
    registerSettingsRoutes({
      register: (spec) => { captured.push(spec); return () => {} },
      connection: null,
      getConfig: () => ({}),
      distDir: dir,
      warn: () => {},
    })
    const handler = captured[0].handler
    async function get(url) {
      const rec = { status: null, body: null }
      const req = Readable.from([])
      req.method = 'GET'
      req.url = url
      req.headers = {}
      await handler(req, {
        writeHead(status) { rec.status = status },
        end(body) { rec.body = body ?? null },
      })
      return rec
    }
    assert.equal((await get(`${API_PREFIX}/main.js`)).status, 200, '同目录文件可达')
    assert.equal((await get(`${API_PREFIX}/links/escape.js`)).status, 404, 'realpath 逃逸 symlink 不 200（W65-N1）')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
