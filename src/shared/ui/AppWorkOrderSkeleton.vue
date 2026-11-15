<template>
  <!-- Read-only skeleton: parent owns timing; no business data fetched here. -->
      <view v-if="variant === 'list'" class="list-state loading-state app-workorder-skeleton--list" data-testid="work-order-skeleton-list" aria-label="正在加载工单">
        <view class="skeleton-list" aria-hidden="true">
          <view class="skeleton-card">
            <view class="skeleton-accent" />
            <view class="skeleton-card-main">
              <view class="skeleton-card-top">
                <view class="skeleton-mark" />
                <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-part" /></view>
                <view class="skeleton-line skeleton-line-number" />
              </view>
              <view class="skeleton-line skeleton-line-location" />
              <view class="skeleton-line skeleton-line-customer" />
              <view class="skeleton-card-footer"><view class="skeleton-line skeleton-line-chip" /><view class="skeleton-phone" /></view>
            </view>
          </view>
          <view class="skeleton-card">
            <view class="skeleton-accent" />
            <view class="skeleton-card-main">
              <view class="skeleton-card-top">
                <view class="skeleton-mark" />
                <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-part" /></view>
                <view class="skeleton-line skeleton-line-number" />
              </view>
              <view class="skeleton-line skeleton-line-location" />
              <view class="skeleton-line skeleton-line-customer" />
              <view class="skeleton-card-footer"><view class="skeleton-line skeleton-line-chip" /><view class="skeleton-phone" /></view>
            </view>
          </view>
          <view class="skeleton-card">
            <view class="skeleton-accent" />
            <view class="skeleton-card-main">
              <view class="skeleton-card-top">
                <view class="skeleton-mark" />
                <view class="skeleton-copy"><view class="skeleton-line skeleton-line-main" /><view class="skeleton-line skeleton-line-part" /></view>
                <view class="skeleton-line skeleton-line-number" />
              </view>
              <view class="skeleton-line skeleton-line-location" />
              <view class="skeleton-line skeleton-line-customer" />
              <view class="skeleton-card-footer"><view class="skeleton-line skeleton-line-chip" /><view class="skeleton-phone" /></view>
            </view>
          </view>
        </view>
      </view>


    <view v-else class="detail-state detail-loading-state app-workorder-skeleton--detail" data-testid="work-order-skeleton-detail" aria-label="正在加载工单详情">
      <view class="detail-skeleton" aria-hidden="true">
        <view class="skeleton-surface skeleton-summary">
          <view class="skeleton-summary-top">
            <view class="skeleton-line skeleton-line--customer" />
            <view class="skeleton-line skeleton-line--number" />
          </view>
          <view class="skeleton-line skeleton-line--location" />
          <view class="skeleton-actions skeleton-actions--summary">
            <view class="skeleton-rect" /><view class="skeleton-rect" /><view class="skeleton-rect" /><view class="skeleton-rect" />
          </view>
        </view>

        <view class="skeleton-surface skeleton-task">
          <view class="skeleton-line skeleton-line--eyebrow" />
          <view class="skeleton-line skeleton-line--task-title" />
          <view class="skeleton-button" />
        </view>

        <view class="skeleton-surface skeleton-information">
          <view class="skeleton-tabs"><view class="skeleton-rect" /><view class="skeleton-rect" /><view class="skeleton-rect" /><view class="skeleton-rect" /></view>
          <view class="skeleton-information-row"><view class="skeleton-rect" /><view class="skeleton-rect skeleton-rect--last" /></view>
          <view class="skeleton-information-row"><view class="skeleton-rect" /><view class="skeleton-rect skeleton-rect--last" /></view>
        </view>
      </view>
    </view>


</template>
<script setup lang="ts">
defineProps<{ readonly variant: 'list' | 'detail' }>()
</script>
<style scoped lang="scss">
@import "@brand-ui/work-order-skeleton.scss";
</style>
