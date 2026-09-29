# Task 16 Report — 发版面欠账清理（W-3 / N-1 / N-2）+ 版本文档同步（coder）

- Status: **DONE**（备料面完成；发版五步⑤ tag/push/gh release 未执行——红线要求逐次用户确认）
- Commit: `89fd160` `release: dsh-github-ops 0.3.0 备料——发版五步①②③ + 发版面欠账清理（W-3/N-1/N-2/M12-2/T13 carry，Task 16）`
- 改动面：7 文件（只 dsh-github-ops/ 内 + 根 README.md），+29/−13

## 交付面逐条（对照 brief 验收）

### ① package.json 补 `repository`（W-3）+ `files` 补 CHANGELOG.md（N-1）
- `repository: {type:"git", url:"git+https://github.com/fengcwf/dsh-plugins.git"}`；`files` 增 `CHANGELOG.md`。
- 验证：`node -e "...p.repository&&p.repository.url, p.files.includes('CHANGELOG.md')"` → `git+https://github.com/fengcwf/dsh-plugins.git true` ✅

### ② M12-2 计数同步（10 → 11）
- 实测 `GITHUB_TOOL_SPECS.length = 11`（github_auth_status + github_repo_{list,search,info,clone,create,fork,edit,archive,delete} + github_api）。
- 同步两处：`package.json:4` description「10 个仓库管理工具」→「11 个」；`cordis.patch.yml:18` 注释「注册 10 个」→「注册 11 个」。
- README.zh.md 同款计数核验：全篇已是「11 个」（无 10 个残留），无需改。
- 另发现同文件陈旧计数（同类事实漂移，顺手修正并已记入 CHANGELOG/TECH.md 口径）：`node --test（15/15）` → `109/109`；`npm run check # node --check × 3 + 15 测试` → `× 11 + 109 测试`；配置表补 `probeTimeoutMs | 3000` 行（0.3.0 新键）。

### ③ scripts.check 补面（T13 carry）
- 补齐全部 11 个 lib 文件 `node --check`：index / enforce / repo-tools（原有 3）+ client / client.ui / client.ui.model / client.ui.project / client.ui.cards / client.ui.styles / gh-auth / settings-routes（新增 8），+ `node --test`。
- 验证：`npm run check` 绿（node --check OK=11 FAIL=0，109/109）✅

### ④ N-2 处置（Ruling：保留）
- `dsh.plugin.json` **保留**，version 随 package.json bump 0.2.1 → 0.3.0（dsh-plugin-ops 口径「版本号与 package.json 一起 bump」）。
- `README.zh.md` 新增「包内文件说明（dsh.plugin.json）」节：社区工具发现惯例、官方 dsh 不读取（生效靠 `dsh.bundle.patch` → `cordis.patch.yml`）；用途说明写 README 不写 JSON（LRN-035 严格 JSON 禁注释）。
- **C-2 同步**：`changes/20260929-phase0/TECH.md` 文件变更范围两行更新——`dsh.plugin.json` 行改「N-2 处置（已裁决）：保留…」；`package.json` 行补 scripts.check 面；CHANGELOG/README 行并入 README.zh.md 说明。

### ⑤ CHANGELOG 0.3.0 条目（`## 0.3.0 — 2026-09-29`）
5 条：设置菜单「GitHub 集成」栏目（US-1..US-9 事实面）/ 数据面 `/api/github-ops/*` 8 端点 / **层①命令强制层接线死锁修复（显式一条，Ruling-1）** / 测试面 109/109 证据（load 冒烟 + 既有 16 零回归；.testenv 待 Task 17）/ 发版面欠账清理条。
- 「既有 16」口径独立核实：0.2.1 基线 commit `7e42997` 测试数 = enforce 7 + load 1 + repo-tools 8 = **16** ✅
- 8 端点事实核验：`settings-routes.js` 注释与实现面 = GET /status、POST /token、POST /check、GET /accounts、POST /accounts/verify、POST /accounts/switch、GET /repo-context、GET /health = **8** ✅

