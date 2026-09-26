// manifest 契约回归（T1 发版纪律 + 依赖形态）：只读 manifest，零运行时副作用。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const readJson = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
const readText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

test('零第三方运行时依赖：dependencies 不得存在（zod/dsh 全走 peer+dev 双声明）', () => {
  const pkg = readJson('../package.json')
  assert.deepEqual(pkg.dependencies ?? {}, {})
  for (const name of ['zod', '@deepseek-ai/dsh-atomic-write', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']) {
    assert.ok(pkg.peerDependencies?.[name], `${name} 必须在 peerDependencies`)
    assert.ok(pkg.devDependencies?.[name], `${name} 必须在 devDependencies（独立测试副本）`)
  }
})

test('zod peer 钉 ^4.6.5（T1 Ruling 兑现：下界=实测 .prefault 语义版 4.6.5）', () => {
  const pkg = readJson('../package.json')
  assert.equal(pkg.peerDependencies?.zod, '^4.6.5')
})

test('manifest：dsh.bundle.patch 指向真实文件且 patch 行 name == 包名', () => {
  const pkg = readJson('../package.json')
  const patch = pkg.dsh?.bundle?.patch
  assert.equal(patch, './cordis.patch.yml')
  const yml = readText('../cordis.patch.yml')
  assert.match(yml, new RegExp(`name:\\s*'${pkg.name}'`), 'patch 行 name 与包名一致（否则层不生效）')
})

test('发版纪律：version 0.1.0 + CHANGELOG ## 0.1.0 + README 三段（用途/安装钉版本/配置）', () => {
  const pkg = readJson('../package.json')
  assert.equal(pkg.version, '0.1.0')
  assert.match(readText('../CHANGELOG.md'), /^## 0\.1\.0/m, 'CHANGELOG 必须含 ## 0.1.0')
  const readme = readText('../README.md')
  for (const heading of ['用途', '安装', '配置']) {
    assert.match(readme, new RegExp(`^## .*${heading}`, `m`), `README 缺「${heading}」段`)
  }
  assert.match(readme, /obsidian-web-v0\.1\.0/, '安装段必须钉版本 tag（安装钉版本）')
})
