// test/install.test.mjs —— lib/install.js 重装引擎（2026-10-03-rtk-reinstall Task 1）
// TDD：本文件先于 lib/install.js 落地（红→绿）。
// 测试红线（INV-8）：一切 IO 走 mkdtemp 注入（installDir/tmpdir/logPath/resolveEnv 全假注入），零真 home 写入。
// 白名单取件断言依赖真实 tar 语义（GNU tar 跳过 .. 形成员并以非零码退出，实测 2026-10-04）——解包走真实系统 tar。
// 复检断言走 lib/doctor.js getVersion 同源口径（INV-9），测试不另造版本解析。
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  CHECKSUMS_ASSET,
  CHECKSUM_MISMATCH,
  DOWNLOAD_FAILED,
  EXTRACT_FAILED,
  INSTALL_ERROR_CODES,
  INSTALL_RECORD_FIELDS,
  InstallError,
  PLATFORM_UNSUPPORTED,
  REINSTALL_IN_PROGRESS,
  RELEASE_DOWNLOAD_BASE,
  RTK_ASSET,
  VERIFY_FAILED,
  WRITE_FAILED,
  buildInstallRecord,
  defaultFs,
  defaultLogPath,
  isReinstallInFlight,
  isSupportedPlatform,
  parseChecksums,
  reinstallRtk,
  releaseAssetUrl,
} from '../lib/install.js'
import { getVersion } from '../lib/doctor.js'

const FIXED_MS = 1770000000000
const FIXED_ISO = new Date(FIXED_MS).toISOString()
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex')

// ───────────────────────── fixtures（mkdtemp 沙箱 + 手写 tar 归档） ─────────────────────────

function setupEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-install-test-'))
  const installDir = path.join(root, 'bin')
  const tmpdir = path.join(root, 'staging')
  fs.mkdirSync(tmpdir, { recursive: true })
  return { root, installDir, tmpdir }
}

function scriptBin(version) {
  return `#!/bin/sh\necho "rtk ${version}"\n`
}

function seedOld(env, bytes = Buffer.from(scriptBin('1.0.0'))) {
  fs.mkdirSync(env.installDir, { recursive: true })
  fs.writeFileSync(path.join(env.installDir, 'rtk'), bytes)
  fs.chmodSync(path.join(env.installDir, 'rtk'), 0o755)
  return bytes
}

/** 手写 ustar 头（完全控制成员名，含 ../ 穿越形条目）。 */
function tarHeader(name, size, mode = 0o644) {
  const b = Buffer.alloc(512)
  b.write(name, 0, 100, 'utf8')
  b.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8)
  b.write('0000000\0', 108, 8)
  b.write('0000000\0', 116, 8)
  b.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12)
  b.write(`${(0).toString(8).padStart(11, '0')}\0`, 136, 12)
  b.write('        ', 148, 8)
  b.write('0', 156, 1)
  b.write('ustar\0', 257, 6)
  b.write('00', 263, 2)
  let sum = 0
  for (const x of b) sum += x
  b.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return b
}

function tarGz(entries) {
  const parts = []
  for (const { name, data, mode = 0o644 } of entries) {
    const buf = Buffer.from(data)
    parts.push(tarHeader(name, buf.length, mode), buf, Buffer.alloc((512 - (buf.length % 512)) % 512))
  }
  parts.push(Buffer.alloc(1024))
  return zlib.gzipSync(Buffer.concat(parts))
}

function checksumsText(pairs) {
  return `${pairs.map(([name, buf]) => `${sha256(buf)}  ${name}`).join('\n')}\n`
}

function optsFor(env, over = {}) {
  return {
    installDir: env.installDir,
    tmpdir: env.tmpdir,
    logPath: path.join(env.root, 'logs', 'install-log.json'),
    resolveEnv: { path: env.installDir, homedir: '' },
    platform: 'linux',
    arch: 'x64',
    now: () => FIXED_MS,
    timeoutMs: 5000,
    verifyTimeoutMs: 5000,
    ...over,
  }
}

function fakeFetch(sums, tgz, calls = []) {
  return async (url) => {
    calls.push(String(url))
    return new Response(String(url) === releaseAssetUrl(CHECKSUMS_ASSET) ? sums : tgz)
  }
}

