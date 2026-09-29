// lib/client.ui.js — dsh-github-ops 客户端 UI 兄弟 chunk（最小桩，Ruling-4）。
// 注册形：window.__ModuleLoader__.load({id:'dsh-github-ops', chunk:'client.ui.js', factory})——
// chunk 名过宿主 CLIENT_CHUNK 白名单（/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/），
// 由 lib/client.js 经 require.async('./client.ui.js') 惰性取用（挂载生命周期归壳）。
// render* 接口面（Task 14 填真 UI：双栏六节卡片 + 交互状态，DESIGN.md token 逐字；组件 ≤300 行）：
//   renderSettingsSection(props) —— 设置面整体（props = { api, ownerProps }，api.fetch 文档相对 api/github-ops/…）
//   renderSummary(props)         —— bundle 页一行摘要（ownerProps.view==='summary'；无摘要可回 null）
// 本桩只交占位渲染 + 接口面，保证 T13→T14 之间 client.js+桩同在场可 boot（Ruling-4 理由）。
// 红线：零硬编码色值（唯一色板来源 = --dsw-* 变量，Task 14 核验）；root/sidebar/rightbar 槽不在本文件出现（P-7）。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  chunk: 'client.ui.js',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    /** 设置面占位渲染（Task 14 替换为 DESIGN.md 双栏六节卡片） */
    exports.renderSettingsSection = function renderSettingsSection(props) {
      return react.createElement('div', { 'data-dsh-plugin': 'dsh-github-ops', 'data-dsh-ui': 'stub' }, 'GitHub 集成（设置面构建中）')
    }

    /** bundle 页一行摘要：暂无摘要（Task 14 可填） */
    exports.renderSummary = function renderSummary(props) {
      return null
    }

    return module.exports
  },
})
