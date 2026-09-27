<script setup>
// VaultProfilesPanel — 设置页 vault 目录档案（OW-US-13）：默认当前目录 + 任意已挂载 SMB/NFS
// 路径 + 健康检查（可读/可写/延迟三探针）+ 切换（重启生效提示——T11 热改可解释拒不冒充）。
// 换 vault 提示（T10）：switchHint() 纯函数锁形（外网域名等随 vault 各配）；载荷复核=
// validateProfileForm 纯函数双保险（服务端同判）；组件 ≤300 行（ARC-6）、行内表单+popconfirm
// （禁 v-if 重交互惯例）；色彩全走 --dsw-*（ARC-5）。
import { computed, onMounted, ref, watch } from 'vue'
import {
  fetchVaultProfiles, addVaultProfile, deleteVaultProfile, checkVaultProfileHealth, activateVaultProfile,
} from '../api.js'
import { switchHint, healthBadge, probeSummary, validateProfileForm } from '../lib/vault-profiles-view.js'

const props = defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  backlinks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  activePanel: { type: String, default: '' },
})

const hint = computed(() => switchHint())
const profiles = ref([])
const activeProfileId = ref('default')
const form = ref({ name: '', path: '' })
const healthById = ref({})
const loading = ref(false)
const saving = ref(false)
const checkingId = ref('')
const activatingId = ref('')
const error = ref('')
const saved = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const body = await fetchVaultProfiles()
    profiles.value = body.data.profiles
    activeProfileId.value = body.data.activeProfileId
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function add() {
  error.value = ''
  saved.value = ''
  const check = validateProfileForm(form.value) // 载荷复核不过不出载荷（双保险）
  if (!check.ok) {
    error.value = check.error
    return
  }
  saving.value = true
  try {
    await addVaultProfile(form.value.name.trim(), form.value.path.trim())
    form.value = { name: '', path: '' }
    saved.value = '已添加档案。'
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove(profile) {
  error.value = ''
  saved.value = ''
  try {
    await deleteVaultProfile(profile.id)
    saved.value = `已删除档案「${profile.name}」。`
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function check(profile) {
  error.value = ''
  checkingId.value = profile.id
  try {
    const body = await checkVaultProfileHealth({ id: profile.id })
    healthById.value = { ...healthById.value, [profile.id]: body.data.health }
  } catch (e) {
    error.value = e.message
  } finally {
    checkingId.value = ''
  }
}

async function activate(profile) {
  error.value = ''
  saved.value = ''
  activatingId.value = profile.id
  try {
    const body = await activateVaultProfile(profile.id)
    // T11：restartRequired:true——运行期根不热改；提示=重启生效 + 各配（T10）
    saved.value = body.data.message
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    activatingId.value = ''
  }
}

// 面板激活即刷新（同页切换回来数据不陈旧）
watch(() => props.activePanel, (panel) => {
  if (panel === 'settings') load()
})
onMounted(load)
</script>

<template>
  <section class="ob-prose ob-vault-profiles" aria-label="vault 目录档案">
    <h3>vault 目录档案（OW-US-13）</h3>
    <p class="ob-hint">{{ hint }}</p>

    <el-table :data="profiles" v-loading="loading" aria-label="vault 档案列表">
      <el-table-column label="名称" min-width="8em">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
          <el-tag v-if="row.id === activeProfileId" size="small" type="info">激活</el-tag>
          <el-tag v-if="row.isCurrent" size="small">当前目录</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="路径" min-width="16em">
        <template #default="{ row }">
          <code>{{ row.path }}</code>
        </template>
      </el-table-column>
      <el-table-column label="健康（可读/可写/延迟）" min-width="14em">
        <template #default="{ row }">
          <template v-if="healthById[row.id]">
            <el-tag size="small" :type="healthBadge(healthById[row.id].status).type">
              {{ healthBadge(healthById[row.id].status).label }}
            </el-tag>
            <span class="ob-hint">{{ probeSummary(healthById[row.id]) }}</span>
          </template>
          <span v-else class="ob-hint">未检查</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="14em">
        <template #default="{ row }">
          <el-button size="small" :loading="checkingId === row.id" @click="check(row)">健康检查</el-button>
          <el-button
            size="small"
            type="primary"
            plain
            :loading="activatingId === row.id"
            :disabled="row.id === activeProfileId"
            @click="activate(row)"
          >切换</el-button>
          <el-popconfirm
            v-if="row.removable"
            :title="`删除档案「${row.name}」？`"
            @confirm="remove(row)"
          >
            <template #reference>
              <el-button size="small" type="danger" plain>删除</el-button>
            </template>
          </el-popconfirm>
          <el-button v-else size="small" disabled>默认档案</el-button>
        </template>
      </el-table-column>
    </el-table>

    <h3>添加档案</h3>
    <p class="ob-hint">可配任意已挂载 SMB/NFS 路径（挂载可暂缺——健康检查如实报可读/可写/延迟）。</p>
    <el-form label-width="6em" inline @submit.prevent="add">
      <el-form-item label="名称">
        <el-input
          v-model="form.name"
          placeholder="例如：SMB 仓"
          aria-label="档案名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="路径">
        <el-input
          v-model="form.path"
          placeholder="/mnt/nfs/vault（绝对路径）"
          aria-label="档案路径"
          clearable
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="add">添加</el-button>
      </el-form-item>
    </el-form>
    <p v-if="error" class="ob-empty" role="alert">{{ error }}</p>
    <p v-else-if="saved" class="ob-hint" role="status">{{ saved }}</p>
  </section>
</template>
