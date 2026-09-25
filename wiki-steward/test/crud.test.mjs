// crud 单测（T12 wiki CRUD 工具面：wikiWrite/wikiRead/wikiDelete/wikiRename）：
// ① 六坑反例矩阵（iamzcr）：静默覆盖 / 断链窗口 / 空源残渣 / 歧义改写 / 批量失败回滚 / 并发吞写
// ② trash 可逆 + 双确认拒（INV-7）③ 多段链围栏负例 ④ stale 锁超时接管留痕
// ⑤ journal 超限拒事务 ⑥ 事务中途故障整体回滚（journal 逆放，OW-INV-4）
// ⑦ wikilink 重写四设计（iamzcr）：歧义不动 / #锚|别名捕获组回填 / 裸名全路径风格保持 / toBase 不制造新歧义。
// 真被测件零 mock：lib/crud.js 直接真调用真文件系统；每测试独立 mkdtemp 临时 vault root（绝不碰真 vault）。
// 故障注入缝仅两个（mark.js opts._write 同款纪律）：_failAt（事务阶段点抛错，之前全是真操作）、
// _beforeApply（快照后、动手前回调——并发反例用它做真实写盘，检测逻辑全程真验真文件）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { wikiRead, wikiWrite, wikiDelete, wikiRename, DEFAULT_JOURNAL_MAX_BYTES } =
  await import('../lib/crud.js')

const mkdtemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ws-crud-'))

/** 临时 vault：root/wiki/ 就位（写面=wiki 域 + .trash，测试 mkdtemp 临时 root）；dirs=预建子目录 */
function mkVault(...dirs) {
  const root = mkdtemp()
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true })
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true })
  return root
}

function put(root, rel, content) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}

/** 全树内容快照（不变量断言：零写盘 / 整体回滚逐字节还原） */
function snapTree(root, prefix = '') {
  const out = new Map()
  const walk = (d, relBase) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = relBase ? `${relBase}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(d, e.name), rel)
      else if (e.isFile()) out.set(rel, fs.readFileSync(path.join(d, e.name), 'utf8'))
    }
  }
  walk(path.join(root, prefix), prefix)
  return out
}

/**
 * 独立断链扫描（测试侧实现，非实现复刻——Obsidian/validate.js 解析语义）：
 * wiki 域全部 .md 逐页解析 [[…]]（围栏代码块豁免），路径形 wiki/<key>.md → <rootKey>.md 回退、
 * stem 形 wiki/ 任意层 <stem>.md ≥1 命中即通。返回断链列表 [{file, line, target}]。
 */
function scanBrokenLinks(root) {
  const broken = []
  const mdFiles = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && e.name.endsWith('.md')) mdFiles.push(p)
    }
  }
  const wikiDir = path.join(root, 'wiki')
  if (fs.existsSync(wikiDir)) walk(wikiDir)
  for (const f of mdFiles) {
    const lines = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n')
    let fence = null
    lines.forEach((line, i) => {
      const fenceM = /^\s{0,3}(```|~~~)/.exec(line)
      if (fenceM) {
        if (fence === null) fence = fenceM[1]
        else if (fence === fenceM[1]) fence = null
        return
      }
      if (fence !== null) return
      const re = /\[\[([^\]\[]+?)\]\]/g
      let m
      while ((m = re.exec(line)) !== null) {
        const inner = m[1]
        const target = inner.split('|')[0].split('#')[0].trim().replace(/\.md$/, '')
        if (target === '') continue
        let ok = false
        if (target.startsWith('wiki/')) {
          ok = fs.existsSync(path.join(root, `${target}.md`)) || fs.existsSync(path.join(root, 'wiki', `${target.slice(5)}.md`))
        } else if (target.includes('/')) {
          ok = fs.existsSync(path.join(root, 'wiki', `${target}.md`)) || fs.existsSync(path.join(root, `${target}.md`))
        } else {
          ok = mdFiles.some((p) => path.basename(p) === `${target}.md`)
        }
        if (!ok) broken.push({ file: path.relative(root, f), line: i + 1, target })
      }
    })
  }
  return broken
}

