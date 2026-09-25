// 写入拦截 v1.5（Task 14；US-13/OW-INV-5 承载）——tools/pre-execute 构造性强制面。
//
// ⚠️ 能力边界（P21/P23 教训，诚实声明）：**工具级构造性强制，非安全边界**——只拦工具级写调用
//   （写类工具、结构化目标路径），拦不住模型文本绕过（bash 重定向/内嵌写盘等不经结构化路径的写）。
//   Gate Enforcer 全量能力仍留 v2（Q17）。delete 类归 crud 围栏+双确认（INV-7），本面只拦不改。
//
// 契约（delta-spec T9 切片 + dsh-tools PreToolDecision 实测面）：
//   ctx.on('tools/pre-execute', (exec, next) => …) 决策仅 **allow/ask/deny** 三态，**无输入改写**——
//   payload 恒原样（R7 实测：PreToolDecision 不含改写缝；arguments 深冻结），allow = next() 链续。
//
// 判定范围 = 写类工具（WRITE_TOOLS 判定表）且目标在 vault 内；读工具/非 vault 路径/delete 类
//   一律放行且**零快检**（性能与边界）。
//
// 判定矩阵（quickCheck 存量分流，T10 concern② 裁定）：
//   readOnly=true（INV-7）              → deny（vault 写类一律拒；非 vault 不误伤）
//   新建文件 + 任何不合维护指引 finding  → deny + reason 指路
//   存量文件 + error 级 finding         → deny + reason 指路（error 级不因存量降格）
//   存量文件 + 仅 warn 级（形态欠账）    → ask（提示+指路，不阻塞存量修复）
//   合规                               → allow（next() 链续）
//   vaultRoot 缺省/围栏不可判           → allow + 留痕（fail-open，同 T11 必传语义）
//
// 快检缝 = validate.quickFindings（①frontmatter ③naming ④placement 秒级子集）；
//   分级语义在 validate.js（勿在此重造规则）；reason 文案引用维护指引 skill 名
//   （obsidian-operations 扩写版，Task 17 伴随落地）。
// edit 类按**编辑后内容**判（补丁外推）：修复性编辑必须放行、引入新伤必须拦——按预存态判会两头错。
// 零第三方依赖（node:fs/node:path）；零构建纯 ESM。
import fs from 'node:fs'
import path from 'node:path'

/**
 * 写类工具判定表：目标路径取键序（宽容取键）+ 锚定基准（host 工具=绝对/进程 cwd；steward 工具=Vault 相对）+
 * 内容外推方式（full=参数全量；edit=补丁外推；disk=磁盘现状近似）。
 * 不在此表 = 非写类/未识别（读工具、delete 类、bash 等）→ 放行（构造性强制边界，如实申报）。
 */
export const WRITE_TOOLS = {
  write: { pathKeys: ['file_path', 'path', 'file', 'target'], contentKeys: ['content'], anchor: 'cwd', patch: 'full' },
  edit: { pathKeys: ['file_path', 'path', 'file'], anchor: 'cwd', patch: 'edit' },
  wiki_write: { pathKeys: ['path', 'file_path', 'target', 'file'], contentKeys: ['content'], anchor: 'vault', patch: 'full' },
  kb_mark: { pathKeys: ['file', 'path', 'target'], anchor: 'vault', patch: 'disk' },
  wiki_rename: { pathKeys: ['to', 'path'], contentPathKey: 'from', anchor: 'vault', patch: 'disk' },
}

/** 决策键面固定（三态无改写断言的契约面）：决策只携带 kind + 人类可读理由 */
const GUIDE = '按 obsidian-operations 维护指引'

const brief = (findings, n = 3) => {
  const head = findings.slice(0, n).map((f) => `[${f.rule}/${f.severity}] ${f.message}`).join('；')
  return findings.length > n ? `${head}；…共 ${findings.length} 项` : head
}

const pick = (args, keys) => {
  for (const k of keys) {
    const v = args?.[k]
    if (typeof v === 'string' && v !== '') return v
  }
  return null
}

/** 围栏判定：目标是否落在 vaultRoot 内（精确形：..foo 同级目录不误判出围栏） */
const inVault = (vaultRoot, abs) => {
  const rel = path.relative(vaultRoot, abs)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

/** edit 补丁外推：把 old_string→new_string 施加到磁盘现状，返回编辑后内容（歧义/不可读=undefined 不外推） */
function applyEdit(abs, args) {
  const old = args?.old_string
  const neu = args?.new_string
  if (typeof old !== 'string' || typeof neu !== 'string' || old === '') return undefined
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    return undefined
  }
  const parts = text.split(old)
  const n = parts.length - 1
  if (n === 0) return undefined // 宿主将拒（old_string 不在文中），不外推
  if (n > 1 && args?.replace_all !== true) return undefined // 多命中歧义：宿主将拒，不外推
  return parts.join(neu)
}

