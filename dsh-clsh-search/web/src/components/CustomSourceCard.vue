<script setup>
// CustomSourceCard.vue — 自定义源编辑器（Task 22 / US-12 / DESIGN.md §5 V4）。
// R7：新增带填写引导（{query} 占位示例 + 三项选择器说明 + SUPPORTED_SELECTOR_SYNTAX 支持列表）。
// INV-15/K-16：https 强制 + 内网/回环/169.254.169.254 即时拒绝提示（出站门禁保存前复检不可绕过，此处为即时反馈）。
// INV-16/K-17：选择器走 lib/selector.js 子集引擎 fail-closed（超集报错附支持列表，不静默降级）；仅本地解析不进请求。
// R25：自定义源与内置四源混排统一排序（行序号取自 priority）。保存链 emit 数组整替 → settings-api roundtrip（T17b）。
// K-11/K-22：交互控件禁条件渲染（v-show + class 绑定 + 计算反馈）、零自造色、样式全在本组件 <style scoped>。
import { computed, reactive, ref } from 'vue'
import { SUPPORTED_SELECTOR_SYNTAX, validateSelector } from '../../../lib/selector.js'

/** {query} 占位符（R34）：lib/sources/custom.js QUERY_PLACEHOLDER 的 web 面镜像（t28 镜像先例）。
 *  不直接 import custom.js——它链 common.js（net/tls 网络内建面）不可进浏览器 bundle；镜像值由
 *  web/test/custom-source.test.mjs 防漂移钉死（= lib 导出同值）。 */
const QUERY_PLACEHOLDER = '{query}'

const props = defineProps({
  /** 自定义源列表（settings.custom，项形 = Config customSourceItem）。 */
  custom: { type: Array, default: () => [] },
  /** 统一排序序（R25 混排：含内置四源 + 自定义源 id）。 */
  priority: { type: Array, default: () => [] },
})
const emit = defineEmits(['change'])

const expanding = ref(false)
const editingId = ref('')
const form = reactive({ label: '', urlTemplate: '', itemSelector: '', titleSelector: '', linkSelector: '' })
const submitInfo = reactive({ text: '', error: false })

/** URL 模板即时校验（INV-15）：https 强制 + {query} 占位 + 内网/回环/链路本地/云元数据拒绝。 */
function checkUrlTemplate(value) {
  const text = String(value ?? '')
  if (text === '') return { ok: false, text: '必填：URL 模板' }
  if (!text.startsWith('https://')) return { ok: false, text: '✗ 必须 https 起头（INV-15 禁 http 明文）' }
  if (!text.includes(QUERY_PLACEHOLDER)) return { ok: false, text: `✗ 缺 ${QUERY_PLACEHOLDER} 占位（查询词唯一入口，K-4）` }
  let host = ''
  try {
    host = new URL(text).hostname
  } catch {
    return { ok: false, text: '✗ URL 不合法' }
  }
  const internal =
    host === 'localhost' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  if (internal) return { ok: false, text: '✗ 拒绝：内网 / 回环 / 链路本地地址（169.254.169.254 等）' }
  return { ok: true, text: '✓ https 校验通过 · 非内网地址 · {query} 占位在位' }
}

/** 选择器即时校验（INV-16）：子集引擎 fail-closed，超集报错并给支持列表。 */
function checkSelector(value) {
  const text = String(value ?? '')
  if (text === '') return { ok: false, text: '必填：选择器' }
  const result = validateSelector(text)
  return result.ok
    ? { ok: true, text: '✓ 语法受支持（本地解析用）' }
    : { ok: false, text: `✗ ${result.errors[0] ?? '选择器不受支持'}` }
}

const urlCheck = computed(() => checkUrlTemplate(form.urlTemplate))
const itemCheck = computed(() => checkSelector(form.itemSelector))
const titleCheck = computed(() => checkSelector(form.titleSelector))
const linkCheck = computed(() => checkSelector(form.linkSelector))
const formOk = computed(
  () => form.label.trim() !== '' && urlCheck.value.ok && itemCheck.value.ok && titleCheck.value.ok && linkCheck.value.ok,
)
const toggleText = computed(() => (expanding.value ? '收起' : editingId.value ? '编辑中…' : '+ 添加自定义源'))

