<template>
  <view class="archive-stack">
    <view class="app-record-card archive-card" data-testid="material-workflow">
      <view class="archive-heading archive-summary-heading">
        <text class="archive-title">材料下单与到货</text>
        <text class="archive-hint">本地演示</text>
      </view>
      <view v-if="!expanded" class="archive-failure">
        <text class="archive-hint">演示记录仅在本次打开的应用内保留。</text>
        <AppButton variant="text" data-testid="material-workflow-open" @tap="open">进入演示</AppButton>
      </view>
      <template v-else>
        <view class="archive-failure">
          <text class="archive-copy">工单 {{ displayNumber }}</text>
          <AppButton variant="text" data-testid="material-workflow-close" @tap="close">收起演示</AppButton>
        </view>

        <text class="archive-hint">下单、配送批次与收货回执均为合成记录。</text>
        <view class="archive-entry">
          <text class="archive-entry-title">演示权限</text>
          <view class="material-workflow-grants" role="group" aria-label="演示权限" data-testid="material-workflow-grants">
            <AppButton v-for="option in grants" :key="option.value" size="compact" block
              :variant="grant === option.value ? 'secondary' : 'text'" :pressed="grant === option.value"
              @tap="chooseGrant(option.value)">{{ option.label }}</AppButton>
          </view>
        </view>

        <view v-if="!submitted" class="archive-entry">
          <text class="archive-entry-title">材料明细</text>
          <view class="material-workflow-row">
            <text>高分子防水卷材</text>
            <text>数量（卷）</text>
          </view>
          <AppInput v-model="quantity" class="material-workflow-control"
            input-type="number" :maxlength="2" aria-label="下单数量（卷）"
            :disabled="!canOrder" data-testid="material-workflow-quantity" />
          <text v-if="!canOrder" class="archive-hint" data-testid="material-order-denied">当前演示权限无法下单。</text>
          <AppButton class="material-workflow-control" :disabled="!canOrder" block
            data-testid="material-submit-order" @tap="submitOrder">提交演示材料单</AppButton>
        </view>
        <template v-else>
          <AppButton v-if="!order" class="material-workflow-control" variant="secondary" block
            data-testid="material-order-readback" @tap="readOrder">查看本单材料单</AppButton>
          <view v-else class="archive-entry" data-testid="material-workflow-order">
            <text class="archive-entry-title">材料单 {{ order.request.id }}</text>
            <view v-for="line in order.request.materials" :key="line.name" class="material-workflow-row">
              <text>{{ line.name }}</text><text>{{ line.quantity }} {{ line.unit }}</text>
            </view>
            <view class="material-workflow-batch" data-testid="material-workflow-batch">
              <view class="material-workflow-row">
                <text>配送批次 {{ order.batch.id }}</text>
                <text data-testid="material-receipt-state">{{ arrivalLabel }}</text>
              </view>
            </view>

            <template v-if="order.receiptState === 'none'">
              <text v-if="!canReceive" class="archive-hint" data-testid="material-receive-denied">当前演示权限无法确认到货。</text>
              <template v-else>
                <view class="material-workflow-row">
                  <text>模拟首次回执查询无结果</text>
                  <switch :checked="delayReceipt" aria-label="模拟首次回执查询无结果" data-testid="material-delay-receipt"
                    @change="changeReceiptMode" />
                </view>
                <AppButton class="material-workflow-control" block
                  data-testid="material-confirm-receipt" @tap="confirmReceipt">确认本批次到货</AppButton>
              </template>
            </template>
            <template v-else>
              <text v-if="order.receiptState === 'unknown'" role="status" class="archive-hint"
                data-testid="material-receipt-unknown">确认结果待核对，请查询原回执。可重复查询。</text>
              <AppButton v-if="!receipt" class="material-workflow-control" variant="secondary" block
                data-testid="material-receipt-read" @tap="lookupReceipt">
                {{ order.receiptState === 'unknown' ? '查询原回执' : '查看原回执' }}
              </AppButton>
              <view v-else class="archive-entry" data-testid="material-workflow-receipt">
                <text class="archive-entry-title">到货回执 {{ receipt.id }}</text>
                <text class="archive-copy">材料单 {{ receipt.requestId }} · 配送批次 {{ receipt.batchId }}</text>
                <AppButton variant="text" data-testid="material-receipt-close" @tap="receipt = null">收起回执</AppButton>
              </view>
            </template>
          </view>
        </template>
        <text v-if="feedback" class="archive-hint" role="status" data-testid="material-workflow-feedback">{{ feedback }}</text>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppInput from '@shared/ui/AppInput.vue'
