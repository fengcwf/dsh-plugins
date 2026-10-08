// test/rewrite-seam.test.mjs —— Round 3 生产缺陷修复（A2：宿主重载后改写缝不存活）红态→绿态测试
// 契约面：changes/2026-10-03-rtk-reinstall/task-fix4（观测先行 + A2 抗重载挂法 + 终审 triage 三随带项）。
//   ① 抗重载：宿主重载 shell 服务（同类新实例）后改写缝仍生效；teardown 身份校验不误伤后挂包壳
//   ② 观测锚点：apply 装载 / 包壳挂载 / 包壳首命中三条 info 留痕（区分「装了没被调用」vs「没装/被覆盖」）
//   ③ 健康项：「rewrite 能力可用」改名 + 新增「自动改写缝已挂载」（进程内命中计数，与②留痕同源）
//   ④ rewriteTimeoutMs 默认 400 + 超时 fail-open 补 debug 留痕
// 测试红线（INV-8）：零真 home、零真实网络；假 rtk 脚本落 mkdtemp（真 spawnSync 假脚本，零真实 rtk）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Config, apply } from '../lib/index.js'
import { HEALTH_ITEMS, getHealth } from '../lib/doctor.js'
import { snapshotRewriteSeamState } from '../lib/rewrite-seam.js'

// ───────────────────────── fixtures ─────────────────────────

/** 双模假 rtk 脚本（--version 答版本 / rewrite 答改写）：落 mkdtemp 供真 spawnSync 执行。 */
const DUAL_SCRIPT = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "rtk 9.9.9"; exit 0; fi\nif [ "$1" = "rewrite" ]; then echo "rtk $2"; exit 0; fi\nexit 1\n'
/** 慢脚本（rewrite 分支睡死）：逼出 spawnSync 超时分支（10ms 预算）。 */
const SLOW_SCRIPT = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "rtk 9.9.9"; exit 0; fi\nsleep 2\nexit 1\n'

/** mkdtemp 落点写假 rtk 脚本（INV-8：零真 home）。 */
function fakeRtk(root, script = DUAL_SCRIPT) {
  const binPath = path.join(root, 'bin', 'rtk')
  fs.mkdirSync(path.dirname(binPath), { recursive: true })
  fs.writeFileSync(binPath, Buffer.from(script))
  fs.chmodSync(binPath, 0o755)
  return binPath
}

/** 分级捕获 logger（info/warn/debug/error 全留痕）。 */
function makeLogger() {
  const lines = { info: [], warn: [], debug: [], error: [] }
  return {
    lines,
    info: (m) => lines.info.push(String(m)),
    warn: (m) => lines.warn.push(String(m)),
    debug: (m) => lines.debug.push(String(m)),
    error: (m) => lines.error.push(String(m)),
  }
}

/** 真 cordis Service 同形的 shell 执行器（resolve 在类原型上——宿主真身同构）。 */
class FakeShell {
  resolve(request) {
    return { ...request, resolved: true }
  }
}

/** 假 ctx（effect 走 cordis 工厂形语义：当场跑、返回值=拆除器）。 */
function makeCtx({ shell, logger } = {}) {
  const effects = []
  return {
    effects,
    tools: { register() {} },
    shell: shell ?? new FakeShell(),
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
    on() {},
    logger: logger ?? makeLogger(),
  }
}

/** 标准装载（显式 rtkBin=A3 透传；零真机 PATH 耦合）。 */
function load(root, { shell, logger, config = {}, binPath } = {}) {
  const bin = binPath ?? fakeRtk(root)
  const shellObj = shell ?? new FakeShell()
  const ctx = makeCtx({ shell: shellObj, logger })
  apply(
    ctx,
    { enabled: true, registerDoctorTool: false, awareness: 'off', rtkBin: bin, ...config },
    { resolveEnv: { path: '', homedir: '' } },
  )
  return { ctx, shell: shellObj, binPath: bin }
}

const REQ = { command: 'git status', stdin: null }

// ───────────────────────── ① A2 抗重载挂法 ─────────────────────────

test('A2 抗重载：宿主重载 shell 服务（同类新实例）后，改写缝在新实例上仍生效', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-reload-'))
  const { ctx } = load(root)
  assert.equal(ctx.shell.resolve(REQ).command, 'rtk git status', '挂载当口：包壳生效（前置对照）')
  // 宿主重载（executor 重载 / 配置 reconcile / service 重挂）：新实例接管 resolve 缝——旧实例级覆写不存活
  const shellB = new FakeShell()
  assert.equal(
    shellB.resolve(REQ).command,
    'rtk git status',
    'A2：重载后的新实例必须仍走改写缝（原型级包壳，实例级覆写不存活=生产缺陷根因）',
  )
})

