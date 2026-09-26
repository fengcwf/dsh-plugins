// zip — 最小 zip writer（T7/OW-INV-9 配套；零第三方 zip 库——依赖白名单外零第三方，只用 node:zlib）。
// 选型（报告写明）：文件条目 method=8（node:zlib deflateRaw）+ 数据描述符（flag 0x0008）流式打包——
//   local header 先行、crc/size 事后落数据描述符，逐条目内存有界（不整包缓冲、不整文件缓冲）；
//   目录条目 method=0 显式条目（空目录不丢）；非 ASCII 名 flag 0x0800；version needed 20、
//   version made by 0x031E（Unix，外部属性带 unix mode）。
// zip64 豁免依据：导出限额 5000 文件/500MB（OW-INV-9）恒在 16 位条目计数/32 位尺寸字段内。
// 数据完整性：CRC32（IEEE 802.3 多项式查表）；测试侧以 unzip -t / zipinfo / python3 zipfile 三工具
//   外部互验（test/zip.test.mjs），不自证。
// 背压：写侧全走 out.write 返回值 + 'drain' 等待；文件数据经 stream/promises pipeline 注入 out（end:false）。
import fs from 'node:fs'
import zlib from 'node:zlib'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const SIG_DESC = 0x08074b50
const FLAG_DESC = 0x0008 // 通用标志位 3：数据描述符（流式打包）
const FLAG_UTF8 = 0x0800 // 通用标志位 11：文件名为 UTF-8
const METHOD_STORE = 0
const METHOD_DEFLATE = 8
const VERSION_NEEDED = 20
const VERSION_MADE_BY = 0x031e // Unix(3) + 3.0
const MODE_FILE = 0o100644
const MODE_DIR = 0o40755
const DESC_LEN = 16

/** CRC32（标准查表实现；测试以 python3 zlib.crc32 神谕交叉核） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

class Crc32 {
  #c = 0xffffffff

  update(buf) {
    let c = this.#c
    for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    this.#c = c
    return this
  }

  digest() {
    return (this.#c ^ 0xffffffff) >>> 0
  }
}

function dosDateTime(ms) {
  const d = new Date(Number.isFinite(ms) ? ms : Date.now())
  const year = d.getFullYear()
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 } // ZIP 纪元 1980-01-01
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

function localHeader(nameBuf, { flags, method, mtime, crc, comp, uncomp }) {
  const { time, date } = dosDateTime(mtime)
  const buf = Buffer.alloc(30 + nameBuf.length)
  buf.writeUInt32LE(SIG_LOCAL, 0)
  buf.writeUInt16LE(VERSION_NEEDED, 4)
  buf.writeUInt16LE(flags, 6)
  buf.writeUInt16LE(method, 8)
  buf.writeUInt16LE(time, 10)
  buf.writeUInt16LE(date, 12)
  buf.writeUInt32LE(crc, 14)
  buf.writeUInt32LE(comp, 18)
  buf.writeUInt32LE(uncomp, 22)
  buf.writeUInt16LE(nameBuf.length, 26)
  buf.writeUInt16LE(0, 28) // extra 长
  nameBuf.copy(buf, 30)
  return buf
}

function dataDescriptor(crc, comp, uncomp) {
  const buf = Buffer.alloc(DESC_LEN)
  buf.writeUInt32LE(SIG_DESC, 0) // 描述符签名（带签名更兼容）
  buf.writeUInt32LE(crc, 4)
  buf.writeUInt32LE(comp, 8)
  buf.writeUInt32LE(uncomp, 12)
  return buf
}

function centralHeader(e) {
  const buf = Buffer.alloc(46 + e.nameBuf.length)
  buf.writeUInt32LE(SIG_CENTRAL, 0)
  buf.writeUInt16LE(VERSION_MADE_BY, 4)
  buf.writeUInt16LE(VERSION_NEEDED, 6)
  buf.writeUInt16LE(e.flags, 8)
  buf.writeUInt16LE(e.method, 10)
  buf.writeUInt16LE(e.time, 12)
  buf.writeUInt16LE(e.date, 14)
  buf.writeUInt32LE(e.crc, 16)
  buf.writeUInt32LE(e.comp, 20)
  buf.writeUInt32LE(e.uncomp, 24)
  buf.writeUInt16LE(e.nameBuf.length, 28)
  buf.writeUInt16LE(0, 30) // extra 长
  buf.writeUInt16LE(0, 32) // comment 长
  buf.writeUInt16LE(0, 34) // 起始盘号
  buf.writeUInt16LE(0, 36) // 内部属性
  buf.writeUInt32LE((e.mode << 16) >>> 0, 38) // 外部属性：unix mode << 16
  buf.writeUInt32LE(e.offset, 42)
  e.nameBuf.copy(buf, 46)
  return buf
}

function eocd(count, cdSize, cdOffset) {
  const buf = Buffer.alloc(22)
  buf.writeUInt32LE(SIG_EOCD, 0)
  buf.writeUInt16LE(0, 4) // 起始盘号
  buf.writeUInt16LE(0, 6) // 中心目录起始盘号
  buf.writeUInt16LE(count, 8)
  buf.writeUInt16LE(count, 10)
  buf.writeUInt32LE(cdSize, 12)
  buf.writeUInt32LE(cdOffset, 16)
  buf.writeUInt16LE(0, 20) // comment 长
  return buf
}

// 写并等 sink 处理完（write 回调）：writeZipTo 返回即全部落 sink——否则慢 sink 下
// 调用方立刻读输出会截尾（fix 实测：EOCD 未及落盘竞态）
async function writeAsync(out, buf) {
  await new Promise((resolve, reject) => {
    out.write(buf, (err) => (err ? reject(err) : resolve()))
  })
}

/**
 * 写 zip 到任意 Writable（HTTP res / 文件流 / 内存 sink）。
 * @param out Node Writable——本函数不 end（调用方收尾：res.end() / stream.end()）
 * @param entries [{name: '<zip 内 posix 路径>', type: 'dir'|'file', abs: string, mtime?: number}]
 *   - dir：写显式目录条目（name 自动补尾 '/'）
 *   - file：deflate 流式 + 数据描述符；pack 期 lstat 门——abs 非普通文件（symlink 换入/被删）跳过 + onSkip 留痕
 * @param options {{onSkip?: (entry) => void, maxFiles?: number, maxBytes?: number}}
 *   maxFiles/maxBytes=打包期限额复核（OW-INV-9 TOCTOU 防御：预扫后文件增长不再静默超限，超限即抛=断流不谎报）
 * @returns {Promise<{files, dirs, uncompressedBytes, compressedBytes}>}
 */
