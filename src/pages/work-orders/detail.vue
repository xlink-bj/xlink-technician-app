<template>
  <AppLoadingState v-if="session.status === 'unknown'" label="正在准备工单详情" />

  <view v-else-if="!canAccess" class="guard-page">
    <view class="guard-mark" aria-hidden="true"><AppIcon name="contact" :size="24" color="var(--detail-guard-icon)" /></view>
    <text class="guard-title">需要登录</text>
    <text class="guard-copy">登录后查看当前账号可见的工单详情。</text>
    <navigator class="back-link" url="/pages/index/index">返回登录</navigator>
  </view>

  <view v-else class="detail-page" :class="{ 'detail-page--appointment-editing': appointmentArchiveEditing }">
    <AppWorkOrderSkeleton v-if="showLoadingSkeleton" variant="detail" />

    <AppFeedbackState
      v-else-if="workOrder.loadState === 'failed_retryable'"
      layout="detail" appearance="retry"
      title="暂时无法加载详情"
      description="请检查网络后重试。"
      action-label="重新加载"
      @action="retry"
    />
    <AppFeedbackState
      v-else-if="workOrder.loadState === 'failed_terminal'"
      layout="detail" appearance="error"
      title="工单详情暂不可用"
      :description="failureCopy"
      action-label="再次尝试"
      @action="retry"
    />
    <AppFeedbackState
      v-else-if="workOrder.loadState === 'succeeded' && detail && preAcceptBlocked"
      layout="detail" appearance="blocked"
      title="工单待接单"
      description="接单后可查看工单详情。"
    />

    <view v-else-if="workOrder.loadState === 'succeeded' && detail" class="detail-content">
      <template v-if="readView === 'home'">
      <view class="app-record-card summary-card" data-testid="ds02b-detail-record-card">
        <view class="summary-card__content">
        <view class="summary-top-row">
          <view class="summary-identity">
            <view class="summary-copy">
              <view v-if="detail.customerName || detail.servicePartLabel" class="summary-title-row">
                <text v-if="detail.customerName" class="summary-customer">{{ detail.customerName }}</text>
                <AppMetaTag v-if="detail.servicePartLabel" class="part-badge" :label="detail.servicePartLabel" />
              </view>
            </view>
          </view>
          <text v-if="detail.displayNumber" class="summary-number">{{ workOrderNumberDisplay(detail.displayNumber) }}</text>
        </view>

        <view
          v-if="detail.serviceDistrict || detail.serviceAddress || detail.distanceText"
          class="location-row"
        >
          <text v-if="detail.serviceDistrict" class="location-district">{{ detail.serviceDistrict }}</text>
          <text v-if="detail.serviceDistrict && detail.serviceAddress" class="location-space"> </text>
          <text v-if="detail.serviceAddress" class="location-address">{{ detail.serviceAddress }}</text>
          <text v-if="detail.distanceText" class="location-distance">{{ detail.distanceText }}</text>
        </view>

        <view class="summary-actions" aria-label="快捷操作">
          <button
            v-for="action in visibleQuickActions"
            :key="action.key"
            class="summary-action"
            :class="{ 'summary-action--disabled': action.key === 'contact' && !canDial }"
            :disabled="action.key === 'contact' && (!canDial || workOrder.contactInFlight)"
            @tap="handleQuickAction(action.key)"
          >
            <AppIcon
              :name="action.icon"
              size="var(--detail-action-icon-size, 15px)"
              :color="action.key === 'contact' && !canDial ? 'var(--detail-action-icon-disabled)' : 'var(--detail-action-icon)'"
              aria-hidden="true"
            />
            <text>{{ workOrder.contactInFlight && action.key === 'contact' ? '打开中' : action.label }}</text>
          </button>
        </view>
        <AppStatus
          v-if="productionReadOnly"
          class="production-read-only-notice"
          message="当前工单仅可查看，业务操作暂未开放。"
          tone="warning"
          quiet
          data-testid="production-read-only-notice"
        />
        <text v-if="!canDial && detail.contact" class="action-hint">暂无可直接拨打的客户电话</text>
        <text v-if="contactFeedback || actionFeedback" class="action-feedback">{{ contactFeedback || actionFeedback }}</text>
        </view>
      </view>

      <view v-if="workflowProjection.currentTask"
        :data-testid="normalWorkspaceEntry ? 'normal-form-workspace-entry' : devMockDynamicFormNodeKind ? 'special-form-workspace-entry' : undefined">
      <WorkOrderTaskFocus
        :title="workflowProjection.currentTask.title"
        :action-label="currentTaskActionLabel"
        :tone="workflowProjection.currentTask.tone"
        :disabled="(workflowProjection.currentTask.execution !== 'enabled' && !allowLocalMockPreview && !normalWorkspaceEntry && !devMockDynamicFormNodeKind)
          || (productionReadOnly && workflowProjection.currentTask.actionIntent !== 'place_order')"
        :note="devMockDynamicFormNodeKind ? '在表单工作台填写并核对现场记录。' : productionReadOnly ? '当前仅可查看，业务操作暂未开放。' : undefined"
        @action="handleCurrentTaskAction"
      />

      </view>


      <view v-if="devMockCompletedDynamicFormNode && completedDevMockDynamicFormReceiptGate?.status === 'pending'" class="app-surface">
        <AppStatus tone="warning" quiet message="上次操作结果待核对，请进入原表单工作台查看。" />
        <AppButton data-testid="special-receipt-workspace-entry" @tap="openDevMockDynamicFormReceipt">查看待核对记录</AppButton>
      </view>
      <AppStatus v-if="devMockCompletedDynamicFormNode && completedDevMockDynamicFormReceiptGate?.status === 'clear'" tone="success" quiet
        message="现场记录已完成，可重新进入查看。"
        data-testid="a-special-complete" />
      <AppStatus v-else-if="devMockCompletedDynamicFormNode && completedDevMockDynamicFormReceiptGate?.status === 'checking'"
        tone="warning" quiet message="正在核对现场记录状态…" data-testid="a-special-completion-checking" />
      <AppStatus v-else-if="devMockCompletedDynamicFormNode && completedDevMockDynamicFormReceiptGate?.status === 'unavailable'"
        tone="warning" quiet message="现场记录状态暂无法核对，请重新读取工单后再试。"
        data-testid="a-special-completion-unverified" />
      <AppButton v-if="devMockCompletedDynamicFormNode && completedDevMockDynamicFormReceiptGate?.status === 'clear'"
        data-testid="special-completed-workspace-entry" variant="secondary" @tap="openDevMockDynamicFormReceipt">查看已完成记录</AppButton>
      </template>
      <!-- #ifdef XLINK_DEV_QA -->
      <AppButton v-if="readView === 'home' && constructionMockEnabled(String(detail.id))" variant="secondary"
        data-testid="construction-read-entry" @tap="openConstructionRead">查看施工日志</AppButton>
      <MaterialFulfillmentPanel v-if="materialFulfillmentVisible"
        :state="materialFulfillmentState" @read="readMaterialFulfillment" />
      <!-- #ifdef H5 -->
      <MaterialFulfillmentWorkflow v-if="materialWorkflowScope()"
        :display-number="workOrderNumberDisplay(detail.displayNumber)"
        :current-scope="materialWorkflowScope" :bind-workflow="bindDevMaterialWorkflow" />
      <!-- #endif -->
      <!-- #endif -->
      <WorkOrderArchiveCards v-if="readView === 'home'"
        :work-order-id="String(detail.id)" :activities="activities"
        :follow-up-message="followUpReadMessage(detail)" :follow-up-read-failed="detail.activityReadState === 'failed'" :has-history="canShowHistoricalForms"
        :customer-summary="detail.informationFields === undefined ? (detail.customerName || '查看本次服务资料') : `${informationRows.length} 项可查看资料`"
        :archives="hasOrderArchive ? [orderArchiveSummary(quotationBrowse.page)] : []" :order-state="quotationBrowse.state"
        :order-error="quotationBrowse.errorMessage" @retry-orders="retryQuotationRead">
        <template #appointment>
          <AppointmentArchive v-if="appointmentNodes.length" :key="appointmentReadVersion" :work-order-id="String(detail.id)" :nodes="appointmentNodes"
            :read-revision="appointmentReadVersion"
            :actor-scope="workOrderReadScopeKey(session.session)" :summary="true" />
        </template>
        <!-- #ifdef XLINK_DEV_QA -->
        <template #service-results>
          <ServiceResultArchiveCards v-if="serviceArchiveCards.length" :cards="serviceArchiveCards" :record-route="openServiceArchiveRoute" />
        </template>
        <!-- #endif -->
      </WorkOrderArchiveCards>

      <!-- #ifdef XLINK_DEV_QA -->
      <view v-else-if="readView === serviceArchiveMockView" data-testid="dev-service-archive-detail">
        <ServiceResultArchiveCards v-if="serviceArchiveCards.length" :cards="serviceArchiveCards" show-details :retry="retryServiceArchive" />
        <AppStatus v-else tone="warning" quiet message="当前工单档案不可查看。" />
      </view>
      <!-- #endif -->
      <view v-else-if="readView === 'appointment'">
        <AppointmentArchive ref="appointmentReadArchive" :key="appointmentReadVersion" :work-order-id="String(detail.id)" :nodes="appointmentNodes"
          :read-revision="appointmentReadVersion"
          :actor-scope="workOrderReadScopeKey(session.session)" :summary="false" :node-id="selectedAppointmentNodeId" :record-id="selectedAppointmentRecordId"
          :workspace-context="{ customerName: detail.customerName, displayNumber: workOrderNumberDisplay(detail.displayNumber),
            serviceDistrict: detail.serviceDistrict, serviceAddress: detail.serviceAddress }"
          @edit-mode-change="setAppointmentArchiveEditing" />
      </view>

      <view v-else class="app-record-card information-card">
        <view class="archive-detail-heading" :class="{ 'customer-read-heading': readView === 'customer' }">
          <text class="tab-empty-title">{{ readView === 'follow-up' ? '全部跟进记录' : readView === 'customer' ? '客户资料' : '正式订单 · 只读' }}</text>
          <AppButton v-if="readView === 'customer'" variant="text" size="compact"
            data-testid="customer-information-refresh" @tap="refreshCustomerInformation">重新读取</AppButton>
        </view>

        <view v-if="readView === 'follow-up'" class="tab-panel">
          <view v-if="activities.length > 0" class="activity-list">
            <view v-for="(activity, index) in activities" :key="activity.id" class="activity-item">
              <view class="activity-rail" aria-hidden="true">
                <view class="activity-icon" :class="`activity-icon--${activity.tone}`">
                  <AppIcon :name="activity.icon" :size="14" color="var(--app-color-surface)" />
                </view>
                <view v-if="index < activities.length - 1" class="activity-line" />
              </view>
              <view class="activity-body">
                <view class="activity-heading">
                  <text class="activity-title">{{ activity.title }}</text>
                  <text
                    v-if="activity.badge !== '系统'"
                    class="activity-badge"
                    :class="`activity-badge--${activity.tone}`"
                  >
                    {{ activity.badge }}
                  </text>
                </view>
                <text v-if="activity.content" class="activity-copy">{{ activity.content }}</text>
                <text class="activity-meta">{{ activity.owner }} · {{ activity.time }}</text>
              </view>
            </view>
          </view>
          <view v-if="followUpReadMessage(detail)" class="tab-empty">
            <text class="tab-empty-title">{{ followUpReadMessage(detail) }}</text>
          </view>
      <!-- Current source-backed forms/repeat node only; Production repeat reads
           a bounded list after an explicit tap and never exposes write actions. -->
      <R1ProductionMainRepeatPanel
        v-if="productionReadOnly && currentR1FormNode?.sourceNodeType === 'repeat'"
        :node="currentR1FormNode" :read="workOrder.mainRepeatRead"
        @read="loadMainRepeatForms" />
      <R1ProductionChildFormsPanel
        v-if="productionReadOnly && productionChildParents.length"
        :parents="productionChildParents"
        :selected-parent-id="workOrder.childReadParentId"
        :nodes="workOrder.childReadNodes"
        :state="workOrder.childReadState"
        :error="workOrder.childReadError"
        :repeat-by-node="workOrder.repeatReadByNode"
        @load-child="loadChildForms"
        @load-repeat="loadRepeatForms"
      />

          <HistoricalFormsTimeline v-if="canShowHistoricalForms" :work-order-id="String(detail.id)"
            :actor-scope="workOrderReadScopeKey(session.session)" />
        </view>

        <view v-else-if="readView === 'customer'" class="tab-panel customer-info-panel">
          <template v-if="detail.informationFields !== undefined">
            <view v-for="row in informationRows" :key="row.field.fieldId" class="detail-row customer-info-row" data-testid="configured-information-row">
              <text class="row-label">{{ row.field.label }}</text>
              <text class="row-value customer-info-value customer-info-value--address">{{ row.field.unsupportedReason ? '该内容暂不支持展示' : r1ReadFieldDisplayValue(row.field, row.value) }}</text>
            </view>
            <text v-if="!informationRows.length" class="tab-empty-copy">暂无可展示资料</text>
          </template>
          <template v-else>
            <view class="detail-row customer-info-row">
              <text class="row-label">客户姓名</text>
              <text class="row-value customer-info-value">{{ detail.customerName || '—' }}</text>
            </view>
            <view class="detail-row customer-info-row customer-info-row--address">
              <text class="row-label">服务地址</text>
              <text class="row-value customer-info-value customer-info-value--address">{{ customerServiceAddress }}</text>
            </view>
            <view class="detail-row customer-info-row">
              <text class="row-label">联系电话</text>
              <text class="row-value customer-info-value">{{ detail.contact?.displayMask || '—' }}</text>
            </view>
          </template>
        </view>

        <view v-if="readView === 'customer'" class="tab-panel order-info-panel">
          <view class="order-info-heading">
            <text>工单信息</text>
          </view>
          <view class="order-info-list">
            <view class="detail-row order-info-row" v-if="detail.displayNumber && !informationRows.some(row => row.field.preset && row.field.valueKey === 'orderNum')">
              <text class="row-label">工单编号</text>
              <text class="row-value order-info-value">{{ workOrderNumberDisplay(detail.displayNumber) }}</text>
            </view>
            <view class="detail-row order-info-row" v-if="detail.taskLabel">
              <text class="row-label">当前状态</text>
              <text class="row-value order-info-value" :class="`row-value--${workOrderCardToneFor(detail.taskLabel)}`">
                {{ detail.taskLabel }}
              </text>
            </view>
            <view class="detail-row order-info-row" v-if="detail.servicePartLabel">
              <text class="row-label">服务部位</text>
              <text class="row-value order-info-value">{{ detail.servicePartLabel }}</text>
            </view>
            <view class="detail-row order-info-row" v-if="detail.distanceText">
              <text class="row-label">距离</text>
              <text class="row-value order-info-value">{{ detail.distanceText }}</text>
            </view>
          </view>
        </view>

        <view v-if="readView === 'quotation'" class="tab-panel quotation-read-panel" data-testid="production-quotation-read-panel">
          <view v-if="!orderArchiveSummary(quotationBrowse.page).complete" class="quotation-read-intro">
            <text class="tab-empty-copy">当前仅展示已读取的订单，完整数量待确认。</text>
          </view>
          <view v-if="quotationBrowse.state === 'loading'" class="quotation-read-state" data-testid="quotation-read-loading">
            <AppLoadingState variant="inline" label="正在读取正式订单" />
          </view>
          <view v-else-if="quotationBrowse.state === 'failed_retryable' || quotationBrowse.state === 'failed_terminal'" class="quotation-read-state" data-testid="quotation-read-error">
            <text class="tab-empty-copy">{{ quotationBrowse.errorMessage }}</text>
            <button class="state-action quotation-retry" @tap="retryQuotationRead">重新读取</button>
          </view>
          <view v-else-if="quotationBrowse.state === 'idle'" class="quotation-read-state">
            <button class="state-action quotation-retry" @tap="loadQuotationRead">读取该工单正式订单</button>
          </view>
          <view v-else-if="matchingQuotationOrders.length === 0" class="tab-empty" data-testid="quotation-read-empty">
            <text class="tab-empty-title">{{ selectedOrderId ? '这笔订单暂不可查看' : orderArchiveSummary(quotationBrowse.page).complete ? '尚未产生正式订单' : '暂未读取到订单记录' }}</text>
          </view>
          <view v-else class="quotation-read-list">
            <view v-for="order in matchingQuotationOrders" :key="order.id" class="quotation-read-card" data-testid="quotation-read-record">
              <view class="quotation-read-heading">
                <text class="quotation-read-number">{{ order.displayNumber ? `订单 ${order.displayNumber}` : '正式订单' }}</text>
                <text v-if="order.updateTime" class="quotation-read-date">{{ order.updateTime }}</text>
              </view>
              <text class="quotation-read-readonly">后台订单记录 · 仅供查看</text>
              <text v-if="order.totalPrice !== undefined" class="quotation-read-total">订单金额：¥{{ order.totalPrice.toFixed(2) }}</text>
              <text class="quotation-read-meta" data-testid="child-order-construction-progress">本订单施工进展：{{ childOrderConstructionProgress(String(detail?.id ?? ''), order) }}</text>
              <view v-if="order.groups.length === 0" class="quotation-read-warning">
                <text>报价分组内容暂不可识别，已保留只读状态。</text>
              </view>
              <view v-for="(group, groupIndex) in order.groups" :key="`${order.id}-group-${groupIndex}`" class="quotation-read-group">
                <text class="quotation-read-group-title">{{ group.partDescription || `维修部位 ${groupIndex + 1}` }}</text>
                <text v-if="group.maintainAreaNum" class="quotation-read-meta">工程量：{{ group.maintainAreaNum }}</text>
                <view v-for="row in quotationLineRows(group)" :key="`${order.id}-${groupIndex}-${row.key}`" class="quotation-read-line" :class="{ 'quotation-read-line--nested': row.depth > 0 }">
                  <view class="quotation-read-line-main">
                    <text class="quotation-read-line-kind">{{ quotationKindLabel(row.line.kind) }}</text>
                    <text class="quotation-read-line-label">{{ row.line.label }}</text>
                  </view>
                  <text class="quotation-read-meta">
                    {{ row.line.quantity === undefined ? '' : `数量：${row.line.quantity}${row.line.unit ? ` ${displayUnit(row.line.unit)}` : ''}` }}{{ row.line.unitPrice === undefined ? '' : ` · 单价：¥${row.line.unitPrice.toFixed(2)}` }}{{ row.line.lineTotal === undefined ? '' : ` · 小计：¥${row.line.lineTotal.toFixed(2)}` }}
                  </text>
                </view>
                <text v-if="!group.contentSupported" class="quotation-read-warning">该分组含未识别字段，以上仅为可确认内容。</text>
              </view>
              <navigator
                v-if="isSigningReadOrderCandidate(order) && signingOrderReadRouteFor(String(detail?.id ?? ''), order.id)"
                class="state-action quotation-retry"
                :url="signingOrderReadRouteFor(String(detail?.id ?? ''), order.id) || undefined"
                data-testid="production-signing-order-read-entry"
              >
                查看签约信息
              </navigator>
              <text v-else class="quotation-read-warning" data-testid="production-signing-order-read-unavailable">
                {{ unavailableSigningReadReason(order.state) }}
              </text>
            </view>
          </view>
        </view>

      </view>

    </view>

    <view v-else-if="workOrder.loadState === 'loading'" class="detail-loading-placeholder" aria-hidden="true" />

    <AppLoadingState v-else variant="inline" label="正在准备工单详情" />
  </view>
