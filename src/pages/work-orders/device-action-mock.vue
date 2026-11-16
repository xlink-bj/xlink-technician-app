<template>
  <view v-if="!authorized || !action" class="device-blocked" data-testid="device-mock-blocked">
    <text>当前设备作业不可用</text>
    <text>请从已登录的 DEV Mock 工单任务进入。</text>
  </view>
  <ActionWorkspaceShell v-else h5-navigation-fit :customer-name="detail.detail?.customerName"
    :display-number="detail.detail?.displayNumber" lifecycle="available" draft-status="clean"
    :can-submit="false" submit-label="业务提交未开放">
  <view class="device-page" data-testid="device-mock-page">
    <view class="device-header">
      <text class="device-kicker">现场作业</text>
      <text class="device-title">设备采集</text>
      <text class="device-context">{{ detail.detail?.displayNumber || '模拟工单' }} · 本机模拟任务</text>
    </view>
    <view class="device-switch" aria-label="选择作业">
      <button data-testid="device-pressure-tab" :class="{ selected: state.kind === 'pressure' }" :disabled="state.phase === 'running'" @tap="action.select('pressure')">试压</button>
      <button data-testid="device-panorama-tab" :class="{ selected: state.kind === 'panorama' }" :disabled="state.phase === 'running'" @tap="action.select('panorama')">全景采集</button>
    </view>
    <view class="device-card">
      <view class="device-card-head">
        <text class="device-card-title">{{ state.kind === 'pressure' ? '压力测量' : '现场全景' }}</text>
        <text class="device-state">{{ phaseLabel }}</text>
      </view>
      <text class="device-help">{{ state.kind === 'pressure' ? '连接模拟试压仪，记录过程与采样结果。' : '连接模拟全景相机，完成拍摄和拼接过程。' }}</text>
      <view v-if="state.phase === 'running'" class="device-progress" data-testid="device-progress">
        <view class="device-progress-track"><view :style="{ width: state.progress + '%' }" /></view>
        <text>{{ state.message }} · {{ state.progress }}%</text>
      </view>
      <text v-else-if="state.message" class="device-message" data-testid="device-message">{{ state.message }}</text>
      <view class="device-actions">
        <AppButton v-if="state.phase === 'running'" variant="secondary" data-testid="device-cancel" @tap="action.interrupt()">取消本次作业</AppButton>
        <AppButton v-if="state.phase === 'running'" variant="text" data-testid="device-disconnect" @tap="mockPort?.disconnect()">模拟断连</AppButton>
        <AppButton v-if="state.phase === 'finished'" variant="secondary" data-testid="device-new" @tap="action.select(state.kind)">新建一次作业</AppButton>
      </view>
    </view>
    <view v-if="state.result" class="device-result" data-testid="device-result">
      <view class="device-result-head"><text>本次结果</text><text>DEV Mock 合成</text></view>
      <template v-if="state.result.kind === 'pressure'">
        <text class="device-result-value">{{ state.result.samples?.at(-1)?.pressure.toFixed(2) }} <text>MPa</text></text>
        <text class="device-help">采样 0、1、2 分钟 · 合格判定待真实规则核实</text>
        <view class="device-samples"><text v-for="sample in state.result.samples" :key="sample.minute">{{ sample.minute }} 分钟　{{ sample.pressure.toFixed(2) }} MPa</text></view>
      </template>
      <template v-else>
        <view class="device-panorama-preview"><text>360°</text><text>模拟拼接预览</text></view>
        <text class="device-help">拍摄流程已结束；无真实原图或可上传文件。</text>
      </template>
      <view class="device-facts">
        <text>作业结束 <b>是</b></text>
        <text>数据完整 <b>{{ state.result.dataComplete ? '模拟采样完整' : '缺真实文件' }}</b></text>
        <text>本机保存 <b>{{ state.localSaved ? '已核对' : '未保存' }}</b></text>
        <text>上传 <b>未上传</b></text>
        <text>业务确认 <b>未确认</b></text>
      </view>
    </view>
    <text class="device-footnote">仅本机模拟，不控制真实设备；结果不会提交工单或推进流程。</text>
  </view>
  <template #actions>
    <AppButton v-if="!state.connected && state.phase !== 'finished'" block data-testid="device-connect" :disabled="state.phase === 'connecting'" @tap="action.connect">{{ state.phase === 'connecting' ? '连接中…' : '连接设备' }}</AppButton>
    <AppButton v-else-if="state.phase === 'ready'" block data-testid="device-start" @tap="action.start">{{ state.kind === 'pressure' ? '开始试压' : '开始拍摄' }}</AppButton>
    <AppButton v-else-if="state.phase === 'finished' && !state.localSaved" block data-testid="device-save" @tap="action.saveLocal">保存本机结果</AppButton>
    <AppButton v-else block disabled>{{ state.localSaved ? '已保存本机' : '作业进行中' }}</AppButton>
  </template>
  </ActionWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { createActionDraftRepository, type ActionDraftIdentity } from '@runtimes/action'
import { createDefaultStoragePort } from '@app/composition'
import { createDevMockDevicePort, devDeviceActionAvailable, devDeviceTask } from '@app/dev-device-action'
import { createDeviceAction } from '@features/work-orders/device-action/device-action'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useSessionStore } from '@shared/state'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { asOpaqueId } from '@shared/types'
import AppButton from '@shared/ui/AppButton.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'

