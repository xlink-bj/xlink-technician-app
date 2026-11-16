<template>
  <view class="quotation-hub app-transaction-page" data-testid="quotation-order-hub">
    
    <AppWorkOrderSummary :customer-name="customerName" :display-number="displayNumber"
      :service-address="serviceAddress" :service-district="serviceDistrict" />
    <AppLoadingState v-if="draftLoading" variant="inline" label="正在读取报价草稿" data-testid="quotation-hub-draft-loading" />
    <AppStatus
      v-if="!choosingMode && !isVisualSample && displayReadState !== 'succeeded'"
      class="quotation-hub__notice"
      variant="strip"
      tone="neutral"
      quiet
      :message="mockJourneyOrder ? uxStateLanguage.syntheticOrderPending : uxStateLanguage.scopedOrdersPending"
      data-testid="ds07c4b-quotation-scope-note"
    />
    <view v-if="!choosingMode" class="quotation-hub__section-row">
      <AppSectionHeading class="quotation-hub__section-heading"
        :title="`订单记录${displayReadState === 'succeeded' || isVisualSample ? ` (${records.length})` : ''}`" />
    </view>
    <view v-if="choosingMode" class="quotation-hub__mode" data-testid="quotation-hub-mode">
      <text class="quotation-hub__mode-title">选择操作</text>
      <text class="quotation-hub__mode-caption">为当前工单开始另一份报价草稿</text>
      <button class="quotation-hub__mode-option quotation-hub__mode-option--active" type="button"
        :aria-pressed="true" data-testid="quotation-hub-mode-new" @tap="startEditor">
        <view class="quotation-hub__mode-icon"><text aria-hidden="true">＋</text></view>
        <view class="quotation-hub__mode-description">
          <text class="quotation-hub__mode-name">新建报价草稿</text>
          <text class="quotation-hub__mode-detail">选择维修部位，添加产品，形成新的报价草稿</text>
        </view>
        <text class="quotation-hub__mode-radio" aria-hidden="true">●</text>
      </button>
      <view class="quotation-hub__mode-option quotation-hub__mode-option--disabled" role="group" aria-disabled="true">
        <view class="quotation-hub__mode-icon quotation-hub__mode-icon--muted"><AppIcon name="order" :size="26" color="#71829b" /></view>
        <view class="quotation-hub__mode-description">
          <text class="quotation-hub__mode-name">基于已有订单复制</text>
          <text class="quotation-hub__mode-detail">此操作暂未开放</text>
        </view>
        <text class="quotation-hub__mode-radio quotation-hub__mode-radio--muted" aria-hidden="true">○</text>
      </view>
      <text class="quotation-hub__mode-safety">当前操作只新建报价草稿，不会自动创建正式订单。</text>
    </view>
    <template v-else>
    <view v-if="!isVisualSample && (displayReadState === 'loading' || displayReadState === 'idle')" class="app-record-card quotation-hub__empty" data-testid="quotation-hub-loading">
      <text class="quotation-hub__empty-title">正在核对订单记录</text>
      <text class="quotation-hub__empty-detail">正在读取当前工单的可见订单。</text>
    </view>
    <view v-else-if="!isVisualSample && (displayReadState === 'failed_retryable' || displayReadState === 'failed_terminal')" class="app-record-card quotation-hub__empty" data-testid="quotation-hub-read-error">
      <view class="quotation-hub__empty-icon" aria-hidden="true">!</view>
      <text class="quotation-hub__empty-title">暂无法读取已有订单</text>
      <text class="quotation-hub__empty-detail">{{ displayReadError || '订单读取暂不可用，请稍后重试。' }}</text>
      <AppButton variant="secondary" @tap="refresh">重新读取</AppButton>
      <text class="quotation-hub__empty-detail">仍可创建报价草稿，但无法据此判断是否已有订单。</text>
      <AppButton v-if="!readOnly && !draftLoading" block class="quotation-hub__empty-action" data-testid="quotation-hub-create-unverified" :disabled="draftLoading"
        @tap="startEditor">{{ hasLocalDraft ? uxStateLanguage.draftResumeAction : `＋ ${uxStateLanguage.draftAction}` }}</AppButton>
    </view>
    <template v-else-if="records.length === 0">
    <view class="app-record-card quotation-hub__empty" data-testid="quotation-hub-no-records">
      <view class="quotation-hub__empty-icon" aria-hidden="true"><AppIcon name="order" :size="56" color="#1677f9" /><text class="quotation-hub__empty-icon-plus">＋</text></view>
      <text class="quotation-hub__empty-title">{{ isVisualSample ? '当前工单尚无订单' : mockJourneyOrder ? '暂无已确认的订单记录' : uxStateLanguage.scopedOrderReadTitle }}</text>
      <text class="quotation-hub__empty-detail">先按维修部位填写报价草稿，核对组成及金额后再进入后续流程。</text>
      <AppButton v-if="!readOnly && !draftLoading" block class="quotation-hub__empty-action" data-testid="quotation-hub-empty-create" :disabled="draftLoading"
        @tap="startEditor">{{ hasLocalDraft ? uxStateLanguage.draftResumeAction : `＋ ${uxStateLanguage.draftAction}` }}</AppButton>
      <text class="quotation-hub__empty-provenance">仅展示当前可见的订单记录，不代表全部历史订单。</text>
    </view>
    <view class="quotation-hub__multi-order-tips">
      <text class="quotation-hub__tips-heading">一个工单可对应多笔订单</text>
      <text class="quotation-hub__tips-line">不同维修部位可分开报价；新建草稿不会自动创建正式订单。</text>
    </view>
    </template>
    <view v-else class="quotation-hub__list" data-testid="quotation-hub-records">
      <view v-for="order in records" :key="order.id" class="app-record-card quotation-hub__order"
        :data-testid="`quotation-hub-order-${order.id}`">
        <view class="quotation-hub__order-heading">
          <text class="quotation-hub__order-number">{{ order.displayNumber || order.id }}</text>
          <view class="quotation-hub__order-pills">
            <AppMetaTag class="quotation-hub__order-badge" tone="info" label="正式订单" />
            <AppMetaTag v-if="!isVisualSample && !mockJourneyOrder && !isSigningReadOrderCandidate(order)" class="quotation-hub__order-badge"
              tone="neutral" :label="order.state === -1 ? '已取消' : '状态待核验'" />
          </view>
        </view>
        <text v-if="(isVisualSample || mockJourneyOrder) && order.groups[0]?.partDescription" class="quotation-hub__order-subtitle">{{ order.groups[0].partDescription }}</text>
        <view class="quotation-hub__order-summary">
          <view class="quotation-hub__amount-block">
            <text v-if="!(devSyntheticUnverifiedAmount && order.totalPrice === 0)" class="quotation-hub__amount-label">订单金额</text>
            <AppAmountValue v-if="devSyntheticUnverifiedAmount && order.totalPrice === 0" class="quotation-hub__amount-unverified" size="regular" tone="muted" value="订单金额待核验" data-testid="quotation-hub-amount-unverified" />
            <AppAmountValue v-else class="quotation-hub__order-amount" size="prominent" tone="primary" :value="money(order.totalPrice)" />
          </view>
          <text class="quotation-hub__order-group-count">{{ order.contentSupported ? `${order.groups.length} 个维修部位组` : '明细待核验' }}</text>
        </view>
        <view class="quotation-hub__order-actions">
          <AppButton variant="secondary" :data-testid="`quotation-hub-view-${order.id}`"
            :aria-expanded="expandedId === order.id" @tap="toggleDetails(order.id)">
            <template #leading><AppIcon name="order" :size="17" color="#3174c6" /></template>
            {{ expandedId === order.id ? '收起详情' : '订单详情' }}
          </AppButton>
          <AppButton v-if="!readOnly && !mockJourneyOrder && !isVisualSample && !hasLocalDraft" variant="secondary"
            :disabled="editingId !== null"
            :data-testid="`quotation-hub-edit-${order.id}`" @tap="edit(order.id)">
            <AppIcon name="order" :size="17" color="#2479eb" />{{ editingId === order.id ? '核验中…' : '修改订单' }}
          </AppButton>
          <navigator v-if="!isVisualSample && isSigningReadOrderCandidate(order) && signingOrderReadRouteFor(workOrderId, order.id)"
            class="quotation-hub__order-signing"
            :url="signingOrderReadRouteFor(workOrderId, order.id) || undefined"
            :data-testid="`quotation-hub-signing-${order.id}`">
            <text>签约进度</text><AppIcon class="quotation-hub__order-signing-icon" name="chevron-right" :size="16" color="#216bd0" />
          </navigator>
        </view>
        <text v-if="!isVisualSample && !isSigningReadOrderCandidate(order)"
          class="quotation-hub__detail-note" :data-testid="`quotation-hub-signing-unavailable-${order.id}`">
          {{ unavailableSigningReadReason(order.state) }}
        </text>
        <view v-if="expandedId === order.id" class="quotation-hub__details"
          :data-testid="`quotation-hub-details-${order.id}`">
          <view class="quotation-hub__order-line">
            <text>产品总额</text><text class="quotation-hub__order-line-value">{{ money(order.originPrice) }}</text>
          </view>
          <view v-if="order.updateTime" class="quotation-hub__order-line">
            <text>更新时间</text><text class="quotation-hub__order-line-value">{{ order.updateTime }}</text>
          </view>
          <text v-if="order.groups.length === 0" class="quotation-hub__detail-note">该订单暂无可识别的维修分组。</text>
          <view v-for="(group, index) in order.groups" :key="index" class="quotation-hub__detail-group">
            <text class="quotation-hub__detail-title">{{ group.partDescription || `维修部位 ${index + 1}` }}</text>
            <text class="quotation-hub__detail-note">工程量：{{ group.maintainAreaNum || '未提供' }} · 可识别项目 {{ group.lines.length }} 项</text>
            <text v-if="!group.contentSupported" class="quotation-hub__detail-warning">部分历史字段尚不能安全识别，详情仅作只读参考。</text>
          </view>
        </view>
      </view>
    </view>
    </template>
    <view v-if="editError" class="quotation-hub__error" data-testid="quotation-hub-edit-error" role="alert">{{ editError }}</view>
    <view v-if="hasLocalDraft" class="app-record-card quotation-hub__draft-checkpoint"
      data-testid="quotation-hub-local-draft">
      <view class="quotation-hub__draft-checkpoint-title">
        <text class="quotation-hub__detail-title">本地报价草稿</text>
        <AppMetaTag label="非正式订单" tone="neutral" />
      </view>
      <text class="quotation-hub__draft-checkpoint-count quotation-hub__order-group-count">{{ localDraftGroupCount }} 个维修部位组 · {{ draftSaveLabel }}</text>
    </view>
    <AppStatus v-if="!choosingMode && records.length > 0 && (displayReadState === 'succeeded' || isVisualSample)"
      class="quotation-hub__signing-boundary" variant="strip" tone="neutral" quiet
      message="签约结果以合同记录为准"
      data-testid="quotation-hub-signing-boundary" />
    <view v-if="choosingMode || records.length > 0 && (displayReadState === 'succeeded' || isVisualSample)" class="quotation-hub__action-area">
      <AppButton v-if="choosingMode" block class="quotation-hub__new" data-testid="quotation-hub-mode-next"
        :disabled="readOnly || draftLoading" @tap="startEditor">下一步</AppButton>
      <AppButton v-else-if="!draftLoading" block class="quotation-hub__new" data-testid="quotation-hub-start-new"
        :disabled="readOnly || draftLoading || editingId !== null" :loading="draftLoading" @tap="chooseNewOrder">
        {{ hasLocalDraft ? uxStateLanguage.draftResumeAction : `＋ ${uxStateLanguage.draftAction}` }}
      </AppButton>
      <AppButton v-if="choosingMode" variant="text" block data-testid="quotation-hub-mode-cancel" @tap="cancelMode">取消</AppButton>
    </view>
    <slot name="after-content" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppWorkOrderSummary from '@shared/ui/AppWorkOrderSummary.vue'
