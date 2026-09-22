<template>
  <view class="quotation-content" data-testid="quotation-action-content">
    <view class="quotation-content__heading">
      <text class="quotation-content__eyebrow">报价工作区</text>
      <text class="quotation-content__title">报价方案</text>
    </view>

    <view v-if="state === 'loading'" class="quotation-content__panel app-surface" data-testid="quotation-state-loading">
      <AppLoadingState variant="inline" label="正在准备报价内容" />
      <text class="quotation-content__state-copy">正在准备报价内容…</text>
    </view>

    <view v-else-if="state === 'ready' && content" class="quotation-content__panel app-surface" data-testid="quotation-state-ready">
      <view class="quotation-content__panel-header">
        <text class="quotation-content__panel-title">报价内容</text>
        <text class="quotation-content__badge">Mock · 只读</text>
      </view>
      <view class="quotation-content__empty">
        <text class="quotation-content__empty-title">此合成场景没有已保存报价</text>
        <text class="quotation-content__copy">这里只验证报价 Action 的承载与路由，不代表线上工单的报价读取结果。</text>
      </view>
      <AppStatus
        class="quotation-content__notice"
        message="本阶段不开放报价编辑、保存、提交、客户确认或转订单。"
        tone="neutral"
        quiet
      />
    </view>

    <view v-else-if="state === 'blocked'" class="quotation-content__panel app-surface" data-testid="quotation-state-blocked">
      <AppStatus
        message="真实报价读取尚未开放；未使用 Mock 数据替代真实报价。"
        tone="warning"
        quiet
      />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>

    <view v-else-if="state === 'failed_retryable'" class="quotation-content__panel app-surface" data-testid="quotation-state-retryable">
      <AppStatus message="暂时无法准备报价内容，请检查网络后重试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('retry')">重新加载</AppButton>
    </view>

    <view v-else class="quotation-content__panel app-surface" data-testid="quotation-state-terminal">
      <AppStatus message="报价内容暂不可用，请返回工单详情后再试。" tone="warning" quiet />
      <AppButton class="quotation-content__secondary-action" variant="secondary" block @tap="$emit('back')">返回工单详情</AppButton>
    </view>
  </view>
</template>

<script setup lang="ts">
import AppButton from '@shared/ui/AppButton.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import type { QuotationActionContentRead } from '@shared/ports'

defineProps<{
  readonly state: 'loading' | 'ready' | 'blocked' | 'failed_retryable' | 'failed_terminal'
  readonly content?: QuotationActionContentRead | null
}>()

defineEmits<{
  (event: 'retry'): void
  (event: 'back'): void
}>()
</script>

<style>
.quotation-content { margin-top: var(--app-space-md); }
.quotation-content__heading { display: flex; flex-direction: column; margin: 0 var(--app-space-xs) var(--app-space-md); }
.quotation-content__eyebrow { color: var(--app-color-text-secondary); font-size: var(--app-font-meta); }
.quotation-content__title { color: var(--app-color-text-primary); font-size: var(--app-font-section-title); font-weight: 800; margin-top: var(--app-space-xs); }
.quotation-content__panel { padding: var(--app-card-padding); }
.quotation-content__panel-header { align-items: center; border-bottom: 1rpx solid var(--app-color-divider); display: flex; justify-content: space-between; padding-bottom: var(--app-space-md); }
.quotation-content__panel-title { color: var(--app-color-text-primary); font-size: var(--app-font-field-label); font-weight: 800; }
.quotation-content__badge { background: var(--app-color-primary-soft); border-radius: var(--app-radius-control); color: var(--app-color-primary); font-size: var(--app-font-meta); padding: var(--app-space-xs) var(--app-space-sm); }
.quotation-content__empty { align-items: center; display: flex; flex-direction: column; padding: 56rpx var(--app-space-md) var(--app-space-lg); text-align: center; }
.quotation-content__empty-title { color: var(--app-color-text-primary); font-size: var(--app-font-value); font-weight: 800; }
.quotation-content__copy, .quotation-content__state-copy { color: var(--app-color-text-secondary); font-size: var(--app-font-body); line-height: 1.6; margin-top: var(--app-space-sm); }
.quotation-content__notice { border-top: 1rpx solid var(--app-color-divider); padding-top: var(--app-space-md); }
.quotation-content__state-copy { display: block; text-align: center; }
.quotation-content__secondary-action { margin-top: var(--app-space-md); }
</style>
