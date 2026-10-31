<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备操作空间" />

  <view v-else-if="!canAccess" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">需要登录</text>
    <text class="workspace-state-copy">登录后才能处理当前工单。</text>
    <navigator class="workspace-state-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else-if="routeError || workspace.loadState === 'blocked'" class="workspace-state workspace-state--centered">
    <text class="workspace-state-title">当前操作暂不可用</text>
    <text class="workspace-state-copy">{{ routeError === 'production-read-only' ? '当前仅支持查看报价，其他操作尚未开放。' : '请返回工单详情，按当前任务继续操作。' }}</text>
    <AppButton class="workspace-state-action" @tap="exit">返回工单详情</AppButton>
  </view>

  <QuotationOrderHub
    v-else-if="quotationHubVisible"
    ref="quotationHubRef"
    :work-order-id="String(workspace.descriptor?.workOrderId ?? '')"
    :display-number="workspace.detail?.displayNumber"
    :customer-name="workspace.detail?.customerName"
    :local-draft-group-count="quotationComposition.groups.length"
    :local-draft-state="quotationComposition.localState"
    :read-only="productionReadOnly"
    :dev-mock-order="aStageMockOrderEnabled"
    :dev-mock-order-read="mockOrderRead"
    :dev-visual-sample="devQuotationOrderPreview"
    :dev-synthetic-unverified-amount="isDevSyntheticContractReadPreviewEnabled(String(workspace.descriptor?.workOrderId ?? ''))"
    @create="openQuotationEditor"
    @edit="openExistingQuotationEditor"
    @mode-change="quotationChoiceVisible = $event"
    @mock-read-retry="loadMockOrderRead"
  >
  </QuotationOrderHub>

  <QuotationActionWorkspace
    v-else-if="workspace.descriptor?.contentKind === 'quotation' && workspace.descriptor.actionIntent === 'place_order'"
    :content-state="quotationContentViewState"
    :product-review-only="isMockQuotationPreview"
    :a-stage-mock-order="aStageMockOrderEnabled"
    :sku-lineage-audit="skuLineagePreview"
    :same-catalog-lineage="sameCatalogLineagePreview"
    :synthetic-sku-readiness="syntheticSkuReadinessPreview"
    @retry="reload"
    @back="exit"
    @open-order-records="openQuotationOrderRecords"
  >
    <template #journey-context>
      <MockJourneyContextPanel
        v-if="localJourneyContext"
        :context="localJourneyContext"
        compact
        task-focus
        :can-adopt-suggestion="canAdoptSurveySuggestion"
        :suggestion-feedback="suggestionFeedback"
        @adopt-suggestion="adoptSurveySuggestion"
      />
    </template>
    <template #after-content>
      <AStageMockQuoteOrderPanel v-if="aStageMockOrderEnabled"
        :create-controller="createAStageMockQuoteOrderControllerForUi" />
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
    :commercial-survey="workspace.descriptor.formPurpose === 'survey'"
    :h5-navigation-fit="Boolean(workspace.appointmentForm)"
    :demo-survey="Boolean(localJourneyContext)"
    :lifecycle="workspace.lifecycle"
    :draft-status="workspace.draftStatus"
    :transitioning="isNavigating"
    :can-submit="workspace.canSubmit"
    :business-feedback="feedback"
    :submit-label="workspace.descriptor.formPurpose === 'survey' ? '完成勘查' : workspace.descriptor.actionIntent === 'interact_with_form' ? '完成' : '继续确认'"
    @submit="submitWorkspace"
  >
    <MockJourneyContextPanel v-if="localJourneyContext && workspace.descriptor.formPurpose !== 'survey'"
      :context="localJourneyContext" />
    <SurveyActionContent v-if="workspace.descriptor.actionIntent === 'interact_with_form' && workspace.descriptor.formPurpose === 'survey'" />
    <GenericDynamicFormActionContent v-else-if="workspace.descriptor.actionIntent === 'interact_with_form'" />
    <view v-else class="action-workspace-content app-surface" :data-field-count="workspace.appointmentFields.length">
      <AppActionContentHeading title="预约信息" caption="请与客户确认上门时间安排" icon="appointment" />

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

    <MockJourneyContextPanel v-if="localJourneyContext && workspace.descriptor.formPurpose === 'survey'"
      :context="localJourneyContext" compact />

    <!-- DEV-only synthetic FormData/Process/readback; never a real Workflow write.
         The same 019 WorkOrderId is used by all three normal App pages. -->
    <view
      v-if="mockJourney && mockJourney.stage !== 'quotation'"
      class="mock-journey-progress app-surface"
      data-testid="mock-journey-progress"
    >
      <text class="mock-journey-progress__note">完成当前步骤后，可继续处理后续任务。</text>
      <text class="mock-journey-progress__note" data-testid="mock-journey-save-state">
        {{ workspace.draftStatus === 'saved_local' || workspace.draftStatus === 'restore_available'
          ? '已保存，可继续下一步'
          : '填写信息并保存后，即可继续下一步' }}
      </text>
      <text v-if="journeyFeedback" class="mock-journey-progress__error" role="alert"
        data-testid="mock-journey-feedback">{{ journeyFeedback }}</text>
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
        :hint="workspace.descriptor.formPurpose === 'survey' && !workspace.canSubmit ? '当前填写或权限条件未满足，暂不能完成勘查' : undefined"
        @submit="requestSurveyCompletion"
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

  <SurveyCompleteConfirmation v-if="surveyConfirmOpen"
    :can-submit="workspace.canSubmit"
    :submitting="workspace.lifecycle === 'submitting'"
    @cancel="surveyConfirmOpen = false"
    @confirm="confirmSurveyCompletion"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'

