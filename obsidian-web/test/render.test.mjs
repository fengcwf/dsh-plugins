// render 契约测试（T2）：live 渲染唯一源 = lib/render.js 服务端渲染。
// ① OW-INV-6 雏形：输出零未转义原始 HTML、拦 javascript:（<script> 注入负例为必测项）。
// ② TOC 由服务端抽取（heading id slugify+去重——历史坑：id 必须服务端生成）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../lib/render.js'

/** 转义面总不变量：剥掉白名单标签后输出不得再含任何裸 < 或 >（即全部用户文本已被转义） */
const OUR_TAGS = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|em|strong|del|hr|br|a|span)(?:\s[^<>]*)?\/?>/g
function assertNoRawHtml(html, label) {
  const stripped = html.replace(OUR_TAGS, '')
  assert.ok(!stripped.includes('<'), `${label}：剥白名单标签后仍含裸 < → 有未转义原始 HTML：${stripped.slice(0, 200)}`)
  assert.ok(!stripped.includes('>'), `${label}：剥白名单标签后仍含裸 > → 有未转义原始 HTML：${stripped.slice(0, 200)}`)
}

// ── ① 转义/消毒面（XSS 哨兵负例）────────────────────────────────────────────
test('XSS：脚本/事件注入负例全数转义，输出零未转义原始 HTML', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//evil.com/x.js></SCRIPT>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<div onclick="alert(1)">x</div>',
    '<style>body{display:none}</style>',
    '<<script>script>alert(1)<</script>/script>',
    '# <script>alert(1)</script>',
    '## <img src=x onerror=alert(1)>',
    '- <script>x</script>',
    '> <script>x</script>',
    '`<script>x</script>`',
    '```\n<script>alert(1)</script>\n```',
    '<textarea></textarea><script>x</script>',
  ]
  for (const payload of payloads) {
    const { html } = renderMarkdown(payload)
    for (const banned of ['<script', '</script', '<img', '<svg', '<iframe', '<object', '<embed', '<link', '<style', '<form', '<textarea', 'onerror=', 'onload=', 'onclick=', 'onmouseover=']) {
      assert.ok(!html.toLowerCase().includes(banned.toLowerCase()), `payload=${JSON.stringify(payload)} 输出含禁用串 ${banned}：${html.slice(0, 200)}`)
    }
    assertNoRawHtml(html, `payload=${JSON.stringify(payload)}`)
  }
})

test('XSS：链接/图片 URL 消毒——javascript:/data:/vbscript: 一律拦掉（OW-INV-6）', () => {
  const payloads = [
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](  javascript:alert(1))',
    '[x](java\tscript:alert(1))',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](vbscript:msgbox(1))',
    '![x](javascript:alert(1))',
    '[x](javascript&#58;alert(1))',
  ]
  for (const payload of payloads) {
    const { html } = renderMarkdown(payload)
    assert.ok(!/javascript\s*:/i.test(html), `payload=${JSON.stringify(payload)} 输出仍含 javascript:：${html}`)
    assert.ok(!/vbscript\s*:/i.test(html), `payload=${JSON.stringify(payload)} 输出仍含 vbscript:：${html}`)
    assert.ok(!/data\s*:/i.test(html), `payload=${JSON.stringify(payload)} 输出仍含 data:：${html}`)
    assertNoRawHtml(html, `payload=${JSON.stringify(payload)}`)
  }
})

test('链接正例：http/https/mailto/相对/锚点放行，href 原样（转义后）输出', () => {
  assert.match(renderMarkdown('[t](https://example.com/a?b=1&c=2)').html, /<a[^>]*href="https:\/\/example\.com\/a\?b=1&amp;c=2"[^>]*>t<\/a>/)
  assert.match(renderMarkdown('[t](http://example.com)').html, /href="http:\/\/example\.com"/)
  assert.match(renderMarkdown('[t](mailto:a@b.com)').html, /href="mailto:a@b\.com"/)
  assert.match(renderMarkdown('[t](./x.md)').html, /href="\.\/x\.md"/)
  assert.match(renderMarkdown('[t](#sec)').html, /href="#sec"/)
})

test('文本全转义：& < > " \' 均出实体', () => {
  const { html } = renderMarkdown('a & b < c > d " e \' f')
  assert.ok(html.includes('a &amp; b &lt; c &gt; d &quot; e &#39; f'), html)
  assertNoRawHtml(html, '实体测试')
})

// ── ② 渲染核心（最小语法面）─────────────────────────────────────────────────
test('标题：h1-h6 + id slugify（小写/连字符/保 CJK/去标点）', () => {
  const { html } = renderMarkdown('# Hello, World!\n\n## 中文标题\n\n###### tiny')
  assert.match(html, /<h1[^>]*\bid="hello-world"[^>]*>Hello, World!<\/h1>/)
  assert.match(html, /<h2[^>]*\bid="中文标题"[^>]*>中文标题<\/h2>/)
  assert.match(html, /<h6[^>]*\bid="tiny"/)
})

