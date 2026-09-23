import test from 'node:test'
import assert from 'node:assert/strict'
import { decideEligibility, isSafeRewrite, pickRewritten, planRewrite } from '../lib/rewrite.js'

test('空命令与已含 rtk 的命令放行', () => {
  assert.equal(decideEligibility('').eligible, false)
  assert.equal(decideEligibility('   ').reason, 'empty')
  assert.equal(decideEligibility('rtk git status').reason, 'already-rtk')
  assert.equal(decideEligibility('rtk ls . && rtk git status').reason, 'already-rtk')
})

test('RTK_DISABLED 与凭据替换命令不改写', () => {
  assert.equal(decideEligibility('RTK_DISABLED=1 git status').reason, 'disabled-by-env')
  assert.equal(decideEligibility('curl -H "Bearer $(gh auth token)" https://api.github.com').reason, 'credential-bearing')
  assert.equal(decideEligibility('echo $GITHUB_TOKEN').reason, 'credential-bearing')
})

test('保守模式拦截 shell 元字符（管道/重定向/替换）', () => {
  for (const cmd of [
    'git diff > patch.txt',        // 重定向：压缩会改变落盘内容
    'git log | head -20',          // 管道：压缩会改变下游输入
    'cat $(find . -name x)',       // 命令替换
    'git status; ls',              // 顺序链
  ]) {
    assert.equal(decideEligibility(cmd).reason, 'shell-metachar', cmd)
    assert.equal(decideEligibility(cmd, { conservative: false }).eligible, true, cmd)
  }
})

test('&& 链在保守模式下也放行（rtk rewrite 是链式感知的）', () => {
  assert.equal(decideEligibility('cargo test && git push').eligible, true)
})

test('exclude 命令前缀匹配', () => {
  const opts = { exclude: ['docker'] }
  assert.equal(decideEligibility('docker ps', opts).reason, 'excluded')
  assert.equal(decideEligibility('docker', opts).reason, 'excluded')
  assert.equal(decideEligibility('dockerx ps', opts).eligible, true)
})

test('pickRewritten 只认非空 stdout（rc=3 quirk）', () => {
  assert.equal(pickRewritten('rtk git status'), 'rtk git status')
  assert.equal(pickRewritten('\nrtk git status\n'), 'rtk git status')
  assert.equal(pickRewritten(''), undefined)
  assert.equal(pickRewritten('\n  \n'), undefined)
  assert.equal(pickRewritten(undefined), undefined)
})

test('isSafeRewrite 防递归与畸形输出', () => {
  assert.equal(isSafeRewrite('git status', 'rtk git status'), true)
  assert.equal(isSafeRewrite('git status', 'git status'), false)   // 恒等无意义
  assert.equal(isSafeRewrite('git status', 'rm -rf /'), false)     // 不以 rtk 开头
  assert.equal(isSafeRewrite('git status', 'rtk a\nrtk b'), false) // 多行
  assert.equal(isSafeRewrite('git status', ''), false)
})

test('planRewrite 组合决策', () => {
  assert.deepEqual(planRewrite('git status', 'rtk git status'), { action: 'rewrite', command: 'rtk git status' })
  assert.equal(planRewrite('git status | wc -l', 'rtk git status | wc -l').action, 'passthrough')
  assert.equal(planRewrite('definitely-not-a-cmd x', '').reason, 'no-rewrite')
  assert.equal(planRewrite('rtk git status', 'rtk rtk git status').reason, 'already-rtk')
})
