// 构建物/清单契约单测：web/dist 随包分发（git 快照安装代跑构建——禁安装期执行代码，故 dist 必须入库）+
// 客户端面清单（dsh.client + exports['./client'] = dsh-client-modules 扫描契约）。
// 零 mock：真查真构建物字节。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(PKG_DIR, 'web', 'dist')
const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))

test('web/dist 构建物入库：panel.js + style.css 存在且非空（最小构建 vite lib 形）', () => {
  for (const f of ['panel.js', 'style.css']) {
    const p = path.join(DIST, f)
    assert.ok(fs.existsSync(p), `web/dist/${f} 缺失——先跑 npm run build（构建物必须入库随包）`)
    assert.ok(fs.statSync(p).size > 0, `web/dist/${f} 为空`)
  }
})

test('panel.js 是构建产物：导出 mount 契约、不残留 dev 源码运行时引用（//#region 注释除外）', () => {
  const js = fs.readFileSync(path.join(DIST, 'panel.js'), 'utf8')
  assert.ok(/export\s*\{[^}]*\bmount\b/.test(js) || /export\s+function\s+mount/.test(js) || /as mount/.test(js), '必须导出 mount（client.js 挂载契约）')
  assert.ok(!/from\s*["']\/src\//.test(js) && !/import\(\s*["']\/src\//.test(js), '构建物不得运行时引 dev 源码路径')
  assert.ok(!js.includes('<template'), 'SFC 模板必须已被编译（不得残留模板原文）')
})

test('清单契约：dsh.client（platform=web, inject 含 slots）+ exports["./client"] 指向工厂形', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('slots'))
  assert.equal(pkg.exports['./client'], './lib/client.js', 'dsh-client-modules clientExportOf 契约：exports["./client"]')
  const client = fs.readFileSync(path.join(PKG_DIR, 'lib', 'client.js'), 'utf8')
  assert.match(client, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, 'client.js 必须是工厂形 bundle（头注释可前置）')
})

test('files 面覆盖交付物：lib + web + cordis.patch.yml + CHANGELOG.md', () => {
  for (const f of ['lib', 'web', 'cordis.patch.yml', 'CHANGELOG.md']) {
    assert.ok(pkg.files.includes(f), `files 缺 ${f}`)
  }
})
