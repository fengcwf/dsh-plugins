# proposal.md — 设计提案（dsh-github-ops 设置栏目优化）

> 变更：`changes/20260929-phase0/`（2026-09-29）。本文件只记设计决策（功能清单、API 合约、数据模型、架构约束、范围边界）；实现细节见 TECH.md，像素级约束见 DESIGN.md。

## 背景 / Background

dsh-github-ops（0.2.1）是纯后端插件：命令强制 token 层 + web_fetch 门禁 + gh 后端仓库工具，但 GitHub 凭据维护（hosts.yml）与访问健康只能手查命令行。用户要求在 dsh 设置菜单增加栏目：①token 维护 ②手动访问检验 ③其他优化/可维护功能。经 Phase 1 九轮澄清与三竞品调研（dsh-git-remotes / dsh-git-forge / dsh-github-workbench），需求③定为功能扩张五项。

## 方案对比 / Options Comparison（设计决策）

### 方案 A: kb-context 形零构建设置栏目（settings.section 槽 + REST 数据面）⭐ 已采纳

**描述**: 零构建 `lib/client.js` 注册 `settings.section` 槽位 + `lib/settings-routes.js` 数据面 8 端点；UI 自绘 + dsh `--dsw-*` token。
**优势**: 正中「设置菜单增加栏目」需求；零第三方依赖；与生产双先例（kb-context、dshmarket）契约一致；数据面与 UI 分离可演进。
**劣势**: 槽位契约随宿主版本漂移（缓解：多座自探测 + fail-open）。

### 方案 B: Vue + vite 构建物入库（wiki-steward 形）

**描述**: web/ Vue 组件工程化 + vite lib 构建物 + 零构建壳动态 import。
**优势**: 组件工程化、复杂交互可扩展。
**劣势**: 引入构建链与 vendor 依赖，与「轻控件自绘」裁定相悖；本栏目交互密度用不上。

### 方案 C: 独立 HTTP 面板/SPA（obsidian-web 形）

**描述**: 插件自托管全 SPA，iframe 进 main 槽或独立面板。
**优势**: 自由度高。
**劣势**: 不进设置菜单，与需求字面冲突；暴露面自担。

**权衡结论（trade-off）**: 采纳 A；B 作为 v2 演进备选（REST 契约不变，只换壳）；C 否决。

## 功能清单 / Feature Scope（v1）

1. **认证状态卡**（US-1）：主机/登录名/token 是否在位/限额摘要，零明文。
2. **token 维护**（US-2）：密码框（留空=不修改）→ 保存并验证 → 分级错误卡。
3. **访问检验**（US-3）：一键三段判定（本地配置→认证连通→延迟/限额），结构化结果 + 分类 hint + 重新检查。
4. **多账号库**（US-4）：账号列表（active 标记）/录入/逐账号验证/切换 active；不做出登。
5. **仓库上下文卡**（US-5）：remote/分支/仓库摘要，fail-open。
6. **限额可视化 + 错误分类文案**（US-6）：贯穿各卡。
7. **插件自检 health**（US-7）：配置合成/gh 可用/凭据在位。
8. **多座注册兼容**（US-8）：settings.section 主座 + 兼容座自探测防双挂载。
9. **发版面欠账清理 + integration 测试**（US-9）：W-3/N-1/N-2 + 假 ctx 真 apply 测试。

**不在范围（boundary）**: token 删除/登出（INV-4）、locale（US-10 backlog）、Host 信任围栏/独立凭据擦除层（US-11 backlog，用户裁定后置）、remote/Issues 面板（生态协同装竞品）、gh auth refresh（backlog）。

## API 合约 / API Contract（设计面）

| 端点 | 语义 | 关键约束 |
|------|------|----------|
| `GET /api/github-ops/status` | 认证状态投影 | 零明文；hosts.yml 元数据 only |
| `POST /api/github-ops/token` | 设置/更新 token | 留空=不修改；stdin 传 gh；≤1MiB |
| `POST /api/github-ops/check` | 访问检验 | 三段判定；probeTimeoutMs |
| `GET /api/github-ops/accounts` | 账号列表 | 不读 token 值 |
| `POST /api/github-ops/accounts/verify` | 逐账号验证 | 结构化结果 |
| `POST /api/github-ops/accounts/switch` | 切换 active | gh auth switch，降级提示 |
| `GET /api/github-ops/repo-context` | 仓库上下文 | URL 凭据擦除；TTL ≤30s |
| `GET /api/github-ops/health` | 插件自检 | 三段自检 |

统一约束：每 handler 首行 `connection.requestRejection`（INV-3）；错误结构化 `{ok,stage,code,status,login,message,elapsedMs}`（INV-10）；客户端 fetch 文档相对 `api/github-ops/…`。

## 数据模型 / Data Model

- **唯一凭据源** = `~/.config/gh/hosts.yml`（0600）：读=元数据投影（`active_account`/`user`/`users[]`/`git_protocol`，`oauth_token` 只判在位）；写=只经 `gh auth login --with-token` stdin。插件自身**零凭据存储**。
- **探针结果**：`{ok, stage, code, status, login, message, elapsedMs}`（stage ∈ local-config/auth-connect/latency-quota）。
- **账号投影**：`{login, active, configured, verified?}`。
- **repo-context**：`{remote, branch, repo, stars, defaultBranch}` + TTL 时间戳。

## 架构约束 / Architecture Constraints

- 模块 id = 包名 `dsh-github-ops`（INV-9）；`lib/index.js` name='github-ops' 与 patch id 不动。
- `root` 槽禁注册；`sidebar`/`rightbar` 只加内层 seat（宿主红线）。
- Config 新增 `probeTimeoutMs`（3000 缺省）；cordis.patch.yml 整行替换语义=全键重述。
- 零构建纯 ESM；组件/模块 ≤300 行；`ctx.effect()` 收敛释放。
- 现有四层行为零回归（INV-7）。
