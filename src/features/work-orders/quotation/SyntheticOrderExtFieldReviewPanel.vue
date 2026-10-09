<template>
  <view class="synthetic-extfield-review" data-testid="synthetic-extfield-review-panel">
    <view class="synthetic-extfield-review__heading">
      <view>
        <text class="synthetic-extfield-review__eyebrow">仅 H5 合成评审 · 不接入订单提交</text>
        <text class="synthetic-extfield-review__title">合成动态字段</text>
      </view>
      <text class="synthetic-extfield-review__badge">Order ExtField 示例</text>
    </view>
    <text class="synthetic-extfield-review__intro">演示字段显隐与两阶段校验；仅本机合成数据，不代表正式订单 Schema。</text>

    <AppStatus
      v-if="draftState === 'loading'"
      message="正在恢复本机合成字段草稿…"
      tone="neutral"
      quiet
      data-testid="synthetic-draft-loading"
    />
    <AppStatus
      v-else-if="draftState === 'corrupt'"
      message="合成字段草稿格式异常，原记录已保留；为避免覆盖，当前字段已锁定。"
      tone="warning"
      quiet
      data-testid="synthetic-draft-corrupt"
    />
    <AppStatus
      v-else-if="draftState === 'unavailable'"
      message="本机评审存储不可用；不会将数据改存到报价草稿。"
      tone="warning"
      quiet
      data-testid="synthetic-draft-unavailable"
    />
    <AppStatus
      v-else-if="draftState === 'saving' || draftState === 'pending'"
      message="正在保存独立的本机合成草稿…"
      tone="neutral"
      quiet
      data-testid="synthetic-draft-saving"
    />
    <AppStatus
      v-else-if="draftState === 'saved'"
      message="合成字段已保存在本机，可离开后返回或刷新页面恢复。"
      tone="success"
      quiet
      data-testid="synthetic-draft-saved"
    />
    <AppStatus
      v-else-if="draftState === 'save_failed'"
      message="合成字段保存失败；当前输入仍留在页面中，请检查浏览器本机存储。"
      tone="warning"
      quiet
      data-testid="synthetic-draft-save-failed"
    />

    <view v-if="draftState === 'ready' || draftState === 'pending' || draftState === 'saving' || draftState === 'saved' || draftState === 'save_failed'" class="synthetic-extfield-review__fields" data-testid="synthetic-editable-fields">
      <template v-for="item in editableFields" :key="item.field.fieldId">
        <view :data-testid="`synthetic-field-${item.field.fieldId}`">
          <AppField
            :label="syntheticOrderExtFieldSchemaLabel(item.field)"
            :required="item.state.required"
            :optional="!item.state.required"
            :error="fieldErrors[item.field.fieldId] ?? ''"
          >
            <AppTextarea
              v-if="item.field.type === 'textarea'"
              :model-value="stringValue(item.field.valueKey)"
              :disabled="!canEdit"
              :error="Boolean(fieldErrors[item.field.fieldId])"
              auto-height
              placeholder="请输入合成示例内容"
              :data-testid="`synthetic-input-${item.field.fieldId}`"
              @update:model-value="setValue(item.field.valueKey, $event)"
            />
            <AppInput
              v-else
              :model-value="stringValue(item.field.valueKey)"
              :disabled="!canEdit"
              :error="Boolean(fieldErrors[item.field.fieldId])"
              placeholder="请输入合成示例内容"
              :data-testid="`synthetic-input-${item.field.fieldId}`"
              @update:model-value="setValue(item.field.valueKey, $event)"
            />
          </AppField>
        </view>
      </template>
    </view>

    <AppStatus
      v-if="entryValidationMessage"
      :message="entryValidationMessage"
      tone="warning"
      quiet
      data-testid="synthetic-entry-validation-error"
      role="alert"
    />
    <AppButton
      class="synthetic-extfield-review__diagnostics-toggle"
      variant="text"
      data-testid="synthetic-diagnostics-toggle"
      :aria-expanded="diagnosticsExpanded"
      @tap="diagnosticsExpanded = !diagnosticsExpanded"
    >{{ diagnosticsExpanded ? '收起校验规则与受限能力' : '查看校验规则与受限能力' }}</AppButton>

    <view v-if="diagnosticsExpanded" class="synthetic-extfield-review__diagnostics" data-testid="synthetic-phase-diagnostics">
      <view class="synthetic-extfield-review__diagnostic-section" data-testid="synthetic-final-submit-readiness">
        <text class="synthetic-extfield-review__section-title">最终提交规则（只读演示）</text>
        <text class="synthetic-extfield-review__section-copy">按 R1 规则独立计算；条件隐藏不自动豁免，明确的 dispensable 条件只影响最终提交。</text>
        <text
          v-for="item in finalSubmitRows"
          :key="item.rowId"
          class="synthetic-extfield-review__diagnostic-row"
          :class="`synthetic-extfield-review__diagnostic-row--${item.state}`"
          :data-testid="`synthetic-final-row-${item.rowId}`"
        >{{ item.label }}：{{ finalStateLabel(item.state) }}<template v-if="item.reason">（{{ item.reason }}）</template></text>
        <text v-if="finalSubmitBlockedLabels.length" class="synthetic-extfield-review__diagnostic-row synthetic-extfield-review__diagnostic-row--blocked" data-testid="synthetic-final-submit-blocked">规则尚不能安全判定：{{ finalSubmitBlockedLabels.join('、') }}</text>
        <text v-if="!finalSubmitRows.length && !finalSubmitBlockedLabels.length" class="synthetic-extfield-review__diagnostic-row">当前合成阶段没有已知必填项。</text>
      </view>

      <view class="synthetic-extfield-review__diagnostic-section" data-testid="synthetic-submit-order-stage-preview">
        <text class="synthetic-extfield-review__section-title">另一阶段的规则示例</text>
        <text class="synthetic-extfield-review__section-copy">以下按合成 submitOrder 上下文重新运行同一映射器；它不代表当前 placeOrder 可编辑字段。</text>
        <text
          v-for="item in submitStageFinalRows"
          :key="item.rowId"
          class="synthetic-extfield-review__diagnostic-row"
          :class="`synthetic-extfield-review__diagnostic-row--${item.state}`"
          :data-testid="`synthetic-submit-final-row-${item.rowId}`"
        >{{ item.label }}：{{ finalStateLabel(item.state) }}<template v-if="item.reason">（{{ item.reason }}）</template></text>
      </view>

      <view class="synthetic-extfield-review__diagnostic-section" data-testid="synthetic-unsupported-controls">
        <text class="synthetic-extfield-review__section-title">受控能力（不会伪造控件）</text>
        <text class="synthetic-extfield-review__section-copy">区域选择、业务按钮、媒体持久化和选项 Provider 尚未接入；只展示阻断原因，不会发起定位、上传或选项请求。</text>
        <text
          v-for="row in unsupportedRows"
          :key="row.rowId"
          class="synthetic-extfield-review__diagnostic-row synthetic-extfield-review__diagnostic-row--blocked"
          :data-testid="`synthetic-unsupported-${row.rowId}`"
        >{{ syntheticOrderExtFieldLabel(row.rowId) }}：暂不支持安全编辑</text>
        <text
          v-for="row in stageAndApplicabilityRows"
          :key="row.rowId"
          class="synthetic-extfield-review__diagnostic-row synthetic-extfield-review__diagnostic-row--filtered"
          :data-testid="`synthetic-filtered-${row.rowId}`"
        >{{ syntheticOrderExtFieldLabel(row.rowId) }}：{{ filterReasonLabel(row.reason) }}</text>
      </view>
    </view>

    <text class="synthetic-extfield-review__disclaimer" data-testid="synthetic-no-business-command">本区域不保存 Order.exts、不创建订单、不提交报价，也不调用 Workflow 命令。</text>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { StoragePort } from '@shared/ports'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import {
  createSyntheticOrderExtFieldDraftSession,
  createSyntheticOrderExtFieldPlan,
  syntheticFinalSubmitRows,
  syntheticOrderExtFieldLabel,
  syntheticOrderExtFieldSchemaLabel,
  syntheticEffectiveFieldStates,
  validateSyntheticCatalogEntry,
} from './synthetic-extfield-review'
import type {
  SyntheticOrderExtFieldDraftSession,
  SyntheticOrderExtFieldIdentity,
} from './synthetic-extfield-review'

