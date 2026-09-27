#!/bin/bash
#=============================================================
# check-release.sh — 发版纪律体检：版本号 + 更新记录缺一不可
# 用法: bash scripts/check-release.sh <插件名>
# 对齐: package.json version <-> CHANGELOG.md 条目 <-> 根 README 版本表 <-> tag
#=============================================================
set -u
repo_root=$(cd "$(dirname "$0")/.." && pwd)
name=${1:?用法: check-release.sh <插件名>}
d="$repo_root/$name"
fail=0
ok()  { echo "[PASS] $1"; }
bad() { echo "[FAIL] $1"; fail=1; }

[ -d "$d" ] || { bad "无此插件目录: $name"; exit 1; }
ver=$(node -e "console.log(require('$d/package.json').version||'')")
if [ -n "$ver" ]; then ok "package.json version = $ver"; else bad "package.json 缺 version"; fi

if grep -qE "^##[[:space:]]+$ver" "$d/CHANGELOG.md" 2>/dev/null; then
  ok "CHANGELOG.md 含 '## $ver' 更新记录"
else
  bad "CHANGELOG.md 缺 '## $ver' 更新记录 —— 发版必须记录更新内容"
fi

if grep -qE "$name.*$ver" "$repo_root/README.md" 2>/dev/null; then
  ok "根 README.md 版本表已同步"
else
  bad "根 README.md 版本表未同步 $name $ver"
fi

tag="$name-v$ver"
if git -C "$repo_root" rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
  ok "tag $tag 已存在"
else
  echo "[TODO] tag $tag 尚未创建 —— push 前执行: git tag $tag"
fi

#--- dist 新鲜度锁（T14 fix r1）：web 源变更必伴 web/dist 同 commit 重建（commit 级校验）---
# 基线选型：上个插件 tag（git describe --match "$name-v*"）；无 tag=未发版窗口=全历史逐 commit。
# 构建输入=web/src/**、web/index.html、web/vite.config.js（web/README.md 非构建输入不触发）；merge commit 不计入。
src_pat="^$name/web/(src/|index\.html$|vite\.config\.js$)"
dist_pat="^$name/web/dist/"
if base=$(git -C "$repo_root" describe --tags --abbrev=0 --match "$name-v*" HEAD 2>/dev/null); then
  window_desc="基线=上个 tag $base"
  commits=$(git -C "$repo_root" rev-list --no-merges "$base"..HEAD)
else
  window_desc="基线=无 tag（未发版窗口=全历史）"
  commits=$(git -C "$repo_root" rev-list --no-merges HEAD)
fi
src_commits=0
stale=0
for c in $commits; do
  files=$(git -C "$repo_root" diff-tree --root --no-commit-id --name-only -r "$c")
  if echo "$files" | grep -qE "$src_pat"; then
    src_commits=$((src_commits+1))
    if ! echo "$files" | grep -qE "$dist_pat"; then
      stale=1
      bad "commit ${c:0:7} 改 web 源未重建 dist —— 重建 dist 同 commit（npm run build 后把 $name/web/dist 同 commit 入库）"
    fi
  fi
done
if [ "$src_commits" -eq 0 ]; then
  echo "[PASS] dist 新鲜度锁：窗口内无 web 源变更，不触发（$window_desc）"
elif [ "$stale" -eq 0 ]; then
  ok "dist 新鲜度锁：$src_commits 个 web 源变更 commit 均伴 web/dist 同 commit（$window_desc）"
fi

if [ -n "$(git -C "$repo_root" status --porcelain 2>/dev/null)" ]; then
  echo "[NOTE] 工作树有未提交变更 —— push 前提交"
fi
echo "---"
if [ "$fail" -eq 0 ]; then echo "[VERDICT] PASS"; else echo "[VERDICT] FAIL —— 版本纪律：版本号+更新记录+README 同步缺一不可"; fi
exit $fail
