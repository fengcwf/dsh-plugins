// path-alias — CIFS/SMB 别名归一单一来源（M-5/T8 normalizeSegAlias 同款，share.js 与
// vault-ops realpath 围栏共用「同源口径」——T8 Ruling 3 交接：穿越判据 trim 后判）。
// 声明的 FS 模型（T8 fix r2 边界）：Win32「剥尾随点/空格」建模；对不做此类归一的 FS（Linux
// 字面名）相关判定只多拒不放行（fail-closed）。

/** 归一（M-5 同款）：剥前导空格+尾随 [. ]；前导 '.' 绝不剥（.env 保形） */
export function normalizeSegAlias(seg) {
  return String(seg).replace(/^[ ]+/, '').replace(/[. ]+$/, '')
}

/** 穿越判据（T8 Ruling 3 口径：trim 后判）——'.. '/' ..'/'..\t'≡'..' 同拒 */
export function isTraversalSeg(seg) {
  return String(seg).trim() === '..'
}

/**
 * 纯点空格别名段（归一后为空、又非通用 no-op '.'/'空'）——`...`/`. .`/`.. .` 等在声明的
 * FS 模型下无独立身份（T8 Ruling 2）。围栏面 fail-closed 拒（不可静默改写目标路径）；
 * 判错代价=Linux 字面点空格名不可寻址（可改名规避，T8 Ruling 2 同款论证）。
 */
export function isAliasOnlySeg(seg) {
  const s = String(seg).trim()
  return s !== '' && s !== '.' && normalizeSegAlias(seg) === ''
}
