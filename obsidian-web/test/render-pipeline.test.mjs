// render-pipeline 契约测试（T4）：unified 管线归位后的复杂语法面 + OW-INV-6 消毒全向量。
// T2 回归网 = test/render.test.mjs（零改动）；本文件补：
//   ② 复杂语法（表格/嵌套列表/脚注——T2 最小解析器炸过的形）
//   ③ OW-INV-6 全向量 + 3 变形负例（&#x3a; hex 实体、&colon;、&#9;/NUL 制表变形）
//   ④ 消毒层（rehype-sanitize 白名单）输出复核：白名单标签 + 白名单属性 + 事件属性零裸出
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../lib/render.js'

// T4 扩展白名单（表格/脚注/任务清单面）：剥白名单标签后输出不得再含任何裸 < 或 >
const OUR_TAGS = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|em|strong|del|hr|br|a|span|table|thead|tbody|tr|th|td|sup|sub|section|input)(?:\s[^<>]*)?\/?>/g
function assertWhitelisted(html, label) {
  const stripped = html.replace(OUR_TAGS, '')
  assert.ok(!stripped.includes('<'), `${label}：剥白名单标签后仍含裸 <：${stripped.slice(0, 200)}`)
  assert.ok(!stripped.includes('>'), `${label}：剥白名单标签后仍含裸 >：${stripped.slice(0, 200)}`)
}

/** OW-INV-6 属性白名单：输出属性名必须落在白名单（事件属性零裸出） */
const ATTRS = /\s([a-zA-Z-][a-zA-Z0-9-]*)=/g
const ATTR_WHITELIST = new Set([
  'id', 'class', 'href', 'data-target', 'data-lang', 'align', 'type', 'checked', 'disabled',
  'data-footnote-ref', 'data-footnote-backref', 'aria-describedby', 'aria-label',
])
function assertAttrsWhitelisted(html, label) {
  for (const [, name] of html.matchAll(ATTRS)) {
    assert.ok(ATTR_WHITELIST.has(name.toLowerCase()), `${label}：输出含白名单外属性 ${name}：${html.slice(0, 200)}`)
  }
}

/** href 出口复核：实体解码+去空白后 scheme 必须 ∈ {http,https,mailto} 或相对/锚点（拦 javascript:/data:/vbscript:） */
function assertHrefsSafe(html, label) {
  for (const [, href] of html.matchAll(/\shref="([^"]*)"/g)) {
    const probe = href
      .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&colon;/gi, ':')
      .replace(/&amp;/g, '&')
      .replace(/[\s\u0000-\u001f\u007f]/g, '')
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)
    if (scheme) {
      assert.ok(
        ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase()),
        `${label}：href 漏出危险 scheme ${scheme[1]}：${href}`,
      )
    }
  }
}

// ── ② 复杂语法（T2 最小解析器炸过的形）───────────────────────────────────────
test('复杂语法：GFM 表格渲染 thead/tbody/th/td', () => {
  const { html } = renderMarkdown('| 列A | 列B |\n| --- | --- |\n| 1 | 2 |')
  assert.ok(html.includes('<table>'), html)
  assert.match(html, /<th[^>]*>列A<\/th>/)
  assert.match(html, /<td[^>]*>1<\/td>/)
  assertWhitelisted(html, '表格')
})

test('复杂语法：嵌套列表三层 + 有序/无序混排', () => {
  const { html } = renderMarkdown('- a\n  - b\n    - c\n      1. d')
  assert.match(html, /<ul>[\s\S]*<li[^>]*>a[\s\S]*<ul>[\s\S]*<li[^>]*>b[\s\S]*<ul>[\s\S]*<li[^>]*>c[\s\S]*<ol>[\s\S]*<li[^>]*>d<\/li>/)
  assertWhitelisted(html, '嵌套列表')
})

test('复杂语法：脚注——正文上标引用 + 脚注区条目 + 回链（T2 形不支持，T4 归位）', () => {
  const { html, toc } = renderMarkdown('# 主题\n\n正文[^1]\n\n[^1]: 脚注内容')
  assert.match(html, /<sup[^>]*><a[^>]*href="#fn-1"[^>]*>1<\/a><\/sup>/, `上标引用：${html}`)
  assert.match(html, /<section[^>]*class="footnotes"[^>]*>/, `脚注区：${html}`)
  assert.match(html, /<li[^>]*id="fn-1"[^>]*>/, `脚注条目 id：${html}`)
  assert.match(html, /href="#fnref-1"/, `回链：${html}`)
  assert.deepEqual(toc.map((t) => t.text), ['主题'], '脚注区标题（Footnotes）不得进 toc')
  assertWhitelisted(html, '脚注')
})

test('复杂语法：引用块内列表与标题解析（T2 最小版把块内 markdown 当纯文本）', () => {
  const { html } = renderMarkdown('> - a\n> - b\n>\n> ## 引用内标题')
  assert.match(html, /<blockquote>[\s\S]*<ul>[\s\S]*<li[^>]*>a<\/li>[\s\S]*<li[^>]*>b<\/li>[\s\S]*<\/ul>[\s\S]*<h2[^>]*>引用内标题<\/h2>[\s\S]*<\/blockquote>/)
  assertWhitelisted(html, '引用块')
})

