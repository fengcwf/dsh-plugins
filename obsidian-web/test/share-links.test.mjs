// 分享链接生成单一来源 + 外网域名设置持久化（T10 / OW-US-9「根治 URL 拼接坑」）
// 契约锚点：
//   - 红线「禁止半路拼分享 URL」：/ob_share/<token> 拼接恰一处（lib/share.js SHARE_URL_PREFIX 常量 +
//     lib/share-links.js buildShareLinks 唯一生成函数）；前端零拼接（web/src 全树 grep 零命中）。
//   - 内外网地址都显示（OW-US-9）：internal=内网 host:sharePort、external=设置页配置的外网域名（未配置=null）。
//   - 外网域名配置=设置页持久化（<vaultRoot>/.ob-share/settings.json，0600，原子写；Ruling 见 task-10-report）。
// 真验零 mock：真 tmp 文件系统落盘读回；网络接口注入只用于纯函数 detectLanHost 的形参（非 mock 框架）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHARE_URL_PREFIX, SHARE_DIR, listShares, createShare } from '../lib/share.js'
import {
  SETTINGS_FILE,
  buildShareLinks,
  normalizeExternalBaseUrl,
  normalizeLanHost,
  detectLanHost,
  readShareSettings,
  writeShareSettings,
} from '../lib/share-links.js'

const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))
const WEB_DIST = fileURLToPath(new URL('../web/dist', import.meta.url))
const LIB_DIR = fileURLToPath(new URL('../lib', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-share-links', import.meta.url))

function tmpVault(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function walkFiles(dir, exts) {
  const out = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name)
      if (e.isDirectory()) walk(abs)
      else if (exts.some((x) => e.name.endsWith(x))) out.push(abs)
    }
  }
  walk(dir)
  return out
}

// ── ② 链接生成单一来源 + 前端零拼接（红线：禁止半路拼分享 URL）────────────────
test('② 单一来源：SHARE_URL_PREFIX 常量锁形，lib 代码内 /ob_share 字面量恰一处（注释行不计）', () => {
  assert.equal(SHARE_URL_PREFIX, '/ob_share/', 'SHARE_URL_PREFIX 显式常量锁形')
  const hits = []
  for (const file of walkFiles(LIB_DIR, ['.js'])) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return // 注释行不计
      if (/['"`]\/ob_share/.test(line)) hits.push(`${path.basename(file)}:${i + 1}`)
    })
  }
  assert.equal(hits.length, 1, `lib 代码内 /ob_share 字面量必须恰一处（SHARE_URL_PREFIX 定义），实际：${JSON.stringify(hits)}`)
  assert.match(hits[0], /^share\.js:\d+$/, `唯一字面量必须在 share.js 常量定义行，实际：${hits[0]}`)
})

test('② 前端零拼接：web/src 全树零 ob_share 字符串（分享 URL 一律服务端下发 links）', () => {
  const hits = []
  for (const file of walkFiles(WEB_SRC, ['.js', '.vue', '.css', '.html'])) {
    if (fs.readFileSync(file, 'utf8').includes('ob_share')) hits.push(path.relative(WEB_SRC, file))
  }
  assert.deepEqual(hits, [], `web/src 禁含 ob_share 字面量（红线：前端零拼接分享 URL），命中：${JSON.stringify(hits)}`)
})

test('② 构建物零拼接：web/dist 同样零 ob_share 字符串（bundle 只消费服务端 links）', () => {
  const hits = []
  for (const file of walkFiles(WEB_DIST, ['.js', '.css', '.html'])) {
    if (fs.readFileSync(file, 'utf8').includes('ob_share')) hits.push(path.relative(WEB_DIST, file))
  }
  assert.deepEqual(hits, [], `web/dist 禁含 ob_share 字面量，命中：${JSON.stringify(hits)}`)
})

// ── 0.2.4 缺陷锁①：前端零端口假设（旧 SettingsPanel.vue 初值硬编码 3500 = 门禁端口）────────
// 语义：分享端口只有服务端 config.server.sharePort 一个来源；null=同域模式（无独立端口）。
// 前端任何 3500 字面量 = 把门禁端口冒充成分享端口，属必须钉死的防回归哨兵。
test('① 前端零端口假设：web/src 全树零 3500 字面量（分享端口只认服务端下发 sharePort）', () => {
  const hits = []
  for (const file of walkFiles(WEB_SRC, ['.js', '.vue', '.css', '.html'])) {
    if (fs.readFileSync(file, 'utf8').includes('3500')) hits.push(path.relative(WEB_SRC, file))
  }
  assert.deepEqual(hits, [], `web/src 禁含 3500 端口字面量（同域模式无独立端口），命中：${JSON.stringify(hits)}`)
})

