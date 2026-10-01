// k-constraints.test.mjs — Task 17 核心交付：K-1~K-11 机械判据矩阵 + grep 判据封装（可重复执行）
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// K-1~K-11 判据矩阵（对照 changes/20260930-phase0/constitution.md §一/§三；每条 K → 恰一个
// 测试名或一条 grep 断言，一一对应；test=自动化测试 / grep=静态机械断言）
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ┌──────┬─────────────────────────────┬──────────────────────────────────────────────────────┬────────┐
// │ K    │ 条款要点（constitution）      │ 主判据（唯一，与测试一一对应）                        │ 类型   │
// ├──────┼─────────────────────────────┼──────────────────────────────────────────────────────┼────────┤
// │ K-1  │ 返回守 ContentBlock[] 契约   │ integration.test.mjs「K-1：集成全链——注册 → search   │ test   │
// │      │ （INV-1，禁裸对象返回）       │  成功 → handler 返回 ContentBlock[]（US-1）」          │        │
// │ K-2  │ patch - id: web 重述        │ 本文件「K-2：cordis.patch.yml「- id: web」唯一行且    │ grep   │
// │      │ fetchProvider: http（INV-2）│  重述 fetchProvider: http（grep 判据）」                │        │
// │ K-3  │ registerSearchProvider 幂等 │ provider.test.mjs「重复 apply 注册幂等：不抛          │ test   │
// │      │ （INV-3，禁 WEB_DUPLICATE 抛）│ WEB_DUPLICATE_PROVIDER、同 id 只留一份（K-3）」        │        │
// │ K-4  │ 出网只含查询词+必要参数、    │ 本文件「K-4：出网面隐私 grep 封装（INV-4 可重复       │ grep   │
// │      │ 凭据零明文（INV-4）           │  执行）」；运行时面支撑=四源 searchParams.size===1      │        │
// │      │                             │  （sources-ddg.test 同形批）                            │        │
// │ K-5  │ 反爬/验证码命中即停         │ integration.test.mjs「K-5/INV-5：集成链反爬命中即停  │ test   │
// │      │ （INV-5，禁重试硬刚）         │  ——不重试不切源，明示块上行」；单元支撑=e2e-blocked    │        │
// │      │                             │  .test.mjs（状态类/body 类双径）                        │        │
// │ K-6  │ 预算熔断单调、禁无上限重试   │ 本文件「K-6：裸调用（无 signal）= between-source      │ test   │
// │      │ （INV-6；W5R-N1 钉死判据口径：│  让位语义，在途切断归 guard（W5R-N1）」；支撑=guard     │        │
// │      │ 裸调用=让位，在途切断归 guard）│ .test.mjs 单调守卫 + 其内 K-6 grep（无界循环）          │        │
// │ K-7  │ 数据只落 ~/.dsh 插件专属目录 │ cache.test.mjs「落点纪律（K-7）：文件只出现在注入     │ test   │
// │      │ 且可配（INV-7）               │  目录，重启恢复 TTL 内条目」                            │        │
// │ K-8  │ 零构建纯 ESM、依赖归类       │ 本文件「K-8：lib 导入面白名单 + package.json 依赖     │ grep   │
// │      │ （INV-8，禁未声明依赖）       │  归类（零构建 ESM，grep 判据）」                        │        │
// │ K-9  │ 超时/重试/条数/TTL/预算/     │ 本文件「K-9：Config 管控键零硬编码 grep（豁免注记：  │ grep   │
// │      │ 源开关全 Config 可配（INV-9）│  镜像三处各带防漂移测试）」；豁免注记见文件尾专节        │        │
// │ K-10 │ takeOver:auto 让位不默认抢占 │ provider.test.mjs「takeOver=auto 显式他家指针：让位  │ test   │
// │      │ （INV-10）                    │  不接管——available()=false + 告警日志 + 指针不动（K-10）」│      │
// │ K-11 │ 视觉只引 dsh token、禁自造色 │ 本文件「K-11：web/src 自造色零命中 grep（色板 token）│ grep   │
// │      │ 、组件 ≤300 行（DESIGN.md）   │  + 组件 ≤300 行」                                       │        │
// └──────┴─────────────────────────────┴──────────────────────────────────────────────────────┴────────┘
//
// K-9 豁免注记（硬化清单⑨）：三处镜像字面量豁免出「零硬编码」扫描，且各带防漂移测试钉死——
//   ① lib/index.js：Config schema 本体（默认值唯一权威定义处，非豁免无从谈起）；
//   ② lib/strategy.js DEFAULT_BUDGET_MIRROR：strategy.test.mjs「镜像 egoBudget=Config 默认」钉死；
//   ③ web/src/lib/budget-model.js R5_DEFAULTS：web/test/budget-model.test.mjs「默认值漂移」钉死
//      （预算面 UI 镜像，验收要求+防漂移测试在——progress.md carry 入 W7 原文）。
// 本文件的 K-9 用例在扫描后自证②③的防漂移测试真实在场（豁免不落空）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createAggregator } from '../lib/aggregate.js'
import { CHAIN_BUDGET_CODE } from '../lib/guard.js'
import { Config } from '../lib/index.js'

