// dsh-login-gate — lib/settings-write.js 用例（Task 11 设置面写路径）
// 覆盖：可写白名单（只读键/白名单外键携带=整单拒 not_editable）、值域校验（整数/布尔/正则）、
//      合并+真 zod 校验、端口预检（真 net 可绑定性探测 + mock 占用路径）、
//      R-16 语义面（restartRequired 判定废除：配置写入经宿主 re-apply 即时生效）、
//      configEditor 缝封装（change 形按 kb-context 契约）。
import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { Config } from '../lib/index.js'
import {
  EDITABLE_KEYS,
  checkPatchEditable,
  checkPatchValues,
  validatePatch,
  applyEditablePatch,
  probePortBindable,
  precheckPort,
  createApplyPatch,
  readEntryConfig,
  createConfigReader,
} from '../lib/settings-write.js'

/** 假 configEditor（缝契约形，对齐 dsh-config-editor 实测：entry.options.config=已保存显式配置） */
function fakeConfigEditor(initialConfig = {}, { entryId = 'login-gate', withEntry = true, editThrows = null } = {}) {
  const state = { config: { ...initialConfig }, editCalls: 0 }
  return {
    state,
    entries: () => (withEntry ? [{ options: { id: entryId, config: state.config } }] : []),
    edit: async (entry, cb) => {
      state.editCalls += 1
      if (editThrows) throw editThrows
      const next = cb(state.config, {})
      if (next !== undefined) state.config = next
    },
  }
}

test('白名单：可写键过检；只读键/白名单外键携带=整单拒 not_editable（绝不静默丢键）', () => {
  assert.deepEqual(checkPatchEditable({ port: 3501, sessionDays: 7 }), { ok: true })
  assert.deepEqual(checkPatchEditable({ gzipPass: false, wsAllow: ['^/api/'], maxFailures: 3, secureCookie: false }), { ok: true })
  assert.deepEqual(EDITABLE_KEYS, ['port', 'sessionDays', 'maxFailures', 'secureCookie', 'wsAllow', 'gzipPass'])

  for (const key of ['listenHost', 'upstreamPort', 'rewriteHost', 'enabled', 'users', 'usersFile', 'unknownKey']) {
    const r = checkPatchEditable({ [key]: 1 })
    assert.equal(r.ok, false, `键 ${key} 应拒`)
    assert.equal(r.code, 'not_editable', `键 ${key} 应为 not_editable`)
    assert.match(r.message, /不可写/)
  }
  // 混合：一个可写键 + 一个只读键 = 整单拒（不是丢掉只读键后继续）
  const mixed = checkPatchEditable({ port: 3501, listenHost: '0.0.0.0' })
  assert.equal(mixed.ok, false)
  assert.equal(mixed.code, 'not_editable')
})

test('validatePatch：空 patch / 非对象 = invalid（校验失败类）', () => {
  for (const bad of [{}, null, undefined, 'x', 5, []]) {
    const r = validatePatch(bad)
    assert.equal(r.ok, false, `${JSON.stringify(bad)} 应拒`)
    assert.equal(r.code, 'invalid')
  }
})

test('值域校验：port 整数 1-65535；sessionDays/maxFailures 整数；布尔；wsAllow 正则可编译（any 豁免）', () => {
  // port：整数 + 值域（brief 裁定 4）
  for (const bad of [0, 65536, -1, 3.5, '3500', null]) {
    const r = checkPatchValues({ port: bad })
    assert.equal(r.ok, false, `port=${bad} 应拒`)
    assert.equal(r.code, 'invalid')
    assert.match(r.message, /端口/)
  }
  assert.deepEqual(checkPatchValues({ port: 1 }), { ok: true })
  assert.deepEqual(checkPatchValues({ port: 65535 }), { ok: true })

  // sessionDays：整数 1-3650（Config zod 同域）
  for (const bad of [0, 3651, 2.5]) {
    assert.equal(checkPatchValues({ sessionDays: bad }).ok, false, `sessionDays=${bad} 应拒`)
  }
  assert.deepEqual(checkPatchValues({ sessionDays: 3650 }), { ok: true })

  // maxFailures：正整数
  for (const bad of [0, -1, 1.5]) {
    assert.equal(checkPatchValues({ maxFailures: bad }).ok, false, `maxFailures=${bad} 应拒`)
  }
  assert.deepEqual(checkPatchValues({ maxFailures: 1 }), { ok: true })

  // 布尔面
  for (const key of ['secureCookie', 'gzipPass']) {
    assert.equal(checkPatchValues({ [key]: 'yes' }).ok, false, `${key}=字符串 应拒`)
    assert.deepEqual(checkPatchValues({ [key]: false }), { ok: true })
  }

  // wsAllow：字符串数组、正则可编译（坏正则写入会让 proxy.js apply 期 new RegExp 炸装载）；'any' 豁免
  assert.deepEqual(checkPatchValues({ wsAllow: ['^/api/', 'any'] }), { ok: true })
  assert.deepEqual(checkPatchValues({ wsAllow: [] }), { ok: true })
  assert.equal(checkPatchValues({ wsAllow: '[unclosed' }).ok, false, '非数组应拒')
  assert.equal(checkPatchValues({ wsAllow: ['[unclosed'] }).ok, false, '坏正则应拒')
  const badRe = checkPatchValues({ wsAllow: ['[unclosed'] })
  assert.equal(badRe.code, 'invalid')
  assert.equal(checkPatchValues({ wsAllow: [''] }).ok, false, '空串条目应拒')
})

