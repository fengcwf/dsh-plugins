// 前端下载纯逻辑单测（T7）：web/src/lib/download.js——URL 构造/Content-Disposition 回读/浏览器落盘缝/
// 下载编排。组件零业务逻辑（T2/T4 纪律）；DOM 缝显式注入（与 view-state 注入 localStorage 同款），
// 测试真验纯函数与编排形，不引 jsdom。
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDownloadUrl, dispositionFilename, saveBlob, runDownload } from '../web/src/lib/download.js'

test('buildDownloadUrl：path 全量 percent-encode（中文/空格/引号零裸传）', () => {
  assert.equal(buildDownloadUrl('notes/a.md'), '/ob/api/download?path=notes%2Fa.md')
  const url = buildDownloadUrl('中文/a b".md')
  assert.ok(url.startsWith('/ob/api/download?path='))
  assert.ok(!url.includes(' ') && !url.includes('"'), 'URL 零裸空格/引号')
  assert.equal(decodeURIComponent(url.split('path=')[1]), '中文/a b".md')
})

test('dispositionFilename：filename*=UTF-8 优先回读；filename= 兜底；缺失回退 fallback', () => {
  assert.equal(dispositionFilename(`attachment; filename="a.md"; filename*=UTF-8''%E4%B8%AD%E6%96%87.md`), '中文.md')
  assert.equal(dispositionFilename(`attachment; filename="plain.md"`), 'plain.md')
  assert.equal(dispositionFilename(`attachment; filename*=UTF-8''%E4%B8%AD.md; filename="x.md"`), '中.md', 'filename* 优先')
  assert.equal(dispositionFilename(''), 'download')
  assert.equal(dispositionFilename(null, 'notes.zip'), 'notes.zip', '自定义回退名')
  assert.equal(dispositionFilename(`attachment; filename*=UTF-8''%ZZ`, 'fallback.md'), 'fallback.md', '坏编码回退 filename=')
})

test('saveBlob：DOM 缝显式注入——创建 objectURL、a[download] 点击、revoke 回收', () => {
  const calls = []
  const env = {
    doc: {
      createElement: (tag) => {
        calls.push(`create:${tag}`)
        return { href: '', download: '', click: () => calls.push('click'), remove: () => calls.push('remove') }
      },
      body: { appendChild: () => calls.push('append') },
    },
    url: {
      createObjectURL: () => {
        calls.push('createObjectURL')
        return 'blob:ob'
      },
      revokeObjectURL: (u) => calls.push(`revoke:${u}`),
    },
  }
  saveBlob({ size: 1 }, 'a.md', env)
  assert.deepEqual(calls, ['createObjectURL', 'create:a', 'append', 'click', 'remove', 'revoke:blob:ob'])
})

test('runDownload 编排：成功→落盘；域拒→onError 提示；请求异常→onError 提示（不落盘）', async () => {
  const saved = []
  const errors = []
  const io = {
    saveBlob: (blob, filename) => saved.push([blob, filename]),
    onError: (m) => errors.push(m),
  }

  const ok = await runDownload('notes/a.md', {
    ...io,
    fetchDownload: async () => ({ ok: true, blob: 'BLOB', filename: 'a.md' }),
  })
  assert.equal(ok.ok, true)
  assert.deepEqual(saved, [['BLOB', 'a.md']], '成功恰落盘一次')

  const rejected = await runDownload('big', {
    ...io,
    fetchDownload: async () => ({ ok: false, reason: 'limit-exceeded', message: '导出超限额：5001 个文件' }),
  })
  assert.equal(rejected.ok, false)
  assert.ok(errors.at(-1).includes('limit-exceeded') && errors.at(-1).includes('导出超限额'), `提示带 reason+message：${errors.at(-1)}`)
  assert.equal(saved.length, 1, '被拒不落盘')

  const thrown = await runDownload('x', {
    ...io,
    fetchDownload: async () => { throw new Error('网络断了') },
  })
  assert.equal(thrown.ok, false)
  assert.ok(errors.at(-1).includes('网络断了'), '请求异常也提示（不静默）')
  assert.equal(saved.length, 1, '异常不落盘')
})
