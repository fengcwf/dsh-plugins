// client-settings 单测（kb-context 客户端面官方契约）：
// 被测件：lib/client.js —— window.__ModuleLoader__ 工厂形（零构建、React 无 JSX）。
// 契约（裁定 2026-09-28「kb-context 插件也在设置菜单添加相关设置配置」）：
// settings.section 命名空间注册（better-sidebar 路线，navLabel 进设置页）；纯设置无面板行
// （不注册 sidebar.panellist / main / settings.plugins.tab）；取数/保存走文档相对
// api/kb-context/settings（issue #1707 教训：无前导斜杠/相对 base）。
// 可改=triggers.words/entityPaths、budget、timeoutMs、scope；hotMap/vaultRoot 只读展示。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子/fetch），
// 设置取数走 exports.__fetch 注入缝（插桩非 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = fs.readFileSync(CLIENT_PATH, 'utf8')

function loadClientFace(uiStub) {
  const loaded = []
  const win = { __ModuleLoader__: { load: (m) => loaded.push(m) } }
  const effects = []
  let hookState = null
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: (init) => ({ current: init }),
    useEffect: (fn) => { effects.push(fn) },
    useState: (init) => {
      if (hookState === null) hookState = { v: init }
      const ref = hookState
      return [ref.v, (next) => { ref.v = next }]
    },
  }
  const req = (name) => {
    if (name === 'react') return reactStub
    if (uiStub !== undefined && name === '@deepseek-ai/dsh-client-ui-primitives') return uiStub
    throw new Error(`unexpected require: ${name}`)
  }
  const fn = new Function('window', source)
  fn(win)
  assert.equal(loaded.length, 1, 'bundle 必须登记一个模块')
  const exportsFace = loaded[0].factory(req)
  return { loaded, mod: exportsFace, effects, reactStub }
}

function mkCtx(registered, injected) {
  return {
    slots: {
      inject: (name, setup) => { injected.push(name); return setup() },
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
}

function find(node, pred) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (typeof node.type === 'string' && pred(node)) return node
  for (const c of node.children ?? []) {
    const hit = find(c, pred)
    if (hit) return hit
  }
  return null
}

const tick = () => new Promise((res) => setTimeout(res, 0))

test('client.js 是 __ModuleLoader__ 工厂形，id=kb-context，导出 {inject, apply, __fetch}', () => {
  assert.match(source, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, '必须是工厂形（浏览器 bundle 契约）')
  const { loaded, mod } = loadClientFace()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'kb-context')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.__fetch, 'function')
})

test('纯设置无面板行：只注册 settings.section（不注册 sidebar.panellist/main/settings.plugins.tab）', () => {
  const { mod } = loadClientFace()
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  assert.deepEqual(injected, ['settings.section'])
  assert.deepEqual(registered.map((r) => r.decl.name), ['settings.section'])
})

test('root 壳槽位禁注册（launcher/trigger/header/close/action/onboarding）；settings.section 是官方贡献面', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const names = registered.map((r) => r.decl.name)
  for (const banned of ['settings.launcher', 'settings.trigger', 'settings.header', 'settings.close', 'settings.action', 'settings.onboarding']) {
    assert.ok(!names.includes(banned), `root 壳槽位禁注册：${banned}`)
  }
  assert.ok(names.includes('settings.section'))
})

test('settings 命名空间注册形（better-sidebar 路线）：{name,id,order,label 函数,组件函数}', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { decl, component } = registered[0]
  assert.equal(decl.name, 'settings.section')
  assert.equal(decl.id, 'kb-context')
  assert.equal(typeof decl.order, 'number')
  assert.equal(typeof decl.label, 'function')
  assert.ok(decl.label().length > 0)
  assert.equal(typeof component, 'function')
})

