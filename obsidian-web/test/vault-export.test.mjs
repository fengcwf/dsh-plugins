// 导出预扫契约测试（T7）：lib/export.js——OW-US-7 / OW-INV-9 限额预扫 + lstat 门 + .trash 口径。
// 限额语义（定稿并测试锁定）：预扫计数/体量**超限拒绝 + 可解释提示**（不是截断导出——INV 字面"超限拒绝"）；
//   限额常量显式 MAX_FILES=5000、MAX_BYTES=500MB、MAX_ENTRIES=65535（条目总数含目录，fix r1/I1）；
//   "≤5000 文件/500MB/65535 条目"=上限含（恰界通过，超 1 即拒）。
// 双限额恰界（任务必含）：4999/5000/5001 文件、499.9/500/500.1MB 六形态全走真文件真 stat（稀疏文件=零磁盘成本）。
// 安全面（任务约束）：导出路径过 resolved abs 围栏 + lstat 门（symlink 不跟随——只导出真实文件，
//   symlink 条目跳过+留痕）；.trash 恢复材料非工作面——拒（reason='in-trash'，含 './' 词法形态，沿 T6 修复轮口径）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { planExport, MAX_FILES, MAX_BYTES, MAX_ENTRIES } from '../lib/export.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-export', import.meta.url))

function makeVault(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const vault = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  t.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))
  return vault
}

function touch(p, content = '') {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function sparse(p, size) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.closeSync(fs.openSync(p, 'w'))
  fs.truncateSync(p, size)
}

// ── 文件数恰界（真 5000 常量：4999/5000 过、5001 拒）────────────────────────────
test('文件数恰界：4999/5000 恰界通过（上限含）、5001 拒 + 可解释提示（含实际值与上限）', async (t) => {
  const vault = makeVault(t)
  const dir = path.join(vault, 'many')
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < MAX_FILES + 1; i += 1) fs.closeSync(fs.openSync(path.join(dir, `f${String(i).padStart(5, '0')}.md`), 'w'))
  fs.mkdirSync(path.join(vault, 'stash'), { recursive: true })

  const over = planExport(vault, 'many')
  assert.equal(over.ok, false)
  assert.equal(over.reason, 'limit-exceeded')
  assert.equal(over.actual.files, MAX_FILES + 1)
  assert.equal(over.limit.files, MAX_FILES)
  assert.ok(over.message.includes(String(MAX_FILES + 1)) && over.message.includes(String(MAX_FILES)),
    `超限提示必须可解释（实际 ${MAX_FILES + 1} 与上限 ${MAX_FILES} 都要在文案里）：${over.message}`)

  // 恰界 5000（=上限含）：挪走 1 个即过
  fs.renameSync(path.join(dir, 'f00000.md'), path.join(vault, 'stash', 'f00000.md'))
  const exact = planExport(vault, 'many')
  assert.equal(exact.ok, true, '5000 文件=上限含，应通过')
  assert.equal(exact.totalFiles, MAX_FILES)

  // 4999 再过一档
  fs.renameSync(path.join(dir, 'f00001.md'), path.join(vault, 'stash', 'f00001.md'))
  const under = planExport(vault, 'many')
  assert.equal(under.ok, true)
  assert.equal(under.totalFiles, MAX_FILES - 1)
})