### ⑥ 根 README.md 版本表（只动 dsh-github-ops 一行）
- 版本格 `0.2.1` → `0.3.0（待发版）`，行尾注改为「0.3.0=设置菜单…+数据面+层①接线死锁修复；**待发版**：发版五步⑤ tag/push 未执行，待用户确认」（沿用 dsh-login-gate 同款「待发版」措辞先例）。其他插件行零触碰 ✅

## 验证命令（brief 逐条，路径修正 F-scan-2 已用 `../README.md`）

| 命令 | 结果 |
|---|---|
| `node -e "...repository.url, files.includes('CHANGELOG.md')"` | `git+https://github.com/fengcwf/dsh-plugins.git true` ✅ |
| `grep -n '0.3.0' CHANGELOG.md ../README.md` | CHANGELOG.md:3 命中 + ../README.md:9 命中 ✅ |
| `bash scripts/check-release.sh dsh-github-ops` | **[VERDICT] PASS**（version/CHANGELOG/README 三项 PASS；dist 新鲜度锁不触发） |
| `npm run check`（补面后） | node --check 11/11 + node --test **109/109** ✅ |

## check-release.sh 的 tag 项说明（不造假）

脚本对 tag 缺失只打 `[TODO] tag dsh-github-ops-v0.3.0 尚未创建`，**不计入 FAIL**（脚本 `echo` 非 `bad`），故整体仍 PASS。tag 不存在是预期状态——**发版五步⑤（tag + push + gh release create）待用户逐次确认后执行**；commit 已做（`89fd160`），push 未做。脚本另有 `[NOTE] 工作树有未提交变更`，指向其他并行会话的未跟踪文件（dsh-login-gate docs、各插件 ledger/tasks 等），非本卡改动面。

## Self-review（CHANGELOG 与 diff 一致性逐条）

1. 设置菜单栏目条 ↔ Tasks 10-15 已提交实现（client.ui*.js / settings-routes.js / gh-auth.js）✅
2. 数据面 8 端点条 ↔ settings-routes.js 实测 8 端点 ✅
3. 层①修复条 ↔ lib/index.js:80-83 工厂形 `ctx.effect(() => () => {...})` + 拆除器形反例注释在场 ✅
4. 测试证据条 ↔ 本卡实跑 109/109、既有 16=7e42997 基线实测 ✅；「.testenv 待 Task 17」如实标注未做 ✅
5. 发版面欠账条 ↔ diff 逐项对应（repository/files/计数×2/scripts.check/dsh.plugin.json 保留+README 说明）✅
6. 无未做内容写入 CHANGELOG ✅

## Concerns / NEEDS_CONTEXT（留给父级）

1. **发版五步⑤ 未执行**（红线）：tag `dsh-github-ops-v0.3.0` / push / `gh release create` 均待用户逐次确认；commit `89fd160` 已就位，确认后可直接 tag+push。
2. **README.zh.md 无设置菜单专节**：0.3.0 的设置栏目六卡（认证状态/token 维护/访问检验/多账号库/仓库上下文/health）在 README.zh.md 只字未提（本卡验收面未含此项，未越界补写）。CHANGELOG 已载事实面；如需用户文档面，建议后续单独卡补「设置菜单」节。
3. **README.zh.md 安装示例仍是旧形**：`dsh plugin --profile web add /root/.dsh/plugins/dsh-github-ops`（路径安装，非钉版本 git 快照 `github:fengcwf/dsh-plugins#dsh-github-ops-v0.3.0&path:dsh-github-ops`）——与现行分发纪律不一致，不在本卡验收面，未动；建议发版后修正。
4. dsh-github-ops 的项目文档（`ledger.md`/`tasks.md`/`overview.md`/`changes/20260929-phase0/` 大部分文件）仍为未跟踪（TECH.md 除外，已跟踪）——是否随发版入库属上游账本决策，本卡未动。
5. `dsh.plugin.json` version 一并 bump 0.3.0 为 dsh-plugin-ops 口径（「版本号与 package.json 一起 bump」）；若上游裁定该文件冻结版本，可单独回退此一行。
