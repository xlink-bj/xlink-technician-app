<template>
  <view class="quotation-hub" data-testid="quotation-order-hub">
    
    <view class="quotation-hub__work-order app-surface">
      <view class="quotation-hub__house" aria-hidden="true">⌂</view>
      <view class="quotation-hub__work-order-copy">
        <text class="quotation-hub__eyebrow">当前工单</text>
        <text class="quotation-hub__work-order-number">{{ displayNumber || workOrderId }}</text>
        <text v-if="customerName" class="quotation-hub__work-order-customer">{{ customerName }}</text>
      </view>
      <text class="quotation-hub__work-order-state">当前工单</text>
    </view>
    <view class="quotation-hub__notice" role="status">
      <text aria-hidden="true">ⓘ</text>
      <text>当前工单支持多笔独立订单；以下只显示本次已核验的记录（最多 3 笔）。</text>
    </view>
    <view v-if="!choosingMode" class="quotation-hub__section-heading">
      <text class="quotation-hub__section-title">订单列表 <text v-if="browse.state === 'succeeded'">({{ records.length }})</text></text>
      <AppButton v-if="records.length > 0 && !readOnly" class="quotation-hub__new-outline" variant="secondary"
        data-testid="quotation-hub-add-inline" @tap="chooseNewOrder">＋ 新增订单</AppButton>
    </view>
    <view v-if="choosingMode" class="quotation-hub__mode" data-testid="quotation-hub-mode">
      <text class="quotation-hub__mode-title">选择下单方式</text>
      <text class="quotation-hub__mode-caption">为当前工单创建另一笔独立的报价订单</text>
      <button class="quotation-hub__mode-option quotation-hub__mode-option--active" type="button"
        :aria-pressed="true" data-testid="quotation-hub-mode-new" @tap="startEditor">
        <view class="quotation-hub__mode-icon">＋</view>
        <view class="quotation-hub__mode-description">
          <text class="quotation-hub__mode-name">新增订单</text>
          <text class="quotation-hub__mode-detail">选择维修部位，添加产品，形成新的报价草稿</text>
        </view>
        <text class="quotation-hub__mode-radio" aria-hidden="true">●</text>
      </button>
      <view class="quotation-hub__mode-option quotation-hub__mode-option--disabled" role="group" aria-disabled="true">
        <view class="quotation-hub__mode-icon quotation-hub__mode-icon--muted">▤</view>
        <view class="quotation-hub__mode-description">
          <text class="quotation-hub__mode-name">基于已有订单复制</text>
          <text class="quotation-hub__mode-detail">尚无已验证的复制业务接口，暂不可选</text>
        </view>
        <text class="quotation-hub__mode-radio quotation-hub__mode-radio--muted" aria-hidden="true">○</text>
      </view>
      <text class="quotation-hub__mode-safety">当前操作只进入本机草稿，不会自动创建服务器订单。</text>
    </view>
    <template v-else>
    <view v-if="browse.state === 'loading' || browse.state === 'idle'" class="quotation-hub__empty app-surface" data-testid="quotation-hub-loading">
      <text class="quotation-hub__empty-title">正在核对订单记录</text>
      <text class="quotation-hub__empty-detail">不会读取其他工单的订单，也不会修改服务器数据。</text>
    </view>
    <view v-else-if="browse.state === 'failed_retryable' || browse.state === 'failed_terminal'" class="quotation-hub__empty app-surface" data-testid="quotation-hub-read-error">
      <view class="quotation-hub__empty-icon" aria-hidden="true">!</view>
      <text class="quotation-hub__empty-title">暂无法读取已有订单</text>
      <text class="quotation-hub__empty-detail">{{ browse.errorMessage || '订单读取暂不可用，请稍后重试。' }}</text>
      <AppButton variant="secondary" @tap="refresh">重新读取</AppButton>
      <text class="quotation-hub__empty-detail">仍可创建本机草稿，但无法据此判断是否已有订单。</text>
      <AppButton v-if="!readOnly" block class="quotation-hub__empty-action" data-testid="quotation-hub-create-unverified"
        @tap="startEditor">＋ 新建报价草稿</AppButton>
    </view>
    <view v-else-if="records.length === 0" class="quotation-hub__empty app-surface" data-testid="quotation-hub-no-records">
      <view class="quotation-hub__empty-icon" aria-hidden="true">▤<text class="quotation-hub__empty-icon-plus">＋</text></view>
      <text class="quotation-hub__empty-title">本次未发现正式订单</text>
      <text class="quotation-hub__empty-detail">请根据现场勘查结果创建报价订单，也可为不同维修部位分别建立订单。</text>
      <AppButton v-if="!readOnly" block class="quotation-hub__empty-action" data-testid="quotation-hub-empty-create"
        @tap="startEditor">＋ 创建第一笔订单</AppButton>
      <text class="quotation-hub__empty-provenance">仅确认本次读取，未证明完整历史为空。</text>
    </view>
    <view v-else class="quotation-hub__list" data-testid="quotation-hub-records">
      <view v-for="order in records" :key="order.id" class="quotation-hub__order app-surface"
        :data-testid="`quotation-hub-order-${order.id}`">
        <view class="quotation-hub__order-heading">
          <text class="quotation-hub__order-number">{{ order.displayNumber || order.id }}</text>
          <text class="quotation-hub__order-badge">正式订单</text>
        </view>
        <text class="quotation-hub__order-subtitle">当前权限可见 · 状态未核实时不推断签约进度</text>
        <view class="quotation-hub__order-lines">
          <view class="quotation-hub__order-line">
            <text>合计金额</text>
            <text class="quotation-hub__order-amount">{{ money(order.totalPrice) }}</text>
          </view>
          <view class="quotation-hub__order-line">
            <text>维修部位组</text>
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
            {{ editingId === order.id ? '核验中…' : '修改订单' }}
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
    </template>
    <view v-if="editError" class="quotation-hub__error" data-testid="quotation-hub-edit-error" role="alert">{{ editError }}</view>
    <view v-if="hasLocalDraft" class="quotation-hub__draft-note" data-testid="quotation-hub-local-draft">
      当前已有 {{ localDraftGroupCount }} 个维修部位组的本机草稿；继续编辑不会自动创建另一笔订单。
    </view>
    <view v-if="choosingMode || records.length > 0 && browse.state === 'succeeded'" class="quotation-hub__action-area">
      <AppButton v-if="choosingMode" block class="quotation-hub__new" data-testid="quotation-hub-mode-next"
        :disabled="readOnly" @tap="startEditor">下一步</AppButton>
      <AppButton v-else block class="quotation-hub__new" data-testid="quotation-hub-start-new"
        :disabled="readOnly || editingId !== null" @tap="chooseNewOrder">
        {{ hasLocalDraft ? '继续本机报价草稿' : '＋ 新增订单' }}
      </AppButton>
      <AppButton v-if="choosingMode" variant="text" block data-testid="quotation-hub-mode-cancel" @tap="choosingMode = false">取消</AppButton>
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
const choosingMode = ref(false)
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
  choosingMode.value = false
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

