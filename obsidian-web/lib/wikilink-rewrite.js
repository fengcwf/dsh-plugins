// wikilink-rewrite — wikilink 改写引擎（纯文本、零 IO；T5 rename 事务的文本半边）
// iamzcr wikilink 重写四设计（delta-specs §2 / TECH §2.4）：
//   ① 歧义不动：stem 多命中 → 该链接不改写 + 留痕（skipped: {line, target, reason:'ambiguous-stem'}）
//   ② `#锚|别名` 捕获组回填：target 之外的前导/尾随空白、#锚、|别名整段原样回填
//   ③ 裸名/全路径风格保持：stem 形→stem 形、路径形→路径形、.md 后缀形保留
//   ④ toBase 不制造新歧义：新 stem 被占 → stem 形降级为路径形 + 留痕（notes）
// 六坑⑤：frontmatter 内链接**在扫描面**（不豁免——title 内链接同改写）；围栏代码块（```/~~~）内豁免=代码不是链接。
// md 形链接（[text](target)）本引擎**不改写**（零断链承诺范围=wikilink/INDEX）；
//   scanMdLinkTargets 只做留痕扫描（vault-ops 据此发 warnings），外部链/纯锚点豁免。
// 边界声明：扩展名判定=.md 精确形（大写 .MD 等不在改写面）；URL 编码（%20）md 目标不匹配（留痕亦不发）。
const EXTERNAL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const FENCE_RE = /^\s{0,3}(```|~~~)/

/** 围栏状态机：产出非围栏行 [{text, no, offset}]（fence 开合行自身也不在面） */
function openLines(text) {
  const out = []
  const lines = text.split('\n')
  let fence = null
  let offset = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const m = FENCE_RE.exec(line)
    if (m) {
      if (fence === null) fence = m[1]
      else if (fence === m[1]) fence = null
      offset += line.length + 1
      continue
    }
    if (fence === null) out.push({ text: line, no: i + 1, offset })
    offset += line.length + 1
  }
  return out
}

/** [[…]] 出现列表（inner 文本 + 其在全文中的 span） */
function scanLinks(text) {
  const out = []
  for (const l of openLines(text)) {
    const re = /\[\[([^\[\]]*?)\]\]/g
    let m
    while ((m = re.exec(l.text)) !== null) {
      out.push({
        inner: m[1],
        start: l.offset + m.index + 2,
        end: l.offset + m.index + 2 + m[1].length,
        line: l.no,
      })
    }
  }
  return out
}

/** md 形链接目标留痕扫描（不改写）：外链/纯锚点豁免 */
export function scanMdLinkTargets(text) {
  const out = []
  for (const l of openLines(text)) {
    const re = /\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g
    let m
    while ((m = re.exec(l.text)) !== null) {
      const raw = m[1].trim()
      const target = raw.split('#')[0].trim()
      if (target === '' || EXTERNAL_RE.test(target)) continue
      out.push({ target: raw, line: l.no })
    }
  }
  return out
}

/** 单个 [[…]] 内文解析：target 之外的前导/尾随空白、`#锚`、`|别名` 整段保留（捕获组回填） */
function parseInner(inner) {
  const aliasIdx = inner.indexOf('|')
  const left = aliasIdx === -1 ? inner : inner.slice(0, aliasIdx)
  const aliasPart = aliasIdx === -1 ? '' : inner.slice(aliasIdx)
  const anchorIdx = left.indexOf('#')
  const anchorPart = anchorIdx === -1 ? '' : left.slice(anchorIdx)
  const rawTarget = anchorIdx === -1 ? left : left.slice(0, anchorIdx)
  const target = rawTarget.trim()
  const lead = rawTarget.slice(0, rawTarget.length - rawTarget.trimStart().length)
  const trail = rawTarget.slice(rawTarget.trimEnd().length)
  return { target, suffix: anchorPart + aliasPart, lead, trail }
}

/** 目标形解析：去 .md → key；无 '/' 且无 .md 锚定=stem 形，否则路径形（vault 根语义） */
function parseTargetShape(target) {
  const hadMd = target.endsWith('.md')
  const key = hadMd ? target.slice(0, -3) : target
  return { hadMd, key, form: key.includes('/') ? 'path' : 'stem' }
}

/**
 * 改写计划（对一份文本）：匹配到旧文件的链接 → 新目标（风格保持/捕获组回填/toBase 歧义降级）；
 * stem 歧义 → 不动+留痕（设计①）。返回 {text, changes, skipped, notes}。
 * @param ctx {{oldKey, oldStem, oldStemUnique, newKey, newStem, newStemUnique}}
 */
export function planRewrite(text, ctx) {
  const edits = []
  const skipped = []
  const notes = []
  for (const link of scanLinks(text)) {
    const { target, suffix, lead, trail } = parseInner(link.inner)
    if (target === '') continue
    const shape = parseTargetShape(target)
    if (shape.key === '') continue
    let match = false
    if (shape.form === 'path') {
      match = shape.key === ctx.oldKey
    } else if (shape.key === ctx.oldStem) {
      if (ctx.oldStemUnique) match = true
      else skipped.push({ line: link.line, target, reason: 'ambiguous-stem' })
    }
    if (!match) continue
    let newTarget
    if (shape.form === 'path' || ctx.newStemUnique) {
      // 设计③风格保持：裸名→裸名、路径→路径（.md 后缀形保留）
      newTarget = shape.form === 'path'
        ? `${ctx.newKey}${shape.hadMd ? '.md' : ''}`
        : `${ctx.newStem}${shape.hadMd ? '.md' : ''}`
    } else {
      // 设计④toBase 不制造新歧义：新 stem 已被占 → 降级路径形 + 留痕
      newTarget = `${ctx.newKey}${shape.hadMd ? '.md' : ''}`
      notes.push(`toBase 新歧义：[[${target}]]（第 ${link.line} 行）降级为路径形 [[${newTarget}]]（${ctx.newStem} 已被占用）`)
    }
    const replacement = lead + newTarget + trail + suffix
    if (replacement === link.inner) continue // 同形改写（纯移动的裸名链接）：no-op 不入编辑面
    edits.push({ start: link.start, end: link.end, text: replacement })
  }
  let out = text
  for (const e of edits.reverse()) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  return { text: out, changes: edits.length, skipped, notes }
}
