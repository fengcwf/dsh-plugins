// kb_validate 单测（Task 10，A2/INV-15 承载）：六规则机械校验 + quickCheck 快检缝 + verdict 语义。
// 覆盖面（brief 测试清单逐条）：
//   ① 每规则正反例（frontmatter/index/naming/placement/structure/evidence）
//   ② 34 存量 syntheses 命名不误报（INV-10 硬验收；样本=实盘 wiki/syntheses 严格 kebab 违规全集，脚本复算锁定）
//   ③ 证据清单缺引用必 FAIL（INV-15 反例）
//   ④ INDEX 双向死链/漏登
//   ⑤ quickCheck 秒级语义（快检=①③④子集，不跑全量六规则）
//   ⑥ 输出 JSON 形状稳定（无 -0/NaN；键面固定；JSON 往返等值）
// 真被测件零 mock：lib/validate.js 直接真读文件系统；每测试独立 mkdtemp 临时 vault；零写盘（快照对账）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const { kbValidate, quickCheck, RULES } = await import('../lib/validate.js')

// ── fixture 工具 ─────────────────────────────────────────────────────────────

const mkVault = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-validate-'))
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true })
  fs.writeFileSync(path.join(root, 'wiki', 'INDEX.md'), INDEX_SEED)
  return root
}

const put = (root, rel, content) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
  return p
}

const INDEX_SEED = `---
title: Wiki 索引
date: 2026-05-07
tags: [索引]
status: active
source: manual
related: []
---

# Wiki 索引

- [[concepts/梯度计费|梯度计费]] — 计费模型
`

/** 默认合规正文（四段齐 + wikilink 合法） */
const BODY = `## 概述
说明 what/why。

## 关键点
- **要点一** 说明。

## 关联
- [[concepts/梯度计费|梯度计费]] 相关概念。

## 来源
- raw/素材.md
`

/** 生成 frontmatter 文本：fields 顺序保持插入序，值为原始 YAML 片段 */
const fm = (fields) => ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n')

const GOOD_FIELDS = {
  title: '"测试页"',
  date: '2026-05-05',
  tags: '[测试]',
  status: 'active',
  source: '"raw/素材.md"',
  related: '[]',
}

const page = (fields = GOOD_FIELDS, body = BODY) => fm(fields) + '\n' + body

// ── ② 34 存量 syntheses 命名样本组（INV-10 硬验收） ─────────────────────────
// 口径：wiki/syntheses 存量 45 页中违反严格 kebab-case（含大写/中文/点）的 34 个
// = vault-health-inventory-2026-09-23 认定的「syntheses 34」（Q13 存量不重命名豁免面）。
const LEGACY_34 = [
  '2026-05-05-Clippings架构优化分析报告',
  '2026-05-05-Kanban-Git-Handoff优化报告',
  '2026-05-05-Karpathy-LLM-Wiki调研分析',
  '2026-05-05-MCP-Hooks方案报告',
  '2026-05-05-MCP与Skill冲突分析',
  '2026-05-05-Wiki-Lint修复报告',
  '2026-05-05-hermes官方文档架构分析',
  '2026-05-05-架构优化P1-P2实施方案',
  '2026-05-05-架构优化现状与待办分析',
  '2026-05-07-01-40-Obsidian-Wiki架构重整方案',
  '2026-05-07-01-56-Obsidian-Wiki架构重整方案-v2',
  '2026-05-08-17-00-Ar9av-obsidian-wiki-调研报告',
  '2026-05-09-00-18-Obsidian-Wiki脚本合并分析',
  '2026-05-09-01-10-Kanban落地分析',
  '2026-05-09-06-47-Token消耗优化分析',
  '2026-05-09-07-04-AI-Coding-Agent技能框架调研',
  '2026-05-10-01-29-AgentMemory评估-报告落地验证',
  '2026-05-10-02-14-gstack-superpowers-coder优化分析',
  '2026-05-12-01-30-openspec-借鉴-wiki-projects-升级设计',
  '2026-05-15-clsh-project-optimization-v2.3.0',
  '2026-05-22-autoresearch-分析报告',
  '2026-05-24-21-00-wiki架构治理与数据流规范',
  '2026-05-24-21-45-codegraph-调研分析',
  '2026-05-25-clsh-project-借鉴-mattpocock-skills-优化分析',
  '2026-09-17-11-00-clsh-project-总体报告调研方案',
  '2026-09-18-11-37-ponytail-github项目调研',
  '2026-09-18-11-43-ponytail-clsh-project结合三轮分析',
  '2026-09-20-16-53-Hermes迁移DSH平台调研',
  '2026-09-20-17-00-DSH迁移指导方案-记忆Skill项目Wiki四域',
  '2026-09-20-21-45-Hermes环境全量说明-DSH迁移输入v2',
  '2026-09-22-01-50-Hermes环境配置全录-迁移底稿',
  'BOOT-启动自检方案',
  'Watchdog-定时巡检方案',
  'hermes-多agent架构-claude-code集成',
]

