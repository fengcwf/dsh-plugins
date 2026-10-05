// test/resolve-bin.test.mjs —— rtk 二进制发现（2026-10-03-rtk-bin-discovery / A1-A8 验收面）
// TDD：本文件先于 lib/resolve-bin.js 落地（红→绿）。
// 测试红线（简报 §8）：绝不写真 home——一律 fs.mkdtemp 假 HOME / 假 bin 目录 + 注入 env
//（{path, homedir, isExecutable}）；系统兜底位（/usr/local/bin、/opt/homebrew/bin）用记录型
// isExecutable 判定桩模拟，绝不创建/写入真实系统路径。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fallbackCandidates, findRtkBin, resolveRtkBin } from '../lib/resolve-bin.js'
import { INSTALL_HINT, runDoctorTool } from '../lib/doctor.js'

// ───────────────────────── fixtures（mkdtemp 假 HOME / 假 bin） ─────────────────────────

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-resolve-'))
}

/** 在假目录里造一个可执行假 rtk（真文件 + chmod 0o755，供真 fs 判定）。 */
function makeExecutable(dir, name = 'rtk', mode = 0o755) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  fs.writeFileSync(file, '#!/bin/sh\necho "rtk 0.0.0"\n')
  fs.chmodSync(file, mode)
  return file
}

/** 造一个在场但不可执行的文件（X_OK 门槛用例）。 */
function makePlainFile(dir, name = 'rtk') {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  fs.writeFileSync(file, 'not executable\n')
  fs.chmodSync(file, 0o644)
  return file
}

/**
 * 全缺失沙箱 env：PATH 空、假 HOME、isExecutable 恒 false（绝不探真系统兜底位）。
 * 用于「全缺失 → 现行为降级」确定性用例（A6c / A4 真缺失态）。
 */
function emptyEnv(root) {
  return { path: '', homedir: path.join(root, 'home'), isExecutable: () => false }
}

/**
 * mkdtemp 沙箱 env：真 fs 判定（isFile + X_OK）但只认 root 之内（绝不 stat 真系统路径）。
 */
function sandboxEnv(root, { pathEnv = '' } = {}) {
  return {
    path: pathEnv,
    homedir: path.join(root, 'home'),
    isExecutable: (p) => {
      if (typeof p !== 'string' || !p.startsWith(root + path.sep)) return false
      try {
        return fs.statSync(p).isFile() && (fs.accessSync(p, fs.constants.X_OK), true)
      } catch {
        return false
      }
    },
  }
}

/** 记录探测顺序的判定桩（A2 顺序/命中即停用例）。 */
function recordingEnv(root, hitSet, { pathEnv = '' } = {}) {
  const probes = []
  return {
    probes,
    env: {
      path: pathEnv,
      homedir: path.join(root, 'home'),
      isExecutable: (p) => {
        probes.push(p)
        return hitSet.has(p)
      },
    },
  }
}

// ───────────────────────── A6(a)：PATH 命中不触发兜底 ─────────────────────────

test('A6a/A2：PATH 命中即用，不触发 ~/.local/bin → /usr/local/bin → /opt/homebrew/bin 兜底', () => {
  const root = makeRoot()
  const pathDir = path.join(root, 'pathbin')
  const pathHit = makeExecutable(pathDir)
  const homeHit = makeExecutable(path.join(root, 'home', '.local', 'bin'))
  const { probes, env } = recordingEnv(root, new Set([pathHit, homeHit]), { pathEnv: pathDir })

  const r = findRtkBin('rtk', env)
  assert.equal(r.bin, pathHit, '应取 PATH 目录命中')
  assert.equal(r.found, true)
  assert.equal(r.source, 'path')
  assert.deepEqual(probes, [pathHit], '顺序命中即停：PATH 命中后零兜底探测')
  assert.ok(!probes.includes(homeHit), '不得探到 ~/.local/bin 兜底位')
})

