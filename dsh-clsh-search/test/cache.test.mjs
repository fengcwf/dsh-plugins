// cache.test.mjs — Task 9 + W4-repair：LRU 查询缓存（K-7 落点 / K-9 TTL 可配）
// 离线：mkdtemp 注入落点（os.tmpdir() 下临时目录），绝不写真实 home/安装位。
// W4-repair 关闭项：W4-CACHE-TRUNCATED-LOST（载荷含原始截断标志）、W4-CACHE-FAIL-OPEN（IO 故障
// best-effort 降级）、W4-RELOAD-LRU-ORDER（重启按 savedAt 升序重建）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createCache, DEFAULT_MAX_ENTRIES } from '../lib/cache.js'

/** 测试落点工厂：mkdtemp 临时目录 + 可注入时钟；用后回收。 */
async function makeCache({ ttlMs = 600000, maxEntries, startAt = 1000000 } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-cache-'))
  let clock = startAt
  const cache = await createCache({
    dir,
    ttlMs,
    ...(maxEntries === undefined ? {} : { maxEntries }),
    now: () => clock,
  })
  return {
    cache,
    dir,
    advance(ms) {
      clock += ms
    },
    async cleanup() {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('TTL 未过期命中、过期失效（K-9 cacheTtlMs 语义）', async () => {
  const h = await makeCache({ ttlMs: 600000 })
  try {
    await h.cache.set('dsh 插件', 'ddg', { sources: [{ url: 'https://a.example', title: 'A', snippet: '' }], truncated: false })
    assert.deepEqual(await h.cache.get('dsh 插件', 'ddg'), {
      sources: [{ url: 'https://a.example', title: 'A', snippet: '' }],
      truncated: false,
    }, 'TTL 内必须命中（载荷含截断标志）')

    h.advance(599999)
    assert.ok(await h.cache.get('dsh 插件', 'ddg'), '未过期边界（差 1ms）仍命中')
    h.advance(2)
    assert.equal(await h.cache.get('dsh 插件', 'ddg'), undefined, 'TTL 过期必须失效')
    assert.equal(h.cache.size(), 0, '过期条目顺手剔除')
  } finally {
    await h.cleanup()
  }
})

test('LRU 淘汰顺序：超容量剔最旧，命中刷新存活序（K-7 容量面）', async () => {
  const h = await makeCache({ ttlMs: 600000, maxEntries: 3 })
  try {
    await h.cache.set('q1', 'ddg', { sources: [{ url: 'https://1.example', title: '', snippet: '' }], truncated: false })
    await h.cache.set('q2', 'ddg', { sources: [{ url: 'https://2.example', title: '', snippet: '' }], truncated: false })
    await h.cache.set('q3', 'ddg', { sources: [{ url: 'https://3.example', title: '', snippet: '' }], truncated: false })
    assert.equal(h.cache.size(), 3)

    // 命中 q1 刷新 LRU 序：q1 成为最新
    assert.ok(await h.cache.get('q1', 'ddg'))
    await h.cache.set('q4', 'ddg', { sources: [{ url: 'https://4.example', title: '', snippet: '' }], truncated: false })

    assert.equal(await h.cache.get('q2', 'ddg'), undefined, '最旧未命中者被淘汰')
    assert.ok(await h.cache.get('q1', 'ddg'), '命中刷新后存活')
    assert.ok(await h.cache.get('q4', 'ddg'))
    assert.equal(h.cache.size(), 3, '容量恒不超 maxEntries')
  } finally {
    await h.cleanup()
  }
})

test('ttlMs 可配（K-9）：0=不缓存；默认容量常量 50（合同口径 LRU 50 条）', async () => {
  const h = await makeCache({ ttlMs: 0 })
  try {
    await h.cache.set('q', 'ddg', { sources: [{ url: 'https://x.example', title: '', snippet: '' }], truncated: false })
    assert.equal(await h.cache.get('q', 'ddg'), undefined, 'ttlMs=0 恒 miss')
    assert.equal(h.cache.size(), 0, 'ttlMs=0 不落盘不驻留')
    assert.equal((await readdir(h.dir)).length, 0)
    assert.equal(DEFAULT_MAX_ENTRIES, 50, 'LRU 默认容量=50（可注入覆盖）')
  } finally {
    await h.cleanup()
  }
})

test('缓存键=查询词+源名：同查询跨源隔离、跨查询隔离（K-9 键面）', async () => {
  const h = await makeCache()
  try {
    await h.cache.set('q', 'ddg', { sources: [{ url: 'https://ddg.example', title: '', snippet: '' }], truncated: false })
    await h.cache.set('q', 'bing', { sources: [{ url: 'https://bing.example', title: '', snippet: '' }], truncated: false })
    await h.cache.set('q2', 'ddg', { sources: [{ url: 'https://other.example', title: '', snippet: '' }], truncated: false })
    assert.equal((await h.cache.get('q', 'ddg')).sources[0].url, 'https://ddg.example')
    assert.equal((await h.cache.get('q', 'bing')).sources[0].url, 'https://bing.example')
    assert.equal((await h.cache.get('q2', 'ddg')).sources[0].url, 'https://other.example')
    assert.equal(h.cache.size(), 3, '三组键互不覆盖')
  } finally {
    await h.cleanup()
  }
})

test('落点纪律（K-7）：文件只出现在注入目录，重启恢复 TTL 内条目', async () => {
  const h = await makeCache()
  try {
    await h.cache.set('q', 'ddg', { sources: [{ url: 'https://a.example', title: '', snippet: '' }], truncated: true })
    await h.cache.set('q', 'bing', { sources: [{ url: 'https://b.example', title: '', snippet: '' }], truncated: false })
    const names = await readdir(h.dir)
    assert.equal(names.length, 2, '每键一文件、全部落在注入目录')
    assert.ok(names.every((n) => n.endsWith('.json')), '文件名 sha256.json 形（路径安全）')
    assert.ok(!names.some((n) => n.includes('/') || n.includes('\\')), '无路径穿越形文件名')

    // 重启恢复：同 dir 重新装载，TTL 内条目仍在且截断标志不丢
    const reloaded = await createCache({ dir: h.dir, ttlMs: 600000, now: () => 1000000 })
    assert.equal(reloaded.size(), 2, '重启扫描恢复索引')
    assert.equal((await reloaded.get('q', 'ddg')).sources[0].url, 'https://a.example')
    assert.equal((await reloaded.get('q', 'ddg')).truncated, true, 'W4-CACHE-TRUNCATED-LOST：截断标志重启后仍在')
  } finally {
    await h.cleanup()
  }
})

test('W4-CACHE-FAIL-OPEN：落点不可建/扫描失败 best-effort 降级，set 不抛、不炸调用方', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-cache-'))
  const fileAsDir = path.join(dir, 'not-a-dir')
  await writeFile(fileAsDir, 'x', 'utf8')
  try {
    // dir 指向普通文件：mkdir/readdir 均失败 → 创建不抛（降级冷启动）
    const cache = await createCache({ dir: fileAsDir, ttlMs: 600000 })
    assert.equal(cache.size(), 0, '降级为空索引')
    // set 落盘必失败 → 吞错降级为不缓存，绝不向上抛
    await cache.set('q', 'ddg', { sources: [{ url: 'https://a.example', title: '', snippet: '' }], truncated: false })
    assert.equal(await cache.get('q', 'ddg'), undefined, '落盘失败=该键不缓存')
    assert.equal(cache.size(), 0, '失败条目不入索引')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('W4-RELOAD-LRU-ORDER：重启按 savedAt 升序重建，满容淘汰序正确', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-cache-'))
  try {
    let clock = 1000
    const writer = await createCache({ dir, ttlMs: 600000, now: () => clock })
    await writer.set('q1', 'ddg', { sources: [{ url: 'https://1.example', title: '', snippet: '' }], truncated: false })
    clock += 1000
    await writer.set('q2', 'ddg', { sources: [{ url: 'https://2.example', title: '', snippet: '' }], truncated: false })
    clock += 1000
    await writer.set('q3', 'ddg', { sources: [{ url: 'https://3.example', title: '', snippet: '' }], truncated: false })

    // 重启：maxEntries=2 → 恢复3条按 savedAt 升序入索引 → 淘汰最旧 q1
    const reloaded = await createCache({ dir, ttlMs: 600000, maxEntries: 2, now: () => clock })
    assert.equal(reloaded.size(), 2, '满容淘汰后余 2 条')
    assert.equal(await reloaded.get('q1', 'ddg'), undefined, 'savedAt 最旧的 q1 被淘汰')
    assert.ok(await reloaded.get('q2', 'ddg'))
    assert.ok(await reloaded.get('q3', 'ddg'))

    // 再写一条：淘汰次旧 q2（升级序语义延续）
    await reloaded.set('q4', 'ddg', { sources: [{ url: 'https://4.example', title: '', snippet: '' }], truncated: false })
    assert.equal(await reloaded.get('q2', 'ddg'), undefined, '次旧 q2 下一顺位淘汰')
    assert.ok(await reloaded.get('q3', 'ddg'))
    assert.ok(await reloaded.get('q4', 'ddg'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('入参校验：dir/ttlMs/maxEntries 非法即拒（不静默回落）', async () => {
  await assert.rejects(() => createCache({ ttlMs: 600000 }), /dir/)
  await assert.rejects(() => createCache({ dir: '', ttlMs: 600000 }), /dir/)
  await assert.rejects(() => createCache({ dir: '/tmp/x', ttlMs: -1 }), /ttlMs/)
  await assert.rejects(() => createCache({ dir: '/tmp/x', ttlMs: 1.5 }), /ttlMs/)
  await assert.rejects(() => createCache({ dir: '/tmp/x', ttlMs: 1, maxEntries: 0 }), /maxEntries/)
})
