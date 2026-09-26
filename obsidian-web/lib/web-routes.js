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
// 鉴权缝（OW-INV-8）：每条 handler 第一行过 ctx.connection.requestRejection({headers}) → 401/403。
// 宿主 match 语义（dsh-host-webserver 源码实测）：exact 优先 → 最长前缀，prefix 匹配 p 与 p/<anything>。
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { deletePath, listTree, readNote, renameNote, scanBacklinks, saveNote } from './vault-ops.js'
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
  if (code === 'bad_request') return 400
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

/**
 * 注册 /ob/ 全部路由，返回 dispose 全量注销。
 * @param ctx 宿主上下文（webServer.register + connection.requestRejection 缝）
 * @param getConfig 热改语义：每次请求现读当前配置
 * @param distDir web/dist 构建物目录
 * @param search 可选检索面调参/后端缝：{backends:{fts}, concurrency, timeoutMs, limit}
 *               （T11 索引三保险：注入 backends.fts 即接管 FTS5 检索，HTTP API 形零变化）
 */
export function registerWebRoutes(ctx, getConfig, { distDir, search }) {
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
  add('exact', '/ob', wrap(redirectHandler))
  add('prefix', '/ob', wrap(staticHandler(distDir)))
  return () => {
    while (disposers.length) {
      const dispose = disposers.pop()
      if (typeof dispose === 'function') dispose()
    }
  }
}
