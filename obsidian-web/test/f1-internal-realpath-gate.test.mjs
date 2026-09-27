// F1 内部段/.trash 保护 realpath 前缀判定（终审 fix-wave）：OW-INV-7「永不可经分享面触达」不变量。
// 缺口（final-probes.md §5）：内部段/.trash 保护全是名字级判定（isInternalSegment / 词法 in-trash 前缀），
// 而 realpath 围栏按裁定放行 in-root 中间段目录别名解引用（OW-INV-7⑨）——组合后 in-root 目录别名
// （→.ob-share/.trash）可绕过「永不可经分享面触达」。
// 修法=内部段/.trash 保护升格 realpath 前缀判定（新增咽喉，与名字级判定并存不替换）——
//   读写面（readNote/createNote/saveNote/renameNote）把最终真实节点与 <rootReal>/.ob-share、
//   <rootReal>/.trash 前缀比对即拒；deletePath in-trash 门、export.planExport in-trash 门同改。
//   必须保住 OW-INV-7⑨：普通 in-root 目录别名解引用照常放行，仅内部段落点拒。
//   T6 大小写 FS 词法绕过随闭（realpath 归一后比对，两侧 toLowerCase 同口径）。
// 真验零 mock：真 fs（tmp vault 真建 symlink/真写盘）、真 scrypt（hashPassword 真算）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deletePath, readNote, createNote, saveNote, renameNote,
} from '../lib/vault-ops.js'
import { planExport } from '../lib/export.js'
import { createShare, checkAccess, generateToken, hashPassword, resolveSharePath } from '../lib/share.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-f1-gate', import.meta.url))

function tmpVault(t, files = {}) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content, 'utf8')
  }
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

// ── 链①：deletePath in-trash 门 realpath 判定（alias→.trash 同判 in-trash）──────────
test('F1① deletePath 经 in-root 目录别名（→.trash）同拒 in-trash（恢复材料不移位）', async (t) => {
  const root = tmpVault(t, { '.trash/recovery.md': 'RECOVERABLE\n', 'notes/a.md': '# A\n' })
  fs.symlinkSync(path.join(root, '.trash'), path.join(root, 'alias'))
  const r = await deletePath(root, 'alias/recovery.md', { confirm: 'alias/recovery.md' })
  assert.equal(r.ok, false, '别名触达 .trash 必须拒（不得 ok:true 移出恢复材料）')
  assert.equal(r.reason, 'in-trash', '与直接形同形拒因 in-trash')
  assert.equal(fs.existsSync(path.join(root, '.trash', 'recovery.md')), true, '恢复材料原位保留')
  // 直接形回归锁
  const r2 = await deletePath(root, '.trash/recovery.md', { confirm: '.trash/recovery.md' })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'in-trash', '直接形 .trash 仍拒 in-trash')
})

