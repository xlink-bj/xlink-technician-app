<template>
  <view class="pipe-pressure">
    <view class="pressure-card" data-testid="pipe-pressure-editor">
      <view class="pressure-context">
        <text class="pressure-title">本机测压草稿</text>
        <text class="pressure-caption">{{ workOrderNumber }} · 手填 · MPa</text>
      </view>
      <AppStatus v-if="phase === 'loading'" data-testid="pipe-pressure-loading" message="正在读取本机草稿。" />
      <template v-else>
        <AppField label="起始压力（MPa）" data-testid="pipe-pressure-start">
          <AppInput :model-value="fields.start" input-type="digit" :maxlength="8" :disabled="!editable"
            reconcile-on-commit @update:model-value="update('start', $event)" />
        </AppField>
        <AppField label="结束压力（MPa）" data-testid="pipe-pressure-end">
          <AppInput :model-value="fields.end" input-type="digit" :maxlength="8" :disabled="!editable"
            reconcile-on-commit @update:model-value="update('end', $event)" />
        </AppField>
        <AppField label="保压时间（分钟）" data-testid="pipe-pressure-minutes">
          <AppInput :model-value="fields.minutes" input-type="number" :maxlength="6" :disabled="!editable"
            reconcile-on-commit @update:model-value="update('minutes', $event)" />
        </AppField>
        <AppStatus :message="message" :tone="tone" data-testid="pipe-pressure-status" />
        <AppButton v-if="requiresRead" variant="secondary" block data-testid="pipe-pressure-reread"
          @tap="restore(false)">核对本机草稿</AppButton>
        <AppButton v-if="phase === 'conflict' && checkedConflict" block variant="secondary"
          data-testid="pipe-pressure-use-local" @tap="adoptLocal">采用刚读取的本机草稿</AppButton>
        <AppButton v-if="phase === 'ready' && dirty" block data-testid="pipe-pressure-save"
          @tap="saveLatest">重试保存本机草稿</AppButton>
      </template>
    </view>

    <view class="pressure-card" data-testid="pipe-pressure-history">
      <view class="pressure-context">
        <text class="pressure-title">已有本机结果</text>
        <text class="pressure-caption">独立记录 · 不含正在编辑的草稿</text>
      </view>
      <AppStatus v-if="history.state === 'failed'" tone="warning" message="已有结果读取失败，草稿不受影响。"
        data-testid="pipe-pressure-history-failed" />
      <AppStatus v-else-if="history.state === 'loading'" message="正在读取已有本机结果。" />
      <AppStatus v-else-if="history.rows.length === 0" message="本机暂无同工单测压结果。" />
      <template v-else>
        <AppButton v-for="(row, index) in history.rows" :key="row.completedAt + ':' + index"
          variant="secondary" block :pressed="openedHistory === index" :data-testid="'pipe-pressure-history-' + index"
          @tap="openedHistory = openedHistory === index ? null : index">
          第 {{ index + 1 }} 轮 · {{ row.manualPressure ? '手填' : '合成采样' }}
        </AppButton>
        <view v-if="openedSummary" class="pressure-summary" data-testid="pipe-pressure-history-detail">
          <text>起始 {{ openedSummary.startMpa.toFixed(2) }} MPa</text>
          <text>结束 {{ openedSummary.endMpa.toFixed(2) }} MPa</text>
          <text>保压 {{ openedSummary.holdMinutes }} 分钟</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { DeviceResult } from '@shared/ports/device-action'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { pressureSummary } from '../device-action/device-action'
import type { LocalRead, LocalWrite } from './local-record'
import {
  createPressureDraft, emptyPressureFields, isPressureDraftInput, samePressureFields,
  type PipePressureDraft, type PipePressureFields, type PipePressureScope,
} from './pressure-draft'

const props = defineProps<{
  workOrderNumber: string
  scope: PipePressureScope
  stillCurrent: () => boolean
  loadDraft: () => Promise<LocalRead<PipePressureDraft>>
  writeDraft: (record: PipePressureDraft, baseline: PipePressureDraft | null) => Promise<LocalWrite<PipePressureDraft>>
  loadHistory: () => Promise<readonly DeviceResult[] | null>
}>()

const emit = defineEmits<{ (event: 'leave-blocked', blocked: boolean): void }>()
const phase = ref<'loading' | 'ready' | 'saving' | 'failed' | 'unknown' | 'conflict'>('loading')
const fields = ref<PipePressureFields>(emptyPressureFields)
const durable = shallowRef<PipePressureDraft | null>(null)
const conflict = shallowRef<PipePressureDraft | null>(null)
const checkedConflict = ref(false)
const loaded = ref(false)
const recovered = ref(false)
const history = ref<{ state: 'loading' | 'ready' | 'failed'; rows: readonly DeviceResult[] }>({
  state: 'loading', rows: [],
})
const openedHistory = ref<number | null>(null)
const openedSummary = computed(() => openedHistory.value === null ? null
  : pressureSummary(history.value.rows[openedHistory.value] ?? null))
