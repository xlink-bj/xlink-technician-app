<template>
  <view class="archive-stack service-archive-stack">
    <view v-for="archive in cards" :key="archive.kind" class="app-record-card archive-card"
      :data-testid="`service-archive-${archive.kind}`" :data-read-state="archive.state">
      <view class="archive-heading archive-summary-heading">
        <text class="archive-title">{{ archive.title }}</text>
        <navigator v-if="archive.record && recordRoute" :url="recordRoute(archive.kind, archive.record.id)"
          class="archive-link" :data-testid="`service-archive-open-${archive.kind}`">查看详情 ›</navigator>
      </view>
      <text v-if="archive.state === 'present'" class="archive-copy">{{ archive.text }}</text>
      <text v-else class="archive-hint" :class="{ 'archive-hint--error': archive.state === 'failed' }">{{ archive.text }}</text>
      <view v-if="showDetails && archive.record?.details?.length" class="archive-entry" data-testid="service-archive-record">
        <view v-for="field in archive.record.details" :key="field.label" class="service-archive-field">
          <text class="archive-hint">{{ field.label }}</text>
          <text class="archive-copy">{{ field.value }}</text>
        </view>
      </view>
      <AppButton v-if="retry && archive.state === 'failed'" variant="text" size="compact"
        data-testid="service-archive-retry" @tap="retry">重新读取</AppButton>
    </view>
  </view>
</template>

<script setup lang="ts">
import AppButton from '@shared/ui/AppButton.vue'
import type { ServiceResultArchiveCard, ServiceResultArchiveKind } from './detail-archive'

defineProps<{
  readonly cards: readonly ServiceResultArchiveCard[]
  readonly recordRoute?: (kind: ServiceResultArchiveKind, id: string) => string
  readonly showDetails?: boolean
  readonly retry?: () => void
}>()
</script>

<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
.service-archive-stack { margin-top: 0; }
.service-archive-field {
  display: grid;
  grid-template-columns: minmax(0, 5.5em) minmax(0, 1fr);
  gap: var(--app-space-sm);
  align-items: baseline;
}
</style>
