// manifest 契约回归（终审 fix-wave ②）：zod peer 下界 T1 Ruling 兑现。
// 背景（task-8 报告「对齐⑤」）：wiki-steward 首建即 zod peer ^4.6.5（Ruling「下界提至实测版本」——
// lib/index.js 嵌套对象 `.prefault({})` 语义在 zod 实测版 4.6.5 上验证，peer 下界不得低于实测版），
// kb-context 存量 ^4.3.6 暂不同步，随终审 fix 波统一——本文件把该 Ruling 钉成契约回归。
// 说明：只读 manifest（零运行时副作用）；wiki-steward/package.json 为同仓对齐面（测试不入发布 files）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const readJson = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))

test('zod peer 钉 ^4.6.5（T1 Ruling 兑现：下界=实测 .prefault 语义版 4.6.5）', () => {
  const pkg = readJson('../package.json')
  assert.equal(pkg.peerDependencies?.zod, '^4.6.5', 'peer 下界提至实测版本（^4.3.6 低于 .prefault 实测版）')
})

test('zod peer 与 wiki-steward 对齐（双包同界）', () => {
  const mine = readJson('../package.json')
  const steward = readJson('../../wiki-steward/package.json')
  assert.equal(mine.peerDependencies?.zod, steward.peerDependencies?.zod,
    `两包 zod peer 同界（kb-context=${mine.peerDependencies?.zod} vs wiki-steward=${steward.peerDependencies?.zod}）`)
})
