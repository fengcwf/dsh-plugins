// fake-ctx.mjs — 假宿主 ctx 集成夹具（Task 2；全部集成测试复用）
//
// 捕获面按宿主实测形（research-02-official-docs-provider.md §5 / dsh-web lib/index.js:47-101）：
//   ctx.web.registerSearchProvider({id, available, search}) → 返回 disposer；重复 id 抛
//     WEB_DUPLICATE_PROVIDER（宿主 dsh-web:81 同形——幂等注册 K-3 的测试载体）；
//   ctx.web.searchProviders（Map<id, provider>）→ 宿主可检视注册面（与 state.searchProviders 同步，
//     lib/index.js 注册前预检 Map.has 分支的可达面，W2-PRECHECK-UNTESTED）；
//   ctx.web.registerFetchProvider({id, ...})                → 同形（id 必填，fetch 若在场须是函数）；
//   ctx.web.searchProviderId                                → 可读写指针字段（dsh-web:53-58 公开可写，运行时兜底指针载体）；
//   ctx.systemPrompt.section({name, order, text})           → 捕获注册并返回拆除器；getSectionOrder(key) 直通
//     （dsh-tool-web:256-259 形，顺序策略注入 T12 的断言面）；
//   ctx.effect(execute, label)                              → cordis 语义逐字（cordis:1142-1144）：立即执行执行体，
//     返回值为函数则收作拆除器，返回空则无拆除器；
//   ctx.logger.warn(...)                                    → 捕获告警（缺 logger 由被测代码回落 console.warn）。
//
// 断言助手：assertContentBlocks / assertNotContentBlocks（K-1 ContentBlock[] 形状载体）、
// assertSearchProvider / assertSection / assertNoSection（注册面捕获断言）。
// 全夹具离线、不触网、不写盘。
import assert from 'node:assert/strict'

/** 宿主 ContentBlockMap 词汇（dsh-llm types.d.ts:114-126），K-1 校验的合法 type 集。 */
const BLOCK_TYPES = new Set([
  'text',
  'reasoning',
  'image',
  'file',
  'tool-call',
  'tool-addition',
  'tool-removal',
])

const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/** 逐块检查（不抛）：返回 {ok, reason}，供正反两侧行断言复用。 */
export function checkContentBlocks(value) {
  if (!Array.isArray(value)) return { ok: false, reason: `必须是数组，got ${typeName(value)}` }
  for (let i = 0; i < value.length; i += 1) {
    const block = value[i]
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      return { ok: false, reason: `block[${i}] 必须是对象，got ${typeName(block)}` }
    }
    if (!BLOCK_TYPES.has(block.type)) {
      return { ok: false, reason: `block[${i}].type=${JSON.stringify(block.type)} 不在宿主 ContentBlock 词汇（${[...BLOCK_TYPES].join('|')}）` }
    }
    if ((block.type === 'text' || block.type === 'reasoning') && typeof block.text !== 'string') {
      return { ok: false, reason: `block[${i}]（${block.type}）必须带 string text` }
    }
    if (block.type === 'tool-call') {
      for (const field of ['id', 'name', 'arguments']) {
        if (typeof block[field] !== 'string') return { ok: false, reason: `block[${i}]（tool-call）必须带 string ${field}` }
      }
    }
    if ((block.type === 'tool-addition' || block.type === 'tool-removal') && typeof block.toolName !== 'string') {
      return { ok: false, reason: `block[${i}]（${block.type}）必须带 string toolName` }
    }
    if (block.type === 'file' && (block.attachment === null || typeof block.attachment !== 'object')) {
      return { ok: false, reason: `block[${i}]（file）必须带 attachment 对象` }
    }
  }
  return { ok: true, reason: '' }
}

/** K-1 正例：值必须满足宿主 ContentBlock[] 契约，否则断言失败并带首个违规原因。 */
export function assertContentBlocks(value, label = 'value') {
  const result = checkContentBlocks(value)
  assert.ok(result.ok, `${label} 不满足宿主 ContentBlock[] 契约（K-1）：${result.reason}`)
}

/** K-1 反例：裸字符串/裸对象渲染（free-search issue #32 形）必须被契约拒。 */
export function assertNotContentBlocks(value, label = 'value') {
  const result = checkContentBlocks(value)
  assert.equal(result.ok, false, `${label} 本应违反 ContentBlock[] 契约却通过了（助手失去把关力）：${result.reason}`)
}

/** 注册面内部登记（search/fetch 共用）：形状校验 + 重复 id 抛宿主同形错误 + 返回 disposer。 */
function registerProvider(pool, provider, kind, state) {
  if (provider === null || typeof provider !== 'object' || Array.isArray(provider)) {
    throw new TypeError(`${kind} provider 必须是对象，got ${typeName(provider)}`)
  }
  if (typeof provider.id !== 'string' || provider.id.length === 0) {
    throw new TypeError(`${kind} provider.id 必须是非空字符串`)
  }
  if (kind === 'search') {
    if (typeof provider.search !== 'function') throw new TypeError(`search provider 必须带 search(request, signal) 函数`)
    if (provider.available !== undefined && typeof provider.available !== 'function') {
      throw new TypeError(`search provider.available 若在场必须是函数`)
    }
  }
  if (provider.fetch !== undefined && typeof provider.fetch !== 'function') {
    throw new TypeError(`${kind} provider.fetch 若在场必须是函数`)
  }
  if (pool.some((entry) => entry.id === provider.id)) {
    const error = new Error(`WEB_DUPLICATE_PROVIDER: ${provider.id}`)
    error.code = 'WEB_DUPLICATE_PROVIDER'
    throw error
  }
  pool.push(provider)
  // W2-PRECHECK-UNTESTED 关闭：search 注册面同时暴露为 web.searchProviders Map（宿主可检视形），
  // 使 lib/index.js isSearchProviderRegistered 的预检分支（Map.has）在测试面可达。
  if (kind === 'search') state.searchProvidersMap.set(provider.id, provider)
  return () => {
    const index = pool.indexOf(provider)
    if (index >= 0) pool.splice(index, 1)
    if (kind === 'search' && state.searchProvidersMap.get(provider.id) === provider) {
      state.searchProvidersMap.delete(provider.id)
    }
    state.disposals += 1
  }
}

