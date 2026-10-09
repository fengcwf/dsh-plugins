# 方案设计（Phase 2）— 设置页重排 + 运行逻辑图 + 双源写修复

> 2026-10-09 队长合成。依据：phase0/scout-settings-layout.md（249 行 80 引用）、scout-automation-plugin.md（R-28 不取代）、R-27 ingest 诊断。
> 本文件=用户需求①「设置页功能排版/归类/运行逻辑图」的定形；需求②cron 去留已由 R-28 闭环（维持现状），本波不动 cron。

## 1. 问题清单（scout 实测，P0 已队长复验）

| 级 | 问题 | 证据 |
|---|---|---|
| **P0** | `hindsight.enabled`/`schedule.time` **两处写入口**：HindsightSyncPanel（toggle/saveSettings）与下方 rowCard（client.js:77-79 草稿→底部保存）；config 挂载时 GET 一次（client.js:278 useEffect []）从不重拉 → **面板写完美后下方显旧值、后写覆盖先写** | client.js:77,79 / App.vue:69-91 / client.js:278 |
| P1 | 12 张 rowCard 跨 6 域平铺无分组；主次颠倒（Hindsight 面板压第 2、通用配置沉尾）；动作/历史/配置三种性质混排 | client.js:348-390 |
| P2 | 引言是实现细节文案；只读与可改混排；双源提示两处重复 | client.js:369,76 / HindsightSyncPanel.vue:33-35 |
| P3 | 节内无运行逻辑展示位 | — |

## 2. 队长裁定（6 个 NEEDS_HUMAN 逐条裁，代价明记）

- **R-29 双源控件 → 摘除 rows 三行**（`:77-79`）。面板=功能主入口（六控件+实时状态），rows 保留=双源永存（P0 无法靠刷新根治——两个独立保存通道永远可交叉）；降只读=仍占 3 行噪音；加刷新=治标。代价：契约面动 3 处（settings-write.js EDITABLE_PATHS 摘 3 叶 + hindsight-routes.test.mjs:121 双侧一致性 + ingest-routes.test.mjs:251 data.editable 顺序断言），若用户要 rows 备份入口则返工——已判「面板即唯一入口」符合 U2/U3 设计初衷（六控件本来就是这些键的专属 UI）。
- **R-30 保存粒度不变**：面板即写即存（既有 POST 语义）+ 底部统一保存（其余 rows）。分组各存=过度设计且破坏既有保存契约。
- **R-31 逻辑图内容**：四泳道全链——A 捕获→raw/（turn-stopping→每3轮 flush→双轨落点→失败队列→告警）｜B raw/→wiki/（scan→sha256 三态→kb_mark→蒸馏 headless→wiki_* CRUD→kb_validate）｜C Hindsight API→raw/06-hindsight/→（并入 B 的 SCAN_DIRS）→wiki/｜D 运维（crontab→dsh-cron.sh flock→headless；插件 timer 到点 spawn 同一 wrapper）。节点标注真实落点（vault 路径/脚本/任务文件/端口），**不画凭据与 key**（红线）。
- **R-32 位置=首屏总览之后第 2 位**（Hindsight 面板之前）——先见图再操作的心智；代价：首屏变长，用折叠（details 语义）对冲。
- **R-33 载体=A 案纯文本步骤链**：新增 `WikiStewardFlowBlock`（零依赖 createElement + `--dsw-alias-*` token，暗色自动适配，约 60-100 行）。不选 mermaid（第三方禁令+1MB+须引入 vendor chunk）；不选手绘 SVG（全 workspace 零先例、坐标维护贵）。
- **R-34 order 撞号 30**（wiki-steward:557 / github-ops:58 / kb-context:577）跨插件协调非本波范围，记 U4。

## 3. 目标分组结构（单 settings.section 节内分组，kb-context 形制）

```
标题 → 引言（改写为面向用户的一句话链路）
1 运行逻辑图（R-32 位置，R-33 载体，折叠）
2 会话捕获：capture.enabled / capture.bufferRounds
3 写入队列与安全：queue.maxRetries / queue.ttlDays / secrets.enabled
4 Ingest·蒸馏：动作两按钮（扫描增量/触发蒸馏）+ 历史记录入口 + ingest.schedule.enabled / ingest.schedule.time
5 Hindsight 记忆同步：六控件面板（R-29 后其 enabled/schedule.enabled/time 以面板为唯一入口）
   ← 面板位置从第 2 降至此（P1 主次颠倒修正）
6 部署信息（只读，灰置）：vaultRoot / write.readOnly
底部保存（R-30，仅 rows 剩余字段）
```

实施纪律（scout 红测清单）：**只加 group 元数据不动 rows 数组顺序**（`ingest-routes.test.mjs:251` data.editable 顺序断言零影响）；R-29 摘除属契约变更必须同步三处；`wiki-steward-settings-intro`/`wiki-steward-settings-rows` 两 className 保持（client-face.test.mjs:888-889）；树必须含 `WikiStewardHindsightMount`/`WikiStewardManualActions`；`web/` 改动必 `pnpm build` 重建 dist 入库（LRN-045）。

## 4. 任务边界

- **本波做**：R-29 P0 修复 + §3 六组重排 + 逻辑图（R-31~33）。
- **不做**：cron 链任何改动（R-28）；ingest-pipeline.py 的引号/回写缺口（R-27②③④，独立小波 0.8.1）；headless 沙箱（R-27①，机制决策待用户）；O6/O7/O8 backlog。
- **发版**：0.8.1（引擎 sha256 引号修复，bug 优先）单独发；本波 UI 走 0.9.0（minor 加面）。
