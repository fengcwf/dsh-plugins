// context-menu — 树/大纲行右键菜单纯逻辑（C2 卡）：菜单项集、键盘导航、定位与视口翻转。
// 组件零逻辑（ARC-6）：TreeContextMenu.vue 只做展示，状态转移全在本模块纯函数（node --test 可单测）。
// 边界：本模块不碰业务、不发请求、不读 DOM——尺寸/视口由调用方传入（浏览器=元素实测+window，
// 测试=字面量），故「翻转/夹紧/键盘环」全部可离线验证（UI 逻辑不靠截图证明）。
// 上抛缝（沿用 NoteTree 既有「只上抛」模式）：本模块不 emit、不改数据，只回答「下一个焦点下标」
// 与「菜单左上角坐标」两个纯问题。

/** 菜单项（顺序=渲染顺序；kind='file'|'dir' 决定是否对当前节点出现） */
export const CONTEXT_MENU_ITEMS = [
  {
    action: 'rename',
    label: '改名/移动',
    hint: '改名/移动（多文件事务：零断链 wikilink 同步）',
    kind: 'file', // 服务端 renameNote 语义：目录/symlink=not-a-file 拒——入口与契约同界，不出无效入口
  },
  {
    action: 'download',
    label: '下载',
    hint: '下载（单文件=原文件；目录=zip 打包）',
    kind: 'any',
  },
  {
    action: 'delete',
    label: '删除',
    hint: '删除（可逆：移入回收站）',
    kind: 'any',
  },
  {
    action: 'share',
    label: '分享',
    hint: '分享（生成带 token 的访问链接；文件与目录都可分享）',
    kind: 'any', // C2 定稿：分享项对文件与目录都启用（后端 target 本就是任意 vault 内相对路径）
  },
]

/** 视口翻转安全边距（菜单与视口边缘的最小留白 px） */
export const MENU_MARGIN = 8

/** 节点类型 → 菜单项集（file=四项全；dir=改名不出（契约同界）） */
export function menuItemsFor(kind) {
  const k = kind === 'dir' ? 'dir' : 'file'
  return CONTEXT_MENU_ITEMS.filter((it) => it.kind === 'any' || it.kind === k)
}

/**
 * 键盘导航：方向键（含首尾环绕）/ Home / End → 下一个焦点下标。
 * 跳过 disabled 项（当前形态由 menuItemsFor 过滤无禁用项，此分支为后续形态留的通用面）；
 * 未知键原样返回当前下标；空项集返回 -1（无处可聚焦）。
 */
export function nextFocusIndex(items, current, key) {
  const list = Array.isArray(items) ? items : []
  const n = list.length
  if (n === 0) return -1
  const from = Number.isInteger(current) ? current : -1
  if (key === 'Home') return firstEnabled(list, 0, 1)
  if (key === 'End') return firstEnabled(list, n - 1, -1)
  const delta = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  if (delta === 0) return from
  const start = from >= 0 && from < n ? from : delta > 0 ? -1 : n
  let idx = start
  for (let step = 0; step < n; step += 1) {
    idx = (idx + delta + n) % n
    if (list[idx]?.disabled !== true) return idx
  }
  return from >= 0 && from < n ? from : 0
}

function firstEnabled(list, start, delta) {
  let idx = start
  for (let step = 0; step < list.length; step += 1) {
    if (list[idx]?.disabled !== true) return idx
    idx = (idx + delta + list.length) % list.length
  }
  return -1
}

/**
 * 菜单定位（视口坐标）：指针处优先；右/下溢出则翻到指针左/上侧；翻转后仍放不下则夹紧进视口
 * （以 MENU_MARGIN 留白），**菜单永不越出视口**。
 * viewport 为 0（SSR/无 DOM 环境）时不做翻转与夹紧（返回指针原坐标）。
 * @returns {{left:number, top:number, flippedX:boolean, flippedY:boolean}}
 */
export function placeMenu({
  x, y, width, height, viewportWidth, viewportHeight, margin = MENU_MARGIN,
}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const vw = num(viewportWidth)
  const vh = num(viewportHeight)
  const m = num(margin)
  const w = Math.max(0, num(width))
  const h = Math.max(0, num(height))
  const px = num(x)
  const py = num(y)

  let left = px
  let flippedX = false
  if (vw > 0 && px + w + m > vw) {
    const flipped = px - w
    if (flipped >= m) {
      left = flipped
      flippedX = true
    } else {
      left = Math.max(m, vw - w - m) // 放不下（菜单比视口还宽）：夹紧贴右缘留白
    }
  }

  let top = py
  let flippedY = false
  if (vh > 0 && py + h + m > vh) {
    const flipped = py - h
    if (flipped >= m) {
      top = flipped
      flippedY = true
    } else {
      top = Math.max(m, vh - h - m) // 同上：夹紧贴下缘留白
    }
  }

  return { left, top, flippedX, flippedY }
}
