<script setup>
// SettingsPanel — 设置页：外网域名配置→分享链接生成（OW-US-9）。
// 链接生成=服务端单一来源（share-links.buildShareLinks）：内网=局域网 host:sharePort、外网=此处配置
// 的域名——前端零拼接（红线「禁止半路拼分享 URL」）。设置持久化=服务端 .ob-share/settings.json
//（Ruling 见 task-10-report）；端口取 server.sharePort 配置（本页只读展示，防双源漂移）。
// 同域模式（0.2.4）：sharePort=null = 分享面挂 dsh 主入口同域运行、**无独立端口**——本页不再有任何
// 端口初值假设（旧初值写死的具体端口在生产拓扑上是 login-gate 门禁端口，会被误读成分享端口）。
// 展示口径一律由服务端 sharePort 派生：null → 「同域模式（无独立端口）」，number → 该端口。
// 同页面板接口统一：App 容器统一传参，未用 props 仅吸收防落 DOM 属性。
import { ElButton, ElForm, ElFormItem, ElInput } from '../element-plus.js'
import { onMounted, ref, watch } from 'vue'
import { fetchShareSettings, postShareSettings } from '../api.js'
import VaultProfilesPanel from './VaultProfilesPanel.vue'

const props = defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  backlinks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  recents: { type: Array, default: () => [] },
  activePanel: { type: String, default: '' },
  readView: { type: Object, default: null }, // 未用 props 仅吸收防落 DOM 属性（同页面板接口统一）
})

const form = ref({ externalBaseUrl: '', lanHost: '' })
// sharePort 初值=null（未加载到即为「同域模式」），绝不硬编码具体端口（生产拓扑上那个值是门禁端口）
// ——值只由服务端下发
const info = ref({ effectiveLanHost: '', sharePort: null })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const saved = ref('')

/**
 * 分享端口展示口径（服务端派生，前端零假设）：
 *   number → 该端口字符串；null/undefined/非法 → 同域模式文案（面挂 dsh 主入口，无独立端口）。
 */
function sharePortLabel(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535
    ? String(port)
    : '同域模式（无独立端口）'
}

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
      分享链接由服务端统一生成（内网=局域网 host:端口，**同域模式下仅路径**、由当前 dsh 主入口补出完整地址；外网=此处配置的域名，内外网地址并列显示）。
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
        <el-input :model-value="sharePortLabel(info.sharePort)" disabled aria-label="分享端口（server.sharePort 配置；null=同域模式无独立端口）" />
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
