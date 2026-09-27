<script setup>
// ShareCreateDialog — 新建分享弹层（OW-US-8 逐条显式生成流程落管理页；OW-INV-1 写必密码 UI 双保险）。
// 载荷复核全在 web/src/lib/share-view.js buildCreatePayload（组件零业务逻辑，单测锁形）；
// 写权限切「无密码」即自动兜底「自动生成」（服务端 createShare 不变量再复核一道）。
import { computed, ref, watch } from 'vue'
import { buildCreatePayload } from '../lib/share-view.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  defaultTarget: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'cancel'])

function blank() {
  return { target: '', role: 'read', passwordMode: 'none', password: '', ttlDays: 7, oneShot: false }
}
const form = ref(blank())

watch(
  () => props.visible,
  (v) => {
    if (v) form.value = { ...blank(), target: props.defaultTarget }
  },
)
watch(
  () => form.value.role,
  (role) => {
    if (role === 'write' && form.value.passwordMode === 'none') form.value.passwordMode = 'auto'
  },
)

const payload = computed(() => buildCreatePayload(form.value))
const needsPassword = computed(() => form.value.role === 'write')

function submit() {
  if (payload.value !== null) emit('submit', payload.value) // 复核双保险：未过载荷复核不出载荷
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="新建分享（逐条显式生成，默认不对外）"
    width="min(560px, 92vw)"
    append-to-body
    :show-close="false"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <el-form label-width="7em" @submit.prevent="submit">
      <el-form-item label="目标路径">
        <el-input v-model="form.target" placeholder="vault 内相对路径，如 notes/a.md" aria-label="分享目标路径" />
      </el-form-item>
      <el-form-item label="权限">
        <el-radio-group v-model="form.role">
          <el-radio value="read">只读</el-radio>
          <el-radio value="write">可写</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="访问密码">
        <el-radio-group v-model="form.passwordMode">
          <el-radio value="none" :disabled="needsPassword">无密码</el-radio>
          <el-radio value="auto">自动生成</el-radio>
          <el-radio value="custom">自定义</el-radio>
        </el-radio-group>
        <p v-show="needsPassword" class="ob-hint">写权限必须设访问密码（OW-INV-1）：已自动改为自动生成（可改）。</p>
      </el-form-item>
      <el-form-item v-show="form.passwordMode === 'custom'" label="密码">
        <el-input v-model="form.password" type="password" show-password aria-label="自定义访问密码" />
      </el-form-item>
      <el-form-item label="有效期(天)">
        <el-input-number v-model="form.ttlDays" :min="1" :max="3650" aria-label="有效期天数" />
      </el-form-item>
      <el-form-item label="一次性">
        <el-switch v-model="form.oneShot" aria-label="一次性链接（首次访问后失效）" />
      </el-form-item>
    </el-form>
    <p v-show="props.error" class="ob-empty" role="alert">{{ props.error }}</p>
    <template #footer>
      <el-button @click="emit('cancel')">取消</el-button>
      <el-button type="primary" :disabled="payload === null || props.busy" :loading="props.busy" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>
