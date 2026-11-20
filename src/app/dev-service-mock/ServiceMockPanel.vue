<template>
  <AppRecordCard v-if="target" class="service-mock" data-testid="service-mock-panel">
    <AppSectionHeading :title="copy[target.kind].title" :subtitle="copy[target.kind].subtitle" />
    <template v-if="!hasReceipt">
      <AppField v-if="target.kind === 'customer'" label="更正后的服务地址" required :error="validation">
        <AppInput v-model="address" :maxlength="80" placeholder="填写本次服务的新地址" data-testid="service-mock-address" />
      </AppField>
      <template v-else-if="target.kind === 'survey'">
        <AppButton block variant="secondary" data-testid="service-mock-capture" @tap="captureLocation">获取模拟位置和时间</AppButton>
        <view v-if="capture" class="service-mock__details" data-testid="service-mock-capture-result">
          <text>合成坐标 {{ capture.coordinates }}</text>
          <text>采集时间 {{ formatUtcTime(capture.capturedAt) }}</text>
        </view>
      </template>
      <AppField v-else label="拟约时段（明日，北京时间）" required :error="validation">
        <view class="service-mock__options">
          <AppButton v-for="(label, value) in privacyWindows" :key="value" :pressed="requestedWindow === value"
            :variant="requestedWindow === value ? 'primary' : 'secondary'" block
            :data-testid="`service-mock-window-${value}`" @tap="chooseWindow(value)">{{ label }}</AppButton>
        </view>
      </AppField>
    </template>

    <template v-if="receipt">
      <AppStatus tone="success" :message="`模拟回执 ${receipt.id}`" data-testid="service-mock-receipt" />
      <text v-if="receipt.kind === 'customer'" class="service-mock__detail" data-testid="service-mock-snapshot">{{ receipt.serviceAddress }}</text>
      <view v-else-if="receipt.kind === 'survey'" class="service-mock__details" data-testid="service-mock-survey-receipt">
        <text>合成坐标 {{ receipt.coordinates }}</text>
        <text>采集时间 {{ formatUtcTime(receipt.capturedAt) }}</text>
      </view>
      <view v-else class="service-mock__details" data-testid="service-mock-privacy-receipt">
        <text>申请时段 {{ receipt.requestedWindow }}</text>
        <text v-if="receipt.contactOutcome === 'not_contacted'">联系结果：未联系，预约未确认。</text>
      </view>
    </template>
    <AppStatus v-else-if="feedback" tone="warning" :message="feedback" data-testid="service-mock-feedback" />
    <AppButton v-if="!hasReceipt && (target.kind !== 'survey' || capture)"
      block data-testid="service-mock-submit" @tap="submit">{{ copy[target.kind].submit }}</AppButton>
    <AppButton v-if="hasReceipt && !receipt" block variant="secondary" data-testid="service-mock-read" @tap="read">查询原回执</AppButton>
    <AppButton v-if="target.kind === 'customer' && hasReceipt && !receipt"
      block variant="text" data-testid="service-mock-refresh" @tap="emit('refresh')">重新读取本单</AppButton>
  </AppRecordCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppRecordCard from '@shared/ui/AppRecordCard.vue'
import AppSectionHeading from '@shared/ui/AppSectionHeading.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import {
  captureSurveyMock, hasServiceMockReceipt, privacyWindows, readServiceMockReceipt,
  requestPrivacyAppointmentMock, serviceMockTarget, submitCustomerMock, submitSurveyMock,
  type PrivacyWindow, type ServiceMockInput, type ServiceMockReceipt,
} from './service-mock'

const props = defineProps<{ readonly readCurrent: () => ServiceMockInput | null }>()
const emit = defineEmits<{ (event: 'refresh'): void }>()
const address = ref('')
const validation = ref('')
const feedback = ref('')
const requestedWindow = ref<PrivacyWindow | null>(null)
const capture = ref<Exclude<ReturnType<typeof captureSurveyMock>, string> | null>(null)
const receipt = ref<ServiceMockReceipt | null>(null)
const revision = ref(0)
const copy = {
  customer: { title: '本次服务地址更正', subtitle: '模拟演示 · 仅限本单快照', submit: '保存模拟更正' },
  survey: { title: '勘查到场打卡', subtitle: '模拟演示 · 手动记录本次任务', submit: '记录模拟到场' },
  privacy: { title: '隐私号预约申请', subtitle: '模拟演示 · 不会拨号或发送短信', submit: '提交模拟申请' },
}

const target = computed(() => serviceMockTarget(props.readCurrent()))
const hasReceipt = computed(() => {
  void revision.value
  return hasServiceMockReceipt(target.value)
})
watch(() => [target.value?.key, target.value?.readRevision] as const, () => {
  address.value = ''
  validation.value = ''
  feedback.value = ''
  capture.value = null
  requestedWindow.value = null
  receipt.value = null
}, { flush: 'sync' })

function formatUtcTime(value: string): string {
  return `${value.replace('T', ' ').slice(0, 19)} UTC`
}

function captureLocation(): void {
  const key = target.value?.key
  if (!key) return
  const result = captureSurveyMock(props.readCurrent, key)
  if (result === 'denied') return
  if (result === 'location_unavailable') {
    capture.value = null
    feedback.value = '模拟定位不可用，未生成到场记录。'
    return
  }
  feedback.value = ''
  capture.value = result
}

function chooseWindow(window: PrivacyWindow): void {
  requestedWindow.value = window
  validation.value = ''
}

function submit(): void {
  const context = target.value
  if (!context) return
  validation.value = ''
  const result = context.kind === 'customer' ? submitCustomerMock(props.readCurrent, context.key, address.value)
    : context.kind === 'survey' ? submitSurveyMock(props.readCurrent, context.key, capture.value)
      : requestPrivacyAppointmentMock(props.readCurrent, context.key, requestedWindow.value)
  if (result === 'denied') return
  if (result === 'invalid') {
    if (context.kind === 'survey') feedback.value = '请重新获取本次任务的模拟位置和时间。'
    else validation.value = context.kind === 'customer' ? '请填写不同于原地址的新服务地址。' : '请选择拟约时段。'
    return
  }
  address.value = ''
  capture.value = null
  requestedWindow.value = null
  revision.value++
  feedback.value = context.kind === 'customer' ? '请重新读取本单并查询原回执。' : '请查询原回执，核对本次模拟记录。'
}

function read(): void {
  const key = target.value?.key
  if (!key) return
  const result = readServiceMockReceipt(props.readCurrent, key)
  if (typeof result === 'object') receipt.value = result
  else if (result === 'refresh_required') feedback.value = '请先重新读取本单，再查询模拟回执。'
  else if (result !== 'denied') feedback.value = '回执暂不可确认，请在原工单重新查询。'
}
</script>

<style scoped>
.service-mock { display: flex; flex-direction: column; gap: var(--app-space-md); padding: var(--app-space-lg); margin-block: var(--app-space-md); }
.service-mock__details, .service-mock__options { display: grid; gap: var(--app-space-sm); }
.service-mock__detail, .service-mock__details { color: var(--app-color-text-body); overflow-wrap: anywhere; }
</style>
