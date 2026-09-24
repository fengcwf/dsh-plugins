// redact 单测（INV-11 脱敏哨兵，delta-spec §4.4）：三层正则逐层锚定 + 计数 + 反例（over-redaction 防误伤）。
// 真被测件零 mock：lib/redact.js 纯函数直接真调用；无宿主缝/无 sqlite，输出干净。
// 样例凭据全部为**假**哨兵值（sk-/PEM/ghp_/AKIA/xox/Bearer 形态），非真实凭据。
import test from 'node:test'
import assert from 'node:assert/strict'

const { redact, REDACTED } = await import('../lib/redact.js')

const FAKE_PEM = '-----BEGIN RSA PRIVATE KEY-----\nZZZZm9jYmFzZTY0ZmFrZXlzZWNyZXQ=\n-----END RSA PRIVATE KEY-----'

test('占位符契约：REDACTED 字面 <redacted>；零哨兵文本原样、计数 0', () => {
  assert.equal(REDACTED, '<redacted>')
  const prose = '医院成本核算口径说明：disk-usage-20240101 与 tokenizer: 词法分析单元；my_token字段说明；Bearer of the ring；xoxb- 后短'
  const out = redact(prose)
  assert.equal(out.text, prose, '非哨兵内容必须原样（over-redaction silently destroys memories）')
  assert.equal(out.count, 0)
})

test('① PEM 整块中和：-----BEGIN…END----- 整块 → <redacted>，前后文原样', () => {
  const out = redact(`前言\n${FAKE_PEM}\n后记`)
  assert.equal(out.text, `前言\n${REDACTED}\n后记`)
  assert.equal(out.count, 1)
})

test('② 赋值形态只替换值保 key 名：api_key=/password: "/secret: /token: Bearer（含全角冒号）；列表值不吞', () => {
  const input = [
    'api_key=sk-fakeOpenAIKey123456',
    'password: "p@ss word"',
    'secret: hunter2',
    'token: Bearer abc123def456',
    'api_key：sk-fakeOpenAIKey123456',
    'tokens: [a, b]',
  ].join('\n')
  const out = redact(input)
  assert.equal(out.text, [
    'api_key=<redacted>',
    'password: <redacted>',
    'secret: <redacted>',
    'token: <redacted>',
    'api_key：<redacted>',
    'tokens: [a, b]',
  ].join('\n'), 'key 名保留、值中和；tokens: [a, b] 结构值不误伤')
  assert.equal(out.count, 5)
})

test('③ token 形态整段中和为 <redacted>：sk-/gh[pousr]_/AKIA/xox[baprs]-/Bearer <token>', () => {
  const input = [
    'sk-fakeOpenAIKey123456',
    'ghp_FAKEGITHUBPAT0123456789',
    'AKIAFAKESECRET123456',
    'xoxb-fake-slack-token-0123456789',
    'Bearer eyJhbGciOiFakeSig0123456789',
  ].join('\n')
  const out = redact(input)
  assert.equal(out.text, [REDACTED, REDACTED, REDACTED, REDACTED, REDACTED].join('\n'))
  assert.equal(out.count, 5)
})

test('计数正确且不重复计数：PEM 赋值 / api_key=sk- 各计 1（层间互不重叠）', () => {
  const input = `private_key: ${FAKE_PEM}\napi_key=sk-fakeOpenAIKey123456`
  const out = redact(input)
  assert.equal(out.text, `private_key: ${REDACTED}\napi_key=${REDACTED}`)
  assert.equal(out.count, 2, '①吃掉 PEM 块后 ②不二次计数；②吃掉 sk- 值后 ③不再匹配')
})

test('哨兵边界：非哨兵 lookalike 不误伤（词边界/短尾/中文值/连字符复合词）', () => {
  for (const prose of [
    'disk-usage-20240101 报表',
    'tokenizer: 词法分析单元',
    'my_token字段、task-sku亦非哨兵',
    'Bearer of the ring',
    'xoxb- 短尾',
    'sk-短尾',
  ]) {
    const out = redact(prose)
    assert.equal(out.text, prose, `不得误伤：${prose}`)
    assert.equal(out.count, 0)
  }
})
