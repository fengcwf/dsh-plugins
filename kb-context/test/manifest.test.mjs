// manifest 契约回归（T8-F2 修复波 R-5 改形）：zod 归类锁 dependencies（工作区裁定 2026-09-28）。
// 背景：初版锁 peerDependencies.zod ^4.6.5（T1 Ruling「下界提至实测版本」）；工作区裁定细化后
// **仅 @deepseek-ai/* 走 peer+dev 双声明，zod 等第三方统一进 dependencies**（git 快照安装自动代装）——
// peer 不代装（autoInstallPeers:false），第三方进 peer = 单装即 ERR_MODULE_NOT_FOUND（2026-09-28 e2e 实锤）。
// 说明：只读 manifest（零运行时副作用）；wiki-steward/package.json 为同仓对齐面（测试不入发布 files）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const readJson = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))

test('zod 归类锁 dependencies ^4.6.5（工作区裁定 2026-09-28：第三方统一进 dependencies，下界=实测 .prefault 语义版 4.6.5）', () => {
  const pkg = readJson('../package.json')
  assert.equal(pkg.dependencies?.zod, '^4.6.5', 'zod 必须在 dependencies（git 快照自动代装）')
  assert.equal(pkg.peerDependencies?.zod, undefined, 'zod 不得留在 peerDependencies（peer 不代装 → 单装 ERR_MODULE_NOT_FOUND）')
})

test('zod 版本界按包各判（R-5 波次解耦：wiki-steward 侧随其波同步锁形）', () => {
  const mine = readJson('../package.json')
  const steward = readJson('../../wiki-steward/package.json')
  // kb-context 侧：本波已迁 dependencies（上方同形锁；此处按包各判留对齐面独立证据）
  assert.equal(mine.dependencies?.zod, '^4.6.5', 'kb-context 侧锁 dependencies.zod ^4.6.5')
  assert.equal(mine.peerDependencies?.zod, undefined, 'kb-context 侧 zod 已迁出 peerDependencies')
  // wiki-steward 侧：其波已修正（0.4.1 起 zod 迁入 dependencies）——按本测试预定协议
  // 「其 zod 迁入 dependencies 后，本断言随该波同步改为 dependencies.zod 锁形」执行
  // （2026-09-29 T9-F1 波同步；不删断言、不为绿绕过：照旧双断言=dependencies 有 zod + peer 不得残留）。
  assert.equal(steward.dependencies?.zod, '^4.6.5', 'wiki-steward 侧锁 dependencies.zod ^4.6.5（其波已迁，随波同步）')
  assert.equal(steward.peerDependencies?.zod, undefined, 'wiki-steward 侧 zod 不得留在 peerDependencies（peer 不代装）')
})

test('文档契约（遗留清障⑪-d）：R2 注释撞号改（vaultRoot=Controller 裁定②，R-教训序列号不再复用）', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../lib/index.js', import.meta.url)), 'utf8')
  assert.ok(!src.includes('R2 裁定'), 'R2 撞号引用不得残留（与 R-教训序列 R11/R12/R13… 撞号）')
  assert.match(src, /Controller 裁定②/, 'vaultRoot 出厂默认注记=Controller 裁定②')
})
