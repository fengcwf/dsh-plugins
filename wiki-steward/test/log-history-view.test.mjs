// LogHistoryView 真实现竞态/互斥锁（W1 epoch 守卫 + N2 文案互斥，0.7.0 波复审收口）。
// 被测件=真组件整链：web/src/components/LogHistoryView.vue（容器）+ IngestLogPanel.vue（展示）
// + lib/log-history.js / log-filter.js 真状态机真纯函数——零 mock 自证（LRN-047 真对真口径）。
// 挂载管线=vue/compiler-sfc（与 vite 同一官方编译器，同线程 registerHooks 直编 .vue 源文件）
// + 真 Vue 运行时 createRenderer 内存节点（无 DOM 依赖）；唯一假缝=props.api.fetchLogs 可控传输
// （I/O 边界注入缝，client-face 注入缝同款纪律）：手动 resolve 制造「旧筛选响应晚到」时序。
// 锁语义：
//   W1 ①旧筛选 loadOlder 响应晚到被丢弃（既不 applyOlder 也不替换当前页）+ 游标不跨筛选集
//   W1 ②在途 reload 遇 filter-change：旧 reload 响应晚到被丢弃（不覆盖新筛选页）
//   W1 ③epoch 序号契约：filter-change/reload 递增、loadOlder 不递增（defineExpose 直读真组件）
//   N2 ④区间倒置只呈现「当前时间区间为空」，与空态文案「所选筛选条件下无日志条目。」互斥渲染（含判别力对照）
//   发布物面（LRN-045）⑤web/dist 字面含 W1 守卫语义（epoch）——防「src 改了 dist 旧」假绿。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, nextTick } from 'vue'