test('① 构建物零端口假设：web/dist 同样零 3500 字面量（dist 必须与源码同口径重建）', () => {
  const hits = []
  for (const file of walkFiles(WEB_DIST, ['.js', '.css', '.html'])) {
    if (fs.readFileSync(file, 'utf8').includes('3500')) hits.push(path.relative(WEB_DIST, file))
  }
  assert.deepEqual(hits, [], `web/dist 禁含 3500 端口字面量（需 npm run build 重建 dist），命中：${JSON.stringify(hits)}`)
})

test('① 端口兜底常量已摘（运行时真断言，非文本 grep）：share-links 模块不再导出 DEFAULT_SHARE_PORT', async () => {
  const mod = await import('../lib/share-links.js')
  assert.ok(!('DEFAULT_SHARE_PORT' in mod), 'DEFAULT_SHARE_PORT 必须已从 share-links 导出面移除（其 3500 回落即 bug 本体）')
})

/**
 * 真代码行判定（此库注释风格=行首 `//` 或 JSDoc 块内 `* `）：整行注释 line 不计，行尾注释剥除后计。
 * 说明：手写剥离器会被正则/字符串里的引号拖入错态（已实测失准），故这里只做「注释行」这种一眼可判的形状。
 * 真正的牙齿是上面的运行时断言（导出面 + buildShareLinks 行为锁）；本条只挡住最粗暴的"又把常量写回来"。
 */
function codePortion(line) {
  const t = line.trimStart()
  if (t.startsWith('//') || t.startsWith('*')) return '' // 纯注释行
  return line.replace(/\/\/.*$/, '') // 剥行尾注释，保留代码
}

test('① 服务端零端口兜底：lib 全树代码面零 3500 端口字面量（注释说明不计）', () => {
  const hits = []
  for (const file of walkFiles(LIB_DIR, ['.js'])) {
    for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
      if (codePortion(line).includes('3500')) hits.push(`${path.basename(file)}:${i + 1}: ${line.trim()}`)
    }
  }
  assert.deepEqual(hits, [], `lib 代码面禁含 3500 端口字面量（端口单一来源=config.server.sharePort），命中：${JSON.stringify(hits)}`)
})

test('③ buildShareLinks：path/internal/external 三线形（内外网地址都显示），端口取 config.server.sharePort', () => {
  const token = 'a'.repeat(43)
  const links = buildShareLinks({
    token,
    config: { server: { sharePort: 4500 } },
    settings: { externalBaseUrl: 'https://share.example.com', lanHost: null },
    lanHost: '192.168.1.10',
  })
  assert.deepEqual(links, {
    path: `/ob_share/${token}`,
    internal: `http://192.168.1.10:4500/ob_share/${token}`,
    external: `https://share.example.com/ob_share/${token}`,
  })
})

test('③ buildShareLinks：外网未配置 external=null（内网仍在）；IPv6 内网 host 自动括号', () => {
  const token = 'b'.repeat(43)
  const bare = buildShareLinks({ token, config: {}, settings: { externalBaseUrl: null, lanHost: null }, lanHost: '192.168.1.10' })
  assert.equal(bare.external, null, '未配置外网域名 → external=null（UI 显式占位引导设置页）')
  const v6 = buildShareLinks({ token, config: {}, settings: { externalBaseUrl: null, lanHost: null }, lanHost: 'fd00::1' })
  assert.equal(v6.internal, v6.path, 'IPv6 内网 host：同域模式 internal=路径形（零 host/port 拼接）')
})

// ── 0.2.4 缺陷锁：链接端口口径统一为「路径契约」（旧实现回落 DEFAULT_SHARE_PORT=3500=门禁端口）──────
// 取证：changes/2026-09-28-b2-effect-fix/reports/share-external-access-analysis.md §2.2 + §3 方案四。
// 语义：sharePort=number → internal 带该端口；sharePort=null/缺省/非法 → internal **仅路径**（同域模式，
//   面挂 ctx.webServer 主入口，任何端口都不成立）——**绝不回落 3500**（3500=login-gate 门禁端口，
//   站外访客点开必被 302 到登录页）。
test('① 链接口径：sharePort=null（同域模式）→ internal = 仅路径，零端口（禁回落 3500）', () => {
  const token = 'c'.repeat(43)
  for (const config of [{ server: { sharePort: null } }, {}, { server: {} }]) {
    const links = buildShareLinks({ token, config, settings: { externalBaseUrl: null, lanHost: null }, lanHost: '192.168.1.10' })
    assert.equal(links.internal, `/ob_share/${token}`, `sharePort=null 形（${JSON.stringify(config)}）→ internal 仅路径`)
    assert.ok(!links.internal.includes('3500'), 'internal 绝不含 3500（门禁端口）')
    assert.ok(!links.internal.includes(':'), 'internal 绝不含端口分隔符（同域模式零端口）')
    assert.equal(links.path, `/ob_share/${token}`, 'path 恒为路径形')
  }
})

