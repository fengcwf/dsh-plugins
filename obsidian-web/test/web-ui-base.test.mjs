// UI C 公共底座纯函数单测（S1 / delta-specs/ui-ca-wave.md S1 节；设计正本 candidate-c.md）：
//   ① 保存状态徽标四态 + 面板头标题派生 + 状态面（骨架/错误/空）视图模型（组件逻辑测试）；
//   ② 最近打开（空状态构图数据面）：归一/去重/容量/持久化/时间文案；
//   ③ AA 派生色对比度复测（脚本算比值）：色值=SHARE_TOKEN_SNAPSHOT（dsh token 快照）经
//      color-mix(in srgb, token, black N%) 语义推导（sRGB 逐通道线性混合，与 CSS 同口径），
//      断言派生值与 README 逐值同（#335cb3 / #3764c4）且全部 ≥WCAG 2.1 AA。
// 组件容器/展示分离：.vue 只做展示，逻辑全落纯模块（web/src/lib/ui-base.js）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  saveBadge, noteTitle, stateErrorModel, EMPTY_MODEL, SKELETON_SHAPE,
  normalizeRecents, recordRecent, formatRecentTime, loadRecents, saveRecents, RECENTS_MAX,
} from '../web/src/lib/ui-base.js'
import { SHARE_TOKEN_SNAPSHOT } from '../lib/share-theme.js'

const STYLES = fs.readFileSync(fileURLToPath(new URL('../web/src/styles.css', import.meta.url)), 'utf8')

// ── ① 保存状态徽标四态 ──────────────────────────────────────────────────────
test('保存状态徽标四态：clean/dirty/saving/conflict 文字与语义 tone 一一对应', () => {
  assert.deepEqual(saveBadge('clean'), { status: 'clean', text: '已保存', tone: 'saved' })
  assert.deepEqual(saveBadge('dirty'), { status: 'dirty', text: '未保存', tone: 'dirty' })
  assert.deepEqual(saveBadge('saving'), { status: 'saving', text: '保存中', tone: 'saving' })
  assert.deepEqual(saveBadge('conflict'), { status: 'conflict', text: '保存冲突', tone: 'conflict' })
})

test('徽标未知状态如实展示原文，不冒充四态之一', () => {
  assert.deepEqual(saveBadge('weird'), { status: 'unknown', text: 'weird', tone: 'saving' })
  assert.deepEqual(saveBadge(undefined), { status: 'unknown', text: '', tone: 'saving' })
})

test('面板统一头标题派生 noteTitle：路径末段去扩展名', () => {
  assert.equal(noteTitle('02-致远OA/表单-采购申请审批流改造.md'), '表单-采购申请审批流改造')
  assert.equal(noteTitle('notes/a.md'), 'a')
  assert.equal(noteTitle('INDEX.md'), 'INDEX')
  assert.equal(noteTitle(''), '')
})

// ── ① 状态面（骨架/错误/空）视图模型 ────────────────────────────────────────
test('错误卡模型：timeout=可解释超时+指引+可重试（S2 预置形）；load=可重试；notice=通用提示', () => {
  const t = stateErrorModel('timeout', { path: 'notes/a.md' })
  assert.equal(t.title, '笔记加载失败')
  assert.match(t.why, /8 秒/)
  assert.ok(t.guidance.length > 0, 'timeout 必带可解释指引')
  assert.equal(t.path, 'notes/a.md')
  assert.equal(t.retryable, true)
  const l = stateErrorModel('load', { message: 'HTTP 500', path: 'notes/b.md' })
  assert.equal(l.retryable, true)
  assert.match(l.why, /HTTP 500/)
  const n = stateErrorModel('notice', { message: '找不到笔记：x' })
  assert.equal(n.retryable, false)
  assert.match(n.why, /找不到笔记/)
  assert.equal(n.guidance, '')
})

test('骨架形：标题条 52% + 段落条 95/88/72%（贴阅读版式，非圆圈 spinner）', () => {
  assert.equal(SKELETON_SHAPE.titleWidthPct, 52)
  assert.deepEqual([...SKELETON_SHAPE.lineWidthsPct], [95, 88, 72])
})

test('空状态构图文案：下一步（浏览目录/搜索笔记）+ 最近打开，四键齐全', () => {
  assert.equal(EMPTY_MODEL.browseLabel, '浏览目录')
  assert.equal(EMPTY_MODEL.searchLabel, '搜索笔记')
  assert.equal(EMPTY_MODEL.recentTitle, '最近打开')
  assert.ok(EMPTY_MODEL.title.length > 0 && EMPTY_MODEL.body.length > 0)
})