test('② INV-10 硬验收：34 存量 syntheses 命名样本组零误报（naming 规则全过）', async () => {
  assert.equal(LEGACY_34.length, 34, '样本组恰为 34 个（实盘严格 kebab 违规全集）')
  const root = mkVault()
  for (const stem of LEGACY_34) {
    put(root, `wiki/syntheses/${stem}.md`, page())
    const r = await kbValidate(path.join(root, 'wiki/syntheses', `${stem}.md`), { rules: ['naming'], vaultRoot: root })
    assert.deepEqual(r.findings, [], `存量命名不得误报：${stem}`)
    assert.equal(r.verdict, 'pass', `存量命名 verdict 必须 pass：${stem}`)
  }
})

// ── ③ naming 正反例（类型化命名表 Q13） ────────────────────────────────────

test('③ naming 正例：四类类型化形态 + 基础设施豁免 + 带时间戳英文描述段', async () => {
  const root = mkVault()
  const ok = [
    'wiki/concepts/梯度计费.md', // 概念/实体/主题 → 中文名
    'wiki/sources/运维操作记录 - 2026-05-05-14-30.md', // Session 产物 → 标题 - YYYY-MM-DD-HH-MM
    'wiki/syntheses/2026-05-05-23-30-调研方案.md', // 报告 → YYYY-MM-DD-HH-MM-标题
    'wiki/syntheses/2026-05-03-新客户需求.md', // 素材 → YYYY-MM-DD-简短描述
    'wiki/syntheses/2026-05-15-clsh-project-optimization-v2.3.0.md', // 时间戳形态下英文描述段/点号合法
    'wiki/INDEX.md', // 基础设施豁免（纯英文）
    'wiki/reference/ERRORS.md', // 基础设施豁免
    'wiki/reference/lint-report.md', // 机器产物豁免
  ]
  for (const rel of ok) {
    put(root, rel, page())
    const r = await kbValidate(path.join(root, rel), { rules: ['naming'], vaultRoot: root })
    assert.deepEqual(r.findings, [], `类型化形态必须零 finding：${rel}`)
  }
})

test('③ naming 反例：裸纯英文（非豁免）warn；非法字符/超 50 字 error', async () => {
  const root = mkVault()
  const bare = put(root, 'wiki/syntheses/loop-engineering-clsh-project-l4-analysis.md', page())
  const r1 = await kbValidate(bare, { rules: ['naming'], vaultRoot: root })
  assert.equal(r1.findings.length, 1)
  assert.equal(r1.findings[0].rule, 'naming')
  assert.equal(r1.findings[0].severity, 'warn', '纯英文形态违规=warn（命名形态欠账，非硬禁令）')
  assert.equal(r1.verdict, 'warn')

  const bad = put(root, 'wiki/concepts/坏:名字.md', page())
  const r2 = await kbValidate(bad, { rules: ['naming'], vaultRoot: root })
  assert.equal(r2.findings.length, 1)
  assert.equal(r2.findings[0].severity, 'error', '特殊字符=硬禁止 error')
  assert.equal(r2.verdict, 'fail')

  const long = put(root, `wiki/concepts/${'长'.repeat(51)}.md`, page())
  const r3 = await kbValidate(long, { rules: ['naming'], vaultRoot: root })
  assert.equal(r3.findings.length, 1)
  assert.equal(r3.findings[0].severity, 'error', '超过 50 字=error')
  assert.match(r3.findings[0].message, /50/)
})

