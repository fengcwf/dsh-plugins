// vault-ops 改名/移动多文件事务测试（T5）：OW-US-5 / OW-INV-4 / OW-INV-12b——
// iamzcr 六坑反例逐条有测 + wikilink 重写四设计 + 修复轮教训（TOCTOU 目标槽位/symlink 源拒/
// 回滚基=锁内 fresh 快照/回滚只逆放自己的写）+ 全树逐字节还原断言。
// 真验零 mock：真 fs 事务（tmp vault 真写盘）、真故障注入（_onStage 测试缝真抛错）、
// 真并发注入（_onStage 里真写盘——检测逻辑全程真验真文件，非 mock）。
// 测试缝（仅一个）：opts._onStage(stage)——事务阶段点回调；stage ∈
//   'after-snapshot' | 'after-dest' | 'before-rewrite:<rel>' | 'after-rewrite:<rel>' | 'before-fsync:<rel>' |
//   'after-rm:<rel>' | 'before-delete' | 'after-delete' | 'rollback-compare:<rel>'；
//   回调内真写盘=并发注入；回调抛错=中途故障注入（抛错点之前全是真操作）。
//   步骤内断面（fix r1）：'before-fsync:<rel>'=写后 fsync 前；'after-rm:<rel>'=③ rm 后目录 fsync 前
//   （回调内把 <源>.lock 换成目录=真实 finally 清锁故障 ERR_FS_EISDIR=「锁释放抛」）；
//   'rollback-compare:<rel>'=回滚『比对后、逆放前』（锁内）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { renameNote, readNote } from '../lib/vault-ops.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-rename', import.meta.url))

/** 建真 tmp vault（files=相对路径→内容；自动建父目录） */
function tmpVault(t, files) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content, 'utf8')
  }
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 全树逐字节指纹（文件集 + 每文件 sha256）——失败事务「全量回滚」断言用 */
function treeDigest(root) {
  const out = {}
  const walk = (abs, rel) => {
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) walk(path.join(abs, d.name), childRel)
      else out[childRel] = createHash('sha256').update(fs.readFileSync(path.join(abs, d.name))).digest('hex')
    }
  }
  walk(root, '')
  return out
}

// 标准场景拓扑（六坑/四设计共用骨架；INDEX.md 登记形 + 多引用面 + 围栏代码块）
const SCENE = {
  'INDEX.md': '# INDEX\n\n- [[notes/a]]\n- [[b]]\n',
  'notes/a.md': '---\ntitle: "[[a|首页]]"\n---\n\n# A\n\nself [[a]] and path [[notes/a]] and md [[notes/a.md]]\n\n```js\nconst keep = "[[a]]";\n```\n',
  'notes/b.md': '# B\n\nback [[a]] and [ref](a.md)\n',
  'notes/c.md': '# C\n\n[[b]] only\n',
  'sub/deep.md': '# Deep\n\n[[notes/a]] here\n',
}

// ── OW-INV-4 验收：断链扫描（wikilink/INDEX 零断链）──────────────────────────
test('OW-INV-4 断链扫描：rename 前后全库 wikilink 目标零悬空（零断链实证）', async (t) => {
  const root = tmpVault(t, SCENE)
  /** 断链扫描：每条 [[target]]（剥 #锚|别名）须能落到现存 .md（路径形直查 + stem 形查 basename） */
  const scanDangling = () => {
    const md = []
    const walk = (abs, rel) => {
      for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${d.name}` : d.name
        if (d.isDirectory()) walk(path.join(abs, d.name), childRel)
        else if (d.isFile() && d.name.endsWith('.md')) md.push(childRel)
      }
    }
    walk(root, '')
    const stems = new Set(md.map((rel) => rel.split('/').pop().replace(/\.md$/, '')))
    const dangling = []
    for (const rel of md) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8')
      let fence = null
      for (const line of text.split('\n')) {
        const fm = /^\s{0,3}(```|~~~)/.exec(line)
        if (fm) {
          if (fence === null) fence = fm[1]
          else if (fence === fm[1]) fence = null
          continue
        }
        if (fence !== null) continue // 围栏内=代码不是链接（与改写面同口径）
        for (const m of line.matchAll(/\[\[([^\[\]]+)\]\]/g)) {
          const target = m[1].split('#')[0].split('|')[0].trim().replace(/\.md$/, '')
          if (target === '') continue
          const hit = md.includes(`${target}.md`) || (!target.includes('/') && stems.has(target))
          if (!hit) dangling.push(`${rel} → [[${m[1]}]]`)
        }
      }
    }
    return dangling.sort()
  }
  assert.deepEqual(scanDangling(), [], '改名前基线必须零断链')
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.equal(result.ok, true)
  assert.deepEqual(scanDangling(), [], '改名后 wikilink/INDEX 零断链（OW-INV-4 验收原文）')
})