/** 成功链路标准 fixture：旧二进制在位 + 新 rtk 归档 + 匹配 checksums.txt。 */
function successFixture(env, { extraEntries = [] } = {}) {
  const oldBytes = seedOld(env)
  const newBytes = Buffer.from(scriptBin('9.9.9'))
  const tgz = tarGz([{ name: 'rtk', data: newBytes, mode: 0o755 }, ...extraEntries])
  const sums = checksumsText([[RTK_ASSET, tgz]])
  return { oldBytes, newBytes, tgz, sums }
}

/** 记录型 fs 缝：把写面（含 rename 双向路径）全部录下来供断言。 */
function recordingFs(record) {
  const wrapped = {}
  for (const key of Object.keys(defaultFs)) {
    wrapped[key] = (...args) => {
      record.push({ method: key, paths: args.filter((a) => typeof a === 'string') })
      return defaultFs[key](...args)
    }
  }
  return wrapped
}

const WRITE_METHODS = ['mkdtemp', 'mkdir', 'writeFile', 'rename', 'chmod', 'copyFile', 'createWriteStream', 'rm']

// ───────────────────────── 常量与纯函数面 ─────────────────────────

test('URL 常量：固定资产名白名单，其余拒绝（零用户输入拼接）', () => {
  assert.equal(RELEASE_DOWNLOAD_BASE, 'https://github.com/rtk-ai/rtk/releases/latest/download/')
  assert.equal(RTK_ASSET, 'rtk-x86_64-unknown-linux-musl.tar.gz')
  assert.equal(CHECKSUMS_ASSET, 'checksums.txt')
  assert.equal(releaseAssetUrl(RTK_ASSET), `${RELEASE_DOWNLOAD_BASE}rtk-x86_64-unknown-linux-musl.tar.gz`)
  assert.equal(releaseAssetUrl(CHECKSUMS_ASSET), `${RELEASE_DOWNLOAD_BASE}checksums.txt`)
  for (const bad of ['rtk-x86_64-unknown-linux-musl.tar.gz;rm -rf /', '../../evil', 'install.sh', '', null, undefined]) {
    assert.throws(() => releaseAssetUrl(bad), TypeError, `应拒绝 ${JSON.stringify(bad)}`)
  }
})

test('parseChecksums：<hash>  <name> 形解析 + 文件名精确匹配（前后缀变体不冒名）', () => {
  const text = [
    `${'a'.repeat(64)}  ${RTK_ASSET}`,
    `${'b'.repeat(64)} *other.bin`,
    'junk line',
    `${'c'.repeat(64)}  ${RTK_ASSET}.bak`,
    `${'D'.repeat(64)}  spaced name.bin`,
  ].join('\n')
  const m = parseChecksums(text)
  assert.equal(m.get(RTK_ASSET), 'a'.repeat(64))
  assert.equal(m.get('other.bin'), 'b'.repeat(64))
  assert.equal(m.get(`${RTK_ASSET}.bak`), 'c'.repeat(64))
  assert.equal(m.get('spaced name.bin'), 'd'.repeat(64))
  assert.equal(m.has('junk line'), false)
  assert.equal(parseChecksums(`${'e'.repeat(64)}  ${RTK_ASSET}extra`).get(RTK_ASSET), undefined)
})

test('isSupportedPlatform：只认 linux + x64', () => {
  assert.equal(isSupportedPlatform('linux', 'x64'), true)
  assert.equal(isSupportedPlatform('darwin', 'x64'), false)
  assert.equal(isSupportedPlatform('linux', 'arm64'), false)
  assert.equal(isSupportedPlatform('win32', 'x64'), false)
})

test('错误分类常量：六类 + 互斥语义值收口（信封形状 code/message[,hint]）', () => {
  assert.deepEqual([...INSTALL_ERROR_CODES].sort(), [
    'CHECKSUM_MISMATCH', 'DOWNLOAD_FAILED', 'EXTRACT_FAILED',
    'PLATFORM_UNSUPPORTED', 'VERIFY_FAILED', 'WRITE_FAILED',
  ])
  assert.equal(REINSTALL_IN_PROGRESS, 'reinstall-in-progress')
  const err = new InstallError(DOWNLOAD_FAILED, 'x', { hint: 'h' })
  assert.deepEqual(Object.keys(err.toEnvelope()).sort(), ['code', 'hint', 'message'])
  assert.deepEqual(Object.keys(new InstallError(DOWNLOAD_FAILED, 'y').toEnvelope()).sort(), ['code', 'message'])
})