// ── ① frontmatter 正反例（六字段内容，wiki-ingest 口径） ─────────────────────

test('① frontmatter 正例：六字段齐全合法 → 零 finding', async () => {
  const root = mkVault()
  const f = put(root, 'wiki/concepts/梯度计费.md', page())
  const r = await kbValidate(f, { rules: ['frontmatter'], vaultRoot: root })
  assert.deepEqual(r.findings, [])
  assert.equal(r.verdict, 'pass')
})

test('① frontmatter 反例：六字段逐个缺失各自 error', async () => {
  const root = mkVault()
  for (const key of ['title', 'date', 'tags', 'status', 'source', 'related']) {
    const fields = { ...GOOD_FIELDS }
    delete fields[key]
    const f = put(root, `wiki/concepts/缺-${key}.md`, page(fields))
    const r = await kbValidate(f, { rules: ['frontmatter'], vaultRoot: root })
    assert.equal(r.findings.length, 1, `缺 ${key} 恰一条 finding`)
    assert.equal(r.findings[0].rule, 'frontmatter')
    assert.equal(r.findings[0].severity, 'error')
    assert.match(r.findings[0].message, new RegExp(key))
    assert.equal(r.verdict, 'fail', `缺 ${key} 必 FAIL`)
  }
})

test('① frontmatter 反例：title 超 50 字 / date 非法 / tags 空 / status 词表外 / 无 frontmatter', async () => {
  const root = mkVault()
  const cases = [
    [{ ...GOOD_FIELDS, title: `"${'长'.repeat(51)}"` }, /title/],
    [{ ...GOOD_FIELDS, date: '2026-13-45' }, /date/],
    [{ ...GOOD_FIELDS, date: '2026/05/05' }, /date/],
    [{ ...GOOD_FIELDS, tags: '[]' }, /tags/],
    [{ ...GOOD_FIELDS, status: '完成' }, /status/],
    [{ ...GOOD_FIELDS, source: '""' }, /source/],
  ]
  for (const [fields, pat] of cases) {
    const f = put(root, `wiki/concepts/反例-${Math.random().toString(36).slice(2, 8)}.md`, page(fields))
    const r = await kbValidate(f, { rules: ['frontmatter'], vaultRoot: root })
    assert.equal(r.findings.length, 1, `恰一条：${pat}`)
    assert.equal(r.findings[0].severity, 'error')
    assert.match(r.findings[0].message, pat)
  }
  const noFm = put(root, 'wiki/concepts/无frontmatter.md', '# 裸页\n')
  const r = await kbValidate(noFm, { rules: ['frontmatter'], vaultRoot: root })
  assert.equal(r.findings.length, 1)
  assert.match(r.findings[0].message, /frontmatter/)
  assert.equal(r.verdict, 'fail')
})

test('① solutions 页 reusability 必填且 ∈ {cross-project,project-specific,one-time}（T15 欠账判据）', async () => {
  const root = mkVault()
  const ok = put(root, 'wiki/solutions/复用方案.md', page({ ...GOOD_FIELDS, reusability: 'cross-project' }))
  assert.deepEqual((await kbValidate(ok, { rules: ['frontmatter'], vaultRoot: root })).findings, [])

  const missing = put(root, 'wiki/solutions/缺复用.md', page())
  const r1 = await kbValidate(missing, { rules: ['frontmatter'], vaultRoot: root })
  assert.equal(r1.findings.length, 1)
  assert.match(r1.findings[0].message, /reusability/)
  assert.equal(r1.verdict, 'fail')

  const bogus = put(root, 'wiki/solutions/坏复用.md', page({ ...GOOD_FIELDS, reusability: 'sometimes' }))
  const r2 = await kbValidate(bogus, { rules: ['frontmatter'], vaultRoot: root })
  assert.equal(r2.findings.length, 1)
  assert.match(r2.findings[0].message, /reusability/)
})

