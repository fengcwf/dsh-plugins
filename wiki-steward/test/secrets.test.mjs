// secrets 单测（INV-11 全量脱敏，写侧落盘面）：三层正则逐层锚定 + 哨兵六类 + 计数 + 宁漏不误伤护栏。
// 真被测件零 mock：lib/secrets.js 纯函数直接真调用；无宿主缝，输出干净。
// 样例凭据全部为**假**哨兵值（sk-/PEM/ghp_/AKIA/xox/Bearer 形态），非真实凭据。
import test from 'node:test'
import assert from 'node:assert/strict'

const { redact, REDACTED, SENSITIVE_PATTERNS } = await import('../lib/secrets.js')

const FAKE_PEM = '-----BEGIN RSA PRIVATE KEY-----\nZZZZm9jYmFzZTY0ZmFrZXlzZWNyZXQ=\n-----END RSA PRIVATE KEY-----'

test('契约面：占位符字面 <redacted>；redact 返回 {text, count}；SENSITIVE_PATTERNS 三层导出（Ruling 导出面）', () => {
  assert.equal(REDACTED, '<redacted>')
  assert.equal(typeof redact, 'function')
  assert.ok(SENSITIVE_PATTERNS && typeof SENSITIVE_PATTERNS === 'object')
  assert.ok(Object.isFrozen(SENSITIVE_PATTERNS), '导出面冻结（防运行期篡改）')
  assert.ok(SENSITIVE_PATTERNS.pem instanceof RegExp, '① PEM 层导出')
  assert.ok(SENSITIVE_PATTERNS.assign instanceof RegExp, '② 赋值层导出')
  assert.ok(Array.isArray(SENSITIVE_PATTERNS.token) && SENSITIVE_PATTERNS.token.length === 5,
    '③ token 层导出（sk-/gh[pousr]_/AKIA/xox[baprs]-/Bearer 五形态）')
  for (const re of SENSITIVE_PATTERNS.token) assert.ok(re instanceof RegExp)
  assert.match(SENSITIVE_PATTERNS.assign.source, /\(\?!<redacted>/, '② 含占位符重扫防护')
})

test('零哨兵文本原样、计数 0（over-redaction silently destroys memories）', () => {
  const prose = '医院成本核算口径说明：disk-usage-20240101 与 tokenizer: 词法分析单元；my_token字段说明；Bearer of the ring；xoxb- 后短'
  const out = redact(prose)
  assert.equal(out.text, prose)
  assert.equal(out.count, 0)
})

test('哨兵六类全中和：①PEM ②sk- ③gh[pousr]_ ④AKIA ⑤xox[baprs]- ⑥Bearer <tok>（逐类计数）', () => {
  const cases = [
    [`pre\n${FAKE_PEM}\npost`, `pre\n${REDACTED}\npost`, 1],
    ['key sk-fakeOpenAIKey123456 tail', `key ${REDACTED} tail`, 1],
    ['ghp_FAKEGITHUBPAT0123456789', REDACTED, 1],
    ['ghu_FAKEGITHUBUSER0123456789', REDACTED, 1],
    ['gho_FAKEGITHUBORG0123456789', REDACTED, 1],
    ['ghs_FAKEGITHUBSECRET0123456789', REDACTED, 1],
    ['ghr_FAKEGITHUBREF0123456789', REDACTED, 1],
    ['AKIAFAKESECRET123456', REDACTED, 1],
    ['xoxb-fake-slack-token-0123456789', REDACTED, 1],
    ['xoxp-fake-slack-user-0123456789', REDACTED, 1],
    ['Bearer eyJhbGciOiFakeSig0123456789', REDACTED, 1],
  ]
  for (const [input, want, count] of cases) {
    const out = redact(input)
    assert.equal(out.text, want, `中和失败：${input}`)
    assert.equal(out.count, count, `计数错误：${input}`)
  }
})

test('②赋值形态只替换值保 key 名：=/:"/全角冒号；结构值（列表/映射）不吞；逐条计数', () => {
  const input = [
    'api_key=sk-fakeOpenAIKey123456',
    'password: "p@ss word"',
    'secret: hunter2',
    'token: Bearer abc123def456',
    'api_key：sk-fakeOpenAIKey123456',
    'refresh_token=abc123def456ghi789',
    'tokens: [a, b]',
  ].join('\n')
  const out = redact(input)
  assert.equal(out.text, [
    'api_key=<redacted>',
    'password: <redacted>',
    'secret: <redacted>',
    'token: <redacted>',
    'api_key：<redacted>',
    'refresh_token=<redacted>',
    'tokens: [a, b]',
  ].join('\n'), 'key 名保留、值中和；tokens: [a, b] 结构值不误伤')
  assert.equal(out.count, 6)
})

test('层间不重复计数：private_key: <PEM> 计 1；api_key=sk-… 计 1（②吃掉值后 ③不再匹配）', () => {
  const input = `private_key: ${FAKE_PEM}\napi_key=sk-fakeOpenAIKey123456`
  const out = redact(input)
  assert.equal(out.text, `private_key: ${REDACTED}\napi_key=${REDACTED}`)
  assert.equal(out.count, 2, '①吃掉 PEM 块后 ②不二次计数；②吃掉 sk- 值后 ③不再匹配')
})

test('幂等重扫：已中和文本再跑 redact 计数 0、文本不动（占位符不被二次吞）', () => {
  const once = redact('api_key=sk-fakeOpenAIKey123456 与 ghp_FAKEGITHUBPAT0123456789')
  assert.equal(once.count, 2)
  const twice = redact(once.text)
  assert.equal(twice.text, once.text)
  assert.equal(twice.count, 0)
})

test('宁漏不误伤护栏：lookalike/短尾/中文值/复合词全数原样（词边界 + ASCII 值限制）', () => {
  for (const prose of [
    'disk-usage-20240101 报表',
    'tokenizer: 词法分析单元',
    'my_token字段、task-sku亦非哨兵',
    'Bearer of the ring',
    'xoxb- 短尾',
    'sk-短尾',
    'AKIA 短尾',
    'ghp_ 短尾',
    '连接池 max_connections=50 不是凭据',
    '密码策略要求 password 必须 8 位以上（词面提及非赋值）',
  ]) {
    const out = redact(prose)
    assert.equal(out.text, prose, `不得误伤：${prose}`)
    assert.equal(out.count, 0)
  }
})

test('宁漏不误伤护栏：截断 PEM（有 BEGIN 无 END）不中和（已知留白，宁漏不误伤）', () => {
  const truncated = '-----BEGIN RSA PRIVATE KEY-----\nZZZZm9jYmFzZTY0\n（粘贴时断了）'
  const out = redact(truncated)
  assert.equal(out.text, truncated)
  assert.equal(out.count, 0)
})

test('②分级红action（审查 Important #2）：白名单高危 key 值贪心至空白边界全量中和，count 如实（!/& 不残留）', () => {
  const cases = [
    ['password=Tr0ub4dor&3', 'password=<redacted>', 1],
    ['secret: p@ss!word', 'secret: <redacted>', 1],
    ['token: abc!def&x 段尾散文', 'token: <redacted> 段尾散文', 1],
    ['credential=x&y!', 'credential=<redacted>', 1],
    ['形态：token: Bearer Tr0ub4dor&3', '形态：token: <redacted>', 1],
  ]
  for (const [input, want, count] of cases) {
    const out = redact(input)
    assert.equal(out.text, want, `全量中和失败（值尾残留）：${input}`)
    assert.equal(out.count, count, `count 不如实：${input}`)
    assert.ok(!out.text.includes('<redacted>&') && !out.text.includes('<redacted>!'),
      `占位符后不得残留特殊字符开头值尾：${out.text}`)
  }
})

test('②分级红action：白名单外 key 宁漏不动（db_password 等不回退）+ 词面提及（无分隔符）宁漏', () => {
  for (const prose of [
    'db_password=Sup3rVal&9',
    'my_password_note=x!y 环境变量名非白名单',
    'password 词面提及无分隔符不中和',
  ]) {
    const out = redact(prose)
    assert.equal(out.text, prose, `白名单外/词面必须宁漏不动：${prose}`)
    assert.equal(out.count, 0)
  }
})
