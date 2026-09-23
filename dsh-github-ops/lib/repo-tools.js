// dsh-github-ops/repo-tools.js —— 仓库管理工具集（纯逻辑：gh 参数构造 + 紧凑渲染，可单测）
// 设计来源：
//   github/github-mcp-server —— 工具命名规范（get_/list_/search_/create_…）、工具描述里写选型指导、
//                               输出投影裁剪（--jq）控制 token；read-only 与写操作边界清晰
//   PivotStackIntelligence/dsh-github —— 仓库管理的操作面清单（branch/remotes/tags/stash 生命周期）、
//                               危险写操作必须显式确认、操作后状态刷新
//   rtk（token 负担哲学）    —— 一切输出先想"模型读它要花多少 token"
// 我们的取舍：只做 gh 已覆盖的仓库生命周期操作（10 个工具 ≈ 2k token schema，
// 对比 GitHub MCP 默认 45 工具 ≈ 12.8k token/请求）；输出全部经 --jq/裁剪；
// delete/archive 双重门禁（confirm 参数 + 配置开关）；永不提供任意 shell 透传。

const LIST_JQ = '.[] | "\\(.nameWithOwner)\\t\\(.visibility)\\t⭐\\(.stargazerCount)\\t\\(.updatedAt[:10])\\t\\((.description // "") | .[0:70])"'
const SEARCH_JQ = '.[] | "\\(.fullName)\\t⭐\\(.stargazersCount)\\t\\(.updatedAt[:10])\\t\\((.description // "") | .[0:70])"'
const INFO_JQ = '"repo: \\(.nameWithOwner)  \\(.visibility)  ⭐\\(.stargazerCount)  forks:\\(.forkCount)\\nbranch: \\(.defaultBranchRef.name // "?")  updated: \\(.updatedAt[:10])\\ndesc: \\(.description // "(none)")\\nurl: \\(.url)"'

/** 默认渲染：拼接各步输出，非零退出码显式标注（沿用 dsh bash 工具的 exit-code 约定）。 */
export function renderSteps(steps, cap = 6000) {
  const parts = []
  for (const s of steps) {
    let text = (s.stdout ?? '').trim()
    if (s.status !== 0) {
      const err = (s.stderr ?? '').trim()
      text = `${text}${text && err ? '\n' : ''}${err}`
    }
    if (text.length > cap) text = `${text.slice(0, cap)}\n[...truncated ${text.length - cap} chars]`
    parts.push(s.status === 0 ? text || '(no output)' : `${text}\n[exit code: ${s.status}]`)
  }
  return parts.join('\n')
}

/**
 * 工具规格表。`commands(args)` 产出依次执行的 gh argv 数组；
 * 抛错 = 拒绝执行（渲染为工具错误，模型可见）。
 * @type {Array<{name: string, description: string, parameters: object, commands: (a: any, cfg: any) => string[][]}>}
 */
