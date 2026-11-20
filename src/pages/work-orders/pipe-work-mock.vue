<template>
  <view class="pipe-page">
    <AppStatus v-if="!authorized || view === 'blocked'" tone="warning" data-testid="pipe-blocked"
      message="当前管道作业不可用，请从可用的本机演示入口重新进入。" />
    <template v-else>
      <view class="pipe-heading">
        <text class="pipe-title">{{ title }}</text>
        <text class="pipe-subtitle">本机演示 · 仅使用合成资料</text>
      </view>
      <view v-if="view === 'home'" class="pipe-card" data-testid="pipe-home">
        <text class="pipe-section">管道安装</text>
        <navigator class="pipe-nav pipe-nav--primary" :url="devPipeWorkUrl('order')" data-testid="pipe-open-create">无卡建单</navigator>
        <navigator class="pipe-nav" :url="devPipeWorkUrl('order', pipeOrderFixture.id)" data-testid="pipe-open-order">查看本机工单</navigator>
        <navigator class="pipe-nav" :url="devPipeWorkUrl('pressure', pipePressureJobId)"
          data-testid="pipe-open-pressure">测压作业 · 本机草稿</navigator>
      </view>
      <template v-else-if="view === 'pressure'">
        <PipePressureDraft v-if="pressureAuthorized" :work-order-number="detail.detail?.displayNumber || ''"
          :scope="pressureScope" :still-current="pressureStillCurrent" :load-draft="readPressureDraft"
          :write-draft="writePressureDraft" :load-history="readPressureHistory"
          @leave-blocked="pressureLeaveBlocked = $event" />
        <AppStatus v-else-if="pressureContext === 'loading'" message="正在核对本机工单和测压任务。" />
        <view v-else class="pipe-card" data-testid="pipe-pressure-unavailable">
          <AppStatus tone="warning" message="当前账号未能核对这条演示测压作业。" />
          <AppButton block variant="secondary" @tap="loadPressureContext">重新核对</AppButton>
        </view>
      </template>
      <view v-else class="pipe-card" data-testid="pipe-order">
        <AppStatus v-if="orderState === 'loading'" message="正在读取本机工单" />
        <template v-else-if="orderState === 'ready' && order">
          <text class="pipe-section" data-testid="pipe-order-number">{{ pipeOrderFixture.number }}</text>
          <AppStatus tone="success" message="已核对本机演示工单，尚未提交业务。" data-testid="pipe-order-reopened" />
          <view class="pipe-details">
            <text>管道安装 · 无服务卡</text>
            <text>{{ pipeSubjects[0].label }}</text>
            <text data-testid="pipe-order-read-note">{{ order.note }}</text>
          </view>
          <AppButton variant="secondary" block data-testid="pipe-order-reread" @tap="loadOrder">重新读取工单</AppButton>
        </template>
        <template v-else-if="orderState === 'ready' && routeId">
          <AppStatus tone="warning" message="本机没有这条演示工单。" data-testid="pipe-order-missing" />
        </template>
        <template v-else>
          <AppStatus v-if="orderState === 'failed' || orderState === 'unknown'" tone="warning"
            :message="orderState === 'unknown' ? '暂时无法确认是否已建单。请先核对本机记录。' : '本机工单读取失败，请重试。'"
            :data-testid="orderState === 'unknown' ? 'pipe-order-unknown' : 'pipe-order-read-failed'" />
          <template v-if="orderState === 'ready' || orderState === 'saving'">
            <text class="pipe-section">经营主体</text>
            <AppChoiceGroup v-model="subjectId" class="pipe-subjects" :options="pipeSubjects" :disabled="orderState === 'saving'"
              data-testid="pipe-subject-options" />
            <AppStatus v-if="subjectId !== pipeOrderFixture.subjectId" tone="warning"
              message="当前演示工匠未获该服务点建单授权。" data-testid="pipe-subject-denied" />
            <AppField label="作业说明" required data-testid="pipe-order-note">
              <AppInput v-model="note" :maxlength="80" :disabled="orderState === 'saving'" placeholder="填写演示作业说明" />
            </AppField>
            <AppButton block data-testid="pipe-order-save" :disabled="!proposedOrder" :loading="orderState === 'saving'"
              @tap="saveOrder">创建本机工单</AppButton>
          </template>
          <AppButton v-else variant="secondary" block data-testid="pipe-order-reread" @tap="loadOrder">核对本机记录</AppButton>
        </template>
      </view>
      <view v-if="view !== 'home'" class="pipe-footer">
        <navigator v-if="orderState !== 'saving' && !pressureLeaveBlocked" class="pipe-nav" :url="devPipeWorkUrl()" open-type="redirect" data-testid="pipe-back-home">返回管道作业</navigator>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBackPress, onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { createDefaultStoragePort } from '@app/composition'
