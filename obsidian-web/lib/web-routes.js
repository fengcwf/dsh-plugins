// web-routes — /ob/ 主 UI 面（T2 API 形 + T4 保存/渲染面，报告写明）
// 注册面（OW-INV-10：一律 ctx.webServer.register 挂 dsh web 同域 3080，零新增暴露面）：
//   exact /ob/api/tree      GET  → {data:{root,nodes}, total}          树列表（total=递归节点数）
//   exact /ob/api/file      GET  → {data:{path,content,mtime,etag,size,rendered:{html,toc}}}  读+live 渲染
//   exact /ob/api/backlinks GET  → {data:{path,backlinks:[{path,line,text}]}, total}
//   exact /ob/api/search    GET  → {data:{backend,degraded,query,results}, total}  全文+标题搜索（T3/OW-US-2）
//   exact /ob/api/save      POST → {data:保存结果}      安全保存（T4/OW-INV-3：乐观锁+diff undo）
//   exact /ob/api/rename    POST → {data:rename 结果}   改名/移动多文件事务（T5/OW-US-5/OW-INV-4）
//   exact /ob/api/delete    POST → {data:删除结果}      删除可逆（T6/OW-US-6/OW-INV-5：双确认+.trash）
//   exact /ob/api/download  GET  → 文本流|zip 流       下载导出（T7/OW-US-7、OW-INV-9：限额超限拒+提示）
//   exact /ob/api/render    POST → {data:{html,toc}}   live 渲染（T4 分屏预览；ARC-1 前端零 markdown 解析）
//   exact /ob/api/index/refresh POST → {data:对账 run}  索引手动刷新（T11 保险③/OW-US-11：立即对账）
//                                        未接索引服务 → 503 index_unavailable（可解释，不装死）
//   exact /ob/api/shares    GET  → {data:{shares,total,settings,effectiveLanHost,sharePort}, total}
//                                        分享管理列表（T10/OW-US-10：计数/状态 + links 内外网双地址）
//   exact /ob/api/shares/create|revoke|password|role   POST → 分享管理操作（T10/OW-US-10）
//   exact /ob/api/share-settings GET|POST → {data:{externalBaseUrl,lanHost,effectiveLanHost,sharePort}}
//                                        外网域名设置（T10/OW-US-9：链接生成内外网都显示，服务端单一来源）
//   exact /ob/api/vault-profiles  GET  → {data:{profiles,activeProfileId}, total}
//   exact /ob/api/vault-profiles/add|delete|health|activate POST → vault 目录档案面
//                                        （T12/OW-US-13：默认当前目录+任意已挂载 SMB/NFS 路径+
//                                          健康检查三探针；切换 restartRequired=true 热改可解释
//                                          拒不冒充 + 换 vault 各配提示——T10/T11 交接）
//   exact /ob               GET  → 302 /ob/                            尾斜杠规整
//   prefix /ob              GET  → web/dist 静态构建物（index.html + assets）
// API 形（沿历史 obsidian-workbench 惯例）：成功 {data, total?}；失败 {error:{code,message}}。
// 保存结果形（OW-INV-3 契约，lib/vault-ops.saveNote 同形）：
//   成功 {ok,path,mtime,etag,size,diffUndo:{before,after}}（before=保存前快照=一键还原源）
//   冲突 {conflict:true,path,diffUndo:{before,incoming}}（200 域内结果；三选：覆盖/重载/对比）
//   ——冲突是业务结果非传输失败：走 {data} 信封（信封纪律：{data,...} 或 {error:{code,message}} 二选一）。
// 搜索结果项形（键集锁定）：{path, line, snippet, score, title}；
//   snippet=转义 HTML + <mark> 高亮（唯一标签，ARC-1 消毒口径）；
//   score=排序权重（越大越优，仅用于结果排序，非匹配概率/百分比——detpecca 教训语义进描述/文案）；
//   degraded=null | {reason:'timeout', message, scanned}（超时 fail-open 部分结果，INV-15 风格留痕）。
// 检索后端可插拔（T11 索引三保险接管）：registerWebRoutes 第三参 search.backends.fts 注入即用，
//   短查询（2 字盲区/纯符号）结构性走 scan/LIKE 兜底，后端切换零 API 变化。
// 索引手动刷新面（T11 保险③）：第三参 index={refresh} 注入即活；refresh() → 对账账本 run 形
//   （键锁定 test/index-routes.test.mjs：runId/startedAt/finishedAt/status/resumedFrom/cursor/counts/degraded）。
// 鉴权缝（OW-INV-8）：每条 handler 第一行过 ctx.connection.requestRejection({headers}) → 401/403。
// 宿主 match 语义（dsh-host-webserver 源码实测）：exact 优先 → 最长前缀，prefix 匹配 p 与 p/<anything>。
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { deletePath, listTree, readNote, renameNote, scanBacklinks, saveNote } from './vault-ops.js'
import {
  createShare, listShares, revokeShare, updateSharePassword, updateShareRole,
} from './share.js'
import {
  buildShareLinks, detectLanHost, readShareSettings, writeShareSettings, DEFAULT_SHARE_PORT,
} from './share-links.js'
import {
  listProfiles, addProfile, removeProfile, activateProfile, checkVaultHealth,
} from './vault-profiles.js'
import { planExport, MAX_FILES, MAX_BYTES, MAX_ENTRIES } from './export.js'
import { writeZipTo } from './zip.js'
import { renderMarkdown } from './render.js'
import { createSearchService } from './search.js'

