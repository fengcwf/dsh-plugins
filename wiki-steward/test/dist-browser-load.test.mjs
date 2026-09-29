// T-F1 修复环 R1 回归锁：web/dist 构建物「真浏览器可加载」语义（Node 测试面结构性盲区的补锁）。
// 缺陷现场（tester T-F1 逐字）：web/dist/panel.js 含 219 处未替换 process.env.NODE_ENV（vite 无 define），
// 浏览器 import() 模块求值即抛 ReferenceError: process is not defined——「查看历史记录」弹层只显示
// 「wiki-steward 历史记录加载失败：process is not defined」。宿主前端无 process 垫片，任何真浏览器必复现；
// Node 测试面自带 process 结构性抓不到（各历史构建均含，非本批回归）。
// 锁形（tester 修复建议 + LRN-037 大文本用 Buffer/正则比对）：
//   ① 字节级残留扫描：dist 产物零 process.env.NODE_ENV（构建物字节扫描，非源码面推断）
//   ② Node 全局残留扫描：process.*/__dirname/__filename/require(/module.exports/Buffer 节点 API/global. 等全零
//   ③ 无 process 环境真 ESM 加载：子进程 delete globalThis.process 后动态 import panel.js 不抛 + 导出 mount
//      （=真浏览器语义模拟：浏览器无 process 全局，模块求值期任何 process 访问即炸）
//   ④ 判别力（先红后绿）：旧缺陷形 fixture（含未替换 process.env.NODE_ENV）在 ①③ 两锁下必红。
// 零 mock：真查真构建物字节、真子进程真 ESM 解析（与 client-face 真 import 面同款纪律）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(PKG_DIR, 'web', 'dist')
const PANEL = path.join(DIST, 'panel.js')
const DIST_FILES = ['panel.js', 'style.css']

/** Buffer 级字节计数（LRN-037：大文本比对用 Buffer/正则，不做逐行字符串拼接） */
function countBytes(buf, needle) {
  const n = Buffer.from(needle, 'utf8')
  let count = 0
  let i = buf.indexOf(n)
  while (i !== -1) {
    count += 1
    i = buf.indexOf(n, i + n.length)
  }
  return count
}

/** 正则全局计数（utf8 解码后按词界匹配，避免 cleanupBuffer 类假阳性） */
function countRe(text, re) {
  return (text.match(re) || []).length
}

/**
 * 无 process 环境真 ESM 加载（真浏览器语义模拟）：子进程先 delete globalThis.process，
 * 再动态 import 目标模块——任何模块求值期 process 访问 = ReferenceError = 非零退出。
 * 子进程级隔离：不污染父测试进程的 process（Node --test 面自身依赖）。
 */
function importWithoutProcess(modulePath) {
  const script = [
    'delete globalThis.process;',
    `const mod = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
    'if (typeof mod.mount !== "function") throw new Error("WS_NO_MOUNT_EXPORT");',
    'console.log("WS_DIST_IMPORT_OK");',
  ].join('\n')
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 60_000,
  })
}

// ── ① 字节级残留锁：零 process.env.NODE_ENV（T-F1 缺陷本体：旧构建 219 处）────────
test('① 残留锁：web/dist 产物零 process.env.NODE_ENV 字节残留（vite define 必须真替换）', () => {
  for (const f of DIST_FILES) {
    const bytes = fs.readFileSync(path.join(DIST, f))
    assert.equal(
      countBytes(bytes, 'process.env.NODE_ENV'),
      0,
      `web/dist/${f} 残留 process.env.NODE_ENV——真浏览器 import() 必抛 ReferenceError: process is not defined（T-F1 blocker）`,
    )
    assert.equal(countBytes(bytes, 'process.env'), 0, `web/dist/${f} 残留 process.env（宽口径兜底）`)
  }
})

// ── ② Node 全局残留锁（顺带核对面：__dirname/Buffer/global 等，一并 define/清理）────
// 判别口径（只锁真浏览器会炸/会歪的形）：
//   · process.* 任何属性访问、require(、module.exports、__dirname、__filename、setImmediate
//   · Buffer 节点 API（Buffer.from/alloc/isBuffer…）与 global. 属性访问
// 明示豁免（非残留，见 R1 报告残留扫描表）：lib 面 cleanupBuffer 方法名（插件 API 词，非 Node Buffer）；
// Vue 全局探测 typeof global < "u" ? global : {}（typeof 守卫，浏览器不求值 global 分支）。
test('② Node 全局残留锁：dist 产物零 process/require/module/Buffer 节点 API/global. 残留', () => {
  const banned = [
    [/\bprocess\s*\./g, 'process.* 属性访问'],
    [/\brequire\s*\(/g, 'require('],
    [/\bmodule\s*\.\s*exports\b/g, 'module.exports'],
    [/\b__dirname\b/g, '__dirname'],
    [/\b__filename\b/g, '__filename'],
    [/\bsetImmediate\b/g, 'setImmediate'],
    [/\bBuffer\s*\.\s*(?:from|alloc|allocUnsafe|allocUnsafeSlow|isBuffer|concat|compare|byteLength)\b/g, 'Buffer 节点 API'],
    [/\bglobal\s*\./g, 'global. 属性访问'],
  ]
  for (const f of DIST_FILES) {
    const text = fs.readFileSync(path.join(DIST, f), 'utf8')
    for (const [re, label] of banned) {
      assert.equal(countRe(text, re), 0, `web/dist/${f} 残留 Node 全局 ${label}——真浏览器面必须零残留`)
    }
  }
})

// ── ③ 无 process 环境真 ESM 加载锁（真浏览器语义模拟，模块求值不抛）────────────────
test('③ 真浏览器语义加载锁：无 process 全局子进程动态 import panel.js 不抛 + 导出 mount', () => {
  const r = importWithoutProcess(PANEL)
  assert.equal(r.status, 0, `无 process 环境加载 panel.js 必须成功（stderr: ${r.stderr.slice(-400)}）`)
  assert.match(r.stdout, /WS_DIST_IMPORT_OK/, '加载成功标记必须出现（module 求值 + mount 契约通过）')
})

// ── ④ 判别力（对旧缺陷可见——先红后绿的「红」即本锁在修复前的真实输出）──────────────
test('④ 判别力：旧缺陷形（未替换 process.env.NODE_ENV）在残留锁与加载锁下必红', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-dist-lock-'))
  try {
    const fixture = path.join(tmp, 'old-defect-panel.js')
    // 旧缺陷形（T-F1 修复前 web/dist/panel.js 同款）：vite 无 define → 真值未替换
    fs.writeFileSync(
      fixture,
      'const isDev = process.env.NODE_ENV !== "production"\nexport function mount() { return { unmount() {} } }\nexport const __dev = isDev\n',
    )
    const bytes = fs.readFileSync(fixture)
    assert.ok(countBytes(bytes, 'process.env.NODE_ENV') > 0, '残留锁判别力：旧缺陷形必须被字节扫描看见（锁不可对它失明）')
    const r = importWithoutProcess(fixture)
    assert.notEqual(r.status, 0, '加载锁判别力：旧缺陷形在无 process 环境必炸（锁不可对它失明）')
    assert.match(r.stderr, /process is not defined/, '炸点必须如实=process is not defined（tester 取证同款报错）')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