</template>

<script setup lang="ts">
import { evaluateVisibility } from '@runtimes/dynamic-form'
import { r1ReadFieldDisplayValue } from '@features/work-orders/r1-record-read-fields'
import { onSelectedRoleVisibilityRevoked } from '@shared/form/selected-role-visibility'
import { computed, inject as injectHistoryReader, onBeforeUnmount, ref, watch } from 'vue'
import { onBackPress, onLoad, onShow } from '@dcloudio/uni-app'
import { setActionWorkspacePageTitle as setDetailPageTitle } from '@app/action-page-title'

import { mockJourneyContext } from '@app/mock-journey'
import { hasAuthenticatedSession } from '@features/home/access'
import { isProductionReadOnlyRuntime } from '@shared/config'
import { workOrderNumberDisplay } from '@shared/ui/work-order-number-display'
import { workOrderCardToneFor } from '@features/work-orders/card'
import { parseWorkOrderId, useWorkOrderDetailStore } from '@features/work-orders/detail'
import { actionWorkspaceRouteFor } from '@features/work-orders/action-workspace'
import { childOrderConstructionProgress, detailReadView, detailReadTitle, detailReadRoute, followUpReadMessage, orderArchiveSummary, type DetailReadView } from '@features/work-orders/detail-archive'
// #ifdef XLINK_DEV_QA
import { constructionMockEnabled } from '@app/dev-construction-read'
import {
  readServiceArchiveMock, serviceArchiveMockRequest, serviceArchiveMockRoute, serviceArchiveMockTitle,
  serviceArchiveMockRequestForHash, serviceArchiveMockView, type ServiceArchiveMockRequest,
} from '@app/dev-service-result-archives'
import { onHide } from '@dcloudio/uni-app'
import ServiceResultArchiveCards from '@features/work-orders/ServiceResultArchiveCards.vue'
import type { ServiceResultArchiveKind } from '@features/work-orders/detail-archive'
import { isMaterialFulfillmentMockAvailable, materialFulfillmentMock } from '@app/dev-material-fulfillment-read'
import MaterialFulfillmentPanel from '@features/work-orders/downstream/MaterialFulfillmentPanel.vue'
import { useMaterialFulfillmentRead } from '@features/work-orders/downstream/material-fulfillment-read'
import { useWorkOrderListStore } from '@features/work-orders/list'
// #ifdef H5
import { bindDevMaterialWorkflow, isDevMaterialWorkflowActor } from '@app/dev-material-fulfillment-workflow'
import MaterialFulfillmentWorkflow from '@features/work-orders/downstream/MaterialFulfillmentWorkflow.vue'
// #endif
// #endif
import WorkOrderArchiveCards from '@features/work-orders/WorkOrderArchiveCards.vue'
import AppointmentArchive from '@features/work-orders/AppointmentArchive.vue'
import {appointmentArchiveNodes} from '@features/work-orders/appointment-archive'
import { detailTaskActionLabelFor, detailWorkflowUiProjectionFor } from '@features/work-orders/detail-workflow'
import { selectActionWorkspaceLoadTarget } from '@features/work-orders/action-workspace-load-target'
import { useLocalUnitDisplay } from '@features/work-orders/quotation/local-unit-display'
import { quotationBrowseLineRows, useQuotationOrderBrowseStore } from '@features/work-orders/quotation/order-browse-store'
import { signingOrderReadRouteFor } from '@features/work-orders/signing/signing-review-read-workspace'
import { isSigningReadOrderCandidate, unavailableSigningReadReason } from '@shared/signing-order-read-policy'
import type { QuotationOrderBrowseGroup, QuotationOrderBrowseKind } from '@shared/ports'
import { useSessionStore } from '@shared/state'
import { workOrderReadScopeKey } from '@features/work-orders/read-identity-scope'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import AppMetaTag from '@shared/ui/AppMetaTag.vue'
import AppFeedbackState from '@shared/ui/AppFeedbackState.vue'
import AppWorkOrderSkeleton from '@shared/ui/AppWorkOrderSkeleton.vue'
import WorkOrderTaskFocus from '@features/work-orders/WorkOrderTaskFocus.vue'
import { r1NodeFormsReaderKey } from '@features/work-orders/r1-node-forms-read'
import HistoricalFormsTimeline from '@features/work-orders/HistoricalFormsTimeline.vue'
import { historicalFormsReaderKey } from '@features/work-orders/r1-historical-forms-read'
import { isDevMockDynamicFormAvailable, createDevMockDynamicFormControllerForActor, type DevMockDynamicFormNodeKind } from '@app/dev-mock-dynamic-form-controller'
import type { DevMockDynamicFormControllerFactory } from '@features/work-orders/dev-mock-dynamic-form-port'
import R1ProductionChildFormsPanel from '@features/work-orders/R1ProductionChildFormsPanel.vue'
import R1ProductionMainRepeatPanel from '@features/work-orders/R1ProductionMainRepeatPanel.vue'
import { appLoadingSkeletonDelayMs } from '@shared/ui/loading'

