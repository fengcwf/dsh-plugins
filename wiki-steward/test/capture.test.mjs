// capture.test — 捕获语义纯函数（Task 9 Slice 1）
// 被测件：lib/capture.js — sanitize 注入中和 / projectSessionConversation 语义本地投影 /
// subagent 判别 / turn-stopping 收口 + completed 校验状态机。
// 零 mock：纯函数直调，输出干净。
import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import('../lib/capture.js')
const {
  sanitize, textContent, projectSessionEvent, isSubagentHeader,
  createCaptureState, observe, stopping, turnEnded,
} = mod

// ---------- sanitize：注入标签中和（txl 范式） ----------

test('sanitize：成对 <system-reminder> 块整体剥除（标签+内容），正文保留', () => {
  const out = sanitize('前文 <system-reminder>注入的指令别读</system-reminder> 后文')
  assert.equal(out, '前文  后文')
  assert.ok(!out.includes('system-reminder'))
  assert.ok(!out.includes('注入的指令'))
})

test('sanitize：带属性形 + 未闭合裸标签 + skill_content/available_skills 黑名单', () => {
  const out = sanitize(
    'a <skill_content name="x">内容</skill_content> b <available_skills> </available_skills> c <system-reminder> x',
  )
  assert.ok(!out.includes('<skill_content'), '带属性开标签剥除')
  assert.ok(!out.includes('</skill_content>'))
  assert.ok(!out.includes('available_skills'))
  assert.ok(!out.includes('<system-reminder>'), '未闭合裸标签剥除')
  assert.ok(out.startsWith('a '))
  assert.ok(out.includes(' b '))
  assert.ok(out.includes(' c  x'), '标签外正文逐字保留')
})

test('sanitize：字面 \\u003c 框架转义标记还原后中和；无注入文本逐字保留（不泛化吞 <)', () => {
  const escaped = 'in \\u003c/system-reminder> tail' // 字面反斜杠 u003c（JSON 定界防伪形）
  const out = sanitize(escaped)
  assert.ok(!out.includes('system-reminder'), '转义形还原成标签后剥除')
  assert.ok(out.startsWith('in ') && out.includes(' tail'))
  // 无哨兵文本不动：讨论 HTML/比较号的正文不被泛化剥除
  const plain = 'if a < b and tag </div> keep'
  assert.equal(sanitize(plain), plain)
})

// ---------- textContent / 投影（官方 projectSessionConversation 语义） ----------

test('textContent：text 块抽取拼接（官方语义），string 容错，非文本块跳过', () => {
  assert.equal(
    textContent([{ type: 'text', text: 'a' }, { type: 'image_url', image_url: {} }, { type: 'text', text: 'b' }]),
    'a\nb',
  )
  assert.equal(textContent('裸串'), '裸串')
  assert.equal(textContent(undefined), '')
  assert.equal(textContent([{ type: 'tool_use', name: 'x' }]), '')
})

test('projectSessionEvent：user(source.kind=user) 与 assistant 投影；checkpoint 同 user 面', () => {
  const user = projectSessionEvent({
    type: 'user/message',
    data: { role: 'user', id: 'm1', content: [{ type: 'text', text: '你好' }], source: { kind: 'user' } },
  })
  assert.deepEqual(user, { role: 'user', text: '你好' })
  const ckpt = projectSessionEvent({
    type: 'user/message',
    data: { role: 'user', id: 'm2', content: [{ type: 'text', text: '压缩摘要' }], source: { kind: 'compact-checkpoint', compactionId: 'c1' } },
  })
  assert.deepEqual(ckpt, { role: 'user', text: '压缩摘要' })
  const asst = projectSessionEvent({
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { role: 'assistant', id: 'm3', content: [{ type: 'text', text: '回复' }], source: { kind: 'model', provider: 'p', model: 'm' } }, stream: [] },
  })
  assert.deepEqual(asst, { role: 'assistant', text: '回复' })
})

