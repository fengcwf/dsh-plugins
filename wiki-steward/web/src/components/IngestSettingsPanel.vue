<script setup>
// IngestSettingsPanel — 「相关设置」只读展示（本波可改项最小集=∅：用户需求是"查看"；
// 改 config=走 cordis config 热改语义，不进本面板）。展示模型纯函数在 lib/settings-model.js。
// vaultRoot / write.readOnly 展示带 INV-7 注记（默认只读语义勿动）。
import { computed } from 'vue'
import { settingsGroups } from '../lib/settings-model.js'

const props = defineProps({
  settings: { type: Object, default: null },
  error: { type: String, default: '' },
})

const groups = computed(() => (props.settings === null ? [] : settingsGroups(props.settings)))
</script>

<template>
  <section class="ws-block" aria-label="相关设置">
    <h3 class="ws-title">相关设置（只读展示）</h3>
    <p v-if="error" class="ws-error">{{ error }}</p>
    <p v-if="settings === null && !error" class="ws-note">设置加载中…</p>
    <template v-for="g in groups" :key="g.title">
      <h4 class="ws-subtitle">{{ g.title }}</h4>
      <dl class="ws-rows">
        <template v-for="row in g.rows" :key="row.key">
          <dt class="ws-row-key">{{ row.key }}</dt>
          <dd class="ws-row-val">
            <span class="ws-row-value">{{ row.value }}</span>
            <span class="ws-row-note">{{ row.note }}</span>
          </dd>
        </template>
      </dl>
    </template>
  </section>
</template>
