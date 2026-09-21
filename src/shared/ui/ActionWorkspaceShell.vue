<template>
  <view class="action-workspace-page" data-testid="action-workspace-shell">
    <scroll-view class="action-workspace-scroll" scroll-y enable-flex>
      <view class="action-workspace-body">
        <view class="action-workspace-context app-surface app-surface--compact" data-testid="action-workspace-context">
          <text class="action-workspace-context-label">当前工单</text>
          <view class="action-workspace-context-row">
            <text class="action-workspace-context-customer">{{ customerName || '工单' }}</text>
            <text v-if="displayNumber" class="action-workspace-context-number">#{{ displayNumber }}</text>
          </view>
        </view>

        <AppStatus
          v-if="lifecycle !== 'succeeded' && displayedDraftStatus === 'saving'"
          class="action-workspace-draft-status"
          message="正在保存…"
          variant="strip"
          quiet
        />
        <AppStatus
          v-else-if="lifecycle !== 'succeeded' && displayedDraftStatus === 'saved_local'"
          class="action-workspace-draft-status"
          message="已自动保存"
          tone="success"
          variant="strip"
          icon="complete"
          quiet
        />
        <AppStatus
          v-else-if="lifecycle !== 'succeeded' && displayedDraftStatus === 'restore_available'"
          class="action-workspace-draft-status"
          message="已恢复本地草稿"
          variant="strip"
          icon="restore"
          quiet
        />
        <AppStatus
          v-else-if="lifecycle !== 'succeeded' && displayedDraftStatus === 'save_failed'"
          class="action-workspace-draft-status"
          message="本地草稿保存失败"
          tone="warning"
          variant="strip"
          icon="warning"
          quiet
        />

        <template v-if="lifecycle !== 'succeeded'">
          <slot />
        </template>
        <template v-else>
          <slot name="success" />
        </template>

        <AppStatus
          v-if="businessFeedback"
          data-testid="action-workspace-feedback"
          class="action-workspace-business-feedback"
          :message="businessFeedback"
          tone="danger"
          quiet
        />

        <AppStatus v-if="lifecycle === 'submitting'" class="action-workspace-operation-status" message="正在提交" quiet />
      </view>
    </scroll-view>

    <view class="action-workspace-footer">
      <view class="action-workspace-footer-inner">
        <template v-if="lifecycle !== 'succeeded'">
          <slot name="actions">
            <AppButton
              data-testid="action-workspace-submit"
              class="action-workspace-submit"
              :disabled="!canSubmit || transitioning"
              :loading="lifecycle === 'submitting' || transitioning"
              block
              @tap="$emit('submit')"
            >
              {{ lifecycle === 'submitting' ? '提交中' : submitLabel }}
            </AppButton>
          </slot>
        </template>
        <template v-else>
          <slot name="success-actions" />
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { AppActionDraftStatus, AppActionLifecycle } from './types'
import AppButton from './AppButton.vue'
import AppStatus from './AppStatus.vue'

const props = defineProps<{
  readonly customerName?: string
  readonly displayNumber?: string
  readonly lifecycle: AppActionLifecycle
  readonly draftStatus: AppActionDraftStatus
  readonly transitioning?: boolean
  readonly canSubmit: boolean
  readonly submitLabel: string
  readonly businessFeedback?: string
}>()

/**
 * Keep the last stable status visible while a draft is dirty. The Runtime
 * remains authoritative; this only prevents a transient dirty -> saving
 * transition from removing a status row and reflowing Action Content.
 */
const displayedDraftStatus = ref<AppActionDraftStatus>('clean')
watch(
  () => props.draftStatus,
  (status) => {
    if (status !== 'dirty') displayedDraftStatus.value = status
  },
  { immediate: true },
)

defineEmits<{
  (event: 'exit'): void
  (event: 'submit'): void
}>()
</script>

<style>
.action-workspace-page {
  background: var(--app-color-page);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 100%;
  overflow: hidden;
  width: 100%;
}

.action-workspace-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
}

.action-workspace-body {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 960rpx;
  padding: 22rpx var(--app-page-gutter) 28rpx;
  width: 100%;
}

.action-workspace-context { padding: 22rpx var(--app-card-padding); }

.action-workspace-context-label {
  color: var(--app-color-text-secondary);
  display: block;
  font-size: var(--app-font-meta);
}

.action-workspace-context-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-top: var(--app-space-xs);
}

.action-workspace-context-customer {
  color: var(--app-color-text-primary);
  font-size: 26rpx;
  font-weight: 800;
  max-width: 72%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-workspace-context-number {
  color: var(--app-color-text-secondary);
  font-size: var(--app-font-field-label);
  font-weight: 800;
}

.action-workspace-draft-status,
.action-workspace-business-feedback,
.action-workspace-operation-status {
  display: block;
  padding-top: var(--app-space-sm);
}

.action-workspace-draft-status { margin-top: var(--app-space-sm); padding-top: 0; }

.action-workspace-footer {
  background: var(--app-color-page);
  border-top: 1rpx solid var(--app-color-border);
  box-sizing: border-box;
  flex-shrink: 0;
  padding: var(--app-space-sm) 0 calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  width: 100%;
}

.action-workspace-footer-inner {
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 960rpx;
  padding-left: var(--app-action-bar-padding-x);
  padding-right: var(--app-action-bar-padding-x);
  width: 100%;
}

</style>