test('buildInstallRecord：INV-10 字段白名单（多余键被丢弃，零凭据）', () => {
  const rec = buildInstallRecord({
    time: FIXED_ISO, version: '9.9.9', source: releaseAssetUrl(RTK_ASSET), ok: true, error: null,
    token: 'secret', env: 'SECRET=1',
  })
  assert.deepEqual(Object.keys(rec).sort(), [...INSTALL_RECORD_FIELDS].sort())
  assert.equal(rec.ok, true)
  assert.equal(rec.version, '9.9.9')
  assert.equal(rec.time, FIXED_ISO)
  assert.equal('token' in rec, false)
  assert.equal(defaultLogPath('/home/u'), path.join('/home/u', '.dsh', 'dsh-rtk-kit', 'install-log.json'))
})

// ───────────────────────── 成功链路 ─────────────────────────

test('成功链路：下载→SHA256 校验→tar 解包→备份→原子落盘→复检（备份在场 + 新文件可执行）', async () => {
  const env = setupEnv()
  const { oldBytes, newBytes, sums, tgz } = successFixture(env, {
    extraEntries: [{ name: 'extra.txt', data: 'not installed\n' }],
  })
  const calls = []
  const r = await reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz, calls) }))

  assert.deepEqual(calls, [releaseAssetUrl(CHECKSUMS_ASSET), releaseAssetUrl(RTK_ASSET)])
  assert.equal(r.ok, true)
  assert.equal(r.targetPath, path.join(env.installDir, 'rtk'))
  assert.deepEqual(fs.readFileSync(r.targetPath), newBytes)
  fs.accessSync(r.targetPath, fs.constants.X_OK) // 新文件可执行
  const backupPath = path.join(env.installDir, `rtk.bak.${FIXED_MS}`)
  assert.equal(r.backupPath, backupPath)
  assert.deepEqual(fs.readFileSync(backupPath), oldBytes) // 旧版字节完整保留
  assert.deepEqual(fs.readdirSync(env.installDir).sort(), ['rtk', `rtk.bak.${FIXED_MS}`])
  assert.equal(r.verify.available, true)
  assert.equal(r.verify.version, '9.9.9')
  assert.equal(r.verify.path, path.join(env.installDir, 'rtk'))
  assert.equal(r.logPath, path.join(env.root, 'logs', 'install-log.json'))
  assert.deepEqual(fs.readdirSync(env.tmpdir), []) // mkdtemp 中转已清理
})

test('复检断言：available:true 且版本号/路径与 getVersion 同源口径完全一致', async () => {
  const env = setupEnv()
  const { sums, tgz } = successFixture(env)
  const r = await reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) }))
  const direct = await getVersion({ rtkBin: r.verify.path })
  assert.equal(r.verify.available, true)
  assert.deepEqual(r.verify, direct) // 同源：不另造版本解析（INV-9）
})

test('记录面：成功记录只含 INV-10 白名单字段（时间/版本/URL/成败/错误分类）', async () => {
  const env = setupEnv()
  const { sums, tgz } = successFixture(env)
  const r = await reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) }))
  assert.deepEqual(Object.keys(r.record).sort(), [...INSTALL_RECORD_FIELDS].sort())
  assert.deepEqual(r.record, {
    time: FIXED_ISO,
    version: '9.9.9',
    source: releaseAssetUrl(RTK_ASSET),
    ok: true,
    error: null,
  })
})

test('installDir 缺失自动创建后照常落盘', async () => {
  const env = setupEnv()
  fs.rmSync(env.installDir, { recursive: true, force: true })
  const newBytes = Buffer.from(scriptBin('9.9.9'))
  const tgz = tarGz([{ name: 'rtk', data: newBytes, mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, tgz]])
  const r = await reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) }))
  assert.equal(r.backupPath, null) // 无旧版 → 无备份
  assert.deepEqual(fs.readFileSync(r.targetPath), newBytes)
})

// ───────────────────────── 失败路径（旧二进制一切失败路径不被破坏，INV-3） ─────────────────────────

