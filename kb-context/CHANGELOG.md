# CHANGELOG — kb-context

## 0.1.0 — 2026-09-24

初版：插件骨架（壳）与加载冒烟。

- `package.json`（`dsh.bundle.patch`）+ `cordis.patch.yml` insert 行 `{id: kb-context, name: kb-context, config: 全部键}`（config 整行替换语义，自带全键）
- `lib/index.js`：导出 `name` / `inject` / `Config`(zod) / `apply`；**default 导出 `{inject, apply}` 对象**（R13 教训：工厂函数形态会被宿主静默忽略）
- `Config` 全键热改定义：`triggers{words,entityPaths}`、`hotMap{enabled,maxChars}`、`budget{maxSnippets,maxTokens}`、`timeoutMs`、`scope{indexAll,grepOnDemand}`
- `apply`：配置防御性校验——非法配置留痕告警后 fail-open（INV-15 禁静默）
- `test/load.test.mjs`：真 `import('../lib/index.js')` 冒烟 + R13 回归 + Config 全键单测
- 零第三方运行时依赖：zod 走 peer+dev 双声明（devDep `link:` 宿主运行时副本），运行时共享宿主实例
- 本版不含检索/注入/工具模块（`lib/trigger|search|inject|index-db|tools.js`）与 client bundle（`dsh.client`），留待后续任务
