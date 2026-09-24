// trigger 单测（T4）：真消息形状（delta-spec §2）+ 真 Config.safeParse 热改语义——禁 mock 自嗨。
// 反例必含：①plugin 注入文本含触发词不再触发（recall-loop，INV-3）②无关用户消息不触发
//           ③词表热改即时生效（per-call 读当前 config，T1 验收语义：改配置后下一次调用生效）。
import test from 'node:test'
import assert from 'node:assert/strict'

const { matchTrigger, DEFAULT_TRIGGER_WORDS, DEFAULT_ENTITY_PATHS } = await import('../lib/trigger.js')

/** 真用户消息形状（delta-spec §2：content 文本部件数组 + source.kind） */
function user(text) {
  return { content: [{ type: 'text', text }], source: { kind: 'user' } }
}

// ── S1：触发源过滤（INV-3 recall-loop 防护） ──

test('① recall-loop 防护：plugin/system/无 source 消息含触发词不触发；同文 user 触发（INV-3）', () => {
  const injectedText = '<kb-context source="wiki/INDEX.md:1-9">wiki obsidian 索引目录 wiki索引 obsidian索引 hot.md INDEX.md [[hot]] @wiki/hot.md</kb-context>'
  const injected = { content: [{ type: 'text', text: injectedText }], source: { kind: 'plugin', plugin: 'kb-context', form: 'recall' } }
  assert.deepEqual(matchTrigger(injected, {}), { matched: false, query: '' }, 'plugin 注入文本全是触发词也不得再触发')
  assert.equal(matchTrigger({ content: [{ type: 'text', text: injectedText }], source: { kind: 'system' } }, {}).matched, false)
  assert.equal(matchTrigger({ content: [{ type: 'text', text: injectedText }] }, {}).matched, false, '缺 source 不触发')
  assert.equal(matchTrigger({ content: [{ type: 'text', text: injectedText }], source: {} }, {}).matched, false, '缺 kind 不触发')
  // 对照：同文本 user 消息触发（差异只在 source.kind）
  assert.equal(matchTrigger(user(injectedText), {}).matched, true)
})

// ── S2：反例② + 边界不误触 ──

test('② 无关用户消息不触发：无词面/实体命中、标识符内嵌词/邮箱不误触', () => {
  for (const text of [
    '今天天气怎么样',
    '帮我写个快速排序函数',
    'kiwiki 内嵌词不触发',
    'xobsidianx 前后贴字母不触发',
    '[[无关页]] 提一下',
    'foo@bar.com 帮我发封邮件',
    'hot 的天气', // 裸 hot 无 .md/@/[[]] 形态 ≠ 实体引用
    'INDEX 是什么',
    'myhot.md 的备份', // 贴字文件名不误触（hot.md 前贴 y）
    'subINDEX.md 要看',
    '',
  ]) {
    assert.deepEqual(matchTrigger(user(text), {}), { matched: false, query: '' }, `不该触发：${JSON.stringify(text)}`)
  }
})

// ── S3：反例③ 词表热改（T1 验收语义锚定） ──