test('A2 拆除不误伤：旧 teardown 迟到也不覆盖后挂包壳（身份校验还原）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-teardown-'))
  const first = load(root)
  const teardown1 = first.ctx.effects[0]
  const second = load(root, { shell: first.ctx.shell, binPath: path.join(root, 'bin', 'rtk') }) // 重挂（同 shell）
  const teardown2 = second.ctx.effects[0]
  teardown1() // 旧拆除器迟到（宿主重载顺序倒置）
  assert.equal(first.ctx.shell.resolve(REQ).command, 'rtk git status', '旧拆除不得覆盖后挂包壳（身份校验）')
  teardown2()
  assert.deepEqual(first.ctx.shell.resolve(REQ), { ...REQ, resolved: true }, '最终拆除：还原原始 resolve（恒等放行）')
})

// ───────────────────────── ② 观测锚点（装了没被调用 vs 没装/被覆盖） ─────────────────────────

test('观测锚点：apply 装载 info + 包壳挂载 info + 首次命中 info 恰一次', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-log-'))
  const logger = makeLogger()
  const { ctx } = load(root, { logger })
  const loaded = logger.lines.info.join('\n')
  assert.match(loaded, /\[rtk-kit\]/, '留痕必须带 rtk-kit 锚（可检索）')
  assert.match(loaded, /装载完成/, 'apply() 成功装载输出一行 info（FINDINGS-4）')
  assert.match(loaded, /包壳已安装/, '包壳挂载处留痕（FINDINGS-1：区分没装）')
  assert.ok(!/首次命中/.test(loaded), '未调用=不得出现首次命中（装了没被调用可判）')
  ctx.shell.resolve(REQ)
  ctx.shell.resolve(REQ)
  const hits = logger.lines.info.filter((m) => /首次命中/.test(m))
  assert.equal(hits.length, 1, '包壳首命中留痕恰一次（FINDINGS-1）')
  assert.match(hits[0], /\[rtk-kit\]/, '首命中留痕带 rtk-kit 锚')
})

// ───────────────────────── ⑤ Round 4：宿主 info 无出口 → console 必然可见 ─────────────────────────

/**
 * 捕获 console.log 输出（Round 4 断言面：三锚必须同文走 console）。
 * @param {() => void} fn - 受测动作
 * @returns {string[]} 捕获到的 console.log 行
 */
function captureConsole(fn) {
  const out = []
  const orig = console.log
  console.log = (...args) => out.push(args.map(String).join(' '))
  try {
    fn()
  } finally {
    console.log = orig
  }
  return out
}

test('Round 4 观测出口：三锚（装载/挂载/首命中）必须同文走 console——宿主 info 在生产零出口', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-console-'))
  const logger = makeLogger()
  const shell = new FakeShell()
  // 装载期（apply 内同步跑 mountRewriteSeam）：捕获装载 + 挂载两条
  const loadLines = captureConsole(() => {
    load(root, { logger, shell })
  })
  const anchors = loadLines.filter((m) => /\[rtk-kit\]/.test(m))
  assert.equal(anchors.length, 2, '装载期恰两条 console 留痕（apply 装载 + 包壳已安装）')
  assert.ok(
    anchors.some((m) => /装载完成/.test(m)),
    'apply 装载完成锚必须走 console（dsh-web.log 可见）',
  )
  assert.ok(
    anchors.some((m) => /包壳已安装/.test(m)),
    '包壳挂载锚必须走 console（dsh-web.log 可见）',
  )
  // 首命中（resolve 时）：恰一次 console 留痕
  const hitLines = captureConsole(() => {
    shell.resolve(REQ)
    shell.resolve(REQ)
  }).filter((m) => /\[rtk-kit\]/.test(m))
  assert.equal(hitLines.length, 1, '首命中 console 留痕恰一次（同 info 锚同文）')
  assert.match(hitLines[0], /首次命中/, '首命中锚文本一致（console/info 同文）')
  // 常量次数：后续 resolve 不得再刷 console（防日志洪水）
  const more = captureConsole(() => shell.resolve(REQ)).filter((m) => /\[rtk-kit\]/.test(m))
  assert.equal(more.length, 0, '二次起不再刷 console（留痕恰一次不变式）')
})

// ───────────────────────── ③ 健康项（真实挂载项 + 改名） ─────────────────────────