export interface SyntheticOrderExtFieldReviewPanelHandle {
  validateSelectionEntry(): boolean
  focusFirstError(): void
}

const props = defineProps<{
  readonly enabled: boolean
  readonly identity?: SyntheticOrderExtFieldIdentity
  readonly storage?: StoragePort
}>()

type DraftState = 'disabled' | 'loading' | 'ready' | 'pending' | 'saving' | 'saved' | 'save_failed' | 'corrupt' | 'unavailable'

const draftState = ref<DraftState>('disabled')
const values = ref<Record<string, unknown>>(Object.create(null) as Record<string, unknown>)
const fieldErrors = ref<Record<string, string>>(Object.create(null) as Record<string, string>)
const entryValidationMessage = ref('')
const diagnosticsExpanded = ref(false)
let session: SyntheticOrderExtFieldDraftSession | undefined
let identityGeneration = 0
let allowDraftWrites = false

const identityToken = computed(() => {
  const identity = props.identity
  if (!props.enabled || !identity || !props.storage) return ''
  return [identity.userId, identity.workOrderId, identity.workflowNodeId, identity.actionIntent, identity.scenario, identity.fixtureVersion].join('\u0000')
})
const currentPlan = computed(() => createSyntheticOrderExtFieldPlan(values.value))
const submitStagePlan = computed(() => createSyntheticOrderExtFieldPlan(values.value, 'submitOrder'))
const editableFields = computed(() => syntheticEffectiveFieldStates(currentPlan.value, values.value)
  .filter(({ field, state }) => state.visible && !state.readOnly && state.capability === 'SUPPORTED_GENERIC'
    && (field.type === 'text' || field.type === 'textarea' || field.type === 'digit')))