const createDevMockDynamicFormControllerForUi: DevMockDynamicFormControllerFactory =
  createDevMockDynamicFormControllerForActor
const session = useSessionStore()
const workOrder = useWorkOrderDetailStore()
const quotationBrowse = useQuotationOrderBrowseStore()
const routeReady = ref(false)
const routeValue = ref<unknown>(undefined)
const canAccess = computed(() => hasAuthenticatedSession(session.status, session.session))
const productionReadOnly = isProductionReadOnlyRuntime()
const detail = computed(() => workOrder.detail)
const appointmentNodes = computed(() => appointmentArchiveNodes(detail.value?.workflowNodes))
const hasOrderArchive = computed(() => detail.value?.workflowNodes?.some(node => node.nodeTypeEvidence === 'runtime_node_def' && node.sourceNodeType === 'placeOrder')
  || quotationBrowse.page?.items.some(order => order.serviceAppointmentId === String(detail.value?.id)))
const appointmentReadVersion = ref(0)
const selectedAppointmentNodeId = ref(''), selectedAppointmentRecordId = ref('')
const informationRoleRevision = ref(0)
watch(() => detail.value?.informationFields, (rows, _, onCleanup) => {
  const contexts = new Set(rows?.filter(row => row.field.visibility?.kind === 'role').map(row => row.field.roleVisibilityContext))
  const stops = [...contexts].map(context => onSelectedRoleVisibilityRevoked(context, () => { informationRoleRevision.value++ }))
  onCleanup(() => stops.forEach(stop => stop()))
}, { immediate: true, flush: 'sync' })
const informationRows = computed(() => {
  void informationRoleRevision.value
  void workOrderReadScopeKey(session.session)
  return detail.value?.informationFields?.filter(row => row.field.visibility?.kind !== 'role'
    || evaluateVisibility(row.field.visibility, {}, row.field.roleVisibilityContext).state === 'visible') ?? []
})
const displayUnit = useLocalUnitDisplay(() => String(detail.value?.id ?? ''))
const activities = computed(() => detail.value?.activities ?? [])
const hasHistoricalForms = computed(() => detail.value?.workflowNodes?.some(node =>
  node.sourceNodeType === 'forms' && node.lifecycle === 'closed') === true)
