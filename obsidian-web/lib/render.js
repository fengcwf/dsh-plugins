// render — live 渲染管线对接（占位，T2 在此实现）
// 唯一渲染源（OW-INV-1 + 历史红线：禁第二 HTML 实现、禁 regex 自研渲染）：
//   unified/remark/rehype 管线 + Obsidian flavor（wikilink/embed/callout/highlight），
//   主 UI 预览与分享页（T9）共用同一管线；Excalidraw 嵌入显示为链接卡（不渲染画布）。
export {}
