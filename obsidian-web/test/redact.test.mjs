// redact — 脱敏哨兵单测（T9 / 「INV-11 同款三层」：①PEM 整块 ②赋值形态 ③token 形态，中和+计数）
// 分享面口径（redact.js 头注）：宁可误伤不可漏放；分享页与导出共用。
import test from 'node:test'
import assert from 'node:assert/strict'
import { redact, REDACTED } from '../lib/redact.js'

const PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0kz',
  '-----END RSA PRIVATE KEY-----',
].join('\n')

test('① PEM 私钥整块中和：BEGIN…END 整块 → 占位符（不逐行），计 1；块内 base64 零残留', () => {
  const { text, count } = redact(`前文\n${PEM}\n后文`)
  assert.equal(count, 1, '整块计 1')
  assert.ok(text.includes('前文') && text.includes('后文'), '块外原文不动')
  assert.ok(text.includes(REDACTED))
  assert.ok(!text.includes('BEGIN RSA PRIVATE KEY'), 'PEM 头部不残留')
  assert.ok(!text.includes('MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0kz'), 'PEM 体不残留')
})

test('② 赋值形态：白名单高危 key 只换值保 key 名（api_key=sk-… → api_key=<redacted>），②③ 不双计', () => {
  const { text, count } = redact('api_key=sk-abcdefghijklmnop123456 结束')
  assert.equal(count, 1, '赋值形态计 1（值里含 sk- 哨兵不二次计）')
  assert.equal(text, `api_key=${REDACTED} 结束`)
})

test('③ token 形态整段中和：sk- / ghp_ / Bearer（各计 1）+ 计数=中和次数', () => {
  const src = 'A sk-abcdef1234567890 B ghp_abcdef1234567890 C Authorization: Bearer abcdef1234567890 D'
  const { text, count } = redact(src)
  assert.equal(count, 3)
  assert.ok(!text.includes('sk-abcdef1234567890'))
  assert.ok(!text.includes('ghp_abcdef1234567890'))
  assert.ok(!text.includes('Bearer abcdef1234567890'))
  assert.equal((text.match(new RegExp(REDACTED.replace(/[<>]/g, '\\$&'), 'g')) ?? []).length, 3, '占位符恰 3')
})

test('中和后文本零哨兵残形（sk-/ghp_/Bearer/PEM 全类不出现）', () => {
  const src = `x\n${PEM}\ny api_token="ghp_qqqqqqqqqqqqqq" z Bearer zzzzzzzzzzzz w sk-wwwwwwwwwwwwww`
  const { text } = redact(src)
  for (const needle of ['BEGIN', 'ghp_', 'sk-', 'Bearer ']) {
    assert.ok(!text.includes(needle), `残形泄漏：${needle}`)
  }
})

test('非哨兵内容原样（宁漏不误伤边界：task-sku / disk-usage-20240101 / 普通句与中文）', () => {
  const src = 'disk-usage-20240101 正常；task-sku 词法分析 tokenizer；中文笔记内容不动。'
  const { text, count } = redact(src)
  assert.equal(count, 0, '非哨兵零计数')
  assert.equal(text, src, '非哨兵逐字节原样')
})

test('幂等：二次 redact 计数 0（(?!<redacted>) 防二次计数）', () => {
  const first = redact(`sk-abcdef1234567890 ${PEM} api_key=ghp_zzzzzzzzzzzzz`)
  const second = redact(first.text)
  assert.equal(second.count, 0)
  assert.equal(second.text, first.text)
})

test('空/非字符串输入容忍（fail-closed 到空串域）', () => {
  assert.deepEqual(redact(''), { text: '', count: 0 })
  assert.deepEqual(redact(undefined), { text: '', count: 0 })
  assert.deepEqual(redact(123), { text: '123', count: 0 })
})
