# test/fixtures/real/ — 真页 SERP 回归库（C1 技术债，Task 28 / t16）

> 取样为**一次性显式动作**（2026-10-09，curl + Chrome UA，中性查询词）；样本入库后测试**离线可绿**（K-15：`node --test` 默认集零出网）。
> 合成样本（`test/fixtures/*.html` 根级）保留不动，既有测试续命；本目录只增不改（真页锚定 0.2.x 解析契约）。

## 样本清单

| 文件 | 源 | 取样 URL（入库前已脱敏） | 结果条数 |
|---|---|---|---|
| `ddg-kubernetes.html` | ddg | `html.duckduckgo.com/html/?q=…`（HTTP 200，33KB 原样） | 10 |
| `ddg-postgresql.html` | ddg | 同上，第二查询词（200，33KB） | 10 |
| `bing-kubernetes.html` | bing | `cn.bing.com/search?q=…`（200，100KB） | 10 |
| `bing-postgresql.html` | bing | 同上，第二查询词（200，100KB） | 10 |
| `so360-kubernetes.html` | so360 | `www.so.com/s?q=…`（200，538KB；`/search` 入口 404，legacy `/s` 命中真页） | 6 |

**baidu 缺口（如实记录）**：`www.baidu.com/s?wd=…` 返回「百度安全验证」挑战页（1.5KB）——命中反爬**即停不硬刚（K-5/INV-5）**，wayback 存档检索 3 轮预算内无 >40KB 真页。baidu 真页入库 = 后续人工动作：人手在浏览器打开百度 SERP 另存后交给实现卡脱敏入库（禁含真实查询词）。

## 脱敏步骤（K-4/INV-4：入库零查询词/会话/凭据痕迹）

一次性脚本 `/tmp/t16-scrub.mjs`（不入库，零第三方依赖）执行：

1. 剥 `<script>` / `<style>` / 注释 / preload·preconnect 外链（解析器不执行 JS，结构保留）；
2. 查询词（`kubernetes` / `postgresql`，大小写不敏感）全字面 → `redacted` 占位；
3. `&amp;` 分隔符归一后，按名字模式整对剥离跟踪/会话参数（`rsv_*` / `rut` / `srcid` / `spm` / `gclid` / `sid` / `eqid` 等 ~90 个）；
4. 凭据/会话独立词面（`token|session|password|secret|cookie|guid|uuid|nonce|jwt` 含复数）→ `redacted`；
5. 长 hex（≥16，含图片 CDN 路径内容哈希）/ GUID / 长数字（≥12）→ `ID`；URL 残空参规整。

**入库审计（全部 0 命中，命令见证据）**：查询词、`token`、`session`、`password`、`secret`、`cookie`、`guid|uuid`、`BAIDUID|MUID|SRCHD|PHPSESSID`、`rut=`、长 hex（无边界）、长数字。

## 使用

`test/fixture-real-pages.test.mjs` 离线加载本目录样本，跑四源 `parseSerp` 断言 url/title/snippet 齐全非空 + 脱敏审计 + 零出网（fetch 打桩抛错）。