// ── .vue 直编装载钩子（同线程 registerHooks；编译器=vue 官方 compiler-sfc，与 vite 同管线）──
let sfcSeq = 0
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.vue')) {
      return { shortCircuit: true, url: new URL(specifier, context.parentURL).href, format: 'module' }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.vue')) {
      const filename = fileURLToPath(url)
      const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
      if (errors.length) throw errors[0]
      sfcSeq += 1
      const compiled = compileScript(descriptor, { id: `ws-logview-${sfcSeq}`, inlineTemplate: true })
      return { format: 'module', source: compiled.content, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const { default: LogHistoryView } = await import('../web/src/components/LogHistoryView.vue')
const { rangeInverted, defaultFilters } = await import('../web/src/lib/log-filter.js')

// ── createRenderer 内存节点（最小 nodeOps：真 Vue 运行时渲染真组件，无 DOM）──────────────
function createNodeOps() {
  const detach = (child) => {
    if (!child.parent) return
    const i = child.parent.children.indexOf(child)
    if (i !== -1) child.parent.children.splice(i, 1)
    child.parent = null
  }
  return {
    createElement: (tag) => ({ tag, children: [], props: {}, parent: null }),
    createText: (text) => ({ tag: '#text', text: String(text), children: [], props: {}, parent: null }),
    createComment: (text) => ({ tag: '#comment', text: String(text), children: [], props: {}, parent: null }),
    setText: (node, text) => { node.text = String(text) },
    setElementText: (el, text) => { el.text = String(text); el.children = [] },
    insert: (child, parent, anchor) => {
      detach(child)
      child.parent = parent
      const i = anchor ? parent.children.indexOf(anchor) : -1
      if (i === -1) parent.children.push(child)
      else parent.children.splice(i, 0, child)
    },
    remove: detach,
    parentNode: (node) => node.parent,
    nextSibling: (node) => {
      if (!node.parent) return null
      return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
    },
    patchProp: (el, key, prev, next) => { el.props[key] = next },
    setScopeId: () => {},
    insertStaticContent: () => { throw new Error('SFC 静态插入不应出现在本组件模板') },
    cloneNode: (node) => ({ ...node, children: [], parent: null }),
  }
}

function walk(node, out = []) {
  out.push(node)
  for (const c of node.children ?? []) walk(c, out)
  return out
}
/** 渲染文本面（文本节点 + 元素内联文本，含注释外全部字面） */
function texts(root) {
  return walk(root)
    .filter((n) => n.tag !== '#comment' && typeof n.text === 'string')
    .map((n) => n.text)
    .join('\n')
}
function findButton(root, label) {
  return walk(root).find((n) => n.tag === 'button' && (n.text === label || (n.children ?? []).some((c) => c.text === label)))
}
function dateInput(root, label) {
  return walk(root).find((n) => n.tag === 'input' && n.props['aria-label'] === label)
}
const flush = async () => { await nextTick(); await nextTick(); }

const SOURCES = [
  { id: 'cron:wiki-ingest', label: '夜间任务' },
  { id: 'manual:scan', label: '手动扫描' },
  { id: 'alerts:kb', label: '告警' },
]
const L = (source, name, line, text, dateKey) => ({ source, label: source, name, line, text, dateKey })

/** 可控传输缝（I/O 边界）：记录每次 fetchLogs(size, cursor, query)，手动 resolve/reject 制造晚到时序 */
function makeApi() {
  const calls = []
  return {
    calls,
    fetchLogs(size, cursor, query) {
      return new Promise((resolve, reject) => { calls.push({ size, cursor, query, resolve, reject }) })
    },
  }
}
const page = (lines, cursor, hasMore = true) => ({ lines, hasMore, cursor, sources: SOURCES })

/** 挂载真组件（onMounted 即发首取 calls[0]） */
async function mountView() {
  const ops = createNodeOps()
  const { createApp } = createRenderer(ops)
  const api = makeApi()
  const root = ops.createElement('root')
  const vm = createApp(LogHistoryView, { api }).mount(root)
  await flush()
  return { root, vm, api }
}
/** epoch 直读（defineExpose 暴露；ref 解包与否两形兼容） */
const epochOf = (vm) => (vm.epoch && typeof vm.epoch === 'object' && 'value' in vm.epoch ? vm.epoch.value : vm.epoch)

// ── W1 ①：旧筛选 loadOlder 响应晚到被丢弃——当前页保持新筛选集 + 游标不跨筛选集 ─────────
test('W1 竞态：加载更早在途时改筛选——旧筛选 loadOlder 晚到被丢弃，当前页保持新筛选集（真组件真状态机）', async () => {
  const { root, api } = await mountView()
  // 初始页（无筛选）：old1/old2 可翻更早
  api.calls[0].resolve(page([L('cron:wiki-ingest', 'f', 1, 'old1', '20260901'), L('cron:wiki-ingest', 'f', 2, 'old2', '20260902')], 'k1'))
  await flush()
  assert.match(texts(root), /old1/, '初始页已渲染')
  // 「加载更早」在途（旧筛选请求：cursor=k1、query={}）
  findButton(root, '加载更早').props.onClick()
  await flush()
  assert.equal(api.calls.length, 2, 'loadOlder 已发出')
  assert.deepEqual(api.calls[1].query, {}, '在途请求=旧筛选（无筛选参）')
  assert.equal(api.calls[1].cursor, 'k1', '在途请求=旧筛选游标')
  // 用户改筛选（起始日期）→ filter-change → reload（游标重置，新筛选集）
  dateInput(root, '起始日期').props.onChange({ target: { value: '2026-09-05' } })
  await flush()
  assert.deepEqual(api.calls[2].query, { since: '2026-09-05' }, 'reload 同参新筛选')
  assert.equal(api.calls[2].cursor, undefined, '筛选变更=游标重置重取最新页')
  // 新筛选页先到
  api.calls[2].resolve(page([L('manual:scan', 'g', 9, 'newX', '20260906')], 'k3'))
  await flush()
  assert.match(texts(root), /newX/, '新筛选页已渲染')
  assert.doesNotMatch(texts(root), /old1|old2/, 'applyLatest 整页替换（旧筛选页不在）')
  // 旧筛选 loadOlder 响应晚到 → 必须整份丢弃（既不 applyOlder 也不替换当前页）
  api.calls[1].resolve(page([L('alerts:kb', 'h', 3, 'oldLate', '20260801')], 'k2', false))
  await flush()
  await flush()
  const shown = texts(root)
  assert.match(shown, /newX/, '当前页保持新筛选集')
  assert.doesNotMatch(shown, /oldLate/, '晚到的旧筛选页被丢弃（不 applyOlder 拼进新筛选视图）')
  assert.doesNotMatch(shown, /old1|old2/, '晚到的旧筛选页不得替换当前页')
  // meta.cursor 不跨筛选集：下一次翻旧仍用新筛选游标+新筛选参
  findButton(root, '加载更早').props.onClick()
  await flush()
  assert.equal(api.calls.length, 4, '晚到响应未触发新请求（丢弃=零副作用）')
  assert.equal(api.calls[3].cursor, 'k3', '翻旧游标=新筛选集游标（未被旧响应污染）')
  assert.deepEqual(api.calls[3].query, { since: '2026-09-05' }, '翻旧同参新筛选（旧筛选响应永不落进新筛选视图）')
})

// ── W1 ②：在途 reload 遇 filter-change——旧 reload 响应晚到被丢弃（不覆盖新筛选页）──────
test('W1 竞态：在途 reload 遇 filter-change——旧 reload 响应晚到被丢弃，不覆盖新筛选页', async () => {
  const { root, api } = await mountView()
  api.calls[0].resolve(page([L('cron:wiki-ingest', 'f', 1, 'base1', '20260901')], 'k1'))
  await flush()
  // 手动「刷新」在途
  findButton(root, '刷新').props.onClick()
  await flush()
  assert.equal(api.calls.length, 2, 'reload 在途')
  // 筛选变更再来一次 reload（epoch 递增）
  dateInput(root, '起始日期').props.onChange({ target: { value: '2026-09-05' } })
  await flush()
  assert.deepEqual(api.calls[2].query, { since: '2026-09-05' }, '新 reload 带新筛选参')
  // 新响应先到
  api.calls[2].resolve(page([L('manual:scan', 'g', 9, 'fresh', '20260906')], 'k3'))
  await flush()
  // 旧 reload 响应晚到（旧筛选集）
  api.calls[1].resolve(page([L('alerts:kb', 'h', 2, 'stale', '20260808')], 'k2'))
  await flush()
  await flush()
  const shown = texts(root)
  assert.match(shown, /fresh/, '当前页=新筛选集')
  assert.doesNotMatch(shown, /stale|base1/, '晚到的旧 reload 响应被丢弃（epoch 不匹配不替换当前页）')
})

// ── W1 ③：epoch 序号契约（defineExpose 直读真组件）────────────────────────────────────
test('W1 epoch 契约：filter-change 与 reload 递增、loadOlder 沿用不递增（真组件直读请求序号）', async () => {
  const { root, vm, api } = await mountView()
  assert.equal(epochOf(vm), 1, 'onMounted 首取 = epoch 1')
  api.calls[0].resolve(page([L('cron:wiki-ingest', 'f', 1, 'a1', '20260901')], 'k1'))
  await flush()
  // reload（刷新按钮）递增
  findButton(root, '刷新').props.onClick()
  await flush()
  assert.equal(epochOf(vm), 2, 'reload 递增 → epoch 2')
  api.calls[1].resolve(page([L('cron:wiki-ingest', 'f', 2, 'a2', '20260902')], 'k1'))
  await flush()
  // filter-change 递增
  dateInput(root, '起始日期').props.onChange({ target: { value: '2026-09-05' } })
  await flush()
  assert.equal(epochOf(vm), 3, 'filter-change（经 reload）递增 → epoch 3')
  api.calls[2].resolve(page([L('manual:scan', 'g', 3, 'a3', '20260906')], 'k3'))
  await flush()
  // loadOlder 沿用当前序号（不递增）
  findButton(root, '加载更早').props.onClick()
  await flush()
  assert.equal(epochOf(vm), 3, 'loadOlder 沿用当前 epoch（不递增）')
  api.calls[3].resolve(page([L('manual:scan', 'g', 2, 'a4', '20260904')], 'k4', false))
  await flush()
  assert.equal(epochOf(vm), 3, 'loadOlder 响应落地后 epoch 仍 3')
  assert.match(texts(root), /a4/, '同 epoch 的 loadOlder 响应正常落地（守卫只丢弃错序响应，不误杀）')
})

// ── N2 ④：区间倒置文案互斥（真组件渲染面）────────────────────────────────────────────
test('N2 互斥渲染：区间倒置时只呈现「当前时间区间为空」，不与空态文案「所选筛选条件下无日志条目。」并存', async () => {
  const { root, api } = await mountView()
  api.calls[0].resolve(page([], null, false))
  await flush()
  // 起始日期=2026-09-10，再置截止日期=2026-09-01（since>until 倒置）
  dateInput(root, '起始日期').props.onChange({ target: { value: '2026-09-10' } })
  await flush()
  api.calls[1].resolve(page([], null, false))
  await flush()
  dateInput(root, '截止日期').props.onChange({ target: { value: '2026-09-01' } })
  await flush()
  api.calls[2].resolve(page([], null, false))
  await flush()
  const shown = texts(root)
  assert.match(shown, /当前时间区间为空/, '区间倒置提示呈现（起始日期晚于截止日期——当前时间区间为空）')
  assert.doesNotMatch(shown, /所选筛选条件下无日志条目/, '空态文案不并存（互斥渲染，非掩盖）')
  assert.doesNotMatch(shown, /暂无日志（各来源均无记录）/, '其余空态文案同样不并存（只呈现区间倒置提示）')
})

test('N2 判别力对照：非倒置空结果呈现空态文案、不呈现区间倒置提示（锁不可对正常空态失明）', async () => {
  const { root, api } = await mountView()
  api.calls[0].resolve(page([], null, false))
  await flush()
  // since=until（合法闭区间，日粒度单日）→ 服务端空结果
  dateInput(root, '起始日期').props.onChange({ target: { value: '2026-09-01' } })
  await flush()
  api.calls[1].resolve(page([], null, false))
  await flush()
  dateInput(root, '截止日期').props.onChange({ target: { value: '2026-09-01' } })
  await flush()
  api.calls[2].resolve(page([], null, false))
  await flush()
  const shown = texts(root)
  assert.match(shown, /所选筛选条件下无日志条目/, '有筛选无匹配=空态文案如实呈现')
  assert.doesNotMatch(shown, /当前时间区间为空/, '非倒置不得出现区间倒置提示（判别力：互斥是双向的）')
})

// ── N2 纯函数锁：rangeInverted 边界（单一判定源，真模块直调）──────────────────────────
test('rangeInverted：区间倒置判定边界（since>until 真；等值/单边/空界假）', () => {
  assert.equal(rangeInverted({ since: '2026-09-10', until: '2026-09-01', types: null }), true, 'since>until=倒置')
  assert.equal(rangeInverted({ since: '2026-09-01', until: '2026-09-01', types: null }), false, '等值闭区间=单日非倒置')
  assert.equal(rangeInverted({ since: '2026-09-01', until: '2026-09-10', types: null }), false, '正序非倒置')
  assert.equal(rangeInverted({ since: '2026-09-10', until: '', types: null }), false, '缺截止=无界非倒置')
  assert.equal(rangeInverted({ since: '', until: '2026-09-01', types: null }), false, '缺起始=无界非倒置')
  assert.equal(rangeInverted(defaultFilters()), false, '缺省筛选非倒置')
})

// ── 发布物面锁（LRN-045）⑤：web/dist 字面含新语义（防「src 改了 dist 旧」假绿）──────────
test('LRN-045 发布物面：web/dist/panel.js 字面含 W1 守卫语义（epoch）与 N2 双文案（构建物已随 src 重建）', () => {
  const dist = fs.readFileSync(path.join(fileURLToPath(new URL('..', import.meta.url)), 'web', 'dist', 'panel.js'), 'utf8')
  assert.match(dist, /epoch/, 'dist 字面含 W1 请求序号守卫语义（epoch 属性键——缩编下唯一存活形）')
  assert.match(dist, /当前时间区间为空/, 'dist 字面含 N2 区间倒置提示')
  assert.match(dist, /所选筛选条件下无日志条目/, 'dist 字面含 N2 空态文案（渲染互斥由组件条件锁）')
})