function orderOf(id) {
  const index = props.priority.indexOf(id)
  return index < 0 ? '—' : String(index + 1)
}

function selectorSummary(item) {
  return `${item.itemSelector} → ${item.titleSelector} / ${item.linkSelector}`
}

function resetForm() {
  form.label = ''
  form.urlTemplate = ''
  form.itemSelector = ''
  form.titleSelector = ''
  form.linkSelector = ''
  editingId.value = ''
}

function onToggle() {
  expanding.value = !expanding.value
  if (!expanding.value) resetForm()
  submitInfo.text = ''
}

function onEdit(item) {
  form.label = item.label ?? ''
  form.urlTemplate = item.urlTemplate ?? ''
  form.itemSelector = item.itemSelector ?? ''
  form.titleSelector = item.titleSelector ?? ''
  form.linkSelector = item.linkSelector ?? ''
  editingId.value = item.id
  expanding.value = true
  submitInfo.text = ''
}

function onDelete(id) {
  emit('change', { custom: props.custom.filter((item) => item.id !== id) })
  submitInfo.text = '已删除该自定义源（保存后生效）'
  submitInfo.error = false
}

function onSubmit() {
  if (!formOk.value) {
    submitInfo.text = '✗ 请先修正表单中的校验错误（保存前仍会复检出站门禁，K-16）'
    submitInfo.error = true
    return
  }
  const item = {
    id: editingId.value || `custom-${Date.now().toString(36)}`,
    label: form.label.trim(),
    urlTemplate: form.urlTemplate.trim(),
    itemSelector: form.itemSelector.trim(),
    titleSelector: form.titleSelector.trim(),
    linkSelector: form.linkSelector.trim(),
  }
  const next = editingId.value
    ? props.custom.map((entry) => (entry.id === editingId.value ? item : entry))
    : [...props.custom, item]
  emit('change', { custom: next })
  submitInfo.text = editingId.value ? '✓ 已更新（保存后生效）' : '✓ 已添加（保存后生效）'
  submitInfo.error = false
  resetForm()
  expanding.value = false
}
</script>

