// wiki-steward — Obsidian vault 写侧记账插件（入口；T8 壳 → T9 捕获接线 → T12 工具注册收口 → T13 队列/timer）
// 职责边界：导出契约 + Config 定义 + apply 挂载点（fail-open 配置校验 + 捕获三事件缝接线 + 全 steward 工具面
// + 队列/告警/timer 轻活接线）；捕获语义在 lib/capture.js（投影/中和/状态机）、落盘在 lib/buffer.js（缓冲/双轨/锁/重试）、
// 校验/回写/CRUD 在 lib/validate.js / mark.js / crud.js、队列/补跑账本在 lib/queue.js、告警在 lib/alert.js（本文件只做接线收口）。
// ⚠️ R13 教训：default 导出必须是 {inject, apply} 对象——工厂函数形态会被宿主静默忽略。
// ⚠️ T9 裁定（task-9 报告申报②）：捕获全走 ctx.on 公开事件缝（session/event + agent/turn-stopping +
//   session/disposed），零宿主服务消费；**T12 收口：inject = ['tools']**（工具注册宿主缝，kb-context 同款）。
// ⚠️ T13 Ruling（申报②）：inject 维持 ['tools'] **不加 'timer'**——timer 服务经 ctx.get('timer') 软取得
//   （cordis 未 inject 取服务属性会抛，try/catch 兜底），缺位 fail-open 留痕+懒补接（wire.test 钉住）。
// ⚠️ T12 Ruling（撞名防雷，wire.test 钉住）：wiki_read / wiki_search **不注册**——工具名归 kb-context
//   （ToolRuntime NamedEntries 同名注册 throw「already registered」，跨插件同层撞名=工具面整体炸）；
//   crud.js 仍导出 wikiRead 函数面（事务内部消费/测试）。steward 工具面 = kb_validate / kb_mark /
//   wiki_write / wiki_delete / wiki_rename（proposal §6 设计全貌页 + T12 验收标准）。
// ⚠️ T14（写入拦截 v1.5）：ctx.on('tools/pre-execute') 构造性强制面接线（lib/gate.js 判定矩阵）——
//   决策仅 allow/ask/deny 无输入改写；**工具级构造性强制非安全边界**（bash 等文本绕过拦不住，边界见 gate.js 头注）。
//   审前裁定（Task 14 fix round 1）：①存量降格——存量一切 quickCheck 问题（含 error 级）→ ask，deny 只用于
//   新建不合指引/readOnly 拦截/非法越界路径；②kb_mark 豁免 readOnly（INV-1 明文例外=sha256 机械回写非内容写），
//   写类 readOnly 执行面收窄为 crud 族（wiki_write/wiki_delete/wiki_rename），kb_validate 只读永不拦。
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createCaptureState, observe, stopping, turnEnded, isSubagentHeader } from './capture.js'
import { createBuffer, bumpStat, getStats, resetStats, appendCapture } from './buffer.js'
import { createQueue, createTick } from './queue.js'
import { createAlert } from './alert.js'
import { kbValidate, quickFindings, RULES } from './validate.js'
import { kbMark } from './mark.js'
import { wikiWrite, wikiDelete, wikiRename } from './crud.js'
import { createWriteGate } from './gate.js'
import { defaultLogSources } from './ingest-log.js'
import { createIngestTrigger, DISTILL_TASK_NAME } from './ingest-trigger.js'
import { createIngestScheduler, isValidScheduleTime } from './ingest-schedule.js'
import { registerIngestRoutes } from './ingest-routes.js'
import { createHindsightSync, syncRanOnStamp } from './hindsight-sync.js'
import { createHindsightHandlers, createSyncStarter, collectStatus } from './hindsight-routes.js'
import { createApplyPatch, HINDSIGHT_EDITABLE_PATHS } from './settings-write.js'

export const name = 'wiki-steward'
export const inject = ['tools']

// vault 根路径出厂默认（kb-context R2 裁定同构，单一来源）：
// T9 补键裁定——delta-spec §2 Config 未列 vaultRoot，但捕获必须落盘（测试临时 root 注入 +
// 操作员逃生阀都需要此键），load 测试契约同步，偏离面入 task-9 报告。
export const DEFAULT_VAULT_ROOT = '/mnt/unraid_data/Obsidian'

// Config 全键一次性定义（delta-spec §2 整行进 cordis.patch.yml，config 整行替换语义）；
// 语义 = 可配置热改（handler 每次调用经 readCfg() 现读当前 rawConfig，不启动时冻结）。
// ⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认。
export const Config = z.object({
  // vault 根（T9 补键）：捕获双轨落点的根；kb-context 同名同默认
  vaultRoot: z.string().default(DEFAULT_VAULT_ROOT),
  // 捕获（T9）：turn-stopping 收口进缓冲，每 bufferRounds 轮强制 flush 双轨落盘
  capture: z.object({
    bufferRounds: z.number().default(3),
    enabled: z.boolean().default(true),
  }).prefault({}),
  // 写侧（T12）：默认只读（INV-7）——wiki_write/wiki_delete 需显式开启才动手
  write: z.object({
    readOnly: z.boolean().default(true),
  }).prefault({}),
  // 失败幂等队列（T13）：重试上限 + 条目 TTL（天）
  queue: z.object({
    maxRetries: z.number().default(3),
    ttlDays: z.number().default(7),
  }).prefault({}),
  // 脱敏（T8，INV-11）：落盘/注入前哨兵中和开关（lib/secrets.js）
  secrets: z.object({
    enabled: z.boolean().default(true),
  }).prefault({}),
  // 定时蒸馏（Task F3，诊断 §4.2 选项 A 终裁=插件自管 timer）：到点 spawn 既有 dsh-cron.sh
  // wiki-ingest 通道（flock 防重入天然兜底）。缺省 enabled:false=零行为变化（旧配置无 ingest 键
  // 不炸、parse 后行为与升级前一致——现系统 cron 00:25 仍是唯一触发源，插件 timer 为 opt-in）；
  // time:'00:25'=与现系统 cron 同点（开启即等价迁移现状时间）。时间严格 HH:MM（settings-write
  // 白名单同源校验，非法整单拒 invalid）。
  ingest: z.object({
    schedule: z.object({
      enabled: z.boolean().default(false),
      time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '时间格式须为 HH:MM').default('00:25'),
    }).prefault({}),
  }).prefault({}),
  // Hindsight 记忆同步（2026-10-07 波 U1-U3，solution-design.md §5）：enabled=L1 启停（同步行为，
  // 热改立即生效）；apiUrl=记忆库 API（侦察实测零鉴权，默认 127.0.0.1:8888）；banks=同步对象清单
  //（空=全部 bank，R-4 现阶段只 dsh-plugins 有料）；sync.schedule=定时同步（缺省关=零行为变化）。
  // ⚠️ 嵌套默认值一律 .prefault({})（zod v4 .default({}) 短路实测坑——本文件头注同款纪律）。
  hindsight: z.object({
    enabled: z.boolean().default(false),
    apiUrl: z.string().default('http://127.0.0.1:8888'),
    banks: z.array(z.string()).default([]),
    sync: z.object({
      schedule: z.object({
        enabled: z.boolean().default(false),
        time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '时间格式须为 HH:MM').default('03:25'),
      }).prefault({}),
    }).prefault({}),
  }).prefault({}),
}).prefault({}) // 顶层同样容忍 undefined（热改路径上 rawConfig 可缺省 → 全默认；非法类型仍拒）

