<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备操作空间" />

  <view v-else-if="!canAccess" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">需要登录</text>
    <text class="workspace-state-copy">登录后才能处理当前工单。</text>
    <navigator class="workspace-state-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else-if="routeError || workspace.loadState === 'blocked'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">当前操作暂不可用</text>
    <text class="workspace-state-copy">{{ routeError === 'production-read-only' ? '生产环境仅开放已验证的报价只读入口；其他操作空间不会加载或提交。' : '请返回工单详情，按当前任务继续操作。' }}</text>
    <AppButton class="workspace-state-action" @tap="exit">返回工单详情</AppButton>
  </view>

  <QuotationActionWorkspace
    v-else-if="workspace.descriptor?.contentKind === 'quotation' && workspace.descriptor.actionIntent === 'place_order'"
    :content-state="quotationContentViewState"
    :product-review-only="isMockQuotationPreview"
    :sku-lineage-audit="skuLineagePreview"
    :same-catalog-lineage="sameCatalogLineagePreview"
    :synthetic-sku-readiness="syntheticSkuReadinessPreview"
    @retry="reload"
    @back="exit"
  >
    <template #journey-context>
      <MockJourneyContextPanel
        v-if="localJourneyContext"
        :context="localJourneyContext"
        compact
        :can-adopt-suggestion="canAdoptSurveySuggestion"
        :suggestion-feedback="suggestionFeedback"
        @adopt-suggestion="adoptSurveySuggestion"
      />
      <navigator
        v-if="mockJourney?.stage === 'quotation' && isSigningMockReviewAvailable()"
        class="mock-signing-entry app-surface"
        :url="signingMockReviewUrl()"
        data-testid="mock-journey-signing-review"
      >
        <text class="mock-signing-entry__title">下一步预览 · 签约 Mock</text>
        <text class="mock-signing-entry__note">独立合成的正式订单与合同样本；当前本机报价未提交，也没有生成可签约的订单。</text>
      </navigator>
    </template>
  </QuotationActionWorkspace>

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
    <MockJourneyContextPanel v-if="localJourneyContext" :context="localJourneyContext"
      :compact="workspace.descriptor.formPurpose === 'survey'" />
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

    <!-- DEV-only synthetic state progression. This is NOT Workflow Complete.
         The same 019 WorkOrderId is used by all three normal App pages. -->
    <view
      v-if="mockJourney && mockJourney.stage !== 'quotation'"
      class="mock-journey-progress app-surface"
      data-testid="mock-journey-progress"
    >
      <text class="mock-journey-progress__note">仅本地演示：下一步只切换模拟流程节点，不提交业务表单或订单。</text>
      <AppButton
        block
        variant="secondary"
        :disabled="isNavigating"
        data-testid="mock-journey-advance"
        @tap="advanceJourney"
      >{{ mockJourney.nextLabel }}</AppButton>
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
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'

import { isBusinessMockQuotationPreview } from '@app/business-mock'
import { compareQuoteWithStandaloneSkuDemo, compareQuoteWithSameCatalogSyntheticSku } from '@app/quotation-sku-identity-evidence'
import { reviewP1SyntheticSkuReadiness } from '@app/p1-sku-readiness-review'
import { setActionWorkspacePageTitle } from '@app/action-page-title'
import { advanceMockJourneyContext, mockJourneyContext } from '@app/mock-journey'
import { readMockJourneyContext, type MockJourneyContextSummary } from '@app/mock-journey-context'
import { canAdoptMockSurveySuggestion } from '@app/mock-journey-quote-suggestion'
import { isSigningMockReviewAvailable, signingMockReviewUrl } from '@app/signing-mock-review'
import { hasAuthenticatedSession } from '@features/home/access'
import { isProductionReadOnlyRuntime } from '@shared/config'
import {
  parseActionWorkspaceId,
  parseActionWorkspaceNodeId,
  useActionWorkspaceStore,
} from '@features/work-orders/action-workspace'
import QuotationActionWorkspace from '@features/work-orders/quotation/QuotationActionWorkspace.vue'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import { appointmentDisplayFor } from '@features/work-orders/appointment-time'
import { isMultilineField } from '@features/work-orders/form-presentation'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceFormActions from '@shared/ui/ActionWorkspaceFormActions.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import GenericDynamicFormActionContent from '@features/work-orders/components/GenericDynamicFormActionContent.vue'
import SurveyActionContent from '@features/work-orders/components/SurveyActionContent.vue'
import MockJourneyContextPanel from '@features/work-orders/components/MockJourneyContextPanel.vue'
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
const quotationComposition = useQuotationCompositionStore()
const sameCatalogLineagePreview = computed(() => import.meta.env.DEV && isMockQuotationPreview.value && quotationComposition.draft
  ? compareQuoteWithSameCatalogSyntheticSku(quotationComposition.draft) : null)
const skuLineagePreview = computed(() => import.meta.env.DEV && isMockQuotationPreview.value && quotationComposition.draft
  ? compareQuoteWithStandaloneSkuDemo(quotationComposition.draft) : null)
const syntheticSkuReadinessPreview = computed(() => import.meta.env.DEV && isMockQuotationPreview.value && quotationComposition.draft
  ? reviewP1SyntheticSkuReadiness(quotationComposition.draft) : null)
