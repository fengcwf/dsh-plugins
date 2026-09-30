// dsh-login-gate — 用户账号模块：加载（config.users ∪ usersFile，文件优先）+ 账号 CRUD 写入
// 文件缺省 <插件数据目录>/users.json（0600，2026-09-30 数据面收口：$DSH_HOME/login-gate/ 已废弃），
// JSON 格式 {"用户名": "scrypt$..."}
import { existsSync, readFileSync, statSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { hashPassword, SCRYPT_PREFIX } from './auth.js'

// 缺省落点（与 index.js gateDir() 同口径——两处各持一份避免循环导入）
export function defaultUsersFile() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'dsh-login-gate', 'data', 'users.json')
}

/** 归一 usersFile 参数：空值 → 缺省文件；~ 前缀展开为 home */
const resolveUsersFile = (usersFile) =>
  usersFile && String(usersFile).trim() ? String(usersFile).replace(/^~(?=\/)/, homedir()) : defaultUsersFile()

/**
 * 合并账号表。返回 { users: {name: stored}, warnings: [] }
 * - usersFile 里的条目覆盖 config.users 同名项
 * - 明文密码仍可校验（legacy 兼容），但产生迁移警告
 * - 空用户名/空值条目跳过
 */
export function loadUsers({ users = {}, usersFile } = {}) {
  const out = {}
  const warnings = []
  const file = resolveUsersFile(usersFile)

  for (const [k, v] of Object.entries(users ?? {})) {
    const name = String(k ?? '').trim()
    if (!name || !v) continue
    out[name] = String(v)
  }

  if (file && existsSync(file)) {
    // 警告文案同样只留 e.name——JSON.parse 错误自带输入摘录，插值 e.message 会把哈希片段
    // 带进 warning（上屏/进日志即泄漏，INV-3），与 mutateUsers 的错误路径同法
    let raw = null
    try {
      raw = readFileSync(file, 'utf8')
    } catch (e) {
      warnings.push(`usersFile 读取失败（${file}）：${e.name}`)
    }
    if (raw !== null) {
      try {
        const data = JSON.parse(raw)
        for (const [k, v] of Object.entries(data)) {
          const name = String(k ?? '').trim()
          if (!name || !v) continue
          out[name] = String(v)
        }
      } catch (e) {
        warnings.push(`usersFile 解析失败（${file}）：不是合法 JSON（${e.name}）`)
      }
    }
  }

  for (const [name, stored] of Object.entries(out)) {
    if (!String(stored).startsWith(SCRYPT_PREFIX)) {
      warnings.push(`用户「${name}」的密码为明文存储，建议执行 node tools/hash-password.mjs 迁移为 scrypt$... 格式`)
    }
  }

  return { users: out, warnings, usersFile: file }
}

/**
 * 账号表供给器（热加载）：每次登录时按 usersFile 的 mtime 决定是否重新读取合并，
 * 因此 tools/hash-password.mjs --write 写入新用户后无需重启 dsh（dsh-gateway"配置热生效"同款体验）。
 * @returns {() => Record<string,string>} 返回当前账号表
 */
export function createUserProvider({ users = {}, usersFile } = {}) {
  const file = resolveUsersFile(usersFile)
  let cached = null
  let cachedMtime = -1
  return () => {
    let mtime = -1
    try { mtime = existsSync(file) ? statSync(file).mtimeMs : -1 } catch { mtime = -1 }
    if (cached && mtime === cachedMtime) return cached
    const { users: merged } = loadUsers({ users, usersFile: file })
    cached = merged
    cachedMtime = mtime
    return cached
  }
}

// ── 账号写入：原子写（临时文件+rename）+ 进程内 Promise 链串行化 + CRUD ──────────
// 约定：所有成功返回 { ok: true, user }，失败 throw/reject——返回值与错误信息
// 一律不含哈希字符串（INV-3）；哈希只落盘 usersFile。

let writeChain = Promise.resolve()

/** 进程内串行化写操作：所有读-改-写互斥执行（上一操作成败都不阻塞队列） */
function withWriteLock(fn) {
  const run = writeChain.then(fn)
  writeChain = run.then(() => undefined, () => undefined)
  return run
}

