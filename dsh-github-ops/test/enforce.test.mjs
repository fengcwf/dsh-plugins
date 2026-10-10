import test from 'node:test'
import assert from 'node:assert/strict'
import { gateWebFetch, rewriteGithubCommand, targetsGithubApi } from '../lib/enforce.js'

// ────────────────────────────────────────────────────────────────────────────
// deny reason「实时可变量」结构哨兵（Task 02 加固，finding F-1）
// ────────────────────────────────────────────────────────────────────────────
// F-1 教训（Task 01 reviewer 抓出）：旧哨兵是字面枚举 `/60|耗尽/`——
//   把 reason 改成「…只可能走匿名通道（当前匿名限额 5000/h）。」这种
//   "看起来就是今天的真值"的新形态，`node --test` 仍 115/115 全绿（队长实测复现），
//   哨兵咬不住。枚举只会保护它认识的字。
// 所以哨兵升级为**结构性规则**：不枚举"哪个字不能说"，而是禁止整类
// "只有运行时才知道、随时间过期"的观测混进 reason。
//
// 三族判据（任一族命中 = reason 里混进了实时可变量）：
//   A 定量断言：数字 + 量纲组合（`\d+/h`、`\d+ 次`、`\d+%`、`\d+ hours`…）
//   B 配额语境的裸数字：配额词（限额/配额/额度/上限/频率/速率）与数字同子句相邻（前后两方向）
//   C 实时状态断言：
//       C1 观测/时间标记（当前/现在/实测/本机/最新…）与「基础设施或配额主体」同现
//       C2 状态词（耗尽/限流/不可用/波动…）与「基础设施或配额主体」相邻同现（前后两方向）
// 结构性体现在：同一语义族的新词、新写法会被自动咬住，不需要预先枚举它；
//   而结构性文案（"工具入参只有 url、带不了 headers"这种永不过期的判据）一律不误伤。
// ────────────────────────────────────────────────────────────────────────────

// A. 数字 + 量纲：任何"多少个 / 每小时多少次 / 成功率多少"形式的定量断言
const QUOTA_UNIT_SOURCE = '\\d+\\s*/\\s*h\\b|\\d+\\s*次|\\d+\\s*个|\\d+\\s*%|\\d+\\s*(?:hours?|minutes?|seconds?)\\b'

// B. 配额语境的裸数字：配额词与数字同子句相邻（额度在前 / 数字在前两个方向）
const QUOTA_WORD = '限额|配额|额度|上限|频率|速率'
const QUOTA_CONTEXT_SOURCE = `(?:${QUOTA_WORD})[^。；\\n\\d;]{0,6}\\d|\\d[^。；\\n\\d;]{0,6}(?:${QUOTA_WORD})`

// C. 实时状态断言：观测标记 / 状态词 与「基础设施或配额主体」同现
const LIVE_MARKER = '当前|现在|目前|此刻|实时|实测|现已|刚刚|刚才|截至|本机|最新|近期|最近'
const LIVE_SUBJECT =
  '出口|代理|网络|链路|通道|连接|网关|配额|限额|额度|quota|rate ?limit|egress|proxy'
const LIVE_STATE =
  '耗尽|用尽|枯竭|触顶|见底|超限|限流|降频|阻断|屏蔽|不可用|失效|失灵|中断|波动|不稳定|故障|超时|exhausted|throttled|unavailable|denied'
const LIVE_STATE_SOURCE =
  `(?:${LIVE_MARKER})[^。；\\n]{0,10}(?:${LIVE_SUBJECT}|${LIVE_STATE})` +
  `|(?:${LIVE_SUBJECT})[^。；\\n]{0,8}(?:${LIVE_STATE})` +
  `|(?:${LIVE_STATE})[^。；\\n]{0,8}(?:${LIVE_SUBJECT})`

const FAMILIES = [
  { id: 'A-quota-unit', why: '数字+量纲组合（定量断言：多少/每小时/多少次）', source: QUOTA_UNIT_SOURCE },
  { id: 'B-quota-context', why: '配额词与裸数字同子句相邻（两个方向）', source: QUOTA_CONTEXT_SOURCE },
  { id: 'C-live-state', why: '观测标记或状态词与基础设施/配额主体同现', source: LIVE_STATE_SOURCE },
].map((f) => ({ ...f, re: new RegExp(f.source, 'i') }))

