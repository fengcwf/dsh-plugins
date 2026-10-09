// fixture-real-pages.test.mjs — Task 28（t16）：真页 fixture 回归库（C1 技术债）
// 断言面：① 四源真页样本被各自 parseSerp 吃下且 url/title/snippet 齐全非空（C1 锚）② 样本入库 ≥4 个
// ③ 脱敏审计零命中（K-4：查询词/会话标识/凭据词面/长 ID 全无）④ 零出网（K-15：纯本地解析——
// 网络调用面打桩抛错 + 本测试源码自扫描无网络调用/无网络模块）。
// 合成样本与既有测试零触碰；离线绿是硬门禁。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { parseSerp as parseDdg } from '../lib/sources/ddg.js'
import { parseSerp as parseBing } from '../lib/sources/bing.js'
import { parseSerp as parseSo360 } from '../lib/sources/so360.js'

const REAL = new URL('./fixtures/real/', import.meta.url)
const CASES = [
  { file: 'ddg-kubernetes.html', parse: parseDdg },
  { file: 'ddg-postgresql.html', parse: parseDdg },
  { file: 'bing-kubernetes.html', parse: parseBing },
  { file: 'bing-postgresql.html', parse: parseBing },
  { file: 'so360-kubernetes.html', parse: parseSo360 },
]
const read = (f) => readFileSync(new URL(f, REAL), 'utf8')

test('真页样本解析：url/title/snippet 齐全且非空壳（C1 回归锚）', () => {
  for (const { file, parse } of CASES) {
    const items = parse(read(file))
    assert.ok(items.length >= 1, `${file} 至少解析出 1 条`)
    for (const item of items) {
      assert.deepEqual(Object.keys(item).sort(), ['snippet', 'title', 'url'], `${file} 字段面与合成样本同构`)
      assert.match(item.url, /^https?:\/\//, `${file} url 为绝对 http(s) 形`)
      assert.ok(item.title.length > 0, `${file} title 非空`)
      assert.equal(typeof item.snippet, 'string', `${file} snippet 字符串（可空不臆造）`)
    }
  }
})

test('样本入库断言：real/ 真页文件 ≥4 且登记样本逐个在场', () => {
  const files = readdirSync(REAL).filter((f) => f.endsWith('.html'))
  assert.ok(files.length >= 4, `真页文件数 ${files.length} ≥ 4（C1 入库下限）`)
  for (const { file } of CASES) assert.ok(files.includes(file), `${file} 在场`)
})

test('脱敏审计（K-4/INV-4）：样本零查询词/会话标识/凭据痕迹', () => {
  const forbidden = [
    [/kubernetes/i, '查询词 1'],
    [/postgresql/i, '查询词 2'],
    [/\b(?:tokens?|sessions?|passwords?|passwd|secrets?|cookies?|guids?|uuids?|nonce|jwt)\b/i, '凭据/会话词面'],
    [/(?:BAIDUID|BIDUPGUID|PHPSESSID|SRCHD|SRCHUID|SRCHHPGUSR|MUID|ANONCHK)/, 'cookie 名'],
    [/\brut=/i, 'ddg 重定向 token 参数'],
    [/[0-9a-f]{16,}/i, '长 hex 标识（含图片 CDN 内容哈希，无边界口径）'],
    [/\b\d{12,}\b/, '长数字 ID（epoch/uid）'],
  ]
  for (const { file } of CASES) {
    const html = read(file)
    for (const [re, why] of forbidden) assert.ok(!re.test(html), `${file} 命中${why}：${re}`)
  }
})

test('零出网（K-15）：纯本地解析——网络面打桩抛错 + 源码自扫描无网络调用', () => {
  const src = readFileSync(new URL('./fixture-real-pages.test.mjs', import.meta.url), 'utf8')
  assert.ok(!/\bfetch\s*\(/.test(src), '本测试源码无出网调用')
  assert.ok(!/node:(?:http|https|net|tls)/.test(src), '本测试源码无网络模块')
  const origin = globalThis.fetch
  globalThis.fetch = () => { throw new Error('offline test: network forbidden') }
  try {
    for (const { file, parse } of CASES) assert.ok(parse(read(file)).length >= 1, `${file} 解析不依赖网络`)
  } finally {
    globalThis.fetch = origin
  }
})
