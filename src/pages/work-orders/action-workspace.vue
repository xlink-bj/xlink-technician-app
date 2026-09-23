<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备操作空间" />

  <view v-else-if="!canAccess" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">需要登录</text>
    <text class="workspace-state-copy">登录后才能处理当前工单。</text>
    <navigator class="workspace-state-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else-if="routeError || workspace.loadState === 'blocked'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">当前操作暂不可用</text>
    <text class="workspace-state-copy">请返回工单详情，按当前任务继续操作。</text>
    <AppButton class="workspace-state-action" @tap="exit">返回工单详情</AppButton>
  </view>

  <ActionWorkspaceShell
    v-else-if="workspace.descriptor?.contentKind === 'quotation' && workspace.descriptor.actionIntent === 'place_order'"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :can-submit="workspace.canSubmitQuotation"
    :transitioning="workspace.quotationOrderState.state === 'submitting'"
    :submit-label="workspace.quotationOrderState.state === 'submitting' ? '提交中…' : '提交订单/报价方案'"
    @submit="quotationConfirmOpen = true"
  >
    <QuotationActionContent
      :state="quotationContentViewState"
      @retry="reload"
      @back="exit"
    />
    <view v-if="quotationConfirmOpen" class="quotation-confirm-backdrop" role="presentation">
      <view class="quotation-confirm-sheet" role="dialog" aria-modal="true" data-testid="quotation-order-confirmation">
        <text class="quotation-confirm-title">确认提交订单/报价方案？</text>
        <text class="workspace-state-copy">提交会创建服务器订单，并触发后端已验证的报价单生成、工单金额更新等副作用；不会完成当前工单工作流。提交后请勿重复操作。</text>
        <view class="quotation-confirm-actions">
          <AppButton variant="secondary" @tap="quotationConfirmOpen = false">返回检查</AppButton>
          <AppButton data-testid="quotation-order-confirm" @tap="confirmQuotationSubmit">确认提交</AppButton>
        </view>
      </view>
    </view>
  </ActionWorkspaceShell>

  <AppLoadingState v-else-if="workspace.loadState === 'loading'" variant="workspace" label="正在准备操作内容" />

  <view v-else-if="workspace.loadState === 'failed_retryable'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">暂时无法打开操作</text>
    <text class="workspace-state-copy">请检查网络后重试，已保存的本地草稿不会丢失。</text>
    <AppButton class="workspace-state-action" @tap="reload">重新加载</AppButton>
  </view>

  <view v-else-if="workspace.loadState === 'failed_terminal'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">操作内容暂不可用</text>
    <text class="workspace-state-copy">请返回工单详情后再次尝试。</text>
    <AppButton class="workspace-state-action" @tap="reload">再次尝试</AppButton>
  </view>

  <!-- Appointment path remains @submit="continueToConfirmation"; generic forms use the Runtime-gated handler. -->
  <ActionWorkspaceShell
    v-else-if="workspace.descriptor && (workspace.appointmentForm || workspace.dynamicForm)"
    :customer-name="workspace.detail?.customerName"
    :display-number="workspace.detail?.displayNumber"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :transitioning="isNavigating"
    :can-submit="workspace.canSubmit"
    :business-feedback="feedback"
    :submit-label="workspace.descriptor.formPurpose === 'survey' ? '完成勘查' : workspace.descriptor.actionIntent === 'interact_with_form' ? '完成' : '继续确认'"
    @submit="submitWorkspace"
  >
    <SurveyActionContent v-if="workspace.descriptor.actionIntent === 'interact_with_form' && workspace.descriptor.formPurpose === 'survey'" />
    <GenericDynamicFormActionContent v-else-if="workspace.descriptor.actionIntent === 'interact_with_form'" />
    <view v-else class="action-workspace-content app-surface" :data-field-count="workspace.appointmentFields.length">
      <view class="action-content-heading">
        <view class="action-content-title-row">
          <view class="action-content-icon" aria-hidden="true"><AppIcon name="appointment" :size="20" /></view>
          <text class="action-content-title">预约信息</text>
        </view>
        <text class="action-content-caption">请与客户确认上门时间安排</text>
      </view>

      <AppField
        v-if="workspace.appointmentChoiceField"
        class="action-content-field--choice"
        :label="workspace.appointmentChoiceField.label"
        :required="workspace.appointmentChoiceField.runtime.required"
      >
        <AppChoiceGroup
          :options="appChoiceOptionsFor(workspace.appointmentChoiceField)"
          :model-value="String(workspace.appointmentForm?.values[workspace.appointmentChoiceField.valueKey] ?? '')"
          :disabled="workspace.appointmentChoiceField.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @update:model-value="setField(workspace.appointmentChoiceField.fieldId, $event)"
        />
      </AppField>

      <AppField
        v-if="workspace.appointmentTimeField && workspace.appointmentDatetimeApplicable"
        class="action-content-field"
        :label="workspace.appointmentTimeField.label"
        :required="workspace.appointmentTimeField.runtime.required"
      >
        <AppSelector
          class="appointment-time-selector"
          :selected="Boolean(appointmentDisplay)"
          :disabled="workspace.appointmentTimeField.runtime.readOnly || workspace.lifecycle === 'submitting' || isNavigating"
          @tap="openTimeSelection"
        >
          <view v-if="appointmentDisplay" class="appointment-time-selected">
            <text class="appointment-time-selected-date">{{ appointmentDisplay.dateLabel }}</text>
            <text class="appointment-time-selected-value">{{ appointmentDisplay.timeLabel }}</text>
          </view>
          <text v-else class="appointment-time-placeholder">请选择上门时间</text>
        </AppSelector>
      </AppField>

      <AppField
        v-if="workspace.appointmentNoteField"
        class="action-content-field--note"
        :label="workspace.appointmentNoteField.label"
        :required="workspace.appointmentNoteField.runtime.required"
        :optional="!workspace.appointmentNoteField.runtime.required"
      >
        <AppTextarea
          :model-value="String(workspace.appointmentForm?.values[workspace.appointmentNoteField.valueKey] ?? '')"
          :maxlength="-1"
          :disabled="workspace.appointmentNoteField.runtime.readOnly || workspace.lifecycle === 'submitting'"
          :read-only="workspace.appointmentNoteField.runtime.readOnly"
          placeholder="请填写与客户沟通的其他信息"
          @update:model-value="setField(workspace.appointmentNoteField.fieldId, $event)"
        />
      </AppField>

      <AppField
        v-for="field in workspace.appointmentExtraFields"
        :key="field.fieldId"
        class="action-content-field"
        :label="field.label"
        :required="field.runtime.required"
      >
        <AppChoiceGroup
          v-if="field.options?.length"
          :options="appChoiceOptionsFor(field)"
          :model-value="String(workspace.appointmentForm?.values[field.valueKey] ?? '')"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <AppTextarea
          v-else-if="isMultilineField(field)"
          :model-value="String(workspace.appointmentForm?.values[field.valueKey] ?? '')"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          :read-only="field.runtime.readOnly"
          @update:model-value="setField(field.fieldId, $event)"
        />
        <AppInput
          v-else
          :model-value="String(workspace.appointmentForm?.values[field.valueKey] ?? '')"
          :disabled="field.runtime.readOnly || workspace.lifecycle === 'submitting'"
          :read-only="field.runtime.readOnly"
          @update:model-value="setField(field.fieldId, $event)"
        />
      </AppField>
      </view>

    <template #actions v-if="workspace.descriptor?.actionIntent === 'interact_with_form'">
      <ActionWorkspaceFormActions
        :lifecycle="workspace.lifecycle"
        :save-state="workspace.dynamicFormSaveState"
        :can-submit="workspace.canSubmit"
        :transitioning="isNavigating"
        :submit-label="workspace.descriptor.formPurpose === 'survey' ? '完成勘查' : '完成'"
        @save="workspace.saveDynamicForm"
        @submit="submitWorkspace"
      />
    </template>

    <template #success v-if="workspace.descriptor?.actionIntent === 'interact_with_form'">
      <view class="action-success app-surface">
        <view class="action-success-icon" aria-hidden="true"><AppIcon name="complete" :size="28" /></view>
        <text class="action-success-title">{{ workspace.descriptor.formPurpose === 'survey' ? '现场勘查已完成' : '表单已完成' }}</text>
        <text class="action-success-copy">{{ workspace.descriptor.formPurpose === 'survey' ? '本次动态表单已提交，工单状态已刷新。' : '本次动态表单已提交，工单状态已刷新。' }}</text>
      </view>
    </template>
    <template #success-actions v-if="workspace.descriptor?.actionIntent === 'interact_with_form'">
      <AppButton class="action-success-detail" block @tap="workspace.navigateToDetail">查看工单详情</AppButton>
      <AppButton variant="text" block @tap="workspace.navigateToList">返回工单列表</AppButton>
    </template>

  </ActionWorkspaceShell>

  <view v-else class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">操作内容暂不可用</text>
    <AppButton class="workspace-state-action" @tap="exit">返回工单详情</AppButton>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'

