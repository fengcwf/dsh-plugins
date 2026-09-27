<script setup>
import { ElMenu, ElMenuItem } from '../element-plus.js'
// SideMenu — 侧栏菜单：中央列面板切换（OW-US-14 同页面板，不跳新页）
defineProps({ active: { type: String, default: 'read' } })
const emit = defineEmits(['select'])

const items = [
  { key: 'read', label: '阅读' },
  { key: 'edit', label: '编辑' },
  { key: 'search', label: '搜索' },
  { key: 'backlinks', label: '反链' },
  { key: 'share', label: '分享' },
  { key: 'settings', label: '设置' },
]
</script>

<template>
  <nav class="ob-menu" aria-label="面板切换">
    <el-menu :default-active="active" @select="emit('select', $event)">
      <el-menu-item v-for="item in items" :key="item.key" :index="item.key">
        {{ item.label }}
      </el-menu-item>
    </el-menu>
  </nav>
</template>
