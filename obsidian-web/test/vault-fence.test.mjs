// vault-fence — realpath 路径围栏终态（OW-INV-7）+ TOCTOU 口径 + 全消费面回归（T12 围栏合流卡）。
// 交接契约锚点：
//   - OW-INV-7：路径围栏 realpath 拒 symlink 逃逸/遍历（负例矩阵：../、绝对路径、symlink 外逃、
//     两跳链、自环、`.. ` 别名、dangling 外指）。
//   - T8 Ruling 3：穿越判据 trim 后判（`.. `/` ..`≡`..`，与 share.js 别名归一同源口径）。
//   - T5 alias 拓扑：中间段 in-root symlink 目录别名全链逐段解引用至真实节点，越 root 即拒
//     （kb fs-safe fix r1 同款语义；`a→sub/b`+`sub→outside`+末段缺失拓扑必拒）。
//   - T9 TOCTOU：lstat→open 窄窗收口=「open 前 realpath 复核」口径 + 读面打开后 fd 复核缝。
// 真验零 mock：真 tmp vault、真 symlink 拓扑、真 fs、真竞态环。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveInRoot, readNote, saveNote, createNote, renameNote, deletePath,
  assertOpenedRealInRoot, assertRealInRoot,
} from '../lib/vault-ops.js'
import { planExport } from '../lib/export.js'
import { createShare } from '../lib/share.js'
import { createIndexService } from '../lib/index-service.js'