import { devDeviceTask } from '@app/dev-device-action'
import { devPipeWorkAvailable, devPipeWorkUrl, withPipeDraftLock } from '@app/dev-pipe-work-mock'
import { createDeviceAction } from '@features/work-orders/device-action/device-action'
import { useWorkOrderDetailStore } from '@features/work-orders/detail'
import { useWorkOrderListStore } from '@features/work-orders/list'
import { createPipeLocalRecord } from '@features/work-orders/pipe-work/local-record'
import PipePressureDraft from '@features/work-orders/pipe-work/PipePressureDraft.vue'
import { parsePressureDraft, pipePressureJobId, pressureDraftContentIdentity, type PipePressureDraft as PressureDraftRecord } from '@features/work-orders/pipe-work/pressure-draft'
import { createNoCardOrder, parseNoCardOrder, pipeOrderFixture, pipeSubjects, type PipeOrder } from '@features/work-orders/pipe-work/no-card-order'
import { createActionDraftRepository, type ActionDraftIdentity } from '@runtimes/action'
import type { DeviceActionPort } from '@shared/ports/device-action'
import { sessionAuthorizationFingerprint } from '@shared/session-authorization'
import { useSessionStore } from '@shared/state'
import { asOpaqueId } from '@shared/types'
import AppButton from '@shared/ui/AppButton.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInput from '@shared/ui/AppInput.vue'
import AppStatus from '@shared/ui/AppStatus.vue'

const session = useSessionStore()
const list = useWorkOrderListStore()
const detail = useWorkOrderDetailStore()
const repository = createActionDraftRepository(createDefaultStoragePort())
const view = ref<'home' | 'order' | 'pressure' | 'blocked'>('home')
const title = computed(() => ({ home: '管道作业', order: '无卡建单', pressure: '测压作业', blocked: '' })[view.value])
const routeId = ref('')
const entry = ref<string | null>(null)
const environmentCurrent = ref(false)
let routeReady = false
let entered = false
const current = computed(() => {
  const actor = session.session
  if (!actor?.currentRole || session.status !== 'authenticated') return null
  return sessionAuthorizationFingerprint({
    sessionRef: actor.sessionRef, userId: actor.user.id, roleId: actor.currentRole.id, roleVersion: actor.roleVersion,
  })
})
const authorized = computed(() => environmentCurrent.value && entry.value !== null && entry.value === current.value)
function stillCurrent(): boolean {
  return authorized.value && devPipeWorkAvailable(session.session?.user.id, session.session?.currentRole?.id)
}
function gate(): boolean {
  environmentCurrent.value = devPipeWorkAvailable(session.session?.user.id, session.session?.currentRole?.id)
  return environmentCurrent.value
}