export const GITHUB_TOOL_SPECS = [
  {
    name: 'github_auth_status',
    description:
      'Show GitHub authentication status and remaining API quota (authenticated core = 5000/h vs anonymous 60/h). Use first when GitHub access fails with 403/429.',
    parameters: {},
    commands: () => [
      ['auth', 'status'],
      ['api', 'rate_limit', '--jq', '{core: .resources.core, search: .resources.search}'],
    ],
  },
  {
    name: 'github_repo_list',
    description: "List GitHub repositories for a user/org (default: the authenticated user). Compact one-line-per-repo output. Prefer this over web_fetch/curl for repo discovery.",
    parameters: {
      owner: { type: 'string',description: 'User or org login (default: authenticated user).' },
      type: { type: 'string',enum: ['all', 'owner', 'public', 'private', 'member', 'sources', 'forks'], description: 'Repository filter.' },
      sort: { type: 'string',enum: ['created', 'updated', 'pushed', 'full_name'], description: 'Sort key (default updated).' },
      limit: { type: 'integer',description: 'Max rows (default 20, cap 100).' },
    },
    commands: (a) => {
      const limit = Math.min(Math.max(Number(a.limit ?? 20), 1), 100)
      const argv = ['repo', 'list']
      if (a.owner) argv.push(a.owner)
      argv.push('--type', a.type ?? 'all', '--sort', a.sort ?? 'updated', '--limit', String(limit))
      argv.push('--json', 'nameWithOwner,visibility,isFork,stargazerCount,updatedAt,description', '--jq', LIST_JQ)
      return [argv]
    },
  },
  {
    name: 'github_repo_search',
    description: 'Search GitHub repositories by keyword (authenticated search quota, 30/min). Compact one-line-per-repo output.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search keywords (GitHub search syntax supported, e.g. "dsh plugin stars:>100").' },
      limit: { type: 'integer',description: 'Max rows (default 10, cap 30).' },
    },
    commands: (a) => {
      const limit = Math.min(Math.max(Number(a.limit ?? 10), 1), 30)
      return [['search', 'repos', String(a.query), '--limit', String(limit), '--json', 'fullName,stargazersCount,updatedAt,description', '--jq', SEARCH_JQ]]
    },
  },
  {
    name: 'github_repo_info',
    description: 'Show one repository: visibility, default branch, stars/forks, updated date, description, topics.',
    parameters: {
      repo: { type: 'string', required: true, description: 'OWNER/REPO (e.g. rtk-ai/rtk).' },
    },
    commands: (a) => [
      ['repo', 'view', String(a.repo), '--json', 'nameWithOwner,description,visibility,defaultBranchRef,stargazerCount,forkCount,updatedAt,url,repositoryTopics', '--jq', INFO_JQ],
    ],
  },
  {
    name: 'github_repo_clone',
    description: 'Clone a repository via `gh repo clone` (credentials handled by gh — no token appears in argv). Clones into the current workspace unless dest is given.',
    parameters: {
      repo: { type: 'string', required: true, description: 'OWNER/REPO, or the full URL of a GitHub repository.' },
      dest: { type: 'string',description: 'Destination directory (optional).' },
      depth: { type: 'integer',description: 'Shallow-clone depth (optional; omit for full history).' },
    },
    commands: (a) => {
      const argv = ['repo', 'clone', String(a.repo)]
      if (a.dest) argv.push(String(a.dest))
      if (a.depth) argv.push('--', '--depth', String(Math.max(1, Number(a.depth))))
      return [argv]
    },
  },
  {
    name: 'github_repo_create',
    description: 'Create a new GitHub repository (additive, no confirmation needed). Set private=true unless the user asked for a public repo.',
    parameters: {
      name: { type: 'string', required: true, description: 'Repository name, or OWNER/NAME to create under an org.' },
      private: { type: 'boolean',description: 'Private repository (default true).' },
      description: { type: 'string',description: 'Repository description.' },
      clone: { type: 'boolean',description: 'Clone the new repository into the current directory (default false).' },
    },
    commands: (a) => {
      const argv = ['repo', 'create', String(a.name), a.private === false ? '--public' : '--private']
      if (a.description) argv.push('--description', String(a.description))
      if (a.clone) argv.push('--clone')
      return [argv]
    },
  },
  {
    name: 'github_repo_fork',
    description: 'Fork a repository to the authenticated account (additive). Optionally clone the fork immediately.',
    parameters: {
      repo: { type: 'string', required: true, description: 'OWNER/REPO to fork.' },
      clone: { type: 'boolean',description: 'Also clone the fork into the current directory (default false).' },
    },
    commands: (a) => [['repo', 'fork', String(a.repo), ...(a.clone ? ['--clone'] : [])]],
  },
  {
    name: 'github_repo_edit',
    description: "Edit a repository's metadata: description, topics, or visibility. Visibility changes are disruptive — prefer description/topics.",
    parameters: {
      repo: { type: 'string', required: true, description: 'OWNER/REPO to edit.' },
      description: { type: 'string',description: 'New description.' },
      addTopics: { type: 'array',items: { type: 'string' }, description: 'Topics to add.' },
      removeTopics: { type: 'array',items: { type: 'string' }, description: 'Topics to remove.' },
      visibility: { type: 'string',enum: ['public', 'private'], description: 'Change visibility (requires confirm=repo name).' },
    },
    commands: (a, cfg) => {
      const argv = ['repo', 'edit', String(a.repo)]
      if (a.description !== undefined) argv.push('--description', String(a.description))
      for (const t of a.addTopics ?? []) argv.push('--add-topic', String(t))
      for (const t of a.removeTopics ?? []) argv.push('--remove-topic', String(t))
      if (a.visibility) {
        if (a.confirm !== String(a.repo)) throw new Error(`visibility change refused: set confirm="${a.repo}" to proceed`)
        argv.push('--visibility', String(a.visibility))
      }
      if (argv.length === 3) throw new Error('nothing to edit: pass description/addTopics/removeTopics/visibility')
      return [argv]
    },
  },
  {
    name: 'github_repo_archive',
    description: 'Archive a repository (write becomes read-only). DESTRUCTIVE-ish: requires confirm equal to the OWNER/REPO name.',
    parameters: {
      repo: { type: 'string', required: true, description: 'OWNER/REPO to archive.' },
      confirm: { type: 'string', required: true, description: 'Must equal the OWNER/REPO value exactly.' },
    },
    commands: (a) => {
      if (a.confirm !== String(a.repo)) throw new Error(`archive refused: confirm must equal "${a.repo}"`)
      return [['repo', 'archive', String(a.repo), '--yes']]
    },
  },
  {
    name: 'github_api',
    description:
      'Parameterized GitHub REST/GraphQL API call via `gh api` — the catch-all for anything the specific tools do not cover (releases, issues, PRs, Actions runs, GraphQL). Prefer github_repo_* when they fit. Large results: pass `jq` to project fields (dropping body/reactions/labels saves the most), or paginate=true to auto-aggregate pages. Non-GET methods require confirm="yes".',
    parameters: {
      path: { type: 'string', required: true, description: 'API path, e.g. repos/OWNER/REPO/issues or graphql. {owner}/{repo} placeholders are filled from -R/--repo when present in the current git repo.' },
      method: { type: 'string',enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method (default GET).' },
      query: { type: 'array',items: { type: 'string' }, description: 'Query params as "key=value" strings (become -f).' },
      fields: { type: 'array',items: { type: 'string' }, description: 'Request body fields as "key=value" strings (become -F; type-inferred).' },
      jq: { type: 'string',description: 'jq projection applied CLI-side to cut tokens, e.g. ".[] | .login".' },
      paginate: { type: 'boolean',description: 'Auto-paginate and aggregate (gh --paginate --slurp for arrays).' },
      confirm: { type: 'string',description: 'Required for non-GET: must be "yes".' },
    },
    commands: (a) => {
      const method = String(a.method ?? 'GET').toUpperCase()
      if (method !== 'GET' && a.confirm !== 'yes') {
        throw new Error(`github_api ${method} refused: set confirm="yes" to send a write request`)
      }
      const argv = ['api', String(a.path)]
      if (method !== 'GET') argv.push('-X', method)
      for (const kv of a.query ?? []) argv.push('-f', String(kv))
      for (const kv of a.fields ?? []) argv.push('-F', String(kv))
      if (a.jq) argv.push('--jq', String(a.jq))
      if (a.paginate) argv.push('--paginate', '--slurp')
      return [argv]
    },
  },
  {
    name: 'github_repo_delete',
    description: 'DESTRUCTIVE: permanently delete a repository. Double-gated: the deployment must set allowDelete=true AND confirm must equal the OWNER/REPO name. Default deployments refuse this tool entirely — prefer github_repo_archive.',
    parameters: {
      repo: { type: 'string', required: true, description: 'OWNER/REPO to delete.' },
      confirm: { type: 'string', required: true, description: 'Must equal the OWNER/REPO value exactly.' },
    },
    commands: (a, cfg) => {
      if (!cfg.allowDelete) throw new Error('github_repo_delete is disabled by deployment config (allowDelete=false); use github_repo_archive instead')
      if (a.confirm !== String(a.repo)) throw new Error(`delete refused: confirm must equal "${a.repo}"`)
      return [['repo', 'delete', String(a.repo), '--yes']]
    },
  },
]