test('① 项目文档 status 词表（overview: active/paused/completed；proposal: draft/approved/rejected）', async () => {
  const root = mkVault()
  const ov = put(root, 'wiki/projects/p1/overview.md', page({ ...GOOD_FIELDS, status: 'paused' }))
  assert.deepEqual((await kbValidate(ov, { rules: ['frontmatter'], vaultRoot: root })).findings, [])
  const pr = put(root, 'wiki/projects/p1/changes/c1/proposal.md', page({ ...GOOD_FIELDS, status: 'approved' }))
  assert.deepEqual((await kbValidate(pr, { rules: ['frontmatter'], vaultRoot: root })).findings, [])
  const bad = put(root, 'wiki/projects/p2/overview.md', page({ ...GOOD_FIELDS, status: 'draft' }))
  const r = await kbValidate(bad, { rules: ['frontmatter'], vaultRoot: root })
  assert.equal(r.findings.length, 1)
  assert.match(r.findings[0].message, /status/)
})

// ── ④ INDEX 双向（正反例） ──────────────────────────────────────────────────

test('④ index 正例：路径形与 stem 形登记都算已登记', async () => {
  const root = mkVault()
  put(root, 'wiki/INDEX.md', INDEX_SEED + '- [[syntheses/2026-05-05-分析|分析]] — x\n')
  const f = put(root, 'wiki/syntheses/2026-05-05-分析.md', page())
  const r = await kbValidate(f, { rules: ['index'], vaultRoot: root })
  assert.deepEqual(r.findings, [])

  const g = put(root, 'wiki/concepts/梯度计费.md', page()) // INDEX_SEED 已用 stem 形登记
  assert.deepEqual((await kbValidate(g, { rules: ['index'], vaultRoot: root })).findings, [])
})

test('④ index 反例：漏登（页面未登记）→ error FAIL', async () => {
  const root = mkVault()
  const f = put(root, 'wiki/syntheses/2026-05-06-孤儿页.md', page())
  const r = await kbValidate(f, { rules: ['index'], vaultRoot: root })
  assert.equal(r.findings.length, 1)
  assert.equal(r.findings[0].rule, 'index')
  assert.equal(r.findings[0].severity, 'error')
  assert.match(r.findings[0].message, /登记|漏登|INDEX/)
  assert.equal(r.verdict, 'fail')
})

test('④ index 反例：INDEX 死链（条目指向不存在页面）→ error 带行号', async () => {
  const root = mkVault()
  put(root, 'wiki/concepts/梯度计费.md', page()) // INDEX_SEED 种子条目指向的真实页（隔离死链面）
  const idx = put(root, 'wiki/INDEX.md', INDEX_SEED + '- [[syntheses/2026-05-09-不存在|幽灵]] — x\n')
  const r = await kbValidate(idx, { rules: ['index'], vaultRoot: root })
  assert.equal(r.findings.length, 1)
  assert.equal(r.findings[0].rule, 'index')
  assert.equal(r.findings[0].severity, 'error')
  assert.equal(typeof r.findings[0].line, 'number')
  assert.ok(r.findings[0].line >= 1)
  assert.match(r.findings[0].message, /死链|不存在/)
})

// ── ④ placement 正反例（目录归属，wiki-ingest 归属表 + 禁令） ────────────────

test('④ placement 正例：归属目录与基础设施根文件 → 零 finding', async () => {
  const root = mkVault()
  const ok = [
    'wiki/INDEX.md',
    'wiki/concepts/梯度计费.md',
    'wiki/entities/1号厂房.md',
    'wiki/sources/某素材 - 2026-05-05-14-30.md',
    'wiki/syntheses/2026-05-05-23-30-调研方案.md',
    'wiki/diagrams/架构图.md',
    'wiki/reference/tools.md',
    'wiki/solutions/单层方案.md',
    'wiki/projects/p1/overview.md',
    'wiki/projects/p1/changes/c1/tasks.md',
  ]
  for (const rel of ok) {
    put(root, rel, page())
    const r = await kbValidate(path.join(root, rel), { rules: ['placement'], vaultRoot: root })
    assert.deepEqual(r.findings, [], `归属正确不得报：${rel}`)
  }
})

