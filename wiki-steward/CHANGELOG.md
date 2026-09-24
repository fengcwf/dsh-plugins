# CHANGELOG — wiki-steward

## 0.1.0 — 2026-09-25

初版：插件骨架（壳）、全量脱敏与写安全共享层（Task 8）。

- `package.json`（`dsh.bundle.patch`）+ `cordis.patch.yml` insert 行 `{id: wiki-steward, name: wiki-steward, config: 全部键}`（config 整行替换语义，自带全键）
- `lib/index.js`：导出 `name` / `inject` / `Config`(zod) / `apply`；**default 导出 `{inject, apply}` 对象**（R13 教训：工厂函数形态会被宿主静默忽略）；`inject = []`（壳期零宿主服务依赖，T11/T12 扩 tools）
- `Config` 全键：`capture{bufferRounds,enabled}`、`write{readOnly}`、`queue{maxRetries,ttlDays}`、`secrets{enabled}`（delta-spec §2）
- `apply`：配置防御性校验——非法配置留痕告警后 fail-open（INV-15 禁静默）；业务接线留缝 T9-T13
- `lib/secrets.js`：三层脱敏（①PEM 整块 ②赋值形态保 key 名 ③token 形态）+ `<redacted>` 占位符 + 计数 + `SENSITIVE_PATTERNS` 导出（INV-11；宁漏不误伤护栏）
- `lib/fs-safe.js`：写安全共享基元 `writeAtomic`/`withFileLock`/`realpathGuard`/`journalSave`+`journalRollback`（冲突扫描裁定：T11 kb_mark 与 T12 CRUD 消费，不重复实现）
- `test/load.test.mjs` + `test/secrets.test.mjs` + `test/fs-safe.test.mjs`：加载冒烟 / 哨兵中和与 lookalike 反例 / 原子写清残、锁互斥、围栏负例、journal 往返
- 零第三方运行时依赖：zod / `@deepseek-ai/*` 走 peer+dev 双声明（devDep `link:` 宿主运行时副本，kb-context 同款形态）
- 本版不含捕获/校验/回写/CRUD/队列/告警业务模块（`lib/capture|buffer|validate|mark|crud|queue|alert.js`），留待 T9-T14
