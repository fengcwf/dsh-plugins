// vite 构建配置（web/ 源码 → web/dist 构建物随包分发；lib/ 保持零构建——kb/obsidian-web 同款惯例）。
// 最小构建选型（feature-ingest-panel 报告写明）：lib 形单入口（ES）→ dist/panel.js + dist/style.css，
// Vue 运行时打进构建物（devDeps），宿主运行时零第三方请求；不引 element-plus（面板纯展示+两按钮，
// 控件需求为零，样式对齐 dsh token）。消费方=lib/client.js 页签组件动态 import（mount/unmount 契约）。
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false, // 单 style.css（panel.js mount 时按 import.meta.url 就近注入）
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/panel.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'panel.js',
    },
    rollupOptions: {
      output: {
        // CSS 落名钉死 style.css（vite lib 形默认落 <pkg>.css——与 panel.js 运行时定位对齐）
        assetFileNames: 'style.css',
      },
    },
  },
})
