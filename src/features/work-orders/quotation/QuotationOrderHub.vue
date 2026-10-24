<template>
  <view class="quotation-hub app-transaction-page" data-testid="quotation-order-hub">
    
    <AppRecordCard class="quotation-hub__work-order">
      <view class="quotation-hub__work-order-top">
        <view class="quotation-hub__house" aria-hidden="true"><AppIcon name="home" :size="23" color="#ef8d3d" /></view>
        <view class="quotation-hub__work-order-copy">
          <text class="quotation-hub__eyebrow">当前工单</text>
          <text class="quotation-hub__work-order-number">{{ displayNumber || workOrderId }}</text>
        </view>
        <AppMetaTag class="quotation-hub__work-order-state" label="工单" />
      </view>
      <view v-if="customerName" class="quotation-hub__work-order-meta">
        <view class="quotation-hub__work-order-meta-cell">
          <text class="quotation-hub__meta-label">客户名称</text>
          <text class="quotation-hub__work-order-customer">{{ customerName }}</text>
        </view>
      </view>
    </AppRecordCard>
    <view v-if="isVisualSample" class="quotation-hub__sample-label" role="status" data-testid="quotation-hub-design-sample">
      DEV 视觉样例 · 模拟数据，非服务器真实订单
    </view>
    <AppStatus
      v-if="!choosingMode && !isVisualSample"
      class="quotation-hub__notice"
      variant="strip"
      tone="neutral"
      quiet
      message="当前工单支持多笔独立订单；以下只显示本次已核验的记录（最多 3 笔）。"
      data-testid="ds07c4b-quotation-scope-note"
    />
    <AppSectionHeading v-if="!choosingMode" class="quotation-hub__section-heading"
      :title="`订单列表${browse.state === 'succeeded' || isVisualSample ? ` (${records.length})` : ''}`">
      <template #trailing>
        <AppButton v-if="records.length > 0 && !readOnly" class="quotation-hub__new-outline" variant="secondary"
          data-testid="quotation-hub-add-inline" @tap="chooseNewOrder">＋ 新增订单</AppButton>
      </template>
    </AppSectionHeading>
    <view v-if="choosingMode" class="quotation-hub__mode" data-testid="quotation-hub-mode">
      <text class="quotation-hub__mode-title">选择操作</text>
      <text class="quotation-hub__mode-caption">为当前工单创建另一笔独立的报价订单</text>
      <button class="quotation-hub__mode-option quotation-hub__mode-option--active" type="button"
        :aria-pressed="true" data-testid="quotation-hub-mode-new" @tap="startEditor">
        <view class="quotation-hub__mode-icon"><text aria-hidden="true">＋</text></view>
        <view class="quotation-hub__mode-description">
          <text class="quotation-hub__mode-name">新增订单</text>
          <text class="quotation-hub__mode-detail">选择维修部位，添加产品，形成新的报价草稿</text>
        </view>
        <text class="quotation-hub__mode-radio" aria-hidden="true">●</text>
      </button>
      <view class="quotation-hub__mode-option quotation-hub__mode-option--disabled" role="group" aria-disabled="true">
        <view class="quotation-hub__mode-icon quotation-hub__mode-icon--muted"><AppIcon name="order" :size="26" color="#71829b" /></view>
        <view class="quotation-hub__mode-description">
          <text class="quotation-hub__mode-name">基于已有订单复制</text>
          <text class="quotation-hub__mode-detail">尚无已验证的复制业务接口，暂不可选</text>
        </view>
        <text class="quotation-hub__mode-radio quotation-hub__mode-radio--muted" aria-hidden="true">○</text>
      </view>
      <text class="quotation-hub__mode-safety">当前操作只进入本机草稿，不会自动创建服务器订单。</text>
    </view>
    <template v-else>
    <AppRecordCard v-if="!isVisualSample && (browse.state === 'loading' || browse.state === 'idle')" class="quotation-hub__empty" data-testid="quotation-hub-loading">
      <text class="quotation-hub__empty-title">正在核对订单记录</text>
      <text class="quotation-hub__empty-detail">不会读取其他工单的订单，也不会修改服务器数据。</text>
    </AppRecordCard>
    <AppRecordCard v-else-if="!isVisualSample && (browse.state === 'failed_retryable' || browse.state === 'failed_terminal')" class="quotation-hub__empty" data-testid="quotation-hub-read-error">
      <view class="quotation-hub__empty-icon" aria-hidden="true">!</view>
      <text class="quotation-hub__empty-title">暂无法读取已有订单</text>
      <text class="quotation-hub__empty-detail">{{ browse.errorMessage || '订单读取暂不可用，请稍后重试。' }}</text>
      <AppButton variant="secondary" @tap="refresh">重新读取</AppButton>
      <text class="quotation-hub__empty-detail">仍可创建本机草稿，但无法据此判断是否已有订单。</text>
      <AppButton v-if="!readOnly" block class="quotation-hub__empty-action" data-testid="quotation-hub-create-unverified"
        @tap="startEditor">＋ 新建报价草稿</AppButton>
    </AppRecordCard>
    <template v-else-if="records.length === 0">
    <AppRecordCard class="quotation-hub__empty" data-testid="quotation-hub-no-records">
      <view class="quotation-hub__empty-icon" aria-hidden="true"><AppIcon name="order" :size="56" color="#1677f9" /><text class="quotation-hub__empty-icon-plus">＋</text></view>
      <text class="quotation-hub__empty-title">{{ isVisualSample ? '当前工单尚无订单' : '本次未发现正式订单' }}</text>
      <text class="quotation-hub__empty-detail">请根据现场勘查结果创建报价订单，也可为不同维修部位分别建立订单。</text>
      <AppButton v-if="!readOnly" block class="quotation-hub__empty-action" data-testid="quotation-hub-empty-create"
        @tap="startEditor">＋ 创建第一笔订单</AppButton>
      <text class="quotation-hub__empty-provenance">{{ isVisualSample ? '空状态为合成数据，仅用于视觉评审。' : '仅确认本次读取，未证明完整历史为空。' }}</text>
    </AppRecordCard>
    <view class="quotation-hub__multi-order-tips">
      <text class="quotation-hub__tips-heading">ⓘ 一个工单可以有多个订单</text>
      <text class="quotation-hub__tips-line">· 支持为不同维修部位创建独立订单</text>
      <text class="quotation-hub__tips-line">· 可根据维修方案或时间分批创建</text>
      <text class="quotation-hub__tips-line">· 创建后可在订单档案中查询历史记录</text>
    </view>
    </template>
    <view v-else class="quotation-hub__list" data-testid="quotation-hub-records">
      <AppRecordCard v-for="order in records" :key="order.id" class="quotation-hub__order"
        :data-testid="`quotation-hub-order-${order.id}`">
        <view class="quotation-hub__order-heading">
          <text class="quotation-hub__order-number">{{ order.displayNumber || order.id }}</text>
          <view class="quotation-hub__order-pills">
            <AppMetaTag class="quotation-hub__order-badge" tone="info"
              :label="isVisualSample ? (order.id.endsWith('-1') ? '订单 1' : '订单 2') : '正式订单'" />
            <AppMetaTag v-if="isVisualSample" class="quotation-hub__order-badge"
              :tone="order.id.endsWith('-1') ? 'warning' : 'success'"
              :label="order.id.endsWith('-1') ? '演示 · 待签约' : '演示 · 已签约'" />
          </view>
        </view>
        <text class="quotation-hub__order-subtitle">{{ isVisualSample ? order.groups[0]?.partDescription || '演示维修方案' : '当前权限可见 · 状态未核实时不推断签约进度' }}</text>
        <view class="quotation-hub__order-lines">
          <view class="quotation-hub__order-line">
            <text>产品总额</text>
            <text>{{ money(order.originPrice) }}</text>
          </view>
          <view class="quotation-hub__order-line quotation-hub__order-line--total">
            <text>实际金额</text>
            <AppAmountValue class="quotation-hub__order-amount" size="prominent" tone="primary" :value="money(order.totalPrice)" />
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
            <AppIcon name="task" :size="17" color="#2479eb" />{{ expandedId === order.id ? '收起详情' : '查看详情' }}
          </AppButton>
          <AppButton v-if="!readOnly" variant="secondary"
            :disabled="isVisualSample || editingId !== null || hasLocalDraft"
            :data-testid="`quotation-hub-edit-${order.id}`" @tap="edit(order.id)">
            <AppIcon name="order" :size="17" color="#2479eb" />{{ editingId === order.id ? '核验中…' : '修改订单' }}
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
      </AppRecordCard>
    </view>
    </template>
    <view v-if="editError" class="quotation-hub__error" data-testid="quotation-hub-edit-error" role="alert">{{ editError }}</view>
    <view v-if="hasLocalDraft" class="quotation-hub__draft-note" data-testid="quotation-hub-local-draft">
      当前已有 {{ localDraftGroupCount }} 个维修部位组的本机草稿；继续编辑不会自动创建另一笔订单。
    </view>
    <view v-if="choosingMode || records.length > 0 && (browse.state === 'succeeded' || isVisualSample)" class="quotation-hub__action-area">
      <AppButton v-if="choosingMode" block class="quotation-hub__new" data-testid="quotation-hub-mode-next"
        :disabled="readOnly" @tap="startEditor">下一步</AppButton>
      <AppButton v-else block class="quotation-hub__new" data-testid="quotation-hub-start-new"
        :disabled="readOnly || editingId !== null" @tap="chooseNewOrder">
        {{ hasLocalDraft ? '继续本机报价草稿' : '＋ 新增订单' }}
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
import { useQuotationOrderBrowseStore } from './order-browse-store'
import type { QuotationOrderBrowseItem } from '@shared/ports'

