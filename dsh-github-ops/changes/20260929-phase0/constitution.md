# constitution.md — 项目宪法（dsh-github-ops 设置栏目优化）

> 本文件定义本次变更不可违背的约束。所有阶段产出（实现/测试/审查）必须符合此宪法；宪法条款不得被实现便利推翻。

---

## 项目约束 / Project Constraints

### C-1: 代码必须可运行且可加载

交付代码零语法错误；`node --test` 全绿（含 load 真 import 冒烟 + integration 形测试）；.testenv boot 冒烟四关全绿。测试全绿 ≠ 可加载（INV-8），load 冒烟不可省。

### C-2: 变更必须可追溯

每个文件变更登记 TECH.md 文件变更范围；偏离须先改 TECH.md 再改代码；commit body 记事实与证据。

### C-3: 现有行为零回归

命令强制层 / web_fetch 门禁 / 仓库工具集 / awareness 四层语义不变（INV-7）；既有 16 测试保持全绿。

### C-4: 不变量必须可测试

PRODUCT.md 的 INV-1..INV-10 每条有对应自动化测试或审查证据；gate-phase5 会机械检查 INV-* 覆盖。

### C-5: 文档与版本纪律同步

README / CHANGELOG / version / tag 四处永不脱节（发版五步）；DESIGN.md token 表逐字进实现，色板唯一来源=dsh `--dsw-*`。

---

## 禁止操作 / Prohibited Actions（绝对禁止）

| ID | 禁止操作 | 原因 |
|----|----------|------|
| P-1 | 删除或覆盖 constitution.md 约束条款 | 宪法不可被自身修改 |
| P-2 | 未更新 TECH.md 即改文件结构 | 变更可追溯 |
| P-3 | 跳过测试直接标记任务完成 | IL-2 质量由测试与审查判定 |
| P-4 | 引入 TECH.md 未声明的外部依赖（含任何第三方 UI 库） | 依赖面受控（AGENTS.md UI 口径） |
| P-5 | token 明文进 argv/日志/recall/返回值/UI（INV-1） | 安全红线；`gh auth token` 明文输出全链路禁用 |
| P-6 | 新增任何凭据存储（一切凭据只进 hosts.yml） | 单一认证源 |
| P-7 | `root` 槽注册 / 覆盖 `sidebar`/`rightbar` 占位 | 宿主红线：遮蔽 AppFrame/拆列 |
| P-8 | 新增删除 token / 登出 API 或 UI | INV-4 用户边界 |
| P-9 | 服务存活期写生产 `profiles/web/cordis.patch.yml` | LRN-033 热重载拆活树 |
| P-10 | 真实 token 进测试/测试日志 | 测试用一次性假值 + 零明文断言 |

---

## 验收标准 / Acceptance Criteria

### 代码验收

- [ ] `node --test` 零失败，且含 load 冒烟 + integration 形（假 ctx 真 apply() + 真 handler）
- [ ] INV-1..INV-10 逐条测试/审查证据（对应任务卡 acceptanceResults）
- [ ] 无硬编码凭据；错误输出结构化（INV-10）
- [ ] 组件/模块 ≤300 行；`ctx.effect()` 收敛释放

### 文档验收

- [ ] PRODUCT.md US-1..US-9 状态标注；TECH.md 文件范围与实际一致
- [ ] CHANGELOG（插件 + 根）含 0.3.0 条目；README 版本表同步
- [ ] DESIGN.md token 与实现引用一致（--dsw-* 变量名）

### 交付验收

- [ ] .testenv boot 冒烟四关全绿（换票 HTTP 200/303 → --dump-config 含插件层 → node --test → load 真 import）
- [ ] 发版五步逐项过 `check-release.sh`；发版逐次经用户确认