const session = useSessionStore(), list = useWorkOrderListStore(), detail = useWorkOrderDetailStore()
const routeId = ref(''), entryFingerprint = ref<string | null>(null)
const currentFingerprint = computed(() => { const s = session.session; return sessionAuthorizationFingerprint(s ? {
  sessionRef: s.sessionRef, userId: s.user.id, roleId: s.currentRole?.id, roleVersion: s.roleVersion,
} : null) })
const authorized = computed(() => !!entryFingerprint.value && currentFingerprint.value === entryFingerprint.value
  && devDeviceActionAvailable(routeId.value) && session.status === 'authenticated'
  && detail.loadState === 'succeeded' && String(detail.detail?.id) === routeId.value
  && list.items.some(item => String(item.id) === routeId.value))
const action = shallowRef<ReturnType<typeof createDeviceAction> | null>(null)
const mockPort = shallowRef<ReturnType<typeof createDevMockDevicePort> | null>(null)
const state = computed(() => action.value?.state.value ?? { kind: 'pressure' as const, phase: 'select' as const,
  progress: 0, connected: false, result: null, localSaved: false, message: '' })
const phaseLabel = computed(() => ({ select: '待连接', connecting: '连接中', ready: '已连接',
  running: '作业中', interrupted: '已中断', finished: '已结束' })[state.value.phase])

watch(authorized, valid => {
  if (!valid) { action.value?.dispose(); action.value = null; mockPort.value = null; return }
  if (action.value || !session.session?.currentRole) return
  const s = session.session, role = s.currentRole
  if (!role) return
  const identity: ActionDraftIdentity = { version: 1, userId: s.user.id,
    roleId: role.id, workOrderId: asOpaqueId<'WorkOrderId'>(devDeviceTask.workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(devDeviceTask.nodeId),
    actionIntent: 'construction', contentKind: 'composite', contentIdentity: devDeviceTask.contentIdentity }
  const port = createDevMockDevicePort()
  mockPort.value = port
  action.value = createDeviceAction({ identity, repository: createActionDraftRepository(createDefaultStoragePort()),
    port, isCurrentScope: () => authorized.value && currentFingerprint.value === entryFingerprint.value })
  void action.value.restore()
}, { immediate: true })

onLoad(options => {
  routeId.value = typeof options?.id === 'string' ? options.id : ''
  entryFingerprint.value = currentFingerprint.value
  if (entryFingerprint.value && devDeviceActionAvailable(routeId.value)) {
    void (async () => {
      if (!list.items.some(item => String(item.id) === routeId.value)) await list.load()
      if (entryFingerprint.value !== currentFingerprint.value || !devDeviceActionAvailable(routeId.value)) return
      await detail.loadFromRoute(routeId.value)
    })()
  }
})
onUnload(() => { action.value?.dispose(); action.value = null })
</script>

<style scoped>
.device-page { padding:28rpx 0 48rpx; box-sizing:border-box; color:var(--app-color-text-primary); }
.device-header { display:flex; flex-direction:column; gap:8rpx; padding:10rpx 2rpx 26rpx; }
.device-kicker { font-size:var(--app-font-meta); color:var(--app-color-primary); font-weight:700; }
.device-title { font-size:var(--app-font-major-title); font-weight:750; }
.device-context,.device-help,.device-message,.device-footnote { font-size:var(--app-font-body); color:var(--app-color-text-secondary); line-height:1.55; }
.device-switch { display:flex; gap:12rpx; margin-bottom:22rpx; }
.device-switch button { flex:1; min-height:84rpx; margin:0; background:var(--app-color-surface); color:var(--app-color-text-secondary); border:1px solid var(--app-color-border); border-radius:var(--app-radius-control); font-size:var(--app-font-body); }
.device-switch button.selected { color:var(--app-color-primary); background:var(--app-color-primary-soft); border-color:var(--app-color-primary); font-weight:700; }
.device-card,.device-result { padding:28rpx; margin-bottom:18rpx; border-radius:var(--app-radius-card); background:var(--app-color-surface); }
.device-card-head,.device-result-head { display:flex; align-items:center; justify-content:space-between; gap:16rpx; margin-bottom:16rpx; }
.device-card-title,.device-result-head text:first-child { font-size:var(--app-font-section-title); font-weight:700; }
.device-state,.device-result-head text:last-child { color:var(--app-color-primary); font-size:var(--app-font-meta); font-weight:700; }
.device-actions { display:flex; flex-wrap:wrap; gap:12rpx; margin-top:26rpx; }
.device-progress { margin-top:24rpx; color:var(--app-color-text-secondary); font-size:var(--app-font-meta); }
.device-progress-track { height:10rpx; margin-bottom:10rpx; background:var(--app-color-primary-soft); border-radius:10rpx; overflow:hidden; }
.device-progress-track view { height:100%; background:var(--app-color-primary); transition:width .25s; }
.device-result-value { display:block; font-size:72rpx; font-weight:750; font-variant-numeric:tabular-nums; line-height:1.1; margin:16rpx 0; }
.device-result-value text { font-size:var(--app-font-body); font-weight:500; }
.device-samples,.device-facts { display:flex; flex-direction:column; margin-top:22rpx; border-top:1px solid var(--app-color-border); }
.device-samples text,.device-facts text { display:flex; justify-content:space-between; padding:15rpx 0; border-bottom:1px solid var(--app-color-border); font-size:var(--app-font-body); }
.device-facts b { font-weight:600; }
.device-panorama-preview { height:220rpx; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10rpx; background:var(--app-color-primary-soft); color:var(--app-color-primary); border-radius:var(--app-radius-control); margin-bottom:16rpx; }
.device-panorama-preview text:first-child { font-size:52rpx; font-weight:700; }
.device-footnote { display:block; margin:24rpx 4rpx; }
.device-blocked { min-height:75vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14rpx; text-align:center; color:var(--app-color-text-secondary); }
</style>