// ── 字节恰界（499.9/500/500.1MB 真体量；稀疏文件零磁盘成本）─────────────────────
test('字节恰界：499.9MB/500MB 恰界通过（上限含）、500.1MB 拒 + 可解释提示', async (t) => {
  const vault = makeVault(t)
  const KB = 1024
  sparse(path.join(vault, 'under', 'a.bin'), MAX_BYTES - 100 * KB) // 499.9MB 档
  sparse(path.join(vault, 'exact', 'a.bin'), MAX_BYTES - 100 * KB) // 500MB 恰界（两文件合计）
  sparse(path.join(vault, 'exact', 'b.bin'), 100 * KB)
  sparse(path.join(vault, 'over', 'a.bin'), MAX_BYTES + 100 * KB) // 500.1MB 档

  const u = planExport(vault, 'under')
  assert.equal(u.ok, true)
  assert.equal(u.totalBytes, MAX_BYTES - 100 * KB)

  const e = planExport(vault, 'exact')
  assert.equal(e.ok, true, '合计恰 MAX_BYTES=上限含，应通过')
  assert.equal(e.totalBytes, MAX_BYTES)

  const o = planExport(vault, 'over')
  assert.equal(o.ok, false)
  assert.equal(o.reason, 'limit-exceeded')
  assert.equal(o.actual.bytes, MAX_BYTES + 100 * KB)
  assert.equal(o.limit.bytes, MAX_BYTES)
  assert.ok(o.message.includes(String(MAX_BYTES + 100 * KB)) && o.message.includes(String(MAX_BYTES)),
    `超限提示必须可解释：${o.message}`)
})

test('限额口径字面锁定：MAX_FILES=5000、MAX_BYTES=500MB（500*1024*1024）、MAX_ENTRIES=65535（条目含目录，界内 zip 格式 16 位计数）——常量显式、非幻数', () => {
  assert.equal(MAX_FILES, 5000)
  assert.equal(MAX_BYTES, 500 * 1024 * 1024)
  assert.equal(MAX_ENTRIES, 65535)
})

// ── symlink 不跟随：跳过 + 留痕（含指向 vault 外的链接零逃逸）────────────────────
test('symlink 条目跳过+留痕：文件/目录/指向 vault 外三形态全跳过，真实文件照常入列，总量不含跳过项', async (t) => {
  const vault = makeVault(t)
  touch(path.join(vault, 'dir', 'real.md'), 'real\n')
  touch(path.join(vault, 'outside-secret.txt'), 'OUTSIDE\n')
  fs.symlinkSync(path.join(vault, 'outside-secret.txt'), path.join(vault, 'dir', 'link-file.md'))
  fs.symlinkSync('/etc/hostname', path.join(vault, 'dir', 'link-escape.md'))
  fs.mkdirSync(path.join(vault, 'target-dir'), { recursive: true })
  touch(path.join(vault, 'target-dir', 'hidden.md'), 'hidden\n')
  fs.symlinkSync(path.join(vault, 'target-dir'), path.join(vault, 'dir', 'link-dir'))

  const plan = planExport(vault, 'dir')
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.entries.filter((x) => x.type === 'file').map((x) => x.name), ['real.md'],
    '只有真实文件入列（symlink 不跟随、不解引用）')
  assert.equal(plan.totalFiles, 1)
  assert.equal(plan.totalBytes, Buffer.byteLength('real\n'))
  assert.equal(plan.skipped.length, 3)
  for (const name of ['link-file.md', 'link-escape.md', 'link-dir']) {
    assert.ok(plan.skipped.some((s) => s.includes(name)), `跳过必须留痕（含条目名）：${name} → ${JSON.stringify(plan.skipped)}`)
  }
  const zipNames = plan.entries.map((x) => x.name).join('\n')
  assert.ok(!zipNames.includes('hidden'), 'symlink 目录内容零逃逸（不解引用）')
})

test('单文件 lstat 门：symlink 拒 not-a-file（不解引用）；真实文件/隐藏文件显式请求可导出', async (t) => {
  const vault = makeVault(t)
  touch(path.join(vault, 'note.md'), 'hi\n')
  touch(path.join(vault, '.hidden.md'), 'hidden\n')
  fs.symlinkSync(path.join(vault, 'note.md'), path.join(vault, 'link.md'))

  const okPlan = planExport(vault, 'note.md')
  assert.equal(okPlan.ok, true)
  assert.equal(okPlan.kind, 'file')
  assert.equal(okPlan.downloadName, 'note.md')
  assert.equal(okPlan.totalFiles, 1)
  assert.equal(okPlan.entries[0].abs, path.join(vault, 'note.md'))

  // 隐藏 dot 文件显式请求=可导出（树不出 ≠ 显式拒；.trash 另有拒口径）
  const dotPlan = planExport(vault, '.hidden.md')
  assert.equal(dotPlan.ok, true)

  const linkPlan = planExport(vault, 'link.md')
  assert.equal(linkPlan.ok, false)
  assert.equal(linkPlan.reason, 'not-a-file', 'symlink 不跟随：单文件导出拒')

  const missing = planExport(vault, 'nope.md')
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'not-found')
})

