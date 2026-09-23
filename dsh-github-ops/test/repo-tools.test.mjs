import test from 'node:test'
import assert from 'node:assert/strict'
import { GITHUB_TOOL_SPECS, renderSteps } from '../lib/repo-tools.js'

const byName = (n) => GITHUB_TOOL_SPECS.find((s) => s.name === n)
const commandsOf = (n, args, cfg = { allowDelete: false }) => byName(n).commands(args, cfg)

test('工具集共 11 个，命名遵循 github-mcp-server 约定', () => {
  assert.equal(GITHUB_TOOL_SPECS.length, 11)
  const names = GITHUB_TOOL_SPECS.map((s) => s.name)
  assert.ok(names.every((n) => n.startsWith('github_')))
  for (const n of ['github_repo_list', 'github_repo_search', 'github_repo_info', 'github_repo_create']) assert.ok(names.includes(n))
})

test('github_repo_list 参数投影与限流裁剪', () => {
  const [argv] = commandsOf('github_repo_list', { owner: 'fengcwf', limit: 5 })
  assert.deepEqual(argv.slice(0, 4), ['repo', 'list', 'fengcwf', '--type'])
  assert.ok(argv.includes('nameWithOwner,visibility,isFork,stargazerCount,updatedAt,description'))
  assert.ok(argv.includes('--jq'))
  // limit 钳位
  const [huge] = commandsOf('github_repo_list', { limit: 9999 })
  assert.equal(huge[huge.indexOf('--limit') + 1], '100')
})

test('github_repo_clone 支持 dest 与 depth', () => {
  assert.deepEqual(commandsOf('github_repo_clone', { repo: 'o/r' })[0], ['repo', 'clone', 'o/r'])
  assert.deepEqual(commandsOf('github_repo_clone', { repo: 'o/r', dest: 'mydir', depth: 1 })[0], [
    'repo', 'clone', 'o/r', 'mydir', '--', '--depth', '1',
  ])
})

test('危险操作双重门禁：archive/delete 需要 confirm 精确匹配', () => {
  assert.throws(() => commandsOf('github_repo_archive', { repo: 'o/r', confirm: 'r' }), /confirm must equal/)
  assert.deepEqual(commandsOf('github_repo_archive', { repo: 'o/r', confirm: 'o/r' })[0], ['repo', 'archive', 'o/r', '--yes'])
  // delete 即便 confirm 正确，allowDelete=false 仍拒绝
  assert.throws(() => commandsOf('github_repo_delete', { repo: 'o/r', confirm: 'o/r' }, { allowDelete: false }), /disabled by deployment/)
  assert.deepEqual(commandsOf('github_repo_delete', { repo: 'o/r', confirm: 'o/r' }, { allowDelete: true })[0], ['repo', 'delete', 'o/r', '--yes'])
  assert.throws(() => commandsOf('github_repo_delete', { repo: 'o/r', confirm: 'x' }, { allowDelete: true }), /confirm must equal/)
})

test('github_repo_edit 改可见性需 confirm；空编辑拒绝', () => {
  assert.throws(() => commandsOf('github_repo_edit', { repo: 'o/r' }), /nothing to edit/)
  assert.throws(() => commandsOf('github_repo_edit', { repo: 'o/r', visibility: 'private' }), /confirm/)
  const [argv] = commandsOf('github_repo_edit', { repo: 'o/r', visibility: 'private', confirm: 'o/r', addTopics: ['dsh'] })
  assert.ok(argv.includes('--visibility') && argv.includes('--add-topic'))
})

test('renderSteps：exit code 显式标注、截断有界', () => {
  assert.equal(renderSteps([{ stdout: 'ok\n', stderr: '', status: 0 }]), 'ok')
  assert.match(renderSteps([{ stdout: '', stderr: 'boom', status: 2 }]), /\[exit code: 2\]/)
  const big = renderSteps([{ stdout: 'x'.repeat(10000), stderr: '', status: 0 }])
  assert.match(big, /\[...truncated/)
  assert.ok(big.length < 6300)
})

test('github_api：万能后端 + 写操作需 confirm + jq/paginate 裁剪', () => {
  assert.deepEqual(commandsOf('github_api', { path: 'repos/o/r/releases' })[0], ['api', 'repos/o/r/releases'])
  assert.throws(() => commandsOf('github_api', { path: 'repos/o/r/issues', method: 'POST', fields: ['title=hi'] }), /confirm="yes"/)
  const [argv] = commandsOf('github_api', {
    path: 'repos/o/r/issues', method: 'POST', fields: ['title=hi'], confirm: 'yes', jq: '.number', paginate: true,
  })
  assert.deepEqual(argv.slice(0, 3), ['api', 'repos/o/r/issues', '-X'])
  assert.ok(argv.includes('-F') && argv.includes('--jq') && argv.includes('--paginate') && argv.includes('--slurp'))
})

test('工具描述含选型指导（吸收 MCP 描述风格）', () => {
  for (const s of GITHUB_TOOL_SPECS) {
    assert.ok(s.description.length > 30, s.name)
    if (s.name === 'github_repo_delete') assert.match(s.description, /DESTRUCTIVE/)
  }
})