test('健康项：rewrite-seam 改名「rewrite 能力可用」+ 新增「自动改写缝已挂载」（零命中如实红）', async () => {
  const ids = HEALTH_ITEMS.map((i) => i.id)
  assert.ok(ids.includes('rewrite-mounted'), '必须新增真实挂载项 rewrite-mounted（FINDINGS-2）')
  assert.equal(HEALTH_ITEMS.find((i) => i.id === 'rewrite-seam').label, 'rewrite 能力可用', '误导项改名（只测 rtk 二进制能力）')
  assert.equal(HEALTH_ITEMS.find((i) => i.id === 'rewrite-mounted').label, '自动改写缝已挂载')
  const seam = await import('../lib/rewrite-seam.js')
  seam.resetRewriteSeamState() // 零挂载零命中
  const items = await getHealth({ exec: async () => ({ code: 0, stdout: 'rtk 9.9.9', stderr: '' }) })
  const mounted = items.find((i) => i.id === 'rewrite-mounted')
  assert.equal(mounted.status, 'fail', '缝未挂载/零命中不得绿（禁误导绿灯）')
  assert.match(mounted.detail, /命中/, 'detail 如实回显命中计数')
})

test('同源：命中计数同时驱动首命中留痕与真实挂载健康项（禁第二套逻辑）', async () => {
  const seam = await import('../lib/rewrite-seam.js')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-health-'))
  seam.resetRewriteSeamState()
  const logger = makeLogger()
  const { ctx } = load(root, { logger })
  ctx.shell.resolve(REQ)
  assert.equal(seam.snapshotRewriteSeamState().hitCount, 1, '包壳命中计数=1（进程内真值）')
  const items = await getHealth({ exec: async () => ({ code: 0, stdout: 'rtk 9.9.9', stderr: '' }) })
  assert.equal(items.find((i) => i.id === 'rewrite-mounted').status, 'pass', '命中后健康项转绿（与留痕同源计数）')
  assert.equal(logger.lines.info.filter((m) => /首次命中/.test(m)).length, 1, '健康项与首命中留痕读同一计数')
  assert.equal(seam.snapshotRewriteSeamState().rewriteCount, 1, '改写计数同源累计')
})

// ───────────────────────── ④ rewriteTimeoutMs 默认 + 超时留痕 ─────────────────────────

test('rewriteTimeoutMs 默认 400（150ms 余量过薄：p95 占 81%，FINDINGS-3）', () => {
  assert.equal(Config.parse({}).rewriteTimeoutMs, 400)
})

test('hitCount 是 history.db +1 判据的进程内对应物（真机复验之外必须有测试级对应物）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-hitcount-'))
  const { ctx } = load(root)
  const before = snapshotRewriteSeamState().hitCount
  ctx.shell.resolve(REQ) // 一次模型驱动调用（stdin:null）
  const after = snapshotRewriteSeamState()
  assert.equal(after.hitCount, before + 1, '每经包壳一次 hitCount +1（= history.db commands +1 的进程内对应物）')
  assert.equal(after.rewriteCount >= 1, true, '假 rtk 改写生效时 rewriteCount 同步累计（同源计数）')
  ctx.shell.resolve({ command: 'git status', stdin: null })
  ctx.shell.resolve({ command: 'git status', stdin: Buffer.from('x') }) // stdin 非空=hook 调用，恒等放行
  const s = snapshotRewriteSeamState()
  assert.equal(s.hitCount, before + 3, '包壳被调用即 +1（stdin 守卫只影响改写决策、不影响命中计数）')
  assert.ok(s.lastHitAt != null, '末次命中时间戳在场（可观测性）')
})

test('正修命中链：缝挂载后真实 resolve 必命中且命令被换成 rtk 前缀（防「注册了」误导）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-chain-'))
  const { ctx, shell } = load(root)
  // 「工具注册」与「缝挂了」是两个独立断言——只测前者曾把 0.4.0 缺陷误判为通过
  assert.equal(typeof ctx.shell.resolve, 'function', 'resolve 在场')
  const out = ctx.shell.resolve(REQ)
  assert.equal(out.command, 'rtk git status', '命中链末端：命令必须被改写为 rtk 前缀（否则历史库 +1 判据不成立）')
  assert.equal(snapshotRewriteSeamState().hitCount > 0, true, '挂载≠命中——必须实测 resolve 才转绿')
  assert.ok(shell.resolve[Symbol.for('rtk-kit:rewrite-seam.wrapper')] !== undefined, '包壳标记在场（幂等判重）')
})

