<script setup>
// SharePanel — 分享管理面板（中央列同页面板一格，OW-US-10 / OW-US-14）：
// 列表/查看计数/撤销/密码与权限调整；链接=服务端下发 links（内外网地址都显示，前端零拼接——红线）。
// 计数展示口径：查看计数=每分享条目访客访问成功次数（accessCount）；对外脱敏计数恒=痕迹计数
//（T9 分野）——本面板无脱敏计数列。
// 同页面板接口统一：App 容器统一传参，未用 props 仅吸收防落 DOM 属性。
import { onMounted, ref, watch } from 'vue'
import { fetchShares, postShareCreate, postShareRevoke, postShareRole } from '../api.js'
import { describeRole, formatTime, statusLabel } from '../lib/share-view.js'
import ShareLinksCell from './ShareLinksCell.vue'
import ShareCreateDialog from './ShareCreateDialog.vue'
import ShareCreateResultDialog from './ShareCreateResultDialog.vue'
import ShareAccessDialog from './ShareAccessDialog.vue'

const props = defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  backlinks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  activePanel: { type: String, default: '' },
})

const shares = ref([])
const loading = ref(false)
const error = ref('')
const actionBusy = ref(false)
const actionError = ref('')
const createVisible = ref(false)
const created = ref(null)
const accessTarget = ref(null)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const body = await fetchShares()
    shares.value = body.data.shares
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// 面板激活即刷新（同页切换回来数据不陈旧）
watch(() => props.activePanel, (panel) => {
  if (panel === 'share') refresh()
})
onMounted(refresh)

function openAccess(share) {
  actionError.value = ''
  accessTarget.value = share
}

function closeCreate() {
  createVisible.value = false
  actionError.value = ''
}

function closeAccess() {
  accessTarget.value = null
  actionError.value = ''
}

async function onCreate(payload) {
  actionBusy.value = true
  actionError.value = ''
  try {
    const body = await postShareCreate(payload)
    created.value = body.data // {share, password}——password 恰一次展示（ShareCreateResultDialog）
    createVisible.value = false
    await refresh()
  } catch (e) {
    actionError.value = e.message
  } finally {
    actionBusy.value = false
  }
}

async function onRevoke(share) {
  actionBusy.value = true
  error.value = ''
  try {
    await postShareRevoke(share.token) // 撤销即时失效（guest 面同形 404，OW-INV-2b）
    await refresh()
  } catch (e) {
    error.value = e.message
  } finally {
    actionBusy.value = false
  }
}

async function onAccess(payload) {
  if (!accessTarget.value) return
  actionBusy.value = true
  actionError.value = ''
  try {
    await postShareRole(accessTarget.value.token, payload)
    accessTarget.value = null
    await refresh()
  } catch (e) {
    actionError.value = e.message
  } finally {
    actionBusy.value = false
  }
}
</script>

<template>
  <section class="ob-prose ob-share" aria-label="分享管理">
    <h2>分享管理</h2>
    <p class="ob-hint">
      查看计数=每条分享的访客访问成功次数；撤销即时失效。分享链接由服务端统一生成——内网/外网地址并列显示（外网域名在「设置」页配置）。
    </p>
    <div class="ob-share-toolbar">
      <el-button type="primary" @click="createVisible = true">新建分享</el-button>
      <el-button :loading="loading" @click="refresh">刷新</el-button>
    </div>
    <p v-if="error" class="ob-empty" role="alert">{{ error }}</p>
    <el-table :data="shares" empty-text="暂无分享（默认不对外，逐条显式生成）">
      <el-table-column label="目标" min-width="150">
        <template #default="scope">
          <code class="ob-share-target">{{ scope.row.target }}</code>
          <el-tag size="small">{{ scope.row.targetType === 'dir' ? '目录' : '笔记' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="权限" width="76">
        <template #default="scope">{{ describeRole(scope.row.role) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="88">
        <template #default="scope">{{ statusLabel(scope.row) }}</template>
      </el-table-column>
      <el-table-column label="查看计数" width="88">
        <template #default="scope">{{ scope.row.accessCount ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="最近访问" width="150">
        <template #default="scope">{{ formatTime(scope.row.lastAccessAt) }}</template>
      </el-table-column>
      <el-table-column label="链接（内网/外网）" min-width="260">
        <template #default="scope">
          <ShareLinksCell :links="scope.row.links" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170">
        <template #default="scope">
          <el-button size="small" @click="openAccess(scope.row)">密码/权限</el-button>
          <el-popconfirm title="撤销后链接立即失效，确认？" width="220" @confirm="onRevoke(scope.row)">
            <template #reference>
              <el-button size="small" type="danger" :disabled="scope.row.revoked === true">撤销</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    <ShareCreateDialog
      :visible="createVisible"
      :default-target="props.path"
      :busy="actionBusy"
      :error="actionError"
      @submit="onCreate"
      @cancel="closeCreate"
    />
    <ShareCreateResultDialog :visible="created !== null" :result="created" @close="created = null" />
    <ShareAccessDialog
      :visible="accessTarget !== null"
      :share="accessTarget"
      :busy="actionBusy"
      :error="actionError"
      @submit="onAccess"
      @cancel="closeAccess"
    />
  </section>
</template>
