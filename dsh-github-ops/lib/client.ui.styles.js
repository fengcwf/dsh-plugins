// lib/client.ui.styles.js — dsh-github-ops UI 样式 chunk（client.ui.* 兄弟 chunk，F-scan-1 渲染族）。
// 色板唯一来源 = dsh --dsw-* token（@deepseek-ai/dsh-client-ui-theme）：零硬编码 hex（grep '#[0-9A-Fa-f]{3,8}' 零命中）。
// 引用约定（DESIGN.md token 表逐字 + 运行时真名兜底，C-5）：首选 var(--dsw-<DESIGN 表名>, …)，回退 --dsw-alias-* 语义别名
//   （宿主暗色态重定义别名即自动暗色适配；浅色解析值与 DESIGN.md 对照值同源）。间距档位 var(--dsw-space-N, <px>)；
//   圆角 --dsw-radius-*；阴影 var(--dsw-shadow-l1, var(--dsw-shadow-lv1))；mono=var(--dsw-font-mono, 系统栈回退)。
// 唯一强调色 = --dsw-state-business-primary（主按钮/焦点环/active 徽章）；语义色只用于状态点、对错图标与错误卡。
// 错误卡描边不叠影（无 box-shadow）；禁渐变/玻璃拟态/霓虹外发光；:active translateY(1px)；focus ring 2px。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  chunk: 'client.ui.styles.js',
  factory: () => {
    var module = { exports: {} }
    var exports = module.exports

    var STYLE_ID = 'dsh-github-ops-ui-css'
    var CSS = [
      '.gho-page{max-width:1200px;margin:0 auto;padding:var(--dsw-space-5, 24px);display:flex;flex-direction:column;gap:var(--dsw-space-6, 32px);font-family:var(--dsw-font-family);font-size:14px;line-height:22px;color:var(--dsw-label-primary, var(--dsw-alias-label-primary))}',
      '.gho-head{display:flex;flex-direction:column;gap:var(--dsw-space-1, 4px)}',
      '.gho-title{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-label-primary, var(--dsw-alias-label-primary))}',
      '.gho-subtitle{margin:0;font-size:12px;line-height:18px;font-weight:400;color:var(--dsw-label-tertiary, var(--dsw-alias-label-tertiary))}',
      '.gho-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,4fr);gap:var(--dsw-space-4, 16px) var(--dsw-space-5, 24px)}',
      '.gho-col{display:flex;flex-direction:column;gap:var(--dsw-space-4, 16px);min-width:0}',
      '@media (max-width: 959px){.gho-grid{grid-template-columns:1fr}}',
      '.gho-card{box-sizing:border-box;display:flex;flex-direction:column;gap:var(--dsw-space-3, 12px);padding:var(--dsw-space-5, 24px);background:var(--dsw-bg-base, var(--dsw-alias-bg-base));border:1px solid var(--dsw-border-l2, var(--dsw-alias-border-l2));border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-shadow-l1, var(--dsw-shadow-lv1))}',
      '.gho-card-head{display:flex;align-items:baseline;gap:var(--dsw-space-2, 8px)}',
      '.gho-card-title{margin:0;font-size:15px;line-height:22px;font-weight:600;color:var(--dsw-label-primary, var(--dsw-alias-label-primary))}',
      '.gho-card-caption{font-size:12px;line-height:18px;color:var(--dsw-label-caption, var(--dsw-alias-label-caption))}',
      '.gho-stack{display:flex;flex-direction:column;gap:var(--dsw-space-3, 12px)}',
      '.gho-rows{display:flex;flex-direction:column;gap:var(--dsw-space-2, 8px)}',
      '.gho-row{display:flex;align-items:center;gap:var(--dsw-space-3, 12px);padding:var(--dsw-space-1, 4px) 0;border-bottom:1px solid var(--dsw-border-l1, var(--dsw-alias-border-l1))}',
      '.gho-row:last-child{border-bottom:0}',
      '.gho-row-label{min-width:72px;font-size:14px;line-height:22px;color:var(--dsw-label-secondary, var(--dsw-alias-label-secondary))}',
      '.gho-row-value{min-width:0;overflow-wrap:anywhere;font-size:14px;line-height:22px;color:var(--dsw-label-primary, var(--dsw-alias-label-primary))}',
      '.gho-row-detail{min-width:0;overflow-wrap:anywhere;font-size:12px;line-height:18px;color:var(--dsw-label-tertiary, var(--dsw-alias-label-tertiary))}',
      '.gho-row-state{display:inline-flex;align-items:center;gap:var(--dsw-space-2, 8px);min-width:96px}',
      '.gho-row-side{margin-left:auto;display:inline-flex;align-items:center;gap:var(--dsw-space-2, 8px)}',
      '.gho-row-login{font-size:14px;line-height:22px;color:var(--dsw-label-primary, var(--dsw-alias-label-primary))}',
      '.gho-mono{font-family:var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);font-size:13px;line-height:22px}',
      '.gho-dot{width:8px;height:8px;border-radius:var(--dsw-radius-xs);flex:none;display:inline-block}',
      '.gho-dot-ok{background:var(--dsw-state-success-dot, var(--dsw-alias-state-success-primary))}',
      '.gho-dot-warn{background:var(--dsw-state-warning-dot, var(--dsw-alias-state-warn-primary))}',
      '.gho-dot-off{background:var(--dsw-label-caption, var(--dsw-alias-label-caption))}',
      '.gho-dot-error{background:var(--dsw-state-error-dot, var(--dsw-alias-state-error-primary))}',
      '.gho-chip{border-radius:var(--dsw-radius-xs);padding:0 var(--dsw-space-1, 4px);font-size:12px;line-height:18px}',
      '.gho-chip-ok{background:var(--dsw-state-success-bg, var(--dsw-alias-state-success-tertiary));color:var(--dsw-state-success-fg, color-mix(in srgb, var(--dsw-alias-state-success-primary) 72%, var(--dsw-alias-label-primary)))}',
      '.gho-chip-warn{background:var(--dsw-state-warning-bg, var(--dsw-alias-state-warn-tertiary));color:var(--dsw-state-warning-fg, var(--dsw-alias-state-warn-label))}',
      '.gho-chip-off{background:var(--dsw-bg-module-platform, var(--dsw-alias-bg-module-platform));color:var(--dsw-label-tertiary, var(--dsw-alias-label-tertiary))}',
      '.gho-chip-active{background:var(--dsw-state-business-bg, var(--dsw-alias-state-business-tertiary));color:var(--dsw-state-business-fg, color-mix(in srgb, var(--dsw-alias-state-business-primary) 72%, var(--dsw-alias-label-primary)))}',
      '.gho-btn{appearance:none;display:inline-flex;align-items:center;gap:var(--dsw-space-2, 8px);height:32px;padding:0 var(--dsw-space-3, 12px);border:1px solid transparent;border-radius:var(--dsw-radius-sm);font:inherit;font-size:14px;line-height:22px;cursor:pointer}',
      '.gho-btn:active:not(:disabled){transform:translateY(1px)}',
      '.gho-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-state-business-primary, var(--dsw-alias-state-business-primary)));outline-offset:1px}',
      '.gho-btn:disabled{cursor:default;opacity:.6}',
      '.gho-btn-primary{background:var(--dsw-state-business-primary, var(--dsw-alias-state-business-primary));color:var(--dsw-alias-label-primary-inverted)}',
      '.gho-btn-ghost{background:var(--dsw-bg-base, var(--dsw-alias-bg-base));color:var(--dsw-label-primary, var(--dsw-alias-label-primary));border-color:var(--dsw-border-l3, var(--dsw-alias-border-l3))}',
      '.gho-btn-ghost:hover:not(:disabled){background:var(--dsw-bg-layer-1, var(--dsw-alias-bg-layer-1))}',
      '.gho-btn-link{height:auto;padding:0;background:none;border:0;color:var(--dsw-state-business-primary, var(--dsw-alias-state-business-primary))}',
      '.gho-btn-link:hover:not(:disabled){text-decoration:underline}',
      '.gho-spinner{width:12px;height:12px;border-radius:var(--dsw-radius-xs);border:2px solid var(--dsw-border-l2, var(--dsw-alias-border-l2));border-top-color:var(--dsw-state-business-primary, var(--dsw-alias-state-business-primary));flex:none;animation:gho-spin 1s linear infinite}',
      '@keyframes gho-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion: reduce){.gho-spinner{animation:none}.gho-btn:active:not(:disabled){transform:none}}',
      '.gho-skeleton{background:var(--dsw-alias-bg-skeleton);border-radius:var(--dsw-radius-xs);animation:gho-pulse 1.6s ease-in-out infinite}',
      '.gho-skeleton-line{height:14px;width:100%}',
      '@keyframes gho-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
      '@media (prefers-reduced-motion: reduce){.gho-skeleton{animation:none}}',
      '.gho-error-card{display:flex;flex-direction:column;gap:var(--dsw-space-2, 8px);padding:var(--dsw-space-3, 12px);border:1px solid var(--dsw-state-error-border, color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent));border-radius:var(--dsw-radius-md);background:var(--dsw-state-error-bg, color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent))}',
      '.gho-error-title{display:inline-flex;align-items:center;gap:var(--dsw-space-2, 8px);font-size:14px;line-height:22px;font-weight:600;color:var(--dsw-state-error-fg, color-mix(in srgb, var(--dsw-alias-state-error-primary) 72%, var(--dsw-alias-label-primary)))}',
      '.gho-error-message{margin:0;font-size:12px;line-height:18px;color:var(--dsw-label-secondary, var(--dsw-alias-label-secondary))}',
      '.gho-error-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-label-tertiary, var(--dsw-alias-label-tertiary))}',
      '.gho-empty{display:flex;flex-direction:column;align-items:flex-start;gap:var(--dsw-space-2, 8px);padding:var(--dsw-space-3, 12px) 0}',
      '.gho-empty-text{margin:0;font-size:12px;line-height:18px;color:var(--dsw-label-tertiary, var(--dsw-alias-label-tertiary))}',
      '.gho-label{font-size:14px;line-height:22px;color:var(--dsw-label-secondary, var(--dsw-alias-label-secondary))}',
      '.gho-form{display:flex;align-items:center;gap:var(--dsw-space-2, 8px)}',
      '.gho-input{flex:1;min-width:0;height:32px;padding:0 var(--dsw-space-3, 12px);border:1px solid var(--dsw-border-l3, var(--dsw-alias-border-l3));border-radius:var(--dsw-radius-sm);background:var(--dsw-bg-layer-1, var(--dsw-alias-bg-layer-1));font:inherit;font-size:14px;line-height:22px;color:var(--dsw-label-primary, var(--dsw-alias-label-primary))}',
      '.gho-input::placeholder{color:var(--dsw-label-caption, var(--dsw-alias-label-caption))}',
      '.gho-input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-state-business-primary, var(--dsw-alias-state-business-primary)));outline-offset:1px}',
      '.gho-input:disabled{cursor:default;opacity:.6}',
      '.gho-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-label-tertiary, var(--dsw-alias-label-tertiary))}',
      '.gho-notice{margin:0;font-size:12px;line-height:18px;color:var(--dsw-label-secondary, var(--dsw-alias-label-secondary))}',
      '.gho-notice-ok{color:var(--dsw-state-success-fg, color-mix(in srgb, var(--dsw-alias-state-success-primary) 72%, var(--dsw-alias-label-primary)))}',
      '.gho-actions{display:flex;align-items:center;gap:var(--dsw-space-2, 8px)}',
      '.gho-actions-end{justify-content:flex-end}',
      '.gho-icon{width:14px;height:14px;flex:none;stroke:currentColor;stroke-width:1.6}',
      '.gho-icon-ok{color:var(--dsw-state-success-dot, var(--dsw-alias-state-success-primary))}',
      '.gho-icon-fail{color:var(--dsw-state-error-dot, var(--dsw-alias-state-error-primary))}',
      '.gho-icon-star{color:var(--dsw-state-warning-dot, var(--dsw-alias-state-warn-primary))}',
      '.gho-stars{display:inline-flex;align-items:center;gap:var(--dsw-space-1, 4px)}',
      '.gho-repo-line{display:inline-flex;align-items:center;gap:var(--dsw-space-2, 8px);flex-wrap:wrap}',
      '.gho-root{font-family:var(--dsw-font-family)}',
      '.gho-summary{display:inline-flex;align-items:center;gap:var(--dsw-space-2, 8px);font-size:12px;line-height:18px;color:var(--dsw-label-secondary, var(--dsw-alias-label-secondary))}',
    ].join('\n')

    /** 样式注入（幂等 + document 守卫）：Node/测试环境无 document 直接跳过，绝不炸模块载入（INV-6） */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      try {
        if (document.getElementById(STYLE_ID)) return
        var el = document.createElement('style')
        el.id = STYLE_ID
        el.setAttribute('data-plugin-css', 'dsh-github-ops')
        el.textContent = CSS
        ;(document.head || document.documentElement).appendChild(el)
      } catch { /* 样式注入失败不炸插件（视觉降级=浏览器默认） */ }
    }
    ensureStyles()

    exports.CSS = CSS
    exports.ensureStyles = ensureStyles
    return module.exports
  },
})
