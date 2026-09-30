// migrate.test.mjs — 数据面收口（2026-09-30）：遗留 $DSH_HOME/login-gate/ → plugins/dsh-login-gate/data/
// 语义锁：无遗留=零副作用（不 mkdir）；逐文件新家已有不覆盖；rename 保权限位；迁空 rmdir；幂等可重入。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateLegacyGateData } from '../lib/index.js'

function fakeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dlg-mig-'))
  process.env.DSH_HOME = path.join(home, '.dsh')
  t.after(() => { delete process.env.DSH_HOME })
  return path.join(home, '.dsh')
}

test('无遗留 = 零副作用：新旧目录都不创建', (t) => {
  const dshHome = fakeHome(t)
  const r = migrateLegacyGateData()
  assert.deepEqual(r, { moved: [] })
  assert.ok(!fs.existsSync(path.join(dshHome, 'login-gate')), '旧落点不建')
  assert.ok(!fs.existsSync(path.join(dshHome, 'plugins', 'dsh-login-gate', 'data')), '新家不建（零落盘）')
})

test('secret/accounts/breakglass/users.json/tar 全迁：0600 权限随 inode 保留，迁空旧目录删除，重入幂等', (t) => {
  const dshHome = fakeHome(t)
  const legacy = path.join(dshHome, 'login-gate')
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, 'secret'), 's3cret', { mode: 0o600 })
  fs.writeFileSync(path.join(legacy, 'accounts.txt'), 'acct', { mode: 0o600 })
  fs.writeFileSync(path.join(legacy, 'breakglass.txt'), 'bg')
  fs.writeFileSync(path.join(legacy, 'users.json'), '{}')
  fs.writeFileSync(path.join(legacy, 'last-good-plugin.tar.gz'), 'tgz')
  const r = migrateLegacyGateData()
  assert.deepEqual(r.moved.sort(), ['accounts.txt', 'breakglass.txt', 'last-good-plugin.tar.gz', 'secret', 'users.json'])
  const target = path.join(dshHome, 'plugins', 'dsh-login-gate', 'data')
  assert.equal(fs.readFileSync(path.join(target, 'secret'), 'utf8'), 's3cret')
  assert.equal(fs.statSync(path.join(target, 'secret')).mode & 0o777, 0o600, '0600 权限位保留')
  assert.equal(fs.readFileSync(path.join(target, 'users.json'), 'utf8'), '{}')
  assert.ok(!fs.existsSync(legacy), '迁空旧目录删除')
  assert.deepEqual(migrateLegacyGateData(), { moved: [] }, '重入幂等')
})

test('逐文件新家已有=不覆盖（secret 防旧副本反灌），其余照迁', (t) => {
  const dshHome = fakeHome(t)
  const legacy = path.join(dshHome, 'login-gate')
  const target = path.join(dshHome, 'plugins', 'dsh-login-gate', 'data')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'secret'), 'fresh-secret')
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, 'secret'), 'stale-secret')
  fs.writeFileSync(path.join(legacy, 'accounts.txt'), 'acct')
  const r = migrateLegacyGateData()
  assert.deepEqual(r.moved, ['accounts.txt'])
  assert.equal(fs.readFileSync(path.join(target, 'secret'), 'utf8'), 'fresh-secret', '新家 secret 不被覆盖')
  assert.equal(fs.readFileSync(path.join(legacy, 'secret'), 'utf8'), 'stale-secret', '旧副本留原地')
})
