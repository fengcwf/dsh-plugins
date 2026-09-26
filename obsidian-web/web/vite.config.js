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
  },
})
