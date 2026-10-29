<template>
  <view class="commercial-quotation-page" data-testid="commercial-review-quotation">
    <AppLoadingState
      v-if="session.status !== 'authenticated' || !workspace.descriptor"
      variant="workspace"
      label="正在准备报价草稿"
    />
    <QuotationActionWorkspace
      v-else-if="workspace.descriptor.contentKind === 'quotation'"
      :content-state="workspace.quotationContentState === 'idle' ? 'loading' : workspace.quotationContentState"
      :product-review-only="true"
      @retry="reload"
      @back="back"
    />
    <AppStatus
      v-else
      message="当前演示工作流不支持报价；请返回工单详情。"
      tone="warning"
      quiet
    />
  </view>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useSessionStore } from '@shared/state'
import { useActionWorkspaceStore } from '@features/work-orders/action-workspace'
import { mockCommandScenarioIds, mockQuotationWorkflowNodeId } from '@adapters/api/mock'
import { asOpaqueId } from '@shared/types'
import QuotationActionWorkspace from '@features/work-orders/quotation/QuotationActionWorkspace.vue'
import AppLoadingState from '@shared/ui/AppLoadingState.vue'
import AppStatus from '@shared/ui/AppStatus.vue'

const session = useSessionStore()
const workspace = useActionWorkspaceStore()
watch(() => session.status, (status) => {
  if (status === 'authenticated') reload()
}, { immediate: true })

function reload(): void {
  void workspace.ensureLoaded({
    workOrderId: asOpaqueId<'WorkOrderId'>(mockCommandScenarioIds.quotationFoundation),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(mockQuotationWorkflowNodeId),
    actionIntent: 'place_order',
  })
}
function back(): void {
  void workspace.flushDraft()
  uni.navigateBack()
}
</script>

<style scoped>
.commercial-quotation-page { min-height: 100vh; }
</style>
