<template>
  <view class="survey-complete-backdrop" data-testid="survey-complete-confirm"
    role="dialog" aria-modal="true">
    <view class="survey-complete-sheet">
      <view class="survey-complete-check" aria-hidden="true"><AppIcon name="complete" :size="30" /></view>
      <text class="survey-complete-title">确认完成勘查？</text>
      <text class="survey-complete-description">
        完成前请核对现场记录。确认后将按照当前工单流程处理，草稿保存不等于节点完成。
      </text>
      <view class="survey-complete-actions">
        <AppButton variant="secondary" block data-testid="survey-complete-cancel"
          @tap="$emit('cancel')">再检查一下</AppButton>
        <AppButton block data-testid="survey-complete-confirm-action"
          :disabled="!canSubmit || submitting" @tap="$emit('confirm')">确认完成</AppButton>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import AppIcon from '@shared/ui/AppIcon.vue'
import AppButton from '@shared/ui/AppButton.vue'
defineProps<{ readonly canSubmit: boolean; readonly submitting: boolean }>()
defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>()
</script>
<style>
/* S05 belongs to the reusable interaction layer, not page/footer geometry. */
.survey-complete-backdrop { position:fixed; z-index:140; inset:0; background:rgba(14,29,49,.53);
  display:flex; align-items:flex-end; justify-content:center; }
.survey-complete-sheet { box-sizing:border-box; background:var(--app-color-surface);
  border-radius:26rpx 26rpx 0 0; width:100%; max-width:960rpx;
  padding:34rpx var(--app-page-gutter) calc(30rpx + env(safe-area-inset-bottom));
  display:flex; flex-direction:column; align-items:center; text-align:center; gap:18rpx; }
.survey-complete-check { background:var(--app-color-primary-soft); color:var(--app-color-primary);
  border-radius:999rpx; width:84rpx; height:84rpx; display:flex; align-items:center; justify-content:center; }
.survey-complete-title { color:var(--app-color-text-primary); font-size:var(--app-font-section-title); font-weight:800; }
.survey-complete-description { color:var(--app-color-text-secondary); font-size:var(--app-font-body); line-height:1.55; }
.survey-complete-actions { width:100%; display:flex; gap:16rpx; margin-top:12rpx; }
.survey-complete-actions .app-button { flex:1; min-width:0; }
</style>
