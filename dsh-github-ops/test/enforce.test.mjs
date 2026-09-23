import test from 'node:test'
import assert from 'node:assert/strict'
import { gateWebFetch, rewriteGithubCommand, targetsGithubApi } from '../lib/enforce.js'

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
