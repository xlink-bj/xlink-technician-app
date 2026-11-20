<template>
  <view v-if="available" class="app-record-card pipe-verification" data-testid="pipe-verification-panel">
    <view class="pipe-verification__heading">
      <text class="pipe-verification__title">管材核验</text>
      <text class="pipe-verification__meta">本机模拟</text>
    </view>
    <view v-if="!opened" class="pipe-verification__actions">
      <AppButton variant="secondary" data-testid="pipe-open-scan" @tap="open('scan')">模拟扫码</AppButton>
      <AppButton variant="secondary" data-testid="pipe-open-photo" @tap="open('photo')">模拟图片识别</AppButton>
    </view>

    <template v-else>
      <view class="pipe-verification__section-heading">
        <text class="pipe-verification__label">{{ opened === 'scan' ? '扫码核对' : 'PPR 图片识别' }}</text>
        <AppButton variant="text" size="compact" data-testid="pipe-close" @tap="opened = null">返回</AppButton>
      </view>

      <template v-if="opened === 'scan'">
        <AppChoiceGroup :options="scanOptions" :model-value="scanId"
          class="pipe-verification__choices" role="group" aria-label="扫码样本" data-testid="pipe-scan-fixtures" @update:model-value="selectScan" />
        <view class="pipe-verification__actions">
          <AppButton data-testid="pipe-scan" @tap="scan">读取样本</AppButton>
          <AppButton v-if="scanResult" variant="secondary" data-testid="pipe-recheck"
            @tap="recheck">{{ scanResult.outcome === 'unknown' ? '复核同一样本' : '复核同一编码' }}</AppButton>
        </view>
        <view v-if="scanResult" class="pipe-verification__receipt" data-testid="pipe-scan-result"
          :data-outcome="scanResult.outcome" role="status">
          <text class="pipe-verification__label">{{ scanOutcome }}</text>
          <template v-if="scanResult.outcome !== 'unknown'">
            <text data-testid="pipe-scan-code">{{ scanResult.code }}</text>
            <text v-if="scanResult.outcome === 'found'">{{ scanResult.sampleRef }}</text>
            <text v-else>演练台账里没有此编码。</text>
          </template>
          <text v-else>{{ scanResult.reason }}</text>
          <text v-if="scanResult.attempt > 1" class="pipe-verification__meta"
            data-testid="pipe-recheck-count">已复核 {{ scanResult.attempt - 1 }} 次</text>
        </view>
      </template>

      <template v-else>
        <AppChoiceGroup :options="photoOptions" :model-value="photoId"
          class="pipe-verification__choices" role="group" aria-label="图片样本" data-testid="pipe-photo-fixtures" @update:model-value="selectPhoto" />
        <view v-if="photoId" class="pipe-verification__image">
          <text class="pipe-verification__meta">原始合成图</text>
          <image :key="photoId" :src="photos[photoId]" mode="aspectFit" class="pipe-verification__preview"
            :aria-label="photoOptions.find(option => option.value === photoId)?.label"
            :data-original-id="photoId" data-testid="pipe-original-image" />
        </view>
        <AppButton :disabled="!photoId" data-testid="pipe-recognize" @tap="recognize">运行模拟识别</AppButton>
        <view v-if="photoResult" class="pipe-verification__receipt" data-testid="pipe-photo-result"
          :data-outcome="photoResult.outcome" :data-image-id="photoResult.imageId" role="status">
          <text class="pipe-verification__label">{{ photoResult.outcome === 'recognized' ? '模拟识别完成' : '模拟识别无法判定' }}</text>
          <text v-if="photoResult.outcome === 'recognized'">样本预设标记 {{ photoResult.marking }}</text>
          <text v-else>{{ photoResult.reason }}</text>
        </view>
      </template>
      <text class="pipe-verification__meta">结果仅来自演练样本，不能用于判断实际管材。</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import {
  pipePhotoFixtures, pipeScanFixtures, type PipePhotoFixture, type PipeScanFixture,
  type PipeVerificationMock, type PipeVerificationSnapshot,
} from './pipe-verification'
import markedPhoto from './ppr-marked.png'
import obscuredPhoto from './ppr-obscured.png'

