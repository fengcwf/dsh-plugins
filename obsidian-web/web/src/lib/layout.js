// layout — 构图常量与响应式退化计划（T13 / TECH §3.10 构图定稿 + §3.9.4 响应式）
// 单源：三栏常量在此（styles.css :root 的 --ow-* 逐值同——test/web-composition.test.mjs 双向锁）；
// 布局局部变量 --ow-* 属 ARC-5 豁免面（spec 2026-09-26 裁定：色板/字体 token 才归 --dsw-*）。
export const LAYOUT = Object.freeze({
  menuWidth: 72, // 菜单轨（OW-US-14 侧栏）
  treeWidth: 300, // 目录树列（TECH §3.10.1）
  tocWidth: 248, // TOC 列（TECH §3.10.1）
})

export const BREAKPOINTS = Object.freeze({
  narrowMaxWidth: 960, // ≤960px=窄屏（styles.css @media (max-width: 960px) 同值）
})

/** 视口宽 → 布局模式（断点本身归窄屏：CSS max-width 含端点） */
export function layoutMode(viewportWidth) {
  const w = Number(viewportWidth)
  if (!Number.isFinite(w)) return 'wide'
  return w <= BREAKPOINTS.narrowMaxWidth ? 'narrow' : 'wide'
}

/** 逐区块响应式退化计划（TECH §3.9.4/§3.10.3：显式声明，CSS 落地同款）：
 *  树→抽屉、TOC→抽屉、分屏→单栏、工具栏→compact */
export function responsivePlan(mode) {
  if (mode === 'narrow') {
    return { tree: 'drawer', toc: 'drawer', editor: 'single-column', toolbar: 'compact' }
  }
  return { tree: 'column', toc: 'column', editor: 'split', toolbar: 'full' }
}
