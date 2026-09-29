# tester-report — Phase 6 测试环境验证证据汇总（P8R1 归档收口 2026-09-30）

> 正本 = `.superpowers/sdd/tasks-2026-09-29-login-gate-settings/task-14-report.md`（命令输出证据/发现分级/回收核对全在正本）；互指页 `reports/tester-report.md`（同一互指约定）。
> 本页=gate-phase6 查找位（`changes/<变更>/tester-report.md`）汇总页，如实转录正本与 SDD progress.md 记录，零代码改动、不新增测试。

## Test Result: PASS

（判定口径：四关/E2E 测试结果全数通过 + 修复波收口后回归复验通过 + 发版尖端补跑通过；发现面不隐藏——F-1【high】/F-2【medium】/F-3【low】 全列下节，F-1 经用户裁定 R-16 修复后复验。）

## 测试结果与证据（test results，逐项指针）

- 四关 4/4 PASS（task-14-report.md:18-25）：换票 303→200 → `--dump-config` 含 login-gate 层 → `node --test` 69/69 → load 冒烟 2/2 + 快照真 import。
- E2E a-f 全达成（task-14-report.md:31-90）：门禁登录流 6/6、设置页（combo 模块可取 + settings.section 注册捕获 + 真组件真数据面渲染树 21/21）、端口保存回显+R-12 回读、参数保存回读、账号增删改密 9/9、未登录 401 + 零哈希。
- 测试节点演进：58/58（Task 12 client-settings，progress.md:67）→ 69/69（Task 13 补全后，:76）→ 72/72（Task 14 fix 后，:90；独立复跑 review-report.md:61）。
- COR-2 尖端补跑（发版门禁，cor2-rerun-report.md）：ref 146022e 四关 4/4 + E2E c/d C-5 级 + 回归零 + 产品缺陷 0（progress.md:108）；INV-6 证据链闭环。

```
四关 4/4 PASS；E2E 6/6 达成；node --test 72/72 tests passed（fix 后 + 独立复跑双证）
```

## 发现（发现分级，正本 task-14-report.md / task-14-fix-report.md）

- F-1【high】写入热生效 vs「需重启生效」文案与现实相悖（真实宿主 configEditor.resolveConfig 重 apply、门禁即时换端口）→ 用户裁定 R-16（A 案即时生效+事前警示）→ fix 波 1a2a3a9+2613abe 收口，复验 72/72 绿。
- F-2【medium】boot「服务缝半缺」告警与事实不符 → fix 波修法 a 收口。
- F-3【low】重复删除 not_found → 记录 deferred。

## 边界与环境偏差（如实注明）

- 浏览器渲染相未取证（ego chromium 两次启动失败）：模块加载+注册捕获+真组件渲染树 21/21 兜底，边界见正本。
- 测试环境偏差（R-15）：他会会话并发占用 3180/3580 → 隔离 profile lgat14（upstream 3181 + gate 3600，避 3080/3500），测完回收干净，未动他会进程。

## 佐证（P8R1-R1 补档 2026-09-30；回应复核附注「registry 未取证」）

- `python3 /root/.dsh/.agent-presets/clsh/skills/clsh-project/scripts/vault-write.py /opt/workdata/dsh-plugins --check` → **exit 0**（无 PENDING 行输出）= registry 无 pending。registry 位=`/opt/workdata/dsh-plugins/.write-registry.json`（工作区根，不在 vault 内——复核按 vault 检索 `*registry*` 故未命中）。
- ERRORS.md 两条 registry 条目：`20260930020234-errors-p8r1-1` / `20260930020241-errors-p8r1-2`，状态均 **resolved**（--resolve 销账后复跑 --check 仍 exit 0）。
