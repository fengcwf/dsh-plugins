<script setup>
// ShareCreateResultDialog — 创建成功展示：autoPassword 明文恰一次展示（关后服务端只存 hash）+ 内外网双地址
//（OW-US-9：链接服务端下发、前端零拼接——ShareLinksCell 只渲染 links）。
import ShareLinksCell from './ShareLinksCell.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  result: { type: Object, default: null },
})
const emit = defineEmits(['close'])
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="分享已创建（密码仅显示这一次）"
    width="min(560px, 92vw)"
    append-to-body
    :close-on-click-modal="false"
  >
    <p>
      目标：<code class="ob-share-target">{{ props.result?.share?.target }}</code>
      ｜权限：{{ props.result?.share?.role === 'write' ? '可写' : '只读' }}
    </p>
    <p v-if="props.result?.password" class="ob-share-once">
      访问密码（仅显示这一次，请立即保存）：<code>{{ props.result.password }}</code>
    </p>
    <p v-else class="ob-hint">此分享未设置访问密码。</p>
    <ShareLinksCell :links="props.result?.share?.links" />
    <template #footer>
      <el-button type="primary" @click="emit('close')">完成</el-button>
    </template>
  </el-dialog>
</template>
