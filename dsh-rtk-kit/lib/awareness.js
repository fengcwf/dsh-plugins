// dsh-rtk-kit/awareness.js —— 会话启动注入的提示文本（三档）
// 文本骨架取自 rtk-ai/rtk hooks/rtk-awareness-full.md（Apache-2.0），改写为 dsh 语境：
// - 自动改写已在 resolve() 层完成，模型不需要主动敲 `rtk` 前缀（这是与 rules 层的核心差异）；
// - 保留恢复路径（rtk recall / rtk proxy / RTK_DISABLED=1）与"压缩输出按完整结果对待"的读法。

/** @typedef {'default' | 'high' | 'full'} AwarenessLevel */

const HEAD = `# 命令输出说明（RTK 压缩）

这里的 shell 命令输出经过 RTK（Rust Token Killer）过滤压缩以节省 token：保留全部信号、去掉噪声（git/cargo/pytest 等按失败与统计收敛）。**把它当作完整结果**：正常继续工作，相关命令可批量合并到一次调用。被截断的结果会自带恢复提示（形如 \`rtk recall <hash>\`），照抄执行即可取回全量输出。仅当结果明显不可用（本该有输出却为空、与退出码矛盾、乱码）时，用 \`rtk proxy <cmd>\` 无过滤重跑，或用 \`RTK_DISABLED=1 <cmd>\` 绕过一次。`;

const HIGH = `

## 逃生舱（按需使用）
- \`rtk gain\` / \`rtk gain --history\` —— 查看压缩收益统计
- \`rtk proxy <cmd>\` —— 无过滤执行（仍计统计）
- \`RTK_DISABLED=1 <cmd>\` —— 单条命令禁用 RTK
- \`rtk recall <hash>\` —— 取回被截断的全量输出`;

const FULL = `

## 手动前缀（备用）
自动改写失效时（例如在非托管 shell 里手工执行），可显式加前缀：\`rtk git status\`、\`rtk cargo test\`。无过滤器的命令加了前缀也原样执行，前缀总是安全的。`;

/**
 * @param {AwarenessLevel} level
 * @returns {string} 注入文本；'off' 语义由调用方处理（返回空串）
 */
export function awarenessText(level = 'default') {
  if (level === 'off') return '';
  let text = HEAD;
  if (level === 'high' || level === 'full') text += HIGH;
  if (level === 'full') text += FULL;
  return text;
}
