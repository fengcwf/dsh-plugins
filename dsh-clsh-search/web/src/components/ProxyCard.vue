<script setup>
// ProxyCard.vue — 代理配置卡（Task 23 / US-13 / DESIGN.md §5 V5）：代理池增删改 + 每源走代理勾选。
// R17：多套代理地址维护；R21：ddg/bing 默认走代理、so360/baidu/自定义源默认直连（默认值唯一源 = Config schema）。
// INV-18/R20/K-19：地址含凭据形态一律拒并明示「本插件不支持代理认证」；地址形如 host:port 或 http://host:port。
// 诚实面：勾选走代理但池为空 = 明示错误不静默回落直连（与 lib/sources/custom.js resolveProxyForItem 同口径）。
// proxyId 逐源选套=backlog（INV-19 键面封闭锁，不自扩键）；当前口径=池首项主力。
// K-11/K-22：交互控件禁条件渲染（v-show + class 绑定 + 计算反馈）、零自造色、样式全在本组件 <style scoped>。
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  /** 代理地址池（settings.proxies，项形 = Config proxyItem {id,label,address}）。 */
  proxies: { type: Array, default: () => [] },
  /** 每源走代理勾选（settings.useProxy，内置四源）。 */
  useProxy: { type: Object, default: () => ({}) },
  /** 自定义源列表（逐项 useProxy 勾选，R21 默认关）。 */
  custom: { type: Array, default: () => [] },
})
const emit = defineEmits(['change'])

const expanding = ref(false)
const editingId = ref('')
const form = reactive({ label: '', address: '' })
const submitInfo = reactive({ text: '', error: false })

/** 代理地址即时校验（INV-18 / K-19）：拒凭据形态 + 形状校验（host:port 或 http://host:port）。 */
function checkAddress(value) {
  const text = String(value ?? '')
  if (text === '') return { ok: false, text: '必填：代理地址' }
  if (text.includes('@')) return { ok: false, text: '✗ 本插件不支持代理认证（INV-18：地址禁 user:pass@ 形态）' }
  if (!/^(?:https?:\/\/)?[A-Za-z0-9.-]+:\d{1,5}$/.test(text)) {
    return { ok: false, text: '✗ 形如 host:port 或 http://host:port（例 192.168.0.41:7890）' }
  }
  return { ok: true, text: '✓ 地址合法 · CONNECT 隧道 · 不支持认证' }
}

const addressCheck = computed(() => checkAddress(form.address))
const formOk = computed(() => form.label.trim() !== '' && addressCheck.value.ok)
const toggleText = computed(() => (expanding.value ? '收起' : editingId.value ? '编辑中…' : '+ 添加代理'))
const enabledCount = computed(() => {
  const builtIn = ['ddg', 'bing', 'so360', 'baidu'].filter((id) => props.useProxy[id] === true).length
  const customOn = props.custom.filter((item) => item?.useProxy === true).length
  return builtIn + customOn
})
/** 诚实面：勾选走代理但池为空 → 明示错误（不静默回落）。 */
const poolError = computed(() =>
  props.proxies.length === 0 && enabledCount.value > 0
    ? '✗ 已勾选走代理但代理池为空——请添加代理或取消勾选（明示错误，不静默回落直连）'
    : '',
)
const countText = computed(() => `${props.proxies.length} 套代理 · ${enabledCount.value} 源走代理`)

function resetForm() {
  form.label = ''
  form.address = ''
  editingId.value = ''
}

function onToggle() {
  expanding.value = !expanding.value
  if (!expanding.value) resetForm()
  submitInfo.text = ''
}

function onEdit(item) {
  form.label = item.label ?? ''
  form.address = item.address ?? ''
  editingId.value = item.id
  expanding.value = true
  submitInfo.text = ''
}

function onDelete(id) {
  emit('change', { proxies: props.proxies.filter((item) => item.id !== id) })
  submitInfo.text = '已删除该代理（保存后生效）'
  submitInfo.error = false
}

