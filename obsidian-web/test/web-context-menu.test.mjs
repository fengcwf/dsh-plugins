// 右键菜单纯逻辑单测（C2 卡 2026-10-09）：web/src/lib/context-menu.js——项集/键盘环/定位翻转。
// 组件容器/展示分离：TreeContextMenu.vue 只做展示与 DOM 可达性，决策全在纯函数（与 web-lib 同纪律）。
// 纪律：既有测试零弱化（本文件全新增，零改动既有断言）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CONTEXT_MENU_ITEMS, MENU_MARGIN, menuItemsFor, nextFocusIndex, placeMenu } from '../web/src/lib/context-menu.js'

const VUE_FILE = fileURLToPath(new URL('../web/src/components/TreeContextMenu.vue', import.meta.url))
const TREE_FILE = fileURLToPath(new URL('../web/src/components/NoteTree.vue', import.meta.url))

// ── ① 菜单项集：四项 + 分享对文件与目录都启用（C2 定稿「分享项对文件与目录都启用」）──
test('菜单项集：改名/下载/删除/分享四项；分享对 file 与 dir 都出现', () => {
  assert.deepEqual(CONTEXT_MENU_ITEMS.map((i) => i.action), ['rename', 'download', 'delete', 'share'])
  for (const item of CONTEXT_MENU_ITEMS) {
    assert.ok(item.label && item.hint, `${item.action} 缺 label/hint（键盘/悬浮可达性文案）`)
  }
  const file = menuItemsFor('file').map((i) => i.action)
  const dir = menuItemsFor('dir').map((i) => i.action)
  assert.deepEqual(file, ['rename', 'download', 'delete', 'share'], 'file=四项全（改名可用）')
  assert.deepEqual(dir, ['download', 'delete', 'share'], 'dir=无改名（服务端 renameNote 契约：目录=not-a-file 拒）')
  assert.ok(dir.includes('share'), '分享对目录启用（C2 定稿：后端 target 本就是任意 vault 内相对路径）')
})

test('menuItemsFor 非法 kind 归 file（不因脏数据少出项）', () => {
  for (const k of [undefined, null, '', 'symlink', 42]) {
    assert.deepEqual(menuItemsFor(k).map((i) => i.action), ['rename', 'download', 'delete', 'share'], `kind=${String(k)} 归 file`)
  }
})

// ── ② 键盘导航：方向键首尾环绕 + Home/End + 跳过 disabled ─────────────────────
test('下一代焦点：ArrowDown/ArrowUp 首尾环绕（零卡死、零越界）', () => {
  const items = menuItemsFor('file')
  assert.equal(nextFocusIndex(items, 0, 'ArrowUp'), 3, '首项上键→末项（环绕）')
  assert.equal(nextFocusIndex(items, 3, 'ArrowDown'), 0, '末项下键→首项（环绕）')
  assert.equal(nextFocusIndex(items, 1, 'ArrowDown'), 2)
  assert.equal(nextFocusIndex(items, 1, 'ArrowUp'), 0)
})

test('下一代焦点：Home→首项 / End→末项；未知键原地不动；空集与脏下标不炸', () => {
  const items = menuItemsFor('file')
  assert.equal(nextFocusIndex(items, 2, 'Home'), 0)
  assert.equal(nextFocusIndex(items, 1, 'End'), 3)
  assert.equal(nextFocusIndex(items, 2, 'a'), 2, '未知键=原地（不吞字符键）')
  assert.equal(nextFocusIndex(items, 2, 'Enter'), 2)
  assert.equal(nextFocusIndex([], 0, 'ArrowDown'), -1, '空项集=-1（无处可聚焦）')
  assert.equal(nextFocusIndex(items, 99, 'ArrowDown'), 0, '越界下标归位首项')
  assert.equal(nextFocusIndex(items, -5, 'ArrowUp'), 3, '负下标上键→末项')
  assert.equal(nextFocusIndex(undefined, 0, 'ArrowDown'), -1, '非法 items 不炸')
})

test('下一代焦点：disabled 项跳过（后续形态禁用项不接收焦点）', () => {
  const items = [
    { action: 'a', disabled: false },
    { action: 'b', disabled: true },
    { action: 'c', disabled: false },
  ]
  assert.equal(nextFocusIndex(items, 0, 'ArrowDown'), 2, '跳过禁用项')
  assert.equal(nextFocusIndex(items, 2, 'ArrowUp'), 0, '反向同样跳过')
  assert.equal(nextFocusIndex(items, 0, 'End'), 2, 'End 落在最后一个可用项')
  assert.equal(nextFocusIndex(items, 0, 'Home'), 0)
})

