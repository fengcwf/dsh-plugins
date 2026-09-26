// vault-ops — vault 读写/改名/移动/删除/导出（占位，T4-T7 与 T12 在此实现）
// 契约（delta-specs/obsidian-web.md §2）：
//   - 保存 save(path, content, {expectedMtime|etag}) → 成功 | {conflict, diffUndo}（OW-INV-3 乐观锁）
//   - 改名/移动 rename(from, to, {overwrite?}) → journal 事务 {ok, rolledBack, warnings}（OW-INV-4）
//   - 删除走 .trash 可逆 + 双确认（OW-INV-5）；下载 zip ≤5000 文件/500MB 超限拒（OW-INV-9）
// 写安全：一律 @deepseek-ai/dsh-atomic-write（writeFileAtomic + withFileLock，fs-safe 语义内建）；
// 路径围栏：vaultRoot 下 realpath 拒穿越/symlink 逃逸（OW-INV-7，T12）。
export {}