const historicalFormsEnabled = injectHistoryReader(historicalFormsReaderKey, null)?.().enabled() === true
const canShowHistoricalForms = computed(() => !productionReadOnly && historicalFormsEnabled && hasHistoricalForms.value)
const customerServiceAddress = computed(() => {
  const district = detail.value?.serviceDistrict?.trim()
  const address = detail.value?.serviceAddress?.trim()
  return [district, address].filter(Boolean).join(' ') || '—'
})
const workflowProjection = computed(() => detailWorkflowUiProjectionFor(detail.value, session.session))
const currentTaskActionLabel = computed(() => detailTaskActionLabelFor(workflowProjection.value.currentTask, {
  productionReadOnly,
  opensFormWorkspace: Boolean(normalWorkspaceEntry.value || devMockDynamicFormNodeKind.value),
}))
const currentR1FormNode = computed(() => {
  const task = workflowProjection.value.currentTask
  if (!task || (task.sourceNodeType !== 'forms' && task.sourceNodeType !== 'repeat')) return undefined
  return detail.value?.workflowNodes?.find(node => node.id === task.nodeId)
})
const normalReader = injectHistoryReader(r1NodeFormsReaderKey,null)
const normalWorkspaceEntry = computed(() => !productionReadOnly && normalReader?.enabled() === true
  && !allowLocalMockPreview.value
  && Boolean(currentR1FormNode.value?.formDefinitionId) && ['interact_with_form','set_appointment'].includes(workflowProjection.value.currentTask?.actionIntent??'')
  && ['enabled','disabled_read_only'].includes(workflowProjection.value.currentTask?.execution ?? '') && !devMockDynamicFormNodeKind.value)