// ── ② 最近打开（空状态构图数据面）────────────────────────────────────────────
test('最近打开归一：敌意值丢弃（非数组/空 path/非有限 at）、按 path 去重、截容量', () => {
  assert.deepEqual(normalizeRecents(null), [])
  assert.deepEqual(normalizeRecents([{ path: '', at: 1 }, { path: 'a' }, { path: 'b', at: Number.NaN }]), [])
  const dup = normalizeRecents([{ path: 'a', at: 1 }, { path: 'a', at: 2 }])
  assert.deepEqual(dup, [{ path: 'a', at: 1 }])
  const long = Array.from({ length: RECENTS_MAX + 3 }, (_, i) => ({ path: `p${i}`, at: i }))
  assert.equal(normalizeRecents(long).length, RECENTS_MAX)
})

test('recordRecent：同 path 旧条目剔除（恰一条）、新者在前、容量恒 5', () => {
  let list = recordRecent([], 'notes/a.md', 100)
  list = recordRecent(list, 'notes/b.md', 200)
  list = recordRecent(list, 'notes/a.md', 300)
  assert.deepEqual(list, [{ path: 'notes/a.md', at: 300 }, { path: 'notes/b.md', at: 200 }])
  for (let i = 0; i < 8; i += 1) list = recordRecent(list, `p${i}`, 400 + i)
  assert.equal(list.length, RECENTS_MAX)
  assert.equal(list[0].path, 'p7')
})

test('最近打开持久化：storage 往返逐条同 + 坏 JSON 容错回空（storage 注入同 view-state 纪律）', () => {
  const map = new Map()
  const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) }
  const list = recordRecent([], 'notes/a.md', 100)
  saveRecents(storage, list)
  assert.deepEqual(loadRecents(storage), list)
  map.set('ob:recents', '{坏 json')
  assert.deepEqual(loadRecents(storage), [])
  saveRecents(null, list) // 无 storage 不炸
})

test('时间文案：今天 HH:MM / 昨天 HH:MM / YYYY-MM-DD（无效回空串）', () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime() // 2026-09-29 12:00 本地
  const today = new Date(2026, 8, 29, 9, 5).getTime()
  const yesterday = new Date(2026, 8, 28, 21, 7).getTime()
  const older = new Date(2026, 8, 25, 0, 0).getTime()
  assert.equal(formatRecentTime(today, now), '今天 09:05')
  assert.equal(formatRecentTime(yesterday, now), '昨天 21:07')
  assert.equal(formatRecentTime(older, now), '2026-09-25')
  assert.equal(formatRecentTime('x', now), '')
})

// ── ③ AA 派生色对比度复测（脚本算比值；README 值可对照）────────────────────────
/** hex(#rgb/#rrggbb) → [r,g,b]（快照 token 均为不透明 hex） */
function rgb(hex) {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}

/** color-mix(in srgb, base, black pct%) 同口径：sRGB 逐通道向黑混合（CSS Color 5 in srgb 插值） */
function mixBlack(hex, pct) {
  const k = 1 - pct
  return `#${rgb(hex).map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('')}`
}

/** WCAG 2.1 相对亮度 + 对比度 (L1+0.05)/(L2+0.05) */
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const L = SHARE_TOKEN_SNAPSHOT.light
const D = SHARE_TOKEN_SNAPSHOT.dark

test('AA 派生①实心主按钮底：color-mix(business-primary, black 22%) = #335cb3（README 值同），白字 6.32:1 ≥ 4.5', () => {
  const solid = mixBlack(L['--dsw-alias-state-business-primary'], 0.22)
  assert.equal(solid, '#335cb3', '派生值与 candidate-c README 逐值同')
  const ratio = contrast(solid, L['--dsw-alias-bg-base']) // 按钮文字=bg-base（浅色=#fff 白字）
  assert.ok(ratio >= 4.5, `白字配派生实底 ${ratio.toFixed(2)}:1 低于 AA 4.5`)
  assert.ok(Math.abs(ratio - 6.32) < 0.05, `与 README 6.32:1 对照（实算 ${ratio.toFixed(2)}:1）`)
})

test('AA 派生②链接色：color-mix(link, black 15%) = #3764c4（README 值同），白底 5.55:1 ≥ 4.5', () => {
  const link = mixBlack(L['--dsw-alias-link'], 0.15)
  assert.equal(link, '#3764c4', '派生值与 candidate-c README 逐值同')
  const ratio = contrast(link, L['--dsw-alias-bg-base'])
  assert.ok(ratio >= 4.5, `派生链接色 vs 白底 ${ratio.toFixed(2)}:1 低于 AA 4.5`)
  assert.ok(Math.abs(ratio - 5.55) < 0.05, `与 README 5.55:1 对照（实算 ${ratio.toFixed(2)}:1）`)
})

