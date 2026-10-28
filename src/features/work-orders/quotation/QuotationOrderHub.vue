<template>
  <view class="quotation-hub app-transaction-page" data-testid="quotation-order-hub">
    
    <AppRecordCard class="quotation-hub__work-order">
      <view class="quotation-hub__work-order-top">
        <view class="quotation-hub__house" aria-hidden="true"><AppIcon name="order" :size="21" color="#216bd0" /></view>
        <view class="quotation-hub__work-order-copy">
          <text class="quotation-hub__eyebrow">当前工单</text>
          <text class="quotation-hub__work-order-number">{{ workOrderNumberDisplay(displayNumber || workOrderId, syntheticFixture, false) }}</text>
        </view>
      </view>
      <view v-if="customerName" class="quotation-hub__work-order-meta">
        <view class="quotation-hub__work-order-meta-cell">
          <text class="quotation-hub__meta-label">客户</text>
          <text class="quotation-hub__work-order-customer">{{ customerName }}</text>
        </view>
      </view>
    </AppRecordCard>
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
    <AppRecordCard v-if="!isVisualSample && (displayReadState === 'loading' || displayReadState === 'idle')" class="quotation-hub__empty" data-testid="quotation-hub-loading">
      <text class="quotation-hub__empty-title">正在核对订单记录</text>
      <text class="quotation-hub__empty-detail">正在读取当前工单的可见订单。</text>
    </AppRecordCard>
    <AppRecordCard v-else-if="!isVisualSample && (displayReadState === 'failed_retryable' || displayReadState === 'failed_terminal')" class="quotation-hub__empty" data-testid="quotation-hub-read-error">
      <view class="quotation-hub__empty-icon" aria-hidden="true">!</view>
      <text class="quotation-hub__empty-title">暂无法读取已有订单</text>
      <text class="quotation-hub__empty-detail">{{ displayReadError || '订单读取暂不可用，请稍后重试。' }}</text>
      <AppButton variant="secondary" @tap="refresh">重新读取</AppButton>
      <text class="quotation-hub__empty-detail">仍可创建报价草稿，但无法据此判断是否已有订单。</text>
      <AppButton v-if="!readOnly" block class="quotation-hub__empty-action" data-testid="quotation-hub-create-unverified"
        @tap="startEditor">＋ 新建报价草稿</AppButton>
    </AppRecordCard>
    <template v-else-if="records.length === 0">
    <AppRecordCard class="quotation-hub__empty" data-testid="quotation-hub-no-records">
      <view class="quotation-hub__empty-icon" aria-hidden="true"><AppIcon name="order" :size="56" color="#1677f9" /><text class="quotation-hub__empty-icon-plus">＋</text></view>
      <text class="quotation-hub__empty-title">{{ isVisualSample ? '当前工单尚无订单' : mockJourneyOrder ? '暂无已确认的订单记录' : uxStateLanguage.scopedOrderReadTitle }}</text>
      <text class="quotation-hub__empty-detail">先按维修部位填写报价草稿，核对组成及金额后再进入后续流程。</text>
      <AppButton v-if="!readOnly" block class="quotation-hub__empty-action" data-testid="quotation-hub-empty-create"
        @tap="startEditor">＋ {{ uxStateLanguage.draftAction }}</AppButton>
      <text class="quotation-hub__empty-provenance">仅展示当前可见的订单记录，不代表全部历史订单。</text>
    </AppRecordCard>
    <view class="quotation-hub__multi-order-tips">
      <text class="quotation-hub__tips-heading">一个工单可对应多笔订单</text>
      <text class="quotation-hub__tips-line">不同维修部位可分开报价；新建草稿不会自动创建正式订单。</text>
    </view>
    </template>
    <view v-else class="quotation-hub__list" data-testid="quotation-hub-records">
      <AppRecordCard v-for="order in records" :key="order.id" class="quotation-hub__order"
        :data-testid="`quotation-hub-order-${order.id}`">
        <view class="quotation-hub__order-heading">
          <text class="quotation-hub__order-number">{{ order.displayNumber || order.id }}</text>
          <view class="quotation-hub__order-pills">
            <AppMetaTag class="quotation-hub__order-badge" tone="info" label="正式订单" />
          </view>
        </view>
        <text v-if="(isVisualSample || mockJourneyOrder) && order.groups[0]?.partDescription" class="quotation-hub__order-subtitle">{{ order.groups[0].partDescription }}</text>
        <view class="quotation-hub__order-summary">
          <view class="quotation-hub__amount-block">
            <text class="quotation-hub__amount-label">订单金额</text>
            <AppAmountValue v-if="devSyntheticUnverifiedAmount && order.totalPrice === 0" class="quotation-hub__amount-unverified" size="regular" tone="muted" value="金额待核验" data-testid="quotation-hub-amount-unverified" />
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
          <navigator v-if="!isVisualSample && !mockJourneyOrder && signingOrderReadRouteFor(workOrderId, order.id)"
            class="quotation-hub__order-signing"
            :url="signingOrderReadRouteFor(workOrderId, order.id) || undefined"
            :data-testid="`quotation-hub-signing-${order.id}`">
            <text>签约进度</text><AppIcon name="chevron-right" :size="16" color="#216bd0" />
          </navigator>
        </view>
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
      </AppRecordCard>
    </view>
    </template>
    <view v-if="editError" class="quotation-hub__error" data-testid="quotation-hub-edit-error" role="alert">{{ editError }}</view>
    <AppRecordCard v-if="hasLocalDraft" class="quotation-hub__draft-checkpoint"
      data-testid="quotation-hub-local-draft">
      <view class="quotation-hub__draft-checkpoint-title">
        <text class="quotation-hub__detail-title">本地报价草稿</text>
        <AppMetaTag label="非正式订单" tone="neutral" />
      </view>
      <text class="quotation-hub__draft-checkpoint-count quotation-hub__order-group-count">{{ localDraftGroupCount }} 个维修部位组 · {{ draftSaveLabel }}</text>
    </AppRecordCard>
    <AppStatus v-if="!choosingMode && records.length > 0 && (displayReadState === 'succeeded' || isVisualSample)"
      class="quotation-hub__signing-boundary" variant="strip" tone="neutral" quiet
      message="签约结果以合同记录为准"
      data-testid="quotation-hub-signing-boundary" />
    <view v-if="choosingMode || records.length > 0 && (displayReadState === 'succeeded' || isVisualSample)" class="quotation-hub__action-area">
      <AppButton v-if="choosingMode" block class="quotation-hub__new" data-testid="quotation-hub-mode-next"
        :disabled="readOnly" @tap="startEditor">下一步</AppButton>
      <AppButton v-else block class="quotation-hub__new" data-testid="quotation-hub-start-new"
        :disabled="readOnly || editingId !== null" @tap="chooseNewOrder">
        {{ hasLocalDraft ? uxStateLanguage.draftResumeAction : `＋ ${uxStateLanguage.draftAction}` }}
      </AppButton>
      <AppButton v-if="choosingMode" variant="text" block data-testid="quotation-hub-mode-cancel" @tap="cancelMode">取消</AppButton>
    </view>
    <slot name="after-content" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppMetaTag from '@shared/ui/AppMetaTag.vue'