/** 警告出口：优先宿主 logger，缺位回落 console（行为不丢；kb-context 同款） */
function warn(ctx, line) {
  try {
    if (ctx?.logger?.warn) {
      ctx.logger.warn(line)
      return
    }
  } catch { /* logger 抛错也不阻塞加载 */ }
  console.warn(line)
}

// ── 工具面（T12 注册收口：validate/mark/crud 全部 defineTool）────────────────
// 语义要点进 description（模型引导面）：默认只读（INV-7，config write.readOnly 热改）；
// 删除=.trash 可逆+双确认（confirm=路径复述）；覆盖=显式 overwrite 缺省拒（防静默覆盖）；
// 改名/移动=多文件事务（journal 快照+整体回滚+wikilink/INDEX 同事务+零断链）。
// vaultRoot 一律取 config（模型不可改），readOnly 门在工具层 + crud 层双保险。
const WARN_PROP = {
  warnings: {
    type: 'array',
    items: { type: 'string' },
    description: '留痕（INV-15 禁静默）：拒绝细节/歧义不动/接管/边界声明/回滚跳过',
  },
}
const OK_PROP = { ok: { type: 'boolean', required: true, description: '是否成功' } }

/** 工具面构造（defineTool 真件由 index.js 静态导入传入；kb-context buildTools 同款姿势） */
export function buildTools({ defineTool, configSource = () => ({}) }) {
  /** per-call 现读 config（热改语义）；非法配置回退全默认（与 apply 期告警面一致） */
  const readCfg = () => {
    const p = Config.safeParse(configSource())
    return p.success ? p.data : Config.parse({})
  }

  const kbValidateTool = defineTool({
    name: 'kb_validate',
    description:
      '机械校验 vault 页面/目录（只读）：①frontmatter 六字段 ②INDEX 双向（漏登/死链/歧义）'
      + '③类型化命名 ④目录归属 ⑤结构四段+wikilink 语法 ⑥证据清单（INV-15）。'
      + `target= vault 相对路径（文件或目录）；rules 可裁剪执行面（${RULES.join('/')}，缺省全跑）。`
      + '返回 {file, findings:[{rule, line?, message, severity}], verdict}（verdict: pass/warn/fail），'
      + '目录 target 另带 results 逐文件同形。用法：写/改名后跑校验把关。',
    parameters: {
      target: { type: 'string', required: true, description: 'vault 相对路径（文件或目录，如 wiki/concepts/x.md）' },
      rules: { type: 'array', items: { type: 'string' }, description: `裁剪规则面（${RULES.join('/')}），缺省全跑` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          file: { type: 'string', required: true, description: '被校验目标（绝对路径）' },
          findings: {
            type: 'array',
            required: true,
            description: '发现列表（rule/line?/message/severity）',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                rule: { type: 'string', required: true },
                message: { type: 'string', required: true },
                severity: { type: 'string', required: true, enum: ['error', 'warn'] },
              },
            },
          },
          verdict: { type: 'string', required: true, enum: ['pass', 'warn', 'fail'], description: '三级裁定' },
          ...WARN_PROP,
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const cfg = readCfg()
      // 模型给 vault 相对路径 → 锚定 vaultRoot 后交 kbValidate（其内部 realpathGuard 围栏照跑）
      return kbValidate(path.resolve(cfg.vaultRoot, args.target), { vaultRoot: cfg.vaultRoot, rules: args.rules })
    },
  })

  const kbMarkTool = defineTool({
    name: 'kb_mark',
    description:
      'sha256 机械标记原子回写（写侧，INV-1）：只换 frontmatter sha256 行的值字节（缺行则补插闭合 --- 前），'
      + '其余字节逐字不动；body 口径=闭合 --- 之后内容 universal-newlines 归一后 sha256（INV-13 与 ingest 同源）。'
      + 'expectedRevision=写前乐观并发（当前 sha256 值，冲突=拒绝不覆盖并留痕；缺省无条件）。'
      + '原子写（O_EXCL+fsync+rename）+ 写后未动段校验（写坏=逆放拒）。'
      + '豁免 readOnly（审前裁定②，INV-1 明文例外=sha256 字段机械回写非内容写：write.readOnly 不拦 mark）。',
    parameters: {
      file: { type: 'string', required: true, description: 'vault 相对路径（如 raw/04-session_logs/xxx.md）' },
      expectedRevision: { type: 'string', description: '期望的当前 sha256 值（乐观并发；缺省无条件）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ...OK_PROP,
          file: { type: 'string', required: true },
          changed: { type: 'boolean', description: '是否发生回写（幂等：同值 false 零写盘）' },
          previous: { type: 'string', description: '回写前值（无标记行=null）' },
          current: { type: 'string', description: '回写后的 body sha256' },
          reason: { type: 'string', description: '失败原因枚举（no-frontmatter/ambiguous-sha256/revision-conflict/fenced/not-found/io-error/write-corrupt）' },
          message: { type: 'string', description: '失败详情（含 rolledBack 口径说明）' },
          ...WARN_PROP,
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const cfg = readCfg()
      const file = args.file
      // 审前裁定②：kb_mark 豁免 readOnly（INV-1 明文例外=「raw/ 唯一例外=sha256 字段机械回写」，
      // 机械维护非内容写）——write.readOnly 不拦 mark；写类 readOnly 执行面收窄为 crud 族
      // （wiki_write/wiki_delete/wiki_rename）。wire.test「mark 在 readOnly 下放行」钉住。
      return kbMark(path.resolve(cfg.vaultRoot, file), {
        vaultRoot: cfg.vaultRoot,
        ...(args.expectedRevision !== undefined ? { expectedRevision: args.expectedRevision } : {}),
      })
    },
  })

  const wikiWriteTool = defineTool({
    name: 'wiki_write',
    description:
      '写单个 wiki 页面（wiki/ 域；默认只读，config write.readOnly:false 显式开启）。'
      + '覆盖语义：目标已存在缺省拒（target-exists），显式 overwrite:true 才替换（防静默覆盖）。'
      + 'realpath 围栏全链逐段解引用拒 symlink 逃逸/穿越；父目录必须存在（不自动建目录）；锁内原子写。',
    parameters: {
      path: { type: 'string', required: true, description: 'vault 相对路径（wiki/ 域，如 wiki/concepts/x.md）' },
      content: { type: 'string', required: true, description: '页面内容（UTF-8 原样落盘）' },
      overwrite: { type: 'boolean', description: '显式允许替换既有文件（缺省 false=拒）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ...OK_PROP,
          file: { type: 'string', required: true },
          created: { type: 'boolean', description: 'true=新建，false=替换既有' },
          reason: { type: 'string', description: '失败原因枚举（vault-root-required/unsafe-form/not-wiki/read-only/fenced/not-found/target-exists/io-error）' },
          message: { type: 'string' },
          ...WARN_PROP,
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const cfg = readCfg()
      return wikiWrite(args.path, args.content, {
        vaultRoot: cfg.vaultRoot,
        readOnly: cfg.write.readOnly,
        ...(args.overwrite !== undefined ? { overwrite: args.overwrite } : {}),
      })
    },
  })

  const wikiDeleteTool = defineTool({
    name: 'wiki_delete',
    description:
      '删除 wiki 页面/目录 → 移入 `.trash/<路径>`（冲突改名 `.N` 防覆盖，内容逐字节可逆——从 .trash 移回即还原）。'
      + '双确认（INV-7）：confirm 必须原样复述目标路径，缺失/不符即拒（零副作用）。'
      + '默认只读（config write.readOnly:false 显式开启）；.trash 无法就位=拒（绝不直接删）。'
      + '注意：删除不改写指向它的链接（零断链承诺只在 wiki_rename）。',
    parameters: {
      path: { type: 'string', required: true, description: 'vault 相对路径（wiki/ 域）' },
      confirm: { type: 'string', required: true, description: '双确认：原样复述 path 的值' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ...OK_PROP,
          file: { type: 'string', required: true },
          trashPath: { type: 'string', description: '.trash 内落点（vault 相对）' },
          kind: { type: 'string', enum: ['file', 'directory'], description: '被删对象类型' },
          reason: { type: 'string', description: '失败原因枚举（vault-root-required/unsafe-form/not-wiki/read-only/confirm-required/confirm-mismatch/fenced/not-found/io-error）' },
          message: { type: 'string' },
          ...WARN_PROP,
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const cfg = readCfg()
      return wikiDelete(args.path, {
        vaultRoot: cfg.vaultRoot,
        readOnly: cfg.write.readOnly,
        confirm: args.confirm,
      })
    },
  })

  const wikiRenameTool = defineTool({
    name: 'wiki_rename',
    description:
      '改名/移动 wiki 页面（同操作，to 可跨目录；仅 .md 页）——多文件事务：改前 journal 快照 → 逐文件原子写+锁 → '
      + 'wikilink 重写（歧义不动+留痕、#锚|别名回填、裸名/全路径风格保持、toBase 不制造新歧义）→ INDEX 同事务 → '
      + '失败整体回滚（journal 逆放，批量失败即中止）。顺序=先落目标→改写→最后删源（零断链窗口+无空源残渣）。'
      + 'frontmatter 内链接也重写；围栏代码块豁免；改写范围=wiki/ 域（域外引用留痕未改写）。'
      + '覆盖语义：to 已存在缺省拒（target-exists），显式 overwrite:true 才替换（失败回滚会还原目标原内容）。'
      + 'dryRun:true 只给计划（planned/skipped）零写盘。默认只读（config write.readOnly:false 显式开启）。',
    parameters: {
      from: { type: 'string', required: true, description: '源路径（vault 相对，wiki/ 域）' },
      to: { type: 'string', required: true, description: '目标路径（vault 相对，wiki/ 域；父目录须存在）' },
      overwrite: { type: 'boolean', description: '显式允许替换既有目标（缺省 false=拒）' },
      dryRun: { type: 'boolean', description: '只出计划零写盘（默认 false）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ...OK_PROP,
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          moved: { type: 'boolean', description: '真实执行完成' },
          dryRun: { type: 'boolean', description: '计划预览（零写盘）' },
          planned: {
            type: 'array',
            description: '将被改写的文件与处数（dryRun/成功）',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: { file: { type: 'string', required: true }, changes: { type: 'number', required: true } },
            },
          },
          rewritten: {
            type: 'array',
            description: '实际改写的文件与处数（成功时）',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: { file: { type: 'string', required: true }, changes: { type: 'number', required: true } },
            },
          },
          skipped: {
            type: 'array',
            description: '歧义不动的链接（多命中返回不动+留痕）',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                file: { type: 'string', required: true },
                line: { type: 'number', required: true },
                target: { type: 'string', required: true },
                reason: { type: 'string', required: true },
              },
            },
          },
          rolledBack: {
            type: 'boolean',
            description: '失败时回滚诚实位（false=pre-write 未写盘无逆放发生 / 逆放未完全需人工核对）',
          },
          reason: { type: 'string', description: '失败原因枚举（vault-root-required/unsafe-form/not-wiki/read-only/same-path/fenced/not-found/not-a-file/target-exists/journal-limit/concurrent-modification/transaction-failed/io-error）' },
          message: { type: 'string' },
          ...WARN_PROP,
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const cfg = readCfg()
      return wikiRename(args.from, args.to, {
        vaultRoot: cfg.vaultRoot,
        readOnly: cfg.write.readOnly,
        ...(args.overwrite !== undefined ? { overwrite: args.overwrite } : {}),
        ...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}),
      })
    },
  })

  return [kbValidateTool, kbMarkTool, wikiWriteTool, wikiDeleteTool, wikiRenameTool]
}