test('CHECKSUM_MISMATCH：目标路径零写入、旧二进制字节不变、无 .rtk.tmp 残留', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const newBytes = Buffer.from(scriptBin('9.9.9'))
  const tgz = tarGz([{ name: 'rtk', data: newBytes, mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, Buffer.from('tampered payload')]]) // 哈希对不上归档
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) })),
    (e) => e instanceof InstallError && e.code === CHECKSUM_MISMATCH,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk']) // 零写入：无 tmp / 无 bak / 无新 rtk
  assert.deepEqual(fs.readdirSync(env.tmpdir), [])
})

test('CHECKSUM_MISMATCH：checksums.txt 缺目标条目 = 无法校验，同样中止不落盘', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const tgz = tarGz([{ name: 'rtk', data: Buffer.from(scriptBin('9.9.9')), mode: 0o755 }])
  const sums = checksumsText([['rtk-x86_64-unknown-linux-musl.tar.gz.asc', tgz]])
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) })),
    (e) => e.code === CHECKSUM_MISMATCH,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
})

test('下载中断（响应流中途出错）→ DOWNLOAD_FAILED，旧二进制不被破坏', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const tgz = tarGz([{ name: 'rtk', data: Buffer.from(scriptBin('9.9.9')), mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, tgz]])
  const fetchStub = async (url) => {
    if (String(url) === releaseAssetUrl(CHECKSUMS_ASSET)) return new Response(sums)
    return new Response(new ReadableStream({
      start(c) {
        c.enqueue(tgz.subarray(0, 16))
        c.error(new Error('connection reset'))
      },
    }))
  }
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fetchStub })),
    (e) => e instanceof InstallError && e.code === DOWNLOAD_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('HTTP 非 2xx → DOWNLOAD_FAILED（release 资产消失/改名口径）', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  await assert.rejects(
    reinstallRtk(optsFor(env, {
      fetch: async () => new Response('Not Found', { status: 404 }),
    })),
    (e) => e.code === DOWNLOAD_FAILED && /404/.test(e.message),
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
})

test('下载超时（AbortController 默认超时面）→ DOWNLOAD_FAILED（超时口径）', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const sums = checksumsText([[RTK_ASSET, Buffer.from('x')]])
  const fetchStub = async (url, init) => {
    if (String(url) === releaseAssetUrl(CHECKSUMS_ASSET)) return new Response(sums)
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
  }
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fetchStub, timeoutMs: 30 })),
    (e) => e.code === DOWNLOAD_FAILED && e.message.includes('超时'),
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
})

test('解包失败（损坏归档，校验可通过）→ EXTRACT_FAILED，旧二进制不被破坏', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const garbage = Buffer.from('this is definitely not a gzip tar archive\n'.repeat(8))
  const sums = checksumsText([[RTK_ASSET, garbage]])
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, garbage) })),
    (e) => e instanceof InstallError && e.code === EXTRACT_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('落盘失败（备份 rename 失败）→ WRITE_FAILED，旧二进制原位不动、无 .rtk.tmp 残留', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  const flakyFs = {
    rename: async () => { throw new Error('EROFS: read-only') },
  }
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz), fs: flakyFs })),
    (e) => e instanceof InstallError && e.code === WRITE_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('落盘失败（原子 rename 失败）→ WRITE_FAILED，备份回滚恢复旧二进制、无 .rtk.tmp 残留', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  let renameCalls = 0
  const flakyFs = {
    rename: async (a, b) => {
      renameCalls += 1
      if (renameCalls === 2) throw new Error('ENOSPC: no space') // 目标落盘这步失败
      return defaultFs.rename(a, b)
    },
  }
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz), fs: flakyFs })),
    (e) => e.code === WRITE_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes) // 回滚后旧二进制原位
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk']) // 无 .rtk.tmp 残留、备份已回滚
})

test('F-FINAL-2 态1：原子落盘失败+回滚成功 → 报文称「旧二进制已回滚」（回滚成功才称已回滚）、旧字节回原位、cause=原始 rename 错', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  let renameCalls = 0
  const flakyFs = {
    rename: async (a, b) => {
      renameCalls += 1
      if (renameCalls === 2) throw new Error('ENOSPC: no space') // 目标落盘失败；回滚（第 3 次）成功
      return defaultFs.rename(a, b)
    },
  }
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz), fs: flakyFs })),
    (e) => e instanceof InstallError
      && e.code === WRITE_FAILED
      && e.message.includes('原子落盘失败（旧二进制已回滚）')
      && !e.message.includes('回滚失败')
      && e.cause instanceof Error && e.cause.message.includes('ENOSPC'), // cause=原始 rename 错（非回滚错）
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes, '回滚成功=旧字节回原位')
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'], '无 .rtk.tmp 残留、备份已回滚')
})

