// manifest 契约回归（T1 发版纪律 + 依赖形态）：只读 manifest，零运行时副作用。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const readJson = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
const readText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// 依赖白名单（2026-09-26 裁定续）：lib 零第三方被「渲染管线族白名单」显式豁免——
// remark/unified/rehype/micromark 族及必要插件为白名单运行时依赖（ARC-1 精神=唯一源非自研）；
// 白名单之外仍然零第三方。zod/dsh 共享包照旧 peer+dev 双声明。
const PIPELINE_WHITELIST = new Set([
  'unified',
  'remark-parse',
  'remark-rehype',
  'remark-frontmatter',
  'remark-gfm',
  'remark-breaks',
  'rehype-stringify',
  'rehype-sanitize',
])

test('依赖白名单：dependencies 仅限渲染管线族（白名单外零第三方），zod/dsh 全走 peer+dev 双声明', () => {
  const pkg = readJson('../package.json')
  assert.ok(Object.keys(pkg.dependencies ?? {}).length > 0, '渲染管线族应显式声明为运行时依赖')
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    assert.ok(PIPELINE_WHITELIST.has(name), `白名单外运行时依赖：${name}（白名单=渲染管线族，2026-09-26 裁定）`)
  }
  for (const name of ['zod', '@deepseek-ai/dsh-atomic-write', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']) {
    assert.ok(pkg.peerDependencies?.[name], `${name} 必须在 peerDependencies`)
    assert.ok(pkg.devDependencies?.[name], `${name} 必须在 devDependencies（独立测试副本）`)
    assert.ok(!pkg.dependencies?.[name], `${name} 走 peer+dev 双声明，不得进 dependencies`)
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

test('发版纪律：version 0.1.1 + CHANGELOG ## 0.1.1 + README 三段（用途/安装钉版本/配置）+ 发版检查清单（发版级机械锁：src/dist 同批由 check-release 把关）', () => {
  const pkg = readJson('../package.json')
  assert.equal(pkg.version, '0.1.1')
  assert.match(readText('../CHANGELOG.md'), /^## 0\.1\.1/m, 'CHANGELOG 必须含 ## 0.1.1')
  const readme = readText('../README.md')
  for (const heading of ['用途', '安装', '配置']) {
    assert.match(readme, new RegExp(`^## .*${heading}`, `m`), `README 缺「${heading}」段`)
  }
  assert.match(readme, /obsidian-web-v0\.1\.1/, '安装段必须钉版本 tag（安装钉版本）')
  // T2 交接检查项增补（T14 收口）+ fix r1 口径降格：清单文案=「发版级机械锁：src/dist 同批由 check-release 把关」
  // —— 本断言只锁文案（如实标注）；真实新鲜度锁=check-release.sh commit 级校验，行为面由
  //    check-release-dist-freshness.test.mjs 真 git 仓真验（src 变更无 dist 变更必红）。
  assert.match(readme, /发版检查清单/, 'README 缺「发版检查清单」段')
  assert.match(readme, /发版级机械锁：src\/dist 同批由 check-release 把关/, '发版清单必须写明发版级机械锁口径（src/dist 同批由 check-release 把关）')
  assert.match(readme, /dist 与源码同 commit/, '发版清单必须含「dist 与源码同 commit」检查项（T2 交接）')
  assert.match(readme, /extract-token-snapshot/, '发版清单必须含 token 快照刷新义务（T13 交接）')
})
