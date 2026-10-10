<script setup>
// SharePanel — 分享管理面板（中央列同页面板一格，OW-US-10 / OW-US-14）：
// 列表/查看计数/撤销/密码与权限调整；链接=服务端下发 links（内外网地址都显示，前端零拼接——红线）。
// 计数展示口径：查看计数=每分享条目访客访问成功次数（accessCount）；对外脱敏计数恒=痕迹计数
//（T9 分野）——本面板无脱敏计数列。
// 同页面板接口统一：App 容器统一传参，未用 props 仅吸收防落 DOM 属性。
// C3（2026-10-09）：目录也可分享——树右键「分享」经 `shareRequest` prop 下达到本面板，
//   复用既有 ShareCreateDialog + buildCreatePayload 链路（零第二套创建流程）；
//   目录与笔记**同路**（后端 createShare 据 lstat 自判 targetType，前端零类型分流）。
import { ElButton, ElPopconfirm, ElTable, ElTableColumn, ElTag } from '../element-plus.js'
import { computed, onMounted, ref, watch } from 'vue'
import { fetchShares, postShareCreate, postShareRevoke, postShareRole } from '../api.js'
import { describeRole, formatTime, statusLabel, shareRowView, targetTypeLabel } from '../lib/share-view.js'
import PanelHeader from './PanelHeader.vue'
import ShareLinksCell from './ShareLinksCell.vue'
import ShareCreateDialog from './ShareCreateDialog.vue'
import ShareCreateResultDialog from './ShareCreateResultDialog.vue'
import ShareAccessDialog from './ShareAccessDialog.vue'

const props = defineProps({
  path: { type: String, default: '' },
  rendered: { type: Object, default: null },
  backlinks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  recents: { type: Array, default: () => [] },
  activePanel: { type: String, default: '' },
  readView: { type: Object, default: null }, // 未用 props 仅吸收防落 DOM 属性（同页面板接口统一）
  // C3：外部（树右键「分享」）下达的待分享目标 {path, kind}（kind='file'|'dir'）——到达即开创建弹层
  shareRequest: { type: Object, default: null },
})

const shares = ref([])
const loading = ref(false)
const error = ref('')
const actionBusy = ref(false)
const actionError = ref('')
const createVisible = ref(false)
const created = ref(null)
const accessTarget = ref(null)

// C3：创建目标单一来源（缺陷修复，见下方注释块）——computed 先于 watch 声明，避免 TDZ 时序陷阱
const defaultTarget = computed(() => props.shareRequest?.path || props.path || '')
// C3：管理面行视图模型——形态规范化与兜底形全在 lib/share-view.js 纯函数（本组件零形态判断）
const rows = computed(() => shares.value.map(shareRowView))

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

// C3：树右键「分享」下达 → 切到分享面板并打开创建弹层（默认目标=该节点路径，目录与笔记同路）。
// 复用既有 ShareCreateDialog（载荷复核仍是 buildCreatePayload），零第二套创建流程；
// 目标经 `default-target` 走弹层既有 watch（visible 转 true 时以 defaultTarget 重置表单），
// 故此处只需开弹层——不自建表单态（单一来源，避免两处表单漂移）。
//
// 创建目标单一来源（C3 缺陷修复）：弹层 `visible` 与 `default-target` 在同一渲染批内变更，
// 故 defaultTarget 必须**同批已是请求目标**——不能读 ref 快照（旧值='' 或面板 path=打开中的笔记），
// 否则弹层按旧值重置表单 → 目录分享出现「弹层目标为空/笔记路径」的空缝（右键分享不落 target）。
// fallback 链：树右键请求目标 > 面板已打开笔记 path > 空（弹层仍可手填——既有能力零回退）。
//
// ⚠️ `immediate: true` 是必需的（C3 真渲染实测）：本面板经 `<component :is>` **懒挂载**——
// 树右键那一刻「面板挂载」与「shareRequest 到达」发生在同一渲染批，watch 建立时值已是非 null，
// 非 immediate 的 watch 永远观察不到「变化」→ 弹层永不打开（正是本卡空缝的第二段根因）。
// `consumedRequest` 防重复开：同一个请求对象只消费一次（切面板回来不重开弹层）。
const consumedRequest = ref(null)
watch(
  () => props.shareRequest,
  (req) => {
    if (!req || req === consumedRequest.value) return
    consumedRequest.value = req
    actionError.value = ''
    createVisible.value = true
  },
  { immediate: true },
)

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
    <PanelHeader title="分享管理">
      <template #actions>
        <el-button type="primary" @click="createVisible = true">新建分享</el-button>
        <el-button class="ob-btn-ghost" :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PanelHeader>
    <p class="ob-hint">
      查看计数=每条分享的访客访问成功次数；撤销即时失效。分享链接由服务端统一生成——内网/外网地址并列显示（外网域名在「设置」页配置）。
      <span v-if="props.shareRequest?.kind === 'dir'">当前待分享=目录（访客可浏览子项与子路径，与笔记分享同链路）。</span>
    </p>
    <p v-if="error" class="ob-empty" role="alert">{{ error }}</p>
    <el-table :data="rows" empty-text="暂无分享（默认不对外，逐条显式生成）">
      <el-table-column label="目标" min-width="150">
        <template #default="scope">
          <code class="ob-share-target">{{ scope.row.target }}</code>
          <el-tag size="small">{{ targetTypeLabel(scope.row.targetType) }}</el-tag>
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
      :default-target="defaultTarget"
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