const treeEquals = (a, b) => {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

// ── ① wikiWrite：默认只读 / 覆盖语义 / 围栏 / 域 ─────────────────────────────

test('wikiWrite 默认只读（INV-7）：readOnly 缺省 → 拒 read-only + 零写盘', async () => {
  const root = mkVault()
  const r = await wikiWrite('wiki/a.md', 'x', { vaultRoot: root })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'read-only')
  assert.equal(fs.existsSync(path.join(root, 'wiki/a.md')), false, '默认只读绝不写盘')
})

test('wikiWrite 显式开启：新建成功 + created 标记 + 覆盖语义（缺省拒，overwrite 显式才换）', async () => {
  const root = mkVault()
  const r = await wikiWrite('wiki/a.md', '第一版', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  assert.equal(r.created, true)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a.md'), 'utf8'), '第一版')
  // 六坑①静默覆盖反例：既有文件缺省拒
  const r2 = await wikiWrite('wiki/a.md', '第二版', { vaultRoot: root, readOnly: false })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'target-exists')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a.md'), 'utf8'), '第一版', '缺省拒=内容逐字节不动')
  // 显式 overwrite 才换
  const r3 = await wikiWrite('wiki/a.md', '第二版', { vaultRoot: root, readOnly: false, overwrite: true })
  assert.equal(r3.ok, true)
  assert.equal(r3.created, false)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a.md'), 'utf8'), '第二版')
})

test('wikiWrite 路径围栏：vaultRoot 缺省拒+留痕（T11 必传裁定）/ ../ 穿越 / 绝对 / 非 wiki 域拒', async () => {
  const root = mkVault()
  // vaultRoot 缺省 = 拒 + 留痕（不裸操作）
  const r0 = await wikiWrite('wiki/a.md', 'x', { readOnly: false })
  assert.equal(r0.ok, false)
  assert.equal(r0.reason, 'vault-root-required')
  assert.ok(r0.warnings.length > 0, '缺省必留痕')
  for (const bad of ['../escape.md', 'wiki/../../x.md', '/etc/x.md', 'C:/x.md', 'a\\b.md', 'wiki//x.md', './x.md']) {
    const r = await wikiWrite(bad, 'x', { vaultRoot: root, readOnly: false })
    assert.equal(r.ok, false, `必须拒：${bad}`)
    assert.equal(r.reason, 'unsafe-form')
  }
  // 非 wiki 域（raw/ 等）拒——写面=wiki 域 + .trash
  for (const off of ['raw/x.md', '01-客户资料/x.md', 'INDEX.md']) {
    const r = await wikiWrite(off, 'x', { vaultRoot: root, readOnly: false })
    assert.equal(r.ok, false, `非 wiki 域必须拒：${off}`)
    assert.equal(r.reason, 'not-wiki')
  }
  assert.equal(fs.existsSync(path.join(root, 'raw')), false)
})

test('wikiWrite 围栏负例（多段中间链写穿拒绝，T12 加固）：a→sub/b + sub→root 外 + 末段缺失', async () => {
  const root = mkVault()
  const outside = mkdtemp()
  fs.symlinkSync(outside, path.join(root, 'wiki', 'sub'))
  fs.symlinkSync(path.join('sub', 'b'), path.join(root, 'wiki', 'a'))
  const r = await wikiWrite('wiki/a/new.md', '越狱', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'fenced', '多段中间链必须拒（修复前 fallback 放行 → 写穿 root 外）')
  assert.equal(r.guard, 'symlink-escape')
  assert.deepEqual(fs.readdirSync(outside), [], 'root 外零写入')
  // delete/rename 同样拒
  const rd = await wikiDelete('wiki/a/new.md', { vaultRoot: root, readOnly: false, confirm: 'wiki/a/new.md' })
  assert.equal(rd.reason, 'fenced')
  const rr = await wikiRename('wiki/a/new.md', 'wiki/ok.md', { vaultRoot: root, readOnly: false })
  assert.equal(rr.reason, 'fenced')
})

test('wikiWrite 父目录缺失 → not-found 拒（不自动建目录）', async () => {
  const root = mkVault()
  const r = await wikiWrite('wiki/no-such-dir/a.md', 'x', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'not-found')
})

// ── wikiRead（函数面；工具名归 kb-context，见报告 Ruling）─────────────────────