test('applyEditablePatch：三层合并 + 真 zod 校验；config=写入形（current∪patch）、effective=归一全量', () => {
  const r = applyEditablePatch({
    inherited: { port: 3500, sessionDays: 30 },
    current: { port: 4600, maxFailures: 5 },
    patch: { sessionDays: 7, gzipPass: false },
  }, Config)
  assert.equal(r.ok, true)
  assert.deepEqual(r.config, { port: 4600, maxFailures: 5, sessionDays: 7, gzipPass: false }, '写入形=current∪白名单补丁')
  assert.equal(r.effective.port, 4600, 'current 覆盖 inherited')
  assert.equal(r.effective.sessionDays, 7)
  assert.equal(r.effective.gzipPass, false)
  assert.equal(r.effective.maxFailures, 5)
  assert.equal(r.effective.listenHost, '127.0.0.1', 'zod 缺省应补全')
  assert.equal(r.effective.upstreamPort, 3080)
})

test('applyEditablePatch：zod 校验失败 = invalid（消息含字段路径），白名单外绝不进写入形', () => {
  // 值域过检但整体生效面 zod 不过：usersFile 是数字（Config 要求 string|undefined）
  const r = applyEditablePatch({ current: { usersFile: 42 }, patch: { sessionDays: 5 } }, Config)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'invalid')
  assert.match(r.message, /usersFile/)
  // 白名单预检先行：not_editable 优先于任何校验
  const pre = applyEditablePatch({ current: {}, patch: { port: 3501, users: { a: 'x' } } }, Config)
  assert.equal(pre.ok, false)
  assert.equal(pre.code, 'not_editable')
})

test('R-16 语义面：restartRequired 判定废除（不再导出 restartRequiredFor/RESTART_KEYS）', async () => {
  // 实测（tester F-1，2026-09-29）：真实宿主 configEditor.resolveConfig 触发插件重 apply——配置写入即被宿主
  // 应用，「需重启生效」与现实相悖。响应面改 applied:true 恒定，boot 比较/pendingRestart latch 随之废除。
  const mod = await import('../lib/settings-write.js')
  assert.equal('restartRequiredFor' in mod, false, 'restartRequiredFor 应废除（R-16 即时生效）')
  assert.equal('RESTART_KEYS' in mod, false, 'RESTART_KEYS 应废除（无重启敏感键面）')
})

test('probePortBindable：真 net 可绑定性探测——占用=false、空闲=true（探测后立即 close）', async () => {
  const srv = net.createServer()
  await new Promise((resolve, reject) => {
    srv.once('error', reject)
    srv.listen({ port: 0, host: '127.0.0.1' }, resolve)
  })
  const { port } = srv.address()
  try {
    assert.equal(await probePortBindable(port, '127.0.0.1'), false, '已被占用的端口应探测为不可绑定')
    assert.equal(await probePortBindable(0, '127.0.0.1'), true, '空闲（交 OS 指派）应可绑定')
  } finally {
    await new Promise((resolve) => srv.close(resolve))
  }
})

test('precheckPort：端口未变更不探测；变更且占用 = port_in_use（含占用提示）；空闲 = ok', async () => {
  let calls = 0
  const probeBusy = async () => { calls += 1; return false }
  const current = { port: 3500, listenHost: '127.0.0.1' }

  const skip = await precheckPort({ patch: { sessionDays: 7 }, current, probePort: probeBusy })
  assert.deepEqual(skip, { ok: true })
  assert.equal(calls, 0, '未带 port 补丁不应触发探测')

  const same = await precheckPort({ patch: { port: 3500 }, current, probePort: probeBusy })
  assert.deepEqual(same, { ok: true })
  assert.equal(calls, 0, 'port 未变更不应触发探测（自身 listener 占用即误报）')

  const busy = await precheckPort({ patch: { port: 4500 }, current, probePort: probeBusy })
  assert.equal(busy.ok, false)
  assert.equal(busy.code, 'port_in_use')
  assert.match(busy.message, /4500/)
  assert.equal(calls, 1)

  const ok = await precheckPort({ patch: { port: 4500 }, current, probePort: async () => true })
  assert.deepEqual(ok, { ok: true })
})

