// dsh-rtk-kit/lib/resolve-bin.js —— rtk 二进制发现（A1 解析单源纯函数）
// 依据：changes/2026-10-03-rtk-bin-discovery/task-brief.md §2-3（2026-10-03 Phase 8 逻辑 bug 修复）。
//
// 问题面（已核实）：官方 install.sh 恰装 $HOME/.local/bin，而 dsh 宿主进程 PATH 常不含该目录——
// 默认 rtkBin:'rtk' 只按 PATH 解析 → 误报「安装」且自动改写静默失效。
//
// 解析契约（A2/A3）：
//   - configured === 'rtk'（默认名）：先按 PATH 逐目录解析，未命中再按官方落点兜底——
//     <homedir>/.local/bin/rtk → /usr/local/bin/rtk → /opt/homebrew/bin/rtk，取第一个
//     存在且可执行者，顺序命中即停；全缺失回裸名 'rtk'（现行为降级：交给执行期失败处理）。
//   - configured !== 'rtk'（显式配置）：语义不变——值原样使用、绝不被兜底覆盖（A3）。
//
// 纯函数约定（A1）：确定性只依赖注入 env（{path, homedir, isExecutable}），缺省才落
// process.env.PATH / os.homedir() / fs 可执行判定；测试一律 mkdtemp 注入，绝不写真 home。
// 执行红线：本模块零 spawnSync / 零 child_process（A8）——只做存在性 + X_OK 发现，不执行任何二进制。
// 单源（A1）：lib/index.js（probeRtk / runRtkRewrite / apply 接线）与 lib/doctor.js（rtk_doctor）
// 共用本模块，禁止任何调用方自带兜底路径字面。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 默认配置名（config.rtkBin 缺省值；只有这个名走 PATH + 兜底发现）。 */
export const RTK_DEFAULT_NAME = 'rtk'

/**
 * 兜底探测顺序（A2）：官方 install.sh 落点（$HOME/.local/bin）优先，再系统常见安装位。
 * 注入缝语义（T1.1 R-04 裁决）：homedir **显式空串 = 无 home 兜底位**（绝不回落 os.homedir() 静默探真机）；
 * 缺省（undefined/非字符串）才取 os.homedir()（=真实环境）；相对 home 不产相对候选（防 CWD 劫持，与 R-01 同口径）。
 * @param {string} [homedir] home 目录（缺省 os.homedir()=真实环境；测试注入 mkdtemp 假 HOME；''=显式无 home）
 * @returns {string[]} 候选路径（顺序即探测顺序，命中即停）
 */
export function fallbackCandidates(homedir) {
  const home = typeof homedir === 'string' ? homedir : os.homedir() // R-04：空串显式当空，不回落真机
  const out = []
  if (path.isAbsolute(home)) out.push(path.join(home, '.local', 'bin', RTK_DEFAULT_NAME))
  out.push('/usr/local/bin/rtk', '/opt/homebrew/bin/rtk')
  return out
}

/** 缺省可执行判定：普通文件（跟随符号链接）且 X_OK 在场——「存在且可执行」（A2）。 */
function defaultIsExecutable(candidate) {
  try {
    if (!fs.statSync(candidate).isFile()) return false
    fs.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 值是否路径形（显式绝对/相对路径 vs 裸命令名）。 */
const looksLikePath = (s) => s.includes('/') || s.includes('\\')

/**
 * 解析 rtk 二进制（发现全流程，单源）。
 * @param {string} configured - config.rtkBin（缺省 'rtk'；其余值显式配置语义不变，A3）
 * @param {{path?: string, homedir?: string, isExecutable?: (p: string) => boolean}} [env] - 注入缝（纯函数确定性）
 *   契约（T1.1 R-04 裁决）：**缺省（undefined/缺键/非字符串）= 真实环境**（process.env.PATH / os.homedir() /
 *   fs X_OK 判定）；**显式空串 = 空**（path:'' = 空 PATH 零探测；homedir:'' = 无 home 兜底位），
 *   绝不静默回落真机。
 * @returns {{bin: string, found: boolean, source: 'config'|'path'|'fallback'|'none'}}
 *   bin    —— 实际使用的二进制（显式值原样；发现命中=绝对路径；全缺失=裸名 'rtk' 现行为降级）
 *   found  —— 本次解析是否确认二进制在场（PATH/兜底扫描命中，或显式路径形在场可执行）；
 *             仅用于「找到 ≠ 安装提示」门槛（A4），绝不改写 bin（A3）
 *   source —— 命中来源（诊断可读性）
 */
export function findRtkBin(configured, env = {}) {
  const name = configured == null ? RTK_DEFAULT_NAME : configured
  const isExecutable = typeof env.isExecutable === 'function' ? env.isExecutable : defaultIsExecutable

  // A3 显式配置：不做任何兜底覆盖；found 只做「在场」判定（路径形才查，裸名交执行期）。
  if (name !== RTK_DEFAULT_NAME) {
    return {
      bin: name,
      found: looksLikePath(String(name)) && isExecutable(name),
      source: 'config',
    }
  }

  // A2 第一顺位：PATH 逐目录解析（命中即停）。
  // T1.1 R-01 裁决（与 execvp 的已知偏差，显式裁决留痕）：
  //   - 空 PATH 项（POSIX 语义 = cwd）**不探**——防 CWD 劫持，故意偏离 execvp；
  //   - 相对 PATH 项**照探**（解析期 cwd 判定 ≈ execvp 执行期 cwd；本调用面解析与 spawn 相邻，时点差可忽略）；
  //   - 全缺失退回裸名后执行期 execvp 仍按 POSIX 处理空项，现行为面不变。
  const pathEnv = typeof env.path === 'string' ? env.path : (process.env.PATH ?? '') // R-04：''=显式空 PATH（零探测）；缺省才取真实环境
  for (const dir of pathEnv.split(path.delimiter)) {
    if (dir === '') continue
    const candidate = path.join(dir, RTK_DEFAULT_NAME)
    if (isExecutable(candidate)) return { bin: candidate, found: true, source: 'path' }
  }

  // A2 兜底顺位：~/.local/bin/rtk → /usr/local/bin/rtk → /opt/homebrew/bin/rtk（命中即停）
  for (const candidate of fallbackCandidates(env.homedir)) {
    if (isExecutable(candidate)) return { bin: candidate, found: true, source: 'fallback' }
  }

  // 全缺失：回裸名（现行为降级——执行期失败按既有口径 available:false + 安装提示）
  return { bin: RTK_DEFAULT_NAME, found: false, source: 'none' }
}

/**
 * 解析 rtk 二进制（值面便捷封装；与 findRtkBin 同一实现，A1 禁止两套逻辑）。
 * @param {string} configured - config.rtkBin
 * @param {object} [env] - 同 findRtkBin
 * @returns {string} 实际使用的二进制
 */
export function resolveRtkBin(configured, env = {}) {
  return findRtkBin(configured, env).bin
}