// ── 契约形 + 多文件事务正例（坑①）────────────────────────────────────────────
test('rename 契约形：{ok, rolledBack, warnings, changed[]} + 引用面全同步 + 源零残渣', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.deepEqual(
    Object.keys(result).sort(),
    ['changed', 'from', 'moved', 'ok', 'rewritten', 'rolledBack', 'selfChanges', 'skipped', 'to', 'warnings'],
  )
  assert.equal(result.ok, true)
  assert.equal(result.rolledBack, false)
  assert.equal(result.from, 'notes/a.md')
  assert.equal(result.to, 'notes/z.md')
  assert.equal(result.moved, true)
  assert.ok(Array.isArray(result.warnings))
  // 引用面同步（wikilink 路径形/stem 形 + INDEX 登记形）
  assert.equal(readNote(root, 'INDEX.md').content, '# INDEX\n\n- [[notes/z]]\n- [[b]]\n', 'INDEX 登记形同步')
  assert.ok(readNote(root, 'notes/b.md').content.includes('back [[z]]'), 'stem 形同步')
  assert.ok(readNote(root, 'sub/deep.md').content.includes('[[notes/z]] here'), '路径形同步')
  assert.ok(readNote(root, 'notes/c.md').content.includes('[[b]] only'), '无关文件零改动')
  // changed[]=盘上变化路径（含 from 移除、to 落盘、改写文件）
  assert.deepEqual(result.changed, ['INDEX.md', 'notes/a.md', 'notes/b.md', 'notes/z.md', 'sub/deep.md'])
  assert.deepEqual(result.rewritten.map((x) => `${x.path}:${x.changes}`).sort(), ['INDEX.md:1', 'notes/b.md:1', 'sub/deep.md:1'])
  assert.equal(typeof result.selfChanges, 'number')
})

// ── 六坑⑥：不留空源残渣 + 顺序保证零断链窗口 ─────────────────────────────────
test('坑⑥ 先落目标→改写→最后删源：before-delete 时零断链窗口已闭合，事后无空源残渣', async (t) => {
  const root = tmpVault(t, SCENE)
  const observed = {}
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage !== 'before-delete') return
      // 删源之前：新目标已在场、引用已指向新名、源还在（顺序=零断链窗口保证）
      observed.destExists = fs.existsSync(path.join(root, 'notes/z.md'))
      observed.srcStillThere = fs.existsSync(path.join(root, 'notes/a.md'))
      observed.bPointsNew = readNote(root, 'notes/b.md').content.includes('[[z]]')
      observed.bPointsOld = readNote(root, 'notes/b.md').content.includes('[[a]]')
      observed.indexPointsNew = readNote(root, 'INDEX.md').content.includes('[[notes/z]]')
    },
  })
  assert.equal(result.ok, true)
  assert.equal(observed.destExists, true, '删源前新目标已在场')
  assert.equal(observed.srcStillThere, true, '删源在最后一步')
  assert.equal(observed.bPointsNew, true, '删源前引用已指向新名')
  assert.equal(observed.bPointsOld, false)
  assert.equal(observed.indexPointsNew, true)
  assert.equal(fs.existsSync(path.join(root, 'notes/a.md')), false, '源已删（不留残渣）')
  assert.equal(fs.existsSync(path.join(root, 'notes/a.md')) && fs.statSync(path.join(root, 'notes/a.md')).size === 0, false, '无空源残渣')
  const dest = readNote(root, 'notes/z.md')
  assert.ok(dest.content.length > 0, '目标非空')
})