import { isBusinessMockQuotationPreview, isDevSyntheticContractReadPreviewEnabled } from '@app/business-mock'
import { compareQuoteWithStandaloneSkuDemo, compareQuoteWithSameCatalogSyntheticSku } from '@app/quotation-sku-identity-evidence'
import { reviewP1SyntheticSkuReadiness } from '@app/p1-sku-readiness-review'
import { setActionWorkspacePageTitle } from '@app/action-page-title'
import { mockJourneyContext } from '@app/mock-journey'
import { readAStageMockOrderForActor, isAStageMockOrderEnabled,
  createAStageMockQuoteOrderControllerForActor } from '@app/a-stage-quotation-mock-ui'
import type { AStageMockQuoteOrderControllerFactory } from '@features/work-orders/quotation/a-stage-mock-quote-port'
import { advanceMockJourneyWithSavedDraft } from '@app/mock-journey-closure'
import { readMockJourneyContext, type MockJourneyContextSummary } from '@app/mock-journey-context'
import { canAdoptMockSurveySuggestion } from '@app/mock-journey-quote-suggestion'
import AStageMockQuoteOrderPanel from '@features/work-orders/quotation/AStageMockQuoteOrderPanel.vue'
import { hasAuthenticatedSession } from '@features/home/access'
import { isProductionReadOnlyRuntime } from '@shared/config'
import {
  parseActionWorkspaceId,
  parseActionWorkspaceNodeId,
  useActionWorkspaceStore,
} from '@features/work-orders/action-workspace'
import QuotationActionWorkspace from '@features/work-orders/quotation/QuotationActionWorkspace.vue'
import QuotationOrderHub from '@features/work-orders/quotation/QuotationOrderHub.vue'
import { useQuotationCompositionStore } from '@features/work-orders/quotation/composition-store'
import { appointmentDisplayFor } from '@features/work-orders/appointment-time'
import { isMultilineField } from '@features/work-orders/form-presentation'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceFormActions from '@shared/ui/ActionWorkspaceFormActions.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import GenericDynamicFormActionContent from '@features/work-orders/components/GenericDynamicFormActionContent.vue'
import SurveyActionContent from '@features/work-orders/components/SurveyActionContent.vue'
import SurveyCompleteConfirmation from '@features/work-orders/components/SurveyCompleteConfirmation.vue'
import MockJourneyContextPanel from '@features/work-orders/components/MockJourneyContextPanel.vue'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
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
import type { QuotationOrderBrowseItem } from '@shared/ports'