test('④ placement 反例：wiki 根放页 / solutions 二级嵌套 / 未归属目录 / 项目文档缺项目层', async () => {
  const root = mkVault()
  const bad = [
    ['wiki/hermes-cli-reference.md', /根/],
    ['wiki/solutions/phase8-enforcement/solution.md', /嵌套|二级/],
    ['wiki/weird/游离页.md', /归属/],
    ['wiki/projects/孤儿.md', /projects\//],
  ]
  for (const [rel, pat] of bad) {
    const f = put(root, rel, page())
    const r = await kbValidate(f, { rules: ['placement'], vaultRoot: root })
    assert.equal(r.findings.length, 1, `恰一条 placement：${rel}`)
    assert.equal(r.findings[0].rule, 'placement')
    assert.equal(r.findings[0].severity, 'error', `禁令/归属违规必 error：${rel}`)
    assert.match(r.findings[0].message, pat)
  }
})

// ── ⑤ structure 正反例（四段 + wikilink 语法） ───────────────────────────────

test('⑤ structure 正例：四段顺序正确 + wikilink 合法 → 零 finding', async () => {
  const root = mkVault()
  const f = put(root, 'wiki/concepts/梯度计费.md', page())
  assert.deepEqual((await kbValidate(f, { rules: ['structure'], vaultRoot: root })).findings, [])
})

test('⑤ structure 反例：缺段 / 顺序错 / wikilink 未闭合 / 空目标', async () => {
  const root = mkVault()
  const missing = put(root, 'wiki/concepts/缺来源.md', page(GOOD_FIELDS, BODY.replace('## 来源\n- raw/素材.md\n', '')))
  const r1 = await kbValidate(missing, { rules: ['structure'], vaultRoot: root })
  assert.equal(r1.findings.length, 1)
  assert.equal(r1.findings[0].rule, 'structure')
  assert.equal(r1.findings[0].severity, 'warn', '结构完整性=warn（无 INV 鉴定为 FAIL 面）')
  assert.match(r1.findings[0].message, /来源/)

  const swapped = put(root, 'wiki/concepts/顺序错.md', page(GOOD_FIELDS, `## 关键点\n- **a** b\n\n## 概述\nx\n\n## 关联\n- [[concepts/梯度计费|g]] y\n\n## 来源\n- z\n`))
  const r2 = await kbValidate(swapped, { rules: ['structure'], vaultRoot: root })
  assert.ok(r2.findings.some((x) => /顺序/.test(x.message)), '顺序错必须报')

  const broken = put(root, 'wiki/concepts/坏链.md', page(GOOD_FIELDS, BODY.replace('- [[concepts/梯度计费|梯度计费]] 相关概念。', '- [[未闭合 链接\n- [[]] 空目标')))
  const r3 = await kbValidate(broken, { rules: ['structure'], vaultRoot: root })
  assert.ok(r3.findings.some((x) => /wikilink/.test(x.message)), 'wikilink 语法破损必须报')
})

test('⑤ structure 豁免：代码块内的 [[ 示例不算 wikilink 破损', async () => {
  const root = mkVault()
  const body = BODY.replace('- [[concepts/梯度计费|梯度计费]] 相关概念。', '示例：\n```\n[[坏链示例\n```\n- [[concepts/梯度计费|梯度计费]] 正常链。')
  const f = put(root, 'wiki/concepts/代码块.md', page(GOOD_FIELDS, body))
  assert.deepEqual((await kbValidate(f, { rules: ['structure'], vaultRoot: root })).findings, [])
})

// ── ⑥ evidence 正反例（INV-15 证据清单，判定面=调研摘要类） ─────────────────

test('⑥ evidence 正例：调研摘要含 ERRORS/LEARNINGS 引用行 + 本地文档清单表 → 零 finding', async () => {
  const root = mkVault()
  const body = `## 概述
本次调研覆盖 wiki 治理。

## 关键点
- **要点** 说明。

## 关联
- [[concepts/梯度计费|梯度计费]] 说明。

## 来源
行动前已读 [[reference/ERRORS|ERRORS]] 与 [[reference/LEARNINGS|LEARNINGS]]。

| 本地文档 | 用途 |
| --- | --- |
| wiki/reference/ERRORS.md | 错误教训 |
| raw/projects/kb-plugins/changes/2026-09-23-x/tasks.md | 任务清单 |
`
  const f = put(root, 'wiki/syntheses/2026-09-23-01-00-vault治理-调研摘要.md', page(GOOD_FIELDS, body))
  const r = await kbValidate(f, { rules: ['evidence'], vaultRoot: root })
  assert.deepEqual(r.findings, [])
  assert.equal(r.verdict, 'pass')
})

test('⑥ INV-15 反例：缺 ERRORS/LEARNINGS 引用行或缺本地文档清单表必 FAIL（error）', async () => {
  const root = mkVault()
  const table = `| 本地文档 | 用途 |
| --- | --- |
| wiki/reference/ERRORS.md | 错误教训 |
`
  // 反例 A：有表但缺 LEARNINGS 引用行
  const a = put(root, 'wiki/syntheses/2026-09-23-01-01-缺引用-调研摘要.md', page(GOOD_FIELDS, `## 概述\nx\n\n## 关键点\n- **a** b\n\n## 关联\n- [[concepts/梯度计费|g]] y\n\n## 来源\n- 读过 [[reference/ERRORS|ERRORS]]。\n\n${table}\n`))
  const r1 = await kbValidate(a, { rules: ['evidence'], vaultRoot: root })
  assert.equal(r1.findings.length, 1)
  assert.equal(r1.findings[0].rule, 'evidence')
  assert.equal(r1.findings[0].severity, 'error', 'INV-15 缺引用必须 error → verdict fail')
  assert.match(r1.findings[0].message, /LEARNINGS/)
  assert.equal(r1.verdict, 'fail', 'INV-15：缺证据清单引用必须 FAIL')

  // 反例 B：有引用行但缺本地文档清单表
  const b = put(root, 'wiki/syntheses/2026-09-23-01-02-缺清单表-调研摘要.md', page(GOOD_FIELDS, `## 概述\nx\n\n## 关键点\n- **a** b\n\n## 关联\n- [[concepts/梯度计费|g]] y\n\n## 来源\n- 读过 [[reference/ERRORS|ERRORS]] 与 [[reference/LEARNINGS|LEARNINGS]]。\n`))
  const r2 = await kbValidate(b, { rules: ['evidence'], vaultRoot: root })
  assert.equal(r2.findings.length, 1)
  assert.equal(r2.findings[0].severity, 'error')
  assert.match(r2.findings[0].message, /清单|表格/)
  assert.equal(r2.verdict, 'fail')

  // 反例 C：全缺（INV-15 反例矩阵「缺证据清单摘要必须 FAIL」）
  const c = put(root, 'wiki/syntheses/2026-09-23-01-03-全缺-调研摘要.md', page())
  const r3 = await kbValidate(c, { rules: ['evidence'], vaultRoot: root })
  assert.equal(r3.findings.length, 3, '缺 ERRORS 引用 + 缺 LEARNINGS 引用 + 缺清单表三条')
  assert.ok(r3.findings.every((x) => x.severity === 'error'))
  assert.equal(r3.verdict, 'fail')
})

test('⑥ evidence 判定面收窄：非调研摘要类文档不查证据清单（零误报）', async () => {
  const root = mkVault()
  const f = put(root, 'wiki/concepts/梯度计费.md', page()) // 无调研/盘点/摘要标记
  assert.deepEqual((await kbValidate(f, { rules: ['evidence'], vaultRoot: root })).findings, [])
})

// ── verdict 语义与 rules 裁剪 ────────────────────────────────────────────────

test('verdict 语义：pass / warn / fail 三级（error→fail，warn→warn，无→pass）', async () => {
  const root = mkVault()
  put(root, 'wiki/INDEX.md', INDEX_SEED + '- [[concepts/干净|干净]] — x\n')
  const clean = put(root, 'wiki/concepts/干净.md', page())
  assert.equal((await kbValidate(clean, { vaultRoot: root })).verdict, 'pass')

  const warnOnly = put(root, 'wiki/syntheses/bare-english-name.md', page()) // 仅命名形态 warn
  const r1 = await kbValidate(warnOnly, { rules: ['naming'], vaultRoot: root })
  assert.equal(r1.verdict, 'warn')

  const failOne = put(root, 'wiki/concepts/缺字段.md', page({ ...GOOD_FIELDS, status: undefined, related: undefined }).replace('status: undefined\n', '').replace('related: undefined\n', ''))
  const r2 = await kbValidate(failOne, { rules: ['frontmatter'], vaultRoot: root })
  assert.equal(r2.verdict, 'fail')
})

test('rules 参数裁剪：只跑指定规则；非法规则名 → TypeError', async () => {
  const root = mkVault()
  // 全量跑会报 frontmatter/index 多条，但裁剪到 naming 后只剩（或没有）naming
  const f = put(root, 'wiki/syntheses/2026-05-05-缺字段页.md', fm({ title: '"缺字段页"' }) + '\n' + BODY)
  const r = await kbValidate(f, { rules: ['naming'], vaultRoot: root })
  assert.deepEqual(r.findings, [], '裁剪后不跑 frontmatter/index')
  assert.equal(r.verdict, 'pass')

  await assert.rejects(() => kbValidate(f, { rules: ['bogus'], vaultRoot: root }), TypeError)
  await assert.rejects(() => kbValidate(f, { rules: [], vaultRoot: root }), TypeError)
})

test('快照对账：kb_validate 零写盘（校验前后 vault 内容/mtime 全等）', async () => {
  const root = mkVault()
  put(root, 'wiki/syntheses/2026-05-05-分析.md', page())
  put(root, 'wiki/concepts/梯度计费.md', page())
  const snap = () => {
    const out = {}
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else {
          const st = fs.statSync(p)
          out[path.relative(root, p)] = `${createHash('sha256').update(fs.readFileSync(p)).digest('hex')}:${st.mtimeMs}`
        }
      }
    }
    walk(root)
    return out
  }
  const before = snap()
  await kbValidate(path.join(root, 'wiki'), { vaultRoot: root })
  const after = snap()
  assert.deepEqual(after, before, '校验器只读：前后快照必须全等')
})

