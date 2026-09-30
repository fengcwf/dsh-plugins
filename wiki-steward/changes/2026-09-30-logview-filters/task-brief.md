# task-brief — 日志视图改造（时间倒序+时间筛选+类型筛选）

> Phase 8 反馈轮④（用户原话）：「日志时间倒序查看，增加时间筛选、类型筛选」
> 现场参照：changes/2026-09-29-settings-ingest-controls/ 的 diagnostic-report.md（§2 架构地图）+ reports/task-f1-report.md（历史弹层实现）+ tester-report.md（弹层行为基线）

## 现状（0.5.0）
「查看历史记录」弹层：三来源日志拼接展示（夜间蒸馏任务日志/手动扫描增量/告警账本，逐行来源标注）、尾部 200 行、「加载更早」锚点翻旧（log-history.js 状态机：PAGE_SIZE=200/prependChunk 去重/canLoadOlder 闸门）。

## 目标（用户需求三条）
1. **时间倒序查看**：默认最新在上；翻旧（加载更早）语义保持——旧条目追加在下方
2. **时间筛选**：起止时间区间，只显示区间内条目；与翻旧联动（翻旧后过滤仍生效）
3. **类型筛选**：三来源类型多选（可全选/全不选）；与时间筛选可叠加组合
4. 空结果态如实显示（不伪造条目）；筛选状态在弹层重开后保持或重置（任选，报告注明）

## 契约与红线
- {data}/{error} 响应契约形零变化；后端 ingest 日志 API 若需扩展参数（如 since/until/type）须向后兼容（缺省=现状行为）
- 既有 387 断言零回退（修订逐条注明理由）；组件 ≤300 行、逻辑落 web/src/lib 纯模块、dsh token 唯一色板
- 只动 wiki-steward/{lib,web,test}；web/src 变更须重建 web/dist 同 commit；不碰生产配置/系统 crontab/kb-context/obsidian-web；发版 tag 留用户
