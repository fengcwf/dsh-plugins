// 构建物冒烟（T2 验收④）：npm run build 产物 web/dist 必须真实存在且自洽。
// 构建物随包分发（git 快照安装代跑构建——dsh-plugin-ops：禁安装期执行代码），故 dist 必须入库。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('../web', import.meta.url))
const DIST = path.join(WEB, 'dist')

test('dist 冒烟：index.html 构建态（非 dev 源码引用）且标题为 obsidian-web', () => {
  const indexPath = path.join(DIST, 'index.html')
  assert.ok(fs.existsSync(indexPath), 'web/dist/index.html 缺失——先跑 npm run build（构建物必须入库随包）')
  const html = fs.readFileSync(indexPath, 'utf8')
  assert.ok(html.trimStart().toLowerCase().startsWith('<!doctype html'), 'index.html 必须是构建产物')
  assert.ok(!html.includes('/src/main.js'), '构建物不得残留 dev 源码引用')
  assert.ok(html.includes('obsidian-web'), '页面标题/标识锁定')
})

test('dist 冒烟：index.html 引用的 assets 全部存在且非空', () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|data:)/.test(u))
  assert.ok(refs.length > 0, 'index.html 未引用任何构建资产')
  for (const ref of refs) {
    const rel = ref.replace(/^\.?\//, '')
    const file = path.join(DIST, rel)
    assert.ok(fs.existsSync(file), `引用的构建资产缺失：${ref}`)
    assert.ok(fs.statSync(file).size > 0, `构建资产为空：${ref}`)
  }
})

test('dist 冒烟：存在真实 JS bundle（>10KB，含 vue/element-plus 打包面）', () => {
  const assetsDir = path.join(DIST, 'assets')
  assert.ok(fs.existsSync(assetsDir), 'dist/assets 缺失')
  const js = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  assert.ok(js.length > 0, 'dist/assets 无 JS bundle')
  const biggest = Math.max(...js.map((f) => fs.statSync(path.join(assetsDir, f)).size))
  assert.ok(biggest > 10 * 1024, `最大 JS bundle 仅 ${biggest}B——疑似未真实构建`)
})