/* Q00 high-fidelity work-order Action visual system. The native page
   header already displays 订单管理; do not repeat a second page title. */
.quotation-hub { padding-top:18rpx; }
.quotation-hub__work-order { background:var(--app-color-surface); gap:13rpx; border-radius:20rpx; }
.quotation-hub__house { width:58rpx; height:58rpx; font-size:32rpx; }
.quotation-hub__work-order-state { font-size:20rpx; color:#d26d39; }
.quotation-hub__notice { margin:12rpx 0 22rpx; padding:11rpx 14rpx; font-size:19rpx; }
.quotation-hub__section-heading { min-height:64rpx; }
.quotation-hub__new-outline { min-height:59rpx; font-size:20rpx; }
.quotation-hub__order { padding:20rpx; background:var(--app-color-surface); box-shadow:0 5rpx 22rpx rgba(30,54,93,.035); }
.quotation-hub__order-heading { gap:8rpx; }
.quotation-hub__order-subtitle { border-bottom:1rpx solid var(--app-color-divider); padding-bottom:13rpx; }
.quotation-hub__order-lines { border:0; }
.quotation-hub__order-amount { font-weight:800; }
.quotation-hub__empty { padding:56rpx 24rpx 30rpx; gap:14rpx; }
.quotation-hub__empty-icon { width:126rpx; height:126rpx; border-radius:50%; position:relative; font-size:56rpx; font-weight:600; }
.quotation-hub__empty-icon-plus { position:absolute; bottom:2rpx; right:-2rpx; width:48rpx; height:48rpx;
  display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--app-color-primary);
  color:#fff; border:4rpx solid #fff; font-size:32rpx; }
.quotation-hub__empty-title { font-size:27rpx; margin-top:6rpx; }
.quotation-hub__empty-detail { max-width:510rpx; }
.quotation-hub__empty-action { width:100%; margin-top:17rpx; min-height:86rpx; }
.quotation-hub__empty-provenance { color:var(--app-color-text-secondary); font-size:18rpx; margin-top:2rpx; }
.quotation-hub__mode { display:flex; flex-direction:column; gap:14rpx; }
.quotation-hub__mode-title { font-size:30rpx; font-weight:800; margin-top:14rpx; }
.quotation-hub__mode-caption { color:var(--app-color-text-secondary); font-size:21rpx; margin-bottom:10rpx; }
.quotation-hub__mode-option { box-sizing:border-box; text-align:left; background:var(--app-color-surface); border:1rpx solid var(--app-color-border);
  border-radius:18rpx; padding:22rpx 17rpx; display:flex; align-items:center; width:100%;
  gap:15rpx; min-height:143rpx; margin:0; }
.quotation-hub__mode-option::after { border:0; }
.quotation-hub__mode-option--active { border:2rpx solid var(--app-color-primary); }
.quotation-hub__mode-option--disabled { opacity:.57; }
.quotation-hub__mode-icon { width:66rpx; height:66rpx; border-radius:50%; flex:none;
  color:#fff; background:var(--app-color-primary); display:flex; align-items:center; justify-content:center; font-size:37rpx; }
.quotation-hub__mode-icon--muted { color:var(--app-color-text-secondary); background:#edf1f6; }
.quotation-hub__mode-description { display:flex; flex-direction:column; gap:7rpx; flex:1; min-width:0; }
.quotation-hub__mode-name { font-size:25rpx; font-weight:750; color:var(--app-color-text-primary); }
.quotation-hub__mode-detail { font-size:20rpx; line-height:1.45; color:var(--app-color-text-secondary); }
.quotation-hub__mode-radio { color:var(--app-color-primary); font-size:34rpx; }
.quotation-hub__mode-radio--muted { color:var(--app-color-text-secondary); }
.quotation-hub__mode-safety { font-size:20rpx; color:var(--app-color-text-secondary); margin-top:5rpx; }
.quotation-hub__action-area { display:flex; flex-direction:column; gap:2rpx; }
</style>
