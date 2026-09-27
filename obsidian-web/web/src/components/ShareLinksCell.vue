<script setup>
// ShareLinksCell — 分享链接展示格（OW-US-9：内外网地址都显示）。
// 红线「禁止半路拼分享 URL」：前端零拼接——只渲染服务端下发 links（path/internal/external），
// 分享路径段只存在于服务端（test/share-links.test.mjs web/src 全树零命中锁形）。
import { ref } from 'vue'
import { linkRows } from '../lib/share-view.js'

const props = defineProps({ links: { type: Object, default: null } })

const copied = ref('')
const copyError = ref('')

async function copy(url, kind) {
  if (!url) return
  copied.value = ''
  copyError.value = ''
  try {
    await navigator.clipboard.writeText(url)
    copied.value = kind
  } catch {
    copyError.value = '复制失败，请手动选中复制'
  }
}
</script>

<template>
  <div class="ob-share-links">
    <div v-for="row in linkRows(props.links)" :key="row.kind" class="ob-share-link-row">
      <span class="ob-share-link-kind">{{ row.kind }}</span>
      <template v-if="row.url">
        <code class="ob-share-link-url">{{ row.url }}</code>
        <el-button size="small" text @click="copy(row.url, row.kind)">{{ copied === row.kind ? '已复制' : '复制' }}</el-button>
      </template>
      <span v-else class="ob-hint">未配置外网域名（设置页配置后显示）</span>
    </div>
    <p v-show="copyError" class="ob-empty" role="alert">{{ copyError }}</p>
  </div>
</template>