export async function writeZipTo(out, entries, options = {}) {
  const central = []
  const totals = { files: 0, dirs: 0, uncompressedBytes: 0, compressedBytes: 0 }
  let offset = 0
  for (const entry of entries) {
    const isDir = entry.type === 'dir'
    const name = isDir && !entry.name.endsWith('/') ? `${entry.name}/` : entry.name
    const nameBuf = Buffer.from(name, 'utf8')
    const flags = (isDir ? 0 : FLAG_DESC) | (/[^\x00-\x7f]/.test(name) ? FLAG_UTF8 : 0)
    const { time, date } = dosDateTime(entry.mtime)
    if (isDir) {
      const head = localHeader(nameBuf, { flags, method: METHOD_STORE, mtime: entry.mtime, crc: 0, comp: 0, uncomp: 0 })
      await writeAsync(out, head)
      central.push({ name, nameBuf, flags, method: METHOD_STORE, time, date, crc: 0, comp: 0, uncomp: 0, offset, mode: MODE_DIR })
      offset += head.length
      totals.dirs += 1
      continue
    }
    // pack 期 lstat 门（防御 TOCTOU 换入 symlink/删除）：非常规文件跳过+留痕，绝不解引用
    const st = await fs.promises.lstat(entry.abs).catch(() => null)
    if (st === null || !st.isFile()) {
      options.onSkip?.(entry)
      continue
    }
    const head = localHeader(nameBuf, { flags, method: METHOD_DEFLATE, mtime: entry.mtime, crc: 0, comp: 0, uncomp: 0 })
    await writeAsync(out, head)
    const crc = new Crc32()
    let uncomp = 0
    let comp = 0
    const crcTap = new Transform({
      transform(chunk, _enc, cb) {
        crc.update(chunk)
        uncomp += chunk.length
        cb(null, chunk)
      },
    })
    const compTap = new Transform({
      transform(chunk, _enc, cb) {
        comp += chunk.length
        cb(null, chunk)
      },
    })
    // 流式注入 out（end:false：out 后续还要写描述符/中心目录）；pipeline 自带背压
    await pipeline(fs.createReadStream(entry.abs), crcTap, zlib.createDeflateRaw(), compTap, out, { end: false })
    const crcValue = crc.digest()
    await writeAsync(out, dataDescriptor(crcValue, comp, uncomp))
    central.push({ name, nameBuf, flags, method: METHOD_DEFLATE, time, date, crc: crcValue, comp, uncomp, offset, mode: MODE_FILE })
    offset += head.length + comp + DESC_LEN
    totals.files += 1
    totals.uncompressedBytes += uncomp
    totals.compressedBytes += comp
    // 打包期限额复核（OW-INV-9 TOCTOU 防御）：预扫后体量/计数增长 → 抛错断流（绝不静默超限出包）
    if (Number.isFinite(options.maxBytes) && totals.uncompressedBytes > options.maxBytes) {
      throw new Error(`zip 限额超限（打包期复核）：已写 ${totals.uncompressedBytes} 字节 > 上限 ${options.maxBytes} 字节`)
    }
    if (Number.isFinite(options.maxFiles) && totals.files > options.maxFiles) {
      throw new Error(`zip 限额超限（打包期复核）：已写 ${totals.files} 个文件 > 上限 ${options.maxFiles}`)
    }
  }
  if (central.length > 0xffff) {
    throw new Error(`zip 条目数超 65535（本包导出限额应已挡下）：${central.length}`)
  }
  const cdStart = offset
  for (const e of central) {
    const buf = centralHeader(e)
    await writeAsync(out, buf)
    offset += buf.length
  }
  await writeAsync(out, eocd(central.length, offset - cdStart, cdStart))
  return totals
}