const devMockDynamicFormNodeKind = computed<DevMockDynamicFormNodeKind | null>(() => {
  const source = currentR1FormNode.value?.sourceNodeType
  if (source !== 'forms' && source !== 'repeat' || productionReadOnly) return null
  const current = session.session
  const actor = current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) } : null
  return isDevMockDynamicFormAvailable(source, String(detail.value?.id ?? ''), actor)
    ? source : null
})
const devMockCompletedDynamicFormNode = computed(() => {
  if (productionReadOnly) return null
  const current = session.session
  const actor = current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) } : null
  return detail.value?.workflowNodes?.find(node =>
    (node.sourceNodeType === 'forms' || node.sourceNodeType === 'repeat')
      && node.lifecycle === 'closed'
      && isDevMockDynamicFormAvailable(node.sourceNodeType,
        String(detail.value?.id ?? ''), actor)) ?? null
})
type CompletedDevMockDynamicFormReceiptGate = {
  readonly nodeId: string
  readonly kind: DevMockDynamicFormNodeKind
  readonly status: 'checking' | 'pending' | 'clear' | 'unavailable'
}
const completedDevMockDynamicFormReceiptGate = ref<CompletedDevMockDynamicFormReceiptGate | null>(null)
let completedDevMockDynamicFormReceiptCheck = 0
watch(
  () => [devMockCompletedDynamicFormNode.value?.id ?? null, detail.value?.id ?? null,
    session.session?.sessionRef ?? null, session.session?.user.id ?? null,
    session.session?.currentRole?.id ?? null, session.session?.roleVersion ?? null] as const,
  async ([nodeId, workOrderId]) => {
    const check = ++completedDevMockDynamicFormReceiptCheck
    const node = devMockCompletedDynamicFormNode.value
    const kind = node?.sourceNodeType
    if (!nodeId || !workOrderId || !node || (kind !== 'forms' && kind !== 'repeat')) {
      completedDevMockDynamicFormReceiptGate.value = null
      return
    }
    const id = String(nodeId)
    completedDevMockDynamicFormReceiptGate.value = { nodeId: id, kind, status: 'checking' }
    const getActor = () => {
      const current = session.session
      return current?.user.id && current.currentRole?.id && current.sessionRef
        ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
            identity: JSON.stringify([current.sessionRef, current.user.id,
              current.currentRole.id, current.roleVersion ?? null]) }
        : null
    }
    if (!isDevMockDynamicFormAvailable(kind, String(workOrderId), getActor())) {
      if (check === completedDevMockDynamicFormReceiptCheck) {
        completedDevMockDynamicFormReceiptGate.value = { nodeId: id, kind, status: 'unavailable' }
      }
      return
    }
    try {
      const view = await createDevMockDynamicFormControllerForUi({
        kind, workOrderId: String(workOrderId), getActor,
      }).load()
      if (check === completedDevMockDynamicFormReceiptCheck) {
        completedDevMockDynamicFormReceiptGate.value = {
          nodeId: id, kind, status: view.receiptPending ? 'pending' : 'clear',
        }
      }
    } catch {
      if (check === completedDevMockDynamicFormReceiptCheck) {
        completedDevMockDynamicFormReceiptGate.value = { nodeId: id, kind, status: 'unavailable' }
      }
    }
  },
  { immediate: true },
)
const productionChildParents = computed(() => (productionReadOnly
  ? detail.value?.workflowNodes?.filter((node) => node.category === 'subworkflow'
    && ['subflows', 'subflow', 'subworkflow'].includes(node.sourceNodeType ?? '')) ?? []
  : []))