/** 内容外推：write/wiki_write=参数全量；edit=补丁外推；wiki_rename=源文件现状；kb_mark=undefined（磁盘近似） */
function resolveContent(spec, args, abs, vaultRoot) {
  if (spec.patch === 'full') return pick(args, spec.contentKeys ?? []) ?? undefined
  if (spec.patch === 'edit') return applyEdit(abs, args)
  if (spec.contentPathKey) {
    const src = pick(args, [spec.contentPathKey])
    if (src === null) return undefined
    const srcAbs = spec.anchor === 'vault' ? path.resolve(vaultRoot, src) : path.resolve(src)
    try {
      return fs.readFileSync(srcAbs, 'utf8')
    } catch {
      return undefined
    }
  }
  return undefined // disk 近似：quickFindings 缺省真读盘
}

/**
 * 构造 pre-execute 写入门（waterfall 监听器形态：(exec, next) => Promise<PreToolDecision>）。
 * @param {object} deps
 * @param {(path: string, content?: string, opts?: object) => Promise<{ok: boolean, findings: object[]}>} deps.quickFindings
 *   validate.quickFindings 真件（分级快检缝；测试可插桩计数——插桩非 mock）
 * @param {() => object} deps.getCfg 热改配置现读（index.js readCfg 同款语义）
 * @param {(line: string) => void} deps.warn 留痕出口（INV-15 禁静默）
 * @returns {(exec: object, next: () => Promise<object>) => Promise<object>}
 */
export function createWriteGate({ quickFindings, getCfg, warn }) {
  return async function wikiStewardWriteGate(exec, next) {
    try {
      const spec = WRITE_TOOLS[exec?.name]
      if (!spec) return next() // 读工具/非写类/delete 类：放行（零快检）
      const args = exec.arguments
      const rawTarget = pick(args, spec.pathKeys)
      if (rawTarget === null) {
        warn(`[wiki-steward] 写入拦截：写类工具 ${exec.name} 缺目标路径键（fail-open 不拦，留痕）`)
        return next()
      }
      const cfg = getCfg() ?? {}
      const vaultRoot = typeof cfg.vaultRoot === 'string' ? cfg.vaultRoot.trim() : ''
      if (vaultRoot === '') {
        warn('[wiki-steward] 写入拦截：vaultRoot 缺省，围栏不可判（fail-open 不拦，留痕）')
        return next()
      }
      const abs = spec.anchor === 'vault' ? path.resolve(vaultRoot, rawTarget) : path.resolve(rawTarget)
      if (!inVault(vaultRoot, abs)) return next() // 非 vault 路径：放行（零快检）

      // INV-7：只读配置下 vault 写类一律拒（在快检之前——不需要 IO 也能拦）
      if (cfg.write?.readOnly !== false) {
        return {
          kind: 'deny',
          reason: `[wiki-steward 写入拦截] 默认只读（INV-7）：vault 写类一律拒，config write.readOnly:false 显式开启才动手；${GUIDE}`,
        }
      }

      // 快检分流（T10 concern② 裁定矩阵）
      const content = resolveContent(spec, args, abs, vaultRoot)
      const exists = fs.existsSync(abs)
      if (!exists && content === undefined) return next() // 新建且无内容可检（fail-open，空参数宿主自会拒）
      const r = await quickFindings(abs, content, { vaultRoot })
      if (r?.ok !== false) return next() // 合规 → allow
      const findings = Array.isArray(r.findings) ? r.findings : []
      const hasError = findings.some((f) => f?.severity === 'error')
      if (!exists || hasError) {
        const why = exists ? '写入不合维护指引（error 级）' : '新建页不合维护指引'
        return {
          kind: 'deny',
          reason: `[wiki-steward 写入拦截] ${why}：${brief(findings)}；${GUIDE}修正后再写（六字段 frontmatter/类型化命名/目录归属）`,
        }
      }
      return {
        kind: 'ask',
        reason: `[wiki-steward 写入拦截] 存量页形态欠账（warn 级，不阻塞存量修复）：${brief(findings)}；${GUIDE}建议顺手修正`,
      }
    } catch (e) {
      warn(`[wiki-steward] 写入拦截异常已吞（fail-open 不拦）：${e?.message ?? e}`)
      return next()
    }
  }
}
