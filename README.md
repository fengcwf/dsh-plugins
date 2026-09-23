# dsh-plugins

fengcwf 的 dsh 插件 monorepo。每个子目录一个可安装的 dsh 组合包（bundle），**git 快照安装**进 dsh profile（不使用 link: 模式）。

| 插件 | 版本 | 职责 |
|---|---|---|
| [dsh-rtk-kit](dsh-rtk-kit/) | 0.2.0 | RTK 集成：bash 命令自动改写走 rtk 压缩（resolve 缝、fail-open）+ 会话 awareness + rtk_doctor 诊断 |
| [dsh-github-ops](dsh-github-ops/) | 0.2.0 | GitHub 集成：GitHub 命令强制 token 模式 + web_fetch 匿名 API 门禁 + 11 个仓库管理工具（gh 后端） |

## 版本纪律（强制，缺一不可）

**每次更新必须同时**：

1. `package.json` 的 `version` bump（semver）
2. 插件目录 `CHANGELOG.md` 加一条 `## <版本> — <日期>` 更新记录
3. 本 README 版本表同步
4. 提交并打 tag **`<插件名>-v<版本>`**（如 `dsh-rtk-kit-v0.2.0`）
5. `bash scripts/check-release.sh <插件名>` PASS 后才 push

## 安装 / 更新（本地 dsh profile）

```bash
# 安装/更新 = 钉版本的 git 快照（升级 = 换新 tag 重执行同一条命令）
dsh plugin --profile web add 'github:fengcwf/dsh-plugins#dsh-rtk-kit-v0.2.0&path:dsh-rtk-kit'
dsh plugin --profile web add 'github:fengcwf/dsh-plugins#dsh-github-ops-v0.2.0&path:dsh-github-ops'
/root/.dsh/start-dsh.sh        # 重启生效（会闪断会话，选空档执行）

# 卸载
dsh plugin --profile web remove dsh-rtk-kit
```

git 快照安装自动代装 `dependencies`（zod 等）；`@deepseek-ai/*` 为 peer，由 dsh 运行时拦截层共享宿主实例。

## 开发

```bash
cd ~/.dsh/plugins/dsh-plugins/<插件名>
pnpm install      # checkout 自持 node_modules（官方约定；devDep 副本供独立测试）
node --test       # 必含 load.test.mjs 加载冒烟（防"测试全绿但起不来"）
bash ../scripts/check-release.sh <插件名>   # 发版纪律体检
```
