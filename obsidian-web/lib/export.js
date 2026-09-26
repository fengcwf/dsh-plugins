// export — 下载导出预扫（T7：OW-US-7 / OW-INV-9）。
// 限额语义（定稿，测试锁定）：预扫计数/体量**超限拒绝 + 可解释提示**（不是截断导出——INV 字面"超限拒绝"）；
//   限额常量显式 MAX_FILES=5000、MAX_BYTES=500MB（500*1024*1024）；"≤5000 文件/500MB"=上限含。
//   限额统一施加于两种导出形（单文件=files 1 + 字节面；目录=zip 全量计数/体量）——OW-US-7 括注挂整特性。
// 安全面：
//   - 导出路径过 resolved abs 围栏（词法围栏 + resolve 后越界拒，沿 vault-ops resolveInRoot 单一来源）；
//   - lstat 门：symlink 不跟随——单文件 symlink 拒 not-a-file；目录内 symlink/其他条目跳过+留痕；
//   - .trash 口径（Ruling：拒）：回收站=恢复材料非工作面，本体/内部条目/'./' 词法形态一律拒 in-trash
//     （判定口径=resolved abs 对 <root>/.trash 前缀——沿 T6 修复轮教训，字符串前缀不采信）；
//   - dot 条目不出（树同视图——listTree 不出树的导出也不入包）；隐藏文件显式请求仍可导出。
// zip 条目名=相对导出目录的 posix 路径（无包装目录）；目录条目显式（空目录不丢）。
// 域结果形（kb_mark ok 键惯例，T5/T6 同款）：成功 {ok:true,...}；域拒 {ok:false, reason, message}
//   reason ∈ 'not-found'|'not-a-file'|'in-trash'|'limit-exceeded'（不抛错）；
//   仅形参/围栏非法 throw bad_request（沿 deletePath/renameNote 惯例）。
import fs from 'node:fs'
import path from 'node:path'
import { resolveInRoot } from './vault-ops.js'

export const MAX_FILES = 5000
export const MAX_BYTES = 500 * 1024 * 1024

const TRASH = '.trash'

/**
 * 导出预扫：限额计数/体量 + lstat 门 + 跳过留痕（打包前一切拒绝面在此收口——拒=不产流）。
 * @returns {{ok: true, kind: 'file'|'dir', path, downloadName, entries, totalFiles, totalBytes, skipped: string[]}
 *          | {ok: false, reason, message, actual?, limit?}}
 */
export function planExport(root, relPath) {
  const abs = resolveInRoot(root, relPath) // 词法围栏 + resolved abs（throw bad_request）
  const base = path.resolve(root)
  const trashAbs = path.resolve(base, TRASH)
  if (abs === trashAbs || abs.startsWith(trashAbs + path.sep)) {
    return { ok: false, reason: 'in-trash', message: `回收站条目不提供导出（恢复材料非工作面）：${relPath}` }
  }
  const node = fs.lstatSync(abs, { throwIfNoEntry: false })
  if (node == null) return { ok: false, reason: 'not-found', message: `不存在：${relPath}` }
  if (!node.isFile() && !node.isDirectory()) {
    return { ok: false, reason: 'not-a-file', message: `仅普通文件/真实目录支持下载（拒 symlink/其他）：${relPath}` }
  }

  const skipped = []
  const entries = []
  let totalFiles = 0
  let totalBytes = 0

  if (node.isFile()) {
    entries.push({ name: path.basename(abs), type: 'file', abs, size: node.size, mtime: node.mtimeMs })
    totalFiles = 1
    totalBytes = node.size
  } else {
    const walk = (dirAbs, rel) => {
      const dirents = fs.readdirSync(dirAbs, { withFileTypes: true })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      for (const d of dirents) {
        if (d.name.startsWith('.')) continue // dot 条目不出（树同视图）；.trash 亦在此隐身
        const childRel = rel ? `${rel}/${d.name}` : d.name
        const childAbs = path.join(dirAbs, d.name)
        if (d.isDirectory()) {
          const st = fs.statSync(childAbs)
          entries.push({ name: `${childRel}/`, type: 'dir', abs: childAbs, size: 0, mtime: st.mtimeMs })
          walk(childAbs, childRel)
        } else if (d.isFile()) {
          const st = fs.statSync(childAbs)
          entries.push({ name: childRel, type: 'file', abs: childAbs, size: st.size, mtime: st.mtimeMs })
          totalFiles += 1
          totalBytes += st.size
        } else {
          // symlink/其他：不跟随、不解引用——跳过+留痕（INV-15 风格）
          skipped.push(`symlink 跳过（不解引用）：${childRel}`)
        }
      }
    }
    walk(abs, '')
  }

  if (totalFiles > MAX_FILES || totalBytes > MAX_BYTES) {
    return {
      ok: false,
      reason: 'limit-exceeded',
      message: `导出超限额：${totalFiles} 个文件（上限 ${MAX_FILES}）/ ${totalBytes} 字节（上限 ${MAX_BYTES}）——超限拒绝（不截断导出），请缩小导出范围`,
      actual: { files: totalFiles, bytes: totalBytes },
      limit: { files: MAX_FILES, bytes: MAX_BYTES },
    }
  }

  const downloadName = node.isDirectory() ? `${path.basename(abs)}.zip` : path.basename(abs)
  return { ok: true, kind: node.isDirectory() ? 'dir' : 'file', path: relPath, downloadName, entries, totalFiles, totalBytes, skipped }
}