const LIB_DIR = fileURLToPath(new URL('../lib/', import.meta.url))
const WEB_SRC_DIR = fileURLToPath(new URL('../web/src/', import.meta.url))
const TEST_DIR = fileURLToPath(new URL('./', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** 递归列目录下指定后缀文件（相对路径排序，稳定扫描序）。 */
function filesUnder(root, exts) {
  return readdirSync(root, { recursive: true })
    .map((rel) => String(rel))
    .filter((rel) => exts.some((ext) => rel.endsWith(ext)))
    .map((rel) => path.join(root, rel))
    .sort()
}

/** 读文件全文（UTF-8）。 */
const read = (file) => readFileSync(file, 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// K-2（INV-2）：patch 整行替换 - id: web 必须重述 fetchProvider: http，且该行唯一（禁重复注册）。
// ─────────────────────────────────────────────────────────────────────────────
test('K-2：cordis.patch.yml「- id: web」唯一行且重述 fetchProvider: http（grep 判据）', () => {
  const lines = read(path.join(PLUGIN_ROOT, 'cordis.patch.yml')).split('\n')
  const isWebEntry = (line) => /^\s*-\s+id:\s*web\s*$/.test(line)
  const hits = lines.map((line, index) => (isWebEntry(line) ? index : -1)).filter((index) => index >= 0)
  assert.equal(hits.length, 1, `「- id: web」必须恰好一行（重复注册/破坏 web_fetch 面），实得 ${hits.length}`)
  // 取该行之后的 config 块（到下一个同级列表项或顶格键为止）
  const block = []
  for (let i = hits[0] + 1; i < lines.length; i += 1) {
    if (/^\s*-\s+id:/.test(lines[i]) || /^\S/.test(lines[i])) break
    block.push(lines[i])
  }
  assert.ok(block.some((line) => /fetchProvider:\s*http\s*$/.test(line)), 'web config 块必须重述 fetchProvider: http（保 web_fetch，INV-2）')
  assert.ok(block.some((line) => /searchProvider:\s*dsh-clsh-search\s*$/.test(line)), 'searchProvider 指到本插件（接管缝）')
})

// ─────────────────────────────────────────────────────────────────────────────
// K-4（INV-4）隐私 grep 封装：可重复执行的静态判据——①唯一出网点（fetch 只在公共抓取层）；
// ②凭据类标识（env 读取/密钥形态）全 lib 零命中；③上下文类标识（vault/记忆/会话等）在出网构造
// 面（lib/sources/**）零命中。运行时面（出网只发查询词）由四源测试的 searchParams.size===1 支撑。
// ─────────────────────────────────────────────────────────────────────────────
test('K-4：出网面隐私 grep 封装（INV-4 可重复执行）', async () => {
  const libFiles = filesUnder(LIB_DIR, ['.js'])
  assert.ok(libFiles.length >= 10, 'lib 扫描面齐（平铺模块 + sources 四源）')

  // ① 唯一出网点：fetch( 只允许出现在 lib/sources/common.js（裸 fetch + 正则路线的唯一出口）
  const fetchSites = []
  for (const file of libFiles) {
    if (/(^|[^.\w])fetch\s*\(/.test(read(file))) fetchSites.push(path.relative(LIB_DIR, file))
    // 其余网络出口一律禁止（http 客户端/XHR/beacon/websocket/动态 import URL）
    const content = read(file)
    for (const pattern of [/XMLHttpRequest/, /sendBeacon/, /node:http/, /node:https/, /axios/, /WebSocket\s*\(/, /from\s+['"]node:net['"]/]) {
      assert.equal(pattern.test(content), false, `${path.basename(file)} 出现禁用网络出口 ${pattern}`)
    }
  }
  assert.deepEqual(fetchSites, ['sources/common.js'], '唯一出网点 = lib/sources/common.js')

  // ② 凭据类标识：全 lib 零命中（禁读 env、禁密钥/令牌形态字面——凭据只以 env 名引用，P-5/K-4）
  const credentialPatterns = [
    [/process\.env/i, '环境变量读取'],
    [/api[_-]?key/i, 'api key 形态'],
    [/access[_-]?token/i, 'access token 形态'],
    [/\bbearer\b/i, 'Bearer 头'],
    [/authorization/i, 'authorization 头'],
    [/password/i, 'password 字样'],
    [/\bsecret\b/i, 'secret 字样'],
    [/['"]sk-[A-Za-z0-9]{8,}/, '明文 key 字面'],
    [/ghp_[A-Za-z0-9]{8,}/, '明文 token 字面'],
  ]
  for (const file of libFiles) {
    const content = read(file)
    for (const [pattern, what] of credentialPatterns) {
      assert.equal(pattern.test(content), false, `${path.relative(LIB_DIR, file)} 命中凭据类标识（${what}，K-4/P-5）`)
    }
  }

  // ③ 上下文类标识：出网构造面（lib/sources/**）零命中——vault/记忆/会话等绝不出现在出网构造代码
  const contextPatterns = [/\bvault\b/i, /obsidian/i, /记忆/, /会话/, /\bsession\b/i, /conversation/i, /localFile/i]
  for (const file of filesUnder(path.join(LIB_DIR, 'sources'), ['.js'])) {
    const content = read(file)
    for (const pattern of contextPatterns) {
      assert.equal(pattern.test(content), false, `${path.basename(file)} 命中上下文类标识 ${pattern}（禁拼接上下文出网，K-4/INV-4）`)
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// K-6（INV-6）+ W5R-N1：裸调用（无 signal）= between-source 让位语义，在途切断归 guard。
// 裸调用路径（aggregate 直驱，无 guard.chain 信号）预算只在「源与源之间」前置检查让位——
// 绝不自置定时器强切在途；在途切断的唯一权威是 guard.chain 合成 signal（runSearch 接线）。
// ─────────────────────────────────────────────────────────────────────────────
test('K-6：裸调用（无 signal）= between-source 让位语义，在途切断归 guard（W5R-N1）', async () => {
  // a) 首源在途期间不被裸调用强切；首源耗时越过 deadline → 下一源发起前让位收口
  let clock = 1_000_000
  const config = Config.parse({ chainBudgetMs: 30 })
  const first = {
    name: 'ddg',
    enabled: true,
    calls: 0,
    async search() {
      this.calls += 1
      clock += 10_000 // 首源执行期间越过 deadline（模拟真实耗时）
      return { sources: [] }
    },
  }
  const second = { name: 'bing', enabled: true, calls: 0, async search() { this.calls += 1; return { sources: [] } } }
  const { aggregate } = createAggregator(config, [first, second], { now: () => clock })
  const outcome = await aggregate('bare-call probe') // 裸调用：无 signal
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'chain-budget', '越过 deadline → 预算让位收口（between-source 前置检查）')
  assert.equal(outcome.error.code, CHAIN_BUDGET_CODE, '结构化预算错误码（K-6 明示面）')
  assert.equal(first.calls, 1, '首源已执行——其在途期间不被裸调用强切（让位语义）')
  assert.equal(second.calls, 0, '预算耗尽后不再发起新源请求（让位在发起之前，禁无上限重试）')
  assert.match(outcome.blocks[0].text, /整链预算/, '预算耗尽明示块（K-1 载体）')

  // b) 在途切断归 guard：裸调用传到源的 signal 恒为未中止（中止权只在 guard.chain 合成 signal）
  let captured
  const probe = {
    name: 'so360',
    enabled: true,
    async search(query, signal) {
      captured = signal
      return { sources: [] }
    },
  }
  const bare = createAggregator(Config.parse({}), [probe])
  await bare.aggregate('signal probe')
  assert.ok(captured instanceof AbortSignal, '源调用收到 AbortSignal（K-4 契约形）')
  assert.equal(captured.aborted, false, '裸调用：aggregate 不中止在途——在途切断归 guard（W5R-N1 钉死）')

  // c) 单权威 grep：aggregate.js 不自置任何预算定时器（Ruling-14 退役面不回潮）
  assert.equal(
    /setTimeout|setInterval/.test(read(path.join(LIB_DIR, 'aggregate.js'))),
    false,
    'aggregate.js 零定时器——预算定时权威唯一在 guard.js（K-6 单权威）',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// K-8（INV-8）：零构建纯 ESM；第三方进 dependencies、@deepseek-ai/* 只可 peer+dev 双声明；
// lib 导入面 = node: 内建 / zod / 相对路径（禁未声明外部依赖）。
// ─────────────────────────────────────────────────────────────────────────────
test('K-8：lib 导入面白名单 + package.json 依赖归类（零构建 ESM，grep 判据）', () => {
  const pkg = JSON.parse(read(path.join(PLUGIN_ROOT, 'package.json')))
  assert.equal(pkg.type, 'module', '零构建纯 ESM（type=module）')
  const deps = Object.keys(pkg.dependencies ?? {}).sort()
  assert.deepEqual(deps, ['zod'], 'dependencies 恰为 zod（第三方统一进 dependencies 的裁定面）')
  assert.equal(deps.some((key) => key.startsWith('@deepseek-ai/')), false, '@deepseek-ai/* 禁入 dependencies（peer+dev 双声明口径）')
  const peerAndDev = [...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
  for (const key of peerAndDev) {
    assert.ok(key.startsWith('@deepseek-ai/'), `peer/dev 面只允许 @deepseek-ai/*，发现 ${key}（K-8/INV-8）`)
  }
  for (const file of filesUnder(LIB_DIR, ['.js'])) {
    const content = read(file)
    const rel = path.relative(LIB_DIR, file)
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1]
      const ok = spec.startsWith('node:') || spec === 'zod' || spec.startsWith('./') || spec.startsWith('../')
      assert.ok(ok, `${rel} 导入未声明说明符 "${spec}"（K-8：禁引入 TECH.md 未声明依赖）`)
    }
    // client.js 的 require 走宿主装载器基座 require 表（wiki-steward 同款：react 不进包依赖）
    for (const match of content.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1]
      assert.ok(spec === 'react' || spec.startsWith('./') || spec.startsWith('../'), `${rel} require 未声明模块 "${spec}"`)
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// K-9（INV-9）+ 硬化⑨豁免注记：超时/重试/条数/TTL/预算/源开关全部 Config 可配——扫描面上
// 零硬编码字面（豁免三处镜像，且豁免逐一带防漂移测试自证，见文件头「K-9 豁免注记」专节）。
// ─────────────────────────────────────────────────────────────────────────────
test('K-9：Config 管控键零硬编码 grep（豁免注记：镜像三处各带防漂移测试）', () => {
  const KEYS = ['timeoutMs', 'retries', 'maxResults', 'cacheTtlMs', 'egoBudget', 'chainBudgetMs']
  const EXEMPT = new Map([
    [path.join(LIB_DIR, 'index.js'), 'Config schema 权威源（默认值唯一定义处）'],
    [path.join(LIB_DIR, 'strategy.js'), 'DEFAULT_BUDGET_MIRROR 镜像（strategy.test.mjs 漂移钉死）'],
    [path.join(WEB_SRC_DIR, 'lib', 'budget-model.js'), 'R5_DEFAULTS 镜像（web/test/budget-model.test.mjs 漂移钉死）'],
  ])
  const scan = [...filesUnder(LIB_DIR, ['.js']), ...filesUnder(WEB_SRC_DIR, ['.js', '.vue', '.css'])]
  const keyPattern = new RegExp(`\\b(${KEYS.join('|')})\\s*[:=]\\s*\\d`)
  const switchPattern = /\b(ddg|bing|so360|baidu)\s*[:=]\s*(true|false)\b/
  const hits = []
  for (const file of scan) {
    if (EXEMPT.has(file)) continue
    const content = read(file)
    if (keyPattern.test(content)) hits.push(`${path.relative(PLUGIN_ROOT, file)}：管控键字面数值`)
    if (switchPattern.test(content)) hits.push(`${path.relative(PLUGIN_ROOT, file)}：源开关字面布尔`)
  }
  assert.deepEqual(hits, [], 'K-9：管控键零硬编码——默认值只存在于 Config schema（INV-9）')

  // 豁免面自证（⑨）：三处豁免各自防漂移测试真实在场，豁免不落空
  assert.ok(
    /DEFAULT_BUDGET_MIRROR\.egoBudget, defaults\.egoBudget/.test(read(path.join(TEST_DIR, 'strategy.test.mjs'))),
    '豁免②自证：strategy 镜像=Config.parse({}) 漂移钉在场',
  )
  const webTestDir = WEB_SRC_DIR.replace(`${path.sep}web${path.sep}src${path.sep}`, `${path.sep}web${path.sep}test${path.sep}`)
  assert.ok(
    /默认值漂移/.test(read(path.join(webTestDir, 'budget-model.test.mjs'))),
    '豁免③自证：web R5_DEFAULTS 漂移钉在场（web/test/budget-model.test.mjs）',
  )
  assert.ok(
    /R5 确认表逐项一致/.test(read(path.join(TEST_DIR, 'config.test.mjs'))),
    '豁免①自证：Config schema=R5 权威源逐项钉在场',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// K-11（DESIGN.md）：视觉只引 dsh token——色板 grep（hex/rgb/hsl 字面零命中）+ 组件 ≤300 行
// + 禁 v-if（重交互禁令的机械面；语义面由 W6.6 形制对照审查承载）。
// ─────────────────────────────────────────────────────────────────────────────
test('K-11：web/src 自造色零命中 grep（色板 token）+ 组件 ≤300 行', () => {
  const files = filesUnder(WEB_SRC_DIR, ['.js', '.vue', '.css'])
  assert.ok(files.length >= 5, 'web/src 扫描面齐（组件/逻辑/样式）')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
  const offenders = []
  for (const file of files) {
    const content = read(file)
    const rel = path.relative(WEB_SRC_DIR, file)
    if (hexPattern.test(content)) offenders.push(`${rel}：硬编码 hex`)
    if (rgbPattern.test(content)) offenders.push(`${rel}：硬编码 rgb/hsl`)
    if (file.endsWith('.vue')) {
      const lineCount = content.split('\n').length
      assert.ok(lineCount <= 300, `${rel} 组件 ${lineCount} 行超 300 行上限（K-11）`)
      assert.equal(/v-if/.test(content), false, `${rel} 出现 v-if（K-11 禁 v-if 重交互；本包口径=组件零 v-if）`)
    }
  }
  assert.deepEqual(offenders, [], 'K-11：自造色零命中——视觉只引 dsh token（var(--dsw-*)）')
})
