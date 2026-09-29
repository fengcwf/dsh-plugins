// ui-base — UI C 公共底座纯函数（S1 / delta-specs/ui-ca-wave.md S1 节；设计正本 candidate-c.md）
// 容器/展示分离：.vue 只做展示，保存状态徽标四态 / 状态面（骨架·错误·空）视图模型 / 最近打开
// 全在本纯模块（组件逻辑测试 test/web-ui-base.test.mjs 锁形）。
// 本波零 IA 变更（菜单轨/树/中央/大纲结构不动）；加载状态机（8 秒超时升级）归 S2，本模块只给状态面。

/** 保存状态徽标四态（candidate-c 4）：文字在场 + 语义底色，无装饰色点 */
const SAVE_BADGE = Object.freeze({
  clean: Object.freeze({ status: 'clean', text: '已保存', tone: 'saved' }),
  dirty: Object.freeze({ status: 'dirty', text: '未保存', tone: 'dirty' }),
  saving: Object.freeze({ status: 'saving', text: '保存中', tone: 'saving' }),
  conflict: Object.freeze({ status: 'conflict', text: '保存冲突', tone: 'conflict' }),
})

/** 会话状态 → 徽标视图模型（未知状态如实展示原文，不冒充四态之一） */
export function saveBadge(status) {
  return SAVE_BADGE[status] ?? { status: 'unknown', text: String(status ?? ''), tone: 'saving' }
}

/** 笔记标题（路径末段去扩展名）——面板统一头标题位 */
export function noteTitle(path) {
  const seg = String(path ?? '').split('/').filter(Boolean).pop() ?? ''
  return seg.replace(/\.[^.]+$/, '')
}

/**
 * 状态面·错误卡视图模型（candidate-c 8「内联可解释错误」：错误线 + 标题 + 原因 + 指引 + 路径）：
 *   timeout=S2 的 8 秒超时升级形（重试面预置）；load=读取失败（可重试）；notice=通用内联提示。
 */
export function stateErrorModel(kind, detail = {}) {
  const message = String(detail.message ?? '')
  const path = String(detail.path ?? '')
  switch (kind) {
    case 'timeout':
      return {
        title: '笔记加载失败',
        why: '请求超时：8 秒内未收到响应。服务端可能繁忙，或索引尚未就绪。',
        guidance: '重试前可以先看看设置面板里的索引状态；多次超时把下面路径发给管理员。',
        path,
        retryable: true,
      }
    case 'load':
      return {
        title: '笔记加载失败',
        why: message || '请求未能完成。',
        guidance: '可以重试一次；若持续失败，把下面路径发给管理员。',
        path,
        retryable: true,
      }
    default:
      return { title: '提示', why: message, guidance: '', path, retryable: false }
  }
}

/** 状态面·空状态构图（candidate-c 8：下一步 + 最近打开） */
export const EMPTY_MODEL = Object.freeze({
  title: '从一篇笔记开始',
  body: '左侧目录树选中任意笔记即可阅读。也可以直接搜索标题或正文。',
  browseLabel: '浏览目录',
  searchLabel: '搜索笔记',
  recentTitle: '最近打开',
})

/** 状态面·骨架形（candidate-c 8：标题条 + 段落条 + 代码块形，贴阅读版式；非圆圈 spinner、无渐变闪动） */
export const SKELETON_SHAPE = Object.freeze({
  titleWidthPct: 52,
  lineWidthsPct: Object.freeze([95, 88, 72]),
})

/** 最近打开（空状态构图数据面）：容量 5，按 path 去重（新者在前） */
export const RECENTS_MAX = 5

/** 最近打开归一：非数组/敌意条目丢弃（path 必非空串、at 必有限数），按 path 去重、截容量 */
export function normalizeRecents(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const path = typeof item?.path === 'string' ? item.path.trim() : ''
    const at = Number(item?.at)
    if (!path || !Number.isFinite(at) || seen.has(path)) continue
    seen.add(path)
    out.push({ path, at })
    if (out.length >= RECENTS_MAX) break
  }
  return out
}

/** 记一次打开：同 path 旧条目先剔除（保持恰一条），新者在前 */
export function recordRecent(list, path, at = Date.now()) {
  const key = String(path ?? '').trim()
  if (!key) return normalizeRecents(list)
  const rest = normalizeRecents(list).filter((item) => item.path !== key)
  return [{ path: key, at: Number(at) }, ...rest].slice(0, RECENTS_MAX)
}

/** 最近打开时间文案：今天 HH:MM / 昨天 HH:MM / YYYY-MM-DD（无效入参回空串） */
export function formatRecentTime(at, now = Date.now()) {
  const t = Number(at)
  const base = Number(now)
  if (!Number.isFinite(t) || !Number.isFinite(base)) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  const dayKey = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
  const day = dayKey(d)
  if (day === dayKey(new Date(base))) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const y = new Date(base)
  y.setDate(y.getDate() - 1)
  if (day === dayKey(y)) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return day
}

const RECENTS_KEY = 'ob:recents'

/** 最近打开持久化（storage 注入，同 view-state 纪律：坏 JSON 容错回空） */
export function loadRecents(storage) {
  try {
    const raw = storage?.getItem?.(RECENTS_KEY)
    if (!raw) return []
    return normalizeRecents(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveRecents(storage, list) {
  try {
    storage?.setItem?.(RECENTS_KEY, JSON.stringify(normalizeRecents(list)))
  } catch {
    // 持久化失败不阻断阅读（最近打开是体验件非正确性件）
  }
}