// ── ③ 定位与翻转：右/下溢出翻到指针另一侧；翻转不下则夹紧视口（菜单永不越界）──
test('定位：指针处优先（无溢出零翻转）', () => {
  const r = placeMenu({ x: 100, y: 100, width: 148, height: 120, viewportWidth: 1000, viewportHeight: 800 })
  assert.deepEqual(r, { left: 100, top: 100, flippedX: false, flippedY: false })
})

test('定位：右缘溢出→翻到指针左侧（flippedX）；下缘溢出→翻到上方（flippedY）', () => {
  const x = placeMenu({ x: 960, y: 100, width: 148, height: 120, viewportWidth: 1000, viewportHeight: 800 })
  assert.equal(x.left, 960 - 148, '左翻：left=x-width')
  assert.equal(x.flippedX, true)
  assert.ok(x.left + 148 + MENU_MARGIN <= 1000, '翻转后右缘留白达标')

  const y = placeMenu({ x: 100, y: 750, width: 148, height: 120, viewportWidth: 1000, viewportHeight: 800 })
  assert.equal(y.top, 750 - 120, '上翻：top=y-height')
  assert.equal(y.flippedY, true)
  assert.ok(y.top + 120 + MENU_MARGIN <= 800, '翻转后下缘留白达标')

  const both = placeMenu({ x: 990, y: 790, width: 148, height: 120, viewportWidth: 1000, viewportHeight: 800 })
  assert.equal(both.flippedX, true)
  assert.equal(both.flippedY, true)
})

test('定位：翻转也放不下→夹紧进视口（菜单永不越出视口，零裁切）', () => {
  // 指针贴右缘：翻转后 left=-88 越界 → 夹紧到右缘留白
  const r = placeMenu({ x: 60, y: 10, width: 148, height: 120, viewportWidth: 200, viewportHeight: 800 })
  assert.equal(r.left, 200 - 148 - MENU_MARGIN, '夹紧贴右缘留白')
  assert.equal(r.flippedX, false, '翻转不成立（会越界）故不标记翻转')
  assert.ok(r.left >= MENU_MARGIN, '左缘不越界')
  assert.ok(r.left + 148 <= 200 - MENU_MARGIN, '右缘不越界')
})

test('定位：菜单比视口还宽也不越界（左缘留白优先，右缘允许溢出但永不负值）', () => {
  const r = placeMenu({ x: 50, y: 50, width: 400, height: 300, viewportWidth: 320, viewportHeight: 400 })
  assert.equal(r.left, MENU_MARGIN, '超宽菜单贴左缘留白（Math.max 兜住负值）')
  assert.equal(r.top, 50, '高度放得下则不翻转')
  // 高度方向翻转仍成立（380-300=80 ≥ 8）→ 走翻转而非夹紧（翻转优先于夹紧）
  const y = placeMenu({ x: 50, y: 380, width: 400, height: 300, viewportWidth: 320, viewportHeight: 400 })
  assert.equal(y.top, 80, '翻转优先：top=y-height')
  assert.equal(y.flippedY, true)
  assert.ok(y.top >= MENU_MARGIN, '上缘不越界')
  assert.ok(y.top + 300 <= 400 - MENU_MARGIN, '下缘不越界')
  // 真正夹不下的场景：菜单比视口还高（翻转后 top 为负）→ 贴上缘留白
  const tall = placeMenu({ x: 50, y: 300, width: 100, height: 500, viewportWidth: 320, viewportHeight: 400 })
  assert.equal(tall.top, MENU_MARGIN, '超高菜单（翻转会越界）→ 夹紧贴上缘留白')
  assert.equal(tall.flippedY, false, '翻转不成立故不标记翻转')
})

test('定位：视口为 0（SSR/无 DOM）零翻转零夹紧；脏输入归 0 不 NaN', () => {
  const r = placeMenu({ x: 100, y: 100, width: 148, height: 120, viewportWidth: 0, viewportHeight: 0 })
  assert.deepEqual(r, { left: 100, top: 100, flippedX: false, flippedY: false }, '零视口=原坐标（无 DOM 不臆造翻转）')
  const dirty = placeMenu({ x: 'a', y: undefined, width: null, height: NaN, viewportWidth: 'x', viewportHeight: {} })
  for (const v of Object.values(dirty)) assert.ok(Number.isFinite(v) || typeof v === 'boolean', `脏输入产出有限值（${String(v)}）`)
  assert.equal(dirty.left, 0)
  assert.equal(dirty.top, 0)
})

