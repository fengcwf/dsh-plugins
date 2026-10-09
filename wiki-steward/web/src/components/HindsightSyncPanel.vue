<script setup>
// HindsightSyncPanel — 「Hindsight 同步」设置节（U2/U3 用户面，六控件=solution-design §4 表逐行）：
// ①状态条（diagnose/sync_status 口径徽标）②立即同步按钮 ③同步日历（按日计数条，非全尺寸网格）
// ④HH:MM 同步时间输入 ⑤L1 启停开关 ⑥L2 只读「⏳ 待重启」徽标展示区（写按钮后置不做）。
// 展示层零判定逻辑：徽标/日历聚合/时间校验/L2 三态全在 lib/hindsight-model.js 纯模块（node --test 直测）；
// 数据面=文档相对 api/wiki-steward/hindsight/*（无前导斜杠，api.js 注入 base）；加载失败如实报错不白屏。
import { computed } from 'vue'
import { statusBadges, l2View, normalizeHhmm } from '../lib/hindsight-model.js'

const props = defineProps({
  status: { type: Object, default: null },
  statusError: { type: String, default: '' },
  calendar: { type: Object, default: null },
  calendarError: { type: String, default: '' },
  actions: { type: Object, required: true },
  timeValue: { type: String, default: '' },
})
const emit = defineEmits(['sync', 'toggle', 'save-time', 'update:timeValue', 'reload'])

const badges = computed(() => (props.status === null ? [] : statusBadges(props.status)))
const l2 = computed(() => l2View(props.status?.diagnose ?? null))
const days = computed(() => props.calendar?.days ?? [])
const timeValid = computed(() => normalizeHhmm(props.timeValue) !== null)
const syncing = computed(() => props.actions.sync.status === 'running')
const toggling = computed(() => props.actions.toggle.status === 'running')
const savingTime = computed(() => props.actions.time.status === 'running')
const l1Enabled = computed(() => props.status?.enabled === true)
</script>

<template>
  <section class="ws-block" aria-label="Hindsight 同步">
    <h3 class="ws-title">Hindsight 同步</h3>
    <p class="ws-note">
      记忆→raw 机械转录链路（raw/06-hindsight/，不做语义编译）；L1 开关热改立即生效（关闭即停同步行为——手动/定时均不跑），L2 记忆插件启停只读展示；定时同步每日到点触发记忆机械转录（缺省 03:25，与 wiki-ingest 蒸馏错峰——wiki-ingest 由系统 cron 00:25 与插件 timer 双源触发、共用 flock 防重入，如需单一时间源请运维侧停用该 cron 行）。本面板为 Hindsight 配置（同步开关/定时开关/执行时间）的唯一写入口（R-29）。
    </p>

    <!-- ① 状态条：diagnose/sync_status 官方口径徽标（取不到=未知，不编造） -->
    <div class="ws-hs-badges" data-hs-role="status-bar">
      <span
        v-for="b in badges"
        :key="b.key"
        class="ws-hs-badge"
        :class="`ws-hs-badge-${b.tone}`"
        :data-hs-badge="b.key"
      >{{ b.label }}</span>
      <span v-if="status === null && !statusError" class="ws-note">状态加载中…</span>
    </div>
    <p v-if="statusError" class="ws-error">{{ statusError }}</p>
    <p v-for="(w, i) in status?.warnings ?? []" :key="`warn-${i}`" class="ws-error">{{ w }}</p>

    <!-- ② 立即同步按钮：POST hindsight/sync（detached 单飞，回执 note 如实原文） -->
    <div class="ws-actions">
      <button
        class="ws-btn ws-btn-primary"
        type="button"
        data-hs-role="sync-button"
        :disabled="syncing || status === null"
        @click="emit('sync')"
      >{{ syncing ? '同步中…' : '立即同步' }}</button>
      <button class="ws-btn ws-btn-ghost" type="button" data-hs-role="reload" @click="emit('reload')">刷新状态</button>
    </div>
    <p v-if="actions.sync.message" class="ws-status" role="status">{{ actions.sync.message }}</p>

    <!-- ③ 同步日历：按日计数条（sync-log dateKey 聚合，非全尺寸日历网格） -->
    <h4 class="ws-subtitle">同步日历（按日计数条）</h4>
    <div class="ws-hs-calendar" data-hs-role="sync-calendar">
      <div v-for="d in days" :key="d.dateKey" class="ws-hs-day" :data-hs-day="d.dateKey">
        <span class="ws-hs-day-key">{{ d.dateKey }}</span>
        <span class="ws-hs-bar-track">
          <span class="ws-hs-bar" :style="{ width: `${d.pct}%` }"></span>
        </span>
        <span class="ws-hs-day-count">{{ d.facts }} 条 / {{ d.runs }} 次</span>
      </div>
      <p v-if="days.length === 0" class="ws-note">暂无同步记录（同步后此处按日显示计数条）。</p>
    </div>
    <p v-if="calendarError" class="ws-error">{{ calendarError }}</p>
    <p v-if="calendar && calendar.dropped > 0" class="ws-note">
      同步日志 {{ calendar.dropped }} 行时间戳畸形未计入日历（如实计数，不静默丢弃）。
    </p>

    <!-- ④ HH:MM 同步时间输入：hindsight.sync.schedule.time 热改（settings 四处同步面） -->
    <h4 class="ws-subtitle">同步时间（HH:MM，缺省 03:25）</h4>
    <div class="ws-hs-time-row">
      <input
        class="ws-input"
        type="time"
        step="60"
        data-hs-role="sync-time"
        :value="timeValue"
        aria-label="同步时间 HH:MM"
        @input="emit('update:timeValue', $event.target.value)"
      />
      <button
        class="ws-btn ws-btn-ghost"
        type="button"
        data-hs-role="time-save"
        :disabled="savingTime || !timeValid"
        @click="emit('save-time', timeValue)"
      >{{ savingTime ? '保存中…' : '保存同步时间' }}</button>
      <span v-if="!timeValid" class="ws-error">时间须为 HH:MM（00:00–23:59）</span>
    </div>
    <p v-if="actions.time.message" class="ws-status" role="status">{{ actions.time.message }}</p>

    <!-- ⑤ L1 启停开关：hindsight.enabled 热改（POST hindsight/toggle），立即生效 -->
    <h4 class="ws-subtitle">L1 同步启停（热改立即生效）</h4>
    <div class="ws-hs-switch-row">
      <input
        class="ws-hs-switch"
        type="checkbox"
        role="switch"
        data-hs-role="l1-toggle"
        :checked="l1Enabled"
        :disabled="toggling || status === null"
        aria-label="L1 记忆同步开关"
        @change="emit('toggle', $event.target.checked)"
      />
      <span class="ws-note">{{ l1Enabled ? '同步已启用（手动/定时均生效）' : '同步已停用（手动/定时均不跑）' }}</span>
    </div>
    <p v-if="actions.toggle.message" class="ws-status" role="status">{{ actions.toggle.message }}</p>

    <!-- ⑥ L2 只读「⏳ 待重启」徽标展示区（写按钮后置不做） -->
    <h4 class="ws-subtitle">L2 记忆插件启停（只读展示）</h4>
    <div class="ws-hs-l2" data-hs-role="l2-badges">
      <span class="ws-hs-badge ws-hs-badge-warn" data-hs-l2="pending">{{ l2.badge }}</span>
      <span class="ws-hs-badge" :data-hs-l2="l2.state">{{ l2.stateLabel }}</span>
      <span class="ws-note">{{ l2.note }}</span>
    </div>
  </section>
</template>