/**
 * T18-B1 防呆：真 cordis 宿主代理取未 inject 属性即抛（cannot get property ... without inject）——
 * 夹具同语义收紧：get 未声明属性即抛（symbol 放行；set 转正为已知键），使「顶层裸取未注入服务」
 * 类缺陷（W65-W1/T18-B1 盲区）在单测层立刻可见，不再静默返 undefined。
 */
function hardenCtx(raw) {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || Reflect.has(target, prop)) return Reflect.get(target, prop, receiver)
      throw new Error(`fake-ctx 防呆：访问未注入属性 ctx.${String(prop)}——真 cordis 将抛 cannot get property "${String(prop)}" without inject`)
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value)
    },
    has(target, prop) {
      return Reflect.has(target, prop)
    },
  })
}

/**
 * 构造假宿主 ctx。
 * @param {{ searchProviderId?: string }} [options] - 初始 web 指针（'' 悬空 / 'deepseek-official' /
 *   他家 id 各分支；T3 让位三态与指针兜底测试的输入面）
 * @returns {{ ctx: object, state: object, runTeardowns: () => number }}
 */
export function createFakeCtx(options = {}) {
  const state = {
    searchProviders: [],
    searchProvidersMap: new Map(),
    fetchProviders: [],
    sections: [],
    effects: [],
    warnings: [],
    logs: [],
    disposals: 0,
    suppressed: false,
  }

  const ctx = {
    logger: {
      warn: (line) => state.warnings.push(String(line)),
      error: (line) => state.warnings.push(String(line)),
      info: (line) => state.logs.push(String(line)),
      debug: (line) => state.logs.push(String(line)),
    },
    web: {
      searchProviderId: options.searchProviderId ?? '',
      // W2-PRECHECK-UNTESTED：宿主可检视注册面（Map 形，与 state.searchProviders 数组同步）——
      // lib/index.js 注册前幂等预检（Map.has 分支）的测试可达面。
      searchProviders: state.searchProvidersMap,
      registerSearchProvider(provider) {
        return registerProvider(state.searchProviders, provider, 'search', state)
      },
      registerFetchProvider(provider) {
        return registerProvider(state.fetchProviders, provider, 'fetch', state)
      },
    },
    systemPrompt: {
      section(spec) {
        if (spec === null || typeof spec !== 'object') throw new TypeError('systemPrompt.section 需要对象入参')
        if (typeof spec.name !== 'string' || spec.name.length === 0) throw new TypeError('section.name 必须是非空字符串')
        const entry = { ...spec }
        state.sections.push(entry)
        return () => {
          const index = state.sections.indexOf(entry)
          if (index >= 0) {
            state.sections.splice(index, 1)
            state.disposals += 1
          }
        }
      },
      getSectionOrder(key) {
        return key
      },
      suppressRuntimeContext() {
        state.suppressed = true
      },
    },
    effect(execute, label) {
      const teardown = typeof execute === 'function' ? execute() : undefined
      state.effects.push({ label, teardown })
      return teardown
    },
  }

  /** 模拟 fiber 卸载：调用全部已登记拆除器并清空（释放面断言用），返回实际调用数。 */
  function runTeardowns() {
    let called = 0
    for (const entry of state.effects.splice(0)) {
      if (typeof entry.teardown === 'function') {
        entry.teardown()
        called += 1
      }
    }
    return called
  }

  return { ctx: hardenCtx(ctx), state, runTeardowns }
}

/** 注册面断言：search provider 已按 id 注册且形状齐（id/available/search），返回该 provider。 */
export function assertSearchProvider(fixture, id) {
  const provider = fixture.state.searchProviders.find((entry) => entry.id === id)
  assert.ok(provider, `search provider "${id}" 未被注册（已注册：${fixture.state.searchProviders.map((p) => p.id).join(', ') || '无'}）`)
  assert.equal(typeof provider.available, 'function', `provider "${id}" 必须带 available()`)
  assert.equal(typeof provider.search, 'function', `provider "${id}" 必须带 search(request, signal)`)
  return provider
}

/** 注册面断言：fetch provider 已按 id 注册，返回该 provider。 */
export function assertFetchProvider(fixture, id) {
  const provider = fixture.state.fetchProviders.find((entry) => entry.id === id)
  assert.ok(provider, `fetch provider "${id}" 未被注册（已注册：${fixture.state.fetchProviders.map((p) => p.id).join(', ') || '无'}）`)
  return provider
}

/** 注册面断言：名为 name 的 systemPrompt section 已注册（可再验 order 槽位），返回该 section。 */
export function assertSection(fixture, name, { order } = {}) {
  const section = fixture.state.sections.find((entry) => entry.name === name)
  assert.ok(section, `systemPrompt section "${name}" 未注册（已注册：${fixture.state.sections.map((s) => s.name).join(', ') || '无'}）`)
  if (order !== undefined) assert.equal(section.order, order, `section "${name}" 的 order 槽位不符`)
  return section
}

/** 注册面反例：名为 name 的 section 未注册（让位/关断分支用）。 */
export function assertNoSection(fixture, name) {
  const section = fixture.state.sections.find((entry) => entry.name === name)
  assert.equal(section, undefined, `systemPrompt section "${name}" 本应未注册却在场`)
}