function onSubmit() {
  if (!formOk.value) {
    submitInfo.text = '✗ 请先修正地址校验错误（凭据形态与畸形地址均拒收）'
    submitInfo.error = true
    return
  }
  const item = { id: editingId.value || `proxy-${Date.now().toString(36)}`, label: form.label.trim(), address: form.address.trim() }
  emit('change', {
    proxies: editingId.value
      ? props.proxies.map((entry) => (entry.id === editingId.value ? item : entry))
      : [...props.proxies, item],
  })
  submitInfo.text = editingId.value ? '✓ 已更新（保存后生效）' : '✓ 已添加（保存后生效）'
  submitInfo.error = false
  resetForm()
  expanding.value = false
}

function onToggleSource(id) {
  emit('change', { useProxy: { ...props.useProxy, [id]: !(props.useProxy[id] === true) } })
}

function onToggleCustom(id) {
  emit('change', {
    custom: props.custom.map((item) => (item.id === id ? { ...item, useProxy: !(item.useProxy === true) } : item)),
  })
}
</script>

<template>
  <section class="cs-card" aria-label="代理配置">
    <div class="cs-card-head">
      <h2 class="cs-card-title">代理配置</h2>
      <div class="cs-row-control">
        <span class="cs-count">{{ countText }}</span>
        <button class="cs-btn-ghost" type="button" @click="onToggle">{{ toggleText }}</button>
      </div>
    </div>
    <p class="cs-card-desc">
      多套代理地址维护（R17），走 CONNECT 隧道；<b>本插件不支持代理认证</b>（地址禁 user:pass@ 形态，INV-18/R20）；
      境外源（DuckDuckGo/Bing）默认走代理、国内源（360/百度）与自定义源默认直连（R21）
    </p>
    <div class="cs-rows">
      <div v-for="item in props.proxies" :key="item.id" class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">{{ item.label }}</div>
          <div class="cs-row-desc"><code>{{ item.address }}</code> · CONNECT 隧道 · 不支持认证</div>
        </div>
        <div class="cs-row-control">
          <button class="cs-btn-tiny" type="button" @click="onEdit(item)">编辑</button>
          <button class="cs-btn-tiny pc-danger" type="button" @click="onDelete(item.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 代理池行内表单（增/改）：地址校验即时反馈 -->
    <div v-show="expanding" class="pc-form">
      <div class="pc-field">
        <div class="pc-label">名称 <span class="pc-req">必填</span></div>
        <input v-model="form.label" class="pc-input" type="text" placeholder="家庭代理" />
      </div>
      <div class="pc-field">
        <div class="pc-label">代理地址 <span class="pc-req">必填</span></div>
        <div class="pc-hint">形如 <code>host:port</code> 或 <code>http://host:port</code>；本插件不支持代理认证</div>
        <input v-model="form.address" class="pc-input" type="text" placeholder="192.168.0.41:7890" />
        <div class="pc-feedback" :class="addressCheck.ok ? 'is-ok' : 'is-fail'">{{ addressCheck.text }}</div>
      </div>
      <div class="pc-foot">
        <div class="pc-feedback" :class="submitInfo.error ? 'is-fail' : 'is-ok'">{{ submitInfo.text }}</div>
        <div class="cs-row-control">
          <button class="cs-btn-tiny" type="button" @click="onToggle">取消</button>
          <button class="cs-btn-primary" type="button" @click="onSubmit">{{ editingId ? '保存修改' : '添加代理' }}</button>
        </div>
      </div>
    </div>

    <div class="cs-rows">
      <div class="cs-row">
        <div class="cs-row-main">
          <div class="cs-row-label">每源映射</div>
          <div class="cs-row-desc">逐源独立勾选是否走代理（R17）；当前口径=池首项主力，逐源「走哪套」（proxyId）留 backlog（INV-19 不自扩键）</div>
        </div>
      </div>
      <div class="cs-row">
        <div class="cs-row-main"><div class="cs-row-label">DuckDuckGo</div><div class="cs-row-desc">境外源 · 默认走代理</div></div>
        <div class="cs-row-control">
          <button class="cs-switch" :class="{ 'is-off': !(props.useProxy.ddg === true) }" type="button" role="switch"
            :aria-checked="String(props.useProxy.ddg === true)" aria-label="DuckDuckGo 走代理" @click="onToggleSource('ddg')"><span class="cs-thumb"></span></button>
        </div>
      </div>
      <div class="cs-row">
        <div class="cs-row-main"><div class="cs-row-label">Bing</div><div class="cs-row-desc">境外源 · 默认走代理</div></div>
        <div class="cs-row-control">
          <button class="cs-switch" :class="{ 'is-off': !(props.useProxy.bing === true) }" type="button" role="switch"
            :aria-checked="String(props.useProxy.bing === true)" aria-label="Bing 走代理" @click="onToggleSource('bing')"><span class="cs-thumb"></span></button>
        </div>
      </div>
      <div class="cs-row">
        <div class="cs-row-main"><div class="cs-row-label">360 搜索</div><div class="cs-row-desc">国内源 · 默认直连</div></div>
        <div class="cs-row-control">
          <button class="cs-switch" :class="{ 'is-off': !(props.useProxy.so360 === true) }" type="button" role="switch"
            :aria-checked="String(props.useProxy.so360 === true)" aria-label="360 搜索 走代理" @click="onToggleSource('so360')"><span class="cs-thumb"></span></button>
        </div>
      </div>
      <div class="cs-row">
        <div class="cs-row-main"><div class="cs-row-label">百度</div><div class="cs-row-desc">国内源 · 默认直连</div></div>
        <div class="cs-row-control">
          <button class="cs-switch" :class="{ 'is-off': !(props.useProxy.baidu === true) }" type="button" role="switch"
            :aria-checked="String(props.useProxy.baidu === true)" aria-label="百度 走代理" @click="onToggleSource('baidu')"><span class="cs-thumb"></span></button>
        </div>
      </div>
      <div v-for="item in props.custom" :key="item.id" class="cs-row">
        <div class="cs-row-main"><div class="cs-row-label">{{ item.label }}</div><div class="cs-row-desc">自定义源 · 默认直连</div></div>
        <div class="cs-row-control">
          <button class="cs-switch" :class="{ 'is-off': !(item.useProxy === true) }" type="button" role="switch"
            :aria-checked="String(item.useProxy === true)" :aria-label="`${item.label} 走代理`" @click="onToggleCustom(item.id)"><span class="cs-thumb"></span></button>
        </div>
      </div>
    </div>
    <div class="cs-hint cs-error">{{ poolError }}</div>
    <div class="cs-hint">
      <span>勾选走代理即经 CONNECT 隧道出站（socket 面收敛在唯一出网缝）；池为空时明示错误不静默回落。代理可达性校验须显式点击触发（K-15，端点面留后续卡）。</span>
    </div>
  </section>
