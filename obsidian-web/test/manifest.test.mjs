// manifest 契约回归（T1 发版纪律 + 依赖形态）：只读 manifest，零运行时副作用。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const readJson = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
const readText = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// 依赖白名单（2026-09-26 裁定续；2026-09-28 依赖归类裁定修订 + S6 契约连动改形）：lib 零第三方被
// 「运行时依赖白名单」显式豁免——remark/unified/rehype/micromark 族及必要插件为白名单运行时依赖
//（ARC-1 精神=唯一源非自研）+ zod（第三方统一进 dependencies：peer 不代装，进 peer=单装即
// ERR_MODULE_NOT_FOUND）。白名单之外仍然零第三方。@deepseek-ai/* 共享包照旧 peer+dev 双声明。
const RUNTIME_DEP_WHITELIST = new Set([
  'unified',
  'remark-parse',
  'remark-rehype',
  'remark-frontmatter',
  'remark-gfm',
  'remark-breaks',
  'rehype-stringify',
  'rehype-sanitize',
  'zod',
])

test('依赖白名单：dependencies 仅限白名单族（渲染管线族+zod；白名单外零第三方），zod 入 dependencies、@deepseek-ai/* 走 peer+dev 双声明', () => {
  const pkg = readJson('../package.json')
  assert.ok(Object.keys(pkg.dependencies ?? {}).length > 0, '运行时依赖应显式声明为 dependencies')
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    assert.ok(RUNTIME_DEP_WHITELIST.has(name), `白名单外运行时依赖：${name}（白名单=渲染管线族+zod，2026-09-26/2026-09-28 裁定）`)
  }
  for (const name of ['@deepseek-ai/dsh-atomic-write', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']) {
    assert.ok(pkg.peerDependencies?.[name], `${name} 必须在 peerDependencies`)
    assert.ok(pkg.devDependencies?.[name], `${name} 必须在 devDependencies（独立测试副本）`)
    assert.ok(!pkg.dependencies?.[name], `${name} 走 peer+dev 双声明，不得进 dependencies`)
  }
  // S6 改形锁（断言只增不删）：zod 归位 dependencies（S3）——锁 dependencies.zod 在场 + peer/dev 双无 zod
  assert.ok(pkg.dependencies?.zod, 'zod 必须在 dependencies（第三方统一进 dependencies，2026-09-28 依赖归类裁定）')
  assert.ok(!pkg.peerDependencies?.zod, 'peerDependencies 不得有 zod（peer 不代装：单装即 ERR_MODULE_NOT_FOUND）')
  assert.ok(!pkg.devDependencies?.zod, 'devDependencies 不得有 zod link（link: 模式已废弃）')
})

test('zod dependencies 钉 ^4.6.5（T1 Ruling 兑现：下界=实测 .prefault 语义版 4.6.5；S3 形状=dependencies 归位）', () => {
  const pkg = readJson('../package.json')
  assert.equal(pkg.dependencies?.zod, '^4.6.5')
})

test('manifest：dsh.bundle.patch 指向真实文件且 patch 行 name == 包名', () => {
  const pkg = readJson('../package.json')
  const patch = pkg.dsh?.bundle?.patch
  assert.equal(patch, './cordis.patch.yml')
  const yml = readText('../cordis.patch.yml')
  assert.match(yml, new RegExp(`name:\\s*'${pkg.name}'`), 'patch 行 name 与包名一致（否则层不生效）')
})