test('围栏：目标在 vaultRoot 外 → io finding，verdict fail（读侧 realpathGuard 语义）', async () => {
  const root = mkVault()
  const outside = path.join(os.tmpdir(), `ws-outside-${Date.now()}.md`)
  fs.writeFileSync(outside, page())
  try {
    const r = await kbValidate(outside, { vaultRoot: root })
    assert.equal(r.verdict, 'fail')
    assert.equal(r.findings[0].rule, 'io')
    assert.equal(r.findings[0].severity, 'error')
  } finally {
    fs.rmSync(outside, { force: true })
  }
})

// ── 目录模式 ────────────────────────────────────────────────────────────────

test('目录模式：results 逐文件 + findings 带 file 键 + 聚合 verdict 取最坏', async () => {
  const root = mkVault()
  put(root, 'wiki/concepts/梯度计费.md', page())
  put(root, 'wiki/syntheses/2026-05-05-分析.md', page())
  put(root, 'wiki/syntheses/2026-05-06-孤儿.md', page())
  const r = await kbValidate(path.join(root, 'wiki'), { vaultRoot: root })
  assert.deepEqual(Object.keys(r).sort(), ['file', 'findings', 'results', 'verdict'])
  assert.equal(r.file, path.join(root, 'wiki'))
  assert.equal(r.results.length, 4, '3 页 + INDEX.md')
  assert.ok(r.findings.every((x) => typeof x.file === 'string' && x.file.length > 0), '聚合 findings 必带 file 键')
  assert.equal(r.verdict, 'fail', '含漏登 error → 聚合 fail')
  for (const sub of r.results) {
    assert.deepEqual(Object.keys(sub).sort(), ['file', 'findings', 'verdict'])
    assert.ok(['pass', 'warn', 'fail'].includes(sub.verdict))
  }
})

