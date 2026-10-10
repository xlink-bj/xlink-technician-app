<template>
  <view v-if="!authorized" class="signing-review-blocked" data-testid="signing-mock-blocked">
    <text class="signing-review-title">签约演示不可用</text>
    <text class="signing-review-help">仅开发环境的隔离 Mock 账号可查看；不会连接真实合同或签名服务。</text>
    <navigator class="signing-review-back" open-type="navigateBack" :delta="1">返回</navigator>
  </view>
  <ActionWorkspaceShell
    v-else
    class="signing-review-page"
    customer-name="本地签约样例"
    display-number="MOCK-019"
    lifecycle="available"
    draft-status="clean"
    :can-submit="false"
    submit-label="签约操作不可用"
  >
    <view class="signing-review-lead app-surface" data-testid="signing-mock-workbench">
      <text class="signing-review-eyebrow">DEV MOCK · 独立正式订单样本</text>
      <text class="signing-review-title">签约工作台</text>
      <text class="signing-review-help">参考 R1：按正式订单查看合同。这里的两个 type=1 订单是独立合成数据，不由本机报价草稿生成，也不代表流程已完成。</text>
    </view>

    <view class="signing-review-section app-surface">
      <text class="signing-review-section-title">状态与异常场景</text>
      <text class="signing-review-help">仅切换本页只读展示，不会申请签约、发短信、生成 PDF、同步合同或推进流程。</text>
      <view class="signing-review-chips">
        <AppButton
          v-for="item in signingMockScenarios"
          :key="item.value"
          variant="secondary"
          :pressed="scenario === item.value"
          @tap="scenario = item.value"
        >{{ item.label }}</AppButton>
      </view>
    </view>

    <view v-if="view.kind === 'no_orders'" class="signing-review-section app-surface" data-testid="signing-mock-empty">
      <text class="signing-review-section-title">当前工单暂无正式订单</text>
      <text class="signing-review-help">不能从本机草稿直接发起签约。请等待真实报价 Action 生成经后端确认的正式订单。</text>
    </view>
    <view v-else-if="view.kind === 'read_error'" class="signing-review-section app-surface" data-testid="signing-mock-error">
      <text class="signing-review-section-title">签约资料暂时无法读取</text>
      <text class="signing-review-help">这是合成读取失败状态。真实接口接入前不会自动重试或调用合同同步服务。</text>
    </view>
    <view v-else-if="view.kind === 'blocked'" class="signing-review-section app-surface" data-testid="signing-mock-scope-blocked">
      <text class="signing-review-section-title">订单不可访问</text>
      <text class="signing-review-help">{{ view.reason }}</text>
    </view>
    <template v-else>
      <view class="signing-review-section app-surface" data-testid="signing-mock-orders">
        <text class="signing-review-section-title">当前工单的正式订单样本</text>
        <text class="signing-review-help">R1 允许同一工单关联多个正式订单；签约必须明确指向其中一个。</text>
        <view class="signing-review-order-options">
          <AppButton
            v-for="order in view.orders"
            :key="order.id"
            variant="secondary"
            :pressed="selectedOrderId === order.id"
            @tap="chooseOrder(order.id)"
          >{{ order.title }}</AppButton>
        </view>
        <view class="signing-review-summary">
          <text class="signing-review-caption">当前订单 · {{ view.selectedOrder.title }}</text>
          <text class="signing-review-content">{{ view.selectedOrder.parts.join(' / ') }} · {{ view.selectedOrder.parts.length }} 个维修部位</text>
          <text class="signing-review-help">正式订单身份为纯合成 fixture。未展示真实金额、客户信息或订单内容。</text>
        </view>
      </view>

      <view class="signing-review-section app-surface" data-testid="signing-mock-contract">
        <text class="signing-review-section-title">合同与签署状态</text>
        <template v-if="view.contract">
          <text class="signing-review-caption">{{ view.contract.displayNumber }}</text>
          <text class="signing-review-state" data-testid="signing-mock-state">{{ signingMockStateLabel(view.contract.demoState) }}</text>
          <text class="signing-review-help">签约状态为 UI 演示概念，不是后端 contractStatus 枚举或远程签署结果。</text>
        </template>
        <template v-else>
          <text class="signing-review-state" data-testid="signing-mock-no-contract">尚无已验证的合同</text>
          <text class="signing-review-help">即便存在正式订单，也不能据此假定合同已生成或当前技术员有发起权限。</text>
        </template>
      </view>

      <view class="signing-review-section app-surface" data-testid="signing-mock-disabled-actions">
        <text class="signing-review-section-title">合同预览与签约操作</text>
        <text class="signing-review-help">合同读取授权、签署方、动态签约字段及文件访问尚未核验。R1 的电子/线下申请与状态同步均可能产生业务副作用。</text>
        <AppButton disabled block variant="secondary">预览合同 · 未开放</AppButton>
        <AppButton disabled block>发起签约 · 未开放</AppButton>
      </view>
    </template>

    <template #actions>
      <text class="signing-review-footer" data-testid="signing-mock-footer">只读 Mock · 无业务写入 / 无流程推进</text>
      <navigator class="signing-review-back" open-type="navigateBack" :delta="1">返回工单演示入口</navigator>
    </template>
  </ActionWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useSessionStore } from '@shared/state'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import {
  readSigningMock, signingMockOrderIds, signingMockScenarios, signingMockStateLabel,
  type SigningMockScenario,
} from '@app/signing-mock-review'