// ── 六坑⑤：frontmatter title 内链接重写 ─────────────────────────────────────
test('坑⑤ frontmatter title 内链接同改写（含 #锚|别名 回填）', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '---\ntitle: "[[a|首页]]"\naliases: ["[[notes/a#top]]"]\n---\n\n# A\n',
  })
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.equal(result.ok, true)
  const content = readNote(root, 'notes/z.md').content
  assert.ok(content.includes('title: "[[z|首页]]"'), `title 内链接必须重写：${JSON.stringify(content)}`)
  assert.ok(content.includes('aliases: ["[[notes/z#top]]"]'), 'frontmatter 其他键内链接同样重写')
})

// ── 六坑④：rename 前查目标存在——缺省拒（静默覆盖反例）──────────────────────
test('坑④ 目标已存在缺省拒（防静默覆盖同名）+ 显式 overwrite 才替换 + 零写盘', async (t) => {
  const root = tmpVault(t, { ...SCENE, 'notes/z.md': '同名既有内容\n' })
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'target-exists')
  assert.equal(result.rolledBack, false)
  assert.deepEqual(treeDigest(root), before, '拒绝必须零写盘（全树逐字节不动）')
  assert.equal(readNote(root, 'notes/z.md').content, '同名既有内容\n', '同名文件零覆盖')
  // 显式 overwrite → 替换
  const forced = await renameNote(root, 'notes/a.md', 'notes/z.md', { overwrite: true })
  assert.equal(forced.ok, true)
  assert.ok(readNote(root, 'notes/z.md').content.includes('# A'), 'overwrite 显式替换为目标内容')
})

// ── TOCTOU 目标槽位（修复轮教训）：目标槽位检查与写入必须同锁内 ─────────────
test('TOCTOU 目标槽位：快照后被并发抢建的目标不被静默覆盖（锁内重检拒绝）', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'after-snapshot') fs.writeFileSync(path.join(root, 'notes/z.md'), '并发者抢建\n', 'utf8')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'target-exists', '锁内重检必须拒（检查与写入同锁）')
  assert.equal(result.rolledBack, false, 'pre-write 失败=未写盘、无逆放发生')
  assert.match(result.message, /未写盘、无逆放发生/)
  assert.equal(readNote(root, 'notes/z.md').content, '并发者抢建\n', '抢建者内容零覆盖')
  const after = treeDigest(root)
  delete after['notes/z.md']
  delete before['notes/z.md']
  assert.deepEqual(after, before, '除抢建文件外全树零改动')
})

test('回滚基=锁内 fresh 快照：overwrite 事务失败时并发者内容不被逆放成「不存在」', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    overwrite: true,
    _onStage: (stage) => {
      if (stage === 'after-snapshot') fs.writeFileSync(path.join(root, 'notes/z.md'), '并发者抢建\n', 'utf8')
      if (stage === 'after-dest') throw new Error('中途故障注入')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.rolledBack, true, '写后失败已整体逆放')
  assert.equal(readNote(root, 'notes/z.md').content, '并发者抢建\n', '逆放回锁内快照=并发者内容（绝不 rm 成「不存在」）')
  assert.ok(readNote(root, 'notes/a.md').content.includes('# A'), '源已还原')
})

// ── 六坑①：journal 快照 + 全树逐字节还原（after-dest 故障注入）───────────────
test('坑① 中途故障注入（after-dest）→ journal 逆放全量回滚：全树逐字节还原', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'after-dest') throw new Error('磁盘故障注入')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'transaction-failed')
  assert.equal(result.rolledBack, true, '写后失败已整体逆放')
  assert.match(result.message, /已整体逆放还原/)
  assert.deepEqual(result.changed, [], '回滚完成=盘上零变化')
  assert.deepEqual(treeDigest(root), before, '全树逐字节还原断言')
})

// ── 六坑②：批量失败即中止回滚（后续文件零触碰）──────────────────────────────
test('坑② 批量改写中途失败即中止：未轮到的文件零触碰，已写的全部逆放', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'after-rewrite:INDEX.md') throw new Error('批量中途故障')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.rolledBack, true)
  assert.deepEqual(treeDigest(root), before, '全树逐字节还原（中止≠半改写）')
  assert.ok(readNote(root, 'sub/deep.md').content.includes('[[notes/a]] here'), '未轮到的改写文件零触碰')
})