test('wikiRead：正常读 + 围栏拒 + not-found；vaultRoot 必传', async () => {
  const root = mkVault()
  put(root, 'wiki/a.md', '内容')
  const r = await wikiRead('wiki/a.md', { vaultRoot: root })
  assert.equal(r.ok, true)
  assert.equal(r.content, '内容')
  const rf = await wikiRead('wiki/../escape.md', { vaultRoot: root })
  assert.equal(rf.reason, 'unsafe-form')
  const rn = await wikiRead('wiki/none.md', { vaultRoot: root })
  assert.equal(rn.reason, 'not-found')
  const rr = await wikiRead('wiki/a.md', {})
  assert.equal(rr.reason, 'vault-root-required')
})

// ── ② wikiDelete：.trash 可逆 + 双确认 + 防覆盖（INV-7 / OW-US-6）────────────

test('wikiDelete 双确认：confirm 缺失/不符 → 拒 + 零副作用（INV-7 双确认拒）', async () => {
  const root = mkVault()
  put(root, 'wiki/a.md', '待删内容')
  const r1 = await wikiDelete('wiki/a.md', { vaultRoot: root, readOnly: false })
  assert.equal(r1.reason, 'confirm-required')
  const r2 = await wikiDelete('wiki/a.md', { vaultRoot: root, readOnly: false, confirm: 'wiki/b.md' })
  assert.equal(r2.reason, 'confirm-mismatch')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a.md'), 'utf8'), '待删内容', '内容不动')
  assert.equal(fs.existsSync(path.join(root, '.trash')), false, '.trash 零触碰')
})

