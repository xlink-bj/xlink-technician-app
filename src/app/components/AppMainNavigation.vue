<template>
  <view class="main-navigation" role="tablist" aria-label="主要导航">
    <button v-for="item in items" :key="item.key" class="main-navigation-item"
      :class="{ 'main-navigation-item--active': active === item.key }"
      role="tab" :aria-selected="active === item.key" :aria-label="item.label"
      :data-testid="`main-tab-${item.key}`" @tap="openMainRoute(item.key)">
      <AppIcon class="main-navigation-icon" :name="item.icon" :size="22" color="currentColor" aria-hidden="true" />
      <text class="main-navigation-label">{{ item.label }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { openMainRoute, type MainRoute } from '@app/main-navigation'
import AppIcon from '@shared/ui/AppIcon.vue'
import type { AppIconName } from '@shared/ui/icons'
defineProps<{ active: MainRoute }>()
const items: { key: MainRoute; label: string; icon: AppIconName }[] = [
  { key: 'home', label: '工作台', icon: 'home' },
  { key: 'workOrders', label: '工单', icon: 'task' },
  { key: 'notices', label: '通知', icon: 'notification' },
  { key: 'me', label: '我的', icon: 'contact' },
]
</script>

<style lang="scss">
@import '@brand-ui/main-navigation.scss';
</style>
