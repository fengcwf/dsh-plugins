# 重启后验证清单（O4 真 HTTP 冒烟）— wiki-steward v0.8.0

> 2026-10-08 发版安装完成后的最后验证。重启前生产 web 进程仍跑 0.7.0（内存态），
> 以下全部须**重启后**执行。执行者：用户或新会话。

## 1. 服务活检
```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/          # 期望 200/303
```

## 2. Hindsight 端点真 HTTP 冒烟（重启前=404，重启后应通）
```bash
# status（未登录应 401=authGate 在；登录态应 200 含 bank/activeOps/synced）
curl -s http://127.0.0.1:3080/api/wiki-steward/hindsight/status | head -c 300
# sync-log（应 200，空日志=合法空集）
curl -s 'http://127.0.0.1:3080/api/wiki-steward/hindsight/sync-log' | head -c 300
# settings（既有端点应 200/401，零回退）
curl -s http://127.0.0.1:3080/api/wiki-steward/settings | head -c 200
```
判据：`hindsight/status` 从 **404 → 200/401**；响应形含 `bank`/`activeOps`/`synced`（官方口径）。

## 3. 设置节六控件可见
GUI：设置 → wiki-steward → Hindsight 同步区应见：状态条 / 立即同步 / 同步日历 / 同步时间 HH:MM / L1 开关 / L2「⏳ 待重启」徽标。

## 4. 手动同步端到端（真 vault 会写 raw/06-hindsight/——首次真实同步）
点「立即同步」→ 响应 `{started:true}` → 检查 `/mnt/unraid_data/Obsidian/raw/06-hindsight/` 出现
`coding-agent--dsh-plugins-ad942f05-2026-10.md` 类文件 → `python3 /opt/Workspace/scripts/obsidian/ingest-pipeline.py scan --summary` 可见。

## 5. 定时面（可选，验配置而非等跑）
设置里启用 `hindsight.sync.schedule`（如 03:25）→ 热改生效 ≤ 下环；次日查 `~/.dsh/plugins/wiki-steward/data/hindsight-sync-log.jsonl`。

## 6. 回归锚
- 历史记录弹层（view:'log'）行为零回退
- 全量 `cd /opt/workdata/dsh-plugins/wiki-steward && node --test` 463/463（源码位）

## 已知边界（勿误判为缺陷）
- 蒸馏端（raw→wiki）仍断：**DEEPSEEK_API_KEY 未配**（MISSING_CREDENTIAL）——同步落 raw 成功但 wiki 页编译不出，等用户凭据决策。
- L2 启停写按钮后置（只读徽标）；knowledge pages 不同步（body 空，上游未播种）。
- backlog：F4/O1/O2/O5（见 ledger R-23）。
