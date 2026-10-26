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
    <AppStatus v-if="engine?.state === 'blocked' && engine.issues.length" tone="warning" quiet
      :message="engine.issues[0].message" data-testid="a-stage-order-price-blocked" />
    <AppStatus v-else-if="!canSubmit && status !== 'succeeded'" tone="neutral" quiet
      message="请补齐维修部位、商品、数量及价格后继续。未核实的价格不会按零计算。" />
    <AppStatus v-if="status === 'succeeded'" tone="success" quiet
      message="报价草稿已保存，可重新进入查看。"
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
    <view v-if="status !== 'succeeded'" class="mock-quote-order__actions">
      <AppButton v-if="!confirm" block :disabled="!canSubmit || busy || status === 'uncertain'"
        data-testid="a-stage-order-create" @tap="confirm = true">保存报价草稿</AppButton>
      <view v-else class="mock-quote-order__confirm">
        <text class="mock-quote-order__warning">请核对报价内容。确认后请勿重复点击。</text>
        <AppButton :disabled="busy || !canSubmit" :loading="busy"
          data-testid="a-stage-order-confirm" @tap="submit">确认创建</AppButton>
        <AppButton variant="text" :disabled="busy" @tap="confirm = false">返回检查</AppButton>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { createDefaultStoragePort } from '@app/composition'
import { createAStageMockQuoteOrderController } from '@app/a-stage-quotation-mock-ui'
import { useActionWorkspaceStore } from '../action-workspace'
import { useQuotationCompositionStore } from './composition-store'
import { useSessionStore } from '@shared/state'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'

const workspace = useActionWorkspaceStore()
const composition = useQuotationCompositionStore()
const session = useSessionStore()
const engine = computed(() => workspace.quotationEngine.result)
const amount = computed(() => engine.value?.pricing
  ? `¥ ${engine.value.pricing.calcTotalPrice.totalPrice.toFixed(2)}` : '待核验')
const status = ref<'ready' | 'blocked' | 'uncertain' | 'succeeded'>('blocked')
const feedback = ref('')
const busy = ref(false)
const checking = ref(false)
const confirm = ref(false)
const verification = ref<'confirmed' | 'not_found' | 'blocked' | 'unknown' | null>(null)
const verificationMessage = ref('')
const canSubmit = computed(() => Boolean(engine.value?.state === 'ready' && engine.value.payload
  && engine.value.payload.totalPrice > 0 && composition.draft
  && engine.value.draftVersion === composition.draft.draftVersion && status.value === 'ready'))
function actor() {
  const current = session.session
  return current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) } : null
}
const controller = createAStageMockQuoteOrderController({ getActor: actor,
  storage: createDefaultStoragePort() })
let generation = 0
watch(() => [engine.value?.draftVersion, engine.value?.state, session.session?.sessionRef,
  session.session?.currentRole?.id, session.session?.roleVersion] as const,
  async () => {
    const ticket = ++generation
    confirm.value = false
    feedback.value = ''
    verification.value = null
    verificationMessage.value = ''
    if (!engine.value || engine.value.state !== 'ready') { status.value = 'blocked'; return }
    const state = await controller.readStatus(engine.value)
    if (ticket === generation) status.value = state
  }, { immediate: true })

async function submit(): Promise<void> {
  if (!canSubmit.value || busy.value || !engine.value) return
  const current = engine.value
  busy.value = true
  confirm.value = false
  feedback.value = ''
  try {
    const saved = await composition.flushDraft()
    if (saved.state !== 'succeeded' || !composition.draft
      || current.draftVersion !== composition.draft.draftVersion) {
      feedback.value = '草稿保存失败，请检查后重新核对。'
      return
    }
    const result = await controller.submit(current)
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
