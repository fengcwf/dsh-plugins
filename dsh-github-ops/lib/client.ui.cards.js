// lib/client.ui.cards.js — dsh-github-ops UI 展示层（client.ui.* 兄弟 chunk，F-scan-1 渲染族）。
// 纯渲染：renderSettingsView(state, actions)（双栏六节卡片，定稿图 visual/final.png 双栏概览式）+ 共享原语。
// 消费 client.ui.model.js 的视图模型；本层零取数零状态，容器（client.ui.js）持模型并订阅。
// DESIGN.md token 逐字（C-5）：色彩/字体/间距/圆角阴影全走 client.ui.styles.js 的 --dsw-* 引用，本文件零样式字面。
// 禁令清单（DESIGN/taste 子集）：可见文案零 em-dash/en-dash、无 emoji 图标（状态点=CSS 圆点、星标/对错=矢量 SVG）。
// UI 零明文（INV-1/P-5）：状态卡只显主机/登录名/token 是否在位（绝不渲染任何 token 形态串）。
// P-8：无删除/登出按钮与入口。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  chunk: 'client.ui.cards.js',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')
    function h() { return react.createElement.apply(react, arguments) }

    // —— 矢量图标（禁 emoji）：对勾/叉/星形，颜色归 CSS token ——
    function svgIcon(kind) {
      if (kind === 'ok') {
        return h('svg', { className: 'gho-icon gho-icon-ok', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
          h('path', { d: 'M2.5 8.5l3.5 3.5 7.5-8', fill: 'none' }))
      }
      if (kind === 'fail') {
        return h('svg', { className: 'gho-icon gho-icon-fail', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
          h('path', { d: 'M3.5 3.5l9 9M12.5 3.5l-9 9', fill: 'none' }))
      }
      return h('svg', { className: 'gho-icon gho-icon-star', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        h('path', { d: 'M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2.1.7-4.3-3.1-3 4.3-.6z' }))
    }

    function skeletonLines(n, keyPrefix) {
      var out = []
      for (var i = 0; i < n; i++) out.push(h('div', { className: 'gho-skeleton gho-skeleton-line', key: keyPrefix + i }))
      return out
    }

    /** 分级错误卡（INV-10）：title=「状态 · 归因」+ message + 修复指引 hint（stderr 敏感串不透传） */
    function errorCard(err) {
      if (!err) return null
      return h('div', { className: 'gho-error-card', role: 'status' },
        h('div', { className: 'gho-error-title' },
          h('span', { className: 'gho-dot gho-dot-error', 'aria-hidden': 'true' }),
          h('span', null, String(err.title ?? '未知错误'))),
        err.message ? h('p', { className: 'gho-error-message' }, String(err.message)) : null,
        err.hint ? h('p', { className: 'gho-error-hint' }, String(err.hint)) : null)
    }

    function card(title, caption, children) {
      return h('section', { className: 'gho-card' },
        h('div', { className: 'gho-card-head' },
          h('h2', { className: 'gho-card-title' }, title),
          caption ? h('span', { className: 'gho-card-caption gho-mono' }, String(caption)) : null),
        children)
    }

    function button(label, kind, onClick, busy) {
      return h('button', {
        type: 'button',
        className: 'gho-btn gho-btn-' + kind + (busy ? ' gho-btn-busy' : ''),
        disabled: busy === true,
        onClick: typeof onClick === 'function' ? onClick : undefined,
      }, busy ? h('span', { className: 'gho-spinner', 'aria-hidden': 'true' }) : null, h('span', null, label))
    }

    function row(label, value, mono) {
      return h('div', { className: 'gho-row' },
        h('span', { className: 'gho-row-label' }, label),
        h('span', { className: mono ? 'gho-row-value gho-mono' : 'gho-row-value' }, value === null || value === undefined ? '' : String(value)))
    }

    // —— 左栏：认证状态卡（US-1：主机/登录名/token 是否在位，零明文）——
    function authCard(auth) {
      if (auth.phase === 'loading') return card('认证状态', null, h('div', { className: 'gho-rows' }, ...skeletonLines(4, 'auth')))
      if (auth.phase === 'error') return card('认证状态', null, errorCard(auth.error))
      var rows = [
        row('主机', auth.host ?? '未检测到', true),
        row('登录名', auth.login ?? '未登录', true),
        h('div', { className: 'gho-row', key: 'token' },
          h('span', { className: 'gho-row-label' }, 'Token'),
          h('span', { className: 'gho-row-value' },
            h('span', { className: auth.hasToken ? 'gho-chip gho-chip-ok' : 'gho-chip gho-chip-off' }, auth.hasToken ? '已配置' : '未配置'))),
        row('API 限额', auth.quota ? auth.quota.text : '未检验', true),
        row('限额重置', auth.quota ? auth.quota.resetText : '未检验', true),
      ]
      var body = h('div', { className: 'gho-rows' }, ...rows)
      if (auth.hint) return card('认证状态', auth.host, h('div', null, body, h('p', { className: 'gho-hint' }, String(auth.hint))))
      return card('认证状态', auth.host, body)
    }

    // —— 左栏：访问检验卡（US-3/US-6：三段判定 + 限额可视化 + 重新检查）——
    function checkRowEl(r, i) {
      var mark = r.state === 'passed' ? svgIcon('ok') : r.state === 'failed' ? svgIcon('fail') : h('span', { className: 'gho-dot gho-dot-off', 'aria-hidden': 'true' })
      return h('div', { className: 'gho-row gho-row-check', key: 'chk' + i },
        h('span', { className: 'gho-row-state' }, mark, h('span', { className: 'gho-row-label' }, r.label)),
        h('span', { className: r.mono ? 'gho-row-detail gho-mono' : 'gho-row-detail' }, String(r.detail ?? '')))
    }
    function checkCard(check, actions) {
      var run = actions && actions.check ? actions.check : null
      var children = []
      if (check.phase === 'idle') {
        children.push(button('检查 GitHub 访问', 'primary', run, false))
        children.push(h('p', { className: 'gho-hint' }, '尚未检验：点按上方按钮做三段判定'))
      } else if (check.phase === 'loading') {
        children.push(button('检查 GitHub 访问', 'primary', run, true))
        children.push(h('div', { className: 'gho-rows' }, ...skeletonLines(3, 'chk')))
      } else {
        children.push(errorCard(check.error))
        children.push(h('div', { className: 'gho-rows' }, ...check.rows.map(checkRowEl)))
        children.push(h('div', { className: 'gho-actions' }, button('重新检查', 'ghost', run, false)))
      }
      return card('访问检验', null, h('div', { className: 'gho-stack' }, ...children))
    }

    // —— 左栏：插件自检卡（US-7：配置合成/gh 可用/凭据在位）——
    function healthRowEl(r, i) {
      return h('div', { className: 'gho-row gho-row-check', key: 'h' + i },
        h('span', { className: 'gho-row-state' }, r.ok ? svgIcon('ok') : svgIcon('fail'), h('span', { className: 'gho-row-label' }, r.label)),
        h('span', { className: 'gho-row-detail' }, String(r.detail ?? '')),
        !r.ok && r.hint ? h('p', { className: 'gho-hint' }, String(r.hint)) : null)
    }
    function healthCard(health) {
      if (health.phase === 'loading') return card('插件自检', null, h('div', { className: 'gho-rows' }, ...skeletonLines(3, 'health')))
      if (health.phase === 'error') return card('插件自检', null, errorCard(health.error))
      return card('插件自检', null, h('div', { className: 'gho-rows' }, ...health.rows.map(healthRowEl)))
    }

    // —— 右栏：Token 维护卡（US-2：密码框 + 留空=不修改 + 保存即清空 + 保存后立即验证）——
    function tokenCard(token, actions) {
      var children = []
      children.push(h('label', { className: 'gho-label', htmlFor: 'gho-token-input' }, 'Personal Access Token'))
      children.push(h('div', { className: 'gho-form' },
        h('input', {
          id: 'gho-token-input',
          className: 'gho-input',
          type: 'password',
          placeholder: '留空=不修改',
          value: token.draft,
          autoComplete: 'off',
          spellCheck: false,
          disabled: token.busy === true,
          onChange: function onChange(e) { if (actions && actions.setTokenDraft) actions.setTokenDraft(e && e.target ? e.target.value : '') },
        }),
        button('保存并验证', 'primary', function onSave() { if (actions && actions.saveToken) actions.saveToken(token.draft) }, token.busy)))
      children.push(h('p', { className: 'gho-hint' }, '保存后立即验证；留空=不修改，不触碰既有凭据'))
      children.push(errorCard(token.error))
      if (token.notice) children.push(h('p', { className: token.notice.kind === 'ok' ? 'gho-notice gho-notice-ok' : 'gho-notice' }, String(token.notice.text)))
      return card('Token 维护', '零明文存储', h('div', { className: 'gho-stack' }, ...children))
    }

    // —— 右栏：多账号库卡（US-4：active 标记/逐账号验证/切换；Empty=尚无其他账号 + 添加入口）——
    function accountRowEl(r, actions, i) {
      var dotClass = r.verified ? 'gho-dot gho-dot-ok' : r.active ? 'gho-dot gho-dot-warn' : 'gho-dot gho-dot-off'
      return h('div', { className: 'gho-row gho-row-account', key: 'acc' + i },
        h('span', { className: 'gho-row-state' },
          h('span', { className: dotClass, 'aria-hidden': 'true' }),
          h('span', { className: 'gho-row-login gho-mono' }, r.login),
          r.busy ? h('span', { className: 'gho-spinner', 'aria-hidden': 'true' }) : null,
          r.verified
            ? h('span', { className: 'gho-row-detail' }, '已验证')
            : h('span', { className: 'gho-chip gho-chip-warn' }, '待验证')),
        h('span', { className: 'gho-row-side' },
          r.active
            ? h('span', { className: 'gho-chip gho-chip-active' }, 'active')
            : button('切换', 'link', function onSwitch() { if (actions && actions.switchAccount) actions.switchAccount(r.login) }, r.busy),
          r.active ? h('span', { className: 'gho-row-detail' }, '当前') : null))
    }
    function accountsCard(accounts, actions) {
      var add = actions && actions.addAccount ? actions.addAccount : null
      var body
      if (accounts.phase === 'loading') {
        body = h('div', { className: 'gho-rows' }, ...skeletonLines(2, 'acc'))
      } else if (accounts.phase === 'error') {
        body = errorCard(accounts.error)
      } else if (!accounts.rows.length) {
        body = h('div', { className: 'gho-empty' },
          h('p', { className: 'gho-empty-text' }, '尚无其他账号'),
          button('添加账号', 'ghost', add, false))
      } else {
        body = h('div', { className: 'gho-rows' }, ...accounts.rows.map(function (r, i) { return accountRowEl(r, actions, i) }))
      }
      return card('多账号库', null, h('div', { className: 'gho-stack' },
        h('div', { className: 'gho-actions gho-actions-end' }, button('添加账号', 'ghost', add, false)),
        body,
        accounts.hint ? h('p', { className: 'gho-hint' }, String(accounts.hint)) : null))
    }

    // —— 右栏：仓库上下文卡（US-5：remote/分支/仓库摘要；星标=矢量星形）——
    function repoCard(repo) {
      if (repo.phase === 'loading') return card('仓库上下文', null, h('div', { className: 'gho-rows' }, ...skeletonLines(3, 'repo')))
      if (repo.phase === 'error') return card('仓库上下文', null, errorCard(repo.error))
      var remoteText = repo.remotes.length
        ? repo.remotes.map(function (r) { return r.name + ' · ' + r.url }).join('，')
        : '未检测到'
      var rows = [
        row('remote', remoteText, true),
        row('分支', repo.branch ?? '未检测到', true),
        h('div', { className: 'gho-row', key: 'repo' },
          h('span', { className: 'gho-row-label' }, '仓库'),
          h('span', { className: 'gho-row-value' }, repo.repo && repo.repo.fullName
            ? h('span', { className: 'gho-repo-line' },
              h('span', { className: 'gho-mono' }, repo.repo.fullName),
              typeof repo.repo.stars === 'number'
                ? h('span', { className: 'gho-stars' }, svgIcon('star'), h('span', { className: 'gho-mono' }, String(repo.repo.stars)))
                : null)
            : '未检测到')),
      ]
      var body = h('div', { className: 'gho-rows' }, ...rows)
      return card('仓库上下文', null, h('div', { className: 'gho-stack' }, body,
        repo.hint ? h('p', { className: 'gho-hint' }, String(repo.hint)) : null))
    }

    /** 双栏概览式（定稿图）：左=状态概览（认证状态/访问检验/插件自检），右=管理操作（Token 维护/多账号库/仓库上下文） */
    function renderSettingsView(state, actions) {
      var s = state ?? {}
      var auth = s.auth ?? { phase: 'loading' }
      var check = s.check ?? { phase: 'idle', rows: [] }
      var health = s.health ?? { phase: 'loading' }
      var accounts = s.accounts ?? { phase: 'loading', rows: [] }
      var repo = s.repo ?? { phase: 'loading' }
      var token = s.token ?? { draft: '', busy: false }
      return h('div', { className: 'gho-page' },
        h('div', { className: 'gho-head' },
          h('h1', { className: 'gho-title' }, 'GitHub 集成'),
          h('p', { className: 'gho-subtitle' }, 'dsh-github-ops · 认证、访问检验与仓库上下文')),
        h('div', { className: 'gho-grid' },
          h('div', { className: 'gho-col' }, authCard(auth), checkCard(check, actions), healthCard(health)),
          h('div', { className: 'gho-col' }, tokenCard(token, actions), accountsCard(accounts, actions), repoCard(repo))))
    }

    exports.renderSettingsView = renderSettingsView
    exports.errorCard = errorCard
    return module.exports
  },
})