const dirty = computed(() => !samePressureFields(fields.value, durable.value?.fields ?? emptyPressureFields))
const editable = computed(() => phase.value === 'ready' || phase.value === 'saving')
const requiresRead = computed(() => phase.value === 'failed' || phase.value === 'unknown'
  || (phase.value === 'conflict' && !checkedConflict.value))
const tone = computed(() => requiresRead.value || phase.value === 'conflict' ? 'warning' : 'neutral')
const message = computed(() => {
  switch (phase.value) {
    case 'loading': return '正在读取本机草稿。'
    case 'saving': return '正在保存本机草稿，请稍候。'
    case 'failed': return '无法读取或核对本机草稿。当前输入未清除。'
    case 'unknown': return '本机保存结果待核对。请先读回，草稿不会自动重写。'
    case 'conflict': return '本机草稿已变化，请先读回并选择是否采用。'
    case 'ready':
      if (dirty.value) return '当前改动尚未保存，可手动重试。'
      if (recovered.value) return '已恢复该作业的本机草稿，尚未提交。'
      return durable.value ? '本机草稿已保存，尚未提交。' : '输入将保存在本机草稿。'
  }
})
let active = true
let running = false
const isCurrent = () => active && props.stillCurrent()
const cannotLeave = () => running || dirty.value

function reportLeave() { emit('leave-blocked', cannotLeave()) }
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (isCurrent() && cannotLeave()) event.preventDefault()
}

async function restore(first: boolean) {
  if (!isCurrent() || running || (!first && !requiresRead.value)) return
  phase.value = 'loading'
  const saved = await props.loadDraft()
  if (!isCurrent() || saved.state === 'blocked') return
  if (saved.state === 'failed') { phase.value = 'failed'; return }
  if (!first && loaded.value && dirty.value
    && !samePressureFields(saved.record?.fields ?? emptyPressureFields, fields.value)
    && !samePressureFields(saved.record?.fields ?? emptyPressureFields, durable.value?.fields ?? emptyPressureFields)) {
    conflict.value = saved.record
    checkedConflict.value = true
    phase.value = 'conflict'
    return
  }

  const keepLocalEdit = !first && loaded.value && dirty.value
  durable.value = saved.record
  if (!keepLocalEdit) fields.value = saved.record?.fields ?? emptyPressureFields
  recovered.value = Boolean(saved.record) && !dirty.value
  loaded.value = true
  phase.value = 'ready'
  reportLeave()
}

function adoptLocal() {
  if (!isCurrent() || phase.value !== 'conflict' || !checkedConflict.value) return
  durable.value = conflict.value
  fields.value = conflict.value?.fields ?? emptyPressureFields
  conflict.value = null
  checkedConflict.value = false
  recovered.value = Boolean(durable.value)
  phase.value = 'ready'
  reportLeave()
}

async function saveLatest() {
  if (!isCurrent() || running || phase.value !== 'ready' || !dirty.value) return
  running = true
  recovered.value = false
  phase.value = 'saving'
  reportLeave()
  try {
    while (isCurrent() && dirty.value) {
      const proposal = createPressureDraft(props.scope, fields.value)
      const result = await props.writeDraft(proposal, durable.value)
      if (!isCurrent() || result.state === 'blocked') return
      if (result.state !== 'saved') {
        if (result.state === 'conflict') checkedConflict.value = false
        phase.value = result.state
        return
      }
      durable.value = result.record
    }
    if (isCurrent()) phase.value = 'ready'
  } finally {
    running = false
    if (isCurrent()) reportLeave()
  }
}

function update(field: keyof PipePressureFields, value: string) {
  if (!isCurrent() || !editable.value || !isPressureDraftInput(field, value) || fields.value[field] === value) return
  fields.value = { ...fields.value, [field]: value }
  reportLeave()
  void saveLatest()
}
async function readHistory() {
  const rows = await props.loadHistory()
  if (isCurrent()) history.value = rows === null ? { state: 'failed', rows: [] } : { state: 'ready', rows }
}

onMounted(() => {
  if (!isCurrent()) return
  window.addEventListener('beforeunload', warnBeforeUnload)
  void restore(true)
  void readHistory()
})
onBeforeUnmount(() => {
  active = false
  window.removeEventListener('beforeunload', warnBeforeUnload)
})
</script>

<style scoped>
.pipe-pressure,.pressure-card,.pressure-context,.pressure-summary { display: grid; gap: var(--app-space-sm); min-width: 0; }
.pipe-pressure { gap: var(--app-space-md); }
.pressure-card { padding: var(--app-card-padding); border: 1px solid var(--app-color-border); border-radius: var(--app-radius-card); background: var(--app-color-surface); }
.pressure-title { font-size: var(--app-font-section-title); font-weight: 700; }
.pressure-caption,.pressure-summary { font-size: var(--app-font-meta); color: var(--app-color-text-secondary); }
.pressure-summary { padding: var(--app-space-sm); border: 1px solid var(--app-color-border); border-radius: var(--app-radius-control); }
</style>
