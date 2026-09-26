// 最小 zip writer 契约测试（T7/OW-INV-9 配套）：lib/zip.js——零第三方 zip 库（依赖白名单外零第三方），
// Node 内建 node:zlib 原生 deflateRaw + 流式数据描述符（flag 0x0008）打包，内存有界。
// 测试三线（自研 zip writer 须结构测试 + 外部工具解压互验，任务约束）：
//   ① 自研结构解析：EOCD/中心目录/local header/数据描述符逐字段（含偏移自洽）；
//   ② 外部工具互验：unzip -t + zipinfo -1 + python3 zipfile.testzip 三工具独立核；
//   ③ 解压内容逐字节同（Buffer.equals），空目录保留、UTF-8 名 flag 锁定。
// zip 形（lib/zip.js 契约）：文件条目 method=8（deflateRaw）+ 数据描述符；目录条目 method=0 显式条目
//   （空目录不丢）；非 ASCII 名 flag 0x0800；version needed 20、version made by 0x031E（Unix）；
//   无 zip64（导出限额 5000 文件/500MB 恒在 32 位字段/16 位计数内——OW-INV-9 限额即 zip64 豁免依据）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { writeZipTo } from '../lib/zip.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-zip', import.meta.url))

function makeVault(t, files) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const vault = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  t.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(vault, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return vault
}

function collectSink() {
  const chunks = []
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  sink.chunks = chunks
  return sink
}