import AppSectionHeading from '@shared/ui/AppSectionHeading.vue'
import AppAmountValue from '@shared/ui/AppAmountValue.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { uxStateLanguage } from '@shared/ui/ux-state-language'
import { workOrderNumberDisplay } from '@shared/ui/work-order-number-display'
import { useQuotationOrderBrowseStore } from './order-browse-store'
import type { QuotationOrderBrowseItem } from '@shared/ports'
import { signingOrderReadRouteFor } from '@features/work-orders/signing/signing-review-read-workspace'

const props = defineProps<{
  readonly workOrderId: string
  readonly displayNumber?: string
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
  void browse.load(props.workOrderId, 3)
}
function toggleDetails(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}
function startEditor(): void {
  if (props.readOnly || editingId.value) return
  emit('create')
}
function chooseNewOrder(): void {
  if (props.readOnly || editingId.value) return
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
  if (props.readOnly || hasLocalDraft.value || editingId.value) return
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

<style>
/* Q00 commercial system. One canonical visual owner, no additive override
   blocks; all numbers correspond to the owner-reviewed phone content. */
.quotation-hub {
  box-sizing:border-box; min-height:100%; background:var(--app-surface-page);
  color:var(--app-text-strong); padding:14px var(--app-transaction-gutter) calc(108px + env(safe-area-inset-bottom));
  font-family:-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
}
.quotation-hub__work-order {
  display:flex; flex-direction:column; padding:14px 16px;

}
.quotation-hub__work-order-top { display:flex; align-items:center; gap:12px; min-height:43px; }
.quotation-hub__house {
  display:flex; align-items:center; justify-content:center; flex:none;
  width:40px; height:40px; border-radius:12px; background:#edf4ff;
}
.quotation-hub__work-order-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:5px; }
.quotation-hub__eyebrow,.quotation-hub__meta-label {
  font-size:12px; line-height:1.35; color:var(--app-content-muted-ink);
}
.quotation-hub__work-order-number {
  font-size:17px; line-height:1.3; font-weight:780; color:#172a44; overflow-wrap:anywhere;
}
.quotation-hub__work-order-meta {
  margin-top:7px; padding:0 0 0 52px;
  display:flex; gap:20px;
}
.quotation-hub__work-order-meta-cell { display:flex; flex-direction:row; align-items:baseline; min-width:0; gap:8px; }
.quotation-hub__work-order-customer { color:var(--app-text-strong); font-size:14px; font-weight:650; line-height:1.35; }
.quotation-hub__sample-label {
  margin:9px 0 0; padding:4px 9px; background:transparent;
  color:#74879e; font-size:11px; line-height:1.5; border-radius:0;
  border-left:2px solid #b7cbe5;
}
.quotation-hub__notice { margin:10px 0; }
.quotation-hub__section-row {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.quotation-hub__section-heading {
  display:flex; align-items:center; flex:1; gap:12px;
  margin:13px 1px 9px; min-height:32px;
}
.quotation-hub__section-scope {
  flex:none; color:var(--app-content-muted-ink);
  line-height:1.4;
}
.quotation-hub__section-title {
  font-size:19px; font-weight:790; line-height:1.3; color:#172a44;
}
.quotation-hub__list { display:flex; flex-direction:column; gap:12px; }
.quotation-hub__order {
  box-sizing:border-box; padding:16px;

}
.quotation-hub__order-heading {
  display:flex; flex-wrap:wrap; justify-content:space-between;
  align-items:center; gap:8px;
}
.quotation-hub__order-number {
  font-size:15px; line-height:1.35; font-weight:770; color:var(--app-text-strong);
  overflow-wrap:anywhere; min-width:0;
}
.quotation-hub__order-pills { display:flex; flex-wrap:wrap; align-items:center; gap:5px; }
.quotation-hub__order-badge { flex: 0 0 auto; }
.quotation-hub__order-subtitle {
  display:block; color:#7e8da6; font-size:12px; line-height:1.45;
  padding:5px 0 3px;
}
.quotation-hub__order-summary {
  display:flex; align-items:flex-end; justify-content:space-between;
  gap:12px; min-width:0; padding:4px 0 10px;
}
.quotation-hub__amount-block { display:flex; flex-direction:column; gap:2px; min-width:0; }
.quotation-hub__amount-label { color:var(--app-journey-subtle); font-size:var(--app-journey-label-size); }
.quotation-hub__amount-unverified {
  display:block; color:var(--app-craft-secondary);
  font-weight:700; line-height:27px;
}
.quotation-hub__order-group-count { flex:0 0 auto; color:var(--app-journey-subtle); font-size:12px; padding-bottom:4px; }
.quotation-hub__order-lines {
  display:flex; flex-direction:column; gap:7px; padding:0 0 11px;
}
.quotation-hub__order-line {
  display:grid; grid-template-columns:92px minmax(0,1fr);
  align-items:baseline; gap:8px; color:#788ba4;
  font-size:13px; line-height:1.5; min-width:0;
}
/* Descriptive values may inherit local metadata typography. Shared money
   must retain AppAmountValue size/tone and can never be reset by this page. */
.quotation-hub__order-line-value {
  color:var(--app-text-strong); font-size:13px; font-weight:650;
  text-align:left; overflow-wrap:anywhere;
}
.quotation-hub__order-line--total {
  padding: 6px 0 8px;
  align-items: center;
}
.quotation-hub__order-actions {
  border-top:1px solid #ecf0f5; display:grid; grid-template-columns:1fr 1fr; gap:10px; padding-top:12px;
}
.quotation-hub__order-actions .app-button {
  width:100%; min-width:0; min-height:44px; border-radius:10px;
  font-size:13px; font-weight:650; padding:0 7px;
}
.quotation-hub__order-actions .app-button__content { gap:7px; }
.quotation-hub__order-signing {
  min-height:44px; min-width:0; box-sizing:border-box;
  display:flex; justify-content:center; align-items:center; gap:5px;
  border-radius:10px; border:1px solid var(--app-color-primary-border); color:var(--app-craft-action);
  background:var(--app-craft-action-surface); font-size:13px; font-weight:650; text-align:center;
}
.quotation-hub__order-signing uni-icons { display:inline-flex; align-items:center; }
.quotation-hub__details {
  margin-top:13px; padding-top:12px; border-top:1px solid #eef2f7;
  display:flex; flex-direction:column; gap:9px;
}
.quotation-hub__detail-group {
  display:flex; flex-direction:column; gap:6px; padding:11px 0;
}
.quotation-hub__detail-group+.quotation-hub__detail-group { border-top:1px solid #eef2f7; }
.quotation-hub__detail-title { color:var(--app-text-strong); font-size:14px; font-weight:750; }
.quotation-hub__detail-note,.quotation-hub__detail-warning { font-size:12px; line-height:1.5; color:#798ba3; }
.quotation-hub__detail-warning { color:#b07a3d; }
.quotation-hub__empty {
  display:flex; flex-direction:column; align-items:center; text-align:center;
  gap:14px; padding:36px 24px 25px; background:#fff;
  border:1px solid var(--app-outline-subtle); border-radius:var(--app-content-card-radius);
  min-height:350px; box-shadow:var(--app-content-card-elevation);
}
.quotation-hub__empty-icon {
  display:flex; align-items:center; justify-content:center; position:relative;
  width:98px; height:98px; border-radius:50%; background:#edf4ff; color:#2476de;
  margin-bottom:5px;
}
.quotation-hub__empty-icon-plus {
  position:absolute; right:-2px; bottom:2px; display:flex; justify-content:center; align-items:center;
  background:#1677f4; color:#fff; border:3px solid #fff; border-radius:50%;
  width:39px; height:39px; font-size:25px;
}
.quotation-hub__empty-title {
  font-size:19px; font-weight:800; line-height:1.4; color:#1b2d48;
}
.quotation-hub__empty-detail { max-width:290px; color:#7a8ba5; font-size:13px; line-height:1.7; }
.quotation-hub__empty-action { width:100%; min-height:50px; margin-top:10px; font-size:15px; border-radius:11px; }
.quotation-hub__empty-provenance { color:#9ba9bb; font-size:11px; line-height:1.45; }
.quotation-hub__multi-order-tips {
  display:flex; flex-direction:column; gap:7px; margin-top:12px;
  padding:16px 16px; border-radius:13px;
  background:#eaf3ff; color:#5879a5;
}
.quotation-hub__tips-heading { color:#1877ef; font-size:14px; font-weight:800; line-height:1.4; margin-bottom:3px; }
.quotation-hub__tips-line { font-size:12px; line-height:1.55; }
.quotation-hub__mode { display:flex; flex-direction:column; gap:13px; padding-top:14px; }
.quotation-hub__mode-title { font-size:19px; font-weight:800; color:var(--app-text-strong); line-height:1.4; }
.quotation-hub__mode-caption { font-size:12px; color:#7d8ca4; line-height:1.5; margin-bottom:9px; }
.quotation-hub__mode-option {
  box-sizing:border-box; display:flex; align-items:center; gap:13px;
  width:100%; margin:0; padding:18px 15px; min-height:110px;
  border:1px solid var(--app-outline-subtle); border-radius:14px;
  text-align:left; background:#fff; box-shadow:var(--app-content-card-elevation);
}
.quotation-hub__mode-option::after { border:0; }
.quotation-hub__mode-option--active { border:1.5px solid #1677f4; }
.quotation-hub__mode-option--disabled { opacity:.56; }
.quotation-hub__mode-icon {
  width:49px; height:49px; border-radius:50%; flex:none;
  display:flex; align-items:center; justify-content:center;
  font-size:32px; color:#fff; background:#288bf7;
}
.quotation-hub__mode-icon--muted { background:#eef2f7; color:#8a9cb4; }
.quotation-hub__mode-description { display:flex; flex:1; flex-direction:column; gap:6px; min-width:0; }
.quotation-hub__mode-name { font-size:16px; font-weight:750; color:var(--app-text-strong); }
.quotation-hub__mode-detail { font-size:12px; line-height:1.55; color:#7a8ca5; }
.quotation-hub__mode-radio { color:#1677f4; font-size:22px; }
.quotation-hub__mode-radio--muted { color:#9aaabd; }
.quotation-hub__mode-safety { font-size:11px; line-height:1.5; color:#7c8da8; }
.quotation-hub__error {
  margin-top:13px; border-radius:10px; padding:11px 13px;
  font-size:12px; line-height:1.5;
}
.quotation-hub__error { background:#fff0e8; color:#b7643d; }
.quotation-hub__draft-checkpoint {
  display:flex; flex-direction:column; gap:6px; margin-top:11px;
  padding:13px 15px; border:1px solid #d9e7f9; background:#f5f9ff;
}
.quotation-hub__draft-checkpoint-title {
  display:flex; justify-content:space-between; align-items:center; gap:9px;
  color:var(--app-text-strong); font-weight:750;
}
.quotation-hub__draft-checkpoint-count { color:#3275bd; font-weight:700; padding-bottom:0; }
.quotation-hub__draft-checkpoint-copy { color:#617993; line-height:1.5; }
.quotation-hub__signing-boundary { margin-top:10px; }
.quotation-hub__action-area {
  position:fixed; z-index:10; left:0; right:0; bottom:0;
  display:flex; flex-direction:column; gap:6px;
  background:rgba(255,255,255,.99); border-top:1px solid #e8eef6;
  padding:12px 14px calc(15px + env(safe-area-inset-bottom));
}
.quotation-hub__new { min-height:49px; font-size:15px; font-weight:750; border-radius:11px; }
@media (max-width:360px) {
  .quotation-hub { padding-left:11px; padding-right:11px; }
  .quotation-hub__order { padding:13px 12px; }
  .quotation-hub__order-line { grid-template-columns:83px minmax(0,1fr); }
  .quotation-hub__order-number { font-size:14px; }
  .quotation-hub__order-actions { gap:7px; }
  .quotation-hub__order-actions .app-button { font-size:12px; }
}
</style>