test('F-FINAL-2 态2：原子落盘失败+回滚失败 → 报文如实「旧版保留于 <.bak>，回滚失败：<原因>」（不再谎称已回滚）、回滚错进 cause、INV-3 旧字节仍保全', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  const backupPath = path.join(env.installDir, `rtk.bak.${FIXED_MS}`)
  let renameCalls = 0
  const flakyFs = {
    rename: async (a, b) => {
      renameCalls += 1
      if (renameCalls >= 2) throw new Error(renameCalls === 2 ? 'ENOSPC: no space' : 'EROFS: read-only') // 落盘失败 + 回滚再失败
      return defaultFs.rename(a, b)
    },
  }
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz), fs: flakyFs })),
    (e) => e instanceof InstallError
      && e.code === WRITE_FAILED
      && e.message.includes(`旧版保留于 ${backupPath}`)
      && e.message.includes('回滚失败')
      && e.message.includes('EROFS') // 回滚失败原因如实进报文
      && !e.message.includes('已回滚') // 二值化：回滚未成功绝不称已回滚
      && e.cause instanceof Error && e.cause.message.includes('EROFS'), // 回滚错进 cause（不静默吞）
  )
  assert.deepEqual(fs.readFileSync(backupPath), oldBytes, 'INV-3 不破：旧字节保全于 .bak')
  assert.deepEqual(fs.readdirSync(env.installDir), [`rtk.bak.${FIXED_MS}`], '旧版留 .bak、无 .rtk.tmp 残留、目标位无新旧文件')
})

test('staging 失败归类：中转归档 readFile 失败 → EXTRACT_FAILED（cause 保留 + 信封带 code）', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  const boom = Object.assign(new Error('EIO: staging read'), { code: 'EIO' })
  await assert.rejects(
    reinstallRtk(optsFor(env, {
      fetch: fakeFetch(sums, tgz),
      fs: { readFile: async () => { throw boom } },
    })),
    (e) => e instanceof InstallError
      && e.code === EXTRACT_FAILED
      && e.cause === boom
      && e.toEnvelope().code === EXTRACT_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('staging 失败归类：解包目录 mkdir 失败 → EXTRACT_FAILED（cause 保留 + 信封带 code）', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  const boom = Object.assign(new Error('EACCES: mkdir extract'), { code: 'EACCES' })
  await assert.rejects(
    reinstallRtk(optsFor(env, {
      fetch: fakeFetch(sums, tgz),
      fs: {
        mkdir: async (d, o) => {
          if (String(d).endsWith(`${path.sep}extract`)) throw boom
          return defaultFs.mkdir(d, o)
        },
      },
    })),
    (e) => e instanceof InstallError
      && e.code === EXTRACT_FAILED
      && e.cause === boom
      && e.toEnvelope().code === EXTRACT_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('staging 失败归类：白名单条目 chmod 失败 → EXTRACT_FAILED（cause 保留 + 信封带 code）', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  const boom = Object.assign(new Error('EPERM: chmod picked'), { code: 'EPERM' })
  await assert.rejects(
    reinstallRtk(optsFor(env, {
      fetch: fakeFetch(sums, tgz),
      fs: {
        chmod: async (p, m) => {
          if (String(p).includes(`${path.sep}extract${path.sep}`)) throw boom
          return defaultFs.chmod(p, m)
        },
      },
    })),
    (e) => e instanceof InstallError
      && e.code === EXTRACT_FAILED
      && e.cause === boom
      && e.toEnvelope().code === EXTRACT_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('staging 失败归类：installDir mkdir 失败 → WRITE_FAILED（cause 保留 + 信封带 code）', async () => {
  const env = setupEnv()
  const { oldBytes, sums, tgz } = successFixture(env)
  const boom = Object.assign(new Error('EROFS: mkdir installDir'), { code: 'EROFS' })
  await assert.rejects(
    reinstallRtk(optsFor(env, {
      fetch: fakeFetch(sums, tgz),
      fs: {
        mkdir: async (d, o) => {
          if (String(d) === env.installDir) throw boom
          return defaultFs.mkdir(d, o)
        },
      },
    })),
    (e) => e instanceof InstallError
      && e.code === WRITE_FAILED
      && e.cause === boom
      && e.toEnvelope().code === WRITE_FAILED,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'])
})

test('VERIFY_FAILED：落盘成功但复检不可用 → 分类 VERIFY_FAILED（旧版留 .bak 可追）', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  // 复检失败要 spawn 级不可执行：shebang 指向不存在的解释器（execve ENOENT）。
  // 注意不能用「纯文本垃圾文件」——execvp 对 ENOEXEC 会回退 /bin/sh 执行，doctor 口径反而 available:true。
  const broken = Buffer.from('#!/nonexistent/rtk-test-interp\necho "rtk 1.2.3"\n')
  const tgz = tarGz([{ name: 'rtk', data: broken, mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, tgz]])
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) })),
    (e) => e instanceof InstallError && e.code === VERIFY_FAILED && e.verify?.available === false,
  )
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), broken) // 落盘已发生
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, `rtk.bak.${FIXED_MS}`)), oldBytes) // 旧版可追
})