/** 原子写 usersFile：同目录临时文件 → rename 替换；失败清理临时文件 */
async function atomicWriteUsers(file, data) {
  const dir = dirname(file)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
    await rename(tmp, file)
    try { await chmod(file, 0o600) } catch { /* Windows 等平台忽略 */ }
  } catch (e) {
    try { await unlink(tmp) } catch { /* 清理尽力而为 */ }
    throw e
  }
}

/** 读-改-写 usersFile：临界区内重读文件 → mutate(data) → 原子替换 */
function mutateUsers(usersFile, mutate) {
  const file = resolveUsersFile(usersFile)
  return withWriteLock(async () => {
    let data = {}
    if (existsSync(file)) {
      // 错误信息只留 e.name，禁止插值 e.message——Node 的 JSON.parse 错误会内嵌输入摘录
      // （如 `Unexpected token 's', "scrypt$163"... is not valid JSON`），直接泄漏哈希片段（INV-3）
      let raw
      try {
        raw = await readFile(file, 'utf8')
      } catch (e) {
        throw new Error(`usersFile 读取失败（${file}）：${e.name}`)
      }
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        throw new Error(`usersFile 解析失败（${file}）：不是合法 JSON（${e.name}）`)
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`usersFile 格式非法（${file}）：应为 JSON 对象`)
      }
      // 拷到无原型对象：防 "__proto__" 这类用户名踩 Object 原型 setter
      data = Object.assign(Object.create(null), parsed)
    }
    const user = mutate(data)
    await atomicWriteUsers(file, data)
    return { ok: true, user }
  })
}

/**
 * 生成密码哈希（async API）。复用 lib/auth.js 的 hashPassword——scrypt 参数与
 * `scrypt$N$r$p$saltB64url$hashB64url` 格式单源，永无漂移（auth.js 未导出参数常量，
 * 另行复制参数就存在两处不同步的风险）。返回值即哈希本身，只供落盘/校验，
 * 严禁进入响应/错误信息（INV-3）。
 */
export async function generateHash(password) {
  if (typeof password !== 'string' || !password) throw new Error('密码必须为非空字符串')
  return hashPassword(password)
}

/** 新增账号写入 usersFile；同名已存在则拒绝。成功返回 { ok: true, user } */
export async function addUser(name, password, { usersFile } = {}) {
  const user = String(name ?? '').trim()
  if (!user) throw new Error('用户名不能为空')
  const hash = await generateHash(password)
  return mutateUsers(usersFile, (data) => {
    if (Object.hasOwn(data, user)) throw new Error(`用户「${user}」已存在`)
    data[user] = hash
    return user
  })
}

/** 修改密码（目标必须已存在于 usersFile）。成功返回 { ok: true, user } */
export async function updatePassword(name, password, { usersFile } = {}) {
  const user = String(name ?? '').trim()
  if (!user) throw new Error('用户名不能为空')
  const hash = await generateHash(password)
  return mutateUsers(usersFile, (data) => {
    if (!Object.hasOwn(data, user)) throw new Error(`用户「${user}」不存在`)
    data[user] = hash
    return user
  })
}

/**
 * 删除账号（防自锁）：currentName = 当前登录账号名（Task 11 路由从会话传入），
 * 与 targetName 相同或缺失一律拒删（fail-closed）。成功返回 { ok: true, user }。
 */
export async function deleteUser(currentName, targetName, { usersFile } = {}) {
  const current = String(currentName ?? '').trim()
  const target = String(targetName ?? '').trim()
  if (!target) throw new Error('用户名不能为空')
  if (!current) throw new Error('缺少当前登录账号名（防自锁，由调用方传入），拒删')
  if (current === target) throw new Error(`不能删除当前登录账号「${target}」（防自锁）`)
  return mutateUsers(usersFile, (data) => {
    if (!Object.hasOwn(data, target)) throw new Error(`用户「${target}」不存在`)
    delete data[target]
    return target
  })
}