</template>

<style scoped>
/* 样式全落组件内（不碰 web/src/styles.css）；零自造色——只引 dsh token（K-11/K-22）。 */
.pc-danger { color: var(--dsw-alias-state-error-primary); }
.pc-form {
  margin: 4px 0 12px; padding: 14px 14px 10px;
  border: 0.5px solid var(--dsw-alias-state-business-primary);
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  display: flex; flex-direction: column; gap: 12px;
}
.pc-field { display: flex; flex-direction: column; gap: 2px; }
.pc-label { font-size: 12px; font-weight: 500; line-height: 18px; color: var(--dsw-alias-label-primary); }
.pc-req { color: var(--dsw-alias-state-error-primary); font-size: 11px; font-weight: 400; }
.pc-hint { color: var(--dsw-alias-label-caption); font-size: 11.5px; line-height: 16px; }
.pc-hint code, .cs-row-desc code { font-family: var(--ds-font-family-code); color: var(--dsw-alias-label-primary); }
.pc-input {
  width: 100%; height: 32px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary); font-family: var(--ds-font-family-code); font-size: 12px;
}
.pc-input:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.pc-feedback { font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.pc-feedback.is-ok { color: var(--dsw-alias-state-success-primary); }
.pc-feedback.is-fail { color: var(--dsw-alias-state-error-primary); }
.pc-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 10px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
</style>
