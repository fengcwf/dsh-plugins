// client.js — obsidian-web 客户端模块（问题 B：菜单入口，照 @linxin666/dsh-client-ui-skill-explorer 契约）
// 零构建手写（无 JSX/无打包器）：window.__ModuleLoader__.load({id, factory:(require)=>exports})——
//   形契约三件：①顶层调用 __ModuleLoader__.load 注册工厂 ②factory(require) → module.exports
//   ③exports.apply(客户端根 ctx) + exports.inject(所需客户端服务名)。
// 面板形（照 skill-explorer sidebar.panellist 行 + main 槽页双座）：
//   - 行：ctx.slots.inject("sidebar.panellist", () => slots.register({name, id, order, label}, Icon))
//   - 页：ctx.slots.inject("main", () => slots.register({name:"main", key}, Page))，内容=iframe 指既有
//     /ob/ 静态面（web-routes prefix /ob 已服务三栏 UI——选型=iframe 复用既有面，零重复实现；
//     路径用绝对形 /ob/，与本插件面既有约定一致 web/src/api.js 全部 fetch('/ob/api/...')）。
// 两座都经 slots.inject 等待宿主壳声明（壳未声明=面板缺席不炸装载，skill-explorer 同款语义）。
// react 由 dsh web 客户端运行时经 __ModuleLoader__ 的 require 提供（零新增依赖，依赖白名单不变）。
window.__ModuleLoader__.load({
  id: 'obsidian-web',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    /** 面板 id（行 id / main key 同源——选中联动键） */
    const PANEL_ID = 'obsidian-web'
    /** 行排序键（skill-explorer PANEL_ORDER=30 之后，通用区中段；仅同列表内相对序） */
    const PANEL_ORDER = 35
    /** 行 label 契约字面（任务契约锁定；后续可接 locale） */
    const ENTRY_LABEL = 'Obsidian vault'
    /** main 槽页内容源：既有 /ob/ 静态面（三栏 UI，web-routes prefix /ob） */
    const UI_SRC = '/ob/'

    /** 行图标（纯手写 createElement，零 JSX）：书卷形 */
    function ObsidianVaultIcon(props) {
      return React.createElement(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          ...props,
        },
        React.createElement('path', { d: 'M8 3.2C6.6 2 4.5 2 3 2v10.5c1.5 0 3.6 0 5 1.3 1.4-1.3 3.5-1.3 5-1.3V2c-1.5 0-3.6 0-5 1.2z' }),
        React.createElement('path', { d: 'M8 3.2v10.6' }),
      )
    }

    /**
     * main 槽页：iframe 复用既有 /ob/ 三栏 UI（读/编辑/下载/分享全功能已服务于此面）。
     * 语义锚 data-dsh-plugin 便于皮肤/测试定位（skill-explorer 同款锚语义）。
     */
    function ObsidianVaultPage() {
      return React.createElement('iframe', {
        title: ENTRY_LABEL,
        src: UI_SRC,
        'data-dsh-plugin': 'obsidian-web',
        'data-dsh-obsidian-web-view': '',
        style: { width: '100%', height: '100%', border: '0', display: 'block' },
      })
    }

    /**
     * 挂载面板双座（行 + 页）。ctx.slots.inject 等宿主声明后才注册；
     * 全部注册交 ctx.effect 收敛（卸载零悬挂）。
     */
    function apply(ctx) {
      const slots = ctx.slots
      // B2 同形位点修复（FX-INV-1，S1 漏列、队长修订补列）：注册动作在 effect 执行体内当场跑、
      //   返回值=拆除器（真 cordis 语义=执行器立即执行、返回函数才是拆除器）。面板注册失败留痕
      //   放行语义零弱化（壳未声明=面板缺席不炸装载，skill-explorer 同款）；拆除器幂等（disposed
      //   flag 同款双保险 + splice(0) 天然幂等）、零悬挂。
      ctx.effect(() => {
        const disposers = []
        try {
          disposers.push(slots.inject('sidebar.panellist', () => slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: PANEL_ORDER,
            label: () => ENTRY_LABEL,
          }, ObsidianVaultIcon)))
          disposers.push(slots.inject('main', () => slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => ({}),
          }, ObsidianVaultPage)))
        } catch (error) {
          console.warn('[obsidian-web] panel registration failed:', error)
        }
        let disposed = false
        return () => {
          if (disposed) return
          disposed = true
          for (const dispose of disposers.splice(0)) dispose()
        }
      }, 'obsidian-web: ui mounts')
    }

    /** 所需客户端服务面（面板注册缝=slots） */
    const inject = ['slots']

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
