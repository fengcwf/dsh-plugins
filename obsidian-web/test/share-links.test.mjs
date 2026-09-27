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

test('③ buildShareLinks：外网未配置 external=null（内网仍在）；IPv6 内网 host 自动括号；缺 server 组回落默认端口', () => {
  const token = 'b'.repeat(43)
  const bare = buildShareLinks({ token, config: {}, settings: { externalBaseUrl: null, lanHost: null }, lanHost: '192.168.1.10' })
  assert.equal(bare.external, null, '未配置外网域名 → external=null（UI 显式占位引导设置页）')
  assert.equal(bare.internal, `http://192.168.1.10:3500/ob_share/${token}`, '缺 server 组回落 3500')
  const v6 = buildShareLinks({ token, config: {}, settings: { externalBaseUrl: null, lanHost: null }, lanHost: 'fd00::1' })
  assert.equal(v6.internal, `http://[fd00::1]:3500/ob_share/${token}`, 'IPv6 host 自动括号')
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
