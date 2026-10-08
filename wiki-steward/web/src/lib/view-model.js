// view-model — panel.js 挂载视图选择纯函数（框架无关，Task F1 面板搬家）。
// 历史入口 view='log' → 只挂日志视图（不暴露手动 ingest 动作——F3 领地）；
// 设置节 Hindsight 缝 view='hindsight' → 只挂 Hindsight 同步面板（六控件，
// t14 六控件可达性收口——不重复渲染触发/日志/配置三节，避免与设置节自身内容重叠）；
// 缺省/未知 → 全量面板（mount(el, {apiBase}) 既有契约向后兼容）。
export function resolveView(view) {
  if (view === 'log') return 'log'
  if (view === 'hindsight') return 'hindsight'
  return 'full'
}
