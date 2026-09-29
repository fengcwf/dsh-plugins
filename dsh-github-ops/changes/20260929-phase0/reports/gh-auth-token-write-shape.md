# gh auth login --with-token 写入形实测（R-1 前置实测钉死）

> 日期：2026-09-29　执行：Task 10（coder）　依据：TECH.md R-1 / ADR-003 / constitution P-10
> 目的：`--with-token` 失败形（退出码 / stderr 形）仅文档 🔴 → 用一次性假 token 经真 gh 二进制实测钉死，供 lib/gh-auth.js 分级 hint 与错误码判定使用。

## 实测环境与隔离纪律

- gh 版本：`gh version 2.90.0 (2026-04-16)`
- **隔离**：每组实测 `GH_CONFIG_DIR=$(mktemp -d /tmp/gh-shape-XXXXXX)` 一次性临时目录；**真实 `/root/.config/gh/hosts.yml` 全程未触碰**（所有命令显式 `unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GH_HOST`）。
- **假 token（一次性，用后即弃，P-10）**：`ghp_faketoken_for_shape_test_only`；另测无前缀垃圾串 `not-a-real-token-abc`。全程零真实 token 进入命令/日志/本文档。
- 所有实测命令 stdout/stderr 原样记录（仅 hosts.yml 观察视图做过 `oauth_token:` → `<SEEN-PRESENT>` 替换）。

## 实测结果（退出码 + stderr 形）

| # | 输入 | 退出码 | stdout | stderr 形（原文） | hosts.yml 副作用 |
|---|------|--------|--------|-------------------|------------------|
| T1 | 假 token `ghp_…` 经 stdin | **1** | 空 | `error validating token: HTTP 401: Bad credentials (https://api.github.com/)`↵ `Try authenticating with:  gh auth login` | **未写入**（temp 目录无 hosts.yml） |
| T2 | **空 stdin** | **124**（被 `timeout` 杀） | 空 | `! First copy your one-time code: XXXX-XXXX`↵ `Open this URL to continue in your web browser: https://github.com/login/device` | 未写入 |
| T3 | 垃圾 token（无前缀）经 stdin | **1** | 空 | 同 T1 | 未写入 |
| T4 | 空 stdin + runGh 恒定 env（`GH_PROMPT_DISABLED=1 NO_COLOR=1 PAGER=cat`） | **124** | 空 | 同 T2（**GH_PROMPT_DISABLED 拦不住设备码流程**） | 未写入 |
| T5 | 假 token + runGh 恒定 env | **1** | 空 | 同 T1（env 不改失败形） | 未写入 |
| T6 | 假 token + `--hostname github.example.invalid` | **1** | 空 | `error validating token: Get "https://github.example.invalid/api/v3/": EOF` | 未写入 |

### 附带实测（探针 argv 可行性，同批次）

| # | 命令 | 结果 |
|---|------|------|
| T9 | `gh auth status --json hosts`（假 hosts.yml + 假 token） | **exit 0**（`--json` 恒 0，认证问题不反映在退出码）；stdout：`{"hosts":{"github.com":[{"state":"error","error":"HTTP 401: Bad credentials (https://api.github.com/)","active":true,"host":"github.com","login":"shape_probe_user","tokenSource":"<GH_CONFIG_DIR>/hosts.yml","gitProtocol":"https"}]}}` |
| T10 | `gh auth status`（无 --json，对照） | exit 1；stderr 文本形含 `X Failed to log in to github.com account shape_probe_user (…)` / `The token in … is invalid.`（含 `--show-token` 之外的路径提示，零 token 值） |
| T11 | `gh auth status --json hosts`（空配置目录） | exit 0；stdout `{"hosts":{}}`；stderr `You are not logged into any GitHub hosts. To log in, run: gh auth login` |
| T8 | `gh auth switch --help` | 存在（本机 gh 2.90），FLAGS 含 `-u, --user string`（R-3 本机非降级） |
| — | Node `spawnSync` 超 maxBuffer=4MiB | `error.code='ENOBUFS'`、`status=null`、`signal='SIGTERM'`、stdout 截断 ≈ 4.1MiB（4202560B） |

## 结论（钉死，进实现）

1. **失败形（坏 token）**：`gh auth login --with-token` 退出码 **1**；stderr 第一行 `error validating token: HTTP 401: Bad credentials (https://api.github.com/)`，第二行 `Try authenticating with:  gh auth login`。**不写 hosts.yml**（无半写状态残留）→ 分级 hint「401 token 无效/过期」+ 错误码 `GHO-TOKEN-03`。
2. **空 stdin 是陷阱而非失败**：`--with-token` 遇空 stdin 会**掉进设备码交互流程**（打印 one-time code 后挂起直到被杀），`GH_PROMPT_DISABLED=1` 拦不住。→ `writeToken()` **必须在调 gh 之前拒绝空/纯空白 token**（INV-4「留空=不修改」的下层守卫），绝不把空 token 传给 gh。
3. **失败形（网络/主机不可达）**：stderr `error validating token: Get "<url>": <err>`，退出码 1 → 归入「写入失败/验证失败」分级（`GHO-TOKEN-06` 或按 stderr 中 `HTTP NNN` 归401/403/429）。
4. **成功形在 P-10 约束下不可达**：gh 一律先经 API 验证 token（T6 证明假 hostname 也走网络验证），真 token 禁入测试 → 成功形以「退出码 0」判定，单测用假 gh 脚本覆盖成功分支（诚实边界，非遗漏）。
5. **探针① `gh auth status --json hosts` 语义**：`--json` 下**退出码恒 0**（帮助原文："when using the `--json` option, the command will always exit with zero regardless of any authentication issues"）→ stage 判据必须解析 JSON `state` 字段而非退出码；无账号形 = `{"hosts":{}}` + stderr 引导语。输出含 `state/error/active/host/login/tokenSource/gitProtocol`，**零 token 值**（与 parseHostsMeta 只判 oauth_token 在位一致）。
6. **探针② `gh api user` 401 判据**（ADR-004）与 T9 的 `state:"error"` 并存 → stage-1 只判「配置在位」（hosts 非空 + 有 login），`state:"error"` 记录进 message 但不截停，让 401/403/429 归因落在 `auth-connect`（对齐 ADR-004「②401=坏 token」）。
7. **`gh auth switch --user` 本机存在**（gh 2.90）；降级判定（gh<2.20）按 stderr 匹配 `unknown command`/`unknown flag`/`unrecognized` 形 → 降级提示手工切换（R-3）。
8. **maxBuffer 溢出形**：`ENOBUFS` + SIGTERM + stdout 截断（≈4.1MiB）→ runGh 归一为 `status=1` + `errorCode='ENOBUFS'`，输出天然有界（INV-1 返回值有界）。

## P-10 / 红线合规声明

- 本次实测仅使用一次性假值 `ghp_faketoken_for_shape_test_only` 与无前缀垃圾串，**零真实 token** 进入 argv/stdin/日志/文档。
- 全部写入面隔离在 `/tmp/gh-shape-*` 一次性目录；实测后即清理；真实 `~/.config/gh/hosts.yml` 未被读写。
- 测试代码（test/gh-auth.test.mjs）同样只用假值，并断言所有返回值/日志投影零明文（token 形态串扫描）。