const allowLocalMockPreview = computed(() => {
  const stage = mockJourneyContext(String(detail.value?.id ?? ''))
  const task = workflowProjection.value.currentTask
  const currentDetail = detail.value
  const actor = session.session
  if (productionReadOnly || !stage || stage.stage === 'quotation' || !task || !currentDetail || !actor
    || task.actionIntent !== (stage.stage === 'appointment' ? 'set_appointment' : 'interact_with_form')
    || task.sourceNodeType !== 'forms' || task.execution !== 'disabled_read_only') return false
  // Use the Store's existing exact-019 read/local-draft eligibility for both
  // appointment and survey. This never upgrades Workflow command execution.
  return selectActionWorkspaceLoadTarget({
    detail: currentDetail, session: actor, currentTask: task,
    request: { workOrderId: currentDetail.id, workflowNodeId: task.nodeId,
      actionIntent: task.actionIntent, localPreviewOnly: true },
    devMockE2EBuildEnabled: import.meta.env.DEV === true
      && import.meta.env.VITE_XLINK_H5_MOCK_E2E === 'true',
  }).kind === 'ready'
})
const preAcceptBlocked = computed(() => Boolean(
  detail.value?.workflowNodes?.some((node) => node.category === 'accept' && node.lifecycle === 'active'),
))
type PageReadView = DetailReadView
  // #ifdef XLINK_DEV_QA
  | typeof serviceArchiveMockView
  // #endif
