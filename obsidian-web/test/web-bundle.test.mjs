// 分包产物锁（T13 / T2+T4 遗留：element-plus 全量 987KB→按需装配+显式分包边界）
//   ④ 构建产物（web/dist 必须入库随包，dist.test.mjs 同源口径）：主入口 chunk ≤500KB、
//      全部 JS chunk ≤500KB、显式 vendor 边界（≥2 chunk，element-plus 独立成块）；
//      源码锁形：web/src 零全量 element-plus import / 零全量 dist/index.css（按需装配单点）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('../web', import.meta.url))
const DIST = path.join(WEB, 'dist')
const SRC = path.join(WEB, 'src')
const MAX_CHUNK = 500 * 1024 // 500KB 目标上限（含端点）

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs))
    else out.push(abs)
  }
  return out
}

function jsAssets() {
  const dir = path.join(DIST, 'assets')
  assert.ok(fs.existsSync(dir), 'dist/assets 缺失——先跑 npm run build')
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => ({
    name: f,
    size: fs.statSync(path.join(dir, f)).size,
  }))
}

test('分包产物：主入口 chunk ≤500KB（element-plus 全量 987KB→按需装配）', () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  const entryRef = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1])
    .find((u) => /assets\/.*\.js$/.test(u))
  assert.ok(entryRef, 'index.html 未引用入口 JS')
  const entryPath = path.join(DIST, entryRef.replace(/^\.?\//, ''))
  const size = fs.statSync(entryPath).size
  assert.ok(size <= MAX_CHUNK, `主入口 chunk ${size}B > 500KB——按需装配失效或需异步分包`)
})

test('分包产物：全部 JS chunk ≤500KB 且显式分包边界（element-plus vendor 独立成块，≥2 chunk）', () => {
  const assets = jsAssets()
  assert.ok(assets.length >= 2, `JS chunk 仅 ${assets.length} 个——缺显式分包边界（应 element-plus vendor 独立成块）`)
  const over = assets.filter((a) => a.size > MAX_CHUNK).map((a) => `${a.name}=${a.size}B`)
  assert.deepEqual(over, [], `超 500KB chunk：${over.join(', ')}`)
  assert.ok(
    assets.some((a) => a.name.includes('element-plus')),
    `vendor 边界缺 element-plus 专块（现有：${assets.map((a) => a.name).join(', ')}）`,
  )
})

test('分包边界是真边界：入口块=app 代码，vue 运行时/element-plus 组件零混入（内容断言非只看名字）', () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  const entryRef = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1])
    .find((u) => /assets\/index-.*\.js$/.test(u))
  assert.ok(entryRef, '入口块（assets/index-*.js）未被 index.html 引用')
  const entryText = fs.readFileSync(path.join(DIST, entryRef.replace(/^\.?\//, '')), 'utf8')
  assert.ok(entryText.includes('ob:edit-state'), '入口块应含 app 代码标记')
  for (const marker of ['__v_isRef', 'ElTree']) {
    assert.ok(!entryText.includes(marker), `入口块混入 vendor 运行时（${marker}）——分包边界失守`)
  }
})

test('按需装配锁：web/src 零全量 element-plus import / 零全量 dist/index.css（同包分模块非新依赖）', () => {
  const offenders = []
  for (const abs of walk(SRC)) {
    if (!/\.(js|vue)$/.test(abs)) continue
    const raw = fs.readFileSync(abs, 'utf8')
    if (/from\s+['"]element-plus['"]/.test(raw)) offenders.push(`${path.relative(SRC, abs)}: 全量 element-plus import`)
    if (/element-plus\/dist\/index\.css/.test(raw)) offenders.push(`${path.relative(SRC, abs)}: 全量主题 CSS import`)
    if (/import\s+ElementPlus\b/.test(raw)) offenders.push(`${path.relative(SRC, abs)}: ElementPlus 全量注册`)
  }
  assert.deepEqual(offenders, [], `全量装配残留：\n${offenders.join('\n')}`)
})

test('依赖白名单不变：package.json 零新增依赖（element-plus 按需=同包分模块）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(WEB, '..', 'package.json'), 'utf8'))
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })
  for (const banned of ['unplugin-vue-components', 'unplugin-auto-import', 'babel-plugin-import']) {
    assert.ok(!deps.includes(banned), `白名单外依赖混入：${banned}`)
  }
  assert.ok(deps.includes('element-plus'), 'element-plus 仍在白名单（同包分模块）')
})

// ── M2（T13 review 随行收口）：vendor ≤500KB 独立断言——不搭车「全 chunk」集合断言，专块自证 + 余量如实 ──
test('M2 vendor≤500KB 独立断言：element-plus 专块恰一且独立过上限（余量随消息如实）', () => {
  const assets = jsAssets()
  const vendor = assets.filter((a) => a.name.includes('element-plus'))
  assert.equal(vendor.length, 1, `element-plus vendor 专块应恰一个（现有：${vendor.map((a) => a.name).join(', ')}）`)
  const v = vendor[0]
  const margin = MAX_CHUNK - v.size
  assert.ok(v.size <= MAX_CHUNK, `element-plus vendor ${v.size}B > 500KB（余量 ${margin}B）——按需装配膨胀，按 Ruling 2 预留路径启用异步分包`)
})