// ── ④ 组件契约（展示层锁形）：.vue 只展示 + 可达性属性 + 退役核对 ────────────────
test('组件契约：TreeContextMenu 声明 role=menu/menuitem + 键盘处理器 + 焦点环，且零业务逻辑', () => {
  const raw = fs.readFileSync(VUE_FILE, 'utf8')
  assert.match(raw, /role="menu"/, '菜单根=role=menu')
  assert.match(raw, /role="menuitem"/, '菜单项=role=menuitem')
  assert.match(raw, /@keydown="onKeydown"/, '键盘处理器接线（方向键/Home/End/Enter/Escape）')
  assert.match(raw, /Escape/, 'Escape 关闭')
  assert.match(raw, /onDocMouseDown/, '点击外部关闭')
  // bugfix 2026-10-09（真浏览器实测必现缺陷）：Escape/Tab 必须收口在 **document 捕获层**——
  // 旧实现在 onDocKeyDown 里加「target 不在菜单内就不关」的守卫，遇上焦点未落到菜单项
  // （itemRefs 索引闭包陈旧，见下条）时 Escape 直接失效=菜单关不掉（二次打开必现）。
  assert.ok(
    /function onDocKeyDown[\s\S]*?e\.key !== 'Escape' && e\.key !== 'Tab'[\s\S]*?emit\('close'\)/.test(raw),
    'Escape/Tab 收口在 document 层（无「target 必须在菜单内」守卫——该守卫会让焦点漂出时关不掉）',
  )
  // 同上 bugfix：菜单项 DOM 必须实时查询（itemEls），禁用索引闭包型函数 ref——
  // 项集长度随 kind 变（file 四项 → dir 三项），卸载项以旧下标回调 null 会把 itemRefs[0] 清成 null，
  // 二次打开 focusIndex(0) 静默失效 → 焦点留树行 → Escape 失效链起点。
  assert.ok(!/:ref="\(el\)/.test(raw), '模板零索引闭包型函数 ref（项集长度变化时引用陈旧=焦点失效根因）')
  assert.match(raw, /querySelectorAll\?\.\('\[role="menuitem"\]'\)/, '菜单项=根元素内实时查询（顺序=渲染序）')
  assert.ok(!/:ref="\(el\)/.test(raw), '模板零函数 ref（同上根因）')
  assert.match(raw, /:focus\s*\{[^}]*outline:\s*2px/, '焦点环可见（程序化聚焦也看得见）')
  assert.match(raw, /lastFocused/, '关闭后焦点归位（键盘可达性闭环）')
  // 零业务逻辑：组件不得自己算坐标/项集/焦点，一律走纯函数
  for (const fn of ['menuItemsFor', 'nextFocusIndex', 'placeMenu']) {
    assert.ok(new RegExp(`import\\s*\\{[^}]*${fn}`).test(raw), `${fn} 自 lib/context-menu.js 引入（组件零计算）`)
  }
  assert.ok(!/fetch\(|api\.js/.test(raw), '组件零 I/O（业务全在 App 编排）')
})

test('组件契约：菜单项只上抛（零业务执行）+ 退役核对（树行零行内按钮）', () => {
  const raw = fs.readFileSync(VUE_FILE, 'utf8')
  assert.match(raw, /emit\('select'/, '菜单项=只上抛（业务在 App 编排）')
  const tree = fs.readFileSync(TREE_FILE, 'utf8')
  // C2 退役：行内三按钮（下载/改名/删除）整体退场
  for (const cls of ['ob-tree-dl', 'ob-tree-rename', 'ob-tree-del', 'ob-tree-row-actions']) {
    assert.ok(!tree.includes(cls), `NoteTree 残留行内按钮类 ${cls}（C2 应整体退役）`)
  }
  // 保留面：单击选中/双击打开 + 窄屏「目录」抽屉按钮
  assert.match(tree, /@node-click="onNodeClick"/, '保留单击选中')
  assert.match(tree, /class="ob-drawer-toggle"/, '保留窄屏「目录」抽屉按钮')
  assert.match(tree, /@node-contextmenu="onNodeContextMenu"/, '右键唤出接线')
  assert.match(tree, /<TreeContextMenu/, '菜单挂载')
  assert.match(tree, /emit\('share', node\)/, '分享独立上抛缝（C3 接线面；C2 只出缝）')
})

test('组件契约：ARC-6 单文件 ≤300 行 + 逻辑在 lib（.vue 零计算面）', () => {
  for (const f of [VUE_FILE, TREE_FILE]) {
    const lines = fs.readFileSync(f, 'utf8').split('\n').length
    assert.ok(lines <= 300, `${f} 超 300 行（ARC-6）：${lines}`)
  }
  const raw = fs.readFileSync(VUE_FILE, 'utf8')
  assert.ok(!/new\s+ResizeObserver|window\.innerWidth\s*\*/.test(raw.replace(/window\.innerWidth/g, 'window.innerWidth')), '组件零布局计算（定位=纯函数）')
})
