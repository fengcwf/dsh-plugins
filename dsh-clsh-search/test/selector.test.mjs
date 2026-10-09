// selector.test.mjs — T7 受限选择器子集引擎单测（INV-16 / K-17）
// 离线：纯本地 HTML 字符串解析，零网络、零求值；超集语法 fail-closed 显式拒绝。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { SUPPORTED_SELECTOR_SYNTAX, parseSelector, queryAll, validateSelector } from '../lib/selector.js'

const HTML = `
<div id="main" class="results">
  <div class="result-item"><h3><a href="https://a.example/1">标题一</a></h3><span class="content-right">摘要一</span></div>
  <div class="result-item featured"><h3><a href='https://b.example/2' data-pos="2">标题二</a></h3><span>摘要二</span></div>
  <div class="result-item"><h3><a href=https://c.example/3>标题三</a></h3></div>
  <ul><li class="x"><a href="https://d.example/4">深层</a></li></ul>
</div>
<p class="outside">外部 <em>强调</em> 文本 &amp; 实体</p>
`

test('tag 选择器：按标签名匹配，输出 tag/attrs/text/inner', () => {
  const items = queryAll(HTML, 'div')
  assert.ok(items.length >= 4, 'div 元素命中')
  const paragraphs = queryAll(HTML, 'p')
  assert.equal(paragraphs.length, 1)
  assert.equal(paragraphs[0].tag, 'p')
  assert.equal(paragraphs[0].text, '外部 强调 文本 & 实体', '文本含子树、实体解码、空白折叠')
})

test('.class 选择器：单类与多类并取', () => {
  assert.equal(queryAll(HTML, '.result-item').length, 3)
  assert.equal(queryAll(HTML, '.result-item.featured').length, 1, '多类 AND 语义')
  assert.equal(queryAll(HTML, '.result-item.missing').length, 0, '合法但无匹配 = 空数组')
})

test('#id 选择器与 [attr] 面', () => {
  assert.equal(queryAll(HTML, '#main').length, 1)
  assert.equal(queryAll(HTML, '#nope').length, 0)
  assert.equal(queryAll(HTML, '[data-pos]').length, 1, '[attr] 存在性匹配')
  assert.equal(queryAll(HTML, '[data-pos="2"]').length, 1, '[attr="value"] 精确匹配')
  assert.equal(queryAll(HTML, "[data-pos='2']").length, 1, '单引号值同义')
  assert.equal(queryAll(HTML, '[data-pos="9"]').length, 0)
  assert.equal(queryAll(HTML, 'a[href]').length, 4, 'tag + [attr] 复合')
})

test('后代与子代组合器语义正确', () => {
  assert.equal(queryAll(HTML, '.result-item a').length, 3, '后代（空格）：跨层级')
  assert.equal(queryAll(HTML, '.result-item > h3').length, 3, '子代（>）：仅直接子')
  assert.equal(queryAll(HTML, '#main > ul').length, 1)
  assert.equal(queryAll(HTML, '#main > a').length, 0, '子代不跨层级')
  assert.equal(queryAll(HTML, 'ul a').length, 1)
  assert.equal(queryAll(HTML, '#main ul li a').length, 1, '多段后代链')
  assert.equal(queryAll(HTML, '#main > ul > li > a').length, 1, '多段子代链')
  assert.equal(queryAll(HTML, '#main > ul li a').length, 1, '混用组合器')
})

test('逗号并列：组间去重、文档序输出', () => {
  const items = queryAll(HTML, '.result-item, .featured, div.result-item')
  assert.equal(items.length, 3, '同一元素多组命中只出现一次')
  const texts = queryAll(HTML, 'p, h3').map((item) => item.text)
  assert.equal(texts.length, 4, 'p 1 个 + h3 3 个')
  assert.equal(texts[0], '标题一', '文档序：h3 先于 p（HTML 中 result 在前）')
})

test('属性值形态：单引号/双引号/裸值均可解析（本地 HTML 容错）', () => {
  const links = queryAll(HTML, 'a')
  assert.equal(links[0].attrs.href, 'https://a.example/1')
  assert.equal(links[1].attrs.href, 'https://b.example/2')
  assert.equal(links[1].attrs['data-pos'], '2')
  assert.equal(links[2].attrs.href, 'https://c.example/3', '裸属性值')
})