import { hasAuthenticatedSession } from '@features/home/access'
import {
  parseActionWorkspaceId,
  parseActionWorkspaceNodeId,
  useActionWorkspaceStore,
} from '@features/work-orders/action-workspace'
import { appointmentDisplayFor } from '@features/work-orders/appointment-time'
import { isMultilineField } from '@features/work-orders/form-presentation'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceFormActions from '@shared/ui/ActionWorkspaceFormActions.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import GenericDynamicFormActionContent from '@features/work-orders/components/GenericDynamicFormActionContent.vue'
import SurveyActionContent from '@features/work-orders/components/SurveyActionContent.vue'
import QuotationActionContent from '@features/work-orders/quotation/QuotationActionContent.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppSelector from '@shared/ui/AppSelector.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import type { AppChoiceOption } from '@shared/ui/types'
import type { OperationError } from '@shared/types'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
const routeReady = ref(false)
const routeId = ref<ReturnType<typeof parseActionWorkspaceId>>(null)
const routeNodeId = ref<ReturnType<typeof parseActionWorkspaceNodeId>>(null)
const routeAction = ref<string | undefined>(undefined)
const routeQuotationOrderId = ref<string | undefined>(undefined)
const routeError = ref('')
const isNavigating = ref(false)
const quotationConfirmOpen = ref(false)

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const appointmentDisplay = computed(() => appointmentDisplayFor(workspace.appointmentTimeValue))
const feedback = computed(() => actionErrorCopy(workspace.error))
const quotationContentViewState = computed(() => workspace.quotationContentState === 'idle'
  ? 'loading'
  : workspace.quotationContentState)

