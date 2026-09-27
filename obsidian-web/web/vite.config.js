// vite 构建配置（web/ 源码 → web/dist 构建物随包分发，lib/ 仍零构建纯 ESM）
// base './'：UI 挂 /ob/ 前缀下，构建资产必须相对引用（绝对 /assets/ 会 404）。
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // 显式分包边界（T13 分包选型）：element-plus（按需装配后的用到子集）独立 vendor chunk，
        // 与 app/vue 入口分开——主入口 chunk ≤500KB 目标 + 边界可断言（test/web-bundle.test.mjs）
        manualChunks(id) {
          if (id.includes('node_modules/element-plus')) return 'element-plus'
          if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')) return 'vue'
          return undefined
        },
      },
    },
  },
})
