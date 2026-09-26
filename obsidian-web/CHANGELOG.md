# Changelog — obsidian-web

## 0.1.0 — 2026-09-26
- **插件壳首发（T1）**：`obsidian-web/` 包骨架——`package.json`（`dsh.bundle.patch` + 零第三方运行时依赖，zod/dsh 共享包 peer+dev 双声明）、`cordis.patch.yml`（insert 行 + 全键 config）、`lib/index.js` 入口。
- **导出契约（R13 教训回归）**：default 导出为 `{inject, apply}` 对象（工厂函数形态会被宿主静默忽略）；`name`/`inject`/`Config`/`apply` 同步具名导出。
- **Config（zod v4）四组键**：`vaultRoot`（默认 `/mnt/unraid_data/Obsidian`）、`share{enabled, defaultTtlDays, requirePasswordForWrite}`、`ui{pageSize}`、`server{sharePort}`；嵌套对象默认值用 `.prefault({})`（T1 教训：zod v4 `.default({})` 短路直返不填内层默认）。
- **缝位就位**：OW-INV-8 鉴权缝注释（`ctx.connection.requestRejection`，Host/Origin + 签名 cookie，secret 走 `ctx.credentials`）；OW-INV-10 暴露面注释（主 UI 挂 `ctx.webServer.register` 同域 3080 零新增面；分享服务 3500 独立可关停，T9 接）。
- **占位模块**：`lib/{vault-ops,share,render,redact}.js` 契约注释占位 + `web/` 构建物目录占位（T13 起）。
- **测试**：`test/load.test.mjs`（load 冒烟 + R13 回归 + Config 默认值精确断言/坏类型拒/无共享引用 + apply 告警行为）+ `test/manifest.test.mjs`（依赖形态 + 发版纪律契约回归）。
- **目录树与阅读面（T2）**：`lib/render.js`+`lib/render-inline.js` live 渲染最小版（唯一渲染源，输出零未转义 HTML + URL scheme 白名单 + 事件属性中和，OW-INV-6 雏形）；`lib/vault-ops.js` 读侧（树列表/读文件/反链扫描，路径围栏雏形）；`lib/web-routes.js` `/ob/` JSON 读接口 + 静态 UI（每条路由过 `requestRejection` 鉴权缝，OW-INV-8/10）。
- **web/ 前端脚手架（T2）**：Vue3 + vite + element-plus——三栏构图（树 300px 虚拟滚动 / 阅读 / TOC 248px）+ 侧栏菜单中央列同页面板切换（OW-US-1/14）；`web/dist` 构建物随包入库（安装期零构建）。