test('R-3：VERIFY_FAILED 错误对象带 .backupPath（旧版 .bak 位置）与 .verify/.record 供红条详情映射', async () => {
  const env = setupEnv()
  seedOld(env)
  const broken = Buffer.from('#!/nonexistent/rtk-test-interp\necho "rtk 1.2.3"\n')
  const tgz = tarGz([{ name: 'rtk', data: broken, mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, tgz]])
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) })),
    (e) => {
      assert.equal(e.backupPath, path.join(env.installDir, `rtk.bak.${FIXED_MS}`), 'R-3：旧版 .bak 位置在错误对象上')
      assert.equal(e.verify?.available, false, 'R-3：.verify 在场')
      assert.equal(e.record?.error, VERIFY_FAILED, 'R-3：.record 在场（INV-10 白名单）')
      return e instanceof InstallError && e.code === VERIFY_FAILED
    },
  )
})

test('R-3：VERIFY_FAILED 无旧版场景 .backupPath=null（此前缺失，红条如实注明无备份）', async () => {
  const env = setupEnv()
  const broken = Buffer.from('#!/nonexistent/rtk-test-interp\necho "rtk 1.2.3"\n')
  const tgz = tarGz([{ name: 'rtk', data: broken, mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, tgz]])
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) })),
    (e) => e instanceof InstallError && e.code === VERIFY_FAILED && e.backupPath === null,
  )
})

// ───────────────────────── 白名单取件（防 tar 路径穿越） ─────────────────────────

test('白名单取件：rtk 之外条目（含 ../ 路径穿越形）被忽略，只落 rtk', async () => {
  const env = setupEnv()
  const { newBytes, sums, tgz } = successFixture(env, {
    extraEntries: [
      { name: 'extra.txt', data: 'extra\n' },
      { name: 'dir/evil.txt', data: 'evil\n' },
      { name: '../escape.txt', data: 'escaped\n' },
    ],
  })
  const r = await reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) }))
  assert.deepEqual(fs.readFileSync(r.targetPath), newBytes)
  assert.deepEqual(fs.readdirSync(env.installDir).sort(), ['rtk', `rtk.bak.${FIXED_MS}`]) // 只落 rtk（+旧版备份）
  assert.equal(fs.existsSync(path.join(env.root, 'escape.txt')), false) // 穿越条目未逃出中转
  assert.equal(fs.existsSync(path.join(env.tmpdir, 'escape.txt')), false)
  assert.equal(fs.existsSync(path.join(env.installDir, 'extra.txt')), false)
  assert.deepEqual(fs.readdirSync(env.tmpdir), []) // 中转目录整体回收
})

// ───────────────────────── 互斥单飞（INV-5） ─────────────────────────