const props = defineProps<{ readonly mock: PipeVerificationMock }>()
const photos = { marked: markedPhoto, obscured: obscuredPhoto }
const scanOptions = pipeScanFixtures.map(fixture => ({ value: fixture.id, label: fixture.label }))
const photoOptions = pipePhotoFixtures.map(fixture => ({ value: fixture.id, label: fixture.label }))

const available = computed(() => props.mock.available())
const opened = ref<'scan' | 'photo' | null>(null)
const scanId = ref<PipeScanFixture>('registered')
const photoId = ref<PipePhotoFixture | ''>('')
const snapshot = shallowRef<PipeVerificationSnapshot>({})
const scanResult = computed(() => snapshot.value.scan?.fixtureId === scanId.value ? snapshot.value.scan : undefined)
const photoResult = computed(() => snapshot.value.photo?.imageId === photoId.value ? snapshot.value.photo : undefined)
const scanOutcome = computed(() => {
  const outcome = scanResult.value?.outcome
  return outcome === 'found' ? '模拟台账已匹配' : outcome === 'not-found' ? '模拟台账未找到' : '模拟核对结果未知'
})

function update(result: PipeVerificationSnapshot | null): boolean {
  snapshot.value = result ?? {}
  if (!result) opened.value = null
  return result !== null
}

watch(available, allowed => {
  if (allowed) return
  update(null)
  scanId.value = 'registered'
  photoId.value = ''
}, { flush: 'sync' })

function open(kind: 'scan' | 'photo'): void {
  if (!update(props.mock.read())) return
  scanId.value = snapshot.value.scan?.fixtureId ?? 'registered'
  photoId.value = snapshot.value.photo?.imageId ?? ''
  opened.value = kind
}

function selectScan(id: string): void {
  const fixture = pipeScanFixtures.find(item => item.id === id)
  if (fixture && props.mock.available()) scanId.value = fixture.id
}

function selectPhoto(id: string): void {
  const fixture = pipePhotoFixtures.find(item => item.id === id)
  if (fixture && props.mock.available()) photoId.value = fixture.id
}

function scan(): void {
  update(props.mock.scan(scanId.value))
}

function recheck(): void {
  if (scanResult.value) update(props.mock.recheck())
}

function recognize(): void {
  if (photoId.value) update(props.mock.recognize(photoId.value))
}
</script>

<style scoped>
.pipe-verification {
  display:flex; flex-direction:column; gap:var(--app-space-md);
  box-sizing:border-box; margin-top:var(--app-space-md); padding:var(--app-space-md);
  color:var(--app-color-text-primary);
}
.pipe-verification__heading, .pipe-verification__section-heading {
  display:flex; align-items:center; justify-content:space-between; gap:var(--app-space-sm);
}
.pipe-verification__title { font-size:var(--app-font-section-title); font-weight:700; }
.pipe-verification__label { font-size:var(--app-font-body); font-weight:650; }
.pipe-verification__meta { color:var(--app-color-text-secondary); font-size:var(--app-font-meta); line-height:1.5; }
.pipe-verification__actions { display:flex; flex-wrap:wrap; gap:var(--app-space-sm); }
.pipe-verification__choices { display:flex; gap:var(--app-space-sm); }
.pipe-verification__choices :deep(.app-choice) {
  flex:1 1 0; border:1px solid var(--app-color-border-control);
  border-radius:var(--app-radius-control); background:var(--app-color-control-surface);
  color:var(--app-color-text-primary);
}
.pipe-verification__choices :deep(.app-choice[aria-pressed='true']) {
  border-color:var(--app-color-primary); background:var(--app-color-primary-soft);
  color:var(--app-color-primary); font-weight:650;
}
.pipe-verification__receipt {
  display:flex; flex-direction:column; gap:var(--app-space-xs); overflow-wrap:anywhere;
  padding:var(--app-space-md); border:1px solid var(--app-color-divider);
  border-radius:var(--app-radius-control); font-size:var(--app-font-body);
}
.pipe-verification__image { display:grid; gap:var(--app-space-xs); }
.pipe-verification__preview {
  width:100%; height:160px; background:var(--app-color-primary-soft); border-radius:var(--app-radius-control);
}
</style>