test('③ 词表热改即时生效：改配置后下一次调用生效（per-call 读当前 config，禁启动时冻结捕获）', () => {
  const raw = { triggers: { words: ['zebra'], entityPaths: ['zzz-隔离实体'] } }
  const src = () => raw // 宿主热改姿势：getter 每次给当前 config
  assert.equal(matchTrigger(user('zebra 讨论'), src).matched, true)
  assert.equal(matchTrigger(user('wiki 讨论'), src).matched, false, '自定义表全量替换默认窄表')

  // 热改①：同一 raw 引用就地换词表（宿主 config 热改语义）→ 下一次调用生效
  raw.triggers.words = ['corvid']
  assert.equal(matchTrigger(user('corvid 讨论'), src).matched, true, '改配置后下一次调用生效')
  assert.equal(matchTrigger(user('zebra 讨论'), src).matched, false, '旧词表立即失效')
  assert.equal(matchTrigger(user('wiki 讨论'), src).matched, false)

  // 热改②：entityPaths 热改同语义
  raw.triggers.entityPaths = ['hot.md']
  assert.equal(matchTrigger(user('[[hot]] 更新'), src).matched, true)
  raw.triggers.entityPaths = ['zzz-隔离实体']
  assert.equal(matchTrigger(user('[[hot]] 更新'), src).matched, false, '实体表热改即时生效')

  // 热改③：getter 逐次换新对象也逐次生效（证明无缓存/冻结）
  let cfg = { triggers: { words: ['alpha'], entityPaths: ['zzz-隔离实体'] } }
  const fresh = () => cfg
  assert.equal(matchTrigger(user('alpha 讨论'), fresh).matched, true)
  cfg = { triggers: { words: ['beta'], entityPaths: ['zzz-隔离实体'] } }
  assert.equal(matchTrigger(user('alpha 讨论'), fresh).matched, false)
  assert.equal(matchTrigger(user('beta 讨论'), fresh).matched, true)
})

// ── S4：词面通道 ──

test('词面通道：默认窄表逐词命中（Q1 裁决五词，大小写不敏感）+ query 切出', () => {
  for (const [text, query] of [
    ['wiki 一下', '一下'],
    ['Wiki 文档在哪', '文档在哪'],
    ['OBSIDIAN 相关', '相关'],
    ['看看索引目录', '看看'],
    ['wiki索引 结构', '结构'],
    ['obsidian索引 更新了吗', '更新了吗'],
  ]) {
    const r = matchTrigger(user(text), {})
    assert.deepEqual(r, { matched: true, query, channel: 'words' }, `应词面触发：${text}`)
  }
  // 默认表在「配置缺省」「空表」「空串脏表」三种形态下都生效（空=出厂默认）
  assert.equal(matchTrigger(user('wiki 一下'), undefined).matched, true, 'configSource 缺省 → 全默认')
  assert.equal(matchTrigger(user('wiki 一下'), { triggers: { words: [] } }).matched, true, '空表=出厂默认')
  assert.equal(matchTrigger(user('wiki 一下'), { triggers: { words: [''] } }).matched, true, '空串脏表回退默认')
  assert.deepEqual(DEFAULT_TRIGGER_WORDS, ['wiki', 'obsidian', '索引目录', 'wiki索引', 'obsidian索引'])
})

test('词面通道替换语义：非空表全量替换默认（误触可热调，US-4）', () => {
  const cfg = { triggers: { words: ['zebra'], entityPaths: ['zzz-隔离实体'] } }
  for (const text of ['wiki 讨论', 'obsidian 文档', '看看索引目录', 'wiki索引 结构']) {
    assert.equal(matchTrigger(user(text), cfg).matched, false, `默认词被替换后不该触发：${text}`)
  }
  assert.deepEqual(matchTrigger(user('zebra 讨论'), cfg), { matched: true, query: '讨论', channel: 'words' })
})

// ── S5：实体通道 ──