// 合成哨兵 = 三族并集（旧名保留，语义由"字面枚举"升级为"结构族"）
const STALE_OBSERVATION = new RegExp(FAMILIES.map((f) => f.source).join('|'), 'i')

// 哪些族咬住了这段文字（反例自证时用来证明"是结构规则在管，不是运气"）
function familiesHitting(text) {
  return FAMILIES.filter((f) => f.re.test(text)).map((f) => f.id)
}

// 好源（结构性约束）：指路关键词集合（Task 01 口径，保持原样）
const GUIDANCE = /\bgh api\b|\bgithub_repo_|\bAuthorization\b/

// 六台被拦主机（含尾缀拦截面 media）
const API_HOST_URLS = [
  'https://api.github.com/rate_limit',
  'https://raw.githubusercontent.com/o/r/main/README.md',
  'https://gist.githubusercontent.com/o/r/x',
  'https://codeload.github.com/o/r/tar.gz/main',
  'https://objects.githubusercontent.com/o/r/x',
  'https://media.githubusercontent.com/o/r/x',
]

test('web_fetch 门禁：API/原始文件主机拒绝，普通网页放行', () => {
  assert.equal(gateWebFetch('https://api.github.com/repos/x/y').action, 'deny')
  assert.equal(gateWebFetch('https://raw.githubusercontent.com/o/r/main/README.md').action, 'deny')
  assert.equal(gateWebFetch('https://codeload.github.com/o/r/tar.gz/main').action, 'deny')
  assert.equal(gateWebFetch('https://github.com/rtk-ai/rtk').action, 'allow')
  assert.equal(gateWebFetch('https://nodejs.org/docs').action, 'allow')
  assert.equal(gateWebFetch('not a url').action, 'allow')
  const deny = gateWebFetch('https://api.github.com/rate_limit')
  assert.match(deny.reason, /gh api/)
})

test('deny reason 文案契约（C-4）：结构性约束 + host 插值 + 指路 + 零实时可变量', () => {
  const deny = gateWebFetch('https://api.github.com/rate_limit')
  assert.equal(deny.action, 'deny')

  // a. host 动态插值在场（定位是哪个主机被拦）
  assert.match(deny.reason, /api\.github\.com/, 'deny reason 应含实际注入的 host')

  // b. 不出现实时可变量：三族结构哨兵（A 量纲 / B 配额裸数字 / C 实时状态）逐族都不命中
  for (const f of FAMILIES) {
    assert.doesNotMatch(deny.reason, f.re, `deny reason 不得混入实时可变量（${f.id}：${f.why}）`)
  }
  assert.doesNotMatch(deny.reason, STALE_OBSERVATION, 'deny reason 不得复现实时观测')

  // c. 指路保留（三通道关键词：#ALL）
  assert.match(deny.reason, /\bgh api\b/, '指路保留 gh api')
  assert.match(deny.reason, /github_repo_/, '指路保留 github_repo_* 工具')
  assert.match(deny.reason, /Authorization/, '指路保留 curl Authorization 头')

  // 结构性约束陈述在场（web_fetch 带不了 token）
  assert.match(deny.reason, /无法携带 GitHub token|不能携带 GitHub token/, '应陈述结构性约束')

  // token 零明文（P-5）：绝不出现真实 token 形态
  assert.doesNotMatch(deny.reason, /ghp_|github_pat_/, 'token 零明文')
})

test('deny reason 正反例自证（C-4）：旧形态必命中、六主机好源不误伤', () => {
  // 反例：Task 01 之前的旧文案形态（实时观测）必须命中判定器
  const stale =
    'web_fetch 对 api.github.com 只能匿名访问（无法携带 GitHub token，匿名限额 60/h 且本机代理出口已耗尽）。' +
    '请改用带认证的通道：github_repo_* 工具，或 bash 里 `gh api <path>`。' +
    '(确实需要匿名抓取时可临时用 bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)'
  assert.ok(familiesHitting(stale).length > 0, '结构哨兵必须咬住旧文案的实时观测')
  assert.match(stale, STALE_OBSERVATION, '判定器必须咬住旧文案的实时观测')
  assert.match(stale, GUIDANCE, '旧文案确有指路（缺陷只是观测过期）')

  // 正例：现行 reason（六台不同 host）不得命中任一实时观测族，指路必须在场
  for (const url of API_HOST_URLS) {
    const good = gateWebFetch(url)
    assert.equal(good.action, 'deny')
    assert.doesNotMatch(good.reason, STALE_OBSERVATION, `拒绝理由不得含实时可变量: ${url}`)
    assert.match(good.reason, GUIDANCE, `拒绝理由必须指路: ${url}`)
    assert.match(good.reason, /无法携带 GitHub token/, `拒绝理由必须陈述结构性约束: ${url}`)
  }

  // 正例：结构性改写的同义变体也不得误伤（哨兵只管实时可变，不管措辞
  //   ——否则它只是个换了写法的禁字表，仍会被新写法绕过）
  for (const clean of [
    'web_fetch 对 api.github.com 无法携带 GitHub token（工具入参只有 url、带不了 headers），' +
      '请改用 github_repo_* 工具，或 bash 里 `gh api <path>`。',
    '该请求走的是匿名通道：强制层不读浏览器 cookie 与环境凭据，只认带认证的调用方式' +
      '（`Authorization: Bearer $(gh auth token)`）。',
  ]) {
    assert.doesNotMatch(clean, STALE_OBSERVATION, `结构性改写变体不得误伤: ${clean}`)
    assert.match(clean, GUIDANCE, `结构性改写变体应保留指路: ${clean}`)
  }
})

