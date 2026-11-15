<template>
  <view class="action-workspace-page" :class="{ 'action-workspace-page--survey': commercialSurvey, 'action-workspace-page--quotation': commercialQuotation, 'action-workspace-page--q01-entry': compactQuoteEntry, 'action-workspace-page--h5-navigation-fit': h5NavigationFit, 'xl-craft': compactQuoteEntry }" data-testid="action-workspace-shell">
    <scroll-view class="action-workspace-scroll" scroll-y enable-flex :scroll-into-view="scrollIntoView">
      <view class="action-workspace-body">
        <AppWorkOrderSummary :customer-name="customerName" :display-number="displayNumber"
          :service-district="serviceDistrict" :service-address="serviceAddress" />

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
          message="已恢复草稿"
          variant="strip"
          icon="restore"
          quiet
        />
        <AppStatus
          v-else-if="lifecycle !== 'succeeded' && displayedDraftStatus === 'save_failed'"
          class="action-workspace-draft-status"
          :message="draftFailureMessage || '草稿保存失败'"
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

    <AppActionBar class="action-workspace-footer" :class="{ 'xl-craft__action-bar': compactQuoteEntry }" :label="`当前工单操作`">
      <view class="action-workspace-footer-inner">
        <template v-if="lifecycle !== 'succeeded'">
          <template v-if="preferDefaultActions || !$slots.actions">
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
          </template>
          <slot v-else name="actions" />
        </template>
        <template v-else>
          <slot name="success-actions" />
        </template>
      </view>
    </AppActionBar>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { AppActionDraftStatus, AppActionLifecycle } from './types'
import AppButton from './AppButton.vue'
import AppActionBar from './AppActionBar.vue'
import AppWorkOrderSummary from './AppWorkOrderSummary.vue'
import AppStatus from './AppStatus.vue'

const props = defineProps<{
  readonly commercialSurvey?: boolean
  /** Same visual system as accepted Survey; Quotation-only, no behavior changes. */
  readonly commercialQuotation?: boolean
  /** Presentation only: the first quotation repair-part stage, not Workflow state. */
  readonly compactQuoteEntry?: boolean
  readonly demoSurvey?: boolean
  /** Render the shell-owned submit action even when a conditional named slot exists. */
  readonly preferDefaultActions?: boolean
  /** H5 uni-page-head occupies 44px outside the workspace's own viewport. */
  readonly h5NavigationFit?: boolean
  readonly customerName?: string
  readonly serviceAddress?: string
  readonly serviceDistrict?: string
  readonly displayNumber?: string
  readonly lifecycle: AppActionLifecycle
  readonly draftStatus: AppActionDraftStatus
  readonly draftFailureMessage?: string
  readonly transitioning?: boolean
  readonly canSubmit: boolean
  readonly submitLabel: string
  readonly scrollIntoView?: string
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
@import "@brand-ui/action-shell.scss";
</style>