const props = defineProps<{
  readonly workOrderId: string
  readonly displayNumber?: string
  readonly customerName?: string
  readonly localDraftGroupCount: number
  readonly readOnly: boolean
  /** Explicit DEV source-modelled preview. Never substituted for an R1 API read. */
  readonly devVisualSample?: 'orders' | 'empty'
}>()
const emit = defineEmits<{
  (event: 'create'): void
  (event: 'edit', id: string): void
  (event: 'mode-change', open: boolean): void
}>()
const browse = useQuotationOrderBrowseStore()
const isVisualSample = computed(() => import.meta.env.DEV
  && (props.devVisualSample === 'orders' || props.devVisualSample === 'empty'))
const sampleRecords = computed((): readonly QuotationOrderBrowseItem[] => [3500, 1200].map((amount, index) => ({
  id: `DEV-Q00-ORDER-${index + 1}`,
  displayNumber: `演示订单 0${index + 1}`,
  type: 1 as const,
  serviceAppointmentId: props.workOrderId,
  totalPrice: amount,
  originPrice: amount,
  updateTime: index === 0 ? '2026-08-05 17:55:07' : '2026-08-04 16:22:11',
  groups: [{
    repairParts: ['示例'],
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
  : browse.state === 'succeeded' && browse.fetchedWorkOrderId === props.workOrderId
    ? browse.items : [])
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
onMounted(refresh)
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
  color:var(--app-text-strong); padding:13px var(--app-transaction-gutter) calc(108px + env(safe-area-inset-bottom));
  font-family:-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
}
.quotation-hub__work-order {
  display:flex; flex-direction:column; padding:15px 15px 13px;

}
.quotation-hub__work-order-top { display:flex; align-items:center; gap:12px; min-height:57px; }
.quotation-hub__house {
  display:flex; align-items:center; justify-content:center; flex:none;
  width:43px; height:43px; border-radius:12px; background:#fff1e5;
}
.quotation-hub__work-order-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:5px; }
.quotation-hub__eyebrow,.quotation-hub__meta-label {
  font-size:12px; line-height:1.35; color:var(--app-content-muted-ink);
}
.quotation-hub__work-order-number {
  font-size:17px; line-height:1.3; font-weight:780; color:#172a44; overflow-wrap:anywhere;
}
.quotation-hub__work-order-state { align-self: flex-start; flex: none; }
.quotation-hub__work-order-meta {
  border-top:1px solid #eff2f7; margin-top:11px; padding-top:12px;
  display:flex; gap:20px;
}
.quotation-hub__work-order-meta-cell { display:flex; flex-direction:column; min-width:0; gap:5px; }
.quotation-hub__work-order-customer { color:var(--app-text-strong); font-size:14px; font-weight:650; line-height:1.35; }
.quotation-hub__sample-label {
  margin:9px 0 0; padding:4px 9px; background:transparent;
  color:#74879e; font-size:11px; line-height:1.5; border-radius:0;
  border-left:2px solid #b7cbe5;
}
.quotation-hub__notice { margin:10px 0 18px; }
.quotation-hub__section-heading {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  margin:17px 1px 12px; min-height:44px;
}
.quotation-hub__section-title {
  font-size:19px; font-weight:790; line-height:1.3; color:#172a44;
}
.quotation-hub__new-outline {
  min-height:44px; font-size:13px; font-weight:700; border-radius:10px;
}
.quotation-hub__list { display:flex; flex-direction:column; gap:12px; }
.quotation-hub__order {
  box-sizing:border-box; padding:15px 15px 15px;

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
  padding:7px 0 11px;
}
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
.quotation-hub__order-line text:last-child:not(.app-amount-value) {
  color:var(--app-text-strong); font-size:13px; font-weight:650;
  text-align:left; overflow-wrap:anywhere;
}
.quotation-hub__order-line--total {
  padding: 6px 0 8px;
  align-items: center;
}
.quotation-hub__order-actions {
  border-top:1px solid #ecf0f5; display:flex; gap:9px; padding-top:12px;
}
.quotation-hub__order-actions .app-button {
  flex:1; min-width:0; min-height:44px; border-radius:10px;
  font-size:13px; font-weight:700; padding:0 5px;
}
.quotation-hub__order-actions .app-button__label {
  display:flex; justify-content:center; align-items:center; gap:6px;
}
.quotation-hub__details {
  margin-top:13px; padding-top:12px; border-top:1px solid #eef2f7;
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
.quotation-hub__error,.quotation-hub__draft-note {
  margin-top:13px; border-radius:10px; padding:11px 13px;
  font-size:12px; line-height:1.5;
}
.quotation-hub__error { background:#fff0e8; color:#b7643d; }
.quotation-hub__draft-note { background:#eaf3ff; color:#5d7fa7; }
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
