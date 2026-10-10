<script setup>
// SourceRow.vue — 一源一行子组件（Task 5 / T-E，视觉定稿候选 2「行式两段」，DESIGN.md §3B）。
// 上排 = 源名（+自定义徽标/域名小字）+ 代理勾选（mini 开关+注记）+ 启停；下排缩进 44px = 测试按钮 + 最近结果（成败+耗时+条数）。
// 纯展示 + 事件转发：状态归一在 SourceCard；K-11/K-22 交互控件禁条件渲染（class 绑定）、零自造色（只引既有 token）。
defineProps({
  order: { type: [Number, String], default: '' },
  label: { type: String, default: '' },
  sub: { type: String, default: '' },
  custom: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
  proxy: { type: Boolean, default: false },
  proxyNote: { type: String, default: '' },
  lastState: { type: String, default: 'idle' },
  lastText: { type: String, default: '— 未测' },
  busy: { type: Boolean, default: false },
  /** 排序降级按钮可用态（首行不可上移、末行不可下移）。 */
  canUp: { type: Boolean, default: false },
  canDown: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle', 'proxy', 'probe', 'move'])
</script>

<template>
  <div class="sr-row">
    <div class="sr-top">
      <span class="sr-handle" aria-hidden="true">⠿</span>
      <span class="sr-order">{{ order }}</span>
      <!-- 排序降级按钮（T-E2 无障碍回归修复）：键盘可达（Tab 聚焦 + Enter/Space 原生触发）；
           默认隐蔽零常态占位（absolute 叠放把手区），hover / 聚焦显形；与拖拽同走 SourceCard reorder 路径。 -->
      <div class="sr-step">
        <button class="sr-step-btn" type="button" :disabled="!canUp" aria-label="上移一位" @click="emit('move', -1)">▲</button>
        <button class="sr-step-btn" type="button" :disabled="!canDown" aria-label="下移一位" @click="emit('move', 1)">▼</button>
      </div>
      <div class="sr-name">
        {{ label }}
        <span v-show="custom" class="sr-badge">自定义</span>
        <span class="sr-sub">{{ sub }}</span>
      </div>
      <div class="sr-spacer"></div>
      <div class="sr-ctl">
        <span class="sr-ctl-label">代理</span>
        <button
          class="sr-switch-mini"
          :class="{ 'is-off': !proxy }"
          type="button"
          role="switch"
          :aria-checked="String(proxy)"
          :aria-label="`${label} 走代理`"
          @click="emit('proxy')"
        ><span class="sr-thumb"></span></button>
        <span class="sr-note">{{ proxyNote }}</span>
      </div>
      <button
        class="sr-switch"
        :class="{ 'is-off': !enabled }"
        type="button"
        role="switch"
        :aria-checked="String(enabled)"
        :aria-label="`${label} 启停`"
        @click="emit('toggle')"
      ><span class="sr-thumb"></span></button>
    </div>
    <div class="sr-bottom">
      <button class="sr-btn" type="button" :aria-label="`测试 ${label}`" @click="emit('probe')">
        {{ busy ? '测试中…' : '测试' }}
      </button>
      <span class="sr-last" :class="`is-${lastState}`">{{ lastText }}</span>
    </div>
  </div>
</template>

<style scoped>
/* 样式全落组件内；零自造色——只引既有 dsh token（K-11/K-22）。 */
.sr-row { position: relative; padding: 10px 2px 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.sr-row:last-child { border-bottom: 0; }
/* 排序降级按钮：默认隐蔽零常态占位（absolute 叠放把手区），hover / 键盘聚焦显形（T-E2）。 */
.sr-step { position: absolute; left: 0; top: 11px; display: flex; gap: 2px; opacity: 0; pointer-events: none; }
.sr-row:hover .sr-step, .sr-step:focus-within { opacity: 1; pointer-events: auto; }
.sr-step-btn {
  width: 22px; height: 22px; padding: 0; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-family);
  font-size: 10px; line-height: 20px; cursor: pointer;
}
.sr-step-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sr-step-btn:disabled { opacity: 0.5; cursor: default; }
.sr-step-btn:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sr-top { display: flex; align-items: center; gap: 12px; }
.sr-bottom { display: flex; align-items: center; gap: 12px; margin-top: 8px; padding-left: 44px; }
.sr-handle { color: var(--dsw-alias-label-caption); font-size: 13px; flex: none; }
.sr-order {
  width: 20px; height: 20px; border-radius: 999px; flex: none;
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
  font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.sr-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary); }
.sr-badge {
  height: 18px; padding: 0 7px; border-radius: var(--dsw-radius-xs); flex: none;
  background: var(--dsw-alias-state-business-tertiary); color: var(--dsw-alias-state-business-primary);
  font-size: 11px; line-height: 18px; font-weight: 400;
}
.sr-sub { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-spacer { flex: 1; min-width: 0; }
.sr-ctl { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.sr-ctl-label { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.sr-note { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; white-space: nowrap; }
.sr-switch, .sr-switch-mini { border: 0; padding: 0; border-radius: 999px; position: relative; flex: none; background: var(--dsw-alias-state-business-primary); cursor: pointer; }
.sr-switch { width: 36px; height: 20px; }
.sr-switch-mini { width: 28px; height: 16px; }
.sr-thumb {
  width: 16px; height: 16px; border-radius: 999px; position: absolute; top: 2px; right: 2px;
  background: var(--dsw-alias-switch-thumb);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary), transparent 92%);
}
.sr-switch-mini .sr-thumb { width: 12px; height: 12px; }
.sr-switch.is-off, .sr-switch-mini.is-off { background: color-mix(in srgb, var(--dsw-alias-label-secondary), transparent 60%); }
.sr-switch.is-off .sr-thumb, .sr-switch-mini.is-off .sr-thumb { right: auto; left: 2px; }
.sr-btn {
  height: 24px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-family);
  font-size: var(--cs-fs-note, 12px); line-height: 18px; cursor: pointer; flex: none;
}
.sr-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sr-btn:focus-visible, .sr-switch:focus-visible, .sr-switch-mini:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sr-last { font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
.sr-last.is-ok { color: var(--dsw-alias-state-success-primary); }
.sr-last.is-fail { color: var(--dsw-alias-state-error-primary); }
.sr-last.is-idle { color: var(--dsw-alias-label-caption); }
</style>