const readView = ref<PageReadView>('home')
// #ifdef XLINK_DEV_QA
const serviceArchiveRequest = ref<ServiceArchiveMockRequest | null>(null)
const serviceArchiveRetried = ref(false)
const serviceArchiveActor = computed(() => session.status === 'authenticated' ? workOrderReadScopeKey(session.session) : null)
watch([serviceArchiveRequest, serviceArchiveActor], () => { serviceArchiveRetried.value = false }, { flush: 'sync' })
const serviceArchiveCards = computed(() => {
  const id = parseWorkOrderId(routeValue.value)
  if (!serviceArchiveActor.value || !id || detail.value?.id !== id || workOrder.loadState !== 'succeeded') return []
  if (readView.value === serviceArchiveMockView && !serviceArchiveRequest.value) return []
  return readServiceArchiveMock(id, session.session, serviceArchiveRequest.value, serviceArchiveRetried.value)
})
function openServiceArchiveRoute(kind: ServiceResultArchiveKind, recordId: string): string {
  return serviceArchiveMockRoute(String(detail.value?.id ?? ''), kind, recordId)
}
function retryServiceArchive(): void {
  if (serviceArchiveRequest.value && serviceArchiveCards.value.some(card => card.state === 'failed')) serviceArchiveRetried.value = true
}
function syncServiceArchiveHash(): void {
  const id = parseWorkOrderId(routeValue.value)
  const next = id ? serviceArchiveMockRequestForHash(window.location.hash, id) : null
  const current = serviceArchiveRequest.value
  if (current?.kind === next?.kind && current?.recordId === next?.recordId) return
  serviceArchiveRequest.value = next
  updateDetailPageTitle()
}
function stopServiceArchiveHash(): void {
  if (typeof window !== 'undefined') window.removeEventListener('hashchange', syncServiceArchiveHash)
}
onHide(stopServiceArchiveHash)
onBeforeUnmount(stopServiceArchiveHash)
// #endif
// #ifdef XLINK_DEV_QA
const materialWorkOrderList = useWorkOrderListStore()
function materialFulfillmentScope() {
  const workOrderId = String(detail.value?.id ?? '')
  const actorScope = workOrderReadScopeKey(session.session)
  if (productionReadOnly || session.status !== 'authenticated' || !actorScope
    || readView.value !== 'home' || preAcceptBlocked.value || workOrder.loadState !== 'succeeded'
    || parseWorkOrderId(routeValue.value) !== workOrderId
    || !isMaterialFulfillmentMockAvailable(workOrderId, session.session)
    || !materialWorkOrderList.items.some(item => item.id === workOrderId)) return null
  return { workOrderId, actorScope }
}
const materialFulfillmentVisible = computed(() => materialFulfillmentScope() !== null)
const { state: materialFulfillmentState, read: readMaterialFulfillment } = useMaterialFulfillmentRead(
  materialFulfillmentScope,
  (id, mode) => materialFulfillmentMock.read(id, mode),
)
// #ifdef H5
function materialWorkflowScope() {
  return isDevMaterialWorkflowActor(session.session) ? materialFulfillmentScope() : null
}
// #endif
// #endif
const appointmentReadArchive = ref<InstanceType<typeof AppointmentArchive> | null>(null)
const appointmentArchiveContext = computed(() => {
  const workOrderId = parseWorkOrderId(routeValue.value)
  const actorScope = session.status === 'authenticated' ? workOrderReadScopeKey(session.session) : null
  const recordId = selectedAppointmentRecordId.value
  if (readView.value !== 'appointment' || !workOrderId || detail.value?.id !== workOrderId || !actorScope || !recordId) return null
  return JSON.stringify([actorScope, workOrderId, selectedAppointmentNodeId.value, recordId])
})
const appointmentEditorContext = ref<string | null>(null)
const appointmentArchiveEditing = computed(() => appointmentEditorContext.value !== null
  && appointmentEditorContext.value === appointmentArchiveContext.value)
watch(appointmentArchiveContext, () => {
  appointmentEditorContext.value = null
}, { flush: 'sync' })
function setAppointmentArchiveEditing(editing: boolean): void {
  appointmentEditorContext.value = editing ? appointmentArchiveContext.value : null
}
const selectedOrderId = ref('')
const matchingQuotationOrders = computed(() => orderArchiveSummary(quotationBrowse.page).items.filter(
  (order) => order.serviceAppointmentId === String(detail.value?.id ?? '') && (!selectedOrderId.value || order.id === selectedOrderId.value),
))
const showLoadingSkeleton = ref(false)
let loadingSkeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearLoadingSkeletonTimer(): void {
  if (loadingSkeletonTimer) clearTimeout(loadingSkeletonTimer)
  loadingSkeletonTimer = undefined
}

watch(
  () => workOrder.loadState,
  (state) => {
    clearLoadingSkeletonTimer()
    showLoadingSkeleton.value = false
    if (state === 'loading') {
      loadingSkeletonTimer = setTimeout(() => {
        if (workOrder.loadState === 'loading') showLoadingSkeleton.value = true
      }, appLoadingSkeletonDelayMs)
    }
  },
  { immediate: true },
)

onBeforeUnmount(clearLoadingSkeletonTimer)

watch(
  () => detail.value?.id ?? null,
  (id) => {
    // A read-only child view re-reads this same WorkOrder. A transient loading
    // null must not discard its archive context; actor changes clear separately.
    if (id && quotationBrowse.fetchedWorkOrderId && quotationBrowse.fetchedWorkOrderId !== String(id)) quotationBrowse.clear()
  },
)

const canDial = computed(() => !productionReadOnly && Boolean(detail.value?.contact?.normalizedPhone))
const quickActions = [
  { key: 'contact', label: '联系', icon: 'phone' as const },
  { key: 'customer', label: '资料', icon: 'contact' as const },
  { key: 'records', label: '跟进', icon: 'task' as const },
  { key: 'navigate', label: '导航', icon: 'location' as const },
] as const
const visibleQuickActions = computed(() => quickActions.filter(
  (action) => !(productionReadOnly && (action.key === 'contact' || action.key === 'navigate')),
))
type QuickActionKey = (typeof quickActions)[number]['key']
const actionFeedback = ref('')
const failureCopy = computed(() => {
  if (workOrder.error?.category === 'session_invalid') return '登录状态已失效，请重新登录。'
  if (workOrder.error?.category === 'authorization_denied') return '当前账号无权查看此工单。'
  return '请稍后再试，或返回工单列表重新进入。'
})
const contactFeedback = computed(() => {
  switch (workOrder.contactState) {
    case 'granted':
      return '已打开电话能力。'
    case 'cancelled':
      return '已取消联系客户。'
    case 'unsupported_platform':
      return '当前平台暂不支持电话能力。'
    case 'unavailable':
      return '当前无法使用电话能力。'
    case 'denied':
    case 'denied_permanently_or_settings':
    case 'error_retryable':
      return '电话能力未能打开，请稍后重试。'
    default:
      return ''
  }
})

function loadForAuthenticatedSession(): void {
  if (routeReady.value && session.status === 'authenticated') {
    void workOrder.loadFromRoute(routeValue.value)
  }
}

onLoad((options) => {
  appointmentEditorContext.value = null
  routeValue.value = options?.id
  readView.value = detailReadView(options?.read)
  // #ifdef XLINK_DEV_QA
  serviceArchiveRequest.value = serviceArchiveMockRequest(options)
  if (serviceArchiveRequest.value) readView.value = serviceArchiveMockView
  // #endif
  selectedOrderId.value = typeof options?.order === 'string' ? options.order : ''
  selectedAppointmentNodeId.value = typeof options?.node === 'string' ? options.node : ''
  selectedAppointmentRecordId.value = typeof options?.record === 'string' ? options.record : ''
  routeReady.value = true
  updateDetailPageTitle()
})

