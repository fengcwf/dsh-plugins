# 10-G 对齐远端 + 版本改号 0.5.0 —— 两波内容合流集成报告

- 任务：t7（kind=integration，attempt 3cf59cc1-8880-4581-ab98-f9554d996029）
- 日期：2026-09-30
- 上下文：`changes/2026-09-30-kb-context-trigger-log/`（ledger R-8、tester-report.md D2 段）
- 产出性质：报告（门禁证据面，非代码面）

## ① 分叉图谱（git fetch 后，先报告后动手）

`git fetch origin`：`998676f..32f96ba main -> origin/main`，新 tag `kb-context-v0.4.0` / `dsh-login-gate-v0.4.0` / `wiki-steward-v0.6.0`。

```
merge-base = 998676f（docs: dsh-github-ops 0.3.0 项目文档入库）
│
├─ 本地 main 独有（远端均不含，7 commits）：
│    597c8db → cd403d9 → 12e73aa → 99ff345   (dsh-github-ops Phase 8 R1 docs ×4)
│    d579d8f                                 (login-gate P8R1 docs)
│    48303b7                                 (wiki-steward 历史日志视图三能力)
│    4140bde ← 本地 HEAD（kb-context 0.4.0 触发日志版本纪律，10-C）
│
└─ 远端 origin/main 独有（本地均不含，1 commit）：
     32f96ba  feat: 数据面收口——三插件状态迁源码位 data/ 目录
              （kb-context 0.4.0 索引库迁移 / wiki-steward 0.6.0 / dsh-login-gate 0.4.0 / .gitignore 钉 data/）
```

**双向包含关系（机械核验）**：

| 问题 | 结论 | 证据 |
|---|---|---|
| `ebbf148`（0.3.2 设置面 UX）是否在远端？ | **YES**（且在本地、在 merge-base=三者皆是） | `git merge-base --is-ancestor ebbf148 origin/main` / `HEAD` / `998676f` 全 exit 0 |
| 远端数据面收口 `32f96ba` 是否在本地？ | **NO**（未合入，本次合流对象） | `merge-base --is-ancestor 32f96ba HEAD` exit 1 |
| 本地 `4140bde` 是否在远端？ | **NO**（触发日志波未推） | `merge-base --is-ancestor 4140bde origin/main` exit 1 |

**实质冲突判定 = 无（不发 NEEDS_HUMAN）**：两波功能正交——本波=触发日志可观测面（lib/trigger-log + inject 记录缝 + 设置面），远端波=索引库落点 `~/.dsh/kb-index/` → `plugins/kb-context/data/kb-index/` 迁移。交集仅为版本纪律文件与 `lib/index.js` 相邻 hunk，机械可并集，无语义对抗。0.3.2 设置面 UX（ebbf148）为共同祖先内容，合流后天然保留。

## ② 整合序（含他人改动保护）

1. `fix:` commit `bdcb0e1`：本波 kb-context 修复环终态入库（t8/t10/t11 面，工作树原样、零逻辑新改，仅 `kb-context/lib` + `kb-context/test` 8 文件）——合并前基线。
2. `git stash push -- .gitignore`（`stash@{0} t7-others-gitignore`）：**他人未提交改动保护**（本地 `.testenv/` 忽略行，非本卡面），合并后 pop 还原，绝不卷入提交。
3. `git merge origin/main --no-commit --no-ff`：进入合并态，逐文件裁定。
4. 改号 0.5.0 + 全量复测 + 本报告 → `release:` 前缀 merge commit（单提交记分叉与合并事实）。
5. `git stash pop` 还原他人 `.gitignore` 改动（保持未提交态）。

## ③ 冲突逐文件裁定