/**
 * 遗留落点一次性迁移（2026-09-30 数据面收口）：旧 `~/.dsh/kb-index/{queue,schedule-ledger.json}`
 * 与 `~/.dsh/kb-alerts.md` → 源码位插件数据目录 `<data>/`。逐项「新家已有=不覆盖不搬」；
 * **无遗留 = 零副作用**（绝不 mkdir 空目录）；旧 `~/.dsh/kb-index/` 迁空后 rmdir（非空=对家
 * kb-context 的 active.db 仍在，留给它自己迁）。迁移失败绝不阻塞加载——warn 留痕（INV-15 禁静默）。
 */
export function migrateLegacyState({ dataRoot, paths, warn = () => {} }) {
  const legacyKbIndex = path.join(os.homedir(), '.dsh', 'kb-index')
  const jobs = [
    { from: path.join(legacyKbIndex, 'queue'), to: paths.queueDir, dir: true },
    { from: path.join(legacyKbIndex, 'schedule-ledger.json'), to: paths.ledgerFile, dir: false },
    { from: path.join(os.homedir(), '.dsh', 'kb-alerts.md'), to: paths.alertFile, dir: false },
  ]
  const moved = []
  for (const job of jobs) {
    try {
      if (fs.existsSync(job.to)) continue
      if (!fs.existsSync(job.from)) continue
      fs.mkdirSync(path.dirname(job.to), { recursive: true })
      fs.renameSync(job.from, job.to)
      moved.push(path.basename(job.from))
    } catch (e) {
      warn(`[wiki-steward] 遗留状态迁移失败（${job.from}，旧落点留人工处置）：${String(e?.message ?? e)}`)
    }
  }
  try { fs.rmdirSync(legacyKbIndex) } catch { /* 非空（kb-context active.db 在场）= 留给对家迁移 */ }
  return { moved }
}

