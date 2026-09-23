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

if [ -n "$(git -C "$repo_root" status --porcelain 2>/dev/null)" ]; then
  echo "[NOTE] 工作树有未提交变更 —— push 前提交"
fi
echo "---"
if [ "$fail" -eq 0 ]; then echo "[VERDICT] PASS"; else echo "[VERDICT] FAIL —— 版本纪律：版本号+更新记录+README 同步缺一不可"; fi
exit $fail
