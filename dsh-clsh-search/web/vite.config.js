// vite 构建配置（web/ 源码 → web/dist 构建物入库随包；lib/ 保持零构建纯 ESM）。
// 形制 = wiki-steward/web/vite.config.js（lib 形单入口 ES）：dist/main.js + dist/style.css，
// Vue 运行时打进构建物（web/package.json devDeps），宿主运行时零第三方网络请求（K-8 / TECH.md §2）。
// 不引 element-plus：优先级排序走 DESIGN.md §5 明示的「上移/下移按钮」降级路径，控件需求为零。
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// lib 模式不自动替换 process.env.NODE_ENV，宿主前端无 process 垫片——必须 define 成字面量，
// 否则构建物保留 process.env.NODE_ENV，浏览器 import() 求值即 ReferenceError（wiki-steward T-F1 教训）。
export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false, // 单 style.css（main.js mount 时按 import.meta.url 就近注入）
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/main.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        // CSS 落名钉死 style.css（与 main.js 运行时定位对齐）
        assetFileNames: 'style.css',
      },
    },
  },
}))