test('wikiDelete 进 .trash/<rel> 可逆：内容逐字节保全 + 原路径消失（INV-7 反例：无 .trash 直接删不存在）', async () => {
  const root = mkVault()
  const content = '---\ntitle: 待删\n---\n正文一字不丢\n'
  put(root, 'wiki/a/x.md', content)
  const r = await wikiDelete('wiki/a/x.md', { vaultRoot: root, readOnly: false, confirm: 'wiki/a/x.md' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'file')
  assert.equal(r.trashPath, '.trash/wiki/a/x.md')
  const trashAbs = path.join(root, '.trash/wiki/a/x.md')
  assert.equal(fs.readFileSync(trashAbs, 'utf8'), content, 'trash 内容逐字节可逆')
  assert.equal(fs.existsSync(path.join(root, 'wiki/a/x.md')), false, '原路径消失')
  // 可逆性实证：从 trash 改回即完整还原
  fs.renameSync(trashAbs, path.join(root, 'wiki/a/x.md'))
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a/x.md'), 'utf8'), content)
})

test('wikiDelete 防覆盖：.trash/<rel> 已在 → 冲突改名（x.1.md）绝不覆盖既有 trash', async () => {
  const root = mkVault()
  put(root, 'wiki/a/x.md', '新垃圾')
  put(root, '.trash/wiki/a/x.md', '旧垃圾（不能被覆盖）')
  const r = await wikiDelete('wiki/a/x.md', { vaultRoot: root, readOnly: false, confirm: 'wiki/a/x.md' })
  assert.equal(r.ok, true)
  assert.equal(r.trashPath, '.trash/wiki/a/x.1.md', '冲突改名防覆盖')
  assert.equal(fs.readFileSync(path.join(root, '.trash/wiki/a/x.md'), 'utf8'), '旧垃圾（不能被覆盖）')
  assert.equal(fs.readFileSync(path.join(root, '.trash/wiki/a/x.1.md'), 'utf8'), '新垃圾')
})

test('wikiDelete 目录：整体进 .trash/<rel>（可逆）；.trash 无法就位 → 拒且绝不直接删', async () => {
  const root = mkVault()
  put(root, 'wiki/proj/overview.md', '概览')
  put(root, 'wiki/proj/tasks.md', '任务')
  const r = await wikiDelete('wiki/proj', { vaultRoot: root, readOnly: false, confirm: 'wiki/proj' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'directory')
  assert.equal(r.trashPath, '.trash/wiki/proj')
  assert.equal(fs.readFileSync(path.join(root, '.trash/wiki/proj/overview.md'), 'utf8'), '概览')
  assert.equal(fs.existsSync(path.join(root, 'wiki/proj')), false)
  // 无 .trash 直接删必须拒：.trash 被文件占位 → mkdir 失败 → 拒 + 源完好
  const root2 = mkVault()
  put(root2, 'wiki/a.md', '还活着')
  put(root2, '.trash', '我不是目录')
  const r2 = await wikiDelete('wiki/a.md', { vaultRoot: root2, readOnly: false, confirm: 'wiki/a.md' })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'io-error')
  assert.equal(fs.readFileSync(path.join(root2, 'wiki/a.md'), 'utf8'), '还活着', '绝不落到直接删')
})

test('wikiDelete 默认只读 + not-found：拒 + 零副作用', async () => {
  const root = mkVault()
  put(root, 'wiki/a.md', 'x')
  const r = await wikiDelete('wiki/a.md', { vaultRoot: root, confirm: 'wiki/a.md' })
  assert.equal(r.reason, 'read-only')
  const r2 = await wikiDelete('wiki/none.md', { vaultRoot: root, readOnly: false, confirm: 'wiki/none.md' })
  assert.equal(r2.reason, 'not-found')
  assert.equal(fs.existsSync(path.join(root, '.trash')), false)
})

// ── ⑦ wikiRename 正常路径：风格保持 / 锚别名回填 / frontmatter / 代码块豁免 ──

test('wikiRename 改名/移动：wikilink 全形态改写（风格保持 + #锚|别名回填 + frontmatter 内链接 + 代码块豁免）', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old-page.md', '---\ntitle: 旧页\n---\n本页自指 [[old-page]]\n')
  const ref = [
    '---',
    'title: [[old-page#标题锚]] 的引用页',
    '---',
    '裸名 [[old-page]] 与裸名带扩展 [[old-page.md]]',
    '路径形 [[a/old-page]] 与路径带扩展 [[a/old-page.md]]',
    'wiki 锚定 [[wiki/a/old-page]] 与 [[wiki/a/old-page.md]]',
    '别名 [[old-page|旧页别名]]、锚别名 [[old-page#小节|显示名]]、路径锚别名 [[a/old-page#s|名]]',
    '```',
    '代码块内 [[old-page]] 不是活链接不改写',
    '```',
    '行内结尾',
    '',
  ].join('\n')
  put(root, 'wiki/ref.md', ref)
  const r = await wikiRename('wiki/a/old-page.md', 'wiki/b/new-page.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  const after = fs.readFileSync(path.join(root, 'wiki/ref.md'), 'utf8')
  assert.ok(after.includes('title: [[new-page#标题锚]] 的引用页'), 'frontmatter title 内链接也要重写（六坑⑤）')
  assert.ok(after.includes('裸名 [[new-page]] 与裸名带扩展 [[new-page.md]]'), '裸名风格保持')
  assert.ok(after.includes('路径形 [[b/new-page]] 与路径带扩展 [[b/new-page.md]]'), '路径风格保持')
  assert.ok(after.includes('wiki 锚定 [[wiki/b/new-page]] 与 [[wiki/b/new-page.md]]'), 'wiki/ 前缀风格保持')
  assert.ok(after.includes('别名 [[new-page|旧页别名]]、锚别名 [[new-page#小节|显示名]]、路径锚别名 [[b/new-page#s|名]]'), '#锚|别名捕获组回填')
  assert.ok(after.includes('代码块内 [[old-page]] 不是活链接不改写'), '围栏代码块豁免')
  // 自指随移动文件走（不留断链）
  const moved = fs.readFileSync(path.join(root, 'wiki/b/new-page.md'), 'utf8')
  assert.ok(moved.includes('本页自指 [[new-page]]'), '移动文件内自指改写')
  // 六坑⑥：不留空源残渣 + 零断链
  assert.equal(fs.existsSync(path.join(root, 'wiki/a/old-page.md')), false, '源删除（无空文件残渣）')
  assert.deepEqual(scanBrokenLinks(root), [], 'OW-INV-4：改写后全库零断链')
})

test('wikiRename 移动（跨目录）：结果形状 rewritten/skipped + 断链扫描 + 零残渣', async () => {
  const root = mkVault('wiki/deep/nest')
  put(root, 'wiki/a/old.md', '内容')
  put(root, 'wiki/ref.md', '指向 [[a/old]]')
  const r = await wikiRename('wiki/a/old.md', 'wiki/deep/nest/old.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  assert.equal(r.moved, true)
  assert.equal(r.from, 'wiki/a/old.md')
  assert.equal(r.to, 'wiki/deep/nest/old.md')
  assert.deepEqual(r.skipped, [])
  assert.equal(r.rewritten.length, 1)
  assert.equal(r.rewritten[0].file, 'wiki/ref.md')
  assert.equal(r.rewritten[0].changes, 1)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/ref.md'), 'utf8'), '指向 [[deep/nest/old]]')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/deep/nest/old.md'), 'utf8'), '内容')
  assert.equal(fs.existsSync(path.join(root, 'wiki/a/old.md')), false)
  assert.deepEqual(scanBrokenLinks(root), [])
})

