// read-view — S2 阅读面模型（delta-specs/ui-ca-wave.md S2 节；设计正本 candidate-a.md 4/5）：
// 读取单元数据面（loadNoteUnit：fetchFile+fetchBacklinks 信封校验，ui-review F-1）+ 阅读头
//（路径 + 页题 ×1.75 + 元信息[更新时间/字数/标题数] + 动作[专注/编辑/分享]）+ 专注模式按钮。
// 纯模块纪律（ARC-6）：.vue 只做展示（NoteHeader.vue），App 只组装数据；标题派生复用 ui-base.noteTitle（勿重建）。
import { noteTitle } from './ui-base.js'

// ── 读取单元数据面（ui-review F-1 形 b 防御）────────────────────────────────────
/**
 * 打开笔记读取单元：fetchFile+fetchBacklinks 两条请求=同一加载单元，信封解构收敛在此——
 * 信封缺失/形状不对（200 但非 {data} 形）上抛可解释错误（含「JSON」），经 load-state 归 error 态；
 * 绝不让 TypeError 逃出 openPath（unhandled rejection=零 UI 反馈的静默失败，ui-review F-1 根因）。
 */
export async function loadNoteUnit(io, path) {
  const [f, b] = await Promise.all([io.fetchFile(path), io.fetchBacklinks(path)])
  const file = f?.data
  const backlinks = b?.data?.backlinks
  if (file == null || !Array.isArray(backlinks)) {
    throw new Error('响应不是有效 JSON 信封（HTTP 200）')
  }
  return { file, backlinks }
}

/** 元信息时间文案：YYYY-MM-DD HH:MM（无效回空串，缺数据的行不占位） */
export function formatNoteTime(at) {
  const t = Number(at)
  if (!Number.isFinite(t) || t <= 0) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 字数=源文去空白字符数（中英文同权；无效入参回 0） */
export function countNoteChars(content) {
  const s = String(content ?? '')
  return [...s.replace(/\s+/g, '')].length
}

/** 计数千分位（1286 → 1,286；非法回 '0'） */
export function formatCount(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return '0'
  return String(Math.trunc(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 阅读头元信息文案行（candidate-a 4：更新于 … / N 字 / N 个标题）：
 * 顺序固定；更新时间缺失不占位、标题数 0 不占位；字数恒在（0 也是事实）。
 */
export function noteMetaModel({ mtime, content, headings } = {}) {
  const out = []
  const updated = formatNoteTime(mtime)
  if (updated) out.push(`更新于 ${updated}`)
  if (content != null) out.push(`${formatCount(countNoteChars(content))} 字`)
  const n = Number(headings)
  if (Number.isFinite(n) && n > 0) out.push(`${formatCount(n)} 个标题`)
  return out
}

/** 专注模式按钮模型（candidate-a 5 最小面：无快捷键、无持久化，按钮文案随态翻转） */
export function focusButtonModel(focus) {
  const on = focus === true
  return { focus: on, label: on ? '退出专注' : '专注模式' }
}

/** 阅读头模型（NoteHeader 展示全量）：页题=路径末段去扩展名（noteTitle 同源） */
export function readHeadModel({ path, mtime, content, headings, focus } = {}) {
  const btn = focusButtonModel(focus)
  return {
    title: noteTitle(path) || '阅读',
    path: String(path ?? ''),
    meta: noteMetaModel({ mtime, content, headings }),
    focus: btn.focus,
    focusLabel: btn.label,
  }
}
