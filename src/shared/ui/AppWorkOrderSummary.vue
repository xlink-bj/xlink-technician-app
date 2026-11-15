<template>
  <view class="app-work-order-summary app-visual-scope--craft" data-testid="action-workspace-context">
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
@import "@brand-ui/workspace-summary.scss";
</style>