/**
 * 挂载（宿主 apply 面）。
 * @param {object} ctx cordis 上下文（on/tools/logger/get 缝）
 * @param {object} rawConfig 热改配置（每次事件现读）
 * @param {{paths?: {queueDir?: string, ledgerFile?: string, alertFile?: string},
 *          now?: () => number, tickIntervalMs?: number,
 *          indexRefresh?: (info: object) => Promise<object>|object}} [opts]
 *   测试缝（mark.js opts._write 同款纪律，共 4 个）：paths=队列/账本/告警落点（缺省 ~/.dsh/…）、
 *   now=假时钟、tickIntervalMs=timer 间隔、indexRefresh=索引增量刷新钩子（本包不持索引，缺省明示不归我管）。
 *   另 opts.web={home,logDir,distDir,trigger,sources}（web 数据面缝）+ opts.ingest={distill,now,logDir,
 *   taskName,runRecordExists,setTimeout,clearTimeout,setInterval,clearInterval,reconcileIntervalMs}
 *   （Task F3 定时调度缝，lib/ingest-schedule.js 同名语义）+ opts.hindsight={createEngine,now,
 *   runRecordExists,setTimeout,clearTimeout,setInterval,clearInterval,reconcileIntervalMs}
 *   （repair-r2 F1 Hindsight 定时同步缝，lib/ingest-schedule.js 同款形；createEngine=引擎工厂注入缝）。
 */