const orderState = ref<'loading' | 'ready' | 'saving' | 'failed' | 'unknown'>('loading')
const order = ref<PipeOrder | null>(null)
const subjectId = ref<string>(pipeOrderFixture.subjectId)
const note = ref('')
const proposedOrder = computed(() => createNoCardOrder(subjectId.value, note.value))
function orderRepository() {
  const actor = session.session
  if (!actor?.currentRole || !stillCurrent() || view.value !== 'order') return null
  return createPipeLocalRecord({
    repository,
    identity: {
      version: 1, userId: actor.user.id, roleId: actor.currentRole.id,
      workOrderId: asOpaqueId<'WorkOrderId'>(pipeOrderFixture.id),
      workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(pipeOrderFixture.nodeId),
      actionIntent: 'place_order', contentKind: 'composite', contentIdentity: 'pipe-no-card-order-v1',
    },
    stillCurrent: () => stillCurrent() && view.value === 'order',
    parse: parseNoCardOrder,
    withLock: withPipeDraftLock,
  })
}
async function loadOrder() {
  const records = orderRepository()
  if (!records || orderState.value === 'saving') return
  orderState.value = 'loading'
  order.value = null
  const result = await records.read()
  if (!stillCurrent() || result.state === 'blocked') return
  orderState.value = result.state
  if (result.state === 'ready') order.value = result.record
}
async function saveOrder() {
  const records = orderRepository()
  const proposal = proposedOrder.value
  if (!records || !proposal || routeId.value || order.value || orderState.value !== 'ready') return
  orderState.value = 'saving'
  const result = await records.write(proposal, null)
  if (!stillCurrent() || result.state === 'blocked') return
  if (result.state === 'saved' || result.state === 'conflict') {
    order.value = result.record
    orderState.value = 'ready'
    return
  }
  orderState.value = result.state
}
const pressureScope = { workOrderId: devDeviceTask.workOrderId, taskId: devDeviceTask.nodeId }
const pressureContext = ref<'loading' | 'ready' | 'failed'>('loading')
const pressureLeaveBlocked = ref(false)
const listedPressureWork = () => list.items.some(row => String(row.id) === pressureScope.workOrderId)
const exactPressureDetail = () => detail.loadState === 'succeeded' && String(detail.detail?.id) === pressureScope.workOrderId
const pressureAuthorized = computed(() => authorized.value && view.value === 'pressure'
  && routeId.value === pipePressureJobId && pressureContext.value === 'ready'
  && listedPressureWork() && exactPressureDetail())
const pressureStillCurrent = () => pressureAuthorized.value && stillCurrent()

async function loadPressureContext() {
  if (!stillCurrent() || view.value !== 'pressure' || routeId.value !== pipePressureJobId) return
  pressureContext.value = 'loading'
  if (!listedPressureWork()) await list.load()
  if (!stillCurrent()) return
  if (listedPressureWork()) await detail.loadFromRoute(pressureScope.workOrderId)
  if (!stillCurrent()) return
  pressureContext.value = listedPressureWork() && exactPressureDetail() ? 'ready' : 'failed'
}

function pressureIdentity(contentIdentity: string): ActionDraftIdentity | null {
  const actor = session.session
  if (!actor?.currentRole || !pressureStillCurrent()) return null
  return {
    version: 1, userId: actor.user.id, roleId: actor.currentRole.id,
    workOrderId: asOpaqueId<'WorkOrderId'>(pressureScope.workOrderId),
    workflowNodeId: asOpaqueId<'WorkflowNodeRuntimeId'>(pressureScope.taskId),
    actionIntent: 'construction', contentKind: 'composite', contentIdentity,
  }
}
function pressureRepository() {
  const identity = pressureIdentity(pressureDraftContentIdentity)
  return identity ? createPipeLocalRecord({
    repository, identity, stillCurrent: pressureStillCurrent,
    parse: value => parsePressureDraft(value, pressureScope), withLock: withPipeDraftLock,
  }) : null
}
async function readPressureDraft() {
  return pressureRepository()?.read() ?? { state: 'blocked' as const }
}
async function writePressureDraft(record: PressureDraftRecord, baseline: PressureDraftRecord | null) {
  return pressureRepository()?.write(record, baseline) ?? { state: 'blocked' as const }
}

