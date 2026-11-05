<template>
  <view class="mock-quote-order app-surface" data-testid="a-stage-mock-order-panel">
    <view class="mock-quote-order__heading">
      <view>
        <text class="mock-quote-order__title">报价确认</text>
      </view>
    </view>
    <view class="mock-quote-order__summary">
      <view>
        <text class="mock-quote-order__amount-label">报价金额</text>
        <text class="mock-quote-order__amount">{{ amount }}</text>
      </view>
      <text class="mock-quote-order__amount-label">{{ composition.selectionCount }} 项 · {{ composition.groups.length }} 个部位</text>
    </view>
    <OrderExtFieldEditor ref="fieldEditor" v-if="controller.fields && fieldServiceType" :session="controller.fields"
      :service-type="fieldServiceType" :locked="busy || status === 'quote_created' || status === 'succeeded' || status === 'uncertain'"
      @change="onFieldsChange" @draft-status="$emit('draft-status', $event)" />
    <AppStatus v-if="engine?.state === 'blocked' && engine.issues.length" tone="warning" quiet
      :message="engine.issues[0].message" data-testid="a-stage-order-price-blocked" />
    <AppStatus v-else-if="!canSubmit && status !== 'succeeded'" tone="neutral" quiet
      message="请补齐维修部位、商品、数量及价格后继续。未核实的价格不会按零计算。" />
    <AppStatus v-if="status === 'quote_created'" tone="success" quiet
      message="报价单已按报价编号回读。转为订单前仍可返回检查明细。"
      data-testid="a-stage-quote-readback" />
    <AppStatus v-if="status === 'succeeded'" tone="success" quiet
      message="订单已按返回的订单编号和金额回读；合同状态仍需单独核验。"
      data-testid="a-stage-order-readback" />
    <AppStatus v-if="status === 'uncertain'" tone="warning" quiet
      message="保存结果待核查，请勿重复提交。" data-testid="a-stage-order-uncertain" />
    <view v-if="status === 'uncertain'" class="mock-quote-order__readback">
      <AppButton variant="secondary" block :loading="checking" :disabled="checking || busy"
        data-testid="a-stage-order-verify" @tap="verifyPending">只读核对订单记录</AppButton>
      <AppStatus v-if="verification" :tone="verification === 'confirmed' ? 'success' : 'warning'"
        quiet :message="verificationMessage" data-testid="a-stage-order-verify-result" />
    </view>
    <text v-if="feedback" class="mock-quote-order__feedback" role="alert">{{ feedback }}</text>
    <view v-if="status === 'ready' || status === 'quote_created'" class="mock-quote-order__actions">
      <AppButton v-if="!confirm" block :disabled="!canSubmit || busy"
        :data-testid="status === 'quote_created' ? 'a-stage-order-convert' : 'a-stage-order-create'"
        @tap="confirm = status === 'quote_created' ? 'order' : 'quote'">
        {{ status === 'quote_created' ? '转为正式订单' : '保存报价单' }}
      </AppButton>
      <view v-else class="mock-quote-order__confirm">
        <text class="mock-quote-order__warning">
          {{ confirm === 'quote' ? '报价单保存后将使用单独的报价编号。' : '将按当前报价启动订单流程，正式订单会使用服务端返回的新编号。' }}
        </text>
        <AppButton :disabled="busy || !canSubmit" :loading="busy"
          :data-testid="confirm === 'quote' ? 'a-stage-order-confirm' : 'a-stage-order-convert-confirm'"
          @tap="confirm === 'quote' ? createQuote() : convertQuote()">
          {{ confirm === 'quote' ? '确认保存报价单' : '确认转为订单' }}
        </AppButton>
        <AppButton variant="text" :disabled="busy" @tap="confirm = null">返回检查</AppButton>
      </view>
    </view>
    <AppButton v-if="status === 'succeeded'" block variant="secondary"
      data-testid="a-stage-order-open-records" @tap="$emit('open-order-records')">查看订单与签约状态</AppButton>
  </view>
</template>

<script setup lang="ts">
import type { AppActionDraftStatus } from '@shared/ui/types'
import { computed, ref, watch } from 'vue'
import OrderExtFieldEditor from './OrderExtFieldEditor.vue'
import type { AStageMockQuoteOrderControllerFactory } from './a-stage-mock-quote-port'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { useSessionStore } from '@shared/state'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'

const props = defineProps<{ readonly createController: AStageMockQuoteOrderControllerFactory }>()
defineEmits<{ (event: 'open-order-records'): void; (event: 'draft-status', status: AppActionDraftStatus): void }>()
const workspace = useActionWorkspaceStore()
const composition = useQuotationCompositionStore()
const session = useSessionStore()
const engine = computed(() => workspace.quotationEngine.result)
const fieldEditor = ref<{ validateSelectionEntry(): boolean } | null>(null)
const fieldServiceType = computed(() => workspace.detail?.quotationCatalogContext?.serviceType ?? engine.value?.payload?.exts.serviceType ?? '')
const amount = computed(() => engine.value?.pricing
  ? `¥ ${engine.value.pricing.calcTotalPrice.totalPrice.toFixed(2)}` : '待核验')
