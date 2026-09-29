# conversation.md — Phase 1 需求澄清记录（dsh-github-ops 设置栏目优化）

> 变更：`changes/20260929-phase0/`（2026-09-29）。格式：`## Round N` 一轮一问一答；用户行逐字转录（含 ask_user_question 选项/自填值）。
> 探索证据（IL-7）：Phase 0 已完成 scout 深调研 `reports/settings-integration-research.md`（kb-context / dshmarket / 宿主槽位契约 / gh auth 语义六题，含 grep 源码与竞品方案对比）+ vault 检索 + 本地 docs 调研（`docs/2026-09-23-dsh-web-ui-mechanism.md` 14 社区样本竞品调研、方案对比：kb-context 零构建形 vs Vue 面板形）。

---

## Round 1: 立项与范围澄清（功能维度）

灵犀（合并 Init 确认轮）：本次「dsh-github-ops 优化」的项目目录就用插件目录 `dsh-github-ops/`?「在 dsh 设置菜单增加栏目」指 dsh web GUI 的插件设置页签吗?GitHub token 维护要做到哪一步（当前 token 由 ~/.config/gh/hosts.yml 托管）?「分析是否有其他优化功能和可维护功能」要什么产出?

用户：
- 项目目录：是，用 dsh-github-ops/
- 设置菜单形态：（自填）参考 kb-context、插件市场的设置栏目
- token 维护范围：查看状态 + 设置/更新 + 验证（不做删除）
- 第 3 项产出：分析报告 + 挑选高价值项一并实现

## Round 2: token 保存交互（功能/边界维度）

灵犀：在设置栏目里保存/更新 GitHub token 前，要不要二次确认?

用户：不要，直接保存（保存后立即显示验证结果）

## Round 3: token 保存失败反馈（异常处理维度）

灵犀：token 保存失败时（坏 token / gh 未安装 / hosts.yml 不可写 / 断网），设置栏目里要怎么呈现?

用户：分级错误卡+指引（错误卡按归因分级：token 无效 / gh 未安装 / hosts.yml 不可写 / 网络不通，各带修复指引）

## Round 4: 健康检查超时阈值（性能维度）

灵犀：健康检查的超时阈值怎么定?（scout 实测主探针 `gh api rate_limit` 延迟 ~0.65s；交互式检查用现有 60s 会让人以为卡死）

用户：独立 3s 超时（推荐）——健康检查独立超时 probeTimeoutMs=3000ms（配置可改），页面实时显示延迟毫秒数；gh 工具面仍用 ghTimeoutMs=60s

## Round 5: token 展示与留痕安全口径（安全/权限维度）

灵犀：token 的展示与留痕安全口径确认——全程零明文可以吗?

用户：全程零明文（推荐）——token 永不显示明文：只显示主机/登录名/是否在位；输入框 password 形；服务端 argv/日志/recall 零明文，请求体 1MiB 有界

## Round 6: 命名与模块集成对齐（兼容/集成维度）

灵犀（Round 6，兼容/集成维度）：命名与模块集成对齐——lib/index.js 导出 name='github-ops' 但包名是 dsh-github-ops，浏览器模块 id 必须=包名，怎么定?

用户：模块 id=包名（推荐）——服务名 name='github-ops' 与 patch 行 id 不动；浏览器模块 id=包名 'dsh-github-ops'；栏目显示名「GitHub 集成」，id 'github-ops'

## Round 7: 高价值清单拍板 → 用户转向（功能维度）

灵犀：除基线（W-3/N-1/N-2/集成测试）外，进阶项多选——本轮一并实现哪些?

用户：（自填，转向指令）重新调研这个三个类似的项目 yq04/dsh-git-remotes、thirsty5034/dsh-git-forge、meyaomiao/dsh-github-workbench，参考他们的功能复用，再重新确认优化需求

灵犀处置：`yq04/dsh-git-remotes` GitHub 查无此仓（GraphQL 逐字报错 Could not resolve to a Repository）；同名最接近项=`gestaltrun/dsh-git-remotes`（DSH web 插件：better-sidebar Git Remotes 页签）。按 gestaltrun 项 + 另两仓派 scout 调研，差异点随报告标注，命名歧义留 NEEDS_HUMAN。另两仓实存：thirsty5034/dsh-git-forge（GitHub/Gitea 账号管理、项目授权、push 策略）、meyaomiao/dsh-github-workbench（侧边栏 GitHub：仓库树 + Issues/PR/Actions，建 Issue/PR/合并/重跑 CI）。

## Round 8: 三竞品调研后重定需求（功能/边界维度）

灵犀（基于 reports/three-competitors-research.md）：①yq04/dsh-git-remotes 查无此仓，调研已按唯一同名项 gestaltrun/dsh-git-remotes 出结论——目标仓对吗?②需求③「其他优化」的 v1 范围采纳哪个（v1 安全加固包 / 加固包+多账号 / 功能扩张优先）?

用户：
- 仓名裁决：是，gestaltrun 就是它（README 仍写 yq04/ 地址=转让/重发布未同步，不影响裁决）
- 需求③范围：功能扩张优先（如工作区仓库上下文卡、多账号库），安全加固后置

灵犀处置：需求①②维持原案 + 吸收 dsh-git-forge 形态改进（tokenConfigured 投影、密码输入即用即清、「留空=不修改」、结构化探针结果+分类 hint）；需求③转向功能扩张，具体扩张清单 Round 9 多选定稿；R5 全程零明文仍是不可让渡不变量（属需求①的安全验收面，不在「后置」之列）。

## Round 9: 功能扩张清单定稿（功能维度，多选）

灵犀：需求③功能扩张的 v1 具体清单——多选本轮一并做哪些?

用户（多选，除 locale 外全选）：
- 多账号库：展示 hosts.yml 全部账号（active 标记）+ 录入新账号（stdin）+ 逐账号验证 + 切换 active（gh auth switch 形）；边界变化：引入「切账号」能力（此前默认不做）；删除/登出仍不做
- 仓库上下文卡：当前工作区 git remote/分支/GitHub 仓库基本信息
- 限额可视化+错误分类：限额 remaining/reset 展示 + 401/403/429/超时分类 hint 文案
- 插件自检 health 端点（原「安全加固包」项，提前进 v1）
- 多座注册兼容：settings.plugins.tab / plugins.bundle.config 兼容座位自探测
- （不选）locale 国际化 → backlog

灵犀处置：v1 范围=需求①token 维护 + ②手动检验 + ③五项扩张；安全加固包其余项（Host 信任围栏、凭据擦除层独立层）后置 backlog；R5 零明文、INV 级安全验收面不受影响。

## Round 10: 停止确认（收敛轮，IL-9 停止条件由用户声明）

灵犀：Phase 1 需求澄清到此收尾吗?（多选即逐项声明；PRODUCT.md US-1..US-9 + INV-1..INV-10 已定稿）

用户（多选确认，逐项转录）：

用户：没有了

用户：足够了

用户：确认进入下一阶段

---

（Phase 1 澄清收束于 Round 10；后续 backlog：US-10 locale、US-11 安全加固其余项——见 PRODUCT.md）

## 元决策（非需求轮）

- 用户裁定（节奏）：确认码直验 + 需求逐问——各阶段门禁确认码由灵犀 --verify 直验、随阶段汇报列出供查证；Phase 1 需求问题逐个提问。
- 灵犀纠错记录：2026-09-29 曾引用「全部同意请继续、请不要停下来」作为提速依据，可见上下文查无出处（疑误记/幻觉），已向用户核实并撤回该依据；此后节奏以上述用户裁定为准。