test('标题 id 去重：同名标题 -1/-2 后缀，且 id 永不为空', () => {
  const { toc } = renderMarkdown('## Dup\n\n## Dup\n\n## Dup\n\n## !!!')
  const ids = toc.map((t) => t.id)
  assert.equal(toc.length, 4)
  assert.deepEqual(ids.slice(0, 3), ['dup', 'dup-1', 'dup-2'], ids)
  assert.ok(toc[3].id.length > 0, '纯标点标题 slug 为空时必须兜底非空 id')
})

test('TOC 形状锁定：{id,text,level} 且 text 是展示纯文本（去行内标记）', () => {
  const { toc } = renderMarkdown('# Note A\n\n## **Bold** head\n\n### has `code`')
  assert.equal(toc.length, 3)
  for (const item of toc) assert.deepEqual(Object.keys(item).sort(), ['id', 'level', 'text'], 'TOC 项形状锁定')
  assert.deepEqual(toc.map((t) => [t.level, t.text]), [[1, 'Note A'], [2, 'Bold head'], [3, 'has code']])
})

test('围栏代码块：内容原样转义、lang 进 data-lang、内部不做行内解析', () => {
  const { html } = renderMarkdown('```js\nconst s = "<b>*raw*</b>";\n<script>x</script>\n```')
  assert.match(html, /<pre[^>]*data-lang="js"[^>]*><code[^>]*>/)
  assert.ok(html.includes('const s = &quot;&lt;b&gt;*raw*&lt;/b&gt;&quot;;'), html)
  assert.ok(!html.includes('<em>'), '代码块内 *raw* 不得被行内解析')
  assert.ok(!html.includes('<script'), html)
  assertNoRawHtml(html, '代码块')
})

test('行内代码占位保护：`**x**` 不解析为 strong（历史坑：占位符保护）', () => {
  const { html } = renderMarkdown('`**x**` and **real**')
  assert.ok(html.includes('<code>**x**</code>'), html)
  assert.ok(html.includes('<strong>real</strong>'), html)
})

test('段落软换行→<br>（Obsidian 默认断行语义）', () => {
  const { html } = renderMarkdown('line one\nline two')
  assert.match(html, /line one<br\s*\/?>\s*line two/)
})

test('列表：ul/ol/嵌套一层', () => {
  const ul = renderMarkdown('- a\n- b\n  - nested').html
  assert.match(ul, /<ul>[\s\S]*<li[^>]*>a<\/li>[\s\S]*<li[^>]*>b[\s\S]*<ul>[\s\S]*<li[^>]*>nested<\/li>[\s\S]*<\/ul>/)
  const ol = renderMarkdown('1. one\n2. two').html
  assert.match(ol, /<ol>[\s\S]*<li[^>]*>one<\/li>[\s\S]*<li[^>]*>two<\/li>[\s\S]*<\/ol>/)
})

test('引用块/分隔线/强调：blockquote / hr / strong em del', () => {
  assert.match(renderMarkdown('> quoted').html, /<blockquote>[^<]*quoted[^<]*<\/blockquote>/)
  assert.match(renderMarkdown('a\n\n---\n\nb').html, /<hr\s*\/?>/)
  const em = renderMarkdown('**b** *i* ~~s~~').html
  assert.ok(em.includes('<strong>b</strong>') && em.includes('<em>i</em>') && em.includes('<del>s</del>'), em)
})

test('行内链接文本内保留强调，href 过消毒', () => {
  const { html } = renderMarkdown('[**bold** t](https://ok.example)')
  assert.match(html, /<a[^>]*href="https:\/\/ok\.example"[^>]*><strong>bold<\/strong> t<\/a>/)
})

// ── Obsidian flavor（最小面）─────────────────────────────────────────────────
test('wikilink：[[Note]] / [[Note|Alias]] / [[Note#Head]] → data-target + 展示文本', () => {
  const a = renderMarkdown('[[Note]]').html
  assert.ok(a.includes('class="ob-wikilink"') && a.includes('data-target="Note"') && a.includes('>Note</a>'), a)
  const b = renderMarkdown('[[Note|Alias]]').html
  assert.ok(b.includes('data-target="Note"') && b.includes('>Alias</a>'), b)
  const c = renderMarkdown('[[Note#Head]]').html
  assert.ok(c.includes('data-target="Note#Head"') && c.includes('>Note#Head</a>'), c)
})

test('嵌入 ![[Note]] → 链接卡形态（不渲染画布，TECH.md §3.7 Excalidraw 同语义）', () => {
  const { html } = renderMarkdown('![[Note]]')
  assert.ok(html.includes('class="ob-embed"') && html.includes('data-target="Note"'), html)
  assertNoRawHtml(html, 'embed')
})

test('YAML frontmatter 不进渲染面', () => {
  const { html, toc } = renderMarkdown('---\ntitle: secret\n---\n\n# H\n\nbody')
  assert.ok(!html.includes('secret'), html)
  assert.ok(!html.includes('title'), html)
  assert.equal(toc.length, 1)
})

test('空输入 → 空结果；返回形恰 {html, toc}', () => {
  const r = renderMarkdown('')
  assert.deepEqual(Object.keys(r).sort(), ['html', 'toc'])
  assert.equal(r.html, '')
  assert.deepEqual(r.toc, [])
})
