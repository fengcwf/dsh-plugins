<script setup>
// DeleteConfirmDialog — 删除双确认弹层（OW-US-6 / OW-INV-5）：
//   ①点删除 ②复述目标相对路径（全等）才解锁「确认删除」；载荷经 buildDeletePayload 复核
//   （web/src/lib/delete-confirm.js 纯函数锁形，组件零业务逻辑）；服务端再复核一道（缺省拒）。
// 明示可逆：文案写清「移入 .trash，可取回」——删除=移动不是 rm（OW-INV-5 可逆本义）。
import { ElButton, ElDialog, ElInput } from '../element-plus.js'
import { computed, ref, watch } from 'vue'
import { buildDeletePayload } from '../lib/delete-confirm.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  path: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['confirm', 'cancel'])

const typed = ref('')
watch(
  () => props.visible,
  (v) => { if (v) typed.value = '' }, // 每次打开清空复述（防上次残留误确认）
)

const matched = computed(() => buildDeletePayload(props.path, typed.value) !== null)

function submit() {
  const payload = buildDeletePayload(props.path, typed.value)
  if (payload !== null) emit('confirm', payload) // 复核双保险：未匹配不出载荷
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="删除（可逆：移入回收站）"
    width="min(560px, 92vw)"
    append-to-body
    :show-close="false"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <p class="ob-delete-lead">
      即将删除 <code class="ob-delete-path">{{ props.path }}</code>
      ——删除会把该条目移入 <code>.trash/</code>（可逆，可取回，绝不直接销毁）。
    </p>
    <p class="ob-delete-lead">双确认：请逐字输入完整路径复述确认：</p>
    <el-input
      v-model="typed"
      class="ob-delete-input"
      :placeholder="props.path"
      aria-label="逐字复述目标路径以确认删除"
      @keyup.enter="submit"
    />
    <p v-show="props.error" class="ob-delete-error" role="alert">{{ props.error }}</p>
    <template #footer>
      <el-button @click="emit('cancel')">取消</el-button>
      <el-button type="danger" :disabled="!matched || props.busy" @click="submit">确认删除</el-button>
    </template>
  </el-dialog>
</template>