test('互斥单飞：并发第二次调用回 reinstall-in-progress，全程只落盘一次', async () => {
  const env = setupEnv()
  const { sums, tgz } = successFixture(env)
  let release
  const gate = new Promise((res) => { release = res })
  const calls = []
  const slowFetch = async (url) => {
    calls.push(String(url))
    await gate
    return new Response(String(url) === releaseAssetUrl(CHECKSUMS_ASSET) ? sums : tgz)
  }
  const p1 = reinstallRtk(optsFor(env, { fetch: slowFetch }))
  assert.equal(isReinstallInFlight(), true)
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: slowFetch })),
    (e) => e instanceof InstallError && e.code === REINSTALL_IN_PROGRESS,
  )
  release()
  const r = await p1
  assert.equal(isReinstallInFlight(), false)
  assert.equal(r.ok, true)
  assert.equal(calls.filter((u) => u === releaseAssetUrl(RTK_ASSET)).length, 1) // 归档只下一次 = 只装一次
  assert.equal(fs.readdirSync(env.installDir).filter((n) => n.startsWith('rtk.bak.')).length, 1) // 只落盘一次
  assert.equal(fs.readdirSync(env.installDir).filter((n) => n.startsWith('.rtk.tmp-')).length, 0)
})

// ───────────────────────── 平台门槛（INV-6 判定辅助） ─────────────────────────

test('PLATFORM_UNSUPPORTED：非 linux/x64 直接拒绝，零 IO 触碰', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const calls = []
  await assert.rejects(
    reinstallRtk(optsFor(env, {
      platform: 'darwin', arch: 'x64',
      fetch: async (u) => { calls.push(String(u)); return new Response('') },
    })),
    (e) => e instanceof InstallError && e.code === PLATFORM_UNSUPPORTED,
  )
  assert.deepEqual(calls, [])
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes)
})

// ───────────────────────── 验收 3 硬判据独立断言（Task 5 收口：INV-2 / INV-3） ─────────────────────────

test('INV-2 硬判据（验收 3）：校验失败不落盘——独立断言：目标路径零写入', async () => {
  const env = setupEnv()
  const oldBytes = seedOld(env)
  const tgz = tarGz([{ name: 'rtk', data: Buffer.from(scriptBin('9.9.9')), mode: 0o755 }])
  const sums = checksumsText([[RTK_ASSET, Buffer.from('tampered payload')]])
  await assert.rejects(
    reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz) })),
    (e) => e instanceof InstallError && e.code === CHECKSUM_MISMATCH,
  )
  // 独立断言（INV-2 一条判据）：SHA256 校验失败 = 中止且不落盘
  assert.deepEqual(fs.readdirSync(env.installDir), ['rtk'], '目标目录零新增（零 tmp/bak/新 rtk）')
  assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes, '目标文件字节零改写（不落盘）')
  assert.deepEqual(fs.readdirSync(env.tmpdir), [], '中转零残留')
})

test('INV-3 硬判据（验收 3）：一切失败路径不破坏旧二进制——独立断言：校验/解包/落盘三路旧字节逐字节完整', async () => {
  const newTgz = () => tarGz([{ name: 'rtk', data: Buffer.from(scriptBin('9.9.9')), mode: 0o755 }])
  const scenarios = [
    ['校验失败', () => {
      const tgz = newTgz()
      return { fetch: fakeFetch(checksumsText([[RTK_ASSET, Buffer.from('tampered payload')]]), tgz) }
    }],
    ['解包失败', () => {
      const garbage = Buffer.from('this is definitely not a gzip tar archive\n'.repeat(8))
      return { fetch: fakeFetch(checksumsText([[RTK_ASSET, garbage]]), garbage) }
    }],
    ['落盘失败', () => {
      const tgz = newTgz()
      return {
        fetch: fakeFetch(checksumsText([[RTK_ASSET, tgz]]), tgz),
        fs: { rename: async () => { throw new Error('EROFS: read-only') } },
      }
    }],
  ]
  for (const [label, make] of scenarios) {
    const env = setupEnv()
    const oldBytes = seedOld(env)
    const over = make()
    // 独立断言（INV-3 一条判据）：失败路径旧二进制字节完整保全（语义钉死 2026-10-04 R-3 裁决）
    await assert.rejects(reinstallRtk(optsFor(env, over)), (e) => e instanceof InstallError, `${label} 归分类错误`)
    assert.deepEqual(fs.readFileSync(path.join(env.installDir, 'rtk')), oldBytes, `${label}：旧二进制字节逐字节完整`)
  }
})

