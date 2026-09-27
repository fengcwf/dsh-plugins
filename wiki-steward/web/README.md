# web/ — 设置页签 Vue 面板（构建物目录）

`web/src` 源码经 **vite 最小构建（lib 形单入口）** 产出 `web/dist/panel.js + style.css`，
构建物**入库随包分发**（git 快照安装代跑构建——禁安装期执行代码，dist 必须提交）。

- **消费方**：`lib/client.js`（dsh 客户端面，settings.plugins.tab 页签组件）动态 import
  `/wiki-steward/panel.js`，契约 `mount(el, {apiBase}) → {unmount()}`（见 `src/panel.js`）。
- **服务面**：宿主 `lib/ingest-routes.js` 把 `web/dist` 挂 `/wiki-steward/` 前缀（静态围栏）。
- **纪律**：lib/ 零构建不变（本目录才引构建器）；组件 ≤300 行、禁 v-if 重交互（ARC-6 同款）；
  逻辑全落 `src/lib/*.js` 纯模块（node --test 直测），.vue 只做展示（容器/展示分离）。
- **构建**：`pnpm install && npm run build`（devDeps：vue / @vitejs/plugin-vue / vite——
  kb/obsidian-web web/ 惯例；不引 element-plus，见 vite.config.js 选型注释）。
