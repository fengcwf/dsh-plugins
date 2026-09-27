// diff — 行级 diff（对比三选展示面；LCS，笔记规模 O(n·m) 足够）
// 出口形：[{type:'same'|'del'|'add', text}]（web-edit.test.mjs 锁形）

/** 行拆分：空内容=零行（不是一行空行——web-edit.test.mjs 锁形） */
function toLines(text) {
  const s = String(text ?? '')
  return s === '' ? [] : s.split('\n')
}

/** 行级 LCS diff：before 行删在前、after 行增在后（变更块 del→add 序） */
export function diffLines(before, after) {
  const a = toLines(before)
  const b = toLines(after)
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] })
      i += 1
    } else {
      rows.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    rows.push({ type: 'del', text: a[i] })
    i += 1
  }
  while (j < m) {
    rows.push({ type: 'add', text: b[j] })
    j += 1
  }
  return rows
}