test('超时 fail-open 补 debug 留痕（静默降级可观测，FINDINGS-3）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-timeout-'))
  const logger = makeLogger()
  const binPath = fakeRtk(root, SLOW_SCRIPT)
  const { ctx } = load(root, { logger, binPath, config: { rewriteTimeoutMs: 10 } })
  const out = ctx.shell.resolve(REQ)
  assert.equal(out.command, 'git status', '超时=恒等放行（fail-open 不变式）')
  assert.ok(
    logger.lines.debug.some((m) => /\[rtk-kit\]/.test(m) && /超时/i.test(m)),
    '超时必须留 debug 留痕（当前静默 fail-open=红态）',
  )
})

// ───────────── fix5 随带项（F-4）：留痕出口恒抛（EPIPE 语义）不得炸装载/挂载/改写 ─────────────

/**
 * 注入**恒抛** console.log（EPIPE 语义：stdout 断开 / 管道读端退出时 console 写必抛）。
 * 先把本次触达的文本记录进 calls、再抛——既保「恒抛」语义，也让「留痕路径确被真实触达」
 * 可断言（零触达 = 压根没走到出口，后面的 fail-open 断言会是假绿）。
 * @param {() => T} fn - 受测动作
 * @returns {{calls: string[], result: T}} 触达文本 + fn 返回值；fn 抛则先逆放 console 再原样抛
 * @template T
 */
function withThrowingConsole(fn) {
  const calls = []
  const orig = console.log
  console.log = (...args) => {
    calls.push(args.map(String).join(' '))
    const err = new Error('write EPIPE')
    err.code = 'EPIPE'
    throw err
  }
  try {
    return { calls, result: fn() }
  } finally {
    console.log = orig
  }
}

test('fix5 F-4：console.log 恒抛（EPIPE 语义）时 apply 不抛、缝照挂、resolve 照改写', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-seam-epipe-'))
  const logger = makeLogger()
  const shell = new FakeShell()
  const before = snapshotRewriteSeamState()
  // (a) 恒抛 sink 下装载链不炸（emitSeamLog 的 try/catch fail-open 必须成立——
  //     生产 EPIPE 若炸装载，插件直接 boot 失败，故这是 availability 级不变式）
  let loaded
  assert.doesNotThrow(
    () => {
      loaded = withThrowingConsole(() => load(root, { logger, shell }))
    },
    'F-4(a)：console.log 恒抛（EPIPE）不得炸 apply 装载链',
  )
  const { ctx } = loaded.result
  const loadCalls = loaded.calls
  assert.ok(
    loadCalls.length >= 2,
    '恒抛 sink 确被留痕路径真实触达（装载 + 挂载两锚；零触达=没走到出口，后续断言无意义）',
  )
  assert.ok(loadCalls.some((m) => /装载完成/.test(m)), '装载锚在恒抛前已触达出口')
  assert.ok(loadCalls.some((m) => /包壳已安装/.test(m)), '挂载锚（mount 内）同样触达恒抛 sink')
  // 同文双写的另一侧不受影响：console 死掉 ≠ logger.info 死
  assert.ok(logger.lines.info.some((m) => /装载完成/.test(m)), 'console 恒抛时 logger.info 侧仍留痕（双写非单点）')
  // (b) mount 成功：返回对象的 level 在场且类型正确 + 计数累计 + 包壳真在 resolve 上（三重可验）
  const after = snapshotRewriteSeamState()
  assert.equal(typeof after.mountLevel, 'string', 'F-4(b)：seam.level 在场且为字符串（返回对象契约面）')
  assert.equal(after.mountLevel, 'prototype', 'F-4(b)：seam.level 值正确（原型级包壳，抗宿主重载）')
  assert.equal(after.mountCount, before.mountCount + 1, 'F-4(b)：mountCount +1（本次装载真挂载成功）')
  assert.match(
    loadCalls.find((m) => /包壳已安装/.test(m)) ?? '',
    /level=prototype/,
    'F-4(b)：挂载锚回显返回对象 level（mount 成功的可读证据）',
  )
  assert.ok(
    shell.resolve[Symbol.for('rtk-kit:rewrite-seam.wrapper')] !== undefined,
    'F-4(b)：包壳标记真在 shell.resolve 上（挂载非仅计数）',
  )
  // (c) 恒抛 sink 下走真 ctx 一次 resolve：首命中锚**也**走恒抛 console（先于决策体），不得炸命中/改写链
  const hit = withThrowingConsole(() => ctx.shell.resolve(REQ))
  assert.equal(hit.result.command, 'rtk git status', 'F-4(c)：恒抛 console 下 resolve 仍返回改写后 spec')
  assert.equal(hit.result.resolved, true, 'F-4(c)：改写挂在宿主原始 spec 上（包壳透传其余字段不变）')
  assert.ok(hit.calls.some((m) => /首次命中/.test(m)), 'F-4(c)：首命中留痕触达恒抛 sink 仍未炸链')
})
