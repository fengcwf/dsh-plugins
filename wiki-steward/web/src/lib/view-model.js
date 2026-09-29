// view-model — panel.js 挂载视图选择纯函数（框架无关，Task F1 面板搬家）。
// 历史入口 view='log' → 只挂日志视图（不暴露手动 ingest 动作——F3 领地）；
// 缺省/未知 → 全量面板（mount(el, {apiBase}) 既有契约向后兼容）。
export function resolveView(view) {
  return view === 'log' ? 'log' : 'full'
}
