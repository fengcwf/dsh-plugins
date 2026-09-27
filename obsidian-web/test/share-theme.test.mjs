// 分享页 token 快照锁（T13 / ARC-5：分享页 token 快照导出——样式独立可离线）
//   ⑤ 快照自洽闭包：shareCss() 消费的每个 var(--dsw-*|--ds-*) 都在快照明暗双份有值
//      （可离线：零外部变量依赖）+ 零外链（无 <link/@import/url(外源/script）+
//      明暗双份同名集（访客系统偏好跟随）+ 主 UI 零漂移（styles.css 消费面 ⊆ 快照名集）+
//      集成：真分享页 <style> 内联快照、零外链（真 server GET，零 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shareCss, SHARE_TOKEN_SNAPSHOT, SHARE_SNAPSHOT_SOURCE } from '../lib/share-theme.js'
import { createShareServer } from '../lib/share-server.js'
import { createShare } from '../lib/share.js'

const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))
const css = shareCss()

/** 规则体（快照声明块之外）——色值字面量只允许出现在快照块 */
function ruleSection(cssText) {
  return cssText
    .replace(/:root\s*\{[\s\S]*?\}/g, '')
    .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '')
}

test('快照自洽闭包：shareCss 消费的 var(--dsw-*|--ds-*) 全部在快照明暗双份有值（可离线零外部依赖）', () => {
  const used = new Set([...css.matchAll(/var\((--ds[w]?-[a-z0-9-]+)/g)].map((m) => m[1]))
  assert.ok(used.size > 0, 'shareCss 应消费 token')
  const light = SHARE_TOKEN_SNAPSHOT.light
  const dark = SHARE_TOKEN_SNAPSHOT.dark
  const missing = [...used].sort().filter((n) => !(n in light) || !(n in dark))
  assert.deepEqual(missing, [], `快照缺值（分享页会掉出离线自洽）：${missing.join(', ')}`)
  // 快照值自身的引用同样闭包（递归引用不悬空）
  for (const map of [light, dark]) {
    for (const [name, value] of Object.entries(map)) {
      for (const m of String(value).matchAll(/var\((--ds[w]?-[a-z0-9-]+)/g)) {
        assert.ok(m[1] in map, `${name} 的引用 ${m[1]} 不在快照（链未闭合）`)
      }
    }
  }
})

test('零外链：shareCss 无 <link/@import/url(外源)/http(s) 引用（分享页样式全内联可离线）', () => {
  assert.ok(!/@import/.test(css), '@import=外链')
  assert.ok(!/url\(\s*['"]?(?:https?:)?\/\//.test(css), 'url() 外源引用')
  assert.ok(!/https?:\/\//.test(css), 'CSS 内零绝对 URL')
  assert.ok(!/<link\b/i.test(css) && !/<script\b/i.test(css), '快照导出不含标签外链')
})

test('明暗双份同名集 + 规则体零色值字面量（色值只在快照块=token 快照导出唯一取值处）', () => {
  const lightNames = Object.keys(SHARE_TOKEN_SNAPSHOT.light).sort()
  const darkNames = Object.keys(SHARE_TOKEN_SNAPSHOT.dark).sort()
  assert.deepEqual(lightNames, darkNames, '明暗快照名集必须同（暗色跟随不缺角）')
  assert.ok(lightNames.length > 0, '快照非空')
  const rules = ruleSection(css)
  const hexes = [...rules.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
  assert.deepEqual(hexes, [], `规则体自造色板（应全走 var(--dsw-*)）：${hexes.join(', ')}`)
  assert.ok(/var\(--dsw-alias-label-primary\)/.test(rules), '规则体消费 token（非硬编码）')
})

test('快照来源留档：SHARE_SNAPSHOT_SOURCE 点名 dsw 主题源（provenance 可追溯）', () => {
  assert.match(SHARE_SNAPSHOT_SOURCE, /dsh-client-ui-theme/, '快照 provenance 指向宿主 dsw 主题源')
})

test('主 UI 零漂移：web/src/styles.css 消费的 --dsw-* ⊆ 快照名集（主 UI 与分享页同 token 源）', () => {
  const styles = fs.readFileSync(path.join(WEB_SRC, 'styles.css'), 'utf8')
  const used = new Set([...styles.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))
  assert.ok(used.size > 0)
  const names = new Set(Object.keys(SHARE_TOKEN_SNAPSHOT.light))
  const orphan = [...used].sort().filter((n) => !names.has(n))
  assert.deepEqual(orphan, [], `主 UI 消费了快照外 token（漂移）：${orphan.join(', ')}`)
})

test('集成：真分享页 <style> 内联快照且零外链（真 HTTP 面，零 mock）', async () => {
  const TMP = fileURLToPath(new URL('./.tmp-share-theme', import.meta.url))
  fs.mkdirSync(TMP, { recursive: true })
  const vault = fs.mkdtempSync(path.join(TMP, 'page-'))
  fs.mkdirSync(path.join(vault, 'notes'), { recursive: true })
  fs.writeFileSync(path.join(vault, 'notes/a.md'), '# 标题\n\n正文')
  const { share } = await createShare(vault, { target: 'notes/a.md', role: 'read' })
  const handle = createShareServer({
    getConfig: () => ({
      vaultRoot: vault,
      share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
      server: { sharePort: 0, trustProxy: [] },
      ui: { pageSize: 50 },
    }),
    port: 0,
    host: '127.0.0.1',
    syncIntervalMs: 0,
  })
  await handle.start()
  try {
    const base = `http://127.0.0.1:${handle.address().port}`
    const res = await fetch(`${base}/ob_share/${share.token}`)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.ok(html.includes('<style>'), '样式内联（零外链 CSS 文件）')
    assert.ok(html.includes('--dsw-alias-label-primary:'), '快照内联进分享页')
    assert.ok(!/<link\b/i.test(html), '零 <link 外链')
    assert.ok(!/<script\b/i.test(html), '整页零 <script>（T9 锁形不回退）')
    assert.ok(!/@import/.test(html), '零 @import')
    assert.ok(!/url\(\s*['"]?(?:https?:)?\/\//.test(html), '零 url() 外源')
  } finally {
    await handle.close()
  }
})
