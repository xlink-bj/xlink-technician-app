<template>
  <view class="app-work-order-summary app-visual-scope--craft" data-testid="action-workspace-context">
    <text class="app-work-order-summary__caption">当前工单</text>
    <view class="app-work-order-summary__identity">
      <text class="app-work-order-summary__customer">{{ customerName || '工单信息' }}</text>
      <text v-if="displayNumber" class="app-work-order-summary__number">{{ displayNumber }}</text>
    </view>
    <view v-if="address" class="app-work-order-summary__address" data-testid="work-order-summary-address">
      <AppIcon name="location" :size="16" color="var(--app-color-text-secondary)" />
      <text class="app-work-order-summary__address-text">{{ address }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import AppIcon from './AppIcon.vue'
const props=defineProps<{customerName?:string;displayNumber?:string;serviceDistrict?:string;serviceAddress?:string}>()
const address=computed(()=>[props.serviceDistrict?.trim(),props.serviceAddress?.trim()].filter(Boolean).join(' · '))
</script>
<style scoped>
.app-work-order-summary{box-sizing:border-box;width:100%;padding:var(--app-card-padding);margin-bottom:var(--app-space-md);border:1rpx solid var(--app-color-border);border-radius:var(--app-radius-card);background:var(--app-color-surface)}
.app-work-order-summary__caption{display:block;color:var(--app-color-text-secondary);font-size:var(--app-font-meta);line-height:1.5;margin-bottom:var(--app-space-xs)}
.app-work-order-summary__identity{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--app-space-md)}
.app-work-order-summary__customer{min-width:0;color:var(--app-color-text-primary);font-size:var(--app-font-value);font-weight:750;line-height:1.4;overflow-wrap:anywhere}
.app-work-order-summary__number{flex-shrink:0;max-width:48%;color:var(--app-color-text-secondary);font-size:var(--app-font-body);line-height:1.5;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.app-work-order-summary__address{display:flex;align-items:flex-start;gap:var(--app-space-xs);margin-top:var(--app-space-sm);color:var(--app-color-text-secondary);font-size:var(--app-font-body);line-height:1.5;overflow-wrap:anywhere}
.app-work-order-summary__address-text{flex:1;min-width:0}
</style>
