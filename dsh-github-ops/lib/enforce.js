// dsh-github-ops/enforce.js —— GitHub token 强制层的纯决策逻辑（无副作用、可单测）
// 设计来源：
//   github/github-mcp-server —— API 主机清单、read-only 边界、"工具即认证"的构造性安全观
//   dsh-subprocess 凭据擦除研究 —— GH_TOKEN/GITHUB_TOKEN 环境变量到不了 bash 子进程，
//     所以强制层只走两条存活路径：gh CLI（hosts.yml）与 `$(gh auth token)` 命令替换
//     （token 值不出现在命令字符串里 → 不进日志/rtk recall/会话记录）
//   DeepTrial/dsh-bash-rtk —— 保守放行原则：不确定就不改写（fail-open）

/** web_fetch 永远匿名且带不了 token（dsh-web-fetch-http 硬约束）——这些主机必须走 gh/工具 */
export const API_HOSTS = [
  'api.github.com',
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
];

const AUTH_HEADER_MARKER = /Authorization:|gh auth token/i;
const API_URL = /\bhttps?:\/\/(api\.github\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com|codeload\.github\.com|objects\.githubusercontent\.com)\b/i;
const CLONE_URL = /\bhttps?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[?\s]|$)/;

/**
 * web_fetch 抓 GitHub API/原始文件主机的门禁决策。
 * @param {string} url
 * @returns {{action: 'allow'} | {action: 'deny', reason: string}}
 */
export function gateWebFetch(url) {
  let host
  try {
    host = new URL(String(url)).hostname.toLowerCase()
  } catch {
    return { action: 'allow' }
  }
  if (API_HOSTS.includes(host) || host.endsWith('.githubusercontent.com')) {
    return {
      action: 'deny',
      reason:
        `web_fetch 对 ${host} 只能匿名访问（无法携带 GitHub token，匿名限额 60/h 且本机代理出口已耗尽）。` +
        '请改用带认证的通道：github_repo_* 工具，或 bash 里 `gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH`。' +
        '(确实需要匿名抓取时可临时用 bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)',
    }
  }
  return { action: 'allow' }
}

/**
 * 命令级改写：让 GitHub 相关的 shell 命令默认走 token 模式。
 * 只做两类安全改写，其余一律放行：
 *   ① curl/wget 打 GitHub API/原始文件 → 注入 `Authorization: Bearer $(gh auth token)` 头
 *      （token 由 gh 在运行时给出，值不落入命令字符串/日志/recall）
 *   ② `git clone https://github.com/o/r` → `gh repo clone o/r`（凭据由 gh 托管）
 * @param {string} command
 * @returns {{command: string, changed: boolean, note?: string}}
 */
export function rewriteGithubCommand(command) {
  const cmd = String(command ?? '')
  const trimmed = cmd.trim()
  if (!trimmed) return { command: cmd, changed: false }

  // ① 已认证 / 已是 gh 形式 → 放行
  if (AUTH_HEADER_MARKER.test(trimmed) || /(^|\s)gh(\s|$)/.test(trimmed)) {
    return { command: cmd, changed: false }
  }

  // ② curl / wget → 注入认证头（仅当首 token 就是 curl/wget：环境变量前缀等复杂形式保守放行）
  const first = trimmed.match(/^(curl|wget)\s/)
  if (first && API_URL.test(trimmed)) {
    const tool = first[1]
    const rest = trimmed.slice(tool.length).trim()
    const injected =
      tool === 'curl'
        ? `curl -H "Authorization: Bearer $(gh auth token)" ${rest}`
        : `wget --header="Authorization: Bearer $(gh auth token)" ${rest}`
    return { command: injected, changed: true, note: 'api-auth-header' }
  }

  // ③ git clone https://github.com/o/r → gh repo clone（https + 字面 URL 才改；ssh/替换式放行）
  const clone = trimmed.match(/^git\s+clone\s+(\S.*)$/)
  if (clone && !trimmed.includes('$') && !trimmed.includes('`')) {
    const args = clone[1]
    const m = args.match(CLONE_URL)
    if (m && /^https?:\/\/github\.com\//i.test(args.trim())) {
      const repo = `${m[1]}/${m[2]}`
      const rest = args.replace(CLONE_URL, '').trim()
      return { command: `gh repo clone ${repo}${rest ? ` ${rest}` : ''}`, changed: true, note: 'clone-via-gh' }
    }
  }

  return { command: cmd, changed: false }
}

/** 是否是打 GitHub API 的命令（供日志/统计/测试观察）。 */
export function targetsGithubApi(command) {
  return API_URL.test(String(command ?? ''))
}