async function loadWorkspace(): Promise<void> {
  if (!routeReady.value || session.status !== 'authenticated') return
  if (!routeId.value || !routeNodeId.value) {
    routeError.value = 'invalid-route'
    workspace.clear()
    return
  }
  routeError.value = ''
  const loaded = await workspace.ensureLoaded({
    workOrderId: routeId.value,
    workflowNodeId: routeNodeId.value,
    ...(routeAction.value ? { actionIntent: routeAction.value } : {}),
  })
  if (loaded.state === 'succeeded' && routeQuotationOrderId.value && workspace.descriptor?.contentKind === 'quotation') {
    await workspace.loadQuotationOrderForEdit(routeQuotationOrderId.value)
  }
}

onLoad((options) => {
  routeId.value = parseActionWorkspaceId(options?.id)
  routeNodeId.value = parseActionWorkspaceNodeId(options?.node)
  routeAction.value = typeof options?.action === 'string' ? options.action : undefined
  routeQuotationOrderId.value = typeof options?.orderId === 'string' && options.orderId.trim() ? options.orderId.trim() : undefined
  routeReady.value = true
})

onUnload(() => {
  void workspace.flushDraft()
})

watch(
  [() => session.status, routeReady],
  ([status, ready]) => {
    if (ready && status === 'authenticated') loadWorkspace()
    if (status !== 'authenticated' && status !== 'unknown') workspace.clear()
  },
  { immediate: true },
)

async function exit(): Promise<void> {
  const result = await workspace.exit()
  if (result.state !== 'succeeded') routeError.value = 'draft-save-failed'
}

function reload(): void {
  loadWorkspace()
}

function setField(fieldId: string, value: string): void {
  workspace.setField(fieldId, value)
}

function appChoiceOptionsFor(
  field: { readonly options?: readonly { readonly value: string; readonly label: string }[] } | undefined,
): readonly AppChoiceOption[] {
  return (field?.options ?? []).map(({ value, label }) => ({ value, label }))
}

async function openTimeSelection(): Promise<void> {
  if (isNavigating.value) return
  isNavigating.value = true
  const result = await workspace.openAppointmentTimeSelection()
  if (result.state !== 'succeeded') isNavigating.value = false
}