const routeReady = ref(false)
const routeId = ref<ReturnType<typeof parseActionWorkspaceId>>(null)
const routeNodeId = ref<ReturnType<typeof parseActionWorkspaceNodeId>>(null)
const routeAction = ref<string | undefined>(undefined)
const routeQuotationOrderId = ref<string | undefined>(undefined)
const routeError = ref('')
const isNavigating = ref(false)
const localJourneyContext = ref<MockJourneyContextSummary | null>(null)
const suggestionFeedback = ref('')
let journeyContextRequest = 0

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const productionReadOnly = isProductionReadOnlyRuntime()
const appointmentDisplay = computed(() => appointmentDisplayFor(workspace.appointmentTimeValue))
const isMockQuotationPreview = computed(() =>
  isBusinessMockQuotationPreview(workspace.descriptor?.workOrderId),
)
const feedback = computed(() => actionErrorCopy(workspace.error))
const mockJourney = computed(() => mockJourneyContext(routeId.value))
const canAdoptSurveySuggestion = computed(() =>
  routeAction.value === 'place_order'
  && routeId.value === mockJourney.value?.workOrderId
  && workspace.descriptor?.contentKind === 'quotation'
  && ['fresh', 'restored', 'dirty', 'saving', 'saved_local', 'save_failed'].includes(quotationComposition.localState)
  && canAdoptMockSurveySuggestion(localJourneyContext.value?.suggestion, quotationComposition.repairPartOptions, quotationComposition.groups.length),
)

function adoptSurveySuggestion(): void {
  if (!canAdoptSurveySuggestion.value) return
  const suggested = localJourneyContext.value?.suggestion
  if (!suggested) return
  const result = quotationComposition.createGroup({ repairParts: [suggested.targetRepairPartCode] })
  suggestionFeedback.value = result.state === 'succeeded'
    ? '已加入本机报价草稿。请补充部位描述、工程量及报价项目。'
    : '未能采用建议，请手动创建报价部位。'
}

const quotationContentViewState = computed(() => workspace.quotationContentState === 'idle'
  ? 'loading'
  : workspace.quotationContentState)

const workspaceNavigationTitle = computed(() => {
  if (routeAction.value === 'place_order' || workspace.descriptor?.contentKind === 'quotation') return '报价工作台'
  if (workspace.descriptor?.formPurpose === 'survey') return '现场勘查'
  if (workspace.descriptor?.actionIntent === 'interact_with_form') return '工单表单'
  return '预约上门'
})

// The Action Workspace route hosts multiple distinct actions. The static
// pages.json title is for appointments only; update the actual uni-app page
// title whenever the route intent or resolved form purpose changes.
watch(
  [routeReady, workspaceNavigationTitle],
  ([ready, title]) => {
    if (ready) setActionWorkspacePageTitle(title)
  },
  { immediate: true },
)

async function loadWorkspace(): Promise<void> {
  if (!routeReady.value || session.status !== 'authenticated') return
  const contextVersion = ++journeyContextRequest
  localJourneyContext.value = null
  suggestionFeedback.value = ''
  if (!routeId.value || !routeNodeId.value) {
    routeError.value = 'invalid-route'
    workspace.clear()
    return
  }
  if (productionReadOnly && routeAction.value !== 'place_order') {
    routeError.value = 'production-read-only'
    workspace.clear()
    return
  }
  routeError.value = ''
  const loaded = await workspace.ensureLoaded({
    workOrderId: routeId.value,
    workflowNodeId: routeNodeId.value,
    ...(routeAction.value ? { actionIntent: routeAction.value } : {}),
  })
  // The first reactive title update may run before uni-app has activated the
  // destination page in H5. Reapply after the actual action descriptor has
  // resolved AND the navigation DOM has committed. A late response for an
  // already-unloaded page or another workflow node may not change its title.
  if (loaded.state === 'succeeded' && contextVersion === journeyContextRequest) {
    await nextTick()
    if (contextVersion === journeyContextRequest && routeReady.value
      && session.status === 'authenticated'
      && String(workspace.descriptor?.workOrderId) === String(routeId.value)
      && String(workspace.descriptor?.workflowNodeId) === String(routeNodeId.value)) {
      setActionWorkspacePageTitle(workspaceNavigationTitle.value)
    }
  }
  if (loaded.state === 'succeeded' && routeQuotationOrderId.value && workspace.descriptor?.contentKind === 'quotation') {
    await workspace.loadQuotationOrderForEdit(routeQuotationOrderId.value)
  }
  const stage = mockJourney.value?.stage
  if (loaded.state === 'succeeded' && stage && stage !== 'appointment') {
    const context = await readMockJourneyContext(stage, (identity) => workspace.readSiblingActionDraft(identity))
    if (contextVersion === journeyContextRequest
      && session.status === 'authenticated'
      && String(workspace.descriptor?.workOrderId) === context?.workOrderId
      && mockJourney.value?.stage === stage) {
      localJourneyContext.value = context
    }
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
  routeReady.value = false
  journeyContextRequest += 1
  localJourneyContext.value = null
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

async function advanceJourney(): Promise<void> {
  const context = mockJourney.value
  if (!context || context.stage === 'quotation' || isNavigating.value) return
  isNavigating.value = true
  // Preserve what the technician typed as a local Action draft; do not issue
  // ExtForm upsert, Workflow Complete, upload, or official Order commands.
  const saved = await workspace.flushDraft()
  if (saved.state !== 'succeeded') {
    routeError.value = 'draft-save-failed'
    isNavigating.value = false
    return
  }
  if (!advanceMockJourneyContext(context.stage)) {
    routeError.value = 'mock-stage-save-failed'
    isNavigating.value = false
    return
  }
  await workspace.navigateToDetail()
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

.mock-signing-entry { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 14rpx; padding: 18rpx 20rpx; }
.mock-signing-entry__title { color: var(--app-color-primary); font-size: 24rpx; font-weight: 700; }
.mock-signing-entry__note { color: var(--app-color-text-secondary); font-size: 21rpx; line-height: 1.45; }
.mock-journey-progress { margin: 20rpx 24rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 12rpx; }
.mock-journey-progress__note { color: var(--app-color-text-secondary); font-size: 22rpx; line-height: 1.5; }
</style>
