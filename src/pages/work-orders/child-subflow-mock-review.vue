<template>
  <view class="child-review-page">
    <view v-if="!authorized" class="child-review-blocked">
      <text class="child-review-title">开发预览不可用</text>
      <text class="child-review-note">仅限已登录的 DEV Mock 合成账号；不会读取真实工单或流程。</text>
      <navigator class="child-review-return" url="/pages/work-orders/work-orders">返回工单</navigator>
    </view>

    <template v-else>
      <view class="child-review-intro">
        <text class="child-review-eyebrow">DEV MOCK · 合成数据</text>
        <text class="child-review-title">子流程节点 · 只读预览</text>
        <text class="child-review-note">本页复用真实子流程面板以检查布局及安全提示。节点全部为本地构造，不调用 R1 接口，也不代表已经取得表单操作权限。</text>
      </view>

      <view class="child-review-scenarios" aria-label="合成验收场景">
        <AppButton v-for="option in childSubflowMockScenarios" :key="option.value"
          size="compact" :variant="scenario === option.value ? 'primary' : 'secondary'"
          @tap="chooseScenario(option.value)">{{ option.label }}</AppButton>
      </view>

      <R1ProductionChildFormsPanel
        :parents="parents"
        :selected-parent-id="selectedParentId"
        :nodes="visibleNodes"
        :state="panelState"
        :error="null"
        :repeat-by-node="{}"
        @load-child="showSyntheticNodes"
      />

      <text class="child-review-footer">模拟模式不提供重复记录读取、表单编辑、工作流推进、签约或业务提交。</text>
      <navigator class="child-review-return" url="/pages/work-orders/work-orders">返回工单</navigator>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  childSubflowMockScenarios, readChildSubflowMock,
  type ChildSubflowMockScenario,
} from '@app/child-subflow-mock-review'
import R1ProductionChildFormsPanel from '@features/work-orders/R1ProductionChildFormsPanel.vue'
import type { WorkOrderDetailLoadState } from '@features/work-orders/detail'
import type { WorkflowNodeRead } from '@shared/ports'
import { useSessionStore } from '@shared/state'
import AppButton from '@shared/ui/AppButton.vue'

const session = useSessionStore()
const routeId = ref('')
const scenario = ref<ChildSubflowMockScenario>('mixed')
const selectedParentId = ref<string | null>(null)

onLoad((options) => {
  routeId.value = typeof options?.id === 'string' ? options.id : ''
})

const snapshot = computed(() => readChildSubflowMock({
  workOrderId: routeId.value,
  userId: session.session?.user.id,
  roleId: session.session?.currentRole?.id,
  scenario: scenario.value,
}))
const authorized = computed(() => session.status === 'authenticated' && snapshot.value.kind !== 'blocked')
const parents = computed<readonly WorkflowNodeRead[]>(() =>
  snapshot.value.kind === 'blocked' ? [] : [snapshot.value.parent])
const visibleNodes = computed<readonly WorkflowNodeRead[]>(() =>
  selectedParentId.value && snapshot.value.kind === 'ready' ? snapshot.value.nodes : [])
const panelState = computed<WorkOrderDetailLoadState>(() => {
  if (!selectedParentId.value) return 'idle'
  return snapshot.value.kind === 'read_error' ? 'failed_retryable'
    : snapshot.value.kind === 'ready' ? 'succeeded' : 'idle'
})

function chooseScenario(next: ChildSubflowMockScenario): void {
  if (!authorized.value || !childSubflowMockScenarios.some(item => item.value === next)) return
  scenario.value = next
  selectedParentId.value = null
}

function showSyntheticNodes(parentNodeId: string): void {
  if (!authorized.value || String(parents.value[0]?.id ?? '') !== parentNodeId) return
  selectedParentId.value = parentNodeId
}
</script>

<style scoped>
.child-review-page { background: var(--app-color-page); min-height: 100vh; padding: 24rpx 28rpx calc(48rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.child-review-intro { display: flex; flex-direction: column; gap: 12rpx; margin: 6rpx 0 24rpx; }
.child-review-eyebrow { color: var(--app-color-primary); font-size: var(--app-font-field-label); font-weight: 700; }
.child-review-title { color: var(--app-color-text-primary); font-size: var(--app-font-major-title); font-weight: 750; }
.child-review-note, .child-review-footer { color: var(--app-color-text-secondary); font-size: var(--app-font-body); line-height: 1.6; }
.child-review-scenarios { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 18rpx; }
.child-review-footer { display: block; margin: 24rpx 0; }
.child-review-return { color: var(--app-color-primary); display: block; font-size: var(--app-font-body); font-weight: 700; padding: 20rpx 0; text-align: center; }
.child-review-blocked { display: flex; flex-direction: column; gap: 22rpx; justify-content: center; min-height: 75vh; text-align: center; }
</style>