async function continueToConfirmation(): Promise<void> {
  if (isNavigating.value) return
  isNavigating.value = true
  const result = await workspace.continueToConfirmation()
  if (result.state !== 'succeeded') isNavigating.value = false
}

async function submitWorkspace(): Promise<void> {
  if (workspace.descriptor?.actionIntent === 'interact_with_form') {
    await workspace.completeDynamicForm()
    return
  }
  await continueToConfirmation()
}

async function confirmQuotationSubmit(): Promise<void> {
  quotationConfirmOpen.value = false
  await workspace.submitQuotationOrder()
}

function actionErrorCopy(error: OperationError | null): string {
  if (!error) return ''
  switch (error.category) {
    case 'validation':
      return '请补充必填信息后再继续。'
    case 'network_retryable':
      return '网络暂时不可用，输入已保留，请稍后重试。'
    case 'unsupported_capability':
      return '当前操作暂不可用。'
    case 'session_invalid':
      return '登录状态已失效，请重新登录。'
    default:
      return '操作暂时失败，输入已保留，请稍后重试。'
  }
}
</script>

<style>
.workspace-state {
  background: var(--app-color-page);
  box-sizing: border-box;
  min-height: 100vh;
  padding: var(--app-space-lg);
  width: 100%;
}

.workspace-state--centered {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.workspace-state-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }

.workspace-state-copy {
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-field-label);
  line-height: 1.6;
  margin-top: var(--app-space-sm);
  max-width: 620rpx;
}

.workspace-state-link { color: var(--app-color-primary); font-size: var(--app-font-body); font-weight: 700; margin-top: var(--app-space-lg); }

.workspace-state-action {
  margin-top: var(--app-space-lg);
  width: 300rpx;
}

.workspace-state-action::after { border: 0; }

.action-workspace-content {
  margin-top: var(--app-space-md);
  padding: var(--app-card-padding);
}

.action-content-heading { border-bottom: 1rpx solid var(--app-color-divider); padding-bottom: var(--app-space-lg); }
.action-content-title-row { align-items: center; display: flex; }

.action-content-icon {
  align-items: center;
  background: var(--app-color-primary-soft);
  border-radius: 10rpx;
  color: var(--app-color-primary);
  display: flex;
  font-size: 22rpx;
  height: 42rpx;
  justify-content: center;
  margin-right: var(--app-space-sm);
  width: 42rpx;
}

.action-content-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; }
.action-content-caption { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-field-label); margin-top: var(--app-space-xs); }

.appointment-time-selector { color: var(--app-color-text-primary); }
.appointment-time-placeholder { color: var(--app-color-text-muted); font-size: var(--app-font-body); }
.appointment-time-selected { display: flex; flex-direction: column; gap: 4rpx; }
.appointment-time-selected-date { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 800; }
.appointment-time-selected-value { color: var(--app-color-primary); font-size: var(--app-font-field-label); font-weight: 700; }
.action-success { align-items: center; display: flex; flex-direction: column; margin-top: var(--app-space-md); padding: 72rpx var(--app-card-padding); text-align: center; }
.action-success-icon { align-items: center; background: var(--app-color-success-soft); border-radius: 999rpx; color: var(--app-color-success); display: flex; height: 72rpx; justify-content: center; width: 72rpx; }
.action-success-title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; margin-top: var(--app-space-lg); }
.action-success-copy { color: var(--app-color-text-secondary); font-size: var(--app-font-body); margin-top: var(--app-space-sm); }
.action-success-detail { margin-bottom: var(--app-space-xs); }
.quotation-readonly-note { color: var(--app-color-text-secondary); display: block; font-size: var(--app-font-meta); padding: var(--app-space-md) 0; text-align: center; }
.quotation-confirm-backdrop { align-items: center; background: rgba(20, 32, 52, .42); display: flex; inset: 0; justify-content: center; padding: var(--app-page-gutter); position: fixed; z-index: 1100; }
.quotation-confirm-sheet { background: var(--app-color-surface); border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); box-sizing: border-box; max-width: 640rpx; padding: var(--app-card-padding); width: 100%; }
.quotation-confirm-title { color: var(--app-color-text-primary); display: block; font-size: var(--app-font-section-title); font-weight: 800; }
.quotation-confirm-actions { display: flex; gap: var(--app-space-sm); justify-content: flex-end; margin-top: var(--app-space-lg); }

</style>
