<script setup>
// ShareAccessDialog — 密码与权限调整弹层（OW-US-10）：载荷复核 buildRolePayload（组件零业务逻辑）。
// ⑤ 不变量 UI 双保险：升写必须带密码（自定义/自动生成或已有密码），写不可清密码——服务端
// updateShareRole/updateSharePassword（T8 OW-INV-1）再复核一道。
import { computed, ref, watch } from 'vue'
import { buildRolePayload, describeRole } from '../lib/share-view.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  share: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'cancel'])

const form = ref({ role: 'read', passwordMode: 'none', password: '' })

watch(
  () => props.visible,
  (v) => {
    if (v) form.value = { role: props.share?.role ?? 'read', passwordMode: 'none', password: '' }
  },
)

const hasPassword = computed(() => props.share?.hasPassword === true)
const payload = computed(() => buildRolePayload({ ...form.value, hasPassword: hasPassword.value }))
const upgradingToWrite = computed(() => form.value.role === 'write' && props.share?.role !== 'write')

function submit() {
  if (payload.value !== null) emit('submit', payload.value) // 复核双保险：未过载荷复核不出载荷
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="密码与权限调整"
    width="min(560px, 92vw)"
    append-to-body
    :show-close="false"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <p>
      目标：<code class="ob-share-target">{{ props.share?.target }}</code>
      ｜当前权限：{{ describeRole(props.share?.role) }}
      ｜当前密码：{{ hasPassword ? '已设置' : '无' }}
    </p>
    <el-form label-width="7em" @submit.prevent="submit">
      <el-form-item label="权限">
        <el-radio-group v-model="form.role">
          <el-radio value="read">只读</el-radio>
          <el-radio value="write">可写</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="访问密码">
        <el-radio-group v-model="form.passwordMode">
          <el-radio value="none">不修改</el-radio>
          <el-radio value="auto">重新生成</el-radio>
          <el-radio value="custom">自定义</el-radio>
          <el-radio value="clear" :disabled="form.role === 'write' || !hasPassword">清除</el-radio>
        </el-radio-group>
        <p v-show="upgradingToWrite && !hasPassword" class="ob-hint">
          升为写权限必须设访问密码（OW-INV-1）：请选择重新生成或自定义。
        </p>
        <p v-show="form.role === 'write' && form.passwordMode === 'clear'" class="ob-hint">写权限必须保留访问密码，不可清除。</p>
      </el-form-item>
      <el-form-item v-show="form.passwordMode === 'custom'" label="密码">
        <el-input v-model="form.password" type="password" show-password aria-label="自定义访问密码" />
      </el-form-item>
    </el-form>
    <p v-show="props.error" class="ob-empty" role="alert">{{ props.error }}</p>
    <template #footer>
      <el-button @click="emit('cancel')">取消</el-button>
      <el-button type="primary" :disabled="payload === null || props.busy" :loading="props.busy" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