/** 测试侧独立 zip 结构解析（只读校验器，非实现复用）：EOCD→中心目录→local header→数据描述符 */
function parseZip(buf) {
  const eocdOff = buf.length - 22
  assert.equal(buf.readUInt32LE(eocdOff), 0x06054b50, 'EOCD 签名')
  assert.equal(buf.readUInt16LE(eocdOff + 20), 0, 'EOCD 无注释（固定 22 字节尾）')
  const count = buf.readUInt16LE(eocdOff + 10)
  const cdSize = buf.readUInt32LE(eocdOff + 12)
  const cdOffset = buf.readUInt32LE(eocdOff + 16)
  assert.equal(buf.readUInt16LE(eocdOff + 8), count, 'entries on disk == total entries')
  const entries = []
  let p = cdOffset
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, `中心目录签名（第 ${i} 项）`)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    entries.push({
      versionMadeBy: buf.readUInt16LE(p + 4),
      versionNeeded: buf.readUInt16LE(p + 6),
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      crc: buf.readUInt32LE(p + 16),
      compSize: buf.readUInt32LE(p + 20),
      uncompSize: buf.readUInt32LE(p + 24),
      extAttrs: buf.readUInt32LE(p + 38),
      localOffset: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  assert.equal(p, cdOffset + cdSize, '中心目录长度自洽')
  return { count, cdOffset, cdSize, entries }
}

/** 独立 CRC 外部神谕：python3 zlib.crc32（与实现零共享代码） */
function oracleCrc(buf) {
  const out = execFileSync('python3', ['-c', 'import sys,zlib;print(zlib.crc32(sys.stdin.buffer.read()) & 0xffffffff)'], { input: buf })
  return Number(out.toString().trim())
}

test('结构解析：EOCD/中心目录/local header/数据描述符逐字段自洽（文件=method 8+描述符；目录=method 0 显式条目）', async (t) => {
  const vault = makeVault(t, {
    'a.md': 'hello zip\n'.repeat(20),
    'sub/b.txt': 'b 内容 中文\n',
    'sub/inner/c.md': 'deep\n',
    '中文.md': 'utf8 名\n',
  })
  fs.mkdirSync(path.join(vault, 'empty'), { recursive: true })
  const entries = [
    { name: 'a.md', type: 'file', abs: path.join(vault, 'a.md') },
    { name: 'empty/', type: 'dir', abs: path.join(vault, 'empty') },
    { name: 'sub/', type: 'dir', abs: path.join(vault, 'sub') },
    { name: 'sub/b.txt', type: 'file', abs: path.join(vault, 'sub/b.txt') },
    { name: 'sub/inner/c.md', type: 'file', abs: path.join(vault, 'sub/inner/c.md') },
    { name: '中文.md', type: 'file', abs: path.join(vault, '中文.md') },
  ]
  const sink = collectSink()
  const stats = await writeZipTo(sink, entries)
  const expectBytes = Buffer.byteLength('hello zip\n'.repeat(20)) + Buffer.byteLength('b 内容 中文\n')
    + Buffer.byteLength('deep\n') + Buffer.byteLength('utf8 名\n')
  assert.equal(stats.files, 4)
  assert.equal(stats.dirs, 2)
  assert.equal(stats.uncompressedBytes, expectBytes)
  assert.ok(stats.compressedBytes > 0 && stats.compressedBytes <= stats.uncompressedBytes, 'deflate 输出长度有界')
  const buf = Buffer.concat(sink.chunks)
  const zip = parseZip(buf)
  assert.equal(zip.count, 6, '中心目录条目数=写出条目数')
  assert.deepEqual(zip.entries.map((e) => e.name), ['a.md', 'empty/', 'sub/', 'sub/b.txt', 'sub/inner/c.md', '中文.md'])

  for (const e of zip.entries) {
    assert.equal(e.versionNeeded, 20)
    assert.equal(e.versionMadeBy, 0x031e, 'version made by=Unix 3.0（外部属性带 unix mode）')
    const isDir = e.name.endsWith('/')
    assert.equal(e.method, isDir ? 0 : 8, '目录 store / 文件 deflate')
    if (!isDir) {
      assert.equal(e.flags & 0x0008, 0x0008, '文件条目带数据描述符（flag 0x0008）')
    } else {
      assert.equal(e.flags & 0x0008, 0, '目录条目无数据描述符（crc/size 直填 local header）')
      assert.equal(e.crc, 0)
      assert.equal(e.compSize, 0)
      assert.equal(e.uncompSize, 0)
    }
    assert.equal(Boolean(e.flags & 0x0800), /[^\x00-\x7f]/.test(e.name), 'UTF-8 名 flag 仅非 ASCII 名置位')
    // local header 逐字段 + 数据描述符位置自洽
    const lo = e.localOffset
    assert.equal(buf.readUInt32LE(lo), 0x04034b50, `local header 签名：${e.name}`)
    assert.equal(buf.readUInt16LE(lo + 6), e.flags, 'local flags 与中心目录一致')
    assert.equal(buf.readUInt16LE(lo + 8), e.method, 'local method 与中心目录一致')
    const nameLen = buf.readUInt16LE(lo + 26)
    const extraLen = buf.readUInt16LE(lo + 28)
    assert.equal(buf.toString('utf8', lo + 30, lo + 30 + nameLen), e.name)
    if (isDir) continue
    const dataStart = lo + 30 + nameLen + extraLen
    const desc = dataStart + e.compSize
    assert.equal(buf.readUInt32LE(desc), 0x08074b50, `数据描述符签名：${e.name}`)
    assert.equal(buf.readUInt32LE(desc + 4), e.crc, '描述符 crc==中心目录 crc')
    assert.equal(buf.readUInt32LE(desc + 8), e.compSize, '描述符压缩长==中心目录')
    assert.equal(buf.readUInt32LE(desc + 12), e.uncompSize, '描述符原始长==中心目录')
    const raw = fs.readFileSync(path.join(vault, e.name))
    assert.equal(e.uncompSize, raw.length, '未压缩长=源文件字节数')
    assert.equal(e.crc, oracleCrc(raw), `crc 对 python3 zlib.crc32 神谕：${e.name}`)
    assert.ok(e.compSize < e.uncompSize || raw.length < 32, `deflate 对可压缩文本生效：${e.name}`)
    assert.equal(e.extAttrs >>> 16, 0o100644, '文件 unix mode')
  }
  const dir = zip.entries.find((e) => e.name === 'empty/')
  assert.equal(dir.extAttrs >>> 16, 0o40755, '目录 unix mode')
})

test('外部解压互验：unzip -t + zipinfo -1 + python3 zipfile 三工具独立核 + 解压内容逐字节同 + 空目录保留', async (t) => {
  const payload = {
    'a.md': 'hello zip\n'.repeat(20),
    'sub/b.txt': 'b 内容 中文\n',
    'sub/inner/c.md': 'deep\n',
    '中文.md': 'utf8 名\n',
  }
  const vault = makeVault(t, payload)
  fs.mkdirSync(path.join(vault, 'empty'), { recursive: true })
  const entries = [
    { name: 'a.md', type: 'file', abs: path.join(vault, 'a.md') },
    { name: 'empty/', type: 'dir', abs: path.join(vault, 'empty') },
    { name: 'sub/', type: 'dir', abs: path.join(vault, 'sub') },
    { name: 'sub/inner/', type: 'dir', abs: path.join(vault, 'sub/inner') },
    { name: 'sub/b.txt', type: 'file', abs: path.join(vault, 'sub/b.txt') },
    { name: 'sub/inner/c.md', type: 'file', abs: path.join(vault, 'sub/inner/c.md') },
    { name: '中文.md', type: 'file', abs: path.join(vault, '中文.md') },
  ]
  const zipPath = path.join(TMP_ROOT, 'out.zip')
  const out = fs.createWriteStream(zipPath)
  const stats = await writeZipTo(out, entries)
  await new Promise((resolve, reject) => {
    out.end()
    out.on('finish', resolve)
    out.on('error', reject)
  })
  assert.equal(stats.files, 4)
  assert.equal(stats.dirs, 3)

  // ① unzip -t：CRC/结构全检
  const testOut = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' })
  assert.match(testOut, /No errors detected/i, 'unzip -t 零错误')
  // ② zipinfo -1：条目名清单逐字节同
  const names = execFileSync('zipinfo', ['-1', zipPath], { encoding: 'utf8' }).trim().split('\n')
  assert.deepEqual(names, entries.map((e) => (e.type === 'dir' && !e.name.endsWith('/') ? `${e.name}/` : e.name)))
  // ③ python3 zipfile：第三方解析器独立核 CRC（testzip() 返 None=全部通过）
  const py = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("testzip:",z.testzip());print("names:",z.namelist())', zipPath], { encoding: 'utf8' })
  assert.match(py, /testzip: None/, 'python3 zipfile CRC 全检通过')

  // ④ 解压内容逐字节同（Buffer.equals）+ 空目录保留
  const extractDir = path.join(TMP_ROOT, 'extract')
  execFileSync('unzip', ['-q', '-o', '-d', extractDir, zipPath])
  for (const [rel, content] of Object.entries(payload)) {
    const got = fs.readFileSync(path.join(extractDir, rel))
    assert.ok(got.equals(Buffer.from(content, 'utf8')), `解压逐字节同：${rel}`)
  }
  assert.ok(fs.statSync(path.join(extractDir, 'empty')).isDirectory(), '空目录条目保留')
  assert.ok(fs.statSync(path.join(extractDir, 'sub/inner')).isDirectory(), '嵌套目录保留')
})

test('pack 期 lstat 门：abs 已非普通文件（symlink 换入/被删）→ 条目跳过 + onSkip 留痕，中心目录零该条目', async (t) => {
  const vault = makeVault(t, { 'real.md': 'real\n', 'keep.md': 'keep\n' })
  const link = path.join(vault, 'link.md')
  fs.symlinkSync(path.join(vault, 'real.md'), link)
  const entries = [
    { name: 'keep.md', type: 'file', abs: path.join(vault, 'keep.md') },
    { name: 'link.md', type: 'file', abs: link },
    { name: 'gone.md', type: 'file', abs: path.join(vault, 'gone.md') },
  ]
  const skipped = []
  const sink = collectSink()
  const stats = await writeZipTo(sink, entries, { onSkip: (e) => skipped.push(e.name) })
  assert.deepEqual(skipped, ['link.md', 'gone.md'], 'symlink/缺失条目跳过+留痕（不解引用）')
  assert.equal(stats.files, 1)
  const zip = parseZip(Buffer.concat(sink.chunks))
  assert.deepEqual(zip.entries.map((e) => e.name), ['keep.md'])
})

test('背压：慢消费 Writable 不挂死；2MB 随机条目（不可压缩）解压逐字节同', async (t) => {
  const big = Buffer.alloc(2 * 1024 * 1024)
  for (let i = 0; i < big.length; i += 1) big[i] = (i * 31 + 7) % 251
  const vault = makeVault(t, { 'big.bin': big })
  const entries = [{ name: 'big.bin', type: 'file', abs: path.join(vault, 'big.bin') }]
  const chunks = []
  const slow = new Writable({
    highWaterMark: 4096,
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      setTimeout(cb, 1) // 慢消费：写侧必须走背压等待而非无界堆积
    },
  })
  const stats = await writeZipTo(slow, entries)
  assert.equal(stats.uncompressedBytes, big.length)
  const zipPath = path.join(TMP_ROOT, 'big.zip')
  fs.writeFileSync(zipPath, Buffer.concat(chunks))
  assert.match(execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }), /No errors detected/i)
  const extractDir = path.join(TMP_ROOT, 'big-extract')
  execFileSync('unzip', ['-q', '-o', '-d', extractDir, zipPath])
  assert.ok(fs.readFileSync(path.join(extractDir, 'big.bin')).equals(big), '大条目解压逐字节同')
})