const finalSubmitRows = computed(() => syntheticFinalSubmitRows(currentPlan.value, values.value))
const submitStageFinalRows = computed(() => syntheticFinalSubmitRows(submitStagePlan.value, values.value))
const finalSubmitBlockedLabels = computed(() => currentPlan.value.diagnostics.finalSubmitBlockedRowIds
  .map((rowId) => syntheticOrderExtFieldLabel(currentPlan.value.rows.find((row) => row.rowId === rowId)?.rowId)))
const unsupportedRows = computed(() => {
  const current = currentPlan.value.rows.filter((row) => row.disposition === 'blocked')
  const submit = submitStagePlan.value.rows.filter((row) => row.disposition === 'blocked' && !current.some((other) => other.rowId === row.rowId))
  return [...current, ...submit]
})
const stageAndApplicabilityRows = computed(() => {
  const visible = new Map<string, typeof currentPlan.value.rows[number]>()
  for (const row of currentPlan.value.rows) {
    if (row.disposition === 'filtered' && row.rowId) visible.set(row.rowId, row)
  }
  for (const row of submitStagePlan.value.rows) {
    if (row.disposition === 'filtered' && row.rowId && !visible.has(row.rowId)) visible.set(row.rowId, row)
  }
  return [...visible.values()]
})
const canEdit = computed(() => draftState.value === 'ready' || draftState.value === 'pending' || draftState.value === 'saving' || draftState.value === 'saved' || draftState.value === 'save_failed')

function setValues(next: Readonly<Record<string, unknown>>): void {
  const safe: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(next)) safe[key] = value
  values.value = safe
}

function stopCurrentSession(): void {
  const previous = session
  session = undefined
  if (!previous) return
  void previous.flush().catch(() => undefined).finally(() => previous.dispose())
}

watch(identityToken, (token) => {
  identityGeneration += 1
  const generation = identityGeneration
  allowDraftWrites = false
  stopCurrentSession()
  fieldErrors.value = Object.create(null) as Record<string, string>
  entryValidationMessage.value = ''
  if (!token || !props.identity || !props.storage) {
    draftState.value = 'disabled'
    setValues({})
    return
  }

  draftState.value = 'loading'
  const nextSession = createSyntheticOrderExtFieldDraftSession(props.storage, props.identity, {
    onWriteState(state) {
      if (generation !== identityGeneration) return
      draftState.value = state === 'saving' ? 'saving' : state === 'saved' ? 'saved' : 'save_failed'
    },
  })
  session = nextSession
  void nextSession.load().then((result) => {
    if (generation !== identityGeneration || session !== nextSession) return
    if (result.state === 'empty') {
      setValues({ demoMode: '是', demoWaiverMode: '豁免' })
      draftState.value = 'ready'
      allowDraftWrites = true
    } else if (result.state === 'ready') {
      setValues({ demoMode: '是', demoWaiverMode: '豁免', ...result.values })
      draftState.value = 'ready'
      allowDraftWrites = true
    } else {
      draftState.value = result.state
      allowDraftWrites = false
    }
  }).catch(() => {
    if (generation !== identityGeneration) return
    draftState.value = 'unavailable'
    allowDraftWrites = false
  })
}, { immediate: true })

watch(values, (next) => {
  if (!allowDraftWrites || !session || !canEdit.value) return
  draftState.value = 'pending'
  session.schedule(next)
}, { deep: true })

onBeforeUnmount(() => {
  identityGeneration += 1
  allowDraftWrites = false
  stopCurrentSession()
})

