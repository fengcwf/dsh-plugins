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

function loadClientFace() {
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