test('wikiRename INDEX 同步：INDEX.md 登记形同事务改写（路径形 + stem 形）', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old-page.md', '内容')
  put(root, 'wiki/INDEX.md', '# INDEX\n\n- [[a/old-page]]\n- [[old-page]]\n- [[wiki/a/old-page.md]]\n')
  put(root, 'wiki/ref.md', '[[a/old-page]]')
  const r = await wikiRename('wiki/a/old-page.md', 'wiki/b/new-page.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  const idx = fs.readFileSync(path.join(root, 'wiki/INDEX.md'), 'utf8')
  assert.ok(idx.includes('- [[b/new-page]]'), 'INDEX 路径形登记同步')
  assert.ok(idx.includes('- [[new-page]]'), 'INDEX stem 形登记同步（stem 唯一）')
  assert.ok(idx.includes('- [[wiki/b/new-page.md]]'), 'INDEX wiki 锚定形同步')
  assert.ok(!idx.includes('old-page'), 'INDEX 零旧名残留')
  assert.deepEqual(scanBrokenLinks(root), [])
})

// ── ⑦ 歧义设计：歧义不动 + toBase 不制造新歧义 ────────────────────────────────

test('wikiRename 歧义不动（多命中返回不动+留痕）：旧 stem 双命中 → stem 形链接不改写；路径形照常', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', 'A 旧页')
  put(root, 'wiki/c/old.md', 'C 旧页（同 stem）')
  put(root, 'wiki/ref.md', '歧义 [[old]] 与明确 [[a/old]]')
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  const after = fs.readFileSync(path.join(root, 'wiki/ref.md'), 'utf8')
  assert.ok(after.includes('歧义 [[old]]'), '歧义 stem 链接不动')
  assert.ok(after.includes('明确 [[b/new]]'), '路径形照常改写')
  assert.equal(r.skipped.length, 1)
  assert.equal(r.skipped[0].reason, 'ambiguous-stem')
  assert.equal(r.skipped[0].target, 'old')
  assert.ok(r.warnings.some((w) => w.includes('歧义')), '歧义必留痕')
  assert.deepEqual(scanBrokenLinks(root), [], '不动的歧义链接仍解析到同名页（非断链）')
})

test('wikiRename toBase 不制造新歧义：新 stem 已被占 → 裸名链接降级路径形 + 留痕', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '旧页')
  put(root, 'wiki/other/new.md', '同名新页（占了 stem）')
  put(root, 'wiki/ref.md', '裸 [[old]] 路径 [[a/old]]')
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  const after = fs.readFileSync(path.join(root, 'wiki/ref.md'), 'utf8')
  assert.ok(after.includes('裸 [[b/new]]'), '裸名降级为路径形（不制造新歧义）')
  assert.ok(after.includes('路径 [[b/new]]'), '路径形保持')
  assert.ok(!after.includes('[[new]]'), '绝不产出可歧义裸名')
  assert.ok(r.warnings.some((w) => w.includes('新歧义') || w.includes('路径形')), '降级必留痕')
  assert.deepEqual(scanBrokenLinks(root), [])
})

// ── ①④ 防 rename 覆盖（静默覆盖反例）与 overwrite 回滚面 ────────────────────

test('wikiRename 目标存在缺省拒（六坑④ 静默覆盖反例）：目标内容逐字节不动', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/b/new.md', '目标内容（不能被静默覆盖）')
  put(root, 'wiki/ref.md', '[[a/old]]')
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'target-exists')
  assert.ok(treeEquals(snapTree(root), before), '零写盘（含 ref 未动）')
})

