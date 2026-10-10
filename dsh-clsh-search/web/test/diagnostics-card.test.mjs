// diagnostics-card.test.mjs — Task 19 诊断卡机械判据（K-11 零自造色/禁 v-if、K-15 出网仅按钮、INV-11/INV-14/INV-21 文字面）。
// UI 面无 DOM runner：沿 k-constraints.test.mjs 形制做源码面机械断言（grep 判据 + 顺序判据），行为面由真对真集成（LRN-047）承载。
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SRC_DIR = path.join(WEB_DIR, 'src')
const CARD = readFileSync(path.join(SRC_DIR, 'components', 'DiagnosticsCard.vue'), 'utf8')
const APP = readFileSync(path.join(SRC_DIR, 'App.vue'), 'utf8')
const API = readFileSync(path.join(SRC_DIR, 'lib', 'settings-api.js'), 'utf8')

test('机械面：DiagnosticsCard ≤300 行、零 v-if、零自造色（K-11/K-22）', () => {
  const lines = CARD.split('\n').length
  assert.ok(lines <= 300, `组件 ${lines} 行超 300 行上限`)
  assert.equal(/v-if/.test(CARD), false, '组件出现 v-if（K-11 禁条件渲染重交互）')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  const rgbPattern = /\b(?:rgba?|hsla?)\s*\(/
  assert.equal(hexPattern.test(CARD), false, '组件出现硬编码 hex')
  assert.equal(rgbPattern.test(CARD), false, '组件出现硬编码 rgb/hsl')
})

test('卡序（INV-21）：五卡序 = 源管理→性能预算→接管与隐私→代理配置→诊断；源健康行已收编零残留', () => {
  const iSave = APP.indexOf('保存更改')
  const iSource = APP.indexOf('<SourceCard')
  const iBudget = APP.indexOf('<BudgetCard')
  const iTakeover = APP.indexOf('<TakeoverCard')
  const iProxy = APP.indexOf('<ProxyCard')
  const iDiag = APP.indexOf('<DiagnosticsCard')
  assert.ok(iSave > -1 && iSource > iSave, 'SourceCard 不得前置保存按钮')
  assert.ok(iBudget > iSource, '性能预算须在源管理之后')
  assert.ok(iTakeover > iBudget, '接管与隐私须在性能预算之后')
  assert.ok(iProxy > iTakeover, '代理配置须在接管与隐私之后（Task 23 五卡序）')
  assert.ok(iDiag > iProxy, '诊断卡须在代理配置之后（INV-21 五卡序）')
  assert.ok(iDiag > iSave, '诊断卡不得前置保存按钮（INV-21）')
  assert.equal(APP.includes('SourceHealthRow'), false, '源健康行已并入源管理大卡（T-E/R14），App 不得再挂载')
  // T-G 六段卡序收尾：诊断之后 = 触发日志弹层 + 页脚（TECH.md §2-⑤）
  const iFooter = APP.lastIndexOf('<p class="cs-page-foot">')
  assert.ok(iFooter > iDiag, '页脚须在诊断卡之后（六段卡序收尾）')
  assert.ok(APP.indexOf('<LogModal') > iDiag, '触发日志弹层挂载在诊断卡之后')
})

test('日志弹层接线（Task 21）：LogModal 挂载且走 logOpen 开合缝', () => {
  assert.ok(APP.indexOf('<LogModal') > APP.indexOf('<DiagnosticsCard'), 'LogModal 挂载缺位或顺序异常')
  assert.match(APP, /:open="logOpen"/, 'LogModal 开合须接 logOpen')
  assert.match(APP, /@close="logOpen = false"/, 'LogModal 关闭须收 logOpen')
})

test('进页自动拉取一次 diagnostics（纯本地零出网）：onMounted 只挂 runSelfCheck', () => {
  assert.match(CARD, /onMounted\(runSelfCheck\)/, '缺少进页自动拉取（onMounted(runSelfCheck)）')
  const onMountedCalls = CARD.match(/onMounted\([^)]*\)/g) ?? []
  assert.deepEqual(onMountedCalls, ['onMounted(runSelfCheck)'], 'onMounted 只允许挂本地自检')
  const selfCheckBody = CARD.slice(CARD.indexOf('async function runSelfCheck'), CARD.indexOf('/** 真联网测试'))
  assert.match(selfCheckBody, /api\.diagnostics\(\)/, 'runSelfCheck 须走 api.diagnostics()')
  assert.equal(/onlineTest|probe\(/.test(selfCheckBody), false, 'runSelfCheck 不得触发任何出网调用')
})

test('真联网测试为独立按钮（INV-14 / K-15）：仅 click 触发，绝不自动跑', () => {
  assert.match(CARD, /@click="runOnlineTest"/, '真联网测试须为独立按钮 click 触发')
  const calls = CARD.match(/api\.onlineTest\(\)/g) ?? []
  assert.equal(calls.length, 1, `api.onlineTest() 仅允许出现在按钮 handler（实得 ${calls.length}）`)
  assert.match(CARD, /async function runOnlineTest\(\)/, 'runOnlineTest handler 在位')
  const onlineBody = CARD.slice(CARD.indexOf('async function runOnlineTest'), CARD.indexOf('/** 手动清缓存'))
  assert.match(onlineBody, /api\.onlineTest\(\)/, 'handler 内调 api.onlineTest()')
})

test('自检清单形制 {id,label,status,detail} + summary「N 项 · X 通过 / Y 失败」透传', () => {
  assert.match(CARD, /v-for="item in snapshot\.items"/, '清单按 items 渲染')
  assert.match(CARD, /:key="item\.id"/, '清单 keyed by item.id')
  assert.match(CARD, /\{\{ item\.label \}\}/, 'label 在位')
  assert.match(CARD, /\{\{ item\.detail \}\}/, 'detail 次行在位')
  assert.match(CARD, /item\.status === 'pass'/, 'status 两态判定在位')
  assert.match(CARD, /snapshot\.value\.summary/, 'summary（「N 项 · X 通过 / Y 失败」由后端生成）透传到状态行')
})

test('✓/✗ 行渲染 + 四态状态机 idle/loading/ok/error + 「重新自检」按钮', () => {
  assert.match(CARD, /✓ 正常/, '✓ 行文案在位')
  assert.match(CARD, /✗ 失败/, '✗ 行文案在位')
  for (const state of ['idle', 'loading', 'ok', 'error']) {
    assert.ok(CARD.includes(`'${state}'`), `状态机缺 ${state} 态`)
  }
  assert.match(CARD, /@click="runSelfCheck"/, '「重新自检」按钮在位')
})

test('文案面：INV-11 不落盘明示 + INV-14/K-15 出网语义 + 按钮组四枚齐', () => {
  assert.match(CARD, /不落盘、重启即清空/, 'INV-11 明示文案缺位')
  assert.match(CARD, /仅按钮点击触发/, 'INV-14 出网语义文案缺位')
  for (const label of ['重新自检', '真联网测试', '查看触发日志', '手动清缓存']) {
    assert.ok(CARD.includes(label), `按钮组缺「${label}」`)
  }
  assert.match(CARD, /emit\('open-log'\)/, '查看触发日志须 emit open-log（Task 21 LogModal 接缝）')
})

test('指标区：ego 真实计数 + 日志环计数 + 缓存口径在位（US-16/US-17/INV-20）', () => {
  assert.match(CARD, /egoMetric/, 'ego 指标在位')
  assert.match(CARD, /logMetric/, '日志指标在位')
  assert.match(CARD, /LRU 50 条/, '缓存指标口径在位')
  assert.match(CARD, /真实计数/, 'ego 真实计数标注在位（INV-20）')
  assert.match(CARD, /snapshot\.value\.ego\.used/, 'ego 已用取自快照')
  assert.match(CARD, /snapshot\.value\.log\.used/, '日志已用取自快照')
  assert.match(CARD, /日志不可用/, 'INV-13 诚实态：日志环不可用须明示「日志不可用」')
})

test('契约缝 + 样式面：settings-api 三方法在位，样式零 hex（K-11/K-22）', () => {
  for (const name of ['diagnostics()', 'onlineTest()', 'clearCache()']) {
    assert.ok(API.includes(name), `settings-api 缺 ${name}`)
  }
  const styles = readFileSync(path.join(SRC_DIR, 'styles.css'), 'utf8')
  const hexPattern = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
  assert.equal(hexPattern.test(styles), false, 'styles.css 出现硬编码 hex')
  for (const cls of ['.cs-check-list', '.cs-metrics', '.cs-btn-ghost', '.cs-btn-tiny']) {
    assert.ok(styles.includes(cls), `styles.css 缺 ${cls}`)
  }
})