test('createApplyPatch：configEditor 缝（entryId=login-gate）——白名单过检→edit 调用、写入形落 entry、返回 effective', async () => {
  const editor = fakeConfigEditor({ port: 4600, sessionDays: 30 })
  const applyPatch = createApplyPatch({ configEditor: editor, entryId: 'login-gate', Config })
  const r = await applyPatch({ sessionDays: 7 })
  assert.equal(r.ok, true)
  assert.equal(editor.state.editCalls, 1)
  assert.deepEqual(editor.state.config, { port: 4600, sessionDays: 7 }, 'entry config 应被写入形替换')
  assert.equal(r.effective.sessionDays, 7, '返回归一化生效面供回显')
  assert.equal(r.effective.port, 4600)
})

test('createApplyPatch：白名单外绝不触达 edit；缺 entry = no_entry；edit 抛错 = edit_failed（绝不抛穿路由）', async () => {
  const editor = fakeConfigEditor({ port: 4600 })
  const applyPatch = createApplyPatch({ configEditor: editor, entryId: 'login-gate', Config })

  const rejected = await applyPatch({ listenHost: '0.0.0.0' })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.code, 'not_editable')
  assert.equal(editor.state.editCalls, 0, '不可改字段绝不叫醒 edit')

  const noEntry = await createApplyPatch({ configEditor: fakeConfigEditor({}, { withEntry: false }), entryId: 'login-gate', Config })({ port: 3501 })
  assert.equal(noEntry.ok, false)
  assert.equal(noEntry.code, 'no_entry')

  const boom = new Error('落盘失败')
  const failed = await createApplyPatch({ configEditor: fakeConfigEditor({}, { editThrows: boom }), entryId: 'login-gate', Config })({ port: 3501 })
  assert.equal(failed.ok, false)
  assert.equal(failed.code, 'edit_failed')
  assert.match(failed.message, /落盘失败/)

  // 缝对象缺方法（半缺缝）也不抛穿
  const half = await createApplyPatch({ configEditor: {}, entryId: 'login-gate', Config })({ port: 3501 })
  assert.equal(half.ok, false)
  assert.equal(half.code, 'no_entry')
})

test('readEntryConfig（R-12）：entry.options.config 现读；缺缝/缺入口/异常=null 不抛穿', () => {
  const editor = fakeConfigEditor({ port: 4700 })
  assert.deepEqual(readEntryConfig(editor, 'login-gate'), { port: 4700 })
  assert.equal(readEntryConfig(editor, 'other-id'), null)
  assert.equal(readEntryConfig(null, 'login-gate'), null)
  assert.equal(readEntryConfig({}, 'login-gate'), null, '半缺缝按缺位收敛')
  assert.equal(readEntryConfig({ entries: () => { throw new Error('boom') } }, 'login-gate'), null, '异常收敛不抛')
  assert.equal(readEntryConfig(fakeConfigEditor({}, { withEntry: false }), 'login-gate'), null)
})

test('createConfigReader（R-12）：已保存面优先 overlay（written∪boot）；缺缝回退 base；现读异常回退 base', () => {
  const editor = fakeConfigEditor({ port: 4700, sessionDays: 7 })
  const read = createConfigReader({
    getBase: () => ({ port: 3500, listenHost: '127.0.0.1', sessionDays: 30 }),
    readSaved: () => readEntryConfig(editor, 'login-gate'),
    normalize: (c) => ({ ...c }),
  })
  assert.deepEqual(read(), { port: 4700, listenHost: '127.0.0.1', sessionDays: 7 }, 'saved 键优先、其余沿 boot')

  // 写后现读即新值（GET「返回已保存值」语义）
  editor.state.config = { ...editor.state.config, port: 4800 }
  assert.equal(read().port, 4800)

  // 缺缝→回退 base（written∪boot 的 boot 面）
  const readOnly = createConfigReader({
    getBase: () => ({ port: 3500 }),
    readSaved: () => readEntryConfig(null, 'login-gate'),
    normalize: (c) => ({ ...c }),
  })
  assert.deepEqual(readOnly(), { port: 3500 })

  // 现读异常→回退 base（绝不抛穿 GET）
  const throwing = createConfigReader({
    getBase: () => ({ port: 3500 }),
    readSaved: () => { throw new Error('boom') },
    normalize: (c) => ({ ...c }),
  })
  assert.deepEqual(throwing(), { port: 3500 })
})