const JSON_TYPE = 'application/json; charset=utf-8'
const MAX_BODY_BYTES = 5 * 1024 * 1024 // 保存/渲染请求体上限（笔记级；超限拒）
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function errorStatus(code) {
  // 管理面可解释错误（C2① 与 guest 404 冻结形分流）：sensitive_name/password_required/share_disabled
  // 细节只走 /ob/ 管理面（400 带码带消息）；guest 面（/ob_share/）一切失败仍是同形 404（share-server 锁形）
  if (code === 'bad_request' || code === 'sensitive_name' || code === 'password_required' || code === 'share_disabled') return 400
  if (code === 'not_found') return 404
  return 500
}

function failRequest(res, err) {
  const status = errorStatus(err?.code)
  const code = status === 500 ? 'internal' : err.code
  sendJson(res, status, { error: { code, message: String(err?.message ?? '内部错误') } })
}

/** OW-INV-8 鉴权缝：过缝失败直接回拒（形 {error:{code}}），绝不进业务 handler */
function authGate(ctx, req, res) {
  const rejection = ctx.connection.requestRejection({ headers: req.headers })
  if (rejection === undefined) return true
  sendJson(res, rejection, {
    error: { code: rejection === 401 ? 'unauthorized' : 'forbidden', message: '未通过请求鉴权' },
  })
  return false
}

function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true
  res.setHeader('allow', allowed.join(', '))
  sendJson(res, 405, { error: { code: 'method_not_allowed', message: `不支持 ${req.method}` } })
  return false
}

function badRequest(message) {
  return Object.assign(new Error(message), { code: 'bad_request' })
}