function updateDetailPageTitle(): void {
  if (!routeReady.value) return
  // #ifdef XLINK_DEV_QA
  if (readView.value === serviceArchiveMockView) {
    setDetailPageTitle(serviceArchiveRequest.value ? serviceArchiveMockTitle(serviceArchiveRequest.value.kind) : '工单详情')
    return
  }
  // #endif
  setDetailPageTitle(detailReadTitle(readView.value, Boolean(selectedOrderId.value)))
}
onShow(() => {
  // #ifdef XLINK_DEV_QA
  if (readView.value === serviceArchiveMockView && typeof window !== 'undefined') {
    // H5 retains this page when only the hash query changes.
    window.addEventListener('hashchange', syncServiceArchiveHash)
    syncServiceArchiveHash()
  }
  // #endif
  updateDetailPageTitle()
  // A foreground event must not remount a pending editor for this exact
  // actor and record. The read-only parent still refreshes after returning.
  if (readView.value === 'home' || (readView.value === 'appointment' && !appointmentArchiveEditing.value)) {
    appointmentReadVersion.value++
  }
})
onBackPress(() => readView.value === 'appointment' && appointmentArchiveEditing.value
  && (appointmentReadArchive.value?.backPress() ?? false))

watch([() => workOrder.loadState, () => detail.value?.id], ([state, id]) => {
  if (state === 'succeeded' && id && readView.value === 'quotation') void loadQuotationRead()
})

watch(
  [() => session.status, () => workOrderReadScopeKey(session.session), routeReady],
  ([status, scope, ready], previous) => {
    // Role changes during an authenticated session must re-read the detail.
    if (ready && status === 'authenticated' && scope
      && (!previous || previous[0] !== status || previous[1] !== scope || !previous[2])) {
      loadForAuthenticatedSession()
    }
    if (status !== 'authenticated' && status !== 'unknown') workOrder.clear()
  },
  { immediate: true, flush: 'sync' },
)

async function retry(): Promise<void> {
  await workOrder.retry()
}

function refreshCustomerInformation(): void {
  const id = parseWorkOrderId(routeValue.value)
  if (readView.value !== 'customer' || session.status !== 'authenticated' || !id
    || detail.value?.id !== id || workOrder.loadState !== 'succeeded') return
  void workOrder.loadFromRoute(id)
}

async function loadChildForms(parentNodeId: string): Promise<void> {
  await workOrder.loadChildWorkflowForms(parentNodeId)
}

async function loadRepeatForms(nodeId: string): Promise<void> {
  await workOrder.loadChildRepeatRecords(nodeId)
}

async function loadMainRepeatForms(nodeId: string): Promise<void> {
  await workOrder.loadMainRepeatRecords(nodeId)
}

async function openReadView(view: DetailReadView): Promise<void> {
  if (detail.value) await workOrder.navigateTo(detailReadRoute(String(detail.value.id), view))
}

async function loadQuotationRead(): Promise<void> {
  const workOrderId = detail.value?.id
  if (!workOrderId) return
  await quotationBrowse.load(String(workOrderId))
}

async function retryQuotationRead(): Promise<void> {
  quotationBrowse.clear()
  await loadQuotationRead()
}

function quotationLineRows(group: QuotationOrderBrowseGroup) {
  return quotationBrowseLineRows(group)
}

function quotationKindLabel(kind: QuotationOrderBrowseKind): string {
  switch (kind) {
    case 'package': return '套餐'
    case 'procedure': return '工序'
    case 'material': return '材料'
    case 'measure': return '机措'
  }
}

async function dialContact(): Promise<void> {
  await workOrder.dialContact()
}

async function openDevMockDynamicFormReceipt():Promise<void>{
  const node=devMockCompletedDynamicFormNode.value,id=detail.value?.id
  if(!id||!node||completedDevMockDynamicFormReceiptGate.value?.nodeId!==String(node.id)||!['pending','clear'].includes(completedDevMockDynamicFormReceiptGate.value.status))return
  await workOrder.navigateTo(`${actionWorkspaceRouteFor(id,node.id,'interact_with_form')}&from=detail`)
}
async function handleCurrentTaskAction(): Promise<void> {
  const currentTask = workflowProjection.value.currentTask
  if (!currentTask || (currentTask.execution !== 'enabled' && !allowLocalMockPreview.value && !normalWorkspaceEntry.value && !devMockDynamicFormNodeKind.value)) return
  if (productionReadOnly && currentTask.actionIntent !== 'place_order') return
  const id = detail.value?.id
  if (!id) return
  const target = actionWorkspaceRouteFor(id, currentTask.nodeId, currentTask.actionIntent)
  // Quotation entry is an Action task, while the read-only Order archive remains
  // independent. Production keeps its established read-only entry.
  await workOrder.navigateTo(currentTask.actionIntent === 'place_order' && !productionReadOnly
    ? `${target}&entry=orders` : (normalWorkspaceEntry.value || devMockDynamicFormNodeKind.value) ? `${target}&from=detail` : target)
}

async function handleQuickAction(action: QuickActionKey): Promise<void> {
  actionFeedback.value = ''
  if (action === 'contact') {
    await dialContact()
    return
  }

  if (action === 'customer') {
    await openReadView('customer')
    return
  }

  if (action === 'records') {
    await openReadView('follow-up')
    return
  }

  if (action === 'navigate') {
    actionFeedback.value = '导航能力将在地图边界完成核验后提供。'
  }
}
// #ifdef XLINK_DEV_QA
function openConstructionRead() {
  if (detail.value && constructionMockEnabled(String(detail.value.id))) {
    void workOrder.navigateTo('/pages/work-orders/construction-read?id=' + encodeURIComponent(String(detail.value.id)))
  }
}
// #endif
</script>

<style lang="scss">
@import "@brand-ui/detail.scss";

.customer-read-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-xs);
}
</style>