test('A6a：多 PATH 目录按序扫描，命中即停', () => {
  const root = makeRoot()
  const dir1 = path.join(root, 'p1')
  const dir2 = path.join(root, 'p2')
  const dir3 = path.join(root, 'p3')
  makePlainFile(dir1) // 在场但不可执行：跳过
  const hit2 = makeExecutable(dir2)
  const hit3 = makeExecutable(dir3)
  const { probes, env } = recordingEnv(root, new Set([hit2, hit3]), {
    pathEnv: [dir1, dir2, dir3].join(path.delimiter),
  })
  const r = findRtkBin('rtk', env)
  assert.equal(r.bin, hit2, '第二目录命中')
  assert.equal(r.source, 'path')
  assert.ok(!probes.includes(hit3), '命中即停：第三目录不再探测')
})

// ───────────────────────── A6(b)：PATH 未命中 → ~/.local/bin/rtk 兜底 ─────────────────────────

test('A6b/A2：PATH 未命中 → <homedir>/.local/bin/rtk 兜底命中（官方 install.sh 落点）', () => {
  const root = makeRoot()
  const homeHit = makeExecutable(path.join(root, 'home', '.local', 'bin'))
  const r = findRtkBin('rtk', sandboxEnv(root))
  assert.equal(r.bin, homeHit)
  assert.equal(r.found, true)
  assert.equal(r.source, 'fallback')
})

test('A2：兜底顺序 = ~/.local/bin/rtk → /usr/local/bin/rtk → /opt/homebrew/bin/rtk，命中即停', () => {
  const root = makeRoot()
  const homeCandidate = path.join(root, 'home', '.local', 'bin', 'rtk')

  // 全缺失：探测序恰为三兜底位（PATH 空不探）
  const allMiss = recordingEnv(root, new Set())
  const miss = findRtkBin('rtk', allMiss.env)
  assert.deepEqual(allMiss.probes, [homeCandidate, '/usr/local/bin/rtk', '/opt/homebrew/bin/rtk'])
  assert.deepEqual(miss, { bin: 'rtk', found: false, source: 'none' })

  // 第二兜底位命中：不越序探 /opt/homebrew/bin/rtk
  const mid = recordingEnv(root, new Set(['/usr/local/bin/rtk']))
  const hit2 = findRtkBin('rtk', mid.env)
  assert.deepEqual(mid.probes, [homeCandidate, '/usr/local/bin/rtk'], '顺序命中即停')
  assert.equal(hit2.bin, '/usr/local/bin/rtk')
  assert.equal(hit2.source, 'fallback')

  // 末位兜底命中：~/.local/bin 与 /usr/local/bin 都 miss 后才取 /opt/homebrew/bin/rtk
  const last = recordingEnv(root, new Set(['/opt/homebrew/bin/rtk']))
  const hit3 = findRtkBin('rtk', last.env)
  assert.deepEqual(last.probes, [homeCandidate, '/usr/local/bin/rtk', '/opt/homebrew/bin/rtk'])
  assert.equal(hit3.bin, '/opt/homebrew/bin/rtk')
})

test('A2/X_OK 门槛：存在但不可执行不命中（同名可执行才算），降级裸名', () => {
  const root = makeRoot()
  const homeDir = path.join(root, 'home', '.local', 'bin')
  const plain = makePlainFile(homeDir) // 在场不可执行
  makeExecutable(homeDir, 'rtk2') // 干扰项：同目录另一可执行文件，不算 rtk 命中
  const r = findRtkBin('rtk', sandboxEnv(root))
  assert.notEqual(r.bin, plain, '不可执行的 ~/.local/bin/rtk 不得命中')
  assert.deepEqual(r, { bin: 'rtk', found: false, source: 'none' }, '不可执行≠命中 → 现行为降级')
})

// ───────────────────────── A6(c)：全缺失 → 降级 + 安装提示 ─────────────────────────

test('A6c：全缺失 → 解析器回裸名 rtk（现行为降级），found=false', () => {
  const root = makeRoot()
  const r = findRtkBin('rtk', emptyEnv(root))
  assert.deepEqual(r, { bin: 'rtk', found: false, source: 'none' })
  assert.equal(resolveRtkBin('rtk', emptyEnv(root)), 'rtk')
})