// ── 六坑③：锁内 RMW 不吞并发（fresh-read 比对）──────────────────────────────
test('坑③ 锁内 RMW 不吞并发写：快照后被改的文件触发中止，其并发内容原样保留', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'after-dest') fs.writeFileSync(path.join(root, 'notes/b.md'), '并发者的修改\n', 'utf8')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'concurrent-modification')
  assert.match(result.message, /notes\/b\.md/)
  assert.equal(readNote(root, 'notes/b.md').content, '并发者的修改\n', '并发写绝不被吞（不被逆放成我方改写/快照内容）')
  assert.equal(fs.existsSync(path.join(root, 'notes/z.md')), false, '目标副本已回滚')
  assert.ok(readNote(root, 'notes/a.md').content.includes('# A'), '源未动')
})

test('坑③ 变体：锁内并发删除视同并发修改（错误诚实性，不漏裸 ENOENT）', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'before-rewrite:notes/b.md') fs.rmSync(path.join(root, 'notes/b.md'))
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'concurrent-modification')
  assert.match(result.message, /被并发删除/)
  assert.equal(fs.existsSync(path.join(root, 'notes/z.md')), false, '目标副本已回滚')
  assert.ok(readNote(root, 'notes/a.md').content.includes('# A'), '源未动')
})

// ── 回滚只逆放「我们写过且现状仍是我们的写」（修复轮教训）───────────────────
test('回滚只逆放自己的写：写后被并发改的文件跳过逆放+留痕，其余照常还原', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'after-rewrite:notes/b.md') {
        fs.writeFileSync(path.join(root, 'notes/b.md'), '回滚窗口内的并发写\n', 'utf8')
        throw new Error('回滚前故障注入')
      }
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.rolledBack, false, '逆放未完全≠谎报回滚成功')
  assert.match(result.message, /逆放未完全/)
  assert.deepEqual(result.changed, ['notes/b.md'], 'changed=仍与调用前不同的路径（仅并发改写残留项）')
  assert.equal(readNote(root, 'notes/b.md').content, '回滚窗口内的并发写\n', '现状≠我方写入→跳过逆放（保留并发内容）')
  assert.ok(result.warnings.some((w) => w.includes('回滚跳过') && w.includes('notes/b.md')), '跳过必留痕')
  assert.equal(fs.existsSync(path.join(root, 'notes/z.md')), false, '其余逆放照常（目标副本已清）')
  assert.equal(readNote(root, 'INDEX.md').content, SCENE['INDEX.md'], '已写文件（INDEX.md）逆放还原')
})

// ── wikilink 重写四设计 ──────────────────────────────────────────────────────
test('设计① 歧义不动：stem 多命中不改写+留痕，路径形照改', async (t) => {
  const root = tmpVault(t, {
    'notes/page.md': '# P\n',
    'archive/page.md': '# P2\n',
    'notes/idx.md': '- stem [[page]]\n- path [[notes/page]]\n',
  })
  const result = await renameNote(root, 'notes/page.md', 'notes/renamed.md')
  assert.equal(result.ok, true)
  const idx = readNote(root, 'notes/idx.md').content
  assert.ok(idx.includes('- stem [[page]]'), '歧义 stem 形不动')
  assert.ok(idx.includes('- path [[notes/renamed]]'), '路径形照改')
  assert.equal(result.skipped.length, 1)
  assert.deepEqual(result.skipped[0], { file: 'notes/idx.md', line: 1, target: 'page', reason: 'ambiguous-stem' })
  assert.ok(result.warnings.some((w) => w.includes('歧义不动') && w.includes('[[page]]')), '歧义必留痕')
})

test('设计② #锚|别名 捕获组回填：锚/别名/前后空白整段保留', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '# A\n',
    'notes/t.md': '[[notes/a#sec|alias]] [[a#sec]] [[ a ]] [[notes/a.md#x|Y]]\n',
  })
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.equal(result.ok, true)
  assert.equal(
    readNote(root, 'notes/t.md').content,
    '[[notes/z#sec|alias]] [[z#sec]] [[ z ]] [[notes/z.md#x|Y]]\n',
    '捕获组回填：#锚|别名与前后空白逐字保留',
  )
})

