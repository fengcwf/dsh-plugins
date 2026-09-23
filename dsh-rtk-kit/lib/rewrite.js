// dsh-rtk-kit/rewrite.js —— 纯决策逻辑（无副作用、可单测）
// 设计来源：
//   rtk-ai/rtk           —— `rtk rewrite` 单一事实源（链式命令感知）、recall/逃生舱约定
//   DeepTrial/dsh-bash-rtk —— 三重守卫（复杂度/白名单/可用性）、rtk 缺失时恒等回退
// 我们的改进：路由交给 `rtk rewrite`（上游大脑，支持 `a && b` 链式改写），
// 本地只做"该不该问 rtk"的保守判定；并修掉社区实现的两个坑：
//   ① `rtk rewrite` 0.49.0 成功时 exit code = 3（≠ 文档的 0）→ 只认"非空 stdout"；
//   ② hook-runner 也会走 ctx.shell.resolve → 用 `request.stdin != null` 识别非模型调用并放行。

/** 保守模式下会改变"输出被谁消费"的 shell 元字符（管道/重定向/替换/子命令）。 */
const UNSAFE_METACHAR = /[|;<>`$]/;

/** 命令首 token（不含环境变量前缀特判；带前缀的复杂形式直接走保守放行）。 */
export function firstToken(command) {
  const m = String(command ?? '').trim().match(/^(\S+)/);
  return m ? m[1] : undefined;
}

/**
 * 判定一条 shell 命令是否适合交给 `rtk rewrite`。
 * @param {string} command - 原始 shell 源码。
 * @param {{conservative?: boolean, exclude?: string[]}} [opts]
 * @returns {{eligible: boolean, reason?: string}}
 */
export function decideEligibility(command, opts = {}) {
  const { conservative = true, exclude = [] } = opts;
  const cmd = String(command ?? '').trim();
  if (!cmd) return { eligible: false, reason: 'empty' };
  if (/(^|\s)RTK_DISABLED=/.test(cmd)) return { eligible: false, reason: 'disabled-by-env' };
  if (/^\s*rtk(\s|$)/.test(cmd)) return { eligible: false, reason: 'already-rtk' };
  if (/\brtk rewrite\b/.test(cmd)) return { eligible: false, reason: 'rewriter-itself' };
  if (exclude.some((x) => x && (cmd === x || cmd.startsWith(`${x} `) || cmd.startsWith(`${x}\t`)))) {
    return { eligible: false, reason: 'excluded' };
  }
  // 含凭据替换（如 $(gh auth token)）的命令不碰：避免输出过滤干扰敏感调用
  if (/gh auth token|GH_TOKEN|GITHUB_TOKEN/.test(cmd)) return { eligible: false, reason: 'credential-bearing' };
  if (conservative && UNSAFE_METACHAR.test(cmd)) return { eligible: false, reason: 'shell-metachar' };
  return { eligible: true };
}

/**
 * 从 `rtk rewrite` 的输出提取改写命令。
 * ⚠️ 以"非空 stdout"为准，不看 exit code（0.49.0 成功码 = 3，与官方文档不符）。
 * @param {string} stdout
 * @returns {string | undefined}
 */
export function pickRewritten(stdout) {
  const line = String(stdout ?? '')
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  return line || undefined;
}

/** 改写结果必须仍以 `rtk ` 开头（防意外输出导致递归包裹）。 */
export function isSafeRewrite(original, rewritten) {
  if (typeof rewritten !== 'string' || rewritten.length === 0) return false;
  if (!/^\s*rtk(\s|$)/.test(rewritten)) return false;
  if (rewritten.includes('\n') || rewritten.includes('\0')) return false;
  if (rewritten.trim() === original.trim()) return false; // 恒等改写无意义
  return true;
}

/** 组合：eligibility + 输出校验的统一入口（供 index.js 与测试复用）。 */
export function planRewrite(command, rewriteOutput, opts = {}) {
  const d = decideEligibility(command, opts);
  if (!d.eligible) return { action: 'passthrough', reason: d.reason };
  const rewritten = pickRewritten(rewriteOutput);
  if (!isSafeRewrite(String(command ?? ''), rewritten)) {
    return { action: 'passthrough', reason: rewritten ? 'unsafe-rewrite' : 'no-rewrite' };
  }
  return { action: 'rewrite', command: rewritten };
}
