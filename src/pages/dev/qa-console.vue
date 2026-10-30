<template>
  <view v-if="!authorized" class="qa-console qa-console--blocked" data-testid="qa-console-blocked">
    <text>当前页面不可用</text>
    <navigator url="/pages/index/index">返回应用</navigator>
  </view>
  <view v-else class="qa-console" data-testid="qa-console">
    <view class="qa-console__header">
      <text class="qa-console__eyebrow">INTERNAL · DEV ONLY</text>
      <text class="qa-console__title">开发 QA 控制台</text>
      <text class="qa-console__description">这里集中管理模拟数据、测试旅程和诊断资料。商业页面不显示本控制台的任何标识。</text>
    </view>
    <view class="qa-console__section" data-testid="dev-review-tools">
      <view class="qa-console__row">
        <text class="qa-console__label">业务数据源</text>
        <text class="qa-console__value mock-source-indicator">{{ businessDataSourceLabel }}</text>
      </view>
      <view class="qa-console__row">
        <text>启用 Mock 数据</text>
        <switch :checked="mockMode !== 'off'" :disabled="mockSwitchInFlight" @change="handleMockToggle" />
      </view>
      <view v-if="mockMode !== 'off'" class="qa-console__scenarios">
        <text class="qa-console__label">数据状态</text>
        <view class="qa-console__row">
          <button class="qa-console__button" :class="{ 'qa-console__button--active': mockMode === 'data' }" :disabled="mockSwitchInFlight" @tap="selectMockMode('data')">完整数据</button>
          <button class="qa-console__button" :class="{ 'qa-console__button--active': mockMode === 'empty' }" :disabled="mockSwitchInFlight" @tap="selectMockMode('empty')">空数据</button>
        </view>
      </view>
      <view v-if="mockMode === 'data'" class="qa-console__scenarios">
        <text class="qa-console__label">验收场景（以下入口只在 QA 控制台）</text>
        <navigator v-if="isMockJourneyAvailable()" :url="mockJourneyRoute()" class="qa-console__link mock-action-scenario" data-testid="mock-continuous-journey-entry">连续业务旅程 · MOCK-019 ↗</navigator>
        <navigator v-if="isMaterialSkuMockAvailable()" :url="materialSkuReviewUrl()" class="qa-console__link mock-action-scenario" data-testid="sku-mock-entry">材料 SPU/SKU · Mock ↗</navigator>
        <navigator v-if="isSigningMockReviewAvailable()" :url="signingMockReviewUrl()" class="qa-console__link mock-action-scenario" data-testid="signing-mock-entry">签约状态 · Mock ↗</navigator>
        <navigator v-if="isChildSubflowMockPreviewAvailable()" :url="childSubflowMockReviewUrl()" class="qa-console__link" data-testid="child-subflow-mock-preview-entry">子流程只读 · Mock ↗</navigator>
        <navigator v-for="scenario in mockActionWorkspaceScenarios" :key="scenario.key" :url="scenario.route" class="qa-console__link mock-action-scenario">
          {{ scenario.label }} ↗
        </navigator>
      </view>
    </view>
    <MockCommercialFlowLinks
      v-if="mockMode === 'data' && isMockJourneyAvailable()"
      :review="mockCommercialReview"
      :work-order-id="devQaJourneyWorkOrderId"
      :user-id="session.session?.user.id"
      :role-id="session.session?.currentRole?.id"
    />
    <LocalDraftDiagnosticsPanel
      :mock-mode="mockMode" :loading="draftDiagnostics.loading" :entries="draftDiagnostics.entries"
      :unfinished-total="draftDiagnostics.unfinishedTotal" :invalid-total="draftDiagnostics.invalidTotal"
      :error="draftDiagnostics.error" :seed-available="draftDiagnostics.seedAvailable"
      :cleanup-available="draftDiagnostics.cleanupAvailable"
      @refresh="draftDiagnostics.refresh" @seed="draftDiagnostics.seedMockDrafts" @clear="draftDiagnostics.clearMockDrafts"
    />
    <navigator class="qa-console__link work-orders-entry" url="/pages/work-orders/work-orders" data-testid="qa-open-work-orders">打开工单列表 ↗</navigator>
    <navigator class="qa-console__return" url="/pages/index/index" data-testid="qa-return-to-app">返回商业应用 ↗</navigator>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { isBusinessMockDeveloperModeAvailable, isBusinessMockMode,
  isProductionAuthBusinessMockIsolation, setBusinessMockMode, type BusinessMockMode } from '@app/business-mock'
import { mockActionWorkspaceScenarios } from '@app/action-workspace-harness'
import { isSigningMockReviewAvailable, signingMockReviewUrl } from '@app/signing-mock-review'
import { isMaterialSkuMockAvailable, materialSkuReviewUrl } from '@app/material-sku-mock-review'
import { isChildSubflowMockPreviewAvailable, childSubflowMockReviewUrl } from '@app/child-subflow-mock-review'
import { devQaJourneyWorkOrderId, isMockJourneyAvailable, mockJourneyContext, mockJourneyRoute } from '@app/mock-journey'
import { canReadMaterialSkuMock } from '@app/material-sku-mock-review'
import {
  confirmMockCommercialCheckpoint, pauseMockCommercialReview, readMockCommercialProgress,
  resumeMockCommercialReview, revokeLastMockCommercialCheckpoint,
} from '@app/mock-commercial-journey'
import { reloadBusinessReadStores, switchBusinessDataSource } from '@features/home/business-data-source'
import { useLocalDraftDiagnosticsStore } from '@features/home/draft-diagnostics'
import LocalDraftDiagnosticsPanel from '@features/home/components/LocalDraftDiagnosticsPanel.vue'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useSessionStore } from '@shared/state'
import MockCommercialFlowLinks from '@features/work-orders/quotation/MockCommercialFlowLinks.vue'
import type { MockCommercialReviewPort } from '@features/work-orders/quotation/mock-commercial-review-port'