test('A6c/A4：doctor 真缺失两态之缺失 → available:no (bin: rtk) + 安装提示文案保留', async () => {
  const root = makeRoot()
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = await runDoctorTool({}, { rtkBin: 'rtk', exec, resolveEnv: emptyEnv(root) })
  assert.deepEqual(r.text.split('\n'), ['rtk available: no (bin: rtk)', INSTALL_HINT])
  assert.ok(r.text.includes('安装：'), '真缺失保留安装提示')
})

// ───────────────────────── A6(d)：显式配置不被兜底覆盖 ─────────────────────────

test('A6d/A3：显式配置（myrtk / 绝对路径）绝不被兜底覆盖，原样返回', () => {
  const root = makeRoot()
  const homeHit = makeExecutable(path.join(root, 'home', '.local', 'bin'))
  const { probes, env } = recordingEnv(root, new Set([homeHit, '/usr/local/bin/rtk', '/opt/homebrew/bin/rtk']))

  assert.equal(resolveRtkBin('myrtk', env), 'myrtk')
  assert.equal(resolveRtkBin('/opt/custom/rtk', env), '/opt/custom/rtk')
  assert.deepEqual(probes, ['/opt/custom/rtk'], '显式值零 PATH/兜底扫描（仅对路径形做在场判定），绝不改写')
})

test('A3：显式配置解析失败按现行为降级——doctor 保留 available:false + 安装提示', async () => {
  const root = makeRoot()
  makeExecutable(path.join(root, 'home', '.local', 'bin')) // 兜底位有货也不覆盖
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = await runDoctorTool({}, { rtkBin: 'myrtk', exec, resolveEnv: sandboxEnv(root) })
  assert.deepEqual(r.text.split('\n'), ['rtk available: no (bin: myrtk)', INSTALL_HINT])
})

// ───────────────────────── A6(e)：doctor 输出两态（找到≠出现「安装：」） ─────────────────────────

test('A6e/A4：doctor 找到即用 → 输出解析到的绝对路径、零「安装：」', async () => {
  const root = makeRoot()
  const homeHit = makeExecutable(path.join(root, 'home', '.local', 'bin'))
  const { exec, calls } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const r = await runDoctorTool({}, { rtkBin: 'rtk', exec, resolveEnv: sandboxEnv(root) })
  const lines = r.text.split('\n')
  assert.deepEqual(lines, [
    `rtk available: yes (bin: ${homeHit})`,
    'version: 0.49.0',
    'auto-rewrite: off | conservative: true | awareness: default',
  ])
  assert.ok(r.text.includes(homeHit), '输出解析到的绝对路径')
  assert.ok(!r.text.includes('安装：'), '找到即用：输出禁止出现「安装：」')
  assert.equal(calls[0].file, homeHit, '执行面走解析结果（同一解析单源）')
})

test('A6e/A4：doctor PATH 命中 → (bin: PATH 命中绝对路径)、零「安装：」', async () => {
  const root = makeRoot()
  const pathHit = makeExecutable(path.join(root, 'pathbin'))
  const { exec } = fakeExec(async () => ({ code: 0, stdout: 'rtk 0.49.0\n', stderr: '' }))
  const r = await runDoctorTool({}, { rtkBin: 'rtk', exec, resolveEnv: sandboxEnv(root, { pathEnv: path.dirname(pathHit) }) })
  assert.equal(r.text.split('\n')[0], `rtk available: yes (bin: ${pathHit})`)
  assert.ok(!r.text.includes('安装：'))
})

test('A4 边界裁决：找到但执行失败 → 输出解析路径且零「安装：」（找到≠真缺失）', async () => {
  const root = makeRoot()
  const homeHit = makeExecutable(path.join(root, 'home', '.local', 'bin'))
  const { exec } = fakeExec(async () => {
    throw enoentError()
  })
  const r = await runDoctorTool({}, { rtkBin: 'rtk', exec, resolveEnv: sandboxEnv(root) })
  assert.deepEqual(r.text.split('\n'), [`rtk available: no (bin: ${homeHit})`])
  assert.ok(!r.text.includes('安装：'), '只要找到，输出禁止出现「安装：」（A4 原文）')
})

// ───────────────────────── A1 单源 / A8 约束（源面机械断言） ─────────────────────────