test('复杂语法：任务清单（GFM）——勾选框 disabled 不可交互', () => {
  const { html } = renderMarkdown('- [x] 已完成\n- [ ] 待办')
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled/, `任务清单：${html}`)
  assert.ok(!/\son\w+=/i.test(html), '任务清单输出零事件属性')
  assertWhitelisted(html, '任务清单')
})

// ── ③ OW-INV-6 全向量 + 3 变形负例 ───────────────────────────────────────────
test('OW-INV-6：转义原始 HTML——可见为转义文本（不消隐、不透传）', () => {
  const { html } = renderMarkdown('前 <b>加粗</b> 后')
  assert.ok(html.includes('&lt;b&gt;加粗&lt;/b&gt;'), `原始 HTML 须转义可见：${html}`)
  assert.ok(!html.includes('<b>'), html)
  assertWhitelisted(html, '原始 HTML')
})

test('OW-INV-6：事件属性中和——on*= 的 = 不裸出（含转义文本面）', () => {
  for (const payload of ['<div onclick="alert(1)">x</div>', '<img src=x onerror=alert(1)>']) {
    const { html } = renderMarkdown(payload)
    assert.ok(!/\son\w+\s*=/i.test(html), `payload=${payload} 输出裸出事件属性：${html}`)
    assert.ok(!html.toLowerCase().includes('onclick='), html)
    assert.ok(!html.toLowerCase().includes('onerror='), html)
  }
})

test('OW-INV-6：javascript:/data:/vbscript: href 全向量拦——含 3 变形负例（&#x3a;/&colon;/&#9;+NUL）', () => {
  const vectors = [
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](  javascript:alert(1))',
    '[x](java\tscript:alert(1))',
    '[x](javascript&#58;alert(1))',
    '[x](javascript&#x3a;alert(1))',       // 变形①：hex 实体冒号
    '[x](javascript&colon;alert(1))',      // 变形②：命名实体冒号
    '[x](java&#9;script:alert(1))',        // 变形③a：制表实体插穿
    '[x](java\u0000script:alert(1))',      // 变形③b：NUL 插穿（输入端 strip 后按字面冒号拦）
    '![x](javascript:alert(1))',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](vbscript:msgbox(1))',
    '<javascript:alert(1)>',               // CommonMark autolink 变形
  ]
  for (const payload of vectors) {
    const { html } = renderMarkdown(payload)
    assertHrefsSafe(html, `payload=${JSON.stringify(payload)}`)
    assert.ok(!/href="[^"]*javascript\s*:/i.test(html), `payload=${JSON.stringify(payload)} href 漏出：${html}`)
    assert.ok(!/\son\w+=/i.test(html), `payload=${JSON.stringify(payload)}`)
  }
})

test('OW-INV-6：autolink 变形不出 href 且 URL 字面不激活（不漏字面为 T2 口径）', () => {
  const { html } = renderMarkdown('<javascript:alert(1)>')
  assert.ok(!html.includes('<a'), `autolink 危险 scheme 不得产生链接：${html}`)
  assertHrefsSafe(html, 'autolink')
})

test('OW-INV-6：安全 scheme 放行不变形（http/https/mailto/相对/锚点）', () => {
  const { html } = renderMarkdown('[t](https://example.com/a) [m](mailto:a@b.com) [r](./x.md) [a](#sec)')
  assert.match(html, /href="https:\/\/example\.com\/a"/)
  assert.match(html, /href="mailto:a@b\.com"/)
  assert.match(html, /href="\.\/x\.md"/)
  assert.match(html, /href="#sec"/)
})

// ── ④ 消毒层（白名单过滤）输出复核 ───────────────────────────────────────────
test('消毒层：复杂语法输出属性全在白名单（防管线回归漏出危险属性）', () => {
  const docs = [
    '| a |\n| - |\n| 1 |',
    '正文[^1]\n\n[^1]: 注',
    '[[Note]] 与 ![[Embed]]',
    '[x](https://ok.example)',
    '# 标题\n\n- 项\n\n> 引',
    '- [x] 任务',
  ]
  for (const doc of docs) {
    const { html } = renderMarkdown(doc)
    assertAttrsWhitelisted(html, `doc=${JSON.stringify(doc)}`)
    assertHrefsSafe(html, `doc=${JSON.stringify(doc)}`)
  }
})

test('管线出口形状锁定：{html, toc} 恰两键（unified 归位不破 T2 wire 契约）', () => {
  const r = renderMarkdown('# A\n\n| x |\n| - |\n| 1 |')
  assert.deepEqual(Object.keys(r).sort(), ['html', 'toc'])
  for (const item of r.toc) assert.deepEqual(Object.keys(item).sort(), ['id', 'level', 'text'])
})