test('wikiRename overwrite:true：目标被替换；中途故障 → 目标还原为覆盖前内容（journal 逆放）', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/b/new.md', '覆盖前内容')
  put(root, 'wiki/ref.md', '[[a/old]]')
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, overwrite: true, _failAt: 'before-delete',
  })
  assert.equal(r.ok, false)
  assert.equal(r.rolledBack, true)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/b/new.md'), 'utf8'), '覆盖前内容', '目标还原为覆盖前内容')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a/old.md'), 'utf8'), '源内容')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/ref.md'), 'utf8'), '[[a/old]]')
})

// ── ⑥ 事务中途故障整体回滚（OW-INV-4：journal 逆放 + 断链扫描）────────────────

test('wikiRename 中途故障（after-dest）：整体回滚——目标消失、源完好、引用未动、零断链', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/ref.md', '[[a/old]]')
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, _failAt: 'after-dest',
  })
  assert.equal(r.ok, false)
  assert.equal(r.rolledBack, true, 'journal 逆放整体回滚')
  assert.ok(treeEquals(snapTree(root), before), '全树逐字节还原')
  assert.deepEqual(scanBrokenLinks(root), [])
})

test('wikiRename 中途故障（before-delete）：改写后删源前故障 → 引用/目标全还原、源完好（批量失败即中止回滚）', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/ref1.md', '一 [[a/old]]')
  put(root, 'wiki/ref2.md', '二 [[a/old]]')
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, _failAt: 'before-delete',
  })
  assert.equal(r.ok, false)
  assert.equal(r.rolledBack, true)
  assert.ok(treeEquals(snapTree(root), before), '全树逐字节还原（含两 ref）')
  assert.deepEqual(scanBrokenLinks(root), [])
})

test('wikiRename 中途故障（after-delete）：源已删后故障 → journal 逆放复活源、引用还原、目标消失', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/ref.md', '[[a/old]]')
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, _failAt: 'after-delete',
  })
  assert.equal(r.ok, false)
  assert.equal(r.rolledBack, true)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a/old.md'), 'utf8'), '源内容', '逆放复活源文件')
  assert.ok(treeEquals(snapTree(root), before), '全树逐字节还原')
  assert.deepEqual(scanBrokenLinks(root), [])
})

test('wikiRename 批量失败即中止（after-rewrite:ref1）：ref2 绝不半改、全树还原', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/ref1.md', '一 [[a/old]]')
  put(root, 'wiki/ref2.md', '二 [[a/old]]')
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, _failAt: 'after-rewrite:wiki/ref1.md',
  })
  assert.equal(r.ok, false)
  assert.equal(r.rolledBack, true)
  assert.ok(treeEquals(snapTree(root), before), 'ref2 绝不半改（批量失败即中止回滚）')
})

// ── ③ 锁内 RMW 不吞并发（六坑③）+ stale 锁接管留痕（④）───────────────────────

test('wikiRename 并发不吞写：快照后并发真改 → 冲突中止回滚，但并发内容绝不被回滚吞掉', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源内容')
  put(root, 'wiki/ref1.md', '一 [[a/old]]')
  put(root, 'wiki/ref2.md', '二 [[a/old]]')
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root,
    readOnly: false,
    _beforeApply: () => {
      // 真实并发写（非 mock）：另一个写者改了 ref2（在快照与动手之间）
      fs.writeFileSync(path.join(root, 'wiki/ref2.md'), '并发写者的新内容 [[a/old]]')
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'concurrent-modification')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/ref2.md'), 'utf8'), '并发写者的新内容 [[a/old]]',
    '并发内容绝不被回滚吞掉（锁内 RMW 不吞并发）')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/ref1.md'), 'utf8'), '一 [[a/old]]', '已改写的 ref1 回滚还原')
  assert.equal(fs.existsSync(path.join(root, 'wiki/b/new.md')), false)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/a/old.md'), 'utf8'), '源内容')
  assert.ok(r.warnings.some((w) => w.includes('并发') || w.includes('concurrent')), '冲突必留痕')
})

test('wikiWrite stale 锁超时接管留痕：超龄 lease → 接管完成 + warnings 记接管', async () => {
  const root = mkVault()
  const abs = path.join(root, 'wiki/a.md')
  fs.mkdirSync(`${abs}.lock`)
  fs.writeFileSync(path.join(`${abs}.lock`, 'lease.json'),
    JSON.stringify({ owner: 'dead', at: Date.now() - 600_000 }))
  const r = await wikiWrite('wiki/a.md', '接管后写入', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, true)
  assert.equal(fs.readFileSync(abs, 'utf8'), '接管后写入')
  assert.ok(r.warnings.some((w) => /接管|takeover/i.test(w)), 'stale 接管必留痕')
  assert.equal(fs.existsSync(`${abs}.lock`), false)
})