import AppMetaTag from '@shared/ui/AppMetaTag.vue'
import AppSectionHeading from '@shared/ui/AppSectionHeading.vue'
import AppAmountValue from '@shared/ui/AppAmountValue.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { uxStateLanguage } from '@shared/ui/ux-state-language'
import { useQuotationOrderBrowseStore } from './order-browse-store'
import type { QuotationOrderBrowseItem } from '@shared/ports'
import { signingOrderReadRouteFor } from '@features/work-orders/signing/signing-review-read-workspace'
import { isSigningReadOrderCandidate, unavailableSigningReadReason } from '@shared/signing-order-read-policy'

const props = defineProps<{
  readonly workOrderId: string
  readonly displayNumber?: string
  readonly serviceAddress?: string
  readonly serviceDistrict?: string
  readonly customerName?: string
  readonly localDraftGroupCount: number
  readonly localDraftState?: string
  readonly readOnly: boolean
  /** Projected by the App composition root, never inferred in a feature from adapter fixtures. */
  readonly devMockOrder?: boolean
  readonly devMockOrderRead?: {
    readonly state: 'loading' | 'confirmed' | 'unavailable' | 'blocked'
    readonly order?: QuotationOrderBrowseItem
  }
  /** Explicit DEV fixture provenance from the App composition root; never infer it from a price of zero. */
  readonly devSyntheticUnverifiedAmount?: boolean
  /** Explicit DEV source-modelled preview. Never substituted for an R1 API read. */
  readonly devVisualSample?: 'orders' | 'empty'
}>()
const emit = defineEmits<{
  (event: 'create'): void
  (event: 'edit', id: string): void
  (event: 'mode-change', open: boolean): void
  (event: 'mock-read-retry'): void
}>()
const browse = useQuotationOrderBrowseStore()
const syntheticFixture = computed(() => import.meta.env.DEV
  && props.workOrderId.startsWith('mock-work-order-'))
