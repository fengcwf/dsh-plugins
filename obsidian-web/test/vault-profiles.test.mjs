// vault-profiles — 设置页 vault 目录档案数据面（OW-US-13）：默认当前目录 + 任意已挂载 SMB/NFS 路径
// + 健康检查（可读/可写/延迟三探针）+ 多档案切换语义（T11 交接：热改可解释拒不冒充）。
// 真验零 mock：真 tmp vault/真只读 fs 形态；延迟慢盘形=now 注入（T11 假时钟惯例，测真逻辑非 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listProfiles, addProfile, removeProfile, activateProfile, checkVaultHealth,
  RESTART_MESSAGE, DEFAULT_PROFILE_ID,
} from '../lib/vault-profiles.js'

const TMP = fileURLToPath(new URL('./.tmp-profiles', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

let seq = 0
function makeVault() {
  return fs.mkdtempSync(path.join(TMP, `prof-${seq++}-`))
}

// ── 档案列表/增删（默认当前目录恒在）────────────────────────────────────────────
test('档案形锁定：默认档案=当前目录恒在（isCurrent/removable:false），activeProfileId=default', () => {
  const root = makeVault()
  const { profiles, activeProfileId } = listProfiles(root)
  assert.equal(activeProfileId, DEFAULT_PROFILE_ID)
  assert.equal(profiles.length, 1)
  const [def] = profiles
  assert.deepEqual(Object.keys(def).sort(), ['id', 'isCurrent', 'name', 'path', 'removable'])
  assert.equal(def.id, DEFAULT_PROFILE_ID)
  assert.equal(def.name, '当前目录')
  assert.equal(def.path, path.resolve(root))
  assert.equal(def.isCurrent, true)
  assert.equal(def.removable, false)
})

test('档案增删 roundtrip：add→list 含→remove→list 无；持久化落 .ob-share/vault-profiles.json（0600）', async () => {
  const root = makeVault()
  const smb = '/mnt/smb/vault-2'
  const { profile } = await addProfile(root, { name: 'SMB 仓', path: smb })
  assert.deepEqual(Object.keys(profile).sort(), ['createdAt', 'id', 'name', 'path'])
  assert.equal(profile.name, 'SMB 仓')
  assert.equal(profile.path, smb)
  const again = listProfiles(root)
  assert.equal(again.profiles.length, 2)
  assert.equal(again.profiles[1].id, profile.id)
  assert.equal(again.profiles[1].removable, true)
  assert.equal(again.profiles[1].isCurrent, false)
  // 持久化形（ARC-2：落 vault 文件系统；INV-15 风格 0600 原子写）
  const file = path.join(root, '.ob-share', 'vault-profiles.json')
  assert.ok(fs.existsSync(file), '档案注册表必须落 <vaultRoot>/.ob-share/vault-profiles.json')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  await removeProfile(root, profile.id)
  assert.equal(listProfiles(root).profiles.length, 1, '移除后只剩默认档案')
})

test('档案校验负例：相对路径/NUL/空名/重复路径 bad_request；默认档案不可删；未知 id not_found', async () => {
  const root = makeVault()
  const isBad = (e) => e?.code === 'bad_request'
  await assert.rejects(() => addProfile(root, { name: 'x', path: 'relative/dir' }), isBad)
  await assert.rejects(() => addProfile(root, { name: 'x', path: '/mnt/a\0b' }), isBad)
  await assert.rejects(() => addProfile(root, { name: '  ', path: '/mnt/smb/v' }), isBad)
  await assert.rejects(() => addProfile(root, { name: null, path: '/mnt/smb/v' }), isBad)
  await assert.rejects(() => addProfile(root, { name: 'dup', path: path.resolve(root) }), isBad, '默认根不可重复添加')
  await addProfile(root, { name: 'one', path: '/mnt/smb/one' })
  await assert.rejects(() => addProfile(root, { name: 'two', path: '/mnt/smb/one/' }), isBad, '尾斜杠归一后重复拒')
  await assert.rejects(() => removeProfile(root, DEFAULT_PROFILE_ID), isBad, '默认档案不可删')
  await assert.rejects(() => removeProfile(root, 'nope'), (e) => e?.code === 'not_found')
})

// ── 多档案切换语义（T11 交接：热改可解释拒不冒充）──────────────────────────────
test('切换语义：activate 记录选择 + restartRequired:true 可解释（不冒充热改）；重开读回；删激活档案归 default', async () => {
  const root = makeVault()
  const { profile } = await addProfile(root, { name: 'NFS 仓', path: '/mnt/nfs/vault-3' })
  const res = await activateProfile(root, profile.id)
  assert.deepEqual(Object.keys(res).sort(), ['activeProfileId', 'message', 'restartRequired'])
  assert.equal(res.activeProfileId, profile.id)
  assert.equal(res.restartRequired, true, '运行期 vaultRoot 不热改——切换需重启生效（不冒充已切换）')
  assert.ok(RESTART_MESSAGE.includes('重启'), '提示面必含重启语义')
  assert.ok(RESTART_MESSAGE.includes('外网域名') && RESTART_MESSAGE.includes('各配'), 'T10 提示面：换 vault 各配（外网域名等）')
  assert.equal(res.message, RESTART_MESSAGE)
  // 持久化读回（切换选择不随进程丢）
  assert.equal(listProfiles(root).activeProfileId, profile.id)
  // 删激活档案 → active 归默认（不留悬空指针）
  await removeProfile(root, profile.id)
  assert.equal(listProfiles(root).activeProfileId, DEFAULT_PROFILE_ID)
  // 未知 id → not_found（绝不冒充切换）
  await assert.rejects(() => activateProfile(root, 'nope'), (e) => e?.code === 'not_found')
})

// ── 健康检查三探针（OW-US-13：可读/可写/延迟；CIFS 挂载抖动容忍）──────────────────
test('健康三探针 ok 形：可读/可写全绿 + 延迟实测，键形锁定', () => {
  const target = makeVault()
  const health = checkVaultHealth(target)
  assert.deepEqual(Object.keys(health).sort(), ['latencyMs', 'readable', 'samples', 'status', 'writable'])
  assert.deepEqual(Object.keys(health.readable).sort(), ['error', 'ok'])
  assert.deepEqual(Object.keys(health.writable).sort(), ['error', 'ok'])
  assert.equal(health.readable.ok, true)
  assert.equal(health.writable.ok, true)
  assert.equal(health.readable.error, null)
  assert.equal(typeof health.latencyMs, 'number')
  assert.ok(Array.isArray(health.samples) && health.samples.length >= 1)
  assert.equal(health.status, 'ok')
  // 可写探针零残渣（探针文件已清理）
  assert.deepEqual(fs.readdirSync(target).filter((n) => n.startsWith('.ob-health')), [], '探针零残渣')
})

test('健康三探针不可读形（不存在路径）：readable=false → status=unreachable（挂载掉线/未挂载可解释）', () => {
  const health = checkVaultHealth('/nonexistent-mount-xyz/vault')
  assert.equal(health.readable.ok, false)
  assert.equal(health.status, 'unreachable')
  assert.ok(typeof health.readable.error === 'string' && health.readable.error.length > 0, '错误信息可解释留痕')
})

test('健康三探针可读不可写形（真实只读 fs）：readable=true、writable=false → status=degraded', (t) => {
  // 真验形态构造（零 mock）：优先真实只读 fs（/sys：root 亦拒写）；否则权限形（非 root）。
  let target = null
  try {
    fs.writeFileSync(path.join('/sys', `.ob-health-guard-${process.pid}`), 'x')
    fs.unlinkSync(path.join('/sys', `.ob-health-guard-${process.pid}`))
  } catch {
    if (fs.readdirSync('/sys').length > 0) target = '/sys' // 真只读 fs 形（可读不可写实证）
  }
  if (target === null && process.getuid?.() !== 0) {
    target = fs.mkdtempSync(path.join(TMP, 'ro-'))
    fs.chmodSync(target, 0o555)
  }
  if (target === null) {
    assert.fail('本机无法构造「可读不可写」真实形态（root+可写 /sys）——测试环境缺真实只读 fs')
    return
  }
  t.diagnostic(`可读不可写真验形态：${target}`)
  const health = checkVaultHealth(target)
  assert.equal(health.readable.ok, true, `${target} 应可读`)
  assert.equal(health.writable.ok, false, `${target} 应拒写`)
  assert.equal(health.status, 'degraded')
})

test('健康延迟慢盘形①（now 注入=测真非 mock）：首样超阈 + 重试取优 → 抖动容忍后 status=ok', () => {
  const target = makeVault()
  // 延迟探针 now() 消费序：首样(t0,t1)=5000ms、超阈抖动容忍重试(t0,t1)=80ms
  const seqNow = [0, 5000, 6000, 6080]
  const now = () => seqNow.shift() ?? 0
  const health = checkVaultHealth(target, { now })
  assert.equal(health.readable.ok, true)
  assert.equal(health.writable.ok, true)
  assert.deepEqual(health.samples, [5000, 80], '超阈触发抖动容忍重试（两次样本如实留痕）')
  assert.equal(health.latencyMs, 80, '延迟取优=挂载抖动容忍')
  assert.equal(health.status, 'ok', '抖动容忍后不误报慢盘')
})

test('健康延迟慢盘形②（now 注入）：双样皆超阈 → latencyMs 取优仍慢 → status=degraded（真慢盘如实报）', () => {
  const target = makeVault()
  const seqNow = [0, 5000, 6000, 10500]
  const now = () => seqNow.shift() ?? 0
  const health = checkVaultHealth(target, { now })
  assert.deepEqual(health.samples, [5000, 4500])
  assert.equal(health.latencyMs, 4500)
  assert.equal(health.status, 'degraded')
})

test('健康检查路径围栏：非绝对/空/NUL bad_request（档案路径=已挂载绝对路径语义）', () => {
  for (const p of ['', 'relative/dir', '/mnt/a\0b', null]) {
    assert.throws(() => checkVaultHealth(p), (e) => e?.code === 'bad_request', `路径形未拒：${JSON.stringify(p)}`)
  }
})