const createAStageMockQuoteOrderControllerForUi: AStageMockQuoteOrderControllerFactory =
  createAStageMockQuoteOrderControllerForActor
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
const routeQuotationEntry = ref<string | undefined>(undefined)
const routeQuotationVisualSample = ref<'orders' | 'empty' | undefined>()
const devQuotationOrderPreview = computed(() =>
  import.meta.env.DEV && isMockQuotationPreview.value && !productionReadOnly
    ? routeQuotationVisualSample.value : undefined,
)
const quotationEditorOpened = ref(false)
const quotationHubRef = ref<{ finishEdit: (message?: string) => void } | null>(null)
const quotationChoiceVisible = ref(false)
const quotationHubVisible = computed(() =>
  routeQuotationEntry.value === 'orders' && !quotationEditorOpened.value
  && !routeQuotationOrderId.value && workspace.descriptor?.contentKind === 'quotation'
  && workspace.descriptor.actionIntent === 'place_order',
)
function openQuotationEditor(): void {
  if (productionReadOnly || !quotationHubVisible.value) return
  quotationEditorOpened.value = true
}
function openQuotationOrderRecords(): void {
  // This is a local view switch only. A draft is never promoted to an Order;
  // the hub will make its own currently scoped bounded Order read.
  if (!canAccess.value || workspace.descriptor?.contentKind !== 'quotation'
    || workspace.descriptor.actionIntent !== 'place_order'
    || !workspace.descriptor.workOrderId || !quotationComposition.draft
    || String(quotationComposition.draft.workOrderId) !== String(workspace.descriptor.workOrderId)) return
  routeQuotationEntry.value = 'orders'
  routeQuotationOrderId.value = undefined
  quotationChoiceVisible.value = false
  quotationEditorOpened.value = false
}
async function openExistingQuotationEditor(orderId: string): Promise<void> {
  if (productionReadOnly || !quotationHubVisible.value || !orderId.trim()) return
  const result = await workspace.loadQuotationOrderForEdit(orderId)
  if (result.state === 'succeeded') {
    quotationEditorOpened.value = true
  } else {
    quotationHubRef.value?.finishEdit(
      workspace.quotationEditState.message || '未能安全恢复该订单；已保留服务器记录与当前草稿。',
    )
  }
}
const routeError = ref('')
const isNavigating = ref(false)
const localJourneyContext = ref<MockJourneyContextSummary | null>(null)
const suggestionFeedback = ref('')
const journeyFeedback = ref('')
let journeyContextRequest = 0

const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const productionReadOnly = isProductionReadOnlyRuntime()
const appointmentDisplay = computed(() => appointmentDisplayFor(workspace.appointmentTimeValue))
const isMockQuotationPreview = computed(() =>
  isBusinessMockQuotationPreview(workspace.descriptor?.workOrderId),
)
const aStageMockOrderEnabled = computed(() => !productionReadOnly && isAStageMockOrderEnabled({
  workOrderId: String(workspace.descriptor?.workOrderId ?? ''),
  userId: String(session.session?.user.id ?? ''),
  roleId: String(session.session?.currentRole?.id ?? ''),
}))
const mockOrderRead = ref<{ readonly state: 'loading' | 'confirmed' | 'unavailable' | 'blocked';
  readonly order?: QuotationOrderBrowseItem }>({ state: 'loading' })
let mockOrderReadRevision = 0
async function loadMockOrderRead(): Promise<void> {
  const ticket = ++mockOrderReadRevision
  mockOrderRead.value = { state: 'loading' }
  if (!aStageMockOrderEnabled.value || !quotationHubVisible.value) return
  const result = await readAStageMockOrderForActor(() => {
      const current = session.session
      return current?.user.id && current.currentRole?.id && current.sessionRef
        ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
            identity: JSON.stringify([current.sessionRef, current.user.id,
              current.currentRole.id, current.roleVersion ?? null]) } : null
    })
  if (ticket === mockOrderReadRevision && aStageMockOrderEnabled.value
    && quotationHubVisible.value) mockOrderRead.value = result
}
watch(() => [aStageMockOrderEnabled.value, quotationHubVisible.value,
  session.session?.sessionRef, session.session?.currentRole?.id,
  session.session?.roleVersion] as const, () => { void loadMockOrderRead() }, { immediate: true })
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
    ? '已加入报价草稿。请补充部位描述、工程量及报价项目。'
    : '未能采用建议，请手动创建报价部位。'
}