test('AA 修①小字：label-secondary 5.80:1 过 AA；label-tertiary 3.71:1=现状缺口前提（README 同判）', () => {
  const sec = contrast(L['--dsw-alias-label-secondary'], L['--dsw-alias-bg-base'])
  assert.ok(sec >= 4.5, `label-secondary 小字 ${sec.toFixed(2)}:1 低于 AA`)
  assert.ok(Math.abs(sec - 5.8) < 0.05, `与 README 5.80:1 对照（实算 ${sec.toFixed(2)}:1）`)
  const ter = contrast(L['--dsw-alias-label-tertiary'], L['--dsw-alias-bg-base'])
  assert.ok(ter < 4.5, `label-tertiary ${ter.toFixed(2)}:1 应复现现状缺口（README 3.71:1）`)
})

test('AA 修② mark/rename 警示：文字 label-primary 17.48:1 过 AA（现状 warn-label 2.58:1 缺口前提同判）', () => {
  const bg = L['--dsw-alias-state-warn-tertiary']
  const fixed = contrast(L['--dsw-alias-label-primary'], bg)
  assert.ok(fixed >= 4.5, `label-primary 配 warn-tertiary ${fixed.toFixed(2)}:1 低于 AA`)
  assert.ok(Math.abs(fixed - 17.48) < 0.1, `与 README 17.48:1 对照（实算 ${fixed.toFixed(2)}:1）`)
  const old = contrast(L['--dsw-alias-state-warn-label'], bg)
  assert.ok(old < 4.5, `warn-label 配 warn-tertiary ${old.toFixed(2)}:1 应复现现状缺口（README 2.58:1）`)
})

test('AA 修③现状主按钮缺口前提：raw business-primary 白字 4.23:1 不过 AA（派生修法由此成立）', () => {
  const ratio = contrast(L['--dsw-alias-state-business-primary'], L['--dsw-alias-bg-base'])
  assert.ok(ratio < 4.5, `raw business-primary 白字 ${ratio.toFixed(2)}:1 应复现现状缺口（README 4.23:1）`)
})

test('焦点环非文本对比 ≥3:1：business-primary vs bg-base（浅 4.23 / 深 7.83）', () => {
  const light = contrast(L['--dsw-alias-state-business-primary'], L['--dsw-alias-bg-base'])
  assert.ok(light >= 3, `浅色焦点环 ${light.toFixed(2)}:1 低于非文本 AA 3:1`)
  const dark = contrast(D['--dsw-alias-state-business-primary'], D['--dsw-alias-bg-base'])
  assert.ok(dark >= 3, `深色焦点环 ${dark.toFixed(2)}:1 低于非文本 AA 3:1`)
})

test('深色主题派生面：business-primary 配 bg-base 文字 7.83:1、link 7.83:1 直用 token 即过 AA（不加深）', () => {
  const solidRatio = contrast(D['--dsw-alias-state-business-primary'], D['--dsw-alias-bg-base'])
  assert.ok(solidRatio >= 4.5, `深色实底配 bg-base 文字 ${solidRatio.toFixed(2)}:1 低于 AA`)
  assert.ok(Math.abs(solidRatio - 7.83) < 0.05, `与 README 7.83:1 对照（实算 ${solidRatio.toFixed(2)}:1）`)
  const linkRatio = contrast(D['--dsw-alias-link'], D['--dsw-alias-bg-base'])
  assert.ok(linkRatio >= 4.5, `深色链接 ${linkRatio.toFixed(2)}:1 低于 AA`)
})

test('推导式落码：styles.css 注释写明 color-mix 推导式与出处，声明值=推导值（派生自 dsh token 非第二套色板）', () => {
  assert.match(STYLES, /color-mix\(in srgb, business-primary, #000 22%\)/, '注释缺推导式①（含 #000 混色轴原式）')
  assert.match(STYLES, /color-mix\(in srgb, link, #000 15%\)/, '注释缺推导式②（含 #000 混色轴原式）')
  assert.match(
    STYLES,
    /--ow-accent-solid:\s*color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), black 22%\)/,
    '实底声明必须=推导值（black=#000 同值记法）',
  )
  assert.match(
    STYLES,
    /--ow-link-safe:\s*color-mix\(in srgb, var\(--dsw-alias-link, LinkText\), black 15%\)/,
    '链接声明必须=推导值（black=#000 同值记法）',
  )
  assert.match(STYLES, /非第二套色板|非第二套色板/, '须明示派生自 dsh token 非第二套色板')
})
