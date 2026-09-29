# dsh-plugins —— fengcwf 的 dsh 自研插件集（monorepo）

> **布局说明（2026-09-27 扁平化）**：本仓库根 = `~/.dsh/plugins/`，每个插件一目录并列居下（`dsh-plugins/` 嵌套层已撤销）。目标 dsh：`>=0.1.0-rc.6 <0.3.0-0`（0.2.x 支持自 2026-09-29 的 rtk-kit/github-ops 0.2.1 起）；插件均零构建纯 ESM JS。
> **位置语义**（官方 docs/user/develop/basic/publish.zh.md）：**源码位**=`~/.dsh/plugins/<插件名>/`（本仓子目录）；**安装落地**=`~/.dsh/profiles/<profile>/node_modules/<pkg>`（`dsh plugin` = profile 内 pnpm，钉版本 git 快照；link: 模式废弃——2026-09-23 缺依赖事故教训）。

| 插件 | 版本 | 职责 |
|---|---|---|
| [dsh-rtk-kit](dsh-rtk-kit/) | 0.3.0 | RTK 集成：bash 命令自动改写走 rtk 压缩（resolve 缝、fail-open）+ 会话 awareness + rtk_doctor 诊断 + **设置页「RTK Kit」**（版本检查/节省统计 0 token/健康七项）；0.3.0=⚠️修复自动改写接线从未生效（B2 effect 工厂形）+ doctor 瘦身 |
| [dsh-github-ops](dsh-github-ops/) | 0.3.0 | GitHub 集成：GitHub 命令强制 token 模式（0.3.0 修复接线死锁）+ web_fetch 匿名 API 门禁 + 11 个仓库管理工具（gh 后端）+ 数据面 `/api/github-ops/*` 8 端点（0.3.0=设置菜单「GitHub 集成」栏目 + 数据面 + 层①命令强制层接线死锁修复；**待发版**：发版五步⑤ tag/push 未执行，待用户确认） |
| [dsh-login-gate](dsh-login-gate/) | 0.3.0 | 登录门禁：表单登录（scrypt + HMAC 会话）+ 认证反代 + 原生 DSH 会话 + WS tunnel 修复 + 设置菜单配置面（端口维护/参数可配/账号 CRUD/超时说明，保存语义=即时生效+事前警示 R-16）（0.3.0=设置面与认证优化；**待发版**：0.3.0 发版（2026-09-29）） |
| [kb-context](kb-context/) | 0.3.2 | 知识库上下文：vault 增量索引（FTS5）+ 检索（BM25/LIKE 兜底+deadline 守卫）+ 会话注入（触发/脱敏/截断）+ wiki_read/wiki_search/kb_diagnose 工具 + 设置菜单配置面（0.3.2=设置面 UI 对齐 dsh token + 填写示例/功能说明文案） |
| [wiki-steward](wiki-steward/) | 0.5.0 | wiki 管家：会话捕获入 raw/ + kb_validate 六规则校验 + kb_mark sha256 原子回写 + wiki CRUD（.trash 可逆/journal 事务/wikilink 重写）+ 入队告警 + tools/pre-execute 写入拦截 + 设置菜单配置面 + ingest 控制面（历史记录弹层/手动 ingest/定时执行）（0.5.0=设置页/ingest 控制面改造批：首页侧栏面板行移除入设置页、修裸 import 与 vite define（process.env.NODE_ENV 真浏览器根因）、ingest.schedule 定时执行控制） |
| [obsidian-web](obsidian-web/) | 0.2.2 | Obsidian vault Web 管理：查看/编辑/下载/分享 + 目录维护（T1-T14 全业务面 + 0.1.1 boot fail-open/索引本地化 + 0.2.0 分享面双模式默认挂 webServer + 客户端面板 + 0.2.1 B2 effect 语义修复 + 0.2.2 运行时阻塞根治/UI C+A 优化） |

## 版本纪律（强制，缺一不可）

**每次更新必须同时**：① `package.json` `version` bump（semver）② 插件目录 `CHANGELOG.md` 加 `## <版本> — <日期>` 更新记录 ③ 本 README 版本表同步 ④ 提交并打 tag **`<插件名>-v<版本>`** ⑤ `bash scripts/check-release.sh <插件名>` PASS 后才 push。

## 安装 / 更新（本地 dsh profile，钉版本 git 快照）

```bash
dsh plugin --profile web add 'github:fengcwf/dsh-plugins#<插件名>-v<版本>&path:<插件名>'   # 安装/更新=换新 tag 重执行，同名即替换
dsh plugin --profile web remove <插件名>                                                    # 卸载
/root/.dsh/start-dsh.sh        # 重启生效（会闪断会话，选空档执行）
```

- git 快照自动代装 `dependencies`（zod 等）；`@deepseek-ai/*` 为 peer，由 dsh 运行时拦截层共享宿主实例。
- 无热链路：线上跑的永远是可追溯的钉版本（特性不是摩擦）。
- 前置：`rtk --version`（缺了 dsh-rtk-kit 自动退化为恒等）、`gh auth status`（已登录 fengcwf）。
- 配置在各包 `cordis.patch.yml`（随包分发，`insert` 行即插件入口）；用户覆盖走 profile 层 `cordis.patch.yml`（config 整行替换）。
- 运维排障 skill：`~/.agents/skills/dsh-plugin-ops/`。

## 开发

```bash
cd ~/.dsh/plugins/<插件名>
pnpm install      # checkout 自持 node_modules（官方约定；devDep 副本供独立测试）
node --test       # 必含 load.test.mjs 加载冒烟（防"测试全绿但起不来"）
bash ../scripts/check-release.sh <插件名>   # 发版纪律体检（version/CHANGELOG/README/tag/dist 五对齐）
```

## 与社区方案的差异（详见 [11-社区插件调研与设计决策.md](11-社区插件调研与设计决策.md)）

**dsh-rtk-kit vs 社区 rtk 流派**（DeepTrial/dsh-bash-rtk executor 路线、pharaohnie/dsh-rtk-tools 工具路线、dd2673 等 rewrite 路线）：
- 改写路由交给 `rtk rewrite`（链式感知、随 rtk 升级自动进化）而不是手写 44 项白名单；
- `stdin == null` 守卫让 hook-runner 等宿主内部 shell 调用永不被改写；
- awareness 三档随插件装卸；修掉 `rtk rewrite` 0.49.0 成功码 rc=3 的判定坑。

**dsh-github-ops vs GitHub MCP server**（实测）：schema ≈2k vs ≈12.8k token；token 来源 gh hosts.yml 命令替换（值不进日志）vs 显式 env PAT；强制力构造性 vs 模型自选；`github_api` 万能入口+`--jq` 投影 vs 专用工具；需要 MCP 全家桶可并存（`dsh-mcp-client` 另挂）。

## 采纳的社区模式（TOP）

RTK 官方 hooks（exit-code 四态/thin delegate/全链路 fail-open/递归防护三件套/awareness 三档）、GitHub MCP（命名规范/描述内嵌选型指导/fields 裁剪/read-only 边界/DeprecatedToolAliases）、gh CLI（免配置 token/--jq 裁剪/gh api 万能后端）、fast-bash（rewrite/hint/block 三档）、PivotStack/dsh-github（危险操作显式确认）。
