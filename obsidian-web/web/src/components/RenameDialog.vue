<script setup>
// RenameDialog — 改名/移动弹层（T13 rename UI 入口 / T5 交接）：
// 载荷复核 buildRenamePayload（组件零业务逻辑，纯函数锁形）；冲突（target-exists）给显式
// 「覆盖目标」途径（OW-INV-5 永不静默覆盖）；warnings 留痕如实展示（T5 warnings 面）。
// ARC-6：el-dialog 重交互件恒挂载（v-if 由父层 :visible 控制，弹层本身不销毁）。
import { computed, ref, watch } from 'vue'
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput } from '../element-plus.js'
import { buildRenamePayload } from '../lib/rename-view.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  target: { type: Object, default: null }, // {path, canOverwrite}
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  warnings: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'cancel'])

const to = ref('')
const overwrite = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      to.value = props.target?.path ?? ''
      overwrite.value = false
    }
  },
)

const payload = computed(() => buildRenamePayload({
  from: props.target?.path ?? '',
  to: to.value,
  overwrite: overwrite.value && props.target?.canOverwrite === true,
}))

function submit() {
  if (payload.value !== null) emit('submit', payload.value) // 复核双保险：未过载荷复核不出载荷
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="改名 / 移动"
    width="min(560px, 92vw)"
    append-to-body
    :show-close="false"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <p class="ob-rename-lead">
      原路径：<code class="ob-rename-path">{{ props.target?.path }}</code>
    </p>
    <el-form label-width="6em" @submit.prevent="submit">
      <el-form-item label="新路径">
        <el-input v-model="to" aria-label="新路径（可跨目录=移动）" placeholder="notes/新名字.md" />
      </el-form-item>
      <el-form-item v-show="props.target?.canOverwrite === true" label="目标冲突">
        <el-button
          size="small"
          :type="overwrite ? 'danger' : 'default'"
          :aria-pressed="String(overwrite)"
          @click="overwrite = !overwrite"
        >{{ overwrite ? '已选择覆盖目标' : '覆盖目标' }}</el-button>
        <span class="ob-hint">覆盖=显式替换同名文件（事务内锁内复检，永不静默覆盖）。</span>
      </el-form-item>
    </el-form>
    <ul v-if="props.warnings" class="ob-rename-warnings" aria-label="事务留痕">
      <li v-for="w in props.warnings.split('；')" :key="w">{{ w }}</li>
    </ul>
    <p v-if="props.error" class="ob-rename-error" role="alert">{{ props.error }}</p>
    <template #footer>
      <el-button @click="emit('cancel')">取消</el-button>
      <el-button
        type="primary"
        :disabled="payload === null || props.busy"
        :loading="props.busy"
        @click="submit"
      >确认改名</el-button>
    </template>
  </el-dialog>
</template>