function stringValue(valueKey: string): string {
  const value = values.value[valueKey]
  return value === undefined || value === null ? '' : String(value)
}

function setValue(valueKey: string, value: string): void {
  const next: Record<string, unknown> = Object.assign(Object.create(null), values.value)
  next[valueKey] = value
  values.value = next
  entryValidationMessage.value = ''
  const row = currentPlan.value.rows.find((candidate) => candidate.valueKey === valueKey && candidate.rowId)
  if (row?.rowId && fieldErrors.value[row.rowId]) {
    const errors = Object.assign(Object.create(null), fieldErrors.value) as Record<string, string>
    delete errors[row.rowId]
    fieldErrors.value = errors
  }
}

function focusFirstError(): void {
  if (typeof document === 'undefined') return
  const rowId = Object.keys(fieldErrors.value)[0]
  if (!rowId) return
  const target = document.querySelector(`[data-testid="synthetic-field-${rowId}"] input, [data-testid="synthetic-field-${rowId}"] textarea`)
  if (target instanceof HTMLElement) target.focus()
}

function validateSelectionEntry(): boolean {
  if (!canEdit.value) {
    entryValidationMessage.value = '本机合成草稿尚未就绪，暂不能进入目录。'
    return false
  }
  const result = validateSyntheticCatalogEntry(currentPlan.value, values.value)
  if (!result.ok) {
    entryValidationMessage.value = result.message
    if (result.fieldId) fieldErrors.value = { ...fieldErrors.value, [result.fieldId]: result.message }
    return false
  }
  fieldErrors.value = Object.create(null) as Record<string, string>
  entryValidationMessage.value = '目录进入必填校验通过；此结果只用于合成体验，不代表正式订单可提交。'
  return true
}

function finalStateLabel(state: 'missing' | 'valid' | 'blocked' | 'optional'): string {
  return { missing: '待填写', valid: '已填写（合成值）', blocked: '规则或控件待核验', optional: '最终提交可选' }[state]
}

function filterReasonLabel(reason?: string): string {
  if (reason === 'different_action_stage') return '当前动作阶段不适用'
  if (reason === 'service_type_not_applicable') return '当前服务类型不适用'
  if (reason === 'person_type_not_applicable') return '当前客户类型不适用'
  return '按映射规则过滤'
}

defineExpose<SyntheticOrderExtFieldReviewPanelHandle>({
  validateSelectionEntry,
  focusFirstError,
})
</script>

<style>
.synthetic-extfield-review { background: var(--app-color-primary-soft); border: 1rpx solid var(--app-color-primary-border); border-radius: var(--app-radius-card); margin-top: var(--app-space-md); padding: var(--app-space-sm) var(--app-card-padding); }
.synthetic-extfield-review__heading { align-items: center; display: flex; flex-wrap: wrap; gap: var(--app-space-sm); justify-content: space-between; }
.synthetic-extfield-review__eyebrow { color: var(--app-color-primary); display: block; font-size: var(--app-font-meta); font-weight: 700; }
.synthetic-extfield-review__title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; margin-top: 4rpx; }
.synthetic-extfield-review__badge { background: var(--app-color-surface); border-radius: 999rpx; color: var(--app-color-primary); font-size: var(--app-font-meta); padding: 6rpx 12rpx; }
.synthetic-extfield-review__intro,.synthetic-extfield-review__section-copy { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.45; margin-top: var(--app-space-xs); }
.synthetic-extfield-review__fields { display: grid; gap: var(--app-space-sm); margin-top: var(--app-space-md); }
.synthetic-extfield-review__diagnostics-toggle { justify-content: flex-start; margin-top: var(--app-space-xs); min-height: 64rpx; padding-left: 0; }
.synthetic-extfield-review__diagnostics { display: grid; gap: var(--app-space-sm); margin-top: var(--app-space-md); }
.synthetic-extfield-review__diagnostic-section { background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-control); padding: var(--app-space-sm); }
.synthetic-extfield-review__section-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-field-label); font-weight: 800; }
.synthetic-extfield-review__diagnostic-row { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: 6rpx; }
.synthetic-extfield-review__diagnostic-row--missing,.synthetic-extfield-review__diagnostic-row--blocked { color: var(--app-color-warning); }
.synthetic-extfield-review__diagnostic-row--valid { color: var(--app-color-success); }
.synthetic-extfield-review__diagnostic-row--filtered { color: var(--app-color-text-muted); }
.synthetic-extfield-review__disclaimer { color: var(--app-color-text-muted); display: block; font-size: var(--app-font-meta); line-height: 1.5; margin-top: var(--app-space-sm); }
</style>