// ── ⑤ quickCheck 秒级语义（快检不跑全量六规则） ─────────────────────────────

test('⑤ quickCheck 正例：合规新页（未登记 INDEX 也放行——快检不跑 index 规则）', async () => {
  const root = mkVault()
  const f = put(root, 'wiki/concepts/梯度计费.md', page())
  const r = await quickCheck(f, page(), { vaultRoot: root })
  assert.deepEqual(r, { ok: true, reasons: [] })
})

test('⑤ quickCheck 反例：缺必填字段/命名硬违规/放置禁令 → ok:false 且 reasons 指路', async () => {
  const root = mkVault()
  const bad = put(root, 'wiki/根放页.md', fm({ title: '"缺字段"' }) + '\n' + BODY)
  const r = await quickCheck(bad, undefined, { vaultRoot: root })
  assert.equal(r.ok, false)
  assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0)
  const joined = r.reasons.join('\n')
  assert.match(joined, /frontmatter/)
  assert.match(joined, /status|source|related|tags|date/, 'reasons 指明缺什么')
  assert.match(joined, /placement|根/, '路径禁令也在快检面')
})

test('⑤ quickCheck 秒级语义：不跑 index/structure/evidence 全量规则（破损页仍 ok:true）', async () => {
  const root = mkVault()
  // 六字段/命名/放置全过，但：未登记 INDEX（②）、缺四段（⑤）、调研摘要缺证据清单（⑥）
  const f = put(root, 'wiki/syntheses/2026-09-23-01-04-快检面-调研摘要.md', fm(GOOD_FIELDS) + '\n# 裸正文\n')
  const quick = await quickCheck(f, undefined, { vaultRoot: root })
  assert.equal(quick.ok, true, '快检不跑全量六规则')
  const full = await kbValidate(f, { vaultRoot: root })
  assert.equal(full.verdict, 'fail', '全量校验必须抓到 index/evidence 等违规')
  const rulesHit = new Set(full.findings.map((x) => x.rule))
  assert.ok(rulesHit.has('index'), '全量含 index')
  assert.ok(rulesHit.has('evidence'), '全量含 evidence')
})