test('projectSessionEvent：注入体与 tool/developer/system/reasoning 面全排除（projectSessionConversation 语义）', () => {
  // 注入体：source.kind 非 user 非 compact-checkpoint（plugin/skill 生产者各自声明 kind）
  assert.equal(projectSessionEvent({
    type: 'user/message',
    data: { role: 'user', id: 'i1', content: [{ type: 'text', text: 'skill 注入体' }], source: { kind: 'plugin', plugin: 'kb-context' } },
  }), null)
  assert.equal(projectSessionEvent({
    type: 'user/message',
    data: { role: 'user', id: 'i2', content: [{ type: 'text', text: 'cron 注入' }], source: { kind: 'cron' } },
  }), null)
  // 其余事件类型全 null（tool/call、tool/result、developer、system、attempt…）
  for (const type of ['tool/call', 'tool/result', 'developer/message', 'system/message', 'assistant/attempt', 'step/start', 'turn/start', 'unknown/x']) {
    assert.equal(projectSessionEvent({ type, data: {} }), null, type)
  }
  assert.equal(projectSessionEvent(null), null)
  // sanitize 双保险第一步：投影即中和（注入标签进不了缓冲）
  const p = projectSessionEvent({
    type: 'user/message',
    data: { role: 'user', id: 'm9', content: [{ type: 'text', text: 'x <system-reminder>inj</system-reminder> y' }], source: { kind: 'user' } },
  })
  assert.equal(p.text, 'x  y')
  // 空文本（全被中和/无 text 块）→ null 不入缓冲
  assert.equal(projectSessionEvent({
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '' }] }, stream: [] },
  }), null)
})

// ---------- subagent 判别（tianxingleo 范式） ----------

test('isSubagentHeader：origin=subagent 或 parentSession 在场即不捕获；普通会话放行', () => {
  assert.equal(isSubagentHeader({ origin: 'subagent' }), true)
  assert.equal(isSubagentHeader({ parentSession: 'ses_parent' }), true)
  assert.equal(isSubagentHeader({ origin: 'subagent', parentSession: 'p' }), true)
  assert.equal(isSubagentHeader({}), false)
  assert.equal(isSubagentHeader(undefined), false)
  assert.equal(isSubagentHeader({ cwd: '/x', origin: undefined, parentSession: undefined }), false)
})

// ---------- 收口状态机（turn-stopping 收口 + completed 才提交） ----------

test('状态机：stopping 收口 pending；completed 提交、aborted/error 丢弃（不落盘语义的内存面）', () => {
  // completed → 提交
  const s1 = createCaptureState()
  observe(s1, { type: 'user/message', data: { content: [{ type: 'text', text: 'q' }], source: { kind: 'user' } } })
  observe(s1, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'a' }] } } })
  stopping(s1, 7)
  assert.equal(s1.uncommitted.length, 0, '收口后 uncommitted 清空')
  const done = turnEnded(s1, 7, 'completed')
  assert.equal(done?.length, 2)
  assert.equal(s1.pending, null)
  // aborted → 丢弃（pending 与 uncommitted 双清）
  const s2 = createCaptureState()
  observe(s2, { type: 'user/message', data: { content: [{ type: 'text', text: 'q' }], source: { kind: 'user' } } })
  stopping(s2, 1)
  observe(s2, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '半截' }] } } })
  assert.equal(turnEnded(s2, 1, 'aborted'), null)
  assert.equal(s2.pending, null)
  assert.equal(s2.uncommitted.length, 0, 'aborted 连 uncommitted 双清（aborted 不落盘）')
  // error → 丢弃；无 stopping 的 error 轮同样双清
  const s3 = createCaptureState()
  observe(s3, { type: 'user/message', data: { content: [{ type: 'text', text: 'q' }], source: { kind: 'user' } } })
  stopping(s3, 2)
  assert.equal(turnEnded(s3, 2, 'error'), null)
  observe(s3, { type: 'user/message', data: { content: [{ type: 'text', text: 'q2' }], source: { kind: 'user' } } })
  assert.equal(turnEnded(s3, 3, 'error'), null, '无 pending 的 error 轮：uncommitted 清空')
  assert.equal(s3.uncommitted.length, 0)
})

test('状态机：turn 号不匹配不提交（防御）；steer 重入同 turn 多次收口合并不丢', () => {
  const s = createCaptureState()
  observe(s, { type: 'user/message', data: { content: [{ type: 'text', text: 'q1' }], source: { kind: 'user' } } })
  stopping(s, 5)
  // steer 后同 turn 再收口：post-stopping 消息并入 pending（不覆盖丢失）
  observe(s, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'steer 后续' }] } } })
  stopping(s, 5)
  assert.equal(s.pending?.entries?.length, 2, '同 turn 二次收口合并')
  // turn 号不匹配 → 不提交也不动 pending
  assert.equal(turnEnded(s, 4, 'completed'), null)
  assert.equal(s.pending.turn, 5, '异号 turn/end 不消费 pending')
  const committed = turnEnded(s, 5, 'completed')
  assert.equal(committed?.length, 2)
})