test('slots.register 抛错 = 吞+兜底 disposer（缺槽位方绝不炸插件）', () => {
  const { mod } = loadClientFace()
  const ctx = {
    slots: {
      inject: (_n, setup) => setup(),
      register: () => { throw new Error('slot missing') },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  const dispose = mod.apply(ctx)
  assert.equal(typeof dispose === 'function' || dispose === undefined, true)
  if (typeof dispose === 'function') dispose()
})

test('设置面组件：GET api/kb-context/settings 载入（文档相对）→ ready 渲染（可改+只读两面）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  mod.__fetch = async (url) => {
    calls.push(url)
    return {
      json: async () => ({
        data: {
          config: { triggers: { words: ['OA'], entityPaths: [] }, budget: { maxSnippets: 3, maxTokens: 2000 }, timeoutMs: 1500, scope: { indexAll: ['wiki'], grepOnDemand: [] }, hotMap: { enabled: false, maxChars: 600 }, vaultRoot: '/mnt/unraid_data/Obsidian' },
          editable: [['triggers', 'words'], ['timeoutMs']],
          writable: true,
        },
      }),
    }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  assert.deepEqual(calls, ['api/kb-context/settings'])
  const tree = Section()
  assert.equal(tree.props['data-dsh-plugin'], 'kb-context')
  assert.ok(find(tree, (n) => n.type === 'button') !== null, '可写面有保存按钮')
  const all = JSON.stringify(tree.children)
  assert.match(all, /触发词面/, 'triggers.words 可改面在')
  assert.match(all, /热图/, 'hotMap 只读展示在')
})

test('设置面组件：保存=POST {patch:变更叶子}（triggers.words 数组整替），成功 notice 如实', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (init && init.method === 'POST') {
      return { json: async () => ({ data: { ok: true, config: { triggers: { words: ['OA', '用友'] } } } }) }
    }
    return { json: async () => ({ data: { config: { triggers: { words: ['OA'] } }, writable: true, editable: [['triggers', 'words']] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const rowElems = tree.children.find((c) => Array.isArray(c)) ?? []
  const row = rowElems.find((c) => c && c.props && c.props.field && c.props.field.path.join('.') === 'triggers.words')
  row.props.onChange(['OA', '用友'])
  tree = Section()
  find(tree, (n) => n.type === 'button').props.onClick()
  await tick()
  await tick()
  const post = calls.find((c) => c.init && c.init.method === 'POST')
  assert.ok(post)
  assert.equal(post.url, 'api/kb-context/settings')
  assert.deepEqual(JSON.parse(post.init.body), { patch: { triggers: { words: ['OA', '用友'] } } }, '数组整替（一行一项）')
  tree = Section()
  assert.ok(find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('ok')), '成功 notice 如实')
})

test('设置面组件：服务端拒绝（not_editable）= 判据原文展示，绝不静默；载入失败=容器内如实报错', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  mod.__fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      return { json: async () => ({ error: { code: 'not_editable', message: '字段 hotMap.enabled 不在可改白名单' } }) }
    }
    return { json: async () => ({ data: { config: {}, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const rowElems = tree.children.find((c) => Array.isArray(c)) ?? []
  rowElems.find((c) => c && c.props && c.props.field).props.onChange(false)
  tree = Section()
  find(tree, (n) => n.type === 'button').props.onClick()
  await tick()
  await tick()
  tree = Section()
  const err = find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('error'))
  assert.ok(err)
  assert.match(JSON.stringify(err.children), /不在可改白名单/)

  // 载入失败面（另一组件实例：重置 hook 槽需重新加载工厂）
  const face2 = loadClientFace()
  const reg2 = []
  face2.mod.apply(mkCtx(reg2, []))
  face2.mod.__fetch = async () => { throw new Error('fetch failed') }
  reg2[0].component()
  face2.effects[0]()
  await tick()
  await tick()
  const tree2 = reg2[0].component()
  const err2 = find(tree2, (n) => typeof n.props?.className === 'string' && n.props.className.includes('error'))
  assert.ok(err2, '载入失败必须如实可见')
  assert.match(JSON.stringify(err2.children), /fetch failed|载入失败/)
})

// ===== T9-F1 填写引导/文案/样式契约（Phase 8 修复波：UI 对齐 dsh + 填写示例 + 功能说明）=====
// 参照：changes/2026-09-29-kb-context-settings-ux/reports/ui-ux-brief.md §3（文案定稿）/§4（UI 改造）/§5（A1-A9）。
// 口径锚（源码真源）：触发=会话消息命中→检索→注入（仅用户消息，trigger.js）；实体路径=路径字面/[[wikilink]]/@ 引用
// 三形态提及、与词面并集；预算=注入占会话 token、双上限、超出截断首条必保（search.js）；hotMap=预留仅展示。

const READY_CONFIG = {
  triggers: { words: ['OA'], entityPaths: ['INDEX.md'] },
  budget: { maxSnippets: 3, maxTokens: 2000 },
  timeoutMs: 1500,
  scope: { indexAll: ['wiki', 'raw'], grepOnDemand: ['01-客户资料'] },
  hotMap: { enabled: false, maxChars: 600 },
  vaultRoot: '/mnt/unraid_data/Obsidian',
  triggerLog: { enabled: true, capacity: 200 },
}

async function renderReady() {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  mod.__fetch = async () => ({ json: async () => ({ data: { config: READY_CONFIG, editable: [], writable: true } }) })
  Section()
  effects[0]()
  await tick()
  await tick()
  return Section()
}

function rowOf(tree, dotted) {
  const rows = tree.children.find((c) => Array.isArray(c)) ?? []
  return rows.find((c) => c && c.props && c.props.field && c.props.field.path.join('.') === dotted)
}

function renderRow(tree, dotted) {
  const el = rowOf(tree, dotted)
  assert.ok(el, `行在：${dotted}`)
  return el.type(el.props)
}

function hintOf(rowTree) {
  return find(rowTree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('kb-context-settings-hint'))
}

function hintText(rowTree) {
  const h = hintOf(rowTree)
  return h ? JSON.stringify(h.children) : ''
}

test('填写引导：触发词面/索引实体路径 = textarea placeholder 参考示例 + hint 功能说明（含并集/仅用户消息口径）', async () => {
  const tree = await renderReady()
  // 触发词面：示例=单词/短语形；hint=功能作用 + 仅用户消息口径
  const wordsRow = renderRow(tree, 'triggers.words')
  const wordsTa = find(wordsRow, (n) => n.type === 'textarea')
  assert.ok(wordsTa, '触发词面是 textarea')
  const wordsLines = String(wordsTa.props.placeholder ?? '').split('\n').filter(Boolean)
  assert.ok(wordsLines.length >= 2, 'placeholder 给参考填写示例（多行灰显示）')
  for (const line of wordsLines) {
    assert.ok(!line.includes('/'), `词面示例=单词/短语形（不含路径斜杠）：${line}`)
    assert.ok(!line.includes('\n'), '一行一项')
  }
  assert.match(hintText(wordsRow), /用户消息/, '口径：仅用户消息触发（INV-3）')
  assert.match(hintText(wordsRow), /检索/, 'hint 说明功能作用：触发 vault 检索')
  // 索引实体路径：示例=相对 vault 根路径/文件名形；hint=三形态提及 + 与词面并集
  const entityRow = renderRow(tree, 'triggers.entityPaths')
  const entityTa = find(entityRow, (n) => n.type === 'textarea')
  assert.ok(entityTa, '索引实体路径是 textarea')
  const entityLines = String(entityTa.props.placeholder ?? '').split('\n').filter(Boolean)
  assert.ok(entityLines.length >= 2, 'placeholder 给参考填写示例（多行灰显示）')
  for (const line of entityLines) {
    assert.ok(!line.startsWith('/'), `实体示例=相对 vault 根（无前导斜杠）：${line}`)
    assert.match(line, /^[\w\u4e00-\u9fa5.\-\/]+$/, `实体示例形合法（路径/文件名）：${line}`)
  }
  assert.match(hintText(entityRow), /wikilink/, '口径：[[wikilink]] 形态提及即触发')
  assert.match(hintText(entityRow), /并集/, '口径：与触发词面并集，任一命中即触发')
})

test('说明文案：注入预算含"为什么需要注入 token 预算"口径；timeoutMs/作用域两项带简短说明', async () => {
  const tree = await renderReady()
  const maxTokensHint = hintText(renderRow(tree, 'budget.maxTokens'))
  assert.match(maxTokensHint, /token/i, 'token 上限口径')
  assert.match(maxTokensHint, /上下文/, '为什么：注入占用会话上下文 token')
  assert.match(maxTokensHint, /首条必保/, '超出截断、首条必保（search.js 真源）')
  assert.match(maxTokensHint, /粗略|估算/, '不承诺精确 token：粗口径估算')
  const maxSnippetsHint = hintText(renderRow(tree, 'budget.maxSnippets'))
  assert.match(maxSnippetsHint, /片段/, '片段数作用说明')
  const timeoutHint = hintText(renderRow(tree, 'timeoutMs'))
  assert.match(timeoutHint, /超时/, '超时作用说明')
  assert.match(timeoutHint, /fail-open|照常/, '口径：超时 fail-open、对话照常继续')
  const indexAllHint = hintText(renderRow(tree, 'scope.indexAll'))
  assert.match(indexAllHint, /索引/, 'indexAll=FTS 主命中面')
  const grepHint = hintText(renderRow(tree, 'scope.grepOnDemand'))
  assert.match(grepHint, /wiki_read/, 'grepOnDemand=零命中提示 wiki_read 直读')
})

test('只读说明不夸大：hotMap=预留配置仅展示（不承诺行为）；vaultRoot=直读根路径', async () => {
  const tree = await renderReady()
  for (const dotted of ['hotMap.enabled', 'hotMap.maxChars']) {
    const t = hintText(renderRow(tree, dotted))
    assert.match(t, /预留/, 'hotMap=预留配置')
    assert.match(t, /仅展示/, 'hotMap=当前版本仅展示')
    assert.doesNotMatch(t, /会注入|自动注入|自动摘要|将会/, '不夸大：不承诺热图行为（T9-R1 审查点）')
  }
  assert.match(hintText(renderRow(tree, 'vaultRoot')), /直读|根路径/, 'vaultRoot=wiki_read 直读根路径')
})

test('样式面：dsh token 别名为唯一色板（零硬编码色值/零暗色分支）+ document 守卫幂等注入', () => {
  assert.match(source, /typeof document\s*!==\s*['"]undefined['"]/, 'style 注入必须守卫 document（R4：Node 无 document 执行工厂不炸）')
  assert.match(source, /var\(--dsw-alias-/, '色板一律引 --dsw-alias-* 宿主别名（暗色随宿主别名重定义自动适配）')
  assert.match(source, /var\(--dsw-radius-/, '圆角引 --dsw-radius-* token')
  const cssMatch = source.match(/var SETTINGS_CSS = \[([\s\S]*?)\]\.join/)
  assert.ok(cssMatch, '样式集中在 SETTINGS_CSS（单文件自包含，零构建可注入）')
  const css = cssMatch[1]
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, '禁硬编码色值（hex）')
  assert.doesNotMatch(css, /rgba?\(/i, '禁硬编码色值（rgb/rgba）')
  assert.doesNotMatch(css, /hsla?\(/i, '禁硬编码色值（hsl/hsla）')
  assert.doesNotMatch(source, /prefers-color-scheme|data-ds-dark-theme/, '暗色不写 media query/分支代码')
  assert.match(source, /data-plugin-css/, 'style 幂等标记')
  assert.match(css, /border-top:[^;]*var\(--dsw-alias-border-l2/, '字段间细分隔=border-l2（宿主 .field 形）')
})

test('行排布=宿主 .field 形：label→控件→hint 纵向（label 关联控件）；首个 button 仍是保存按钮', async () => {
  const tree = await renderReady()
  const row = renderRow(tree, 'triggers.words')
  assert.equal(row.type, 'div')
  assert.match(String(row.props.className), /kb-context-settings-row/)
  const labelEl = row.children[0]
  const controlEl = row.children[1]
  assert.equal(labelEl.type, 'label')
  assert.match(String(labelEl.props.className), /kb-context-settings-label/)
  assert.ok(controlEl, 'label 后是控件')
  assert.equal(labelEl.props.htmlFor, controlEl.props.id, 'label 与控件 id 关联（无障碍）')
  const hintEl = hintOf(row)
  assert.ok(hintEl, '控件下有 hint（功能说明位）')
  assert.ok(JSON.stringify(hintEl.children).length > 4, 'hint 非空')
  const btn = find(tree, (n) => n.type === 'button')
  assert.ok(btn, '可写面有保存按钮')
  assert.match(String(btn.props.className), /save/)
  assert.equal(JSON.stringify(btn.children), '["保存"]', '首个 button=保存（不新增前置 button，R2）')
})

// ===== 0.4.0 触发日志设置面（A-TL5 kill switch / A-TL6 弹层；PRODUCT US-2/3/5）=====
// 形制源：wiki-steward/lib/client.js:424-476 历史记录入口+原生 Modal（title/closeLabel/onClose 契约）。
// 状态由设置节持有（展示组件无钩子，wiki-steward 同纪律）；数据面=api/kb-context/logs 双端点（文档相对）。

const logEntry = (i) => ({
  ts: 1727000000000 + i * 1000, hit: i % 2 === 0, channel: i % 2 === 0 ? 'words' : 'none',
  matched: i % 2 === 0 ? ['OA'] : [], snippets: i, tokenEst: i * 10, elapsedMs: i,
  reason: i % 2 === 0 ? 'hit' : 'no-trigger-match',
})

/** 渲染「触发日志」入口块（组件元素在 footer 内、保存按钮之后——R2「不前置 button」保持） */
function renderLogEntry(tree) {
  const footer = tree.children.find((c) => c && typeof c.type === 'string' && String(c.props?.className ?? '').includes('kb-context-settings-footer'))
  assert.ok(footer, 'footer 在')
  const entryEl = footer.children.find((c) => c && typeof c.type === 'function')
  assert.ok(entryEl, '设置节含触发日志入口组件')
  return entryEl.type(entryEl.props)
}

/** 从入口树取弹层组件元素（开态） */
function modalOf(entryTree) {
  return entryTree.children.find((c) => c && typeof c.type === 'function')
}

/** 渲染弹层并取日志体组件元素（自绘形嵌套在 panel 内，ui.Modal 形为直接子） */
function renderLogBody(Section) {
  const modalEl = modalOf(renderLogEntry(Section()))
  assert.ok(modalEl, '开态有弹层组件')
  const modalTree = modalEl.type(modalEl.props)
  const bodyEl = logBodyOf(modalTree)
  assert.ok(bodyEl, '弹层含日志体组件')
  return { modalEl, modalTree, bodyEl }
}

/** 递归取弹层树内第一个组件元素（=日志体；自绘形嵌套在 panel 内，ui.Modal 形为直接子） */
function logBodyOf(node) {
  if (node === null || node === undefined) return null
  if (Array.isArray(node)) {
    for (const c of node) { const hit = logBodyOf(c); if (hit) return hit }
    return null
  }
  if (typeof node !== 'object') return null
  if (typeof node.type === 'function') return node
  return logBodyOf(node.children ?? [])
}

async function renderLogOpen(mod, effects, Section, entries, extra = {}) {
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (url === 'api/kb-context/logs') {
      return { json: async () => ({ entries, capacity: extra.capacity ?? 200, enabled: extra.enabled ?? true }) }
    }
    return { json: async () => ({ data: { config: READY_CONFIG, editable: [], writable: true } }) }
  }
  Section(); effects[0](); await tick(); await tick()
  let tree = Section()
  const btn = find(renderLogEntry(tree), (n) => n.type === 'button' && JSON.stringify(n.children).includes('查看触发日志'))
  assert.ok(btn, '设置节有「查看触发日志」按钮')
  btn.props.onClick()
  await tick(); await tick()
  tree = Section()
  return { tree, calls }
}

test('kill switch（A-TL5）：triggerLog.enabled 布尔行在「触发日志」组；hint 如实（内存环/重启清空/引 TECH 真源，不夸大）', async () => {
  const tree = await renderReady()
  assert.match(JSON.stringify(tree.children), /触发日志/, '「触发日志」分组在')
  const row = renderRow(tree, 'triggerLog.enabled')
  const input = find(row, (n) => n.type === 'input' && n.props.type === 'checkbox')
  assert.ok(input, 'kill switch=checkbox（boolean 形）')
  assert.equal(input.props.checked, true, '当前值来自 config.triggerLog.enabled')
  const t = hintText(row)
  assert.match(t, /内存|环/, '如实：仅存内存环')
  assert.match(t, /重启/, '如实：重启清空')
  assert.match(t, /清空/, '如实：重启/清空口径')
  assert.match(t, /TECH\.md/, '日志说明引 TECH 真源（INV-TL4）')
  assert.doesNotMatch(t, /永不丢失|重启后(仍|保留|恢复)|持久化保存/, '不夸大：绝不暗示持久化')
})

test('「查看触发日志」按钮→弹层（A-TL6）：GET api/kb-context/logs 载入（文档相对）；条数 N/200；开合沿历史记录形', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const { tree, calls } = await renderLogOpen(mod, effects, Section, [logEntry(1), logEntry(2)])
  assert.deepEqual(calls.map((c) => c.url), ['api/kb-context/settings', 'api/kb-context/logs'], '文档相对请求（issue #1707 教训）')
  const entryTree = renderLogEntry(tree)
  const btn = find(entryTree, (n) => n.type === 'button')
  assert.match(JSON.stringify(btn.children), /收起触发日志/, '开合文案沿 wiki-steward 历史记录形')
  assert.equal(btn.props['aria-expanded'], 'true')
  const modalEl = modalOf(entryTree)
  assert.ok(modalEl, '开态渲染弹层')
  const modalTree = modalEl.type(modalEl.props)
  assert.match(JSON.stringify(modalTree), /kb-context · 触发日志/, 'title 形制')
  assert.match(JSON.stringify(modalTree), /关闭/, 'closeLabel 契约')
  const bodyTree = renderLogBody(Section).bodyEl.type(renderLogBody(Section).bodyEl.props)
  assert.match(JSON.stringify(bodyTree), /条数 2\/200/, '条数 N/200（US-2）')
  const list = find(bodyTree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('kb-context-log-list'))
  assert.ok(list, '日志列表容器在')
  assert.equal(list.children.length, 2)
  assert.match(JSON.stringify(list.children[0]), /命中/, '条目含判定摘要')
})

test('弹层尾部 50 行 + 滚动加载（A-TL6）：初始 50、到底追加、未到底不追加', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const entries = []
  for (let i = 0; i < 70; i++) entries.push(logEntry(i))
  await renderLogOpen(mod, effects, Section, entries)
  const bodyList = () => {
    const bodyEl = renderLogBody(Section).bodyEl
    const bodyTree = bodyEl.type(bodyEl.props)
    return find(bodyTree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('kb-context-log-list'))
  }
  let list = bodyList()
  assert.equal(list.children.length, 50, '尾部 50 行初始')
  list.props.onScroll({ target: { scrollHeight: 2000, scrollTop: 0, clientHeight: 100 } }) // 未到底（差 1900）
  list = bodyList()
  assert.equal(list.children.length, 50, '未到底不加载')
  list.props.onScroll({ target: { scrollHeight: 2000, scrollTop: 1900, clientHeight: 95 } }) // 差 5 < 阈值
  list = bodyList()
  assert.equal(list.children.length, 70, '滚动到底加载余量（70 条全显）')
  list.props.onScroll({ target: { scrollHeight: 2000, scrollTop: 1900, clientHeight: 95 } })
  list = bodyList()
  assert.equal(list.children.length, 70, '到底后不无限追加')
})

test('清空按钮（US-2）：POST api/kb-context/logs/clear → {cleared:n} 如实 notice + 清后 0 行', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (url === 'api/kb-context/logs') return { json: async () => ({ entries: [logEntry(1), logEntry(2), logEntry(3)], capacity: 200, enabled: true }) }
    if (url === 'api/kb-context/logs/clear') return { json: async () => ({ cleared: 3 }) }
    return { json: async () => ({ data: { config: READY_CONFIG, editable: [], writable: true } }) }
  }
  Section(); effects[0](); await tick(); await tick()
  let tree = Section()
  find(renderLogEntry(tree), (n) => n.type === 'button' && JSON.stringify(n.children).includes('查看触发日志')).props.onClick()
  await tick(); await tick()
  const bodyEl = () => renderLogBody(Section).bodyEl
  let bodyTree = bodyEl().type(bodyEl().props)
  const clearBtn = find(bodyTree, (n) => n.type === 'button' && JSON.stringify(n.children).includes('清空日志'))
  assert.ok(clearBtn, '清空按钮在')
  clearBtn.props.onClick()
  await tick(); await tick()
  const post = calls.find((c) => c.init && c.init.method === 'POST')
  assert.ok(post, 'POST logs/clear 发出')
  assert.equal(post.url, 'api/kb-context/logs/clear')
  bodyTree = bodyEl().type(bodyEl().props)
  assert.match(JSON.stringify(bodyTree), /已清空 3 条/, 'notice 如实（cleared:n）')
  const list = find(bodyTree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('kb-context-log-list'))
  assert.equal(list.children.length, 0, '清后 0 行')
  assert.match(JSON.stringify(bodyTree), /条数 0\/200/, '条数归零')
})

test('弹层形沿 wiki-steward 历史记录（INV-TL5）：宿主 ui.Modal 在场=原生 Modal（title/closeLabel/onClose）；缺席=同契约自绘', async () => {
  // 路径 1：宿主 primitives 在场 → 原生 Modal（wiki-steward lib/client.js:443 同形）
  function ModalStub() {}
  const face1 = loadClientFace({ Modal: ModalStub })
  const reg1 = []
  face1.mod.apply(mkCtx(reg1, []))
  const S1 = reg1[0].component
  await renderLogOpen(face1.mod, face1.effects, S1, [logEntry(1)])
  const entryTree1 = renderLogEntry(S1())
  const modalEl = modalOf(entryTree1)
  const modalTree1 = modalEl.type(modalEl.props)
  assert.equal(modalTree1.type, ModalStub, 'ui.Modal 在场=原生 Modal（渲染产物根=宿主控件）')
  assert.equal(modalTree1.props.open, true)
  assert.equal(modalTree1.props.title, 'kb-context · 触发日志')
  assert.equal(modalTree1.props.closeLabel, '关闭')
  assert.equal(typeof modalTree1.props.onClose, 'function', 'onClose 收口（遮罩/Escape 归宿主控件）')

  // 路径 2：primitives 缺席（本包未注入 require 表）→ 同契约自绘（role=dialog + 遮罩 + Escape）
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  await renderLogOpen(mod, effects, Section, [logEntry(1)])
  const entryTree = renderLogEntry(Section())
  const modalEl2 = modalOf(entryTree)
  assert.equal(typeof modalEl2.props.onClose, 'function', 'onClose 契约同 ui.Modal')
  let closed = 0
  const modalTree = modalEl2.type({ ...modalEl2.props, onClose: () => { closed += 1 } })
  const dialog = find(modalTree, (n) => n.props?.role === 'dialog')
  assert.ok(dialog, '自绘弹层=role dialog（无障碍）')
  assert.equal(dialog.props['aria-modal'], 'true')
  const backdrop = find(modalTree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('kb-context-log-backdrop'))
  assert.ok(backdrop, '遮罩在')
  backdrop.props.onClick()
  assert.equal(closed, 1, '遮罩点击→onClose 收口')
  const esc = find(modalTree, (n) => typeof n.props?.onKeyDown === 'function')
  assert.ok(esc, 'Escape 收口在')
  esc.props.onKeyDown({ key: 'Escape' })
  assert.equal(closed, 2, 'Escape→onClose 收口')
})

test('样式零新增 token 机械锁（INV-TL5）：SETTINGS_CSS 变量名⊆0.3.2 既有集；零硬编码色值；零新增自定义属性定义', () => {
  const cssMatch = source.match(/var SETTINGS_CSS = \[([\s\S]*?)\]\.join/)
  assert.ok(cssMatch)
  const css = cssMatch[1]
  const vars = [...css.matchAll(/var\((--[A-Za-z0-9-]+)/g)].map((m) => m[1])
  assert.ok(vars.length > 0)
  const ALLOWED = new Set([
    '--dsw-font-family', '--ds-font-family-code',
    '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-label-dimmed',
    '--dsw-alias-border-l2', '--dsw-alias-border-l4', '--dsw-alias-bg-layer-3',
    '--dsw-alias-state-business-primary', '--dsw-alias-state-success-primary', '--dsw-alias-state-error-primary',
    '--dsw-radius-md', '--dsw-focus-ring-width', '--dsw-focus-ring-color',
  ])
  for (const v of new Set(vars)) assert.ok(ALLOWED.has(v), `零新增 token（复用 0.3.2 既有集）：${v}`)
  assert.doesNotMatch(css, /--[A-Za-z0-9-]+\s*:/, '不定义新自定义属性（零新增 token）')
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, '禁硬编码色值（hex）')
  assert.doesNotMatch(css, /rgba?\(/i, '禁硬编码色值（rgb/rgba）')
  assert.doesNotMatch(css, /hsla?\(/i, '禁硬编码色值（hsl/hsla）')
  assert.doesNotMatch(source, /prefers-color-scheme|data-ds-dark-theme/, '暗色不写分支')
})

test('弹层文案不夸大（INV-TL4）+ 零新增外部网络请求（INV-TL5）：fetch 目标全为 api/kb-context/*', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  const { tree } = await renderLogOpen(mod, effects, Section, [logEntry(1)], { enabled: false })
  void tree
  mod.__fetch = async (url, init) => { calls.push(url); return { json: async () => ({ entries: [], capacity: 200, enabled: false }) } }
  const bodyEl = renderLogBody(Section).bodyEl
  const bodyTree = bodyEl.type(bodyEl.props)
  const text = JSON.stringify(bodyTree)
  assert.match(text, /重启/, '如实：重启清空')
  assert.match(text, /清空/, '如实：清空口径')
  assert.match(text, /TECH\.md/, '引 TECH 真源')
  assert.doesNotMatch(text, /永不丢失|重启后(仍|保留|恢复)|持久化保存/, '不夸大')
  assert.match(text, /已关闭/, 'kill switch 热关态在弹层如实可见')
  assert.doesNotMatch(source, /fetch\s*\(\s*['"`]https?:/, '零外部网络请求（fetch 全文档相对）')
  assert.doesNotMatch(source, /@deepseek-ai\/dsh-client-ui-primitives[^\n]*from|import\s+[^\n]*dsh-client-ui-primitives/, '零相对/静态 import（单文件自包含）')
  for (const c of calls) assert.ok(String(c).startsWith('api/kb-context/'), `文档相对：${c}`)
})
