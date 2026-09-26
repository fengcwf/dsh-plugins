# CHANGELOG — wiki-steward

## 0.2.0 — 2026-09-24

首个功能版：捕获/校验/回写/CRUD/队列/拦截全量交付（0.1.0 壳版留待面全部落地）+ 终审遗留清障批。

- **捕获**（`lib/capture.js` / `lib/buffer.js`）：会话事件捕获入 raw/（`agent/session-start`/`session/event`/`agent/turn-stopping` 三缝）、轮次缓冲（bufferRounds 轮攒批、turn 槽=sessionId+最老未落盘轮、dedupKey `sessionKey+\n+turn` 防碰撞、turn-stopping 强制收口、session/disposed 双清）；全量脱敏先行（secrets 三层）
- **校验**（`lib/validate.js`）：`kb_validate` 六规则——frontmatter 六字段（solutions 增 reusability/项目文档 status 词表）、index 双向（登记形统一解析 Obsidian 语义+vault-root 回退+stem 多命中歧义 warn）、naming 类型化命名表（硬禁 error/形态欠账 warn）、placement 归属表禁令、structure 四段+wikilink 语法（fence 豁免）、evidence 证据清单（INV-15，wiki/ 域限定）；`quickCheck`/`quickFindings` 分级快检缝（T14 分流消费，severity 分级）；判定面收窄（reference/项目文档/infra 豁免）
- **回写**（`lib/mark.js`）：`kb_mark` sha256 原子回写——两态字节手术（换值只动值字节/缺行补插闭合 `---` 前）、`expectedRevision` 乐观并发（冲突拒不覆盖）、fs-safe 原子写、写后三层校验（未动段 hash + 值段字节 + 行形 prefix/suffix strip 区，写坏=write-corrupt+journal 逆放）、幂等同值零写盘、无 frontmatter/多 sha256 行歧义拒
- **CRUD**（`lib/crud.js`）：`wiki_write`/`wiki_delete`/`wiki_rename`——realpath 四步围栏+全链逐段防 symlink 逃逸、统一覆盖语义（缺省拒 target-exists）、delete→`.trash/<rel>` 可逆+双确认（confirm=路径复述）+落点 O_EXCL 占位防窄窗覆盖+冲突改名 `.N`、rename=journal 多文件事务（改前快照/批量失败即中止回滚/锁内 RMW 不吞并发/rolledBack 诚实位）+wikilink 全库重写四设计（歧义不动/捕获组回填/风格保持/不制造新歧义）、vaultRoot 必传+默认只读（INV-7）
- **队列/告警**（`lib/queue.js` / `lib/alert.js`）：入队 tmp+rename 原子、flush 重试 maxRetries、ttlDays 过期清理、告警留痕（INV-15 禁静默）
- **拦截**（`lib/gate.js`）：`tools/pre-execute` 判定矩阵（allow/ask/deny 三态无输入改写）——readOnly vault 写类全 deny 早拦、新建不合指引 deny+指路、存量页问题 ask 不阻塞修复、非 vault/读工具零快检放行、edit 补丁外推按编辑后内容判、异常 fail-open 留痕
- **共享层**：`lib/secrets.js` 三层脱敏+占位符+计数；`lib/fs-safe.js` 写安全基元——`writeAtomic`（wx 独占+双 fsync+rename+失败清残）、`withFileLock`/`withLeaseLock`（lease 时间戳 stale 自愈+超时接管留痕）、`realpathGuard`（形式拒→归一→归属→dangling 外指逐段判逃逸）、`journalSave`/`journalRollback`（content+sha256+mode 快照、逆放+幂等）
- **遗留清障批（终审 deferred 收口）**：`journalRollback` 写后 fchmod 精确还原 mode（不受 umask 截损，双 umask 口径同判）；`withLeaseLock` 释放=成功 `unlink(lease.json)` 原子放弃+锁目录实例门（dev+inode）——「绝不拆新持有者」结构性成立；`.trash` 落点 O_EXCL 占位（wx 文件/mkdir 目录独占后 rename 覆盖占位=唯一落点）；CJK 判据补扩展 B+ 代理对区段（纯扩展 B 命名不误报）；`collectMd`/`listWikiMd` readdir 失败 io 留痕（校验/改写漏报面收口）；⑥证据规则收窄 wiki/ 域（`wikiRel !== null` 一门，raw/ 捕获产物不触发）；⑥引用行判据收紧（fence/代码块内行不算，引用行须正文）；mark 行形核 prefix/suffix strip 区字节不变；INDEX `key=''` 畸形登记→歧义拒（不再静默 continue）；kb_mark 失败原因枚举死项 `read-only` 清理；gate reason 去裁定黑话
- 测试 245/245（load/secrets/fs-safe/capture/buffer/validate/mark/crud/queue/alert/gate/wire——mkdtemp 真文件系统零 mock，故障注入仅 _write/_failAt/_beforeApply/_readdir/_probe 缝；双 umask 口径复核）

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