// ───────────────────────── 红线断言（静态 grep + 动态写面） ─────────────────────────

test('红线静态断言：零 spawnSync/execSync/spawn、零 shell 拼接、零远程脚本执行、依赖仅 node 内建+同包', () => {
  const src = fs.readFileSync(new URL('../lib/install.js', import.meta.url), 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(code, /\bexecSync\s*\(|\bspawnSync\s*\(|\bspawn\s*\(/, '禁 spawnSync/execSync/spawn')
  assert.doesNotMatch(code, /\bshell\s*:/, '禁 shell 选项')
  assert.doesNotMatch(code, /\|\s*(sh|bash|zsh)\b/, '禁管道进 shell')
  assert.doesNotMatch(code, /[`'"][^`'"]*\b(curl|wget|bash|zsh)\b[^`'"]*[`'"]/, '禁字符串里的下载器/解释器命令')
  assert.doesNotMatch(code, /exec\s*\(\s*`/, '禁模板串拼接式执行')
  assert.match(src, /import\s*\{\s*execFile\b[^}]*\}\s*from\s*'node:child_process'/, '执行缝只许 execFile')
  assert.doesNotMatch(
    src,
    /import\s*\{[^}]*(spawn|execSync|\bexec\b)[^}]*\}\s*from\s*'node:child_process'/,
    'child_process 只引 execFile',
  )
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    assert.ok(
      spec.startsWith('node:') || spec === './doctor.js' || spec === './resolve-bin.js',
      `零新 npm 依赖：发现外部依赖 ${spec}`,
    )
  }
})

test('写面断言：全部写操作只落 mkdtemp 中转与 installDir（rtk / .rtk.tmp-* / rtk.bak.* 名形），零真 home', async () => {
  const env = setupEnv()
  const { sums, tgz } = successFixture(env)
  const record = []
  const r = await reinstallRtk(optsFor(env, { fetch: fakeFetch(sums, tgz), fs: recordingFs(record) }))
  const writes = record.filter((e) => WRITE_METHODS.includes(e.method))
  assert.ok(writes.length > 0)
  for (const { method, paths } of writes) {
    for (const p of paths) {
      const inStaging = p === env.tmpdir || p.startsWith(`${env.tmpdir}${path.sep}`)
      const inInstall = p === env.installDir || p.startsWith(`${env.installDir}${path.sep}`)
      assert.ok(inStaging || inInstall, `写面越界：${method} ${p}`)
      if (inInstall && p !== env.installDir) {
        assert.match(path.basename(p), /^rtk$|^\.rtk\.tmp-\d+$|^rtk\.bak\.\d+$/, `installDir 写面名形越界：${p}`)
      }
    }
  }
  assert.equal(r.ok, true)
})

// ───────────────────────── F-02/Ruling c：verify 直指落盘 targetPath（Task 6 fix wave） ─────────────────────────

test('F-02/Ruling c：verify 直指落盘 targetPath——多二进制共存不验 PATH 他处（0.49.0 不串味，回 9.9.9）', async () => {
  const env = setupEnv()
  // PATH 他处放一个真旧版 rtk（0.49.0）——修复前 verify 走 findRtkBin 全环境重解析会误验到它（tester 实证缺陷）
  const otherDir = path.join(env.root, 'pathbin')
  fs.mkdirSync(otherDir, { recursive: true })
  const other = path.join(otherDir, 'rtk')
  fs.writeFileSync(other, scriptBin('0.49.0'))
  fs.chmodSync(other, 0o755)
  const { sums, tgz } = successFixture(env) // 落盘字节 = scriptBin('9.9.9')
  const r = await reinstallRtk(optsFor(env, {
    fetch: fakeFetch(sums, tgz),
    resolveEnv: { path: otherDir, homedir: '' }, // 全环境解析缝指向他处（构造串味条件）
  }))
  assert.equal(r.verify.version, '9.9.9', 'verify.version=落盘二进制版本（targetPath），非 PATH 他处 0.49.0')
  assert.equal(r.verify.path, path.join(env.installDir, 'rtk'), 'verify.path=targetPath（落盘目标）')
  assert.equal(fs.readFileSync(other, 'utf8'), scriptBin('0.49.0'), '他处二进制零触碰')
})