const status = ref<'ready' | 'quote_created' | 'blocked' | 'uncertain' | 'succeeded'>('blocked')
const feedback = ref('')
const busy = ref(false)
const checking = ref(false)
const confirm = ref<'quote' | 'order' | null>(null)
const verification = ref<'confirmed' | 'not_found' | 'blocked' | 'unknown' | null>(null)
const verificationMessage = ref('')
const fieldReady = ref(true)
const fieldVersion = ref(0)
function onFieldsChange(ready: boolean): void { fieldReady.value = ready; fieldVersion.value += 1 }
const canSubmit = computed(() => Boolean(fieldReady.value && engine.value?.state === 'ready' && engine.value.payload
  && engine.value.payload.totalPrice > 0 && composition.draft
  && engine.value.draftVersion === composition.draft.draftVersion
  && (status.value === 'ready' || status.value === 'quote_created')))
function actor() {
  const current = session.session
  return current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) } : null
}
const controller = props.createController(actor)
defineExpose({ validateSelectionEntry: () => !controller.fields || fieldEditor.value?.validateSelectionEntry() === true })
let generation = 0
watch(() => [engine.value?.draftVersion, engine.value?.state, session.session?.sessionRef,
  session.session?.currentRole?.id, session.session?.roleVersion, fieldVersion.value] as const,
  async () => {
    const ticket = ++generation
    confirm.value = null
    feedback.value = ''
    verification.value = null
    verificationMessage.value = ''
    if (!engine.value || engine.value.state !== 'ready') { status.value = 'blocked'; return }
    const state = await controller.readStatus(engine.value)
    if (ticket === generation) status.value = state
  }, { immediate: true })

async function createQuote(): Promise<void> {
  if (!canSubmit.value || busy.value || !engine.value || confirm.value !== 'quote') return
  const current = engine.value
  busy.value = true
  confirm.value = null
  feedback.value = ''
  try {
    const saved = await composition.flushDraft()
    if (saved.state !== 'succeeded' || !composition.draft
      || current.draftVersion !== composition.draft.draftVersion) {
      feedback.value = '本地报价草稿保存失败，请检查后重试。'
      return
    }
    const result = await controller.createQuote(current)
    status.value = result.state
    feedback.value = result.message
  } finally { busy.value = false }
}
async function convertQuote(): Promise<void> {
  if (!canSubmit.value || busy.value || !engine.value || confirm.value !== 'order') return
  const current = engine.value
  busy.value = true
  confirm.value = null
  feedback.value = ''
  try {
    const saved = await composition.flushDraft()
    if (saved.state !== 'succeeded' || !composition.draft
      || current.draftVersion !== composition.draft.draftVersion) {
      feedback.value = '本地报价草稿保存失败，请检查后重试。'
      return
    }
    const result = await controller.convertQuoteToOrder(current)
    status.value = result.state
    feedback.value = result.message
  } finally { busy.value = false }
}
async function verifyPending(): Promise<void> {
  if (!engine.value || status.value !== 'uncertain' || busy.value || checking.value) return
  const current = engine.value
  checking.value = true
  verification.value = null
  try {
    const result = await controller.verifyPending(current)
    if (engine.value !== current) return
    verification.value = result.state
    verificationMessage.value = result.message
    status.value = await controller.readStatus(current)
  } finally { checking.value = false }
}
</script>

<style scoped>
.mock-quote-order { border-radius:var(--app-radius-card); margin:24rpx 0; padding:30rpx 28rpx; }
.mock-quote-order__title { display:block; font-size:var(--app-font-section-title); color:var(--app-color-text-primary); font-weight:700; }
.mock-quote-order__caption,.mock-quote-order__amount-label,.mock-quote-order__warning { display:block; font-size:23rpx; line-height:1.55; color:var(--app-color-text-secondary); margin-top:6rpx; }
.mock-quote-order__summary { display:flex; justify-content:space-between; align-items:end; gap:12rpx; padding:22rpx 0; }
.mock-quote-order__amount { display:block; color:var(--app-color-text-primary); font-size:43rpx; font-weight:750; margin-top:6rpx; }
.mock-quote-order__actions,.mock-quote-order__feedback,.mock-quote-order__readback { display:block; margin-top:18rpx; }
.mock-quote-order__confirm { display:flex; flex-wrap:wrap; align-items:center; gap:18rpx; }
.mock-quote-order__feedback { font-size:24rpx; color:var(--app-color-text-secondary); line-height:1.5; }
</style>