export function apply(ctx, rawConfig, opts = {}) {
  // 配置防御性校验：非法配置留痕告警后 fail-open（INV-15 禁静默）。只在 apply 期告警一次
  // （事件路径热改读取不重复告警，防刷屏）。
  const parsed = Config.safeParse(rawConfig)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    warn(ctx, `[wiki-steward] 配置校验失败，回退默认值（fail-open）：${detail}`)
  }
  const defaults = Config.parse({})
  /** 热改语义：每次事件现读当前 rawConfig（非法时回退全默认——与 apply 期告警面一致） */
  const readCfg = () => {
    const p = Config.safeParse(rawConfig)
    return p.success ? p.data : defaults
  }

  // ---- 工具注册收口（T12；kb-context T6 同款姿势）----
  // 全 steward 工具面 validate/mark/crud defineTool；宿主工具缝缺失 fail-open 留痕不静默（INV-15）。
  // 注册失败（如撞名 throw）同样留痕不静默——但绝不在这里吞掉后继续假装工具面完整。
  if (typeof ctx?.tools?.register === 'function') {
    for (const tool of buildTools({ defineTool, configSource: () => rawConfig })) {
      ctx.tools.register(tool)
    }
  } else {
    warn(ctx, '[wiki-steward] 宿主 ctx.tools 缺失，kb_validate/kb_mark/wiki_write/wiki_delete/wiki_rename 未注册（fail-open）')
  }

  // ---- 写入拦截（T14；tools/pre-execute 构造性强制面）----
  // 判定矩阵与能力边界声明见 lib/gate.js 头注（工具级构造性强制，非安全边界）；快检缝=validate.quickFindings
  // （①③④ 秒级子集）；决策仅 allow/ask/deny、无输入改写（PreToolDecision 契约）；异常/围栏不可判 fail-open 留痕。
  // getConfig=热改现读（write.readOnly 热改面与工具层同源）。
  ctx.on('tools/pre-execute', createWriteGate({
    quickFindings,
    getCfg: readCfg,
    warn: (line) => warn(ctx, line),
  }))

  // ---- 队列 / 告警 / timer 轻活（T13；delta-spec §2 队列条目/timer 契约）----
  // 三件轻活（Q10 定时分工）：队列补交（T9 enqueue 的治愈面）/ 索引增量刷新（钩子，缺省不归我管）/
  // 告警汇总（buffer 统计聚合+归零）。tick **先查补跑账本**（漏跑补偿 A6）；burst 不重入（LeaseLock）。
  // 状态落点（缺省，2026-09-30 数据面收口→源码位插件目录）：队列 <data>/kb-index/queue/、
  // 账本 <data>/kb-index/schedule-ledger.json、告警 <data>/kb-alerts.md
  // （<data> = ~/.dsh/plugins/wiki-steward/data/；旧落点 ~/.dsh/kb-index/、~/.dsh/kb-alerts.md
  // 由 migrateLegacyState 启动一次性迁移）。测试经 opts.paths 注入 mkdtemp——绝不碰真 home。
  const dataRoot = path.join(os.homedir(), '.dsh', 'plugins', 'wiki-steward', 'data')
  const paths = {
    queueDir: opts?.paths?.queueDir ?? path.join(dataRoot, 'kb-index', 'queue'),
    ledgerFile: opts?.paths?.ledgerFile ?? path.join(dataRoot, 'kb-index', 'schedule-ledger.json'),
    alertFile: opts?.paths?.alertFile ?? path.join(dataRoot, 'kb-alerts.md'),
  }
  if (opts?.paths === undefined) migrateLegacyState({ dataRoot, paths, warn: (line) => warn(ctx, line) })
  const nowMs = typeof opts?.now === 'function' ? opts.now : () => Date.now()
  const tickIntervalMs = Number.isFinite(opts?.tickIntervalMs) && opts.tickIntervalMs > 0 ? opts.tickIntervalMs : 60_000
  const alert = createAlert({ file: paths.alertFile, warn: (line) => warn(ctx, line) })
  const queue = createQueue({
    dir: paths.queueDir,
    // 热改：maxRetries/ttlDays 每次 replay 现读（config queue{maxRetries:3, ttlDays:7}）
    getCfg: () => ({ maxRetries: readCfg().queue.maxRetries, ttlMs: readCfg().queue.ttlDays * 86_400_000 }),
    warn: (line) => warn(ctx, line),
    now: nowMs,
  })
  const queueWatch = alert.watch('queue-replay')
  const tick = createTick({
    ledgerFile: paths.ledgerFile,
    intervalMs: tickIntervalMs,
    now: nowMs,
    warn: (line) => warn(ctx, line),
    jobs: [
      {
        // 队列补交：写失败条目治愈后重试（appendCapture 与 flush 同语义，marker 覆盖判据=恰一次）
        name: 'queue-replay',
        run: async () => {
          const r = await queue.replay({ handle: (entry) => appendCapture(entry.payload) })
          for (const e of r.exhausted ?? []) {
            await alert.append('retry-exhausted',
              `补交重试耗尽已删：dedupKey=${e.dedupKey} retries=${e.retries} target=${e.payload?.target ?? '?'}`)
          }
          if (r.ok === false) await queueWatch.fail(r.error ?? new Error('queue replay failed'))
          else if ((r.failed ?? 0) > 0) await queueWatch.fail(new Error(`本轮 ${r.failed} 条补交失败`))
          else queueWatch.ok()
          return { madeUp: r.succeeded ?? 0, failed: r.failed ?? 0, exhausted: (r.exhausted ?? []).length }
        },
      },
      {
        // 索引增量刷新（Q10 轻活面）：索引归 kb-context（FTS 域）；本包只承载调度+补跑账本，
        // 钩子缺省明示「不归我管」（skipped 留痕，绝不静默假装刷新过）。
        name: 'index-refresh',
        run: async (info) => {
          if (typeof opts?.indexRefresh === 'function') {
            const r = (await opts.indexRefresh(info)) ?? {}
            return { ...r, madeUp: Number(r.madeUp) || 0 }
          }
          return { skipped: 'not-owned', madeUp: 0 }
        },
      },
      {
        // 告警汇总：buffer 统计聚合成一行 + 归零（buffer.js「T13 告警汇总后重置」契约）
        name: 'alert-summary',
        run: async () => {
          const r = await alert.summarize(getStats())
          resetStats()
          return { appended: r.appended === true, madeUp: 0 }
        },
      },
    ],
  })

  // timer 服务软取得（cordis-plugin-timer；Ruling 申报②：inject 维持 ['tools'] 不加 'timer'——
  // cordis 对未 inject 的服务属性取用会抛，这里 try/catch 软取得 + 缺位 fail-open 留痕，
  // 宿主没有 timer 服务时插件其余面照常活）。timer 后到 → 首个事件缝懒补接（不重入不重复注册）。
  const timerService = () => {
    try {
      if (typeof ctx?.get === 'function') {
        const t = ctx.get('timer')
        if (t && typeof t.interval === 'function') return t
        const t2 = ctx.get('timer', false) // 非严格：提供者未激活也认（懒补接面）
        if (t2 && typeof t2.interval === 'function') return t2
      }
    } catch { /* cordis 代理在服务缺位时抛——走兜底 */ }
    try {
      if (ctx?.timer && typeof ctx.timer.interval === 'function') return ctx.timer
    } catch { /* 同上 */ }
    return null
  }
  let timerWired = false
  const ensureTimer = () => {
    if (timerWired) return true
    const timer = timerService()
    if (timer === null) return false
    try {
      // 回调返回 tick promise（cordis 忽略返回值；测试可 await 该回调=无竞态驱动）
      timer.interval(() => Promise.resolve(tick.tick()).catch((e) => {
        warn(ctx, `[wiki-steward] timer tick 异常已吞（不阻塞）：${e?.message ?? e}`)
      }), tickIntervalMs)
      timerWired = true
      return true
    } catch (e) {
      warn(ctx, `[wiki-steward] timer 接线异常已吞（留痕）：${e?.message ?? e}`)
      return false
    }
  }
  if (!ensureTimer()) {
    warn(ctx, '[wiki-steward] timer 服务缺失（cordis-plugin-timer），定时轻活未接线（fail-open）：队列补交/索引刷新/告警汇总暂停，tick() 可手动触发；timer 后到将随首个事件自动补接')
  }

  // ---- ingest 定时调度（Task F3；诊断 §4.2 选项 A 终裁=插件自管 timer）----
  // 到点 spawn 既有 dsh-cron.sh wiki-ingest 通道（复用 ingest-trigger distill 缝——通道缺/在跑=
  // 如实回报不 spawn，flock 防重入天然兜底）；enabled=false 不调度；错过补跑判据=既有日志面
  // 当日跑记录（lib/ingest-schedule.js 契约头注）。触发缝与 web 数据面共用一个 trigger 实例
  // （opts.web.trigger 注入缝同源）。生命周期挂 ctx.effect（INV-3 零残留定时器）：
  // 缺 effect 缝=不裸起定时器 + 功能启用时留痕如实（缺省 disabled 零留痕）。
  const ingestHome = opts?.web?.home ?? os.homedir()
  const ingestLogDir = opts?.web?.logDir ?? path.join(ingestHome, '.dsh', 'logs', 'cron')
  const ingestTrigger = opts?.web?.trigger ?? createIngestTrigger({ home: ingestHome, logDir: ingestLogDir, now: () => new Date(nowMs()) })
  const schedOpts = opts?.ingest ?? {}
  const scheduler = createIngestScheduler({
    getCfg: () => readCfg().ingest.schedule,
    distill: typeof schedOpts.distill === 'function' ? schedOpts.distill : (meta) => ingestTrigger.distill(meta),
    now: typeof schedOpts.now === 'function' ? schedOpts.now : nowMs,
    logDir: schedOpts.logDir ?? ingestLogDir,
    taskName: schedOpts.taskName ?? DISTILL_TASK_NAME,
    runRecordExists: schedOpts.runRecordExists,
    setTimeoutFn: schedOpts.setTimeout,
    clearTimeoutFn: schedOpts.clearTimeout,
    setIntervalFn: schedOpts.setInterval,
    clearIntervalFn: schedOpts.clearInterval,
    reconcileIntervalMs: schedOpts.reconcileIntervalMs,
    warn: (line) => warn(ctx, line),
  })
  // effect 软取得（cordis:676 代理语义：未 inject 属性访问即抛——B1 地基锁钉住）：
  // try/catch 兜底 + 缺位=不裸起定时器（INV-3），绝不让属性访问抛穿 apply。
  let effectFn = null
  try {
    if (typeof ctx?.effect === 'function') effectFn = ctx.effect
  } catch { /* cordis 代理在属性缺席时抛——走兜底 */ }
  if (effectFn !== null) {
    effectFn.call(ctx, () => {
      scheduler.start()
      return () => scheduler.stop()
    }, 'wiki-steward: ingest-schedule')
  } else if (readCfg().ingest.schedule.enabled) {
    warn(ctx, '[wiki-steward] ingest 定时调度未接线：宿主 ctx.effect 缺失（无拆除器通道；INV-3 零残留纪律不裸起定时器，定时蒸馏本部署不生效）')
  }

  // ---- Hindsight 定时同步调度（2026-10-07 波 repair-r2 F1；U2「同步时间调整」落地）----
  // 与 ingest 调度器并列（createIngestScheduler 同款形）：消费 hindsight.sync.schedule{enabled,time}
  // + 过 L1 门禁 hindsight.enabled（关=不触发）；触发缝=createSyncStarter 同一实例（手动/定时同源单飞，
  // already-running 防重入）；补跑判据=同步日志 jsonl 当日有行（syncRanOnStamp，失败行也计=已跑）；
  // 生命周期挂 ctx.effect（INV-3 零残留定时器；缺 effect 缝=不裸起定时器+功能启用时留痕如实）。
  // 默认 03:25=在 wiki-ingest 00:25 之后错峰（Config 默认同源=defaults 取值，禁双处硬编码）。
  // 注入缝 opts.hindsight={createEngine,now,runRecordExists,setTimeout,clearTimeout,setInterval,
  // clearInterval,reconcileIntervalMs}（测试假 clock/timer/引擎缝——ingest-schedule 测试同款形）。
  const hsDataDir = opts?.paths?.dataDir ?? dataRoot
  const hsSyncLogFile = opts?.paths?.syncLogFile ?? path.join(hsDataDir, 'hindsight-sync-log.jsonl')
  const hsSchedOpts = opts?.hindsight ?? {}
  const startSync = createSyncStarter({
    getConfig: readCfg,
    createEngine: typeof hsSchedOpts.createEngine === 'function'
      ? hsSchedOpts.createEngine
      : (cfg) => createHindsightSync({
        vaultRoot: cfg.vaultRoot,
        dataDir: hsDataDir,
        apiUrl: cfg.hindsight.apiUrl,
        banks: cfg.hindsight.banks,
      }),
    warn: (line) => warn(ctx, `[wiki-steward] ${line}`),
  })
  const hsScheduler = createIngestScheduler({
    getCfg: () => {
      const c = readCfg()
      const s = c.hindsight.sync.schedule
      return {
        enabled: s.enabled === true && c.hindsight.enabled === true, // L1 门禁：hindsight.enabled 关=不触发
        time: isValidScheduleTime(s.time) ? s.time : defaults.hindsight.sync.schedule.time,
      }
    },
    distill: () => startSync(),
    now: typeof hsSchedOpts.now === 'function' ? hsSchedOpts.now : nowMs,
    logDir: hsDataDir,
    taskName: 'hindsight-sync',
    runRecordExists: typeof hsSchedOpts.runRecordExists === 'function'
      ? hsSchedOpts.runRecordExists
      : (stamp) => syncRanOnStamp(hsSyncLogFile, stamp),
    setTimeoutFn: hsSchedOpts.setTimeout,
    clearTimeoutFn: hsSchedOpts.clearTimeout,
    setIntervalFn: hsSchedOpts.setInterval,
    clearIntervalFn: hsSchedOpts.clearInterval,
    reconcileIntervalMs: hsSchedOpts.reconcileIntervalMs,
    warn: (line) => warn(ctx, line),
  })
  if (effectFn !== null) {
    effectFn.call(ctx, () => {
      hsScheduler.start()
      return () => hsScheduler.stop()
    }, 'wiki-steward: hindsight-schedule')
  } else if (readCfg().hindsight.enabled && readCfg().hindsight.sync.schedule.enabled) {
    warn(ctx, '[wiki-steward] Hindsight 定时同步未接线：宿主 ctx.effect 缺失（无拆除器通道；INV-3 零残留纪律不裸起定时器，定时同步本部署不生效）')
  }

  // ---- 捕获接线（T9；Q7a/Q17 组合裁定）----
  // 三缝：session/event（投影+completed 校验）+ agent/turn-stopping（收口）+ session/disposed（收尾 flush）。
  // 每缝独立 try/catch 吞+留痕——捕获绝不阻塞会话（turn-stopping 是 serial 钩子，上抛=挡收口）。
  /** sessionId → {capture: 状态机, buffer: 单会话缓冲} */
  const slots = new Map()

  const slotFor = (session) => {
    let slot = slots.get(session.id)
    if (slot === undefined) {
      slot = {
        capture: createCaptureState(),
        buffer: createBuffer({
          sessionId: session.id,
          getCfg: readCfg,
          warn: (line) => warn(ctx, line),
          enqueue: (entry) => queue.enqueue(entry), // T13：flush 失败→幂等队列备份
          dequeue: (dedupKey) => queue.dequeue(dedupKey), // T13：flush 成功→清持久备份
        }),
      }
      slots.set(session.id, slot)
    }
    return slot
  }

  const swallow = (where, e) => {
    bumpStat('swallowed', 1)
    warn(ctx, `[wiki-steward] 捕获 ${where} 异常已吞（不阻塞会话）：${e?.message ?? e}`)
  }

  ctx.on('session/event', async (session, event) => {
    try {
      if (!timerWired) ensureTimer() // 懒补接：timer 后到随首个事件接上（不重入；失败不告警防刷屏）
      if (!readCfg().capture.enabled) return // 热改门：禁用即零捕获（不建 slot）
      if (!session || isSubagentHeader(session.header)) return // ② subagent/fork 不捕获（tianxingleo 范式）
      if (event?.type === 'turn/end') {
        // completed 才提交（Q7a 组合：turn-stopping 收口 + turn/end 校验；aborted/error 双清）
        const slot = slots.get(session.id)
        if (slot === undefined) return
        const toCommit = turnEnded(slot.capture, event.data?.turn, event.data?.reason?.kind)
        if (toCommit !== null && toCommit.length > 0) {
          await slot.buffer.commit(event.data.turn, toCommit) // 落盘失败内部吞+留痕，commit 永不 reject
        }
        return
      }
      observe(slotFor(session).capture, event) // user/assistant 投影入缓冲（subagent 已在上方排除）
    } catch (e) {
      swallow('session/event', e)
    }
  })

  ctx.on('agent/turn-stopping', async ({ agent, turn }) => {
    try {
      if (!readCfg().capture.enabled) return
      const session = agent?.session
      if (!session || isSubagentHeader(session.header)) return
      stopping(slotFor(session).capture, turn) // 收口：uncommitted → pending（completed 才提交）
    } catch (e) {
      swallow('turn-stopping', e) // ⑥ 异常必须吞——serial 钩子上抛会阻塞会话收口
    }
  })

  ctx.on('session/disposed', async (session) => {
    try {
      const slot = slots.get(session?.id)
      if (slot === undefined) return
      await slot.buffer.flush() // 收尾余量：正常关闭不系统性丢最后 <3 轮（Q7a 崩溃上界之外的常态面）
      slots.delete(session.id) // 会话生命周期态回收（防 Map 泄漏）
    } catch (e) {
      swallow('session/disposed', e)
    }
  })

  // ---- 数据面（设置面 + ingest 面板：/api/wiki-steward/* + web/dist 静态，官方路由形）----
  // B1 修复（2026-09-28 b1b2 波 TECH.md D1，kb-context 0.3.1 同族姿势）双层子插件形
  // （替代 softService 单次快照——apply 时序窗口结构性不可靠：服务后到不可见、宿主代理取未 inject
  // 属性即抛，兜底收敛 null → 整段跳过）：
  //  - 外层 inject=['tools'] 不动（load.test 钉住）：工具/捕获/队列/写入拦截面在全部署面照常（INV-4）；
  //  - web 数据面迁入内层子插件硬 inject ['webServer','connection']：provider 缺位=延迟激活不炸装载、
  //    provider 到达自动补激活（宿主代管 fiber 生命周期，INV-2 fail-open）；
  //  - configEditor 保持可缺位=只读部署如实（不进硬 inject）：apply 期软取得（缺=null → 写端点 503
  //    如实、展示面照常，诚实面=响应判据非额外告警）；
  //  - B2 修复（TECH.md D2）：注册动作在 effect 执行体内当场跑、返回值=拆除器、拆除幂等；
  //    注册中途抛错先收敛已注册资源再上抛（label 留痕，绝不吞错）；
  //  - 缺缝留痕（INV-15 不弱化；审查 F1 裁决：用户确认 INV-2「web 数据面缺席留痕如实」口径优先）：
  //    告警专用 best-effort 探测（仅 warn，不参与注册决策；探测不抛）；
  //    双缺（web 数据面完全缺席）=留痕恰一 + 半缺=留痕恰一，两者都留痕如实。
  const softService = (name, probe) => {
    try {
      if (typeof ctx?.get === 'function') {
        const a = ctx.get(name)
        if (probe(a)) return a
        const b = ctx.get(name, false) // 非严格：提供者未激活也认（懒补接面）
        if (probe(b)) return b
      }
    } catch { /* cordis 代理在服务缺位时抛——走兜底 */ }
    try {
      if (probe(ctx?.[name])) return ctx[name]
    } catch { /* 同上 */ }
    return null
  }
  const configEditorSvc = softService('configEditor', (s) => typeof s?.edit === 'function' && typeof s?.entries === 'function')
  const applyPatch = configEditorSvc === null ? null : createApplyPatch({ configEditor: configEditorSvc, entryId: 'wiki-steward', Config })
  // R-29（t19 P0 双源根治）：hindsight 专属写缝（白名单=HINDSIGHT_EDITABLE_PATHS 3 叶）= 面板唯一写入口；
  // 通用 applyPatch（EDITABLE_PATHS 7 叶）对 hindsight 键整单拒（rows/POST settings 面不再可写）。
  const applyHindsightPatch = configEditorSvc === null ? null : createApplyPatch({ configEditor: configEditorSvc, entryId: 'wiki-steward', Config, editablePaths: HINDSIGHT_EDITABLE_PATHS })
  const wsProbe = softService('webServer', (s) => typeof s?.register === 'function')
  const connProbe = softService('connection', (s) => typeof s?.requestRejection === 'function')
  if (wsProbe === null && connProbe === null) {
    warn(ctx, '[wiki-steward] webServer/connection 服务缝缺失，数据面（/api/wiki-steward/*）未注册（fail-open：捕获/工具面照常）')
  } else if ((wsProbe === null) !== (connProbe === null)) {
    warn(ctx, '[wiki-steward] webServer/connection 服务缝半缺，数据面（/api/wiki-steward/*）未注册（fail-open：捕获/工具面照常）')
  }
  try {
    if (typeof ctx?.plugin === 'function') {
      ctx.plugin({
        inject: ['webServer', 'connection'],
        apply(c) {
          if (typeof c?.effect !== 'function') return // 缺 effect 缝=无拆除器路径，跳过注册（INV-3 零残留；真宿主子插件 ctx 恒有 effect）
          c.effect(() => {
            // 注册即记账（register 返回的拆除器当场入账）：中途抛错也能收敛已注册资源
            const disposers = []
            const register = (spec) => {
              const d = c.webServer.register(spec)
              if (typeof d === 'function') disposers.push(d)
              return d
            }
            try {
              const webOpts = opts.web ?? {}
              const distDir = webOpts.distDir ?? fileURLToPath(new URL('../web/dist', import.meta.url))
              const trigger = webOpts.trigger ?? ingestTrigger // 与定时调度共用同一触发缝实例（Task F3）
              const sources = webOpts.sources ?? defaultLogSources({ home: ingestHome })
              // Hindsight 数据面（2026-10-07 波 U2/U3，t9 + repair-r2 F1）：4 端点 + L1 门禁 detached
              // 同步触发器。startSync/hsSyncLogFile 已上提外层（与定时调度同源单飞旗标——F1 合同）。
              const hindsight = createHindsightHandlers({
                connection: c.connection,
                getConfig: readCfg,
                applyHindsightPatch, // R-29：面板专属写缝（3 叶白名单）；通用 applyPatch 不接此面
                startSync,
                statusProbe: async () => {
                  const cfg = readCfg()
                  return collectStatus({ fetchImpl: globalThis.fetch, apiUrl: cfg.hindsight.apiUrl, home: ingestHome })
                },
                syncLogFile: hsSyncLogFile,
                warn: (line) => warn(ctx, `[wiki-steward] ${line}`),
              })
              for (const d of registerIngestRoutes({
                register,
                connection: c.connection,
                getConfig: readCfg, // 热改现读（与工具层 write.readOnly 同源）
                trigger,
                sources,
                distDir,
                applyPatch, // 设置写缝（缺=null → 写端点 503 如实，展示面照常）
                warn: (line) => warn(ctx, `[wiki-steward] ${line}`),
                hindsight, // Hindsight 数据面分发缝（/hindsight/* 内部分发；缺=404 如实）
              })) {
                if (typeof d === 'function' && !disposers.includes(d)) disposers.push(d) // 双记账去重（register 记账 + 返回值交账）
              }
            } catch (e) {
              for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } } // 先收敛已注册资源
              throw e // 再上抛（宿主 fiber 兜底收集；绝不吞错）
            }
            let disposed = false
            return () => {
              if (disposed) return // 拆除幂等：二次调用不得重复拆除
              disposed = true
              for (const d of disposers) { try { d() } catch { /* 收敛不抛 */ } }
            }
          }, 'wiki-steward: ingest-routes')
        },
      })
    }
  } catch { /* ctx.plugin 缺位/异常 fail-open：装载不炸（等价宿主 _reload 兜底语义） */ }
}

// ⚠️ default 必须是对象（R13）：宿主读 default.inject / default.apply
export default { inject, apply }
