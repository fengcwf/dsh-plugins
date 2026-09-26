<script setup>
// ConflictDialog — 保存冲突三选弹层（OW-INV-3：覆盖/重载/对比，必须显式选择）
// 强制显式选择：无关闭通道（不给「随手关掉静默丢稿」的机会）；选择全数上抛 App（save-client 状态机）。
// 对比面=diffLines 行级 diff（盘上内容 vs 我方内容），组件零业务逻辑。
import { computed } from 'vue'
import { diffLines } from '../lib/diff.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  conflict: { type: Object, default: null },
  comparing: { type: Boolean, default: false },
})
const emit = defineEmits(['choose'])

const rows = computed(() => {
  const diffUndo = props.conflict?.diffUndo
  if (!diffUndo) return []
  return diffLines(diffUndo.before.content, diffUndo.incoming.content)
})
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="保存冲突"
    width="min(720px, 92vw)"
    append-to-body
    :show-close="false"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <p class="ob-conflict-lead">
      该笔记在你编辑期间被他人（或桌面端 Obsidian）修改过。请选择处理方式——选择前不会落盘，双方内容都不会丢。
    </p>
    <div class="ob-conflict-actions">
      <el-button type="primary" @click="emit('choose', 'overwrite')">覆盖（用我的内容保存）</el-button>
      <el-button @click="emit('choose', 'reload')">重载（放弃我的改动）</el-button>
      <el-button :aria-pressed="String(props.comparing)" @click="emit('choose', 'compare')">对比</el-button>
    </div>
    <div v-show="props.comparing" class="ob-conflict-diff" aria-label="内容对比">
      <p class="ob-conflict-legend">红=盘上内容（删除行）　绿=我方内容（新增行）</p>
      <ol class="ob-diff-list">
        <li v-for="(row, i) in rows" :key="i" :class="`ob-diff-${row.type}`">{{ row.text }}</li>
      </ol>
    </div>
  </el-dialog>
</template>