| 文件 | 合并态 | 裁定 |
|---|---|---|
| `README.md` | **UU 冲突** | login-gate 行、wiki-steward 行**取远端**（0.4.0 / 0.6.0 数据面收口，对方波权威）；kb-context 行**三方合写 0.5.0**：0.3.2 UX + 0.4.0 数据面收口 + 0.5.0 触发日志三段描述并存 |
| `kb-context/CHANGELOG.md` | **UU 冲突**（双侧同位插顶条目） | 本波条目**改号 `## 0.5.0 — 2026-09-30`** 置顶（正文随回路终态同步补 dedup 七成员闭集、logs 成功形 `{data:…}` 包络、Escape 挂 document、合流后 246/246）；**远端 `## 0.4.0 — 2026-09-30` 数据面条目原样保留**（验收明文） |
| `kb-context/package.json` | 双侧同改 version 行（0.3.2→0.4.0，同值自动合并） | **裁定 0.5.0**（R-8：远端已占 0.4.0 tag，加能力=minor） |
| `kb-context/lib/index.js` | 自动并集成功 | 并集核验：远端侧 `pluginDataDir`(L90)/`migrateLegacyIndexDb`(L110)/apply 头迁移调用(L207) + 本波侧 `Config.triggerLog`/`readTriggerLogSettings`(L139)/apply 环接线(L242)/`readCfg` 回填(L269)/routes 传环(L308) **全部在场** |
| `kb-context/test/inject.test.mjs` | 自动并集成功 | 远端 2 hunk（dbPath 断言迁 `plugins/kb-context/data/kb-index/`，L628/L674）+ 本波 dedup/safeNow/记录缝断言并存；无重叠 hunk，零人工裁定 |
| `kb-context/test/diagnose.test.mjs` / `tools.test.mjs` | 远端单侧改 | 照取远端（路径断言随迁） |
| `kb-context/test/migrate.test.mjs` | 远端新增 | 照取（4 例） |
| `.gitignore` | 远端单侧改（+data/ 钉 5 行） | 照取远端；本地他人未提交改动经 stash 隔离，**未卷入** |
| `wiki-steward/*` / `dsh-login-gate/*` | 远端单侧改（自动合并） | 照取远端（非本卡 kb-context 面，随合流进树）；本地对应工作树改动（`wiki-steward/changes/.../ledger.md` 等）未被 merge 触碰、未卷入 |

零冲突残留：`git diff --diff-filter=U` 空、全文无 `<<<<<<<` 标记。

## ④ 改号 0.5.0（三处一致 + 远端条目保留）

```
kb-context/package.json  -  "version": "0.4.0"  →  "version": "0.5.0"      （merge 后相对自动合并态的改号 diff）
kb-context/CHANGELOG.md  +  "## 0.5.0 — 2026-09-30"（置顶，本波正文）；"## 0.4.0 — 2026-09-30"（远端数据面条目保留，位于其下）
README.md:11             |  kb-context 行 0.4.0 → 0.5.0（三段描述并存）
```

核验：`grep '"version"'` = 0.5.0；`grep '^## 0.5.0'` = CHANGELOG:3；`grep 'kb-context.*0.5.0'` = README:11；`check-release` ①②③ PASS。

## ⑤ 测试证据（合并口径）

| 口径 | 结果 | 命令 |
|---|---|---|
| 合流后全量 | **246/246 pass, fail 0, exit 0**（≥236 ✓；242 本波 + 4 远端 migrate） | `cd kb-context && node --test` |
| 依赖面 | `Already up to date`，exit 0 | `pnpm install` |
| npm check | exit 0（node --check ×6 + node --test 246） | `npm run check` |
| 双 umask | 022=246/246 ✓；**0077=246/246, fail 0** ✓ | `umask 0077 && node --test` |
| 发版纪律 | ①②③ PASS + ④ `tag kb-context-v0.5.0 尚未创建` 如实留痕 + `[VERDICT] PASS`，exit 0 | `bash scripts/check-release.sh kb-context` |

## ⑥ 提交与红线

- 零 tag（`git tag -l kb-context-v0.5.0` = 0）、零 push（合并仅本地）、零 `gh release`——发版五步④⑤ 逐次用户确认后另行执行。
- `他人未提交工作树改动绝不卷入`：`.gitignore` 经 stash 隔离后 pop 还原；`dsh-github-ops/ledger.md`、`obsidian-web/*`、`wiki-steward/changes/*` 等他人改动 merge 未触碰、commit 未包含。
- 触发日志功能代码零新改（out of scope：t5/t6 回路终态为准）；注释内「0.4.0」字样指功能原定波次号（非包版本），按 out-of-scope 不动码，此处留痕。