import { materialArrivalLabel, type MaterialFulfillmentScope } from './material-fulfillment-read'
import {
  hasMaterialDemoOrderGrant,
  hasMaterialDemoReceiveGrant,
  type BindMaterialFulfillmentWorkflow,
  type MaterialDemoGrant,
  type MaterialDemoOrder,
  type MaterialDemoReceipt,
} from './material-fulfillment-workflow'

const props = defineProps<{
  displayNumber: string
  currentScope: () => MaterialFulfillmentScope | null
  bindWorkflow: BindMaterialFulfillmentWorkflow
}>()
const grants = [
  { value: 'read', label: '仅查看' },
  { value: 'order', label: '仅下单' },
  { value: 'receive', label: '仅收货' },
  { value: 'both', label: '均可办理' },
] as const

const expanded = ref(false)
const grant = ref<MaterialDemoGrant>('read')
const quantity = ref('2')
const delayReceipt = ref(false)
const submitted = ref(false)
const order = ref<MaterialDemoOrder | null>(null)
const receipt = ref<MaterialDemoReceipt | null>(null)
const feedback = ref('')
const canOrder = computed(() => hasMaterialDemoOrderGrant(grant.value))
const canReceive = computed(() => hasMaterialDemoReceiveGrant(grant.value))
const arrivalLabel = computed(() => order.value?.receiptState === 'unknown'
  ? '结果待核对'
  : materialArrivalLabel(order.value?.batch.arrival))
const workflow = props.bindWorkflow(() => props.currentScope(), () => grant.value)

function currentOrderId(): string {
  return props.currentScope()?.workOrderId ?? ''
}

function open(): void {
  submitted.value = workflow.readOrder(currentOrderId()) !== null
  expanded.value = true
}

function close(): void {
  expanded.value = false
  order.value = null
  receipt.value = null
  feedback.value = ''
}

function chooseGrant(value: MaterialDemoGrant): void {
  grant.value = value
  feedback.value = ''
}

function changeReceiptMode(event: Event): void {
  delayReceipt.value = (event as Event & { detail?: { value?: boolean } }).detail?.value === true
}

function submitOrder(): void {
  const result = workflow.submitOrder(currentOrderId(), Number(quantity.value))
  if (result === 'denied') {
    feedback.value = '当前无法提交这张材料单。'
    return
  }
  if (result === 'invalid-quantity') {
    feedback.value = '请输入 1 到 99 的整数卷数。'
    return
  }
  submitted.value = true
  feedback.value = result === 'already-submitted' ? '本单已有材料单，可查看原记录。' : '材料单已提交到本地演示。'
}

function readOrder(): void {
  order.value = workflow.readOrder(currentOrderId())
  feedback.value = order.value ? '' : '暂未查到本工单材料单。'
}

function receiptTarget(current: MaterialDemoOrder) {
  return { workOrderId: current.request.workOrderId, requestId: current.request.id, batchId: current.batch.id }
}

function confirmReceipt(): void {
  if (!order.value) return
  const result = workflow.confirmReceipt(receiptTarget(order.value), delayReceipt.value)
  readOrder()
  if (result === 'denied') feedback.value = '当前无法确认这批材料到货。'
}

function lookupReceipt(): void {
  if (!order.value) return
  const result = workflow.readReceipt(receiptTarget(order.value))
  readOrder()
  if (result === 'unknown' || result === null) {
    feedback.value = '本次未查到原回执，可再次查询。'
    return
  }
  receipt.value = result
}
</script>

<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";

.material-workflow-control,
.material-workflow-grants {
  margin-top: var(--app-space-sm);
}

.material-workflow-grants {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--app-space-xs);
}

.material-workflow-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--app-space-xs);
  color: var(--app-text-strong);
  font-size: var(--app-type-body-size);
  line-height: var(--app-type-body-line-height);
  min-height: 36px;
}

.material-workflow-batch {
  margin-top: var(--app-space-xs);
  padding: var(--app-space-xs) var(--app-space-sm);
  background: var(--app-color-page);
  border-radius: var(--app-radius-sm);
}
</style>
