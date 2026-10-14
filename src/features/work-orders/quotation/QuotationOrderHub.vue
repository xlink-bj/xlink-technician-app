<template>
  <view class="quotation-hub" data-testid="quotation-order-hub">
    <view class="quotation-hub__navigation">
      <text class="quotation-hub__page-title">订单管理</text>
      <text class="quotation-hub__page-caption">同一工单可创建多笔独立报价订单</text>
    </view>
    <view class="quotation-hub__work-order app-surface">
      <view class="quotation-hub__house" aria-hidden="true">⌂</view>
      <view class="quotation-hub__work-order-copy">
        <text class="quotation-hub__eyebrow">当前工单</text>
        <text class="quotation-hub__work-order-number">{{ displayNumber || workOrderId }}</text>
        <text v-if="customerName" class="quotation-hub__work-order-customer">{{ customerName }}</text>
      </view>
      <text class="quotation-hub__work-order-state">下单任务</text>
    </view>
    <view class="quotation-hub__notice" role="status">
      <text aria-hidden="true">ⓘ</text>
      <text>此处显示该工单最近最多 3 笔可核验的正式报价，并非全部历史订单。正式订单与本机草稿相互独立。</text>
    </view>
    <view class="quotation-hub__section-heading">
      <text class="quotation-hub__section-title">已有订单</text>
      <text class="quotation-hub__count">本次读取 {{ records.length }} 笔</text>
    </view>
    <view v-if="browse.state === 'loading' || browse.state === 'idle'" class="quotation-hub__empty app-surface" data-testid="quotation-hub-loading">
      <text class="quotation-hub__empty-title">正在核对订单记录</text>
      <text class="quotation-hub__empty-detail">不会读取其他工单的订单，也不会修改服务器数据。</text>
    </view>
    <view v-else-if="browse.state === 'failed_retryable' || browse.state === 'failed_terminal'" class="quotation-hub__empty app-surface" data-testid="quotation-hub-read-error">
      <text class="quotation-hub__empty-title">暂时无法核对已有订单</text>
      <text class="quotation-hub__empty-detail">{{ browse.errorMessage || '当前订单列表暂不可用。' }}新建本机草稿不代表不存在历史订单。</text>
      <AppButton variant="secondary" :disabled="browse.state === 'loading'" @tap="refresh">重试读取</AppButton>
    </view>
    <view v-else-if="records.length === 0" class="quotation-hub__empty app-surface" data-testid="quotation-hub-no-records">
      <view class="quotation-hub__empty-icon" aria-hidden="true">＋</view>
      <text class="quotation-hub__empty-title">本次读取未发现正式报价</text>
      <text class="quotation-hub__empty-detail">可创建新的本机报价草稿。当前是有限记录读取，不能据此断言工单没有其他历史订单。</text>
    </view>
    <view v-else class="quotation-hub__list" data-testid="quotation-hub-records">
      <view v-for="order in records" :key="order.id" class="quotation-hub__order app-surface"
        :data-testid="`quotation-hub-order-${order.id}`">
        <view class="quotation-hub__order-heading">
          <text class="quotation-hub__order-number">{{ order.displayNumber || order.id }}</text>
          <text class="quotation-hub__order-badge">服务器记录</text>
        </view>
        <text class="quotation-hub__order-subtitle">报价订单 · 状态以服务器记录为准</text>
        <view class="quotation-hub__order-lines">
          <view class="quotation-hub__order-line">
            <text>报价金额</text>
            <text class="quotation-hub__order-amount">{{ money(order.totalPrice) }}</text>
          </view>
          <view class="quotation-hub__order-line">
            <text>维修部位</text>
            <text>{{ order.groups.length }} 组</text>
          </view>
          <view v-if="order.updateTime" class="quotation-hub__order-line">
            <text>更新时间</text>
            <text>{{ order.updateTime }}</text>
          </view>
        </view>
        <view class="quotation-hub__order-actions">
          <AppButton variant="secondary" :data-testid="`quotation-hub-view-${order.id}`"
            :aria-expanded="expandedId === order.id" @tap="toggleDetails(order.id)">
            {{ expandedId === order.id ? '收起详情' : '查看详情' }}
          </AppButton>
          <AppButton v-if="!readOnly" variant="secondary"
            :disabled="editingId !== null || hasLocalDraft"
            :data-testid="`quotation-hub-edit-${order.id}`" @tap="edit(order.id)">
            {{ editingId === order.id ? '正在核验' : '核验修改权限' }}
          </AppButton>
        </view>
        <view v-if="expandedId === order.id" class="quotation-hub__details"
          :data-testid="`quotation-hub-details-${order.id}`">
          <text v-if="order.groups.length === 0" class="quotation-hub__detail-note">该订单暂无可识别的维修分组。</text>
          <view v-for="(group, index) in order.groups" :key="index" class="quotation-hub__detail-group">
            <text class="quotation-hub__detail-title">{{ group.partDescription || `维修部位 ${index + 1}` }}</text>
            <text class="quotation-hub__detail-note">工程量：{{ group.maintainAreaNum || '未提供' }} · 可识别项目 {{ group.lines.length }} 项</text>
            <text v-if="!group.contentSupported" class="quotation-hub__detail-warning">部分历史字段尚不能安全识别，详情仅作只读参考。</text>
          </view>
        </view>
      </view>
    </view>
    <view v-if="editError" class="quotation-hub__error" data-testid="quotation-hub-edit-error" role="alert">{{ editError }}</view>
    <view v-if="hasLocalDraft" class="quotation-hub__draft-note" data-testid="quotation-hub-local-draft">
      当前已有 {{ localDraftGroupCount }} 个维修部位组的本机草稿；继续编辑不会自动创建另一笔订单。
    </view>
    <view class="quotation-hub__action-area">
      <AppButton block class="quotation-hub__new" data-testid="quotation-hub-start-new"
        :disabled="readOnly || editingId !== null" @tap="startNew">
        {{ hasLocalDraft ? '继续本机报价草稿' : '＋ 新增订单' }}
      </AppButton>
      <text class="quotation-hub__footer-help">{{ readOnly
        ? '生产只读：不可新增或修改订单'
        : '新增订单先建立本机草稿，提交前仍需完成既有校验。复制已有订单暂不开放。' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import { useQuotationOrderBrowseStore } from './order-browse-store'
import type { QuotationOrderBrowseItem } from '@shared/ports'

const props = defineProps<{
  readonly workOrderId: string
  readonly displayNumber?: string
  readonly customerName?: string
  readonly localDraftGroupCount: number
  readonly readOnly: boolean
}>()
const emit = defineEmits<{
  (event: 'create'): void
  (event: 'edit', id: string): void
}>()
const browse = useQuotationOrderBrowseStore()
const records = computed(() => browse.state === 'succeeded'
  && browse.fetchedWorkOrderId === props.workOrderId ? browse.items : [] as readonly QuotationOrderBrowseItem[])
const expandedId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const editError = ref('')
const hasLocalDraft = computed(() => props.localDraftGroupCount > 0)
const money = (amount: number | undefined): string => amount === undefined || !Number.isFinite(amount)
  ? '金额待核验' : `¥ ${amount.toFixed(2)}`
function refresh(): void {
  editError.value = ''
  void browse.load(props.workOrderId, 3)
}
function toggleDetails(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}
function startNew(): void {
  if (props.readOnly || editingId.value) return
  emit('create')
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
onMounted(refresh)
watch(() => props.workOrderId, () => {
  expandedId.value = null
  editingId.value = null
  refresh()
})
</script>

<style>
.quotation-hub { box-sizing:border-box; min-height:100%; padding:22rpx 24rpx calc(155rpx + env(safe-area-inset-bottom));
  background:var(--app-color-page); color:var(--app-color-text-primary); }
.quotation-hub__navigation { display:flex; flex-direction:column; gap:6rpx; margin:4rpx 2rpx 18rpx; }
.quotation-hub__page-title { font-size:35rpx; font-weight:800; }
.quotation-hub__page-caption { color:var(--app-color-text-secondary); font-size:22rpx; }
.quotation-hub__work-order { display:flex; align-items:center; padding:20rpx; gap:14rpx; border-radius:22rpx; }
.quotation-hub__house { display:flex; align-items:center; justify-content:center; border-radius:12rpx; width:66rpx; height:66rpx;
  color:#f08d3d; background:#fff0e3; font-size:36rpx; flex:none; }
.quotation-hub__work-order-copy { display:flex; flex-direction:column; gap:3rpx; min-width:0; flex:1; }
.quotation-hub__eyebrow,.quotation-hub__work-order-customer { color:var(--app-color-text-secondary); font-size:20rpx; }
.quotation-hub__work-order-number { font-weight:800; font-size:26rpx; overflow-wrap:anywhere; }
.quotation-hub__work-order-state { color:#df873e; background:#fff0e3; padding:8rpx 12rpx; border-radius:999rpx; font-size:21rpx; }
.quotation-hub__notice { background:#eaf3ff; color:#49739f; margin:15rpx 0 22rpx; border-radius:10rpx;
  padding:13rpx 16rpx; display:flex; gap:12rpx; font-size:20rpx; line-height:1.55; }
.quotation-hub__section-heading { display:flex; align-items:center; justify-content:space-between; margin:0 2rpx 16rpx; }
.quotation-hub__section-title { font-size:28rpx; font-weight:800; }
.quotation-hub__count { font-size:21rpx; color:var(--app-color-text-secondary); }
.quotation-hub__list { display:flex; flex-direction:column; gap:14rpx; }
.quotation-hub__order { padding:19rpx; border-radius:19rpx; }
.quotation-hub__order-heading { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6rpx; }
.quotation-hub__order-number { font-weight:750; font-size:24rpx; overflow-wrap:anywhere; }
.quotation-hub__order-badge { color:#2977bb; border-radius:8rpx; background:#ebf4ff; font-size:20rpx; padding:5rpx 10rpx; }
.quotation-hub__order-subtitle { color:var(--app-color-text-secondary); font-size:21rpx; padding:7rpx 0 12rpx; }
.quotation-hub__order-lines { display:flex; flex-direction:column; gap:9rpx; padding:10rpx 0;
  border-top:1rpx solid var(--app-color-divider); }
.quotation-hub__order-line { display:flex; justify-content:space-between; gap:16rpx; font-size:22rpx; color:var(--app-color-text-secondary); }
.quotation-hub__order-line text:last-child { text-align:right; color:var(--app-color-text-primary); }
.quotation-hub__order-line .quotation-hub__order-amount { color:var(--app-color-primary); font-weight:800; }
.quotation-hub__order-actions { display:flex; flex-wrap:wrap; gap:12rpx; padding-top:12rpx; }
.quotation-hub__order-actions .app-button { flex:1; min-height:78rpx; font-size:22rpx; }
.quotation-hub__empty { display:flex; flex-direction:column; gap:16rpx; align-items:center;
  padding:55rpx 24rpx; border-radius:20rpx; text-align:center; }
.quotation-hub__empty-icon { display:flex; align-items:center; justify-content:center; border-radius:50%;
  background:#eaf3ff; color:var(--app-color-primary); width:95rpx; height:95rpx; font-size:58rpx; }
.quotation-hub__empty-title { font-weight:800; font-size:27rpx; }
.quotation-hub__empty-detail { color:var(--app-color-text-secondary); font-size:22rpx; line-height:1.55; }
.quotation-hub__details { margin-top:17rpx; border-top:1rpx solid var(--app-color-divider); padding-top:12rpx; }
.quotation-hub__detail-group { display:flex; flex-direction:column; gap:6rpx; padding:12rpx 0; }
.quotation-hub__detail-group + .quotation-hub__detail-group { border-top:1rpx solid var(--app-color-divider); }
.quotation-hub__detail-title { font-weight:750; font-size:23rpx; }
.quotation-hub__detail-note { color:var(--app-color-text-secondary); font-size:21rpx; }
.quotation-hub__detail-warning { color:#b2773d; font-size:21rpx; }
.quotation-hub__error,.quotation-hub__draft-note { margin-top:16rpx; padding:15rpx;
  border-radius:12rpx; font-size:21rpx; line-height:1.45; }
.quotation-hub__error { background:#fff2ea; color:#bd6037; }
.quotation-hub__draft-note { background:#eaf3ff; color:#4279a8; }
.quotation-hub__action-area { background:var(--app-color-surface); position:fixed; z-index:10; bottom:0; left:0; right:0;
  border-top:1rpx solid var(--app-color-divider); padding:14rpx 24rpx calc(16rpx + env(safe-area-inset-bottom)); }
.quotation-hub__new { min-height:88rpx; }
.quotation-hub__footer-help { display:block; font-size:19rpx; color:var(--app-color-text-secondary); text-align:center; padding-top:8rpx; }
</style>