<template>
  <section class="cs-card" aria-label="自定义源">
    <div class="cs-card-head">
      <h2 class="cs-card-title">自定义源</h2>
      <div class="cs-row-control">
        <span class="cs-count">{{ props.custom.length }} 个自定义源</span>
        <button class="cs-btn-ghost" type="button" @click="onToggle">{{ toggleText }}</button>
      </div>
    </div>
    <p class="cs-card-desc">
      与内置四源混排统一排序（序号 = 优先级链位置，R25）；新增/编辑走下方行内表单，逐字段带填写引导（R7）
    </p>
    <div class="cs-rows">
      <div v-for="item in props.custom" :key="item.id" class="cs-row">
        <span class="cs-order">{{ orderOf(item.id) }}</span>
        <div class="cs-row-main">
          <div class="cs-row-label">{{ item.label }} <span class="cc-badge">自定义</span></div>
          <div class="cs-row-desc"><code>{{ item.urlTemplate }}</code> · {{ selectorSummary(item) }}</div>
        </div>
        <div class="cs-row-control">
          <button class="cs-btn-tiny" type="button" @click="onEdit(item)">编辑</button>
          <button class="cs-btn-tiny cc-danger" type="button" @click="onDelete(item.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 行内展开表单（候选 1 定稿形制）：逐字段填写引导 + 即时校验反馈 -->
    <div v-show="expanding" class="cc-form">
      <div class="cc-field">
        <div class="cc-label">名称 <span class="cc-req">必填</span></div>
        <div class="cc-hint">源列表里显示的名字，例如「我的示例源」</div>
        <input v-model="form.label" class="cc-input" type="text" placeholder="我的示例源" />
      </div>
      <div class="cc-field">
        <div class="cc-label">URL 模板 <span class="cc-req">必填</span></div>
        <div class="cc-hint">
          查询词用 <code>{{ '{query}' }}</code> 占位，例如 <code>https://search.example.com/?q={query}</code>；
          必须 https 起头，禁止内网 / 回环 / 169.254.169.254
        </div>
        <input v-model="form.urlTemplate" class="cc-input" type="text" placeholder="https://search.example.com/?q={query}" />
        <div class="cc-feedback" :class="urlCheck.ok ? 'is-ok' : 'is-fail'">{{ urlCheck.text }}</div>
      </div>
      <div class="cc-field">
        <div class="cc-label">结果项选择器 <span class="cc-req">必填</span></div>
        <div class="cc-hint">每条结果的容器元素，例如 <code>.result-item</code>；仅用于本地解析，不进请求（K-17）</div>
        <input v-model="form.itemSelector" class="cc-input" type="text" placeholder=".result-item" />
        <div class="cc-feedback" :class="itemCheck.ok ? 'is-ok' : 'is-fail'">{{ itemCheck.text }}</div>
      </div>
      <div class="cc-field">
        <div class="cc-label">标题选择器 <span class="cc-req">必填</span></div>
        <div class="cc-hint">结果容器内的标题元素，例如 <code>h3 a</code>，取其文本</div>
        <input v-model="form.titleSelector" class="cc-input" type="text" placeholder="h3 a" />
        <div class="cc-feedback" :class="titleCheck.ok ? 'is-ok' : 'is-fail'">{{ titleCheck.text }}</div>
      </div>
      <div class="cc-field">
        <div class="cc-label">链接选择器 <span class="cc-req">必填</span></div>
        <div class="cc-hint">结果容器内的链接元素，例如 <code>h3 a</code>，取其 href（必须 http(s) 绝对地址）</div>
        <input v-model="form.linkSelector" class="cc-input" type="text" placeholder="h3 a" />
        <div class="cc-feedback" :class="linkCheck.ok ? 'is-ok' : 'is-fail'">{{ linkCheck.text }}</div>
      </div>
      <div class="cc-guide">
        选择器支持的子集（超集一律拒绝，fail-closed 不降级）：<code>{{ SUPPORTED_SELECTOR_SYNTAX }}</code>
      </div>
      <div class="cc-foot">
        <div class="cc-feedback" :class="submitInfo.error ? 'is-fail' : 'is-ok'">{{ submitInfo.text }}</div>
        <div class="cs-row-control">
          <button class="cs-btn-tiny" type="button" @click="onToggle">取消</button>
          <button class="cs-btn-primary" type="button" @click="onSubmit">{{ editingId ? '保存修改' : '添加源' }}</button>
        </div>
      </div>
    </div>

    <div class="cs-hint">
      <span>填写引导（R7）：URL 模板必须含 <code>{query}</code> 占位；必须 https 起头，禁止内网 / 回环 / 169.254.169.254；选择器仅用于本地解析，不拼进出网 URL 或请求头。保存前出站门禁复检不可绕过（K-16）。</span>
    </div>
  </section>
</template>

<style scoped>
/* 样式全落组件内（不碰 web/src/styles.css）；零自造色——只引 dsh token（K-11/K-22）。 */
.cc-badge {
  display: inline-block; height: 18px; padding: 0 7px; border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-state-business-tertiary); color: var(--dsw-alias-state-business-primary);
  font-size: 11px; line-height: 18px;
}
.cc-danger { color: var(--dsw-alias-state-error-primary); }
.cc-form {
  margin: 4px 0 12px; padding: 14px 14px 10px;
  border: 0.5px solid var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  display: flex; flex-direction: column; gap: 12px;
}
.cc-field { display: flex; flex-direction: column; gap: 2px; }
.cc-label { font-size: 12px; font-weight: 500; line-height: 18px; color: var(--dsw-alias-label-primary); }
.cc-req { color: var(--dsw-alias-state-error-primary); font-size: 11px; font-weight: 400; }
.cc-hint { color: var(--dsw-alias-label-caption); font-size: 11.5px; line-height: 16px; }
.cc-hint code, .cc-guide code { font-family: var(--ds-font-family-code); color: var(--dsw-alias-label-primary); }
.cc-input {
  width: 100%; height: 32px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary); font-family: var(--ds-font-family-code); font-size: 12px;
}
.cc-input:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.cc-feedback { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.cc-feedback.is-ok { color: var(--dsw-alias-state-success-primary); }
.cc-feedback.is-fail { color: var(--dsw-alias-state-error-primary); }
.cc-guide {
  padding: 8px 10px; border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-tertiary);
  font-size: 11.5px; line-height: 16px;
}
.cc-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 10px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
</style>