const INDEX_SRC = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const DOCTOR_SRC = fs.readFileSync(new URL('../lib/doctor.js', import.meta.url), 'utf8')
const RESOLVE_SRC = fs.readFileSync(new URL('../lib/resolve-bin.js', import.meta.url), 'utf8')

/** 剥离块注释/行注释后的代码面（源面断言只看可执行代码，注释提及不算违规/不算字面）。
 *  字符串/模板字面感知（Task 5 NEEDS_CONTEXT ① 裁决）：引号内 `/*`、`//` 不触发注释开合——
 *  旧正则会被 `'/api/rtk-kit/*'` 类字面假开合吞掉后续代码（约 50 行扫描盲区），已修。 */
function stripComments(src) {
  let out = ''
  let state = 'code' // code | line | block | single | double | template
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]
    const n = src[i + 1]
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i += 1; continue }
      if (c === '/' && n === '*') { state = 'block'; i += 1; continue }
      if (c === "'" || c === '"' || c === '`') state = c === "'" ? 'single' : c === '"' ? 'double' : 'template'
      out += c
      continue
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c }
      continue
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; i += 1 } else if (c === '\n') out += c // 块注释内保留换行（行号稳定）
      continue
    }
    // 字符串/模板态：转义成对跳过、同引号收口
    out += c
    if (c === '\\') { out += n ?? ''; i += 1; continue }
    if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) state = 'code'
  }
  return out
}

test('A1 剥注释器自检（Task 5 NEEDS_CONTEXT ①）：字符串/模板字面感知——假 `/*` 不开注释、真注释剥净、后续代码零盲区', () => {
  const sample = [
    "const url = '/api/rtk-kit/*'",
    'const after = 1 // 真行注释（含 /* 假开合也不开）',
    'const sum = 2 /* 真块注释 */ + 3',
    'const tpl = `tpl /* 不开 */`',
  ].join('\n')
  const out = stripComments(sample)
  assert.ok(out.includes("const url = '/api/rtk-kit/*'"), '字符串字面原样保留（假 /* 不开注释）')
  assert.ok(out.includes('const after = 1'), '假开合不吞后续代码（旧正则吞到下一 */ = 扫描盲区根因）')
  assert.ok(!out.includes('真行注释'), '真行注释剥净')
  assert.ok(out.includes('const sum = 2  + 3'), '真块注释剥净、两侧代码保留')
  assert.ok(out.includes('const tpl = `tpl /* 不开 */`'), '模板字面原样保留')
})

test('A1：解析器恰一处实现（lib/resolve-bin.js），index.js 与 doctor.js 共用、零本地兜底字面', () => {
  assert.match(INDEX_SRC, /from '\.\/resolve-bin\.js'/, 'index.js 必须共用解析单源')
  assert.match(DOCTOR_SRC, /from '\.\/resolve-bin\.js'/, 'doctor.js 必须共用解析单源')
  for (const [name, raw] of [['index.js', INDEX_SRC], ['doctor.js', DOCTOR_SRC]]) {
    const src = stripComments(raw)
    assert.doesNotMatch(src, /\/usr\/local\/bin/, `${name} 不得自带兜底路径字面`)
    assert.doesNotMatch(src, /\/opt\/homebrew\/bin/, `${name} 不得自带兜底路径字面`)
    assert.doesNotMatch(src, /\.local.{0,4}bin/, `${name} 不得自带兜底路径字面`)
  }
  // 兜底顺序字面恰一处（resolve-bin.js 代码面）
  const code = stripComments(RESOLVE_SRC)
  for (const lit of ['/usr/local/bin', '/opt/homebrew/bin']) {
    assert.equal(code.split(lit).length - 1, 1, `${lit} 字面在代码面恰一处`)
  }
})