test('设计③ 裸名/全路径/.md 后缀风格保持；纯移动同 stem 链接 no-op', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '# A\n',
    'notes/t.md': '[[a]] [[notes/a]] [[notes/a.md]]\n',
    'sub/keep.md': '# K\n',
  })
  const moved = await renameNote(root, 'notes/a.md', 'sub/a.md')
  assert.equal(moved.ok, true)
  assert.equal(readNote(root, 'notes/t.md').content, '[[a]] [[sub/a]] [[sub/a.md]]\n', '裸名纯移动 no-op；路径形/.md 后缀形风格保持')
  const renamed = await renameNote(root, 'sub/a.md', 'sub/z.md')
  assert.equal(renamed.ok, true)
  assert.equal(readNote(root, 'notes/t.md').content, '[[z]] [[sub/z]] [[sub/z.md]]\n', '改名：裸名→裸名、路径→路径、.md 后缀保持')
})

test('设计④ toBase 不制造新歧义：新 stem 被占→降级路径形+留痕', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '# A\n',
    'notes/c.md': '# C\n',
    'other/keep.md': '# K\n',
    'notes/t.md': '[[a]]\n[[notes/a]]\n',
  })
  const result = await renameNote(root, 'notes/a.md', 'other/c.md')
  assert.equal(result.ok, true)
  const t2 = readNote(root, 'notes/t.md').content
  assert.equal(t2, '[[other/c]]\n[[other/c]]\n', 'stem 形降级为路径形（不制造 [[c]] 新歧义）')
  assert.ok(result.warnings.some((w) => w.includes('toBase 新歧义')), '降级必留痕')
})

test('围栏代码块豁免：```/~~~ 内 [[…]] 不改写（代码不是链接）', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '# A\n',
    'notes/t.md': '```\n[[a]]\n```\n~~~\n[[notes/a]]\n~~~\nreal [[a]]\n',
  })
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.equal(result.ok, true)
  assert.equal(result.rewritten[0].changes, 1, '围栏内两处不动，仅真链接一处改写')
  assert.equal(
    readNote(root, 'notes/t.md').content,
    '```\n[[a]]\n```\n~~~\n[[notes/a]]\n~~~\nreal [[z]]\n',
  )
})

test('md 形链接留痕不改写（零断链承诺范围=wikilink/INDEX）', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md')
  assert.equal(result.ok, true)
  assert.ok(readNote(root, 'notes/b.md').content.includes('[ref](a.md)'), 'md 形引用本卡不改写')
  assert.ok(
    result.warnings.some((w) => w.includes('notes/b.md') && w.includes('a.md') && w.includes('md 形')),
    `md 形引用必须留痕：${JSON.stringify(result.warnings)}`,
  )
})

// ── 修复轮教训：symlink 源拒（lstat 门，不解引用）────────────────────────────
test('symlink 源拒 not-a-file（lstat 不解引用）：真实目标与链接原样零改动', async (t) => {
  const root = tmpVault(t, {
    'notes/real.md': '# 真实页\n',
    'notes/t.md': '[[link]]\n',
  })
  fs.symlinkSync(path.join(root, 'notes/real.md'), path.join(root, 'notes/link.md'))
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/link.md', 'notes/z.md')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'not-a-file')
  assert.ok(fs.lstatSync(path.join(root, 'notes/link.md')).isSymbolicLink(), 'symlink 原样')
  assert.equal(readNote(root, 'notes/real.md').content, '# 真实页\n', '解引用目标零改动')
  assert.deepEqual(treeDigest(root), before, '全树零改动')
})

test('目录源拒 not-a-file（目录改名不在零断链承诺范围）', async (t) => {
  const root = tmpVault(t, SCENE)
  const result = await renameNote(root, 'notes', 'notes2')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'not-a-file')
})

// ── journal 预算与域结果形 ───────────────────────────────────────────────────
test('journal-limit：快照总量超上限在动手前拒（未写盘、无逆放发生）', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', { journalMaxBytes: 8 })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'journal-limit')
  assert.equal(result.rolledBack, false)
  assert.match(result.message, /未写盘、无逆放发生/)
  assert.deepEqual(treeDigest(root), before)
})

test('域结果形：same-path / not-found / 父目录缺失 一律 {ok:false, reason}（不抛错）', async (t) => {
  const root = tmpVault(t, SCENE)
  const same = await renameNote(root, 'notes/a.md', 'notes/a.md')
  assert.equal(same.reason, 'same-path')
  const missing = await renameNote(root, 'notes/nope.md', 'notes/z.md')
  assert.equal(missing.reason, 'not-found')
  const noParent = await renameNote(root, 'notes/a.md', 'ghost/z.md')
  assert.equal(noParent.reason, 'not-found')
  assert.match(noParent.message, /父目录/)
})