test('打包期限额复核（OW-INV-9 TOCTOU 防御）：预扫后增长 → 抛错断流不谎报；上限含恰界通过', async (t) => {
  const vault = makeVault(t, { 'a.md': 'x'.repeat(1000) })
  const entries = [{ name: 'a.md', type: 'file', abs: path.join(vault, 'a.md') }]
  await assert.rejects(
    () => writeZipTo(collectSink(), entries, { maxBytes: 500 }),
    /zip 限额超限（打包期复核）/,
    '体量超限（预扫后增长）必须抛错',
  )
  await assert.rejects(
    () => writeZipTo(collectSink(), entries, { maxFiles: 0 }),
    /zip 限额超限（打包期复核）/,
    '计数超限（预扫后增长）必须抛错',
  )
  const ok = await writeZipTo(collectSink(), entries, { maxBytes: 1000, maxFiles: 1 })
  assert.equal(ok.uncompressedBytes, 1000, '恰界=上限含，通过')
})

test('空条目集：空 zip（仅 EOCD）结构合法；unzip 对空档固定报 empty（exit 1，非损坏语义）', async (t) => {
  t.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))
  const sink = collectSink()
  const stats = await writeZipTo(sink, [])
  assert.deepEqual(stats, { files: 0, dirs: 0, uncompressedBytes: 0, compressedBytes: 0 })
  const buf = Buffer.concat(sink.chunks)
  assert.equal(buf.length, 22, '空 zip=仅 EOCD')
  assert.equal(buf.readUInt32LE(0), 0x06054b50, 'EOCD 签名在位')
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const zipPath = path.join(TMP_ROOT, 'empty.zip')
  fs.writeFileSync(zipPath, buf)
  // unzip 固有语义：空档报 "zipfile is empty" exit 1（=空，非损坏）；结构有效性由 python3 zipfile 判定
  assert.throws(
    () => execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }),
    (err) => /zipfile is empty/i.test(String(err.stdout ?? '')) && !/error|corrupt/i.test(String(err.stdout ?? '')),
    'unzip 报 empty 而非损坏',
  )
  const py = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("testzip:",z.testzip());print("names:",z.namelist())', zipPath], { encoding: 'utf8' })
  assert.match(py, /testzip: None/, '空 zip 结构有效（python3 zipfile 零 CRC 错误）')
  assert.match(py, /names: \[\]/, '零条目')
})