/** JSON 请求体读取（上限 MAX_BODY_BYTES；坏 JSON/超限一律 bad_request） */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let overflow = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        overflow = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (overflow) {
        reject(badRequest(`请求体超限（>${MAX_BODY_BYTES} 字节）`))
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(badRequest('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function countNodes(nodes) {
  return nodes.reduce((acc, n) => acc + 1 + (n.children ? countNodes(n.children) : 0), 0)
}

function treeHandler(getConfig) {
  return (req, res) => {
    try {
      const tree = listTree(getConfig().vaultRoot)
      sendJson(res, 200, { data: tree, total: countNodes(tree.nodes) })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

function fileHandler(getConfig) {
  return (req, res) => {
    try {
      const relPath = new URL(req.url, 'http://localhost').searchParams.get('path')
      if (typeof relPath !== 'string' || relPath === '') {
        failRequest(res, Object.assign(new Error('path 参数缺失'), { code: 'bad_request' }))
        return
      }
      const note = readNote(getConfig().vaultRoot, relPath)
      // live 渲染唯一源（ARC-1）：rendered 一律出自 lib/render.js；非 md 出空渲染面，原始内容照给
      const rendered = note.path.toLowerCase().endsWith('.md') ? renderMarkdown(note.content) : { html: '', toc: [] }
      sendJson(res, 200, { data: { ...note, rendered } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

function backlinksHandler(getConfig) {
  return (req, res) => {
    try {
      const relPath = new URL(req.url, 'http://localhost').searchParams.get('path')
      if (typeof relPath !== 'string' || relPath === '') {
        failRequest(res, Object.assign(new Error('path 参数缺失'), { code: 'bad_request' }))
        return
      }
      const data = scanBacklinks(getConfig().vaultRoot, relPath)
      sendJson(res, 200, { data, total: data.backlinks.length })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

function searchHandler(getConfig, service) {
  return async (req, res) => {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams
      const q = params.get('q')
      if (typeof q !== 'string' || q.trim() === '') {
        failRequest(res, Object.assign(new Error('q 参数缺失'), { code: 'bad_request' }))
        return
      }
      const limitRaw = params.get('limit')
      let limit
      if (limitRaw !== null) {
        limit = Number(limitRaw)
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
          failRequest(res, Object.assign(new Error('limit 非法（1..200 整数）'), { code: 'bad_request' }))
          return
        }
      }
      const data = await service.search(getConfig().vaultRoot, q, limit === undefined ? {} : { limit })
      sendJson(res, 200, { data, total: data.results.length })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

function redirectHandler(req, res) {
  res.writeHead(302, { location: '/ob/' })
  res.end()
}

// ── /ob/api/save（T4 保存面：OW-INV-3 乐观锁 + 冲突三选 + diff undo）────────────
function saveHandler(getConfig) {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const relPath = body?.path
      if (typeof relPath !== 'string' || relPath === '') throw badRequest('path 参数缺失')
      if (typeof body?.content !== 'string') throw badRequest('content 必须是字符串')
      const lock = {}
      if (body.expectedMtime !== undefined) lock.expectedMtime = body.expectedMtime
      if (body.etag !== undefined) lock.etag = body.etag
      // 无乐观锁不落盘（OW-INV-3）：saveNote 校验，缺锁 400
      const result = await saveNote(getConfig().vaultRoot, relPath, body.content, lock)
      sendJson(res, 200, { data: result })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// ── /ob/api/rename（T5 改名/移动多文件事务：OW-US-5 / OW-INV-4）────────────────
// 结果形（lib/vault-ops.renameNote 同形，kb_mark ok 键惯例）：事务域结果（成功/目标已存在/回滚态）
//   一律 200 {data:{ok, rolledBack, warnings, changed[], reason?}}——UI 按 ok/reason 决策
//   （target-exists → 三选同 save 冲突惯例）；仅形参/围栏非法 400 {error:{code,message}}。
function renameHandler(getConfig) {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const result = await renameNote(getConfig().vaultRoot, body?.from, body?.to, {
        overwrite: body?.overwrite === true ? true : undefined,
      })
      sendJson(res, 200, { data: result })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// ── /ob/api/delete（T6 删除可逆：OW-US-6 / OW-INV-5）────────────────────────
// 结果形（lib/vault-ops.deletePath 同形，kb_mark ok 键惯例）：删除域结果（成功/双确认拒/门拒/落点失败）
//   一律 200 {data:{ok, trashPath, warnings}}——UI 按 ok/reason 决策；仅形参/围栏非法 400 {error}。
//   双确认：confirm=目标相对路径全等复述（服务端确认检查先于一切副作用，缺省拒——见 deletePath）。
function deleteHandler(getConfig) {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const result = await deletePath(getConfig().vaultRoot, body?.path, { confirm: body?.confirm })
      sendJson(res, 200, { data: result })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// ── /ob/api/download（T7 下载导出：OW-US-7 / OW-INV-9）────────────────────────
// 信封（T5/T6 惯例二选一定稿）：域结果（限额超限/回收站拒/门拒/缺文件）一律 200 {data:{ok:false, reason,
//   message}}——UI 按 reason 决策；仅形参/围栏非法 400 {error:{code,message}}；成功=二进制流（非信封）：
//   单文件=文本流（text/markdown 等 MIME），目录=zip 流（lib/zip.js）。
// 限额（OW-INV-9）：预扫在产流之前（lib/export.js planExport）——超限拒 + 可解释提示，绝不截断导出；
//   条目数（含目录，MAX_ENTRIES）与文件数/字节同限额（fix r1/I1：目录条目原不计限额→截断流缺口已闭）。
// 安全面：resolved abs 围栏 + lstat 门（symlink 不跟随）+ .trash 拒导出；Content-Disposition 文件名
//   消毒（contentDisposition：控制字符剥除+引号/反斜杠换 '_' + filename* RFC 5987，防头注入）。
// 留痕：symlink 跳过逐条 ctx.logger.warn + 计数头 x-ob-export-skipped（INV-15 风格）；
//   流中途故障=断流不谎报（headersSent 后 res.destroy，绝不拼半截 zip 假装成功）。
/** Content-Disposition 构造（头注入消毒）：控制字符（含 CR/LF/NUL）剥除、引号/反斜杠换 '_'；
 *  ASCII 回退名 + filename*=UTF-8''RFC 5987 percent-encode（' 一并编码防 attr-char 断裂）。 */
export function contentDisposition(filename) {
  const clean = String(filename ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/["\\]/g, '_')
  const base = clean === '' ? 'download' : clean
  const ascii = base.replace(/[^\x20-\x7E]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base).replace(/'/g, '%27')}`
}

function logWarn(ctx, line) {
  try {
    if (ctx?.logger?.warn) {
      ctx.logger.warn(line)
      return
    }
  } catch { /* logger 抛错不阻塞下载 */ }
  console.warn(line)
}

function downloadHandler(ctx, getConfig) {
  return async (req, res) => {
    try {
      const relPath = new URL(req.url, 'http://localhost').searchParams.get('path')
      if (typeof relPath !== 'string' || relPath === '') throw badRequest('path 参数缺失')
      const plan = planExport(getConfig().vaultRoot, relPath) // 域拒在产流前收口（throw bad_request=围栏非法）
      if (!plan.ok) {
        sendJson(res, 200, { data: plan })
        return
      }
      for (const line of plan.skipped) logWarn(ctx, `[obsidian-web] 下载跳过：${line}`)
      const headers = {
        'content-disposition': contentDisposition(plan.downloadName),
        'cache-control': 'no-store',
        'x-ob-export-files': String(plan.totalFiles),
        'x-ob-export-bytes': String(plan.totalBytes),
        'x-ob-export-skipped': String(plan.skipped.length),
      }
      if (plan.kind === 'file') {
        // 打包前 lstat 复核（TOCTOU 防御）：symlink 换入/被删 → 域拒，不产流
        const st = fs.lstatSync(plan.entries[0].abs, { throwIfNoEntry: false })
        if (st == null || !st.isFile()) {
          sendJson(res, 200, { data: { ok: false, reason: 'not-a-file', message: `导出前复核失败（文件已非普通文件）：${relPath}` } })
          return
        }
        headers['content-type'] = MIME[path.extname(plan.entries[0].name).toLowerCase()] ?? 'application/octet-stream'
        headers['content-length'] = String(st.size)
        res.writeHead(200, headers)
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        await pipeline(fs.createReadStream(plan.entries[0].abs), res)
        return
      }
      headers['content-type'] = 'application/zip'
      res.writeHead(200, headers)
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      await writeZipTo(res, plan.entries, {
        onSkip: (entry) => logWarn(ctx, `[obsidian-web] 下载跳过（打包期 lstat 复核）：${entry.name}`),
        maxFiles: MAX_FILES, // 打包期限额复核（OW-INV-9 TOCTOU 防御）：预扫后增长即断流，绝不静默超限出包
        maxBytes: MAX_BYTES,
        maxEntries: MAX_ENTRIES, // fix r1/I1 条目数（含目录）流内复核：双上限之一（zip64 豁免依据）
      })
      res.end()
    } catch (err) {
      if (res.headersSent) {
        res.destroy(err) // 流中途故障：断流不谎报（绝不半截 zip 假成功）
        return
      }
      failRequest(res, err)
    }
  }
}

// ── /ob/api/render（T4 预览面：唯一渲染源 ARC-1——分屏预览/分享页同管线）─────────
function renderHandler() {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      if (typeof body?.content !== 'string') throw badRequest('content 必须是字符串')
      sendJson(res, 200, { data: renderMarkdown(body.content) })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

/** 静态构建物服务（web/dist）：解码→围栏→realpath 前缀核（穿越/缺文件全不 200） */
function staticHandler(distDir) {
  const base = path.resolve(distDir)
  return (req, res) => {
    let sub
    try {
      sub = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/ob\/?/, '')
    } catch {
      sendJson(res, 400, { error: { code: 'bad_request', message: 'URL 解码失败' } })
      return
    }
    const rel = path.posix.normalize(sub.replace(/^\/+/, ''))
    if (rel === '..' || rel.startsWith('../') || rel.includes('\0') || path.isAbsolute(rel)) {
      res.writeHead(404)
      res.end()
      return
    }
    let filePath = path.resolve(base, rel === '' ? 'index.html' : rel)
    if (filePath !== base && !filePath.startsWith(base + path.sep)) {
      res.writeHead(404)
      res.end()
      return
    }
    let stat
    try {
      stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        stat = fs.statSync(filePath)
      }
    } catch {
      res.writeHead(404)
      res.end()
      return
    }
    const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'cache-control': 'no-cache' })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(fs.readFileSync(filePath))
  }
}

// ── 分享管理面（T10 / OW-US-10 + OW-US-9）──────────────────────────────────────
// 列表/查看计数/撤销/密码与权限调整 + 外网域名设置 + 链接下发。鉴权=authGate（requestRejection 缝，
// T1 惯例/OW-INV-8）；管理面错误=可解释（C2① 与 guest 404 冻结形分流：sensitive_name/password_required
// 细节只走本面）。链接=服务端单一来源下发（share-links.buildShareLinks 唯一拼接点，前端零拼接——
// 红线「禁止半路拼分享 URL」）。计数口径：管理页展示计数=每分享条目查看计数 accessCount（checkAccess
// 成功次数）；对外脱敏计数恒=痕迹计数（<redacted> 出现处数，T9 分野）——本面无脱敏计数字段，有则照此。
function shareManageContext(getConfig) {
  const config = getConfig()
  const settings = readShareSettings(config.vaultRoot)
  return { config, root: config.vaultRoot, settings, lanHost: settings.lanHost ?? detectLanHost() }
}

function shareWithLinks(ctx, share) {
  return { ...share, links: buildShareLinks({ token: share.token, config: ctx.config, settings: ctx.settings, lanHost: ctx.lanHost }) }
}

function sharePortOf(ctx) {
  return ctx.config?.server?.sharePort ?? DEFAULT_SHARE_PORT
}

// GET /ob/api/shares → {data:{shares:[{...管理面形, links:{path,internal,external}}], total, settings,
//   effectiveLanHost, sharePort}, total}（内外网地址都显示：internal=内网 host:sharePort、
//   external=设置页配置的外网域名（未配置=null 显式占位）；密码 hash 零外泄=hasPassword 布尔）
function sharesListHandler(getConfig) {
  return async (req, res) => {
    try {
      const ctx = shareManageContext(getConfig)
      const { shares, total } = await listShares(ctx.root)
      sendJson(res, 200, {
        data: {
          shares: shares.map((s) => shareWithLinks(ctx, s)),
          total,
          settings: { externalBaseUrl: ctx.settings.externalBaseUrl, lanHost: ctx.settings.lanHost },
          effectiveLanHost: ctx.lanHost,
          sharePort: sharePortOf(ctx),
        },
        total,
      })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// POST /ob/api/shares/create → {data:{share, password}}（autoPassword 明文恰一次返回，否则 null）
function sharesCreateHandler(getConfig) {
  return async (req, res) => {
    try {
      const ctx = shareManageContext(getConfig)
      const body = await readJsonBody(req)
      const result = await createShare(ctx.root, body, { config: ctx.config })
      sendJson(res, 200, { data: { share: shareWithLinks(ctx, result.share), password: result.password } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// POST /ob/api/shares/revoke → {data:{share}}（撤销即时失效=guest 面同形 404，OW-INV-2b）
function sharesRevokeHandler(getConfig) {
  return async (req, res) => {
    try {
      const ctx = shareManageContext(getConfig)
      const body = await readJsonBody(req)
      const result = await revokeShare(ctx.root, body?.token)
      sendJson(res, 200, { data: { share: shareWithLinks(ctx, result.share) } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// POST /ob/api/shares/password → {data:{share, password}}（password=null=清除，仅读角色；写必须保留）
function sharesPasswordHandler(getConfig) {
  return async (req, res) => {
    try {
      const ctx = shareManageContext(getConfig)
      const body = await readJsonBody(req)
      const result = await updateSharePassword(ctx.root, body?.token, { password: body?.password, autoPassword: body?.autoPassword })
      sendJson(res, 200, { data: { share: shareWithLinks(ctx, result.share), password: result.password } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// POST /ob/api/shares/role → {data:{share, password}}（升 write 强制密码=OW-INV-1 不变量 HTTP 面）
function sharesRoleHandler(getConfig) {
  return async (req, res) => {
    try {
      const ctx = shareManageContext(getConfig)
      const body = await readJsonBody(req)
      const result = await updateShareRole(ctx.root, body?.token, body?.role, { password: body?.password, autoPassword: body?.autoPassword })
      sendJson(res, 200, { data: { share: shareWithLinks(ctx, result.share), password: result.password } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// GET/POST /ob/api/share-settings → {data:{externalBaseUrl, lanHost, effectiveLanHost, sharePort}}
// （OW-US-9 设置页：外网域名配置→分享链接生成；POST 补丁合并、归一落盘、非法值 400 零落盘）
function shareSettingsHandler(getConfig) {
  return async (req, res) => {
    try {
      const ctx = shareManageContext(getConfig)
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        const saved = await writeShareSettings(ctx.root, { externalBaseUrl: body?.externalBaseUrl, lanHost: body?.lanHost })
        sendJson(res, 200, {
          data: { ...saved, effectiveLanHost: saved.lanHost ?? detectLanHost(), sharePort: sharePortOf(ctx) },
        })
        return
      }
      sendJson(res, 200, { data: { ...ctx.settings, effectiveLanHost: ctx.lanHost, sharePort: sharePortOf(ctx) } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// ── /ob/api/vault-profiles*（T12 设置页 vault 目录档案：OW-US-13）────────────────
// 语义：档案列表（默认当前目录恒在）+ 增/删（任意已挂载 SMB/NFS 路径）+ 健康检查
//   （可读/可写/延迟三探针；CIFS 挂载抖动容忍）+ 切换（restartRequired:true——热改可解释
//   拒不冒充，T11 交接）。换 vault 提示（T10）：message 含「重启」+「外网域名等各配」。
//   鉴权=authGate（T1 惯例/OW-INV-8）；错误=可解释（bad_request/not_found 带码带消息）。
function vaultProfilesListHandler(getConfig) {
  return async (req, res) => {
    try {
      const { profiles, activeProfileId } = listProfiles(getConfig().vaultRoot)
      sendJson(res, 200, { data: { profiles, activeProfileId }, total: profiles.length })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

function vaultProfilesAddHandler(getConfig) {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const { profile } = await addProfile(getConfig().vaultRoot, { name: body?.name, path: body?.path })
      sendJson(res, 200, { data: { profile } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

function vaultProfilesDeleteHandler(getConfig) {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const { profiles, activeProfileId } = await removeProfile(getConfig().vaultRoot, body?.id)
      sendJson(res, 200, { data: { profiles, activeProfileId } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// 健康检查：{id} 或 {path} 双入口（id → 档案路径；path 直查）→ {data:{health}} 三探针形
function vaultProfilesHealthHandler(getConfig) {
  return async (req, res) => {
    try {
      const root = getConfig().vaultRoot
      const body = await readJsonBody(req)
      let target = body?.path
      if (typeof target !== 'string' || target === '') {
        const id = body?.id
        const profile = listProfiles(root).profiles.find((p) => p.id === id)
        if (profile === undefined) throw Object.assign(new Error(`档案不存在：${id}`), { code: 'not_found' })
        target = profile.path
      }
      sendJson(res, 200, { data: { health: checkVaultHealth(target) } })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// 切换：activate → {data:{activeProfileId, restartRequired:true, message}}（T11：不冒充热改）
function vaultProfilesActivateHandler(getConfig) {
  return async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const result = await activateProfile(getConfig().vaultRoot, body?.id)
      sendJson(res, 200, { data: result })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

// ── /ob/api/index/refresh（T11 索引三保险·手动刷新：OW-US-11 / OW-INV-11）──────────
// 语义：POST 立即对账（先查补跑账本——未完 run 先续跑）；成功 200 {data:对账账本 run 形}；
//   未接索引服务 503 index_unavailable（可解释——检索仍走 scan 兜底，绝不静默装死）。
//   超时/中断如实带 degraded 留痕（INV-15）；鉴权=authGate（T1 惯例/OW-INV-8）。
function indexRefreshHandler(getIndex) {
  return async (req, res) => {
    try {
      const index = getIndex()
      if (!index || typeof index.refresh !== 'function') {
        sendJson(res, 503, {
          error: { code: 'index_unavailable', message: '索引服务未接入（检索走 scan 兜底；宿主 ctx.effect 缺失时索引不启动）' },
        })
        return
      }
      const run = await index.refresh()
      sendJson(res, 200, { data: run })
    } catch (err) {
      failRequest(res, err)
    }
  }
}

/**
 * 注册 /ob/ 全部路由，返回 dispose 全量注销。
 * @param ctx 宿主上下文（webServer.register + connection.requestRejection 缝）
 * @param getConfig 热改语义：每次请求现读当前配置
 * @param distDir web/dist 构建物目录
 * @param search 可选检索面调参/后端缝：{backends:{fts}, concurrency, timeoutMs, limit}
 *               （T11 索引三保险：注入 backends.fts 即接管 FTS5 检索，HTTP API 形零变化）
 * @param index 可选索引服务缝：{refresh}（T11 手动刷新；缺省 → 刷新面 503 可解释）
 */
export function registerWebRoutes(ctx, getConfig, { distDir, search, index }) {
  const disposers = []
  const searchService = createSearchService(search ?? {})
  const add = (kind, routePath, handler) => disposers.push(ctx.webServer.register({ kind, path: routePath, handler }))
  const wrap = (handler, allowed = ['GET', 'HEAD']) => (req, res) => {
    if (!authGate(ctx, req, res)) return
    if (!methodGuard(req, res, allowed)) return
    handler(req, res)
  }
  add('exact', '/ob/api/tree', wrap(treeHandler(getConfig)))
  add('exact', '/ob/api/file', wrap(fileHandler(getConfig)))
  add('exact', '/ob/api/backlinks', wrap(backlinksHandler(getConfig)))
  add('exact', '/ob/api/search', wrap(searchHandler(getConfig, searchService)))
  add('exact', '/ob/api/save', wrap(saveHandler(getConfig), ['POST']))
  add('exact', '/ob/api/rename', wrap(renameHandler(getConfig), ['POST']))
  add('exact', '/ob/api/delete', wrap(deleteHandler(getConfig), ['POST']))
  add('exact', '/ob/api/download', wrap(downloadHandler(ctx, getConfig)))
  add('exact', '/ob/api/render', wrap(renderHandler(), ['POST']))
  add('exact', '/ob/api/index/refresh', wrap(indexRefreshHandler(() => index), ['POST']))
  // T10 分享管理面（OW-US-10）+ 设置面（OW-US-9）：鉴权=authGate（T1 惯例）
  add('exact', '/ob/api/shares', wrap(sharesListHandler(getConfig)))
  add('exact', '/ob/api/shares/create', wrap(sharesCreateHandler(getConfig), ['POST']))
  add('exact', '/ob/api/shares/revoke', wrap(sharesRevokeHandler(getConfig), ['POST']))
  add('exact', '/ob/api/shares/password', wrap(sharesPasswordHandler(getConfig), ['POST']))
  add('exact', '/ob/api/shares/role', wrap(sharesRoleHandler(getConfig), ['POST']))
  add('exact', '/ob/api/share-settings', wrap(shareSettingsHandler(getConfig), ['GET', 'POST']))
  // T12 设置页 vault 目录档案面（OW-US-13）：鉴权=authGate（T1 惯例）
  add('exact', '/ob/api/vault-profiles', wrap(vaultProfilesListHandler(getConfig)))
  add('exact', '/ob/api/vault-profiles/add', wrap(vaultProfilesAddHandler(getConfig), ['POST']))
  add('exact', '/ob/api/vault-profiles/delete', wrap(vaultProfilesDeleteHandler(getConfig), ['POST']))
  add('exact', '/ob/api/vault-profiles/health', wrap(vaultProfilesHealthHandler(getConfig), ['POST']))
  add('exact', '/ob/api/vault-profiles/activate', wrap(vaultProfilesActivateHandler(getConfig), ['POST']))
  add('exact', '/ob', wrap(redirectHandler))
  add('prefix', '/ob', wrap(staticHandler(distDir)))
  return () => {
    while (disposers.length) {
      const dispose = disposers.pop()
      if (typeof dispose === 'function') dispose()
    }
  }
}