// ── .trash 口径（Ruling：拒——恢复材料非工作面）+ T6 修复轮词法形态回归 ─────────────
test('.trash 口径：回收站本体/内部条目/./ 词法形态一律拒 in-trash；根导出不含 .trash 条目', async (t) => {
  const vault = makeVault(t)
  touch(path.join(vault, '.trash', 'notes', 'a.md'), 'deleted\n')
  touch(path.join(vault, 'notes', 'b.md'), 'b\n')

  for (const rel of ['.trash', '.trash/notes/a.md', './.trash', './.trash/notes/a.md', '.trash/./notes/a.md']) {
    const plan = planExport(vault, rel)
    assert.equal(plan.ok, false, `回收站条目必须拒：${rel}`)
    assert.equal(plan.reason, 'in-trash', rel)
    assert.ok(plan.message.length > 0)
  }

  const rootPlan = planExport(vault, 'notes')
  assert.equal(rootPlan.ok, true)
  assert.ok(!rootPlan.entries.some((x) => x.name.includes('.trash')), '导出内容不含回收站')
})

// ── 目录 plan 形状（zip 条目=相对导出目录、无包装目录；dot 条目不出=树同视图）────────
test('目录 plan 形状：entries 名=相对导出目录（无包装）、目录条目带尾斜杠、downloadName=<basename>.zip、dot 条目不出', async (t) => {
  const vault = makeVault(t)
  touch(path.join(vault, 'notes', 'a.md'), 'a\n')
  touch(path.join(vault, 'notes', 'sub', 'deep.md'), 'deep\n')
  touch(path.join(vault, 'notes', 'empty', '.keep'), '') // dot 条目不出
  touch(path.join(vault, 'notes', '.hidden.md'), 'hidden\n')
  touch(path.join(vault, '.trash', 'x.md'), 'x\n')

  const plan = planExport(vault, 'notes')
  assert.equal(plan.ok, true)
  assert.equal(plan.kind, 'dir')
  assert.equal(plan.downloadName, 'notes.zip')
  assert.deepEqual(plan.entries.map((x) => x.name), ['a.md', 'empty/', 'sub/', 'sub/deep.md'])
  assert.ok(plan.entries.find((x) => x.name === 'sub/').type === 'dir')
  assert.equal(plan.totalFiles, 2, 'totalFiles 只数文件（目录不计）')
  assert.equal(plan.totalBytes, Buffer.byteLength('a\n') + Buffer.byteLength('deep\n'))
  assert.deepEqual(plan.skipped, [])
  for (const e of plan.entries.filter((x) => x.type === 'file')) {
    assert.ok(path.isAbsolute(e.abs) && fs.statSync(e.abs).isFile(), '文件条目带真实 abs')
    assert.equal(typeof e.mtime, 'number')
    assert.equal(typeof e.size, 'number')
  }
})

test('围栏：形参缺失/绝对路径/穿越/越界 throw bad_request（沿 deletePath/renameNote 惯例）', async (t) => {
  const vault = makeVault(t)
  for (const rel of ['', '../x', 'notes/../../x', '/etc/passwd', 'a\u0000b']) {
    assert.throws(() => planExport(vault, rel), (err) => err.code === 'bad_request', `必须拒：${JSON.stringify(rel)}`)
  }
})