test('① 链接口径：sharePort=number → internal 带该端口（配置值真实端口，非默认）', () => {
  const token = 'd'.repeat(43)
  for (const port of [3501, 4500, 65535, 1]) {
    const links = buildShareLinks({ token, config: { server: { sharePort: port } }, settings: {}, lanHost: '192.168.1.10' })
    assert.equal(links.internal, `http://192.168.1.10:${port}/ob_share/${token}`, `sharePort=${port} → internal 带该端口`)
  }
})

// IPv6 括号形覆盖：旧测试只在「缺 server 组回落 3500」那条分支上顺带验过括号，该分支随本次修复消失
// （同域模式不再拼 host:port）——故在**仍能拼出 host 的 number 模式**上补回同等强度的括号锁，零净弱化。
test('① IPv6 内网 host 自动括号（number 模式拼 host:port 时同样成立）——旧 3500 回落分支覆盖的等价迁补', () => {
  const token = 'g'.repeat(43)
  const v6 = buildShareLinks({ token, config: { server: { sharePort: 3501 } }, settings: {}, lanHost: 'fd00::1' })
  assert.equal(v6.internal, `http://[fd00::1]:3501/ob_share/${token}`, 'IPv6 host 自动括号（免与端口冒号歧义）')
  const v4 = buildShareLinks({ token, config: { server: { sharePort: 3501 } }, settings: {}, lanHost: '192.168.1.10' })
  assert.equal(v4.internal, `http://192.168.1.10:3501/ob_share/${token}`, 'IPv4 host 不额外加括号')
})

test('① 链接口径：非法 sharePort（0/越界/字符串/布尔）→ 同域路径形（旧实现的 3500 兜底即 bug 本体）', () => {
  const token = 'e'.repeat(43)
  for (const bad of [0, 65536, -1, '3500', true, Number.NaN, 1.5]) {
    const links = buildShareLinks({ token, config: { server: { sharePort: bad } }, settings: {}, lanHost: '192.168.1.10' })
    assert.equal(links.internal, `/ob_share/${token}`, `非法 sharePort=${String(bad)} → 路径形（非 3500 兜底）`)
  }
})

test('① 链接 GUI 口径不变式：任何模式下 links.internal 都不得以 3500 端口出现（回归哨兵）', () => {
  const token = 'f'.repeat(43)
  const shapes = [
    { server: { sharePort: null } }, {}, { server: {} },
    { server: { sharePort: 0 } }, { server: { sharePort: 'x' } },
    { server: { sharePort: 3501 } }, { server: { sharePort: 4500 } },
  ]
  for (const config of shapes) {
    const links = buildShareLinks({ token, config, settings: { externalBaseUrl: null, lanHost: null }, lanHost: 'fd00::1' })
    assert.ok(!/(^|[^0-9])3500([^0-9]|$)/.test(links.internal), `internal 禁含 3500 端口，实际：${links.internal}`)
  }
})

test('② buildShareLinks：非法 token（含 / 空格或空）拒——token 形围栏在生成侧同样生效', () => {
  for (const bad of ['a/b', '', 'x y', '../x']) {
    assert.throws(() => buildShareLinks({ token: bad, config: {}, settings: {}, lanHost: 'h' }),
      (err) => err.code === 'bad_request', `应拒：${JSON.stringify(bad)}`)
  }
})

// ── 外网域名归一（设置页输入围栏：链接生成绝不引入路径/查询拼接歧义）──────────────
test('外网域名归一：裸域名默认 http、显式 origin 保形、尾斜杠剥除', () => {
  assert.equal(normalizeExternalBaseUrl('share.example.com'), 'http://share.example.com')
  assert.equal(normalizeExternalBaseUrl('https://share.example.com:8443/'), 'https://share.example.com:8443')
  assert.equal(normalizeExternalBaseUrl('http://192.168.1.10:8080'), 'http://192.168.1.10:8080')
  assert.equal(normalizeExternalBaseUrl(''), null, '空串=清除')
  assert.equal(normalizeExternalBaseUrl(null), null)
})

