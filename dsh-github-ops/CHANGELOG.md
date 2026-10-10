# Changelog — dsh-github-ops

## 0.3.1 — 2026-10-10
- **修复 web_fetch 门禁拒绝文案的过期观测硬编码（文案修复，语义零回归）**：`gateWebFetch()` 的 deny reason 原写「匿名限额 60/h 且本机代理出口已耗尽」——一句随时间过期的实时观测，2026-10-10 实测已失真（`gh api rate_limit` = 5000/5000/used 0、匿名 curl 返 200、代理出口活着），导致其他会话模型误判「GitHub 出口挂了 / 与 2FA 有关」。新文案只陈述**结构性约束**：web_fetch 无法携带 GitHub token（`dsh-web-fetch-http` provider 注释 "Requests carry no browser cookies or ambient credentials" + `parseFetchUrl` 拒 URL 带 username/password + 工具 schema 只有 `url` 入参无 headers），不再出现数字限额与「耗尽」字样，`${host}` 插值与三通道指路（`gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH` / `github_repo_*` / curl `Authorization: Bearer $(gh auth token)`）全部保留。
- `test/enforce.test.mjs` 补新契约（host 插值 / 负向断言 `60`+「耗尽」 / 三指路关键词 / 结构性约束陈述）+ 正反例自证（旧文案形态必命中、各主机 reject reason 不误伤、尾缀拦截面同形），`node --test` 112 → **115/115** 全绿（`index-mount.test.mjs` deny/ask/off 三态零回归）。来源报告：`changes/20261010-webfetch-gate-copy/task-01-report.md`。

- **测试加固（同 0.3.1 轮内，version 不变）**：`test/enforce.test.mjs` 的实时观测哨兵由字面枚举 `/60|耗尽/` 升级为**结构性三族规则**（A 数字+量纲 `\d+/h`/`\d+次`/`\d+%`；B 配额词与裸数字同子句相邻；C 观测标记或状态词与基础设施/配额主体同现），堵住"换一个看起来像今天真值的数字/状态词仍全绿"的盲区（队长实测：注入「当前匿名限额 5000/h」旧哨兵 115/115 不红，新哨兵 5 测试必红）。补正反例自证（六主机不误伤、5 个同类回归形态必命中、三族独立互证不冗余）+ reason 零数字护栏，`node --test` 115 → **120/120** 全绿。reason 文案零改动（本就是干净的结构性表述）。来源报告：`changes/20261010-webfetch-gate-copy/task-02-report.md`。

## 0.3.0 — 2026-09-29
- 新增 dsh 设置菜单「GitHub 集成」栏目（settings.section + 多座兼容）：认证状态卡、token 维护（留空=不修改、保存即验证、全程零明文）、访问检验（三段探针，`probeTimeoutMs: 3000` 可配）、多账号库（展示/录入/验证/切换 active，无删除登出）、仓库上下文卡、插件自检 health + 限额可视化与分级错误文案。
- 数据面 `/api/github-ops/*` 8 端点（首行鉴权、1MiB 请求有界、zod 白名单校验、结构化错误）。
- **修复命令强制层接线死锁**：0.2.1 的 `ctx.effect` 拆除器形致包壳即死，curl/wget token 注入与 `git clone` 改写**从未生效**；改为工厂形（shell.resolve 包装）+ 双断言锁死。
- 测试面：integration 形（假 ctx 真 `apply()` + 真 handler）与退化形/失败形收口，`node --test` **112/112** 全绿（含 load 真 import 冒烟 + 既有 16 测试零回归；109 基线 + 终审修复波 3 断言）；`.testenv` boot 四关全绿（含多 chunk 嵌套链与 GUI 栏目在场双断言，真机双断言 + 截图）。
- 终审修复波（0.3.0 同版本收口）：① 执行器 env 剔除 `GH_TOKEN`/`GITHUB_TOKEN`/`GH_ENTERPRISE_TOKEN`/`GH_HOST` 四键——gh 的 env token 优先级高于 `hosts.yml`（P-6 单一凭据源之外的隐形第二凭据源，且会顶包「保存后立即验证」）；ghHost/账号选择只走 argv 与 `hosts.yml`。② HTTP≥400 且 body 缺 `ok:false`（前置反代/网关自返 JSON）一律合成硬失败形走分级卡，封死假成功残洞（D2 收口/INV-10 邻域）。
- 发版面欠账清理：`package.json` 补 `repository`（W-3）、`files` 补 `CHANGELOG.md`（N-1）、工具计数 10→11 同步（M12-2：description 与 `cordis.patch.yml` 注释）、`scripts.check` 补齐全部 lib 文件 `node --check` 面（T13 carry）；`dsh.plugin.json` 保留（N-2 处置）——社区工具发现惯例、官方 dsh 不读取，用途说明记 `README.zh.md`（严格 JSON 禁注释，LRN-035），版本随 `package.json` bump。

## 0.2.1 — 2026-09-29
- 兼容面（行为零变更）：`peerDependencies`（`@deepseek-ai/dsh-tools`/`dsh-llm`）与 `dsh.plugin.json` engines 上界 `<0.2.0-0` → `<0.3.0-0`，放行 dsh 0.2.x（含 0.2.0-rc.1）。背景：0.2.0-rc.1 版本门禁拒载实测（`docs/test-env-upgrade-020-2026-09-29.md` §2）。

## 0.2.0 — 2026-09-23
- 迁入 `fengcwf/dsh-plugins` monorepo；分发形态改为**版本钉装的 git 快照安装**（弃用 link:）。
- 行为与 0.1.0 相同。

## 0.1.0 — 2026-09-23
- 首版：GitHub 命令强制 token 模式（curl/wget 注入 `$(gh auth token)`、`git clone` → `gh repo clone`）、web_fetch 匿名 API 门禁（api.github.com 等 deny）、11 个仓库管理工具（gh 后端，删除双闸 confirm+allowDelete、`github_api` 非 GET 需 confirm）。