test('script/style 内容不解析、不匹配（INV-16 零脚本面）', () => {
  const withScript = `<script>var fake = '<div class="sneak"><a href="https://x">骗</a></div>';</script><div class="real"><a href="https://y">真</a></div>`
  assert.equal(queryAll(withScript, '.sneak').length, 0, 'script 内文本不产元素')
  assert.equal(queryAll(withScript, 'a').length, 1, '只命中真实元素')
  assert.equal(queryAll(withScript, 'a')[0].attrs.href, 'https://y')
})

test('parseSelector 输出链组结构（组合器语义可检）', () => {
  const groups = parseSelector('#main > ul li a')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].length, 4)
  assert.equal(groups[0][0].combinatorToNext, 'child')
  assert.equal(groups[0][1].combinatorToNext, 'descendant')
  assert.equal(groups[0][2].combinatorToNext, 'descendant')
  assert.equal(groups[0][3].combinatorToNext, null)
  assert.equal(groups[0][0].compound.id, 'main')
  assert.deepEqual(parseSelector('a, b').map((chain) => chain.length), [1, 1])
})

test('超集选择器逐形显式拒绝（fail-closed，错误含支持列表）', () => {
  const unsupported = [
    ':nth-child(1)', 'li:nth-child(2)', ':not(.x)', 'a:hover', '::before', 'p::after',
    'div *', '*', 'a + b', 'a ~ b', '[href^="https"]', '[href~="x"]', '[href|="x"]', '[href$=".html"]',
    'a|b', '> div', 'div >', 'div >> span', 'div ,', ', div', 'div,,span', '.5x', '#', '.', '[]',
    '[href=]', '[href="unclosed', 'div[href][class][id][data-x]', '  ',
  ]
  for (const selector of unsupported) {
    if (selector === 'div[href][class][id][data-x]') continue // 多属性复合属子集内，见下方正例
    assert.throws(
      () => parseSelector(selector),
      (error) => error.code === 'SELECTOR_UNSUPPORTED' && error.message.includes(SUPPORTED_SELECTOR_SYNTAX),
      `超集/非法必须显式报错：${JSON.stringify(selector)}`,
    )
    const checked = validateSelector(selector)
    assert.equal(checked.ok, false, `validateSelector 不抛形同拒：${JSON.stringify(selector)}`)
    assert.ok(checked.errors[0].includes(SUPPORTED_SELECTOR_SYNTAX), '错误信息含支持列表（引导面）')
  }
  // 正例对照：多属性复合在子集内
  assert.equal(queryAll(HTML, 'div[href][class][id][data-x]').length, 0, '合法但无匹配，不误抛')
  assert.ok(queryAll(HTML, '#main.results[ id="main" ]').length >= 0, '属性两侧空格属标准 CSS 形，接受')
})

test('fail-closed：超集绝不静默降级为空结果', () => {
  assert.throws(() => queryAll(HTML, 'div:nth-child(1)'), (error) => error.code === 'SELECTOR_UNSUPPORTED', 'queryAll 抛而非返回 []')
  assert.throws(() => queryAll(HTML, ':not(.x)'), /不受支持/)
  assert.throws(() => queryAll(HTML, '::before'), /不受支持/)
  assert.throws(() => queryAll(HTML, 'a + b'), /不受支持/)
  // 空输入同样拒（不猜）
  assert.throws(() => parseSelector(''), (error) => error.code === 'SELECTOR_UNSUPPORTED')
  assert.throws(() => parseSelector(42), (error) => error.code === 'SELECTOR_UNSUPPORTED')
  assert.equal(validateSelector('').ok, false)
  assert.equal(validateSelector(null).ok, false)
  // 合法但空结果是正常返回，不抛
  assert.deepEqual(queryAll(HTML, '.nothing-here'), [])
})

test('零脚本能力：引擎无求值面（INV-16）', async () => {
  const source = await readFile(new URL('../lib/selector.js', import.meta.url), 'utf8')
  for (const pattern of [/eval\s*\(/, /new\s+Function/, /document\./, /window\./, /setTimeout|setInterval/]) {
    assert.equal(pattern.test(source), false, `零脚本能力：${pattern}`)
  }
  // script 标签内容只做原文跳过（不产元素、不可达求值路径）
  assert.equal(queryAll('<script>alert(1)</script>', 'script').length, 0, 'script 元素本身也不进匹配面（原文跳过）')
})

test('零第三方依赖（K-8 / P-4）：selector.js 零 import/require 面', async () => {
  const source = await readFile(new URL('../lib/selector.js', import.meta.url), 'utf8')
  const lines = source.split('\n').filter((line) => /require|import/.test(line))
  assert.deepEqual(lines, [], '本模块自包含：零 import / 零 require（verify 口径）')
})
