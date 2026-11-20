<template>
  <view class="archive-stack">
    <view class="app-record-card archive-card" data-testid="material-fulfillment">
      <view class="archive-heading archive-summary-heading">
        <text class="archive-title">材料申请与配送</text>
        <text class="archive-hint">演示记录 · 只读</text>
      </view>
      <view class="archive-failure material-actions">
        <text v-if="state.phase === 'idle'" class="archive-hint">核对本工单各批次到货情况。</text>
        <text v-else-if="state.phase === 'failed'" class="archive-hint archive-hint--error" role="status"
          data-testid="material-fulfillment-error">
          {{ state.recheck ? '到货状态暂时无法核对。' : '材料记录暂时无法读取。' }}
        </text>
        <text v-else-if="state.phase === 'ready' && !state.requests.length" class="archive-hint" role="status"
          data-testid="material-fulfillment-empty">本工单暂无材料申请记录。</text>
        <AppButton variant="text" size="compact" :loading="state.phase === 'loading'"
          data-testid="material-fulfillment-read" @tap="$emit('read')">{{ actionLabel }}</AppButton>
      </view>
      <template v-if="state.phase === 'ready'">
        <view v-for="request in state.requests" :key="request.id" class="archive-entry"
          data-testid="material-request">
          <text class="archive-entry-title">材料申请 {{ request.id }}</text>
          <view v-for="(material, index) in request.materials" :key="index" class="material-row">
            <text>{{ material.name }}</text>
            <text class="material-quantity">{{ material.quantity }} {{ material.unit }}</text>
          </view>
          <text v-if="!request.batches.length" class="archive-hint">暂无关联配送批次。</text>
          <view v-for="batch in request.batches" :key="batch.id" class="material-batch"
            data-testid="material-delivery-batch">
            <view class="material-row">
              <text class="archive-copy">配送批次 {{ batch.id }}</text>
              <text class="material-status" data-testid="material-arrival-status">{{ materialArrivalLabel(batch.arrival) }}</text>
            </view>
            <text v-if="batch.updatedAt" class="archive-hint">更新于 {{ batch.updatedAt }}</text>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import { materialArrivalLabel, type MaterialFulfillmentState } from './material-fulfillment-read'

const props = defineProps<{ state: MaterialFulfillmentState }>()
defineEmits<{ read: [] }>()

const actionLabel = computed(() => {
  switch (props.state.phase) {
    case 'idle': return '查看材料记录'
    case 'loading': return props.state.recheck ? '正在核对到货状态…' : '正在读取材料记录…'
    case 'failed': return props.state.recheck ? '重新核对' : '重新读取'
    case 'ready': return '重新核对到货状态'
  }
})
</script>

<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";

.material-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-sm);
  margin-top: var(--app-space-xs);
  color: var(--app-text-strong);
  font-size: var(--app-type-body-size);
  line-height: var(--app-type-body-line-height);
  overflow-wrap: anywhere;
}

.material-actions { justify-content: flex-end; }
.material-actions > text { flex: 1 1 150px; }

.material-quantity,
.material-status {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.material-batch {
  margin-top: var(--app-space-sm);
  padding: var(--app-space-sm) var(--app-space-md);
  border-radius: var(--app-radius-sm);
  background: var(--app-color-page);
}

.material-batch .material-row { margin-top: 0; }
</style>