test('形参/围栏非法 throw bad_request（from/to 缺失、非字符串、../ 绝对 NUL）', async (t) => {
  const root = tmpVault(t, SCENE)
  for (const [from, to] of [['', 'notes/z.md'], ['notes/a.md', ''], [null, 'notes/z.md'], ['notes/a.md', 42],
    ['../out.md', 'notes/z.md'], ['notes/a.md', '/etc/x.md'], ['notes/a.md', 'a\0b.md']]) {
    await assert.rejects(() => renameNote(root, from, to), (err) => err.code === 'bad_request', `${String(from)} → ${String(to)}`)
  }
})

// ── 资产改名（embed/资产 wikilink 同改写）────────────────────────────────────
test('非 md 资产改名：![[img.png]] embed 与 [[assets/img.png]] 路径形同改写', async (t) => {
  const root = tmpVault(t, {
    'assets/img.png': 'PNGBYTES',
    'notes/t.md': '![x]([[img.png]]) and [[assets/img.png]]\n',
  })
  const result = await renameNote(root, 'assets/img.png', 'assets/pic.png')
  assert.equal(result.ok, true)
  assert.equal(readNote(root, 'notes/t.md').content, '![x]([[pic.png]]) and [[assets/pic.png]]\n')
  assert.equal(readNote(root, 'assets/pic.png').content, 'PNGBYTES', '字节原样搬移')
})

// ── fix r1：C1 记账前置（步骤内 I/O 故障三形态）+ I2 回滚「比对+逆放」锁包 + I1 根级 to 留痕 ──

/** 诚实性不变量：rolledBack:true 只许在真·全树逐字节还原时给出（绝不谎报）；返回是否已还原 */
function assertHonestRollback(result, root, before) {
  const restored = JSON.stringify(treeDigest(root)) === JSON.stringify(before)
  assert.equal(result.rolledBack, restored, 'rolledBack 必须与真实还原态一致（绝不谎报）')
  return restored
}

test('C1-a 步骤内 I/O 故障（rm 后 fsync 抛）：源必须复活、目标必须清、绝不 rolledBack:true 谎报', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'after-rm:notes/a.md') throw new Error('rm 后 fsync 故障注入')
    },
  })
  assert.equal(result.ok, false)
  assert.ok(assertHonestRollback(result, root, before), '源文件必须复活、目标必须清（全树逐字节还原）')
  assert.deepEqual(result.changed, [], '还原完成 changed 必为空')
  assert.ok(readNote(root, 'notes/a.md').content.includes('# A'), '源文件复活')
  assert.equal(fs.existsSync(path.join(root, 'notes/z.md')), false, '目标已清')
})

test('C1-b 步骤内 I/O 故障（写后 fsync 抛）：目标必须清、其余全量逆放、绝不 rolledBack:true 谎报', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage === 'before-fsync:notes/z.md') throw new Error('写后 fsync 故障注入')
    },
  })
  assert.equal(result.ok, false)
  assert.ok(assertHonestRollback(result, root, before), '写后 fsync 抛也必须全量还原（目标必须清）')
  assert.deepEqual(result.changed, [], '还原完成 changed 必为空')
  assert.equal(fs.existsSync(path.join(root, 'notes/z.md')), false, '目标必须清（写入落盘但事务失败≠留新名）')
  assert.ok(readNote(root, 'notes/a.md').content.includes('# A'), '源文件原样')
})

test('C1-c 步骤内 I/O 故障（锁释放抛=真实 finally 清锁失败）：源必须复活、锁残渣自清、绝不谎报', async (t) => {
  const root = tmpVault(t, SCENE)
  const before = treeDigest(root)
  const lockPath = path.join(root, 'notes/a.md.lock')
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: (stage) => {
      if (stage !== 'after-rm:notes/a.md') return
      // 真实锁释放故障：锁文件换成目录 → withFileLock finally rm(lockPath) 真抛 ERR_FS_EISDIR
      fs.rmSync(lockPath, { force: true })
      fs.mkdirSync(lockPath)
    },
  })
  assert.equal(result.ok, false)
  assert.ok(assertHonestRollback(result, root, before), '锁释放抛也必须全量还原（源复活、目标清）')
  assert.deepEqual(result.changed, [], '还原完成 changed 必为空')
  assert.ok(readNote(root, 'notes/a.md').content.includes('# A'), '源文件复活')
  assert.equal(fs.existsSync(path.join(root, 'notes/z.md')), false, '目标已清')
  assert.equal(fs.existsSync(lockPath), false, '自家锁残渣必须自清（否则回滚取锁被残渣挡死）')
})