const isVisualSample = computed(() => import.meta.env.DEV
  && (props.devVisualSample === 'orders' || props.devVisualSample === 'empty'))
const mockJourneyOrder = computed(() => import.meta.env.DEV && props.devMockOrder === true)
const displayReadState = computed(() => mockJourneyOrder.value
  ? props.devMockOrderRead?.state === 'confirmed' ? 'succeeded'
    : props.devMockOrderRead?.state === 'loading' ? 'loading' : 'failed_terminal'
  : browse.state)
const displayReadError = computed(() => mockJourneyOrder.value
  ? props.devMockOrderRead?.state === 'blocked'
    ? '本机角色或订单归属核对失败，未展示订单。'
    : '暂未确认本机订单是否保存，请稍后再试。'
  : browse.errorMessage)
const sampleRecords = computed((): readonly QuotationOrderBrowseItem[] => [3500, 1200].map((amount, index) => ({
  id: `DEV-Q00-ORDER-${index + 1}`,
  displayNumber: `BJ2026080${index + 1}`,
  type: 1 as const,
  serviceAppointmentId: props.workOrderId,
  totalPrice: amount,
  originPrice: amount,
  updateTime: index === 0 ? '2026-08-05 17:55:07' : '2026-08-04 16:22:11',
  groups: [{
    repairParts: ['防水维修'],
    partDescription: index === 0 ? '屋面防水维修' : '卫生间局部维修',
    maintainAreaNum: index === 0 ? '30' : '8',
    lines: [],
    contentSupported: true,
  }],
  contentSupported: true,
  pdfState: 'absent' as const,
})))
const records = computed((): readonly QuotationOrderBrowseItem[] => isVisualSample.value
  ? props.devVisualSample === 'orders' ? sampleRecords.value : []
  : mockJourneyOrder.value
    ? props.devMockOrderRead?.state === 'confirmed' && props.devMockOrderRead.order
      ? [props.devMockOrderRead.order] : []
  : browse.state === 'succeeded' && browse.fetchedWorkOrderId === props.workOrderId
    ? browse.items : [])