test('实体通道：文件名/路径前缀/@引用/wikilink 形态命中（默认 INDEX.md/hot.md）', () => {
  // 纯实体通道（文本避开词面默认表字面）→ channel:'entity'
  assert.deepEqual(matchTrigger(user('INDEX.md 的结构'), {}), { matched: true, query: 'INDEX.md 的结构', channel: 'entity' })
  assert.deepEqual(matchTrigger(user('hot.md 更新了'), {}), { matched: true, query: 'hot.md 更新了', channel: 'entity' })
  assert.equal(matchTrigger(user('@hot.md 在哪'), {}).channel, 'entity')
  assert.equal(matchTrigger(user('@hot 的更新'), {}).channel, 'entity', '@ 引用 stem 形态（无 .md）对齐 wikilink 语义')
  assert.equal(matchTrigger(user('@hot.md的更新'), {}).channel, 'entity', '@ 引用贴 CJK 不断词')
  assert.equal(matchTrigger(user('[[hot]] 怎么样'), {}).channel, 'entity')
  assert.equal(matchTrigger(user('[[hot|热图]] 怎么样'), {}).channel, 'entity', 'wikilink 别名形态按目标对齐')
  assert.equal(matchTrigger(user('[[INDEX]] 的呢'), {}).channel, 'entity')
  // 路径形态命中文件名条目（basename 对齐）；词面替换隔离后 channel:'entity'
  const iso = { triggers: { words: ['zzz-隔离词面'] } } // entityPaths 缺省 → 默认表
  assert.deepEqual(matchTrigger(user('看看 wiki/INDEX.md 的结构'), iso), { matched: true, query: '看看 wiki/INDEX.md 的结构', channel: 'entity' })
  assert.equal(matchTrigger(user('@wiki/hot.md 在哪'), iso).channel, 'entity')
  assert.equal(matchTrigger(user('请看 [[wiki/INDEX#目录|索引]]'), iso).channel, 'entity', 'wikilink 目标路径前缀对齐')
  // 自定义实体表（路径前缀条目）：全量替换默认
  const custom = { triggers: { words: ['zzz-隔离词面'], entityPaths: ['01-客户资料'] } }
  assert.equal(matchTrigger(user('01-客户资料 里有吗'), custom).channel, 'entity')
  assert.equal(matchTrigger(user('@01-客户资料/合同.md 在吗'), custom).matched, true, '前缀条目命中引用子路径')
  assert.equal(matchTrigger(user('[[01-客户资料/合同]] 呢'), custom).matched, true)
  assert.deepEqual(DEFAULT_ENTITY_PATHS, ['INDEX.md', 'hot.md'])
})

test('实体通道替换语义：非空表全量替换默认；空表=出厂默认', () => {
  const replaced = { triggers: { words: ['zzz-隔离词面'], entityPaths: ['01-客户资料'] } }
  assert.equal(matchTrigger(user('INDEX.md 的结构'), replaced).matched, false, '默认实体表被替换')
  assert.equal(matchTrigger(user('hot.md 更新'), replaced).matched, false)
  assert.equal(matchTrigger(user('01-客户资料 里有吗'), replaced).matched, true)
  assert.equal(matchTrigger(user('hot.md 更新'), { triggers: { words: ['zzz-隔离词面'], entityPaths: [] } }).matched, true, '空表=出厂默认')
  assert.equal(matchTrigger(user('hot.md 更新'), { triggers: { words: ['zzz-隔离词面'] } }).matched, true, '缺省=出厂默认')
})

// ── S6：输出契约形状（测试锁定） ──

test('输出契约形状：未命中 {matched, query} 精确键；命中 +channel；channel ∈ words|entity', () => {
  const miss = matchTrigger(user('今天天气怎么样'), {})
  assert.deepEqual(Object.keys(miss).sort(), ['matched', 'query'])
  assert.deepEqual(miss, { matched: false, query: '' })
  const hitW = matchTrigger(user('wiki 数据库'), {})
  assert.deepEqual(Object.keys(hitW).sort(), ['channel', 'matched', 'query'])
  assert.equal(hitW.channel, 'words')
  assert.ok(['words', 'entity'].includes(hitW.channel))
  assert.equal(typeof hitW.query, 'string')
  const hitE = matchTrigger(user('INDEX.md 的结构'), {})
  assert.deepEqual(Object.keys(hitE).sort(), ['channel', 'matched', 'query'])
  assert.equal(hitE.channel, 'entity')
})

test('双通道同文命中：channel 判定序 words 优先（契约①→②）；query 同时剥两通道元素', () => {
  assert.deepEqual(
    matchTrigger(user('obsidian 索引里 [[hot|热图]] 更新了吗'), {}),
    { matched: true, query: '索引里 hot 更新了吗', channel: 'words' },
  )
})

