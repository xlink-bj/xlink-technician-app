<template>
  <!-- Actual shared UI, test fixtures only. No work-order store or API. -->
  <view class="work-order-state-gallery" data-testid="ds07c3-state-gallery">
    <view class="work-order-state-gallery__section">
      <text class="work-order-state-gallery__heading">01 · 搜索 / Search</text>
      <AppSearchBar v-model="searchText" @search="searchCount += 1" />
      <text data-testid="ds07c3-search-count">{{ searchCount }}</text>
      <AppSearchBar model-value="禁用状态" disabled />
    </view>
    <view class="work-order-state-gallery__section">
      <text class="work-order-state-gallery__heading">02 · 错误 / 重试 / 无结果</text>
      <AppFeedbackState layout="list" appearance="error" title="暂时无法加载工单"
        description="请检查网络后重试。" action-label="重新加载"
        @action="retryCount += 1" />
      <text data-testid="ds07c3-retry-count">{{ retryCount }}</text>
      <AppFeedbackState layout="list" appearance="search-empty"
        title="没有找到匹配工单" description="请尝试其他任务、客户或地址。"
        action-label="清除搜索" />
      <AppFeedbackState layout="detail" appearance="retry"
        title="暂时无法加载详情" description="请检查网络后重试。"
        action-label="重新加载" />
      <AppFeedbackState layout="detail" appearance="blocked"
        title="工单待接单" description="接单后可查看工单详情。" />
    </view>
    <view class="work-order-state-gallery__section">
      <text class="work-order-state-gallery__heading">03 · 无工单 / Empty</text>
      <AppWorkOrderEmptyState @action="emptyActionCount += 1" />
      <text data-testid="ds07c3-empty-action-count">{{ emptyActionCount }}</text>
    </view>
    <view class="work-order-state-gallery__section">
      <text class="work-order-state-gallery__heading">04 · 加载骨架 / Skeleton</text>
      <AppWorkOrderSkeleton variant="list" />
      <AppWorkOrderSkeleton variant="detail" />
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import AppSearchBar from '@shared/ui/AppSearchBar.vue'
import AppFeedbackState from '@shared/ui/AppFeedbackState.vue'
import AppWorkOrderEmptyState from '@shared/ui/AppWorkOrderEmptyState.vue'
import AppWorkOrderSkeleton from '@shared/ui/AppWorkOrderSkeleton.vue'
const searchText = ref('')
const searchCount = ref(0)
const retryCount = ref(0)
const emptyActionCount = ref(0)
</script>
<style scoped>
/* Review layout only: shared components own every state appearance. */
.work-order-state-gallery { display: flex; flex-direction: column; gap: 26px; min-width: 0; }
.work-order-state-gallery__section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.work-order-state-gallery__heading { font-size: 12px; font-weight: 600; color: var(--app-craft-secondary); }
</style>
