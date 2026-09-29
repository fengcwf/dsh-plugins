// dsh-login-gate — lib/users.js 账号模块扩展用例（Task 10）
// 覆盖：generateHash 参数/格式复用 auth.js、原子写（临时文件+rename）、进程内写串行化、
//       CRUD、deleteUser 防自锁、返回值/错误信息永不包含哈希（INV-3）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { generateHash, addUser, updatePassword, deleteUser, loadUsers } from '../lib/users.js'
import { hashPassword, verifyPassword, SCRYPT_PREFIX } from '../lib/auth.js'

// 注意：故意不预建 nested 父目录——CRUD 用例因此真实行使 atomicWriteUsers 的 mkdir（目录自动创建）
function tmpUsersFile(t, sub = 'nested') {
  const dir = mkdtempSync(join(tmpdir(), 'dlg-users-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, sub, 'users.json')
}

const readData = (file) => JSON.parse(readFileSync(file, 'utf8'))

test('generateHash：async API，参数/格式与 auth.js hashPassword 完全一致且可校验', async () => {
  const pending = generateHash('pw-1')
  assert.ok(pending instanceof Promise, 'generateHash 应返回 Promise')
  const hash = await pending

  // 格式 = scrypt$N$r$p$saltB64url$hashB64url，参数与 auth.js SCRYPT_PARAMS 逐字一致
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/)
  assert.ok(hash.startsWith(SCRYPT_PREFIX))
  const ref = hashPassword('pw-1')
  assert.equal(hash.split('$').slice(0, 4).join('$'), ref.split('$').slice(0, 4).join('$'), 'N$r$p 参数应与 auth.js 输出一致')

  assert.equal(verifyPassword('pw-1', hash), true)
  assert.equal(verifyPassword('pw-2', hash), false)
})

test('generateHash：空密码/非字符串拒绝', async () => {
  await assert.rejects(() => generateHash(''), /密码必须为非空字符串/)
  await assert.rejects(() => generateHash(undefined), /密码必须为非空字符串/)
  await assert.rejects(() => generateHash(123), /密码必须为非空字符串/)
})

test('addUser：原子写 usersFile——目录自动创建、0600、格式可被 loadUsers 消化、无临时文件残留', async (t) => {
  const file = tmpUsersFile(t)
  assert.ok(!existsSync(dirname(file)), '预检：父目录应不存在（验证 mkdir 自动创建）')
  const res = await addUser('alice', 'pw-alice', { usersFile: file })
  assert.deepEqual(res, { ok: true, user: 'alice' })

  const data = readData(file)
  assert.deepEqual(Object.keys(data), ['alice'])
  assert.equal(verifyPassword('pw-alice', data.alice), true, '落盘值应为可校验的 scrypt$ 哈希')
  assert.equal((statSync(file).mode & 0o777), 0o600, 'usersFile 权限应为 0600')
  assert.deepEqual(readdirSync(dirname(file)), ['users.json'], '不应残留 .tmp 临时文件')

  const { users, warnings } = loadUsers({ usersFile: file })
  assert.equal(verifyPassword('pw-alice', users.alice), true)
  assert.deepEqual(warnings, [], 'CRUD 写入的文件不应触发迁移警告')
})

test('addUser：拒绝重名/空名/空密码，返回值与错误信息不含哈希（INV-3）', async (t) => {
  const file = tmpUsersFile(t)
  await addUser('alice', 'pw-alice', { usersFile: file })
  const stored = readData(file).alice

  await assert.rejects(() => addUser('alice', 'pw-other', { usersFile: file }), (e) => {
    assert.match(e.message, /已存在/)
    assert.ok(!e.message.includes(SCRYPT_PREFIX) && !e.message.includes(stored), '错误信息不得包含哈希')
    return true
  })
  await assert.rejects(() => addUser('', 'pw', { usersFile: file }), /用户名不能为空/)
  await assert.rejects(() => addUser('bob', '', { usersFile: file }), /密码必须为非空字符串/)

  // 重名被拒后文件不变
  assert.deepEqual(Object.keys(readData(file)), ['alice'])
  assert.equal(readData(file).alice, stored)
})

test('updatePassword：换密后新密码可校验/旧密码失效，其他条目不动；不存在的用户拒绝', async (t) => {
  const file = tmpUsersFile(t)
  await addUser('alice', 'pw-old', { usersFile: file })
  await addUser('bob', 'pw-bob', { usersFile: file })
  const bobHash = readData(file).bob

  const res = await updatePassword('alice', 'pw-new', { usersFile: file })
  assert.deepEqual(res, { ok: true, user: 'alice' })

  const data = readData(file)
  assert.equal(verifyPassword('pw-new', data.alice), true)
  assert.equal(verifyPassword('pw-old', data.alice), false)
  assert.equal(data.bob, bobHash, '不应动其他用户')
  assert.deepEqual(readdirSync(dirname(file)), ['users.json'])

  await assert.rejects(() => updatePassword('nobody', 'pw', { usersFile: file }), (e) => {
    assert.match(e.message, /不存在/)
    assert.ok(!e.message.includes(SCRYPT_PREFIX), '错误信息不得包含哈希')
    return true
  })
  await assert.rejects(() => updatePassword('', 'pw', { usersFile: file }), /用户名不能为空/)
  await assert.rejects(() => updatePassword('alice', '', { usersFile: file }), /密码必须为非空字符串/)
})

test('deleteUser：删除目标用户并保留其他条目', async (t) => {
  const file = tmpUsersFile(t)
  await addUser('alice', 'pw-a', { usersFile: file })
  await addUser('bob', 'pw-b', { usersFile: file })

  const res = await deleteUser('bob', 'alice', { usersFile: file })
  assert.deepEqual(res, { ok: true, user: 'alice' })
  assert.deepEqual(Object.keys(readData(file)), ['bob'])
  assert.deepEqual(readdirSync(dirname(file)), ['users.json'])
})

test('deleteUser：防自锁——拒删当前登录账号，且文件不变', async (t) => {
  const file = tmpUsersFile(t)
  await addUser('alice', 'pw-a', { usersFile: file })
  const before = readFileSync(file, 'utf8')

  await assert.rejects(() => deleteUser('alice', 'alice', { usersFile: file }), (e) => {
    assert.match(e.message, /防自锁|不能删除当前登录账号/)
    assert.ok(!e.message.includes(SCRYPT_PREFIX), '错误信息不得包含哈希')
    return true
  })
  assert.equal(readFileSync(file, 'utf8'), before, '自锁拒绝后 usersFile 应逐字不变')
})

test('deleteUser：缺当前登录账号名一律拒删（fail-closed），不存在的目标拒绝', async (t) => {
  const file = tmpUsersFile(t)
  await addUser('alice', 'pw-a', { usersFile: file })
  const before = readFileSync(file, 'utf8')

  await assert.rejects(() => deleteUser('', 'alice', { usersFile: file }), /当前登录账号/)
  await assert.rejects(() => deleteUser(undefined, 'alice', { usersFile: file }), /当前登录账号/)
  await assert.rejects(() => deleteUser('bob', 'nobody', { usersFile: file }), /不存在/)
  assert.equal(readFileSync(file, 'utf8'), before, '拒绝路径不得写文件')
})

test('写串行化：10 个并发 addUser 全部落盘，读-改-写不丢条目', async (t) => {
  const file = tmpUsersFile(t)
  const names = Array.from({ length: 10 }, (_, i) => `user${i}`)
  const results = await Promise.all(names.map((n) => addUser(n, `pw-${n}`, { usersFile: file })))
  assert.equal(results.length, 10)
  for (const r of results) assert.equal(r.ok, true)

  const data = readData(file)
  assert.deepEqual(Object.keys(data).sort(), [...names].sort(), '并发写不得丢条目')
  assert.deepEqual(readdirSync(dirname(file)), ['users.json'])
})

test('写串行化：同名并发 addUser 仅一个成功（临界区内重读文件）', async (t) => {
  const file = tmpUsersFile(t)
  const settled = await Promise.allSettled(
    Array.from({ length: 5 }, () => addUser('racer', 'pw-racer', { usersFile: file })),
  )
  const fulfilled = settled.filter((s) => s.status === 'fulfilled')
  const rejected = settled.filter((s) => s.status === 'rejected')
  assert.equal(fulfilled.length, 1, '同名并发只应有一个成功')
  assert.equal(rejected.length, 4)
  for (const r of rejected) assert.match(r.reason.message, /已存在/)
  assert.deepEqual(Object.keys(readData(file)), ['racer'])
})

test('坏 usersFile：错误信息不得泄漏文件内容/哈希（INV-3，覆盖非法 JSON + 数组/null JSON 路径）', async (t) => {
  const file = tmpUsersFile(t)
  mkdirSync(dirname(file), { recursive: true })
  const secretHash = await generateHash('pw-secret')
  // Node 的 JSON.parse 错误会内嵌输入摘录（如 `scrypt$163`）——前缀与前 10 字符都要断言
  const leaks = (msg) =>
    msg.includes(SCRYPT_PREFIX) || msg.includes(secretHash) || msg.includes(secretHash.slice(0, 10))

  // ① 非法 JSON（正文就是哈希原文）
  writeFileSync(file, secretHash, { mode: 0o600 })
  await assert.rejects(() => addUser('bob', 'pw', { usersFile: file }), (e) => {
    assert.match(e.message, /解析失败/)
    assert.ok(!leaks(e.message), `错误信息泄漏哈希：${e.message}`)
    return true
  })

  // ② 数组 JSON（格式非法分支）
  writeFileSync(file, JSON.stringify([secretHash]), { mode: 0o600 })
  await assert.rejects(() => addUser('bob', 'pw', { usersFile: file }), (e) => {
    assert.match(e.message, /格式非法/)
    assert.ok(!leaks(e.message), `错误信息泄漏哈希：${e.message}`)
    return true
  })

  // ③ null JSON（同一格式非法分支，走 deleteUser 路径）
  writeFileSync(file, 'null', { mode: 0o600 })
  await assert.rejects(() => deleteUser('ann', 'bob', { usersFile: file }), (e) => {
    assert.match(e.message, /格式非法/)
    assert.ok(!leaks(e.message), `错误信息泄漏哈希：${e.message}`)
    return true
  })
})

test('loadUsers：坏 usersFile 的 warning 不泄漏哈希（INV-3，含不可读路径）', async (t) => {
  const file = tmpUsersFile(t)
  mkdirSync(dirname(file), { recursive: true })
  const secretHash = await generateHash('pw-secret')
  const leaks = (msg) =>
    msg.includes(SCRYPT_PREFIX) || msg.includes(secretHash) || msg.includes(secretHash.slice(0, 10))

  // ① 非法 JSON（正文=哈希原文）→ 解析失败 warning
  writeFileSync(file, secretHash, { mode: 0o600 })
  const w1 = loadUsers({ usersFile: file }).warnings
  assert.equal(w1.length, 1)
  assert.match(w1[0], /解析失败/)
  assert.ok(!leaks(w1[0]), `warning 泄漏哈希：${w1[0]}`)

  // ② null JSON（Object.entries 抛错路径）
  writeFileSync(file, 'null', { mode: 0o600 })
  const w2 = loadUsers({ usersFile: file }).warnings
  assert.equal(w2.length, 1)
  assert.ok(!leaks(w2[0]), `warning 泄漏哈希：${w2[0]}`)

  // ③ usersFile 是目录（readFileSync 失败路径）
  rmSync(file, { force: true })
  mkdirSync(file, { recursive: true })
  const w3 = loadUsers({ usersFile: file }).warnings
  assert.equal(w3.length, 1)
  assert.match(w3[0], /读取失败/)
  assert.ok(!leaks(w3[0]), `warning 泄漏哈希：${w3[0]}`)
})
