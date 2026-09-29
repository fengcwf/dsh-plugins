// test/awareness.test.mjs —— awareness 文案语义冻结回归 + 新文案断言（Task 9）
//
// 语义冻结（constitution「既有语义冻结」）：
//   - awarenessText('off') 回空串；
//   - default = HEAD 形：不含逃生舱段、不含手动前缀段；
//   - high   = HEAD + 逃生舱段（不含手动前缀段）；
//   - full   = HEAD + 逃生舱段 + 手动前缀段；
//   - 恢复路径原文保留：`rtk recall <hash>` / `rtk proxy <cmd>` / `RTK_DISABLED=1 <cmd>`。
// 新文案（INV-6 / INV-2）：统计输出默认关 + 指向设置页面板（统计唯一入口，零 token）；
// 零统计注入面：awareness 文案不得携带任何统计数字。
import test from 'node:test'
import assert from 'node:assert/strict'
import { awarenessText } from '../lib/awareness.js'

/** 恢复路径原文（constitution 冻结面，逐字保留）。 */
const RECOVERY_PATHS = ['rtk recall <hash>', 'rtk proxy <cmd>', 'RTK_DISABLED=1 <cmd>']

const LEVELS = ['default', 'high', 'full']

// ───────────────────────── ① 四档语义冻结回归 ─────────────────────────

test("语义冻结：awarenessText('off') 回空串（'off' 语义由调用方处理）", () => {
  assert.equal(awarenessText('off'), '')
})

test('语义冻结：default 含恢复路径原文、不含逃生舱段与手动前缀段', () => {
  const text = awarenessText('default')
  assert.notEqual(text, '', 'default 非空')
  for (const p of RECOVERY_PATHS) {
    assert.ok(text.includes(p), `恢复路径原文缺失：${p}`)
  }
  assert.ok(!text.includes('逃生舱'), 'default 不含逃生舱段')
  assert.ok(!text.includes('手动前缀'), 'default 不含手动前缀段')
  assert.equal(awarenessText(), text, '缺省参数 = default')
})

test('语义冻结：high 含逃生舱段、不含手动前缀段', () => {
  const text = awarenessText('high')
  assert.ok(text.includes('## 逃生舱'), 'high 含逃生舱段')
  assert.ok(!text.includes('手动前缀'), 'high 不含手动前缀段')
  for (const p of RECOVERY_PATHS) {
    assert.ok(text.includes(p), `恢复路径原文缺失：${p}`)
  }
})

test('语义冻结：full 含逃生舱段 + 手动前缀段', () => {
  const text = awarenessText('full')
  assert.ok(text.includes('## 逃生舱'), 'full 继承逃生舱段')
  assert.ok(text.includes('## 手动前缀'), 'full 含手动前缀段')
  for (const p of RECOVERY_PATHS) {
    assert.ok(text.includes(p), `恢复路径原文缺失：${p}`)
  }
})

test('语义冻结：三档段拼装关系不变（default ⊂ high ⊂ full，逐段前缀包含）', () => {
  const [d, h, f] = [awarenessText('default'), awarenessText('high'), awarenessText('full')]
  assert.ok(h.startsWith(d), 'high = default + 逃生舱段（前缀拼装不变）')
  assert.ok(f.startsWith(h), 'full = high + 手动前缀段（前缀拼装不变）')
})

// ───────────────────────── ② 新文案断言（INV-6 / INV-2） ─────────────────────────

test('新文案（INV-6）：统计输出默认关的提示在场且指向设置页面板（统计唯一入口）', () => {
  for (const level of LEVELS) {
    const text = awarenessText(level)
    assert.match(text, /统计输出默认关/, `${level}：「统计输出默认关」提示缺席`)
    assert.match(text, /设置页/, `${level}：设置页面板指向缺席`)
    assert.match(text, /RTK Kit/, `${level}：设置页面板（RTK Kit 面板）指向缺席`)
  }
})

test('零统计注入面（INV-2）：awareness 文案不含任何统计数字', () => {
  for (const level of LEVELS) {
    const text = awarenessText(level)
    assert.doesNotMatch(text, /\d+(?:[.,]\d+)?\s*[%％]/, `${level}：禁止百分比统计数字`)
    assert.doesNotMatch(text, /\d[\d,.]*\s*(?:token|tokens|次|条|ms|秒|分钟|小时)/i, `${level}：禁止「数字+单位」统计量`)
    assert.doesNotMatch(text, /(?:节省|收益|压缩率|savings)[^。；\n]{0,12}\d/i, `${level}：禁止统计口径数字（节省/收益/压缩率）`)
  }
})
