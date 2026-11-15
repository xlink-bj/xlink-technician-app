<template>
<view class="list-state empty-state" data-testid="work-order-empty-state">
        <view class="empty-state-card">
          <view class="empty-illustration" aria-hidden="true">
            <view class="empty-illustration-shadow" />
            <view class="empty-illustration-spark empty-illustration-spark-left" />
            <view class="empty-illustration-spark empty-illustration-spark-right" />
            <view class="empty-clipboard">
              <view class="empty-clipboard-sheet">
                <view class="empty-clipboard-line empty-clipboard-line-long" />
                <view class="empty-clipboard-line empty-clipboard-line-medium" />
                <view class="empty-clipboard-line empty-clipboard-line-short" />
              </view>
              <view class="empty-clipboard-clip"><view class="empty-clipboard-clip-hole" /></view>
              <view class="empty-clipboard-badge"><view class="empty-clipboard-minus" /></view>
            </view>
          </view>
          <text class="empty-state-title">{{ title }}</text>
          <text class="empty-state-detail">{{ description }}</text>
          <button class="empty-state-action" @tap="emit('action')">
            <AppIcon name="refresh" :size="18" color="var(--app-color-surface)" aria-hidden="true" />
            <text>{{ actionLabel }}</text>
          </button>
        </view>
      </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
withDefaults(defineProps<{
  readonly title?: string
  readonly description?: string
  readonly actionLabel?: string
}>(), {
  title: '当前暂无工单',
  description: '当前角色暂时没有可处理的工单，可稍后刷新再试。',
  actionLabel: '刷新工单',
})
const emit = defineEmits<{ (event: 'action'): void }>()
</script>
<style scoped lang="scss">
@import "@brand-ui/work-order-empty.scss";
</style>