// DEV-only page composition owns the synthetic journey dependencies.
// The quotation feature consumes only a typed capability and cannot import app internals.
const mockCommercialReview: MockCommercialReviewPort = {
  canReview: scope => mockJourneyContext(scope.workOrderId)?.stage === 'quotation'
    && canReadMaterialSkuMock(scope),
  materialSkuReviewUrl,
  signingMockReviewUrl,
  readProgress: readMockCommercialProgress,
  confirmCheckpoint: confirmMockCommercialCheckpoint,
  pause: pauseMockCommercialReview,
  resume: resumeMockCommercialReview,
  revokeLast: revokeLastMockCommercialCheckpoint,
}

// No commercial route links here. An explicit DEV-only URL opens this separate surface.
// This guard is presentation-only; the adapter independently enforces Mock/write safety.
const authorized = computed(() => import.meta.env.DEV && isBusinessMockDeveloperModeAvailable())
const mockMode = ref<BusinessMockMode>(isBusinessMockMode())
const mockSwitchInFlight = ref(false)
const workOrders = useWorkOrderListStore()
const session = useSessionStore()
const workOrderDetail = useWorkOrderDetailStore()
const draftDiagnostics = useLocalDraftDiagnosticsStore()
const businessDataSourceLabel = computed(() => mockMode.value !== 'off' ? 'Mock'
  : isProductionAuthBusinessMockIsolation() ? '网络隔离' : 'Real API')

onShow(() => {
  if (!authorized.value) return
  mockMode.value = isBusinessMockMode()
  void draftDiagnostics.refresh()
})

async function handleMockToggle(event: Event): Promise<void> {
  if (!authorized.value || mockSwitchInFlight.value) return
  const enabled = (event as Event & { detail?: { value?: boolean } }).detail?.value === true
  mockSwitchInFlight.value = true
  try {
    await switchBusinessDataSource(enabled ? 'mock' : 'real', setBusinessMockMode,
      { list: workOrders, detail: workOrderDetail })
  } finally {
    mockMode.value = isBusinessMockMode()
    await draftDiagnostics.refresh()
    mockSwitchInFlight.value = false
  }
}

async function selectMockMode(mode: Exclude<BusinessMockMode, 'off'>): Promise<void> {
  if (!authorized.value || mockMode.value === 'off' || mockSwitchInFlight.value) return
  mockSwitchInFlight.value = true
  setBusinessMockMode(mode)
  try { await reloadBusinessReadStores({ list: workOrders, detail: workOrderDetail }) }
  finally {
    mockMode.value = isBusinessMockMode()
    await draftDiagnostics.refresh()
    mockSwitchInFlight.value = false
  }
}
</script>

<style scoped>
.qa-console { min-height:100vh; padding:22px 16px 40px; background:var(--app-color-page); display:flex; flex-direction:column; gap:16px; box-sizing:border-box; }
.qa-console--blocked { justify-content:center; align-items:center; }
.qa-console__header { padding:22px 20px; background:var(--app-color-text-primary); color:var(--app-color-surface); border-radius:var(--app-radius-card); display:flex; flex-direction:column; gap:9px; }
.qa-console__eyebrow { color:var(--app-color-primary-border); font-size:var(--app-font-meta); letter-spacing:1.5px; }
.qa-console__title { font-size:var(--app-font-section-title); font-weight:760; }
.qa-console__description { font-size:var(--app-font-body); line-height:1.65; color:var(--app-color-surface); }
.qa-console__section { background:var(--app-color-surface); border:1px solid var(--app-color-border); padding:18px 16px; border-radius:var(--app-radius-card); display:flex; flex-direction:column; gap:12px; }
.qa-console__row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.qa-console__label { color:var(--app-color-text-secondary); font-size:var(--app-font-body); font-weight:700; }
.qa-console__value { font-size:var(--app-font-body); font-weight:750; color:var(--app-color-primary); }
.qa-console__scenarios { display:flex; flex-direction:column; gap:10px; border-top:1px solid var(--app-color-divider); padding-top:12px; }
.qa-console__button { margin:0; font-size:var(--app-font-body); flex:1; }
.qa-console__button--active { border:1px solid var(--app-color-primary); color:var(--app-color-primary); }
.qa-console__link { border:1px solid var(--app-color-border); border-radius:var(--app-radius-control); background:var(--app-color-control-surface); color:var(--app-color-primary); padding:12px; font-size:var(--app-font-body); }
.qa-console__return { color:var(--app-color-primary); font-size:var(--app-font-body); text-align:center; padding:16px; }
</style>