test('哨兵 A/B 族负例：新配额数字 5000/h 与旧配额数字 60/h 逐个必命中', () => {
  // 队长实测的盲区形态排在最前：一个"今天是真值"的新数字
  const cases = [
    ['…只可能走匿名通道（当前匿名限额 5000/h）。请改用 gh api。', '新数字 5000/h（原盲区）'],
    ['…匿名限额 60/h，请改用 gh api。', '旧数字 60/h（Task 01 已知形态）'],
    ['…当前配额 5000 次/小时，请改用 github_repo_* 工具。', '数字+次 组合'],
    ['…rate limit 5000/h，请改用 gh api。', '英文配额量纲'],
  ]
  for (const [text, label] of cases) {
    const hits = familiesHitting(text)
    assert.ok(hits.length > 0, `必须被结构哨兵咬住: ${label}`)
    assert.match(text, STALE_OBSERVATION, `必须被合成哨兵咬住: ${label}`)
  }
})

test('哨兵 C 族负例：出口/代理状态词与观测标记逐个必命中', () => {
  // 「耗尽」是漏网类新发现的词：这一族存在的理由就是不认识这个词也能咬住
  const cases = [
    ['…本机代理出口已耗尽，请改用 gh api。', '旧状态词（无时间标记）'],
    ['…当前出口链路被限流，请改用 gh api。', '新状态词+观测标记'],
    ['…代理不可用，请改用 github_repo_* 工具。', '可用性状态词'],
    ['…quota exhausted，请改用 gh api。', '英文状态词'],
    ['…当前网络波动，抓取成功率下降。', '观测标记+网络+波动'],
  ]
  for (const [text, label] of cases) {
    const hits = familiesHitting(text)
    assert.ok(hits.includes('C-live-state'), `必须被 C 族结构规则咬住: ${label}`)
    assert.match(text, STALE_OBSERVATION, `必须被合成哨兵咬住: ${label}`)
  }
})

test('哨兵泛化反例：同类回归写法逐个被咬住（非已知旧形态）', () => {
  // 构造来自"同类回归会怎么写"，不是复读已知旧形态
  const cases = [
    ['…（本机出口实测每秒可发 50 次）…', '实时速率观测'],
    ['…已用配额 4200，剩余 800…', '用量裸数字（无单位）'],
    ['…当前匿名额度 4800/h…', '额度+新数字'],
    ['…本机 gh 登录态有效，但匿名通道配额 5000…', '裸数字+配额'],
    ['…截至目前的抓取成功率 99%…', '百分比实时观测'],
  ]
  for (const [text, label] of cases) {
    assert.match(text, STALE_OBSERVATION, `必须被结构哨兵咬住: ${label}`)
  }
})

test('哨兵三族结构性互证：各管各的类、互不冗余（不是一条大枚举）', () => {
  const unitForm = '…匿名限额 5000/h…'
  const bareNumberForm = '…已用配额 4200…'
  const stateForm = '…本机代理出口已耗尽…'

  // C 族专属：状态词形态不能被 A/B 的数字规则误伤 → 证明 C 族独立存在、不是装饰
  assert.deepEqual(familiesHitting(stateForm), ['C-live-state'], '状态词形态应只由 C 族管辖')
  // B 族专属：裸数字无单位不能被 A 族误伤
  assert.deepEqual(familiesHitting(bareNumberForm), ['B-quota-context'], '裸数字形态应只由 B 族管辖')
  // A/B 协作：带单位的配额数字两族都咬
  assert.deepEqual(familiesHitting(unitForm), ['A-quota-unit', 'B-quota-context'], '带单位配额数字应由 A+B 共管')
  // 现行文案三族全不命中（哨兵的假阳性 = 零）
  for (const url of API_HOST_URLS) {
    assert.deepEqual(familiesHitting(gateWebFetch(url).reason), [], `现行 reason 不得命中任何族: ${url}`)
  }
})