const expandedId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const editError = ref('')
const choosingMode = ref(false)
const draftLoading = computed(() => props.localDraftState === 'idle' || props.localDraftState === 'loading')
const hasLocalDraft = computed(() => props.localDraftGroupCount > 0)
const draftSaveLabel = computed(() => {
  if (props.localDraftState === 'saved_local' || props.localDraftState === 'restored') return '本机已保存'
  if (props.localDraftState === 'saving') return '本机保存中'
  if (props.localDraftState === 'save_failed' || props.localDraftState === 'unavailable') return '本机保存待重试'
  return '尚未确认保存'
})
const money = (amount: number | undefined): string => amount === undefined || !Number.isFinite(amount)
  ? '金额待核验' : `¥ ${amount.toFixed(2)}`
function refresh(): void {
  editError.value = ''
  if (mockJourneyOrder.value) { emit('mock-read-retry'); return }
  void browse.refresh(props.workOrderId, 3)
}
function toggleDetails(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}
function startEditor(): void {
  if (props.readOnly || draftLoading.value || editingId.value) return
  emit('create')
}
function chooseNewOrder(): void {
  if (props.readOnly || draftLoading.value || editingId.value) return
  if (hasLocalDraft.value || records.value.length === 0) {
    startEditor()
    return
  }
  choosingMode.value = true
  emit('mode-change', true)
}
function cancelMode(): void {
  choosingMode.value = false
  emit('mode-change', false)
}
function edit(id: string): void {
  if (props.readOnly || draftLoading.value || hasLocalDraft.value || editingId.value) return
  editingId.value = id
  editError.value = ''
  emit('edit', id)
}
function finishEdit(message?: string): void {
  editingId.value = null
  editError.value = message || ''
}
defineExpose({ finishEdit })
onMounted(() => { if (!mockJourneyOrder.value) refresh() })
watch(() => props.workOrderId, () => {
  expandedId.value = null
  editingId.value = null
  choosingMode.value = false
  emit('mode-change', false)
  refresh()
})
</script>

<style lang="scss">
@use "@brand-ui/quotation-hub";
</style>
