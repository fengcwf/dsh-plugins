// lib/client.js — dsh-github-ops 客户端壳（dsh-client-modules 工厂形 bundle，零构建纯 JS，无 JSX）。
// 契约：window.__ModuleLoader__.load({id, factory})；factory(require) 只登记模块体（副作用全在 apply，INV-9）；
// 宿主自动服务 /plugins/dsh-github-ops/client.js（dsh.client 声明被 dsh-client-modules 扫入浏览器花名册）。
// 边界（F-scan-1）：本壳只做模块注册 + 槽位多座自探测 + fetch 帮手 + 挂载生命周期；
//   UI 渲染逻辑全部归兄弟 chunk lib/client.ui.js（require.async('./client.ui.js')，Task 14 填真 UI，本卡=Ruling-4 最小桩）。
// 多座（US-8 / ADR-001）：settings.section 主座 + 兼容座自探测——slots.inject 即探测（宿主未声明该槽，
//   回调永不执行 = 该面缺席，零版本号判断）；防双挂载 = 单挂收敛 + 迟到高优先座切换
//   （workbench 三形态收敛先例：服务迟到自动切换形态、杜绝双挂载）。
// 红线（P-7）：root 槽禁注册；sidebar/rightbar 只加内层 seat——本壳两者皆不碰。
// fail-open（INV-6）：槽位方缺席 / 注册失败 / 兄弟 chunk 不可取 = 该面缺席，catch + logger.warn，绝不炸插件。
// fetch 铁律：一律文档相对 'api/github-ops/…'（站内绝对 '/…' 在 login-gate 基址下 404）。
window.__ModuleLoader__.load({
  id: 'dsh-github-ops',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // 文档相对（无前导斜杠）：与宿主 <base href="./"> 同基（scout 报告 §3.4 铁律）
    var API_BASE = 'api/github-ops/'
    var UI_CHUNK = './client.ui.js'

    /** fetch 缝（测试注入；默认全局 fetch） */
    exports.__fetch = function doFetch(url, init) {
      return fetch(url, init)
    }

    function describe(e) {
      return String((e && e.message) || e)
    }

    function warn(ctx, message) {
      try {
        if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('[dsh-github-ops] ' + message)
      } catch { /* 日志缺位不抛（INV-6） */ }
    }

    /** 文档相对 API 帮手：path 归一剥前导斜杠（站内绝对形在 login-gate 基址下 404） */
    function apiFetch(path, init) {
      var p = path === undefined || path === null ? '' : String(path)
      while (p.charAt(0) === '/') p = p.slice(1)
      return exports.__fetch(API_BASE + p, init)
    }
    exports.apiFetch = apiFetch

    /** 交给 UI chunk 的接口面（Task 14 render* 消费）：文档相对 fetch 帮手 + 基址 */
    var API_FACE = { base: API_BASE, fetch: apiFetch }

    // —— 座位表（多座自探测 + 单挂收敛；priority 越小越优先）——
    // settings.section=主座（设置菜单配置面）；其余为 GUI 版本漂移兼容座。
    // summary 座（plugins.bundle.config / settings.plugin.item）的 ownerProps.view==='summary'
    // 归 ui.renderSummary（bundle 页一行摘要），其余归 ui.renderSettingsSection。
    var SEATS = [
      {
        name: 'settings.section',
        priority: 0,
        summary: false,
        options: function options() {
          return { name: 'settings.section', id: 'github-ops', order: 30, label: function label() { return 'GitHub 集成' } }
        },
      },
      {
        name: 'settings.plugins.tab',
        priority: 1,
        summary: false,
        options: function options() {
          return { name: 'settings.plugins.tab', id: 'github-ops', order: 60, label: function label() { return 'GitHub 集成' } }
        },
      },
      {
        name: 'plugins.bundle.config',
        priority: 2,
        summary: true,
        options: function options() {
          return { name: 'plugins.bundle.config', key: 'dsh-github-ops' }
        },
      },
      {
        name: 'settings.plugin.item',
        priority: 3,
        summary: true,
        options: function options() {
          return { name: 'settings.plugin.item', key: 'dsh-github-ops' }
        },
      },
    ]

    // —— 兄弟 chunk（lib/client.ui.js）载入：require.async 形（宿主 CLIENT_CHUNK 白名单 client.<name>.js）——
    var uiPromise = null
    function loadUi() {
      if (uiPromise === null) {
        uiPromise = Promise.resolve()
          .then(function () { return require.async(UI_CHUNK) })
          .then(function (ui) {
            if (!ui || typeof ui.renderSettingsSection !== 'function') {
              throw new Error('client.ui.js 未导出 renderSettingsSection（render* 接口面缺失）')
            }
            return ui
          })
      }
      return uiPromise
    }

    // —— 单挂收敛（防双挂载）+ 待挂重挂（L1）：同一时刻至多一座在场；迟到高优先座=先挂新座再拆旧座
    //    （注册变更微任务批处理，同一同步块内换手对宿主渲染不可见）；同座二次触发/低优先触发=登记待挂（可重挂），
    //    主座拆除后微任务自动补位——槽位重声明绝不静默缺席（L1）；旧座拆卸不牵连新座（dispose 按 record 身份守卫）。
    var mountedSeat = null // { name, priority, dispose }
    var waitingSeats = [] // 待挂座：{ ctx, seat, ui, alive, unmount }

    function dropWaiting(slot) {
      var i = waitingSeats.indexOf(slot)
      if (i >= 0) waitingSeats.splice(i, 1)
    }

    var promoteScheduled = false
    function schedulePromote() {
      if (promoteScheduled) return
      promoteScheduled = true
      Promise.resolve().then(function () {
        promoteScheduled = false
        try { promoteWaiting() } catch { /* 补位失败不炸插件（INV-6）；挂载点自带 warn */ }
      })
    }

    /** 待挂补位：取优先级最优（同优先取最新）且存活的待挂座上挂 */
    function promoteWaiting() {
      if (mountedSeat) return
      var best = null
      for (var i = 0; i < waitingSeats.length; i++) {
        var s = waitingSeats[i]
        if (!s.alive) continue
        if (!best || s.seat.priority <= best.seat.priority) best = s
      }
      if (!best) return
      dropWaiting(best)
      activateSlot(best)
    }

    /** 激活一座：同座重声明=换手；低/同优先=登记待挂（可重挂）；否则上挂 */
    function activateSlot(slot) {
      if (!slot.alive) return
      for (var i = waitingSeats.length - 1; i >= 0; i--) {
        if (waitingSeats[i] !== slot && waitingSeats[i].seat.name === slot.seat.name) waitingSeats.splice(i, 1) // 旧待挂登记撤（重声明换手）
      }
      if (mountedSeat && mountedSeat.priority <= slot.seat.priority) {
        dropWaiting(slot)
        waitingSeats.push(slot) // 跳过=可重挂（L1）：主座拆除后自动补位
        return
      }
      mountSlot(slot)
    }

    function mountSlot(slot) {
      var ctx = slot.ctx
      var seat = slot.seat
      var ui = slot.ui
      var record = { name: seat.name, priority: seat.priority, dispose: null }
      var inner = null
      try {
        inner = ctx.slots.register(seat.options(), function GitHubOpsSeat(props) {
          try {
            if (seat.summary && props && props.view === 'summary') {
              return ui.renderSummary({ api: API_FACE, ownerProps: props })
            }
            return ui.renderSettingsSection({ api: API_FACE, ownerProps: props })
          } catch (e) {
            warn(ctx, 'seat 渲染失败（' + seat.name + '）：' + describe(e))
            return null
          }
        })
      } catch (e) {
        warn(ctx, '座位注册失败（' + seat.name + '，缺槽位方？）：' + describe(e))
        return
      }
      record.dispose = function dispose() {
        if (mountedSeat === record) mountedSeat = null
        if (typeof inner === 'function') {
          try { inner() } catch { /* 收敛不抛（INV-6） */ }
        }
        schedulePromote() // 主座消失→待挂座补位（L1）
      }
      slot.unmount = record.dispose
      var prev = mountedSeat
      mountedSeat = record
      if (prev) {
        try { prev.dispose() } catch (e) { warn(ctx, '旧座拆除失败（' + prev.name + '）：' + describe(e)) }
      }
    }

    /** 单座 inject 回调：UI chunk 就绪后才挂（挂载生命周期），拆除器处理异步竞态与待挂登记（可重挂，L1） */
    function makeSeatSetup(ctx, seat) {
      return function seatSetup() {
        var slot = { ctx: ctx, seat: seat, ui: null, alive: true, unmount: null }
        loadUi().then(function (ui) {
          if (!slot.alive) return
          try {
            slot.ui = ui
            activateSlot(slot)
          } catch (e) {
            // L1：成功回调包 try+warn（INV-6 精神）——挂载期异常只留痕，绝不炸宿主
            warn(ctx, '座位挂载失败（' + seat.name + '，该面缺席）：' + describe(e))
          }
        }, function (e) {
          warn(ctx, '兄弟 chunk 载入失败（' + seat.name + ' 该面缺席）：' + describe(e))
        })
        return function disposeSeat() {
          slot.alive = false
          dropWaiting(slot)
          if (slot.unmount) {
            var unmount = slot.unmount
            slot.unmount = null
            try { unmount() } catch { /* 收敛不抛（INV-6） */ }
          }
        }
      }
    }

    /**
     * 挂载生命周期：槽位多座自探测（slots.inject 即探测）+ 单挂收敛。
     * 槽位方缺席 = 该面缺席：catch + logger.warn，绝不炸插件（INV-6）。
     */
    function apply(ctx) {
      var disposers = []
      loadUi().catch(function (e) {
        warn(ctx, '兄弟 chunk 载入失败（设置面缺席）：' + describe(e))
      })
      for (var i = 0; i < SEATS.length; i++) {
        try {
          disposers.push(ctx.slots.inject(SEATS[i].name, makeSeatSetup(ctx, SEATS[i])))
        } catch (e) {
          warn(ctx, '槽位方缺席或注入失败（' + SEATS[i].name + '）：' + describe(e))
        }
      }
      return function dispose() {
        for (var i = disposers.length - 1; i >= 0; i--) {
          try {
            if (typeof disposers[i] === 'function') disposers[i]()
          } catch { /* 收敛不抛（INV-6） */ }
        }
        disposers.length = 0
      }
    }

    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