const session = useSessionStore()
const routeId = ref('')
const selectedOrderId = ref(signingMockOrderIds[0])
const scenario = ref<SigningMockScenario>('normal')
const shown = ref(0)
onLoad((options) => {
  routeId.value = typeof options?.id === 'string' ? options.id : ''
})
onShow(() => { shown.value += 1 })
const view = computed(() => {
  void shown.value // re-check Mock mode on page re-entry
  return readSigningMock({
    workOrderId: routeId.value,
    userId: session.session?.user.id,
    roleId: session.session?.currentRole?.id,
    orderId: selectedOrderId.value,
    scenario: scenario.value,
  })
})
const authorized = computed(() => session.status === 'authenticated' && view.value.kind !== 'blocked')
function chooseOrder(orderId: string): void {
  // A forged route/unknown id never gets promoted into a real order read.
  if (!signingMockOrderIds.includes(orderId) || !authorized.value) return
  selectedOrderId.value = orderId
  scenario.value = 'normal'
}
</script>

<style>
.signing-review-page { background: var(--app-color-page); }
.signing-review-back { border: 1rpx solid var(--app-color-border); border-radius: var(--app-radius-card); color: var(--app-color-primary); display: block; font-size: 26rpx; font-weight: 700; padding: 20rpx; text-align: center; }
.signing-review-lead, .signing-review-section { display: flex; flex-direction: column; gap: 16rpx; margin: 24rpx; padding: 28rpx; }
.signing-review-eyebrow { color: var(--app-color-primary); font-size: 22rpx; font-weight: 700; }
.signing-review-title { color: var(--app-color-text-primary); font-size: 36rpx; font-weight: 800; }
.signing-review-section-title { color: var(--app-color-text-primary); font-size: 29rpx; font-weight: 750; }
.signing-review-help { color: var(--app-color-text-secondary); font-size: 24rpx; line-height: 1.6; }
.signing-review-chips, .signing-review-order-options { display: flex; flex-wrap: wrap; gap: 12rpx; }
.signing-review-chips .app-button, .signing-review-order-options .app-button { flex-grow: 1; min-width: 170rpx; }
.signing-review-summary { border-top: 1rpx solid var(--app-color-divider); display: flex; flex-direction: column; gap: 12rpx; padding-top: 20rpx; }
.signing-review-caption { color: var(--app-color-text-secondary); font-size: 24rpx; }
.signing-review-content { color: var(--app-color-text-primary); font-size: 28rpx; font-weight: 700; }
.signing-review-state { color: var(--app-color-primary); font-size: 28rpx; font-weight: 750; }
.signing-review-footer { color: var(--app-color-text-secondary); display: block; font-size: 22rpx; margin-bottom: 16rpx; text-align: center; }
.signing-review-blocked { align-items: center; display: flex; flex-direction: column; gap: 24rpx; justify-content: center; min-height: 70vh; padding: 32rpx; text-align: center; }
.signing-review-page .action-workspace-body { padding-bottom: calc(240rpx + env(safe-area-inset-bottom)); }
</style>