test('A8：resolve-bin.js 零 spawnSync/child_process；index.js spawnSync 调用点不扩大（恰 2）', () => {
  const code = stripComments(RESOLVE_SRC)
  assert.doesNotMatch(code, /spawnSync/, '解析器是纯发现逻辑，不引入 spawnSync')
  assert.doesNotMatch(code, /child_process/, '解析器零进程执行依赖')
  assert.equal(stripComments(INDEX_SRC).match(/spawnSync\s*\(/g)?.length ?? 0, 2, '既有 apply 期 spawnSync 调用面不扩大')
})

// ───────────────────────── A5：probeRtk 直调也走同一解析结果 ─────────────────────────

test('A5：probeRtk 直调裸名经同一解析器发现兜底假 rtk（自伤面修复），显式缺失名不兜底', async () => {
  const { probeRtk } = await import('../lib/index.js')
  const root = makeRoot()
  const homeHit = makeExecutable(path.join(root, 'home', '.local', 'bin'))
  const env = sandboxEnv(root)
  assert.equal(probeRtk('rtk', env), true, '默认名兜底命中 → 可用')
  assert.equal(probeRtk('definitely-missing-rtk-xyz', env), false, '显式配置不兜底 → 现行为不可用')
})

// ───────────────────────── T1.1 修复卡：R-01 / R-04 裁决锁死 ─────────────────────────

test('R-01 裁决：空 PATH 项不探 cwd（防 CWD 劫持，故意偏离 execvp）', () => {
  const root = makeRoot()
  // 判定桩模拟「cwd 里有 rtk」：若实现把空 PATH 项当 cwd 探测，isExecutable('rtk') 会被调用并命中
  const probes = []
  const env = {
    path: `${path.delimiter}${path.delimiter}`, // 首/尾皆空项（POSIX 语义 = cwd）
    homedir: path.join(root, 'home'),
    isExecutable: (p) => {
      probes.push(p)
      return p === 'rtk'
    },
  }
  const r = findRtkBin('rtk', env)
  assert.ok(!probes.includes('rtk'), '空 PATH 项绝不产生 cwd 相对探测')
  assert.deepEqual(r, { bin: 'rtk', found: false, source: 'none' }, 'cwd 假 rtk 不得命中')
  assert.deepEqual(
    probes,
    [path.join(root, 'home', '.local', 'bin', 'rtk'), '/usr/local/bin/rtk', '/opt/homebrew/bin/rtk'],
    '只探兜底位（绝对路径形）',
  )
})

test('R-01 裁决：相对 PATH 项照探（解析期 cwd 判定，execvp 相对项语义对齐）', () => {
  const root = makeRoot()
  const candidate = path.join('reldir', 'rtk')
  const { probes, env } = recordingEnv(root, new Set([candidate]), { pathEnv: 'reldir' })
  const r = findRtkBin('rtk', env)
  assert.equal(r.bin, candidate, '相对 PATH 项命中即用（PATH 优先于兜底）')
  assert.equal(r.source, 'path')
  assert.deepEqual(probes, [candidate], '命中即停')
})

test('R-04 裁决：注入空串=显式空（path:""=零 PATH 探测、homedir:""=无 home 兜底位），绝不回落真机', () => {
  const probes = []
  const env = {
    path: '',
    homedir: '',
    isExecutable: (p) => {
      probes.push(p)
      return false
    },
  }
  const r = findRtkBin('rtk', env)
  assert.deepEqual(
    probes,
    ['/usr/local/bin/rtk', '/opt/homebrew/bin/rtk'],
    'homedir 空串不得回落 os.homedir()（否则静默探真机 ~/.local/bin/rtk）',
  )
  assert.deepEqual(r, { bin: 'rtk', found: false, source: 'none' })
  assert.deepEqual(fallbackCandidates(''), ['/usr/local/bin/rtk', '/opt/homebrew/bin/rtk'])
  // 相对 home 同样不产相对候选（防 CWD 劫持，与 R-01 同口径）
  assert.deepEqual(fallbackCandidates('relative/home'), ['/usr/local/bin/rtk', '/opt/homebrew/bin/rtk'])
})

// ───────────────────────── 假执行器（与 doctor.test.mjs 同形） ─────────────────────────

function fakeExec(impl) {
  const calls = []
  const exec = async (file, args, opts) => {
    calls.push({ file, args, opts })
    return impl(file, args, opts)
  }
  return { exec, calls }
}

function enoentError() {
  const e = new Error('spawn rtk ENOENT')
  e.code = 'ENOENT'
  return e
}