const quotationContentViewState = computed(() => workspace.quotationContentState === 'idle'
  ? 'loading'
  : workspace.quotationContentState)

const workspaceNavigationTitle = computed(() => {
  if (quotationHubVisible.value) return quotationChoiceVisible.value ? '选择下单方式' : '订单管理'
  if (routeAction.value === 'place_order' || workspace.descriptor?.contentKind === 'quotation') {
    return routeQuotationOrderId.value || workspace.quotationEditState.state === 'ready' ? '修改订单' : '新增订单'
  }
  if (workspace.descriptor?.formPurpose === 'survey') return '现场勘查'
  // A denied legacy route has no verified descriptor, so keep the requested
  // form intent visible without claiming its survey purpose was authorized.
  if (routeAction.value === 'interact_with_form' || workspace.descriptor?.actionIntent === 'interact_with_form') return '工单表单'
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
    // Only the explicit DEV synthetic tour may open a local, read-only form
    // preview. The Store enforces the exact MOCK-019 + build-level gate again.
    ...(mockJourney.value && !productionReadOnly && mockJourney.value.stage !== 'quotation'
      ? { localPreviewOnly: true } : {}),
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
  routeQuotationEntry.value = options?.entry === 'orders' && routeAction.value === 'place_order' ? 'orders' : undefined
  // Route opt-in only. This is a UX screenshot fixture, not an authoritative Order.
  routeQuotationVisualSample.value = import.meta.env.DEV
    && (options?.q00Preview === 'orders' || options?.q00Preview === 'empty')
      ? options.q00Preview : undefined
  quotationEditorOpened.value = false
  quotationChoiceVisible.value = false
  routeReady.value = true
})

// Native back from the time/confirmation pages shows this mounted page again.
// Releasing the navigation lock here preserves the draft without stranding its controls.
onShow(() => {
  isNavigating.value = false
})

onUnload(() => {
  routeReady.value = false
  mockOrderReadRevision += 1
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
  const stage = context.stage
  isNavigating.value = true
  journeyFeedback.value = ''
  // Preserve the Action draft first. The DEV Mock handoff performs synthetic
  // FormData → Workflow commands with exact readback; never a real write.
  const saved = await workspace.flushDraft()
  if (saved.state !== 'succeeded') {
    journeyFeedback.value = '记录保存失败，当前节点未改变。请重试。'
    isNavigating.value = false
    return
  }
  const next = await advanceMockJourneyWithSavedDraft(stage,
    (identity) => workspace.readSiblingActionDraft(identity),
    () => workspace.isCurrentMockJourneyScope(stage))
  if (next.state !== 'advanced') {
    journeyFeedback.value = next.reason === 'missing_draft'
      ? '尚无已保存的表单记录。请填写内容并保存后继续。'
      : next.reason === 'read_failed'
        ? '记录读取失败，节点未改变。请重试。'
        : next.reason === 'protocol_failed'
          ? '表单或流程校验未通过，当前节点未改变。请刷新后重试。'
        : '当前账号或处理阶段已改变，请返回工单重新进入。'
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

const surveyConfirmOpen = ref(false)

function requestSurveyCompletion(): void {
  if (workspace.descriptor?.formPurpose === 'survey') {
    if (workspace.canSubmit && workspace.lifecycle !== 'submitting') surveyConfirmOpen.value = true
    return
  }
  void submitWorkspace()
}

async function confirmSurveyCompletion(): Promise<void> {
  if (!surveyConfirmOpen.value || !workspace.canSubmit || workspace.lifecycle === 'submitting') return
  surveyConfirmOpen.value = false
  await submitWorkspace()
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

.mock-journey-progress { margin: 20rpx 24rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 12rpx; }
.mock-journey-progress__note { color: var(--app-color-text-secondary); font-size: 22rpx; line-height: 1.5; }
.mock-journey-progress__error { color: var(--app-color-danger); font-size: 24rpx; line-height: 1.5; }
</style>
