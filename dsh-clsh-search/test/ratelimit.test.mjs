// ratelimit.test.mjs — Task 8：反爬/验证码检测与命中即停错误（K-5 / INV-5）
// 离线：样本全走 fixtures/ 与内联字符串，不触网。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BLOCK_CODE,
  classifyBlock,
  isBlocked,
  isBlockedError,
  toBlockedError,
} from '../lib/ratelimit.js'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('202 状态命中判定：blocked + kind=status-202（K-5 类目①）', () => {
  const hit = classifyBlock({ status: 202 })
  assert.equal(hit.blocked, true, '202 必须命中即停')
  assert.equal(hit.kind, 'status-202')
  assert.match(hit.reason, /202/)
  assert.equal(isBlocked({ status: 202 }), true)
})

test('挑战页样本命中判定：fixtures/challenge-sample.html → challenge-page（K-5 类目②）', async () => {
  const html = await readFile(path.join(FIXTURES, 'challenge-sample.html'), 'utf8')
  const hit = classifyBlock({ status: 200, body: html })
  assert.equal(hit.blocked, true, '挑战页样本必须命中即停')
  assert.equal(hit.kind, 'challenge-page')
  assert.match(hit.reason, /挑战页特征/)
})

test('验证码页命中判定：内联验证码页 → captcha-page（K-5 类目③）', () => {
  const html = '<!doctype html><html><body><h1>请完成人机验证</h1><div class="h-captcha"></div></body></html>'
  const hit = classifyBlock({ body: html })
  assert.equal(hit.blocked, true, '验证码页必须命中即停')
  assert.equal(hit.kind, 'captcha-page')
})

test('异常 HTML 命中判定：网关错误页与非 HTML 根形 → anomaly-html（K-5 类目④）', () => {
  const gateway = '<!doctype html><html><body><h1>502 Bad Gateway</h1></body></html>'
  const gatewayHit = classifyBlock({ body: gateway })
  assert.equal(gatewayHit.blocked, true, '网关错误页必须命中')
  assert.equal(gatewayHit.kind, 'anomaly-html')

  const hijack = '{"error":"upstream timeout","trace":"fixture"}'
  const hijackHit = classifyBlock({ body: hijack })
  assert.equal(hijackHit.blocked, true, '非 HTML 根形错误体必须命中')
  assert.equal(hijackHit.kind, 'anomaly-html')
})

test('正常 SERP 样本不误报：ddg-sample.html + 常规状态（未命中路径）', async () => {
  const html = await readFile(path.join(FIXTURES, 'ddg-sample.html'), 'utf8')
  assert.equal(classifyBlock({ status: 200, body: html }).blocked, false, '正常 SERP 不得误报')
  assert.equal(classifyBlock({ status: 200 }).blocked, false, '无 body 常规状态不命中')
  assert.equal(classifyBlock({}).blocked, false, '空输入不命中')
  assert.equal(classifyBlock({ status: 503 }).blocked, false, '5xx 瞬态归普通失败（US-2 切换面），不进即停类目')
  assert.equal(classifyBlock({ status: 429 }).blocked, false, '429 归普通失败（零重试 + 切换下一家）')
})

test('命中即停错误对象：code 明确 + 文案含疑似反爬/验证码（K-5 明示面）', () => {
  const hit = classifyBlock({ status: 202 })
  const error = toBlockedError(hit, { source: 'ddg', status: 202 })
  assert.equal(error.code, BLOCK_CODE)
  assert.equal(error.blocked, true)
  assert.equal(error.kind, 'status-202')
  assert.equal(error.source, 'ddg')
  assert.equal(error.status, 202)
  assert.match(error.message, /疑似反爬\/验证码/, '文案必须明示疑似反爬/验证码')
  assert.match(error.message, /不重试/, '文案必须明示不重试')
  assert.equal(isBlockedError(error), true, '调用方可据 code/blocked 判别（收口判据）')
  assert.equal(isBlockedError(new Error('普通失败')), false)
  assert.equal(isBlockedError(null), false)
})

test('classifyBlock 入参校验：类型非法即拒（不静默放行）', () => {
  assert.throws(() => classifyBlock(null), TypeError)
  assert.throws(() => classifyBlock({ status: '202' }), TypeError)
  assert.throws(() => classifyBlock({ body: 42 }), TypeError)
  assert.throws(() => toBlockedError({ blocked: false }), TypeError)
})