test('F1① 深层别名（notes/alias→.trash）deletePath 同拒 in-trash', async (t) => {
  const root = tmpVault(t, { '.trash/notes/a.md': 'RECOVER\n', 'notes/x.md': '# X\n' })
  fs.symlinkSync(path.join(root, '.trash'), path.join(root, 'notes', 'alias'))
  const r = await deletePath(root, 'notes/alias/notes/a.md', { confirm: 'notes/alias/notes/a.md' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'in-trash')
  assert.equal(fs.existsSync(path.join(root, '.trash', 'notes', 'a.md')), true)
})

// ── 链②：readNote 经 in-root 目录别名（→.ob-share）拒读分享存储 ───────────────────
test('F1② readNote 经别名（→.ob-share）拒读分享存储（含 passwordHash 不泄）', async (t) => {
  const root = tmpVault(t, { 'notes/a.md': '# A\n' })
  const { share } = await createShare(root, { target: 'notes', role: 'write', password: 'pw-1' })
  fs.symlinkSync(path.join(root, '.ob-share'), path.join(root, 'notes', 'alias'))
  // routing 仍是词法（resolveSharePath 名字级并存），但读写面 realpath 咽喉拒
  assert.doesNotThrow(() => {
    const res = resolveSharePath(share, `alias/${share.token}.json`)
    assert.equal(res.ok, true, '词法路由仍放行（名字级判定并存，非替换）')
  })
  assert.throws(
    () => readNote(root, `notes/alias/${share.token}.json`),
    (err) => err.code === 'bad_request',
    '读写面 realpath 咽喉拒（不得读到 .ob-share/<token>.json）',
  )
})

// ── 链③：createNote 经别名（→.ob-share）拒落伪造条目 → checkAccess 不越权 ──────────
test('F1③ createNote 经别名（→.ob-share）拒落伪造条目；checkAccess(伪造) 不越权', async (t) => {
  const root = tmpVault(t, { 'notes/a.md': '# A\n' })
  await createShare(root, { target: 'notes', role: 'write', password: 'pw-1' })
  fs.symlinkSync(path.join(root, '.ob-share'), path.join(root, 'notes', 'alias'))
  const forged = generateToken()
  const forgedPw = 'forged-pw-9'
  const forgedEntry = {
    token: forged, target: 'notes', targetType: 'dir', role: 'write',
    passwordHash: hashPassword(forgedPw), expiresAt: null, oneShot: false,
    revoked: false, createdAt: Date.now(), accessCount: 0, lastAccessAt: null, revokedAt: null, consumedAt: null,
  }
  await assert.rejects(
    () => createNote(root, `notes/alias/${forged}.json`, JSON.stringify(forgedEntry, null, 2)),
    (err) => err.code === 'bad_request',
    '伪造条目经别名落 .ob-share 必须拒',
  )
  assert.equal(fs.existsSync(path.join(root, '.ob-share', `${forged}.json`)), false, '伪造条目不得落位 .ob-share')
  const acc = await checkAccess(root, { token: forged, password: forgedPw, ip: '10.0.0.9' })
  assert.equal(acc.ok, false, 'checkAccess(伪造 token) 不得 ok:true 越权')
  assert.equal(fs.existsSync(path.join(root, 'notes', 'PWNED.md')), false, '不得越权建 notes/PWNED.md')
})

// ── 写面同喉：saveNote / renameNote 经别名（→.ob-share/.trash）拒 ─────────────────
test('F1 写面 saveNote/renameNote 经别名（→.ob-share）拒（bad_request）', async (t) => {
  const root = tmpVault(t, { 'notes/a.md': '# A\n', '.ob-share/seed.json': '{}' }) // .ob-share 存在（分享存储自身）
  fs.symlinkSync(path.join(root, '.ob-share'), path.join(root, 'notes', 'alias'))
  await assert.rejects(() => saveNote(root, 'notes/alias/x.md', 'X', { expectedMtime: 1 }), (err) => err.code === 'bad_request')
  await assert.rejects(() => renameNote(root, 'notes/alias/x.md', 'notes/alias/y.md'), (err) => err.code === 'bad_request')
  await assert.rejects(() => renameNote(root, 'notes/a.md', 'notes/alias/z.md'), (err) => err.code === 'bad_request', 'rename 目标经别名落 .ob-share 同拒')
})

// ── 链④：export.planExport in-trash 门 realpath 判定（alias→.trash 同拒）──────────
test('F1④ planExport 经别名（→.trash）同拒 in-trash', (t) => {
  const root = tmpVault(t, { '.trash/recov.md': 'RECOVER\n', 'notes/a.md': '# A\n' })
  fs.symlinkSync(path.join(root, '.trash'), path.join(root, 'alias'))
  const plan = planExport(root, 'alias/recov.md')
  assert.equal(plan.ok, false)
  assert.equal(plan.reason, 'in-trash', '别名触达 .trash 导出同拒 in-trash')
  // 直接形回归锁
  const plan2 = planExport(root, '.trash/recov.md')
  assert.equal(plan2.ok, false)
  assert.equal(plan2.reason, 'in-trash')
})

// ── 正例零回退（OW-INV-7⑨）：普通 in-root 目录别名解引用照常放行 ───────────────────
test('OW-INV-7⑨ 正例零回退：普通 in-root 目录别名 readNote/createNote/planExport 照常', async (t) => {
  const root = tmpVault(t, { 'sub/b/real.md': '# REAL\n' })
  fs.symlinkSync(path.join(root, 'sub', 'b'), path.join(root, 'a'))
  assert.equal(readNote(root, 'a/real.md').content, '# REAL\n', '普通目录别名读到真实内容')
  const c = await createNote(root, 'a/new.md', '# NEW\n')
  assert.equal(c.ok, true, '普通目录别名新建放行')
  assert.equal(fs.readFileSync(path.join(root, 'sub', 'b', 'new.md'), 'utf8'), '# NEW\n', '写入落真实节点')
  const plan = planExport(root, 'a/real.md')
  assert.equal(plan.ok, true, '普通目录别名导出放行')
  const before = readNote(root, 'a/real.md')
  const s = await saveNote(root, 'a/real.md', '# UPD\n', { etag: before.etag })
  assert.equal(s.ok ?? true, true, '普通目录别名保存放行')
})

// ── T6 大小写 FS 词法绕过随闭（realpath 归一后比对，大小写别名形同拒）──────────────
test('T6 大小写别名形（→.trash/.ob-share）realpath 落点同拒', async (t) => {
  const root = tmpVault(t, { '.trash/recov.md': 'RECOVER\n', 'notes/a.md': '# A\n' })
  fs.symlinkSync(path.join(root, '.trash'), path.join(root, 'notes', 'ALIAS'))
  const r = await deletePath(root, 'notes/ALIAS/recov.md', { confirm: 'notes/ALIAS/recov.md' })
  assert.equal(r.ok, false, '大小写别名（→.trash）deletePath 同拒')
  assert.equal(fs.existsSync(path.join(root, '.trash', 'recov.md')), true, '恢复材料原位保留')
  const plan = planExport(root, 'notes/ALIAS/recov.md')
  assert.equal(plan.ok, false)
  assert.equal(plan.reason, 'in-trash', '大小写别名（→.trash）planExport 同拒 in-trash')
})