// ── ⑤ journal 超限拒事务（大文件显式策略：上限 + 超限拒 + 留痕）────────────────

test('wikiRename journal 超限：超出上限 → 拒事务 + 零写盘 + rolledBack:false（未写盘无逆放发生）', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', 'x'.repeat(500))
  put(root, 'wiki/ref.md', '[[a/old]]')
  put(root, 'wiki/big.md', 'y'.repeat(500))
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, journalMaxBytes: 100,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'journal-limit')
  assert.equal(r.rolledBack, false, '未写盘、无逆放发生（T11 rolledBack 口径）')
  assert.ok(r.message.includes('未写盘'), 'message 明示未写盘')
  assert.ok(r.warnings.some((w) => w.includes('journal')), '超限必留痕')
  assert.ok(treeEquals(snapTree(root), before), '零写盘')
})

test('wikiRename journal 预算顺序：大目标文件 stat 先行（不整读入内存）+ 默认上限存在', async () => {
  assert.equal(typeof DEFAULT_JOURNAL_MAX_BYTES, 'number')
  assert.ok(DEFAULT_JOURNAL_MAX_BYTES > 0)
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/huge.md', 'z'.repeat(2048))
  const r = await wikiRename('wiki/a/huge.md', 'wiki/b/huge.md', {
    vaultRoot: root, readOnly: false, journalMaxBytes: 512,
  })
  assert.equal(r.reason, 'journal-limit')
})

// ── dry-run（R19：快照可逆 + 计划可见）───────────────────────────────────────

test('wikiRename dryRun：给出改写计划 + 零写盘（快照可逆的预览面）', async () => {
  const root = mkVault('wiki/b')
  put(root, 'wiki/a/old.md', '源')
  put(root, 'wiki/ref.md', '[[a/old]]')
  put(root, 'wiki/amb.md', '[[old]]')
  put(root, 'wiki/c/old.md', '同 stem')
  const before = snapTree(root)
  const r = await wikiRename('wiki/a/old.md', 'wiki/b/new.md', {
    vaultRoot: root, readOnly: false, dryRun: true,
  })
  assert.equal(r.ok, true)
  assert.equal(r.dryRun, true)
  assert.ok(r.planned.some((p) => p.file === 'wiki/ref.md' && p.changes === 1))
  assert.ok(r.skipped.some((s) => s.file === 'wiki/amb.md' && s.reason === 'ambiguous-stem'))
  assert.ok(treeEquals(snapTree(root), before), 'dryRun 零写盘')
})

test('wikiRename 目标父目录缺失 → not-found 拒（不自动建目录，与 wikiWrite 同口径）', async () => {
  const root = mkVault()
  put(root, 'wiki/a/old.md', '源')
  const r = await wikiRename('wiki/a/old.md', 'wiki/no-such/new.md', { vaultRoot: root, readOnly: false })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'not-found')
  assert.equal(fs.existsSync(path.join(root, 'wiki/a/old.md')), true)
})

// ── 参数防御（类型错 = TypeError 零副作用，fs-safe 同款）─────────────────────

test('crud 参数防御：非字符串路径/内容 → TypeError 且零副作用', async () => {
  const root = mkVault()
  await assert.rejects(wikiWrite('wiki/a.md', 123, { vaultRoot: root, readOnly: false }), TypeError)
  await assert.rejects(wikiWrite(null, 'x', { vaultRoot: root, readOnly: false }), TypeError)
  await assert.rejects(wikiDelete('wiki/a.md', { vaultRoot: root, readOnly: false, confirm: 42 }), TypeError)
  await assert.rejects(wikiRename('wiki/a.md', undefined, { vaultRoot: root, readOnly: false }), TypeError)
  await assert.rejects(wikiRead(123, { vaultRoot: root }), TypeError)
  assert.equal(fs.existsSync(path.join(root, 'wiki')), true)
  assert.deepEqual(fs.readdirSync(path.join(root, 'wiki')), [], '零副作用')
})
