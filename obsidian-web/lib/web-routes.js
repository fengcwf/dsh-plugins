// web-routes — /ob/ 主 UI 面（T2 API 形，报告写明）
// 注册面（OW-INV-10：一律 ctx.webServer.register 挂 dsh web 同域 3080，零新增暴露面）：
//   exact /ob/api/tree      GET → {data:{root,nodes}, total}          树列表（total=递归节点数）
//   exact /ob/api/file      GET → {data:{path,content,mtime,etag,size,rendered:{html,toc}}}  读+live 渲染
//   exact /ob/api/backlinks GET → {data:{path,backlinks:[{path,line,text}]}, total}
//   exact /ob               GET → 302 /ob/                            尾斜杠规整
//   prefix /ob              GET → web/dist 静态构建物（index.html + assets）
// API 形（沿历史 obsidian-workbench 惯例）：成功 {data, total?}；失败 {error:{code,message}}。
// 鉴权缝（OW-INV-8）：每条 handler 第一行过 ctx.connection.requestRejection({headers}) → 401/403。
// 宿主 match 语义（dsh-host-webserver 源码实测）：exact 优先 → 最长前缀，prefix 匹配 p 与 p/<anything>。
import fs from 'node:fs'
import path from 'node:path'
import { listTree, readNote, scanBacklinks } from './vault-ops.js'
import { renderMarkdown } from './render.js'

const JSON_TYPE = 'application/json; charset=utf-8'
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

function methodGuard(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  res.setHeader('allow', 'GET, HEAD')
  sendJson(res, 405, { error: { code: 'method_not_allowed', message: `不支持 ${req.method}` } })
  return false
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

function redirectHandler(req, res) {
  res.writeHead(302, { location: '/ob/' })
  res.end()
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
 */
export function registerWebRoutes(ctx, getConfig, { distDir }) {
  const disposers = []
  const add = (kind, routePath, handler) => disposers.push(ctx.webServer.register({ kind, path: routePath, handler }))
  const wrap = (handler) => (req, res) => {
    if (!authGate(ctx, req, res)) return
    if (!methodGuard(req, res)) return
    handler(req, res)
  }
  add('exact', '/ob/api/tree', wrap(treeHandler(getConfig)))
  add('exact', '/ob/api/file', wrap(fileHandler(getConfig)))
  add('exact', '/ob/api/backlinks', wrap(backlinksHandler(getConfig)))
  add('exact', '/ob', wrap(redirectHandler))
  add('prefix', '/ob', wrap(staticHandler(distDir)))
  return () => {
    while (disposers.length) {
      const dispose = disposers.pop()
      if (typeof dispose === 'function') dispose()
    }
  }
}
