// check-release.sh「dist 新鲜度锁」行为测试（T14 fix r1）——真 git scratch 仓 + 真脚本复制体，零 mock。
// 锁契约（review requiredFix「按 commit diff 校验 web/src 变更必伴 web/dist 变更」）：
//   ① commit 级校验：web 源变更（web/src/**、web/index.html、web/vite.config.js）非空而 web/dist 变更为空
//      → [FAIL] 重建 dist 同 commit；② 基线=上个插件 tag（git describe --match "<name>-v*"），
//      无 tag=未发版窗口（全历史逐 commit）；③ 纯 lib/测试/文档变更不触发。
// 脚本复制体与 scripts/check-release.sh 逐字节同（setUp 内断言），跑的是真实脚本字节。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_SRC = fileURLToPath(new URL('../../scripts/check-release.sh', import.meta.url))
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-release-lock-'))
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'release-lock-test',
  GIT_AUTHOR_EMAIL: 'release-lock@test.invalid',
  GIT_COMMITTER_NAME: 'release-lock-test',
  GIT_COMMITTER_EMAIL: 'release-lock@test.invalid',
}

const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: ENV })
const write = (repo, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), text)
}
const commitAll = (repo, msg) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', msg)
  return git(repo, 'rev-parse', 'HEAD').trim()
}
const runCheck = (repo) => {
  try {
    const out = execFileSync('bash', [path.join(repo, 'scripts', 'check-release.sh'), 'probe-web'], { encoding: 'utf8', env: ENV })
    return { status: 0, out }
  } catch (e) {
    return { status: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

// scratch monorepo：scripts/check-release.sh（真脚本字节）+ probe-web 插件（version/CHANGELOG/README 三对齐 + web 源/dist）
function makeRepo() {
  const repo = fs.mkdtempSync(path.join(TMP, 'repo-'))
  git(repo, 'init', '-q')
  const bytes = fs.readFileSync(SCRIPT_SRC)
  write(repo, 'scripts/check-release.sh', bytes.toString('utf8'))
  assert.equal(fs.readFileSync(path.join(repo, 'scripts/check-release.sh')).compare(bytes), 0, '脚本复制体必须与 scripts/check-release.sh 逐字节同')
  write(repo, 'package.json', `${JSON.stringify({ name: 'probe-web', version: '0.1.0' }, null, 2)}\n`)
  write(repo, 'probe-web/package.json', `${JSON.stringify({ name: 'probe-web', version: '0.1.0' }, null, 2)}\n`)
  write(repo, 'probe-web/CHANGELOG.md', '## 0.1.0\n\n- init\n')
  write(repo, 'README.md', 'probe-web 0.1.0\n')
  write(repo, 'probe-web/web/src/app.js', 'export default 1\n')
  write(repo, 'probe-web/web/index.html', '<div id="app"></div>\n')
  write(repo, 'probe-web/web/vite.config.js', 'export default {}\n')
  write(repo, 'probe-web/web/README.md', 'web docs\n')
  write(repo, 'probe-web/web/dist/app.out.js', 'built-1\n')
  write(repo, 'probe-web/lib/core.js', 'export default 0\n')
  write(repo, 'probe-web/test/core.test.mjs', "import test from 'node:test'\n")
  commitAll(repo, 'init')
  return repo
}

test('RED→GREEN 锁主形态：web/src 变更无 dist 变更 → FAIL（重建 dist 同 commit）', () => {
  const repo = makeRepo()
  write(repo, 'probe-web/web/src/app.js', 'export default 2\n')
  commitAll(repo, 'src-only change')
  const r = runCheck(repo)
  assert.equal(r.status, 1, `src-only commit 必红，实际输出：\n${r.out}`)
  assert.match(r.out, /\[FAIL\].*重建 dist 同 commit/, 'FAIL 行必须点名「重建 dist 同 commit」')
  assert.match(r.out, /\[VERDICT\] FAIL/)
})

test('src 与 dist 同 commit 变更 → PASS（同批重建）', () => {
  const repo = makeRepo()
  write(repo, 'probe-web/web/src/app.js', 'export default 2\n')
  write(repo, 'probe-web/web/dist/app.out.js', 'built-2\n')
  commitAll(repo, 'src+dist same commit')
  const r = runCheck(repo)
  assert.equal(r.status, 0, `src+dist 同 commit 必绿，实际输出：\n${r.out}`)
  assert.match(r.out, /\[VERDICT\] PASS/)
})

test('纯 lib/测试变更不触发（零 web 源变更 → PASS 且零 FAIL 行）', () => {
  const repo = makeRepo()
  write(repo, 'probe-web/lib/core.js', 'export default 1\n')
  write(repo, 'probe-web/test/core.test.mjs', "import test from 'node:test'\n// more\n")
  commitAll(repo, 'lib+test only')
  const r = runCheck(repo)
  assert.equal(r.status, 0, `lib/测试变更必绿，实际输出：\n${r.out}`)
  assert.doesNotMatch(r.out, /\[FAIL\]/, 'lib/测试变更不得触发新鲜度锁')
  assert.match(r.out, /\[VERDICT\] PASS/)
})

test('web/README.md 非构建输入不触发（选型：构建输入=web/src/**+index.html+vite.config.js）', () => {
  const repo = makeRepo()
  write(repo, 'probe-web/web/README.md', 'web docs updated\n')
  commitAll(repo, 'web doc only')
  const r = runCheck(repo)
  assert.equal(r.status, 0, `web 文档变更必绿（防『产物无差异死锁』），实际输出：\n${r.out}`)
  assert.doesNotMatch(r.out, /\[FAIL\]/)
})

test('无 tag 基线=未发版窗口（全历史）：坏 commit 不在 HEAD 也必红（finding 失效模式钉死）', () => {
  const repo = makeRepo()
  write(repo, 'probe-web/web/src/app.js', 'export default 2\n')
  const bad = commitAll(repo, 'bad src-only commit')
  write(repo, 'probe-web/lib/core.js', 'export default 1\n')
  commitAll(repo, 'later lib-only commit')
  const r = runCheck(repo)
  assert.equal(r.status, 1, `非 HEAD 的坏 commit 必红，实际输出：\n${r.out}`)
  assert.match(r.out, new RegExp(`\\[FAIL\\] commit ${bad.slice(0, 7)} .*重建 dist 同 commit`), 'FAIL 行必须点名坏 commit')
})

test('上个 tag 基线：tag 窗口内坏 commit 必红（HEAD 为后续无关 commit 也照红）', () => {
  const repo = makeRepo()
  git(repo, 'tag', 'probe-web-v0.1.0')
  write(repo, 'probe-web/web/src/app.js', 'export default 2\n')
  const bad = commitAll(repo, 'bad src-only after tag')
  write(repo, 'probe-web/lib/core.js', 'export default 1\n')
  commitAll(repo, 'later lib-only commit')
  const r = runCheck(repo)
  assert.equal(r.status, 1, `tag 窗口内坏 commit 必红，实际输出：\n${r.out}`)
  assert.match(r.out, new RegExp(`\\[FAIL\\] commit ${bad.slice(0, 7)} .*重建 dist 同 commit`))
})

test('上个 tag 基线：tag 之前的历史不追溯（已发版窗口外不误报）', () => {
  const repo = makeRepo()
  write(repo, 'probe-web/web/src/app.js', 'export default 2\n')
  commitAll(repo, 'pre-tag src-only commit')
  write(repo, 'probe-web/lib/core.js', 'export default 1\n')
  commitAll(repo, 'release prep')
  git(repo, 'tag', 'probe-web-v0.1.0')
  write(repo, 'probe-web/lib/core.js', 'export default 2\n')
  commitAll(repo, 'post-tag lib-only commit')
  const r = runCheck(repo)
  assert.equal(r.status, 0, `tag 之前的历史不追溯，实际输出：\n${r.out}`)
  assert.match(r.out, /\[VERDICT\] PASS/)
})
