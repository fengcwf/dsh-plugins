// share — 分享令牌/角色/密码/到期/撤销（占位，T8 在此实现）
// 契约（delta-specs §2 + PRODUCT OW-INV-1/2/2b）：
//   分享条目 {token, target: file|dir, role: 'read'|'write', passwordHash?, expiresAt?, oneShot, revoked, createdAt}
//   - token 不可枚举（≥128bit 随机）；持久化落 vault `.ob-share/` 或配置目录（Phase 4 定稿），0600
//   - 逐条显式生成、默认不对外；role=write ⇒ 访问密码必填；敏感文件名永禁分享
//   - 校验失败/过期/撤销 → 404 不泄露存在性；每 IP 120/min 限流
export {}