test('⑤ quickCheck：raw 侧路径不套 wiki 维护指引（ok:true，捕获/回写不被误拦）', async () => {
  const root = mkVault()
  const f = put(root, 'raw/04-session_logs/某会话 - 2026-05-05-14-30.md', '---\nsource: capture\n---\n\n会话记录\n')
  const r = await quickCheck(f, undefined, { vaultRoot: root })
  assert.deepEqual(r, { ok: true, reasons: [] })
})

test('⑤ quickCheck：内容省略时真读盘（与传内容同判定）', async () => {
  const root = mkVault()
  const f = put(root, 'wiki/concepts/梯度计费.md', page())
  const r = await quickCheck(f, undefined, { vaultRoot: root })
  assert.deepEqual(r, { ok: true, reasons: [] })
})

// ── ⑥ 输出 JSON 形状稳定（无 -0/NaN） ───────────────────────────────────────

test('⑥ 输出形状稳定：键面固定、line 为正整数或缺省、无 NaN/-0、JSON 往返等值', async () => {
  const root = mkVault()
  put(root, 'wiki/INDEX.md', INDEX_SEED + '- [[syntheses/2026-05-09-不存在|幽灵]] — x\n')
  const f = put(root, 'wiki/根放页-坏:name.md', fm({ title: '"x"' }) + '\n[[未闭合\n')
  const r = await kbValidate(f, { vaultRoot: root })

  assert.deepEqual(Object.keys(r).sort(), ['file', 'findings', 'verdict'])
  assert.ok(['pass', 'warn', 'fail'].includes(r.verdict))
  assert.ok(r.findings.length > 0)
  for (const item of r.findings) {
    const keys = Object.keys(item).sort()
    assert.ok(keys.every((k) => ['rule', 'line', 'message', 'severity'].includes(k)), `finding 键面固定：${keys}`)
    assert.ok([...RULES, 'io'].includes(item.rule), `rule 取值稳定：${item.rule}`)
    assert.ok(['error', 'warn'].includes(item.severity))
    assert.equal(typeof item.message, 'string')
    assert.ok(item.message.length > 0)
    if ('line' in item) assert.ok(Number.isInteger(item.line) && item.line >= 1, `line 正整数：${item.line}`)
  }
  const walk = (v, where) => {
    if (typeof v === 'number') {
      assert.ok(!Number.isNaN(v), `NaN @ ${where}`)
      assert.ok(!Object.is(v, -0), `-0 @ ${where}`)
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`)
  }
  walk(r, '$')
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, 'JSON 往返等值（无 undefined/NaN 泄漏）')
})

test('⑥ RULES 常量 = 六规则名稳定面', () => {
  assert.deepEqual(RULES, ['frontmatter', 'index', 'naming', 'placement', 'structure', 'evidence'])
})