test('现行 deny reason 零数字：结构性文案不含任何数字量纲', () => {
  // 从严口径：结构性约束是永恒判据，任何数字要么是量纲（A/B 族），要么是序数。
  // 序数写中文即可（"第一种"），所以 reason 禁数字是安全且最强的护栏。
  // 依据：Task 01 已确认现行 reason 无数字（README 里的 5000/h 在 README，不在 reason）。
  for (const url of API_HOST_URLS) {
    assert.doesNotMatch(gateWebFetch(url).reason, /\d/, `deny reason 应保持零数字: ${url}`)
  }
})

test('deny reason 对子域主机 same-shape 插值（.githubusercontent.com 尾缀拦截面）', () => {
  const deny = gateWebFetch('https://media.githubusercontent.com/o/r/x')
  assert.equal(deny.action, 'deny')
  assert.match(deny.reason, /media\.githubusercontent\.com/, '尾缀拦截面同样注入实际 host')
  assert.doesNotMatch(deny.reason, STALE_OBSERVATION)
})

test('curl 打 GitHub API → 注入 $(gh auth token) 头', () => {
  const r = rewriteGithubCommand('curl -s https://api.github.com/repos/x/y')
  assert.equal(r.changed, true)
  assert.equal(r.note, 'api-auth-header')
  assert.match(r.command, /^curl -H "Authorization: Bearer \$\(gh auth token\)" /)
  assert.match(r.command, /api\.github\.com/)
  // token 值永不出现在命令字符串里（只出现命令替换形式）
  assert.doesNotMatch(r.command, /ghp_|github_pat_/)
})

test('wget 同样注入；已认证命令不重复注入', () => {
  const w = rewriteGithubCommand('wget -q https://raw.githubusercontent.com/o/r/main/f.txt')
  assert.equal(w.changed, true)
  assert.match(w.command, /^wget --header="Authorization: Bearer \$\(gh auth token\)"/)
  const already = 'curl -H "Authorization: Bearer ghp_x" https://api.github.com/x'
  assert.equal(rewriteGithubCommand(already).changed, false)
  const substitution = 'curl -H "Authorization: Bearer $(gh auth token)" https://api.github.com/x'
  assert.equal(rewriteGithubCommand(substitution).changed, false)
})

test('非 API 的 curl 不动；复杂首 token 保守放行', () => {
  assert.equal(rewriteGithubCommand('curl -s https://example.com').changed, false)
  assert.equal(rewriteGithubCommand('FOO=1 curl -s https://api.github.com/x').changed, false)
  assert.equal(rewriteGithubCommand('echo ok').changed, false)
})

test('git clone https → gh repo clone', () => {
  const r = rewriteGithubCommand('git clone https://github.com/rtk-ai/rtk')
  assert.deepEqual(r, { command: 'gh repo clone rtk-ai/rtk', changed: true, note: 'clone-via-gh' })
  const withDir = rewriteGithubCommand('git clone https://github.com/o/r.git mydir --depth 1')
  assert.equal(withDir.command, 'gh repo clone o/r mydir --depth 1')
  // ssh / 含替换 / 非 github 主机 → 放行
  assert.equal(rewriteGithubCommand('git clone git@github.com:o/r.git').changed, false)
  assert.equal(rewriteGithubCommand('git clone https://gitlab.com/o/r').changed, false)
  assert.equal(rewriteGithubCommand('git clone https://github.com/o/$REPO').changed, false)
})

test('gh 命令原样放行（自带认证）', () => {
  assert.equal(rewriteGithubCommand('gh api repos/x/y').changed, false)
  assert.equal(rewriteGithubCommand('gh pr list').changed, false)
})

test('targetsGithubApi 观察函数', () => {
  assert.equal(targetsGithubApi('curl -s https://api.github.com/x'), true)
  assert.equal(targetsGithubApi('curl -s https://example.com'), false)
})