// 版本四对齐联动锁（2026-09-28 发版后遗症根治：手钉版本常量=每次发版必红的病根）：
// 与 scripts/check-release.sh 同源口径——package.json version ↔ CHANGELOG 首条 `## <ver>` ↔
// 根 README 版本表该插件行版本 ↔ 合法 semver，四方共享同一 pkg.version 锚，发版 bump 后自动跟上。
// check-release.sh 的 CHANGELOG 形（`^## <ver>` 存在）与 README 形（`<name>.*<ver>`）均由本锁蕴含。
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('发版纪律：版本四对齐联动锁（pkg version == CHANGELOG 首条 ## 版本 == 根 README 版本表行版本 == 合法 semver；与 check-release.sh 同源）+ README 三段（用途/安装钉版本/配置）+ 发版检查清单（发版级机械锁：src/dist 同批由 check-release 把关）', () => {
  const pkg = readJson('../package.json')
  const version = pkg.version ?? ''
  // 对齐①：合法 semver（check-release.sh 以 $ver 为对齐基准，非法版本=基准本身失真）
  assert.match(version, SEMVER_RE, `package.json version 非合法 semver：${JSON.stringify(version)}`)
  // 对齐②：CHANGELOG 首个 `## <ver>` == version（发版必记更新内容，最新条目即当前版本）
  const changelog = readText('../CHANGELOG.md')
  const firstEntry = changelog.match(/^##[ \t]+([^\s]+)/m)?.[1]
  assert.ok(firstEntry, 'CHANGELOG.md 缺 `## <ver>` 更新记录条目（发版必须记录更新内容）')
  assert.equal(firstEntry, version, `CHANGELOG 首条版本 ${firstEntry} ≠ package.json version ${version}`)
  // 对齐③：根 README 版本表该插件行版本 == version（发版必同步 README 版本表）
  const rootReadme = readText('../../README.md')
  const rowRe = new RegExp(`^\\|\\s*\\[${escapeRe(pkg.name)}\\]\\([^)]*\\)\\s*\\|\\s*([^|\\s]+)\\s*\\|`, 'm')
  const rowVer = rootReadme.match(rowRe)?.[1]
  assert.ok(rowVer, `根 README.md 版本表缺 ${pkg.name} 行`)
  assert.equal(rowVer, version, `根 README 版本表 ${pkg.name} 行版本 ${rowVer} ≠ package.json version ${version}`)
  const readme = readText('../README.md')
  for (const heading of ['用途', '安装', '配置']) {
    assert.match(readme, new RegExp(`^## .*${heading}`, `m`), `README 缺「${heading}」段`)
  }
  // —— 安装段钉版**形锁**（2026-09-29 形锁化：手钉 `obsidian-web-v0.2.0` 常量 → 锁钉版形，不钉具体版本）——
  // 形 = 安装示例钉 `obsidian-web-v<合法 semver>` tag 快照；具体版本一致性由上方版本四对齐联动锁承担
  //（pkg version ↔ CHANGELOG ↔ 根 README 版本表 ↔ semver），故发版 bump 不再触发本断言失同步。
  // 强度不降：仍锁「必须钉 tag 快照、不得 link:/file:/裸 main/HEAD」，另锁示例钉版形合法 + 段内钉版唯一一致。
  const installSection = readme.split(/^## /m).find((s) => s.startsWith('安装')) ?? ''
  assert.ok(installSection, 'README 缺「安装」段（安装钉版本）')
  const pinCands = [...installSection.matchAll(/obsidian-web-v([^\s'"`)&]+)/g)].map((m) => m[1])
  assert.ok(pinCands.length > 0, '安装段必须钉版本 tag（安装钉版本）：缺 `obsidian-web-v<semver>` 钉版')
  for (const cand of pinCands) {
    assert.match(cand, SEMVER_RE, `安装钉版形非法：obsidian-web-v${cand}（须为 obsidian-web-v<合法 semver> tag）`)
  }
  assert.equal(new Set(pinCands).size, 1, `安装段钉版 tag 不唯一一致：${[...new Set(pinCands)].join(' / ')}（示例钉版须一致）`)
  const addLine = installSection.split('\n').find((l) => l.includes('dsh plugin') && l.includes(' add ')) ?? ''
  assert.ok(addLine, '安装段缺 `dsh plugin add` 安装命令（安装钉版本）')
  assert.match(addLine, /github:fengcwf\/dsh-plugins#obsidian-web-v[^'"\s&]+&path:obsidian-web/, '安装示例必须钉 tag 快照（github:fengcwf/dsh-plugins#obsidian-web-v<semver>&path:obsidian-web）')
  assert.doesNotMatch(addLine, /link:|file:/, '安装示例禁用 link:/file:（已废弃：symlink 不代装依赖）')
  assert.doesNotMatch(addLine, /#(?:main|master|HEAD|latest)\b/, '安装示例禁钉裸 main/分支/HEAD（必须钉 tag 快照）')
  // T2 交接检查项增补（T14 收口）+ fix r1 口径降格：清单文案=「发版级机械锁：src/dist 同批由 check-release 把关」
  // —— 本断言只锁文案（如实标注）；真实新鲜度锁=check-release.sh commit 级校验，行为面由
  //    check-release-dist-freshness.test.mjs 真 git 仓真验（src 变更无 dist 变更必红）。
  assert.match(readme, /发版检查清单/, 'README 缺「发版检查清单」段')
  assert.match(readme, /发版级机械锁：src\/dist 同批由 check-release 把关/, '发版清单必须写明发版级机械锁口径（src/dist 同批由 check-release 把关）')
  assert.match(readme, /dist 与源码同 commit/, '发版清单必须含「dist 与源码同 commit」检查项（T2 交接）')
  assert.match(readme, /extract-token-snapshot/, '发版清单必须含 token 快照刷新义务（T13 交接）')
})