const TMP = fileURLToPath(new URL('./.tmp-fence', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

let seq = 0
function makeVault() {
  const root = fs.mkdtempSync(path.join(TMP, `fence-${seq++}-`))
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
  fs.mkdirSync(path.join(root, 'sub', 'b'), { recursive: true })
  fs.writeFileSync(path.join(root, 'notes', 'a.md'), '# A\n')
  fs.writeFileSync(path.join(root, 'sub', 'b', 'real.md'), '# REAL\n')
  return root
}

function expectBad(fn, label) {
  assert.throws(fn, (err) => err?.code === 'bad_request', label)
}

// ── OW-INV-7 负例矩阵（围栏单一来源 resolveInRoot 直判 + 读面复核）────────────────
test('OW-INV-7①：../ 穿越族一律 bad_request（../、多层、夹 . 形）', () => {
  const root = makeVault()
  for (const p of ['../x.md', 'a/../../x.md', 'notes/../../x.md', 'a/./../../x.md']) {
    expectBad(() => resolveInRoot(root, p), `穿越未拒：${p}`)
  }
})

test('OW-INV-7②：绝对路径/盘符一律 bad_request', () => {
  const root = makeVault()
  for (const p of ['/etc/passwd', '/', 'C:/Windows/x', 'C:\\Windows\\x']) {
    expectBad(() => resolveInRoot(root, p), `绝对/盘符未拒：${p}`)
  }
})

test('OW-INV-7③：symlink 外逃（末端直指 root 外）——围栏拒 + 读面不外泄', () => {
  const root = makeVault()
  fs.symlinkSync('/etc/passwd', path.join(root, 'out.md'))
  expectBad(() => resolveInRoot(root, 'out.md'), '末端外逃未拒')
  expectBad(() => readNote(root, 'out.md'), '读面末端外逃未拒')
})

test('OW-INV-7④：两跳链外逃（link1→link2→root 外）——全链解引用后越 root 即拒', () => {
  const root = makeVault()
  fs.symlinkSync('hop2.md', path.join(root, 'hop.md'))
  fs.symlinkSync('/etc/passwd', path.join(root, 'hop2.md'))
  expectBad(() => resolveInRoot(root, 'hop.md'), '两跳链未拒')
  expectBad(() => readNote(root, 'hop.md'), '读面两跳链未拒')
})

test('OW-INV-7⑤：自环/互指（loop→loop、l1⇄l2）——环即拒（ELOOP 同语义）', () => {
  const root = makeVault()
  fs.symlinkSync('loop.md', path.join(root, 'loop.md'))
  fs.symlinkSync('l2.md', path.join(root, 'l1.md'))
  fs.symlinkSync('l1.md', path.join(root, 'l2.md'))
  for (const p of ['loop.md', 'l1.md', 'l2.md']) {
    expectBad(() => resolveInRoot(root, p), `自环/互指未拒：${p}`)
  }
})

test("OW-INV-7⑥：`.. ` 别名穿越（trim 后判，T8 Ruling 3 同源口径）——'.. '/' ..'≡'..' 同拒", () => {
  const root = makeVault()
  for (const p of ['.. ', ' ..', '..\t', ' .. /x.md', 'a/.. /x.md', 'a/ .. /x.md', 'a\\..\\..\\x.md']) {
    expectBad(() => resolveInRoot(root, p), `穿越别名未拒：${JSON.stringify(p)}`)
  }
})

test('OW-INV-7⑦：dangling 外指（symlink 目标缺失但在 root 外）——外指即逃逸意图，拒', () => {
  const root = makeVault()
  fs.symlinkSync('/nonexistent-outside-xyz/target.md', path.join(root, 'dangle.md'))
  expectBad(() => resolveInRoot(root, 'dangle.md'), 'dangling 外指未拒')
  expectBad(() => readNote(root, 'dangle.md'), '读面 dangling 外指未拒')
  // 写面同拒（缺失目标不豁免外指）
  expectBad(() => resolveInRoot(root, 'dangle.md/new.md'), '子路径 dangling 外指未拒')
})

test('OW-INV-7⑧（T5 拓扑）：中间段别名链越 root（a→sub/b + sub→outside）——末段缺失/存在双分支全链逐段解引用必拒', async () => {
  const root = makeVault()
  const outside = fs.mkdtempSync(path.join(TMP, 'outside-'))
  fs.symlinkSync(path.join(root, 'sub', 'b'), path.join(root, 'a')) // a → sub/b（in-root 中间段别名）
  fs.rmSync(path.join(root, 'sub'), { recursive: true, force: true })
  fs.symlinkSync(outside, path.join(root, 'sub')) // sub → root 外（链尾外指）
  // 分支①末段缺失（kb fs-safe fix r1 修复前误判「真缺失」放行 → 围栏写穿的同款形状）
  expectBad(() => resolveInRoot(root, 'a/x.md'), 'T5 拓扑（末段缺失）未拒')
  // 分支②末段存在（真实节点落 root 外）→ realpath 主判同拒
  fs.mkdirSync(path.join(outside, 'b'))
  fs.writeFileSync(path.join(outside, 'b', 'x.md'), '# OUTSIDE\n')
  expectBad(() => resolveInRoot(root, 'a/x.md'), 'T5 拓扑（末段存在）未拒')
  expectBad(() => readNote(root, 'a/x.md'), '读面 T5 拓扑未拒')
  await assert.rejects(() => saveNote(root, 'a/x.md', 'pwn', { etag: '0-0' }), (err) => err?.code === 'bad_request')
  assert.equal(fs.readFileSync(path.join(outside, 'b', 'x.md'), 'utf8'), '# OUTSIDE\n', 'root 外文件零写入')
})

test('OW-INV-7⑨（正例·全链解引用至真实节点）：in-root 别名解引用落真实节点，零语义漂移', async () => {
  const root = makeVault()
  fs.symlinkSync(path.join(root, 'sub', 'b'), path.join(root, 'a')) // a → sub/b（全链 in-root）
  // 读：别名路径读到真实节点内容
  const note = readNote(root, 'a/real.md')
  assert.equal(note.content, '# REAL\n')
  assert.equal(readNote(root, 'sub/b/real.md').content, note.content, '别名与真实路径同物')
  // 写：别名路径新建落真实节点（解引用至真实节点，不是新建链接）
  const created = await createNote(root, 'a/new.md', '# NEW\n')
  assert.equal(created.ok, true)
  const landed = path.join(root, 'sub', 'b', 'new.md')
  assert.ok(fs.lstatSync(landed).isFile(), '写入落真实节点')
  assert.equal(fs.readFileSync(landed, 'utf8'), '# NEW\n')
  assert.equal(fs.readdirSync(path.join(root, 'a')).filter((n) => n === 'new.md').length, 1, '别名目录视图同物')
})

test('OW-INV-7⑩：root 自身是 symlink（挂载别名根）——围栏边界=真实根，越界同拒、树内可用', () => {
  const root = makeVault()
  const aliasSlot = fs.mkdtempSync(path.join(TMP, 'root-alias-'))
  fs.rmdirSync(aliasSlot)
  fs.symlinkSync(root, aliasSlot)
  assert.equal(readNote(aliasSlot, 'notes/a.md').content, '# A\n')
  fs.symlinkSync('/etc/passwd', path.join(root, 'out.md'))
  expectBad(() => resolveInRoot(aliasSlot, 'out.md'), '别名根下外逃未拒')
  expectBad(() => resolveInRoot(aliasSlot, '../x.md'), '别名根下穿越未拒')
})

test('别名段 fail-closed（纯点空格段无独立身份，T8 Ruling 2 同款判错代价）：bad_request 可解释', () => {
  const root = makeVault()
  for (const p of ['a/.../x.md', '.. .', 'a/. ./x.md', '...']) {
    expectBad(() => resolveInRoot(root, p), `别名段未拒：${JSON.stringify(p)}`)
  }
  // '.' 与空段=通用 no-op（./notes/a.md ≡ notes/a.md），不得误拒
  assert.equal(readNote(root, './notes/a.md').content, '# A\n')
  assert.equal(readNote(root, 'notes/./a.md').content, '# A\n')
})

// ── TOCTOU 口径（T9 交接：lstat→open 窄窗收口）───────────────────────────────────
test('TOCTOU①（T9 窗口收口）：gate lstat 通过后换入外逃 symlink → readNote 围栏拒、内容零外泄', () => {
  const root = makeVault()
  const abs = path.join(root, 'swap.md')
  fs.writeFileSync(abs, '# SAFE\n')
  // 消费面 gate（T7/T8 lstat 门语义）：此刻是普通文件，放行
  assert.ok(fs.lstatSync(abs).isFile())
  // ——attacker 窗口：gate 与 readNote 之间换入外逃 symlink——
  fs.unlinkSync(abs)
  fs.symlinkSync('/etc/passwd', abs)
  expectBad(() => readNote(root, 'swap.md'), 'gate→open 窗口换入 symlink 未被围栏拦下')
  // 若围栏失守 readNote 会返回 passwd 内容——这里断言绝不发生（上一步已拒即闭合）
})

test('TOCTOU②（打开后复核缝）：open 后路径换入外逃/换物 → assertOpenedRealInRoot 拒（fd 与真实节点失配）', () => {
  const root = makeVault()
  const abs = path.join(root, 'open.md')
  fs.writeFileSync(abs, '# MINE\n')
  const fd = fs.openSync(abs, fs.constants.O_RDONLY)
  try {
    // 打开后换入外逃 symlink：路径真实节点=root 外 → 拒
    fs.unlinkSync(abs)
    fs.symlinkSync('/etc/passwd', abs)
    expectBad(() => assertOpenedRealInRoot(root, abs, fd), '打开后外逃漂移未拒')
  } finally {
    fs.closeSync(fd)
  }
  // 打开后换入 in-root 别名（fd 与路径真实节点 dev/ino 失配）→ 拒
  const abs2 = path.join(root, 'open2.md')
  fs.writeFileSync(abs2, '# MINE2\n')
  fs.writeFileSync(path.join(root, 'other.md'), '# OTHER\n')
  const fd2 = fs.openSync(abs2, fs.constants.O_RDONLY)
  try {
    fs.unlinkSync(abs2)
    fs.symlinkSync(path.join(root, 'other.md'), abs2)
    expectBad(() => assertOpenedRealInRoot(root, abs2, fd2), '打开后换物漂移未拒')
  } finally {
    fs.closeSync(fd2)
  }
})

test('TOCTOU③（真竞态环）：swap 攻击环 × readNote——结果只允许「原文/别名原文/拒」，外泄零发生', () => {
  const root = makeVault()
  const abs = path.join(root, 'race.md')
  const realCopy = path.join(root, 'race-real.md')
  fs.writeFileSync(realCopy, '# SAFE\n')
  let stop = false
  // 每 tick 一步交换（并发真竞态）：外逃 symlink ↔ 真实文件（rename 原子换入，内容永不半截）
  const attacker = () => {
    if (stop) return
    try {
      fs.rmSync(abs, { force: true })
      fs.symlinkSync('/etc/passwd', abs)
    } catch { /* 与读者互踩：制造真窗口 */ }
    try {
      fs.rmSync(abs, { force: true })
      fs.writeFileSync(realCopy, '# SAFE\n')
      fs.renameSync(realCopy, abs)
    } catch { /* 同上 */ }
  }
  const atk = setInterval(attacker, 0)
  try {
    for (let i = 0; i < 300; i++) {
      let note = null
      try {
        note = readNote(root, 'race.md')
      } catch (err) {
        // 竞态窗口内允许：bad_request（围栏拒）/ not_found（换入间隙真缺失）——其余错误=围栏失守
        assert.ok(
          err?.code === 'bad_request' || err?.code === 'not_found',
          `竞态下仅允许原文或可解释拒：${err?.code} ${err?.message}`,
        )
      }
      if (note !== null) {
        assert.ok(note.content === '# SAFE\n', `竞态读到越权内容：${JSON.stringify(note.content)}`)
        assert.ok(!note.content.includes('root:x:0:0'), 'passwd 内容零外泄')
      }
    }
  } finally {
    stop = true
    clearInterval(atk)
  }
})

test('TOCTOU④（写面口径）：入口 symlink 外逃/穿越 → saveNote/createNote 围栏拒；路径复核缝（assertRealInRoot）漂移即拒', async () => {
  const root = makeVault()
  fs.symlinkSync('/etc/passwd', path.join(root, 'w.md'))
  await assert.rejects(() => saveNote(root, 'w.md', 'pwn', { etag: '0-0' }), (err) => err?.code === 'bad_request')
  await assert.rejects(() => createNote(root, 'w2.md/../w3.md', 'pwn'), (err) => err?.code === 'bad_request')
  // 路径复核缝（写面「操作后复核」/读面无 fd 场景共用）：换物/外逃漂移 → bad_request
  const abs = path.join(root, 'post.md')
  fs.writeFileSync(abs, '# MINE\n')
  assert.doesNotThrow(() => assertRealInRoot(root, abs), '未漂移路径必须通过')
  fs.unlinkSync(abs)
  fs.symlinkSync('/etc/passwd', abs)
  expectBad(() => assertRealInRoot(root, abs), '路径复核缝外逃漂移未拒')
})

// ── 全卡消费面回归（share/save/rename/delete/export/index 全过新围栏零旁路）──────────
test('消费面回归①save：symlink 外逃/穿越别名 bad_request，盘上零写入', async () => {
  const root = makeVault()
  fs.symlinkSync('/etc/passwd', path.join(root, 's.md'))
  await assert.rejects(() => saveNote(root, 's.md', 'pwn', { etag: '0-0' }), (err) => err?.code === 'bad_request')
  await assert.rejects(() => saveNote(root, ' .. /x.md', 'pwn', { etag: '0-0' }), (err) => err?.code === 'bad_request')
})

test('消费面回归②rename：from/to 任一侧穿越别名/外逃链 bad_request', async () => {
  const root = makeVault()
  fs.symlinkSync('hop2.md', path.join(root, 'hop.md'))
  fs.symlinkSync('/etc/passwd', path.join(root, 'hop2.md'))
  await assert.rejects(() => renameNote(root, 'hop.md', 'moved.md'), (err) => err?.code === 'bad_request')
  await assert.rejects(() => renameNote(root, 'notes/a.md', ' .. /pwn.md'), (err) => err?.code === 'bad_request')
  await assert.rejects(() => renameNote(root, 'notes/a.md', 'a/.. /pwn.md'), (err) => err?.code === 'bad_request')
})

test('消费面回归③delete：dangling 外指/自环 bad_request（confirm 复述合法亦拒）', async () => {
  const root = makeVault()
  fs.symlinkSync('/nonexistent-outside-xyz/x', path.join(root, 'dangle.md'))
  fs.symlinkSync('loop.md', path.join(root, 'loop.md'))
  await assert.rejects(() => deletePath(root, 'dangle.md', { confirm: 'dangle.md' }), (err) => err?.code === 'bad_request')
  await assert.rejects(() => deletePath(root, 'loop.md', { confirm: 'loop.md' }), (err) => err?.code === 'bad_request')
})

test('消费面回归④export：两跳链/穿越别名 bad_request（拒=不产流）', () => {
  const root = makeVault()
  fs.symlinkSync('hop2.md', path.join(root, 'hop.md'))
  fs.symlinkSync('/etc/passwd', path.join(root, 'hop2.md'))
  expectBad(() => planExport(root, 'hop.md'), '导出两跳链未拒')
  expectBad(() => planExport(root, ' .. /x.md'), '导出穿越别名未拒')
})

test('消费面回归⑤share：创建目标过新围栏——T5 拓扑外指/穿越别名 bad_request（T8 模型层+围栏双保险）', async () => {
  const root = makeVault()
  const outside = fs.mkdtempSync(path.join(TMP, 'outside-share-'))
  fs.writeFileSync(path.join(outside, 'x.md'), '# OUTSIDE\n')
  fs.symlinkSync(path.join(root, 'sub', 'b'), path.join(root, 'a'))
  fs.rmSync(path.join(root, 'sub'), { recursive: true, force: true })
  fs.symlinkSync(outside, path.join(root, 'sub'))
  const config = { share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true } }
  await assert.rejects(() => createShare(root, { target: 'a/x.md', role: 'read' }, { config }), (err) => err?.code === 'bad_request')
  await assert.rejects(() => createShare(root, { target: ' .. /x.md', role: 'read' }, { config }), (err) => err?.code === 'bad_request')
})

test('消费面回归⑥index：symlink 文件/目录零入面（walk 不解引用——与围栏「不跟随出 root」同向）', async () => {
  const root = makeVault()
  const outside = fs.mkdtempSync(path.join(TMP, 'outside-idx-'))
  fs.writeFileSync(path.join(outside, 'evil.md'), '# EVIL\n')
  fs.symlinkSync(path.join(outside, 'evil.md'), path.join(root, 'link.md'))
  fs.symlinkSync(outside, path.join(root, 'linkdir'))
  const svc = createIndexService({ vaultRoot: root, timers: { setInterval: () => 0, clearInterval: () => {} } })
  const run = await svc.refresh()
  const indexed = run.counts.seen + run.counts.added + run.counts.updated
  assert.equal(indexed, 2, `索引面只含真实 md（a.md+real.md）：${JSON.stringify(run.counts)}`)
  assert.equal(run.counts.added, 2, 'symlink 条目零入面（walk 不解引用）')
})