test('外网域名归一：javascript:/路径/查询/空格/凭据形一律拒（bad_request）', () => {
  for (const bad of [
    'javascript:alert(1)',
    'https://x.example.com/path',
    'https://x.example.com?y=1',
    'https://x.example.com#frag',
    'http://exa mple.com',
    'ftp://x.example.com',
    'http://user:pass@x.example.com',
  ]) {
    assert.throws(() => normalizeExternalBaseUrl(bad), (err) => err.code === 'bad_request', `应拒：${bad}`)
  }
})

test('内网 host 归一：主机名/IPv4/IPv6（含括号形）过；host:port/URL 形/路径形拒（端口=sharePort 单一来源）', () => {
  assert.equal(normalizeLanHost('192.168.1.10'), '192.168.1.10')
  assert.equal(normalizeLanHost('nas.local'), 'nas.local')
  assert.equal(normalizeLanHost('[fd00::1]'), 'fd00::1', '括号形剥括号')
  assert.equal(normalizeLanHost('fd00::1'), 'fd00::1')
  for (const bad of ['192.168.1.10:3500', 'http://192.168.1.10', '192.168.1.10/x', 'a b', '']) {
    assert.throws(() => normalizeLanHost(bad), (err) => err.code === 'bad_request', `应拒：${bad}`)
  }
})

test('detectLanHost：首个非 internal IPv4；全 internal 回落 127.0.0.1（形参注入纯判定）', () => {
  const ifaces = {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    eth0: [
      { address: 'fe80::1', family: 'IPv6', internal: false },
      { address: '192.168.1.10', family: 'IPv4', internal: false },
    ],
  }
  assert.equal(detectLanHost(ifaces), '192.168.1.10')
  assert.equal(detectLanHost({ lo: [{ address: '127.0.0.1', family: 4, internal: true }] }), '127.0.0.1')
  assert.equal(detectLanHost({}), '127.0.0.1')
})

// ── 设置持久化（设置页写入面）────────────────────────────────────────────────
test('设置持久化：写读往返 + 补丁合并 + 落盘 0600 + 文件在 .ob-share 内', async (t) => {
  const root = tmpVault(t)
  const saved = await writeShareSettings(root, { externalBaseUrl: 'share.example.com', lanHost: '192.168.1.10' })
  assert.deepEqual(saved, { externalBaseUrl: 'http://share.example.com', lanHost: '192.168.1.10' })
  const file = path.join(root, SHARE_DIR, SETTINGS_FILE)
  assert.ok(fs.existsSync(file), '设置文件落 <vaultRoot>/.ob-share/settings.json')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, '设置文件 0600')
  const merged = await writeShareSettings(root, { externalBaseUrl: 'https://share2.example.com' })
  assert.deepEqual(merged, { externalBaseUrl: 'https://share2.example.com', lanHost: '192.168.1.10' }, '补丁合并：未给键保留')
  assert.deepEqual(readShareSettings(root), merged, '读回一致')
})

test('设置持久化：缺文件=全默认 null；坏 JSON/坏值=可解释抛错（fail-loud 非静默）', (t) => {
  const root = tmpVault(t)
  assert.deepEqual(readShareSettings(root), { externalBaseUrl: null, lanHost: null }, '缺文件=默认（未配置）')
  const file = path.join(root, SHARE_DIR, SETTINGS_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{not json')
  assert.throws(() => readShareSettings(root), (err) => err.code === 'bad_request', '坏 JSON=可解释抛错')
  fs.writeFileSync(file, JSON.stringify({ externalBaseUrl: 'javascript:alert(1)', lanHost: null }))
  assert.throws(() => readShareSettings(root), (err) => err.code === 'bad_request', '盘上坏值同样拒（读侧不静默放行）')
})

test('设置文件不出分享列表（store 条目=token 形锁定，settings.json 零出条目）', async (t) => {
  const root = tmpVault(t)
  await writeShareSettings(root, { externalBaseUrl: 'share.example.com' })
  const empty = await listShares(root)
  assert.equal(empty.total, 0, 'settings.json 不是分享条目')
  assert.deepEqual(empty.shares, [])
  fs.writeFileSync(path.join(root, 'INDEX.md'), '# INDEX\n')
  await createShare(root, { target: 'INDEX.md', role: 'read' })
  const after = await listShares(root)
  assert.equal(after.total, 1, '恰一条分享条目（settings.json 仍不出）')
  assert.match(after.shares[0].token, /^[A-Za-z0-9_-]{43}$/, 'token 形锁定')
})