const historyOnlyPort: DeviceActionPort = {
  async connect() { throw Error('Pressure archive has read-only access') },
  start() { throw Error('Pressure archive has read-only access') },
  cancel() {},
}
async function readPressureHistory() {
  const identity = pressureIdentity(devDeviceTask.contentIdentity)
  if (!identity) return null
  const reader = createDeviceAction({ identity, repository, port: historyOnlyPort, isCurrentScope: pressureStillCurrent })
  const restored = await reader.restore('pressure')
  const result = reader.state.value
  reader.dispose()
  if (!pressureStillCurrent() || (!restored && result.message)) return null
  return result.history
}
watch(pressureAuthorized, allowed => { if (!allowed) pressureLeaveBlocked.value = false }, { flush: 'sync' })

function refreshEntry() {
  if (!routeReady) return
  const available = gate()
  if (entered) {
    if (!available || entry.value !== current.value) entry.value = null
    return
  }
  if (!available || !current.value) return
  entered = true
  entry.value = current.value
  if (view.value === 'order') void loadOrder()
  if (view.value === 'pressure') void loadPressureContext()
}
watch(current, refreshEntry, { flush: 'sync' })
watch(authorized, valid => {
  if (!valid) {
    order.value = null
    note.value = ''
    orderState.value = 'loading'
  }
}, { flush: 'sync' })

onLoad(options => {
  const target = options?.view
  routeId.value = typeof options?.id === 'string' ? options.id : ''
  view.value = !target && !routeId.value ? 'home'
    : target === 'order' && (!routeId.value || routeId.value === pipeOrderFixture.id) ? 'order'
    : target === 'pressure' && routeId.value === pipePressureJobId ? 'pressure'
    : 'blocked'
  routeReady = true
  refreshEntry()
})
onShow(refreshEntry)
onBackPress(() => orderState.value === 'saving' || pressureLeaveBlocked.value)
onUnload(() => { routeReady = false; entry.value = null })
</script>

<style scoped>
.pipe-page { display: grid; gap: var(--app-space-md); width: 100%; max-width: 560px; box-sizing: border-box; margin: 0 auto; padding: var(--app-space-md); color: var(--app-color-text-primary); }
.pipe-heading,.pipe-card,.pipe-details { display: grid; gap: var(--app-space-sm); min-width: 0; }
.pipe-heading { padding: var(--app-space-sm) 0; }
.pipe-title { font-size: var(--app-font-major-title); font-weight: 750; }
.pipe-subtitle { font-size: var(--app-font-meta); color: var(--app-color-text-secondary); }
.pipe-card { gap: var(--app-space-md); padding: var(--app-card-padding); background: var(--app-color-surface); border: 1px solid var(--app-color-border); border-radius: var(--app-radius-card); }
.pipe-section { font-size: var(--app-font-section-title); font-weight: 700; overflow-wrap: anywhere; }
.pipe-subjects { display: grid; gap: var(--app-space-sm); }
.pipe-subjects :deep(.app-choice) { box-sizing: border-box; width: 100%; margin: 0; min-height: 44px; padding: var(--app-space-sm); color: var(--app-color-text-primary); background: var(--app-color-surface); border: 1px solid var(--app-color-border); border-radius: var(--app-radius-control); font-size: var(--app-font-body); }
.pipe-subjects :deep(.app-choice::after) { border: 0; }
.pipe-subjects :deep(.app-choice--selected) { color: var(--app-color-primary); background: var(--app-color-primary-soft); border-color: var(--app-color-primary); font-weight: 650; }
.pipe-nav { display: flex; min-height: 44px; align-items: center; justify-content: center; box-sizing: border-box; padding: var(--app-space-sm); border: 1px solid var(--app-color-border); border-radius: var(--app-radius-control); background: var(--app-color-surface); color: var(--app-color-primary); font-size: var(--app-font-body); font-weight: 650; }
.pipe-nav--primary { background: var(--app-color-primary); border-color: var(--app-color-primary); color: white; }
.pipe-details { color: var(--app-color-text-secondary); overflow-wrap: anywhere; }
</style>