test('I2 回滚「比对+逆放」全程持文件锁：锁探针不得并入，协作写者串行落盘不被吞', async (t) => {
  const root = tmpVault(t, SCENE)
  const idxAbs = path.join(root, 'INDEX.md')
  let probeAcquired = null
  let writerPromise = null
  const result = await renameNote(root, 'notes/a.md', 'notes/z.md', {
    _onStage: async (stage) => {
      if (stage === 'before-delete') throw new Error('触发回滚（I2 观察面在回滚窗口）')
      if (stage !== 'rollback-compare:INDEX.md') return
      // 锁探针（真 withFileLock，断面内 await）：此刻 INDEX.md 的文件锁必须被回滚「比对+逆放」持有
      probeAcquired = await withFileLock(idxAbs, async () => true, { waitMs: 200 }).then(() => true, () => false)
      // 协作写者（saveNote 同款 withFileLock，后台）：必须等回滚放锁后串行落盘，绝不被逆放吞掉
      writerPromise = withFileLock(idxAbs, async () => {
        fs.writeFileSync(idxAbs, '协作写者落盘\n', 'utf8')
      }, { waitMs: 5_000 }).catch(() => {})
    },
  })
  assert.equal(result.ok, false)
  await writerPromise
  assert.equal(await probeAcquired, false, '回滚「比对+逆放」必须持文件锁（探针不得并入）')
  assert.equal(fs.readFileSync(idxAbs, 'utf8'), '协作写者落盘\n', '协作写者串行落盘、绝不被回滚吞掉')
})

test('I1 根级 to 全分支留痕（stem 被占）：stem/路径形改写都留痕，措辞不虚称「降级为路径形」', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '# A\n',
    'notes/c.md': '# C（占 newStem）\n',
    'notes/t.md': 'stem [[a]]\npath [[notes/a]]\n',
  })
  const result = await renameNote(root, 'notes/a.md', 'c.md')
  assert.equal(result.ok, true)
  assert.equal(readNote(root, 'notes/t.md').content, 'stem [[c]]\npath [[c]]\n', '根级 to=歧义 [[c]]（唯一可能形）+留痕')
  const rootNotes = result.warnings.filter((w) => w.includes('根级'))
  assert.equal(rootNotes.length, 2, `根级 to 全分支留痕（stem 形+路径形各一）：${JSON.stringify(result.warnings)}`)
  assert.ok(
    result.warnings.some((w) => w.includes('路径形') && w.includes('[[notes/a]]') && w.includes('[[c]]')),
    '路径形→stem 形（精确路径变歧义）必须留痕',
  )
  assert.ok(
    !result.warnings.some((w) => w.includes('降级为路径形')),
    '根级无路径形可降级，留痕措辞不得虚称「降级为路径形」',
  )
})

test('I1 根级 to（stem 全库唯一）：路径形→stem 形降级留痕 + .md 后缀风格保持', async (t) => {
  const root = tmpVault(t, {
    'notes/a.md': '# A\n',
    'notes/t.md': 'path [[notes/a]]\nmd [[notes/a.md]]\n',
  })
  const result = await renameNote(root, 'notes/a.md', 'c.md')
  assert.equal(result.ok, true)
  assert.equal(readNote(root, 'notes/t.md').content, 'path [[c]]\nmd [[c.md]]\n', '风格保持（.md 后缀形保留）')
  const rootNotes = result.warnings.filter((w) => w.includes('根级'))
  assert.equal(rootNotes.length, 2, `根级 to 全分支留痕（含 path 形降级分支）：${JSON.stringify(result.warnings)}`)
  assert.ok(
    rootNotes.some((w) => w.includes('[[c]]')) && rootNotes.some((w) => w.includes('[[c.md]]')),
    '留痕须指明实际产出形 [[c]]/[[c.md]]',
  )
})