// ── fix r1/I1：条目数恰界（含目录）——目录条目计入限额（原边界失守：目录不计→截断流）──────
test('条目数恰界（含目录）：65536 条目拒 + 可解释提示（actual/limit.entries）、挪走 1 个→65535 恰界通过（上限含）', async (t) => {
  const vault = makeVault(t)
  const dir = path.join(vault, 'many')
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < MAX_ENTRIES + 1; i += 1) fs.mkdirSync(path.join(dir, `d${String(i).padStart(5, '0')}`))
  fs.mkdirSync(path.join(vault, 'stash'), { recursive: true })

  const over = planExport(vault, 'many')
  assert.equal(over.ok, false)
  assert.equal(over.reason, 'limit-exceeded')
  assert.equal(over.actual.entries, MAX_ENTRIES + 1, '目录条目必须计入（原缺口：目录不计限额）')
  assert.equal(over.limit.entries, MAX_ENTRIES)
  assert.ok(over.message.includes(String(MAX_ENTRIES + 1)) && over.message.includes(String(MAX_ENTRIES)),
    `超限提示必须可解释（实际 ${MAX_ENTRIES + 1} 与上限 ${MAX_ENTRIES} 都要在文案里）：${over.message}`)

  // 恰界 65535（=上限含）：挪走 1 个即过
  fs.renameSync(path.join(dir, 'd00000'), path.join(vault, 'stash', 'd00000'))
  const exact = planExport(vault, 'many')
  assert.equal(exact.ok, true, '65535 条目=上限含，应通过')
  assert.equal(exact.totalEntries, MAX_ENTRIES)
})

// ── fix r1/I2：条目名消毒（组名处）——反斜杠 → _（Windows zip-slip 向量钉死）────────────
test('条目名消毒：反斜杠 → _（..\\..\\x 单段名/含反斜杠目录名全形态）；plan 条目名零反斜杠', async (t) => {
  const vault = makeVault(t)
  touch(path.join(vault, 'dir', 'a\\b.md'), 'AB\n')
  touch(path.join(vault, 'dir', 'x\\..\\..\\evil.md'), 'EVIL\n')
  fs.mkdirSync(path.join(vault, 'dir', 'p\\q'), { recursive: true })
  touch(path.join(vault, 'dir', 'p\\q', 'f.md'), 'F\n')

  const plan = planExport(vault, 'dir')
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.entries.map((x) => x.name), ['a_b.md', 'p_q/', 'p_q/f.md', 'x_.._.._evil.md'])
  for (const e of plan.entries) {
    assert.ok(!e.name.includes('\\'), `条目名零反斜杠（Windows zip-slip 向量钉死）：${JSON.stringify(e.name)}`)
  }
})

// ── fix r1/M4：stat 健壮化——目录内条目 stat 失败（消失/名不可寻址）→ 跳过+留痕，非 500 ────
test('stat 健壮化：非法 UTF-8 文件名（stat 必失败）→ 跳过 + 留痕（symlink 同款语义），预扫不抛 500', async (t) => {
  const vault = makeVault(t)
  const dir = path.join(vault, 'dir')
  touch(path.join(dir, 'ok.md'), 'ok\n')
  // 真非法 UTF-8 文件名（0xFF 字节）：readdir 只见 U+FFFD 替换名，stat 该名必 ENOENT（原无 catch→500）
  const badAbs = Buffer.concat([Buffer.from(`${dir}/`), Buffer.from([0x62, 0xff]), Buffer.from('.md')])
  fs.writeFileSync(badAbs, 'bad\n')

  const plan = planExport(vault, 'dir')
  assert.equal(plan.ok, true, 'stat 失败不许抛（原 500 路径）')
  assert.deepEqual(plan.entries.filter((x) => x.type === 'file').map((x) => x.name), ['ok.md'], '真实文件照常入列')
  assert.equal(plan.skipped.length, 1, `stat 失败必须留痕：${JSON.stringify(plan.skipped)}`)
  assert.ok(plan.skipped[0].includes('跳过'), `留痕语义与 symlink 同款：${plan.skipped[0]}`)
  assert.ok(plan.skipped[0].includes('\uFFFD'), `留痕带条目名（U+FFFD 替换形态）：${JSON.stringify(plan.skipped[0])}`)
})
