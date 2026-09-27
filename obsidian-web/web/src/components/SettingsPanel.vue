<script setup>
// SettingsPanel — 设置页：外网域名配置→分享链接生成（OW-US-9）。
// 链接生成=服务端单一来源（share-links.buildShareLinks）：内网=局域网 host:sharePort、外网=此处配置
// 的域名——前端零拼接（红线「禁止半路拼分享 URL」）。设置持久化=服务端 .ob-share/settings.json
//（Ruling 见 task-10-report）；端口恒取 server.sharePort 配置（本页只读展示，防双源漂移）。
// 同页面板接口统一：App 容器统一传参，未用 props 仅吸收防落 DOM 属性。
import { onMounted, ref, watch } from 'vue'
import { fetchShareSettings, postShareSettings } from '../api.js'
import VaultProfilesPanel from './VaultProfilesPanel.vue'

const props = defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  backlinks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  activePanel: { type: String, default: '' },
})

const form = ref({ externalBaseUrl: '', lanHost: '' })
const info = ref({ effectiveLanHost: '', sharePort: 3500 })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const saved = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const body = await fetchShareSettings()
    form.value = {
      externalBaseUrl: body.data.externalBaseUrl ?? '',
      lanHost: body.data.lanHost ?? '',
    }
    info.value = { effectiveLanHost: body.data.effectiveLanHost, sharePort: body.data.sharePort }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  saved.value = ''
  try {
    await postShareSettings({
      externalBaseUrl: form.value.externalBaseUrl.trim() || null,
      lanHost: form.value.lanHost.trim() || null,
    })
    saved.value = '已保存——分享页链接将按新域名生成。'
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

// 面板激活即刷新（同页切换回来数据不陈旧）
watch(() => props.activePanel, (panel) => {
  if (panel === 'settings') load()
})
onMounted(load)
</script>

<template>
  <section class="ob-prose ob-settings" aria-label="设置">
    <h2>设置</h2>
    <h3>分享链接域名（OW-US-9）</h3>
    <p class="ob-hint">
      分享链接由服务端统一生成（内网=局域网 host:端口、外网=此处配置的域名，内外网地址并列显示）。
      只收域名/origin，不含路径（示例：share.example.com 或 https://share.example.com:8443）。
    </p>
    <el-form label-width="9em" @submit.prevent="save">
      <el-form-item label="外网域名">
        <el-input
          v-model="form.externalBaseUrl"
          placeholder="share.example.com（留空=不生成外网地址）"
          aria-label="外网域名"
          clearable
        />
      </el-form-item>
      <el-form-item label="内网 host">
        <el-input
          v-model="form.lanHost"
          :placeholder="`留空=自动探测（当前：${info.effectiveLanHost || '探测中'}）`"
          aria-label="内网 host 覆写"
          clearable
        />
      </el-form-item>
      <el-form-item label="分享端口">
        <el-input :model-value="String(info.sharePort)" disabled aria-label="分享端口（server.sharePort 配置）" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </el-form-item>
    </el-form>
    <p v-if="error" class="ob-empty" role="alert">{{ error }}</p>
    <p v-else-if="saved" class="ob-hint" role="status">{{ saved }}</p>
    <VaultProfilesPanel :active-panel="props.activePanel" />
  </section>
</template>
