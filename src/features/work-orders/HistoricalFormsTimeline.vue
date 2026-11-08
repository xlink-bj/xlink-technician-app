<template>
  <view v-if="reader?.enabled()" class="historical-forms" data-testid="historical-forms-timeline">
    <text v-if="loading" class="history-hint">正在读取已完成表单…</text>
    <view v-if="message" class="history-retry">
      <text class="history-hint" data-testid="historical-forms-message">{{ message }}</text>
      <AppButton variant="text" size="compact" :disabled="loading || Boolean(busy)" @tap="discover">重新读取</AppButton>
    </view>
    <text v-if="!loading && !message && readActor && !visibleTargets.length" class="history-hint">暂无可查看的已完成表单。</text>
    <view v-for="target in visibleTargets" :key="`${target.runtimeNodeId}:${target.recordId}`"
      class="activity-item" data-testid="historical-form-item" :data-record-id="target.recordId">
      <view class="activity-rail" aria-hidden="true">
        <view class="activity-icon activity-icon--gray"><AppIcon name="task" :size="14" color="#ffffff" /></view>
      </view>
      <view class="activity-body history-body">
        <view class="activity-heading">
          <text class="activity-title">{{ target.title }}</text>
          <text class="activity-badge activity-badge--gray">已完成表单</text>
        </view>
        <view class="history-action">
          <AppButton variant="text" size="compact" :disabled="loading || Boolean(busy)" data-testid="historical-form-open"
            @tap="open(target)">{{ busy === target ? '正在读取…' : '查看表单' }}</AppButton>
        </view>
        <view v-if="visibleRead(target)" class="history-fields" data-testid="historical-form-content">
          <view v-for="field in fields(target)" :key="field.fieldId" class="history-field">
            <text class="history-label">{{ field.label }}</text>
            <text class="history-value" :data-testid="`historical-form-value-${field.valueKey}`">{{ field.text }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, shallowRef, ref, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import { historicalFormsReaderKey, type HistoricalFormRead, type HistoricalFormTarget } from './r1-historical-forms-read'
import { projectR1RecordReadFields } from './r1-record-read-fields'
const props = defineProps<{ readonly workOrderId: string; readonly actorScope?: string | null }>()
// Each mounted detail owns its reader; an old page unmount cannot clear a new page's authority.
const createReader = inject(historicalFormsReaderKey, null)
const reader = createReader?.() ?? null
const targets = shallowRef<readonly HistoricalFormTarget[]>([])
const reads = shallowRef<ReadonlyMap<HistoricalFormTarget, HistoricalFormRead>>(new Map())
const readActor = ref<string | null>(null), loading = ref(false), message = ref('')
const busy = shallowRef<HistoricalFormTarget | null>(null)
let generation = 0
const visibleTargets = computed(() => props.actorScope && props.actorScope === readActor.value
  ? targets.value.filter(target => target.workOrderId === props.workOrderId && reader?.isCurrent(target)) : [])
function visibleRead(target: HistoricalFormTarget) {
  const value = reads.value.get(target)
  return visibleTargets.value.includes(target) && value && reader?.isCurrent(value) ? value : null
}
function fields(target: HistoricalFormTarget) {
  const value = visibleRead(target)
  return value ? projectR1RecordReadFields(value.definition, value.record) : []
}
function clear() {
  generation++; reader?.clear(); targets.value = []; reads.value = new Map(); readActor.value = null
  loading.value = false; busy.value = null; message.value = ''
}
async function discover() {
  clear()
  const ticket = generation, actor = props.actorScope, workOrderId = props.workOrderId
  if (!actor || !reader?.enabled()) return
  loading.value = true
  try {
    const value = await reader.discover(workOrderId)
    if (generation !== ticket || actor !== props.actorScope || workOrderId !== props.workOrderId) return
    targets.value = value; readActor.value = actor
  } catch {
    if (generation === ticket) message.value = '暂时无法读取历史表单，请重试。'
  } finally { if (generation === ticket) loading.value = false }
}
async function open(target: HistoricalFormTarget) {
  if (!reader || busy.value || loading.value || !visibleTargets.value.includes(target)) return
  const ticket = generation, actor = props.actorScope
  busy.value = target; message.value = ''
  try {
    const value = await reader.read(target)
    if (generation !== ticket || actor !== props.actorScope || !reader.isCurrent(value)) return
    reads.value = new Map(reads.value).set(target, value)
  } catch {
    if (generation === ticket) { targets.value = []; reads.value = new Map(); readActor.value = null; reader.clear(); message.value = '表单内容暂不可用，请重新读取。' }
  } finally { if (generation === ticket) busy.value = null }
}
watch(() => [props.workOrderId, props.actorScope], () => { void discover() }, { immediate: true })
onBeforeUnmount(clear)
</script>

<style scoped>
.historical-forms{margin-top:12px}
.history-hint{display:block;color:#68788f;font-size:14px;line-height:22px}
.history-retry{margin-bottom:12px}
/* UniApp scopes the page's activity selectors during compilation. Own the
   same timeline anatomy here rather than depending on parent CSS leakage. */
.activity-item{display:flex;gap:var(--app-space-md)}
.activity-rail{display:flex;flex:0 0 34rpx;align-items:center;flex-direction:column}
.activity-icon{display:flex;flex:0 0 32rpx;align-items:center;justify-content:center;width:32rpx;height:32rpx;border-radius:50%}
.activity-icon--gray{background:var(--app-color-text-muted)}
.activity-heading{display:flex;align-items:center;flex-wrap:wrap;gap:var(--app-space-sm);min-height:32rpx}
.activity-title{min-width:0;color:var(--app-color-text-primary);font-size:var(--app-font-body);font-weight:800;overflow-wrap:anywhere}
.activity-badge{flex-shrink:0;padding:4rpx var(--app-space-xs);border-radius:6rpx;font-size:var(--app-font-meta);font-weight:700}
.activity-badge--gray{background:var(--app-color-divider);color:var(--app-craft-caption)}
.history-body{flex:1;min-width:0;padding-bottom:var(--app-space-lg)}
.history-action{display:flex;justify-content:flex-start}
.history-fields{margin:8px 0 16px}
.history-field{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #ecf0f5;font-size:15px;line-height:24px}
.history-label{flex:0 0 35%;color:#68788f;overflow-wrap:anywhere}
.history-value{flex:1;min-width:0;color:#263b55;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
