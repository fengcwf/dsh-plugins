# dsh-plugins —— fengcwf 的 dsh 自研插件集（monorepo）

> **布局说明（2026-09-27 扁平化）**：本仓库根 = `~/.dsh/plugins/`，每个插件一目录并列居下（`dsh-plugins/` 嵌套层已撤销）。目标 dsh：`>=0.1.0-rc.6 <0.3.0-0`（0.2.x 支持自 2026-09-29 的 rtk-kit/github-ops 0.2.1 起）；插件均零构建纯 ESM JS。
> **位置语义**（官方 docs/user/develop/basic/publish.zh.md）：**源码位**=`~/.dsh/plugins/<插件名>/`（本仓子目录）；**安装落地**=`~/.dsh/profiles/<profile>/node_modules/<pkg>`（`dsh plugin` = profile 内 pnpm，钉版本 git 快照；link: 模式废弃——2026-09-23 缺依赖事故教训）。

| 插件 | 版本 | 职责 |
|---|---|---|
| [dsh-rtk-kit](dsh-rtk-kit/) | 0.4.2 | RTK 集成：bash 命令自动改写走 rtk 压缩（resolve 缝、fail-open）+ 会话 awareness + rtk_doctor 诊断 + **设置页「RTK Kit」**（版本检查/节省统计 0 token/健康八项）；0.3.0=⚠️修复自动改写接线从未生效（B2 effect 工厂形）+ doctor 瘦身；0.4.0=⚠️ 发现兜底（PATH→~/.local/bin 修「报安装」误诊）+ **设置页一键重装自愈**（检测→Release 下载+SHA256 校验→原子落盘→自动复检，装后不重启恢复功能）；0.4.1=⚠️ 挂载面升级原型级（抗宿主重载）+ 三锚留痕 + 健康八项含「自动改写缝已挂载」；0.4.2=观测出口修复（三锚同文走 console——宿主 info 级无出口曾致两轮误诊）+ 判据/边界成文（+1 判据须无管道简单命令；persistent-shell 走 terminals 旁路不经此缝）；**0.4.0 起自动改写实际一直在工作** |
| [dsh-github-ops](dsh-github-ops/) | 0.3.1 | GitHub 集成：GitHub 命令强制 token 模式 + web_fetch 匿名 API 门禁 + 11 个仓库管理工具（gh 后端）+ 数据面 `/api/github-ops/*` 8 端点（0.3.0=设置菜单「GitHub 集成」栏目 + 数据面 + 层①命令强制层接线死锁修复，未发版；0.3.1=修复 web_fetch 门禁 deny 文案的过期观测硬编码「匿名 60/h 且本机代理出口已耗尽」→ 只陈述结构性约束「web_fetch 无法携带 token」，语义零回归，测试 112→115） |
| [dsh-login-gate](dsh-login-gate/) | 0.4.1 | 登录门禁：表单登录（scrypt + HMAC 会话）+ 认证反代 + 原生 DSH 会话 + WS tunnel 修复 + 设置菜单配置面（端口维护/参数可配/账号 CRUD/超时说明，保存语义=即时生效+事前警示 R-16）（0.3.0=设置面与认证优化；0.4.0=数据面收口：门禁数据迁 `plugins/dsh-login-gate/data/` + 遗留自动迁移保 0600 权限） + httpAnonymous 匿名放行前缀（默认关/锚定前缀+只读双锁） |
| [kb-context](kb-context/) | 0.5.0 | 知识库上下文：vault 增量索引（FTS5）+ 检索（BM25/LIKE 兜底+deadline 守卫）+ 会话注入（触发/脱敏/截断）+ wiki_read/wiki_search/kb_diagnose 工具 + 设置菜单配置面（0.3.2=设置面 UI 对齐 dsh token + 填写示例/功能说明文案；0.4.0=数据面收口：索引库迁 `plugins/kb-context/data/kb-index/` + 遗留自动迁移；0.5.0=触发日志：内存环评估记录 + GET logs/POST logs/clear 双端点 + 设置页弹层 + triggerLog.enabled kill switch，脱敏白名单闭集、fail-open） |
| [wiki-steward](wiki-steward/) | 0.9.0 | wiki 管家：会话捕获入 raw/ + kb_validate 六规则校验 + kb_mark sha256 原子回写 + wiki CRUD（.trash 可逆/journal 事务/wikilink 重写）+ 入队告警 + tools/pre-execute 写入拦截 + 设置菜单配置面 + ingest 控制面（历史记录弹层/手动 ingest/定时执行）（0.5.0=设置页/ingest 控制面改造批：首页侧栏面板行移除入设置页、修裸 import 与 vite define（process.env.NODE_ENV 真浏览器根因）、ingest.schedule 定时执行控制；0.6.0=数据面收口：队列/账本/告警账本迁 `plugins/wiki-steward/data/` + 遗留自动迁移；0.7.0=历史日志视图三能力：默认时间倒序（最新在上）+ since/until 日粒度闭区间时间筛选（翻旧同参联动）+ 三来源类型多选（可与时间叠加、全不选如实空页），测试 391→415；0.8.0=Hindsight 记忆同步面：机械转录引擎（raw/06-hindsight 聚合落盘/脱敏/原子写/sha256 幂等/短哈希防覆写）+ 定时触发面（schedule 真消费+L1 门禁+单飞+补跑）+ 4 端点 + 设置节六控件 + W1/F3 竞态收口，测试 415→463；0.8.1=sha256 frontmatter 引号归一（ingest 解析去引号+引擎裸值+旧产物 2 字节自愈），06-hindsight 假 re_ingest 4→0；0.9.0=设置节六组重排（逻辑图/会话捕获/队列与安全/Ingest/Hindsight 面板降组5/部署信息灰置）+ 零依赖运行逻辑图四泳道 + hindsight 双源写根治（专属 /hindsight/settings 端点），t21 终审 pass） |
| [obsidian-web](obsidian-web/) | 0.3.1 | Obsidian vault Web 管理：查看/编辑/下载/分享 + 目录维护（T1-T14 全业务面 + 0.1.1 boot fail-open/索引本地化 + 0.2.0 分享面双模式默认挂 webServer + 客户端面板 + 0.2.1 B2 effect 语义修复 + 0.2.2 运行时阻塞根治 + 0.2.4 UI 回切 dir-a + 自适应缺口修复 + 分享链接口径与承载改道 + 0.3.0 交互面：三栏拖拽分隔条（国标六要素/不持久化/narrow 禁用）+ 目录右键菜单（行内三按钮退役+键盘全达+边缘翻转）+ 目录分享（后端已支持，前端打通并修 3 缺陷）+ 插件自有统一背景（label-primary 派生不随宿主漂移），测试 601→656；0.3.1=⚠️修 0.3.0 引入的大纲被挤到左下（grid 列数接线漏改：7 子项 vs 4 列 → auto-placement 换行），连带修测试 harness 与真实布局同构，测试 656/656/0/0） |
| [dsh-clsh-search](dsh-clsh-search/) | 0.2.0 | 免 key 多源聚合搜索：DDG/Bing/360/百度四源聚合接管 web_search（patch 指针 + registerSearchProvider 兜底补指，修 `configured web provider "deepseek-official" is not registered`）+ 优先级/失败切换/单源开关 + 设置页（源序/预算/条数/缓存/接管三态）+ 工具调用顺序策略注入（vault+记忆 → web_search → web_fetch → ego-browser 仅兜底）（0.1.0=首发，US-1~US-7 全落点；0.2.0=菜单改名「搜索设置」+ 触发日志内存环 + 自检/真联网测试按钮 + 源健康探针 + 自定义源增删（https/SSRF 门禁 + 受限选择器）+ 代理（CONNECT 隧道 + 每源勾选 + 默认策略）+ 让位解释常驻 + 跨源去重 + 6 技术债，US-8~US-17） |
> **dsh-clsh-search 0.2.0 发版证据侧注**：全量回归 `node --test` 328/328/0 + 三方独立重建 dist 同值复核 + 发版体检输出原文见 `dsh-clsh-search/changes/20261006-phase0/tasks/task-30-report.md`；逐卡验证见同目录 `task-*-report.md` 与 `tester-report.md`。发版第⑤步（commit + tag `dsh-clsh-search-v0.2.0` + push + `gh release create` + 生产安装/重启）= NEEDS_HUMAN，用户逐次确认后由队长执行（P-8），本卡未执行。

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