// ── S7：query 切法（trigger 剥离——前身五重防护之一） ──

test('query 切法：词面触发词剥离（最长优先不残留）+ 空白折叠归一', () => {
  assert.equal(matchTrigger(user('wiki 数据库调优怎么样'), {}).query, '数据库调优怎么样')
  assert.equal(matchTrigger(user('obsidian索引 结构'), {}).query, '结构', '最长优先：整体切 obsidian索引，不残留 obsidian')
  assert.equal(matchTrigger(user('Wiki 数据库'), {}).query, '数据库')
  assert.equal(matchTrigger(user('wiki   数据库\n调优'), {}).query, '数据库 调优', '空白折叠（去重键稳定）')
  assert.equal(matchTrigger(user('看看索引目录 更新吧'), {}).query, '看看 更新吧')
})

test('query 切法：路径/标识符内触发词不切（防切碎实体名与检索目标）', () => {
  assert.equal(matchTrigger(user('看看 wiki/INDEX.md 的结构'), {}).query, '看看 wiki/INDEX.md 的结构')
  assert.equal(matchTrigger(user('foo-wiki-bar 是标识符'), {}).query, 'foo-wiki-bar 是标识符')
  assert.equal(matchTrigger(user('@wiki/hot.md 在哪'), {}).query, 'wiki/hot.md 在哪', '路径内 wiki 不切、@ 剥除')
})

test('query 切法：@引用/wikilink 剥装饰留目标名（[[a|b]]/[[a#b]] 取目标）', () => {
  assert.equal(matchTrigger(user('[[hot|热图]] 怎么样'), {}).query, 'hot 怎么样')
  assert.equal(matchTrigger(user('@hot.md 在哪'), {}).query, 'hot.md 在哪')
  assert.equal(matchTrigger(user('请看 [[wiki/INDEX#目录|索引]]'), {}).query, '请看 wiki/INDEX')
})

test('query 切空回退首个命中触发元素（去重键/检索输入非空）', () => {
  assert.equal(matchTrigger(user('wiki'), {}).query, 'wiki')
  assert.equal(matchTrigger(user('obsidian索引'), {}).query, 'obsidian索引')
  assert.equal(matchTrigger(user('[[hot]]'), {}).query, 'hot')
  assert.equal(matchTrigger(user('@INDEX.md'), {}).query, 'INDEX.md')
})

// ── S8：配置失败 fail-open + 文本抽取 ──

test('配置 safeParse 失败 fail-open 默认表 + degraded:"config"（INV-15 禁静默）', () => {
  const bad = { timeoutMs: 'oops' }
  assert.deepEqual(matchTrigger(user('wiki 数据库'), bad), { matched: true, query: '数据库', channel: 'words', degraded: 'config' })
  assert.deepEqual(matchTrigger(user('今天天气'), bad), { matched: false, query: '', degraded: 'config' })
  // 合法配置无 degraded 键（形状不带噪声）
  assert.deepEqual(Object.keys(matchTrigger(user('wiki 数据库'), {})).sort(), ['channel', 'matched', 'query'])
})

test('文本抽取：字符串 content/多 text 部件拼接/非 text 部件忽略', () => {
  assert.equal(matchTrigger({ content: 'wiki 数据库', source: { kind: 'user' } }).matched, true, '字符串 content 容忍（configSource 缺省=默认表）')
  const multi = {
    content: [
      { type: 'thinking', text: 'wiki 内心戏不参与判定' },
      { type: 'text', text: '数据库' },
      { type: 'text', text: '调优 wiki' },
    ],
    source: { kind: 'user' },
  }
  assert.deepEqual(matchTrigger(multi, {}), { matched: true, query: '数据库 调优', channel: 'words' })
  assert.equal(matchTrigger({ content: [{ type: 'text', text: '' }], source: { kind: 'user' } }, {}).matched, false)
  assert.equal(matchTrigger({ content: [], source: { kind: 'user' } }, {}).matched, false)
})
