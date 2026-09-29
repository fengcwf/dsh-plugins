# Task 15 Report — 测试波收口（退化形/超时形/零明文全链 + load 冒烟保持）

- role: tester · status: **DONE** · BASE: `afc4cc5` · 证据文件: `dsh-github-ops/changes/20260929-phase0/reports/tester-report.md`
- 验证: `node --test` → **109/109 绿**（基线 87 + 新增 22，零回归）；`node --test test/load.test.mjs` → exit 0

## 交付物

| 文件 | 性质 | 说明 |
|------|------|------|
| `test/gh-auth-degrade.test.mjs`（231 行，新建） | 10 测 | 超时分级（阶段①③ + writeToken R-1 同法）/ 403·429·非零退出·写入失败分级 / F-7 五缺口 / 全链零明文（argv+返回值，形态值+非形态值双咬） |
| `test/settings-routes-degrade.test.mjs`（250 行，新建） | 7 测 | 真 spawn 全链（慢响应超时不挂死、R-1 失败形 stderr 不透传）/ 失败形分级矩阵 / 写入失败 GHO-TOKEN-06 / 缺缝 fail-open / 日志·返回值零明文 / sendJson 整树 redact 咬合 |
| `test/client-degrade.test.mjs`（214 行，新建） | 5 测 | UI 超时分级不挂死 + 归因标题口径 / repo 降级不炸栏目 / UI 投影零明文 / 假 ctx 无 slots apply() 不炸（壳 + index 双面） |
| `test/client-shell.test.mjs`（修改 +14 行） | 携带面 | D1 `banAbsApi` 正反例自证并入 M1/S1 清单；Empty 断言限定 `.gho-empty` 子树 + 非空态反证 |
| `lib/client.ui.project.js`（修改 2 行） | **测试驱动最小缺陷修复（显式）** | `labelOf` 鉴权缝分支收窄为 `GHO-AUTH-01/02` 精确匹配（依据见下） |
| `changes/20260929-phase0/TECH.md`（修改） | C-2 | 三个新测试文件 + client-shell 修改面先登记后落码 |
| `changes/20260929-phase0/reports/tester-report.md`（新建） | 证据 | 验收逐条命令+输出摘录、红绿记录、mutation 表、观察清单 |

## lib 修复依据（唯一一处产品代码改动）

`lib/client.ui.project.js labelOf` 以 `code.indexOf('GHO-AUTH-')===0` 匹配鉴权缝码，误吞探针业务码 `GHO-AUTH-CONNECT-<NN>`，分级错误卡标题归因错显（超时→「来源受限」/ 403→「来源受限」/ 401→「未登录」）——INV-10「结构化归因」被破坏。test/client-degrade.test.mjs 三条断言在 BASE 实现上**实测先红**（actual/expected 摘录在 tester-report §2），最小修复后全绿、鉴权缝口径不变（109 全绿零回归）。

## TDD 与咬合证明

- 真缺陷红→绿 1 例（上条）。
- Mutation 探针 5 轮：M1 超时分支失效→2 红；M2 去 403 映射→1 红；M3 stdin 精密擦除失效→首轮 0 红（**假保险**）→补非形态一次性值断言后 1 红；M4 sendJson 整树 redact 失效→首轮 0 红（**假保险**）→补「白名单违例键名反射」对抗断言后 1 红；M5 空态子树类名丢失→1 红。还原后 `git diff --stat -- lib/` 仅剩预期修复、全量复绿。

## 验收对照（brief 逐条）

1. 慢响应 >probeTimeoutMs 超时分级 + UI 不挂死 ✅（gh-auth-degrade 超时形 ×2 / settings-routes-degrade 真 spawn 全链 / client-degrade UI 终态）
2. 失败形 401/403/429/非零退出/写入失败 + stderr 敏感串不透传 ✅（分级矩阵 + R-1 全链 + 日志面）
3. 假 ctx 无 slots apply() 不炸 / 槽位缺席 fail-open / repo-context 失败降级不炸栏目 ✅（client-degrade ④② + settings-routes-degrade 缺缝 + 既有 client-shell 四形）
4. 全链零明文（argv/日志/返回值/UI 投影）✅（双助手扫描 + 两层擦除各有咬合断言）
5. gh-auth / settings-routes 退化形断言补齐（拆文件，C-2 先登记 TECH.md）+ load 冒烟保持 ✅
6. 既有 16 测试零回归 ✅（109/109 全绿，enforce/repo-tools/load 保持）
7. 验证命令 + P-3 标记完成（证据=测试输出落 tester-report.md）✅

## concerns（交终审立卡，均不在本轮修复面）

1. **O-T15-1（低危）** 畸形 hosts.yml（Tab 缩进）产生幻影 host 行（YAML 键名被当主机名投影）；安全不变量不破（不炸/零明文/不伪造凭据，断言已锁）。处置候选=跳过 tab 缩进行（一行）；不建议 tab 计入缩进（与 gh YAML 严格拒绝相悖，会造「已配置」假阳性）。
2. **O-T15-2** 测试文件超 300 行既有状态：client-shell 727（本轮携带 +14）、settings-routes 312——拆分属重构面超 tester 职权；本轮新增三文件全 ≤300。
3. D2/D3 等 deferred 项未触碰、执行中亦未撞出其用户可见症状（无新增证据）。

## NEEDS_CONTEXT

无阻塞项。全部一次性假值、零真实凭据（P-10 声明在 tester-report §6）。
