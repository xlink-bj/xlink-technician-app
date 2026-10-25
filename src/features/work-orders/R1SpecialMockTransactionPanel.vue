<template>
  <view class="special-forms app-surface" data-testid="a-stage-special-panel">
    <view class="special-forms__header">
      <view class="special-forms__header-copy">
        <text class="special-forms__title">{{ kind === 'repeat' ? '现场复检' : '现场记录' }}</text>
        <text class="special-forms__subtitle">{{ kind === 'repeat' ? '每次复检独立保存，再完成模拟节点' : '填写现场情况，保存后可补充多条记录' }}</text>
      </view>
      <text class="special-forms__scope">本机 Mock</text>
    </view>
    <AppStatus class="special-forms__notice" quiet
      message="仅保存本机模拟记录 · 未提交后台" />
    <view v-if="loading" class="special-forms__message" data-testid="a-special-loading">正在读取表单…</view>
    <view v-else-if="error" class="special-forms__message special-forms__message--error"
      data-testid="a-special-error" role="alert">
      <text>{{ error }}</text>
      <AppButton variant="secondary" size="compact" :disabled="busy" @tap="refresh">重新读取</AppButton>
    </view>
    <template v-else-if="viewState">
      <AppStatus v-if="operationFeedback" tone="warning" quiet
        :message="operationFeedback" data-testid="a-special-operation-feedback" />
      <view class="special-forms__task-state" data-testid="a-special-task-state">
        <text class="special-forms__task-marker">{{ viewState.receiptPending ? '结果待核对' : viewState.nodeActive ? '正在填写' : '本机模拟已完成' }}</text>
        <text class="special-forms__task-detail">{{ viewState.receiptPending ? '保留原有记录，先核对回执，勿重复提交' : viewState.nodeActive ? '保存每条记录后，确认齐全再完成节点' : '记录已锁定，可查看已保存内容' }}</text>
      </view>
      <view class="special-forms__section-heading">
        <text>记录列表</text>
        <text class="special-forms__count">{{ viewState.entries.filter(row => row.state === 'active').length }} 条</text>
      </view>
      <text v-if="!viewState.entries.length" class="special-forms__empty">暂无记录，可从下方新增。</text>
      <view v-for="(entry,index) in viewState.entries" :key="entry.id"
        class="special-forms__record" :data-testid="`a-special-row-${entry.id}`">
        <text class="special-forms__record-index">{{ index + 1 }}</text>
        <view class="special-forms__record-main">
          <text class="special-forms__record-title">{{ entry.title }}</text>
          <text class="special-forms__record-summary">{{ entry.summary || (entry.editable ? '已保存' : '历史记录 · 内容只读') }}</text>
          <text v-if="entry.state === 'deleted'" class="special-forms__muted">已删除</text>
          <view v-else-if="entry.editable && !viewState.receiptPending && viewState.nodeActive"
            class="special-forms__row-actions">
            <AppButton variant="text" size="compact" :disabled="busy"
              :data-testid="`a-special-edit-${entry.id}`" @tap="edit(entry.id)">编辑</AppButton>
            <AppButton variant="text" size="compact" :disabled="busy"
              :data-testid="`a-special-delete-${entry.id}`" @tap="confirmDeleteId = entry.id">删除</AppButton>
          </view>
          <view v-if="confirmDeleteId === entry.id" class="special-forms__confirmation">
            <text>确定删除这条记录？</text>
            <AppButton size="compact" :disabled="busy"
              :data-testid="`a-special-confirm-delete-${entry.id}`"
              @tap="run({ kind: 'delete', id: entry.id })">确认删除</AppButton>
            <AppButton variant="text" size="compact" @tap="confirmDeleteId = null">取消</AppButton>
          </view>
        </view>
      </view>
      <AppStatus v-if="viewState.receiptPending" tone="warning" quiet
        message="上一笔操作仍有防重复提交记录。系统不会自动重发保存或完成命令。"
        data-testid="a-special-receipt-pending" />
      <view v-if="viewState.receiptPending" class="special-forms__recovery" data-testid="a-special-recovery">
        <template v-if="viewState.pendingRecoverable">
          <text class="special-forms__finish-copy">{{ uxStateLanguage.pendingReceipt }}可只读核对最新记录，确认后仅清理本机防重回执。</text>
          <template v-if="viewState.pendingNeedsOriginalText">
            <text class="special-forms__label">原保存的现场情况 <text class="special-forms__required">*</text></text>
            <AppTextarea :model-value="summary" :maxlength="4000" :disabled="busy"
              placeholder="请填写原保存的文字；必须与权威记录一致"
              @update:model-value="summary = $event" />
          </template>
          <AppButton block variant="secondary" :loading="busy"
            :disabled="busy || (viewState.pendingNeedsOriginalText && !summary.trim())"
            data-testid="a-special-recover" @tap="recoverCompleted">只读核对并恢复</AppButton>
        </template>
        <AppStatus v-else tone="warning" quiet
          message="写入 ACK 尚未全部确认，暂不能自动解除防重保护；请联系支持人员核查。"
          data-testid="a-special-unresolved" />
        <AppStatus v-if="recoveryFeedback" tone="warning" quiet
          :message="recoveryFeedback" data-testid="a-special-recovery-feedback" />
      </view>
      <template v-else-if="viewState.nodeActive">
        <view class="special-forms__editor">
          <text class="special-forms__section-title">{{ editingId ? '编辑已保存记录' : '新增一条记录' }}</text>
          <text class="special-forms__label">现场情况 <text class="special-forms__required">*</text></text>
          <AppTextarea :model-value="summary" :maxlength="4000" :disabled="busy"
            placeholder="例如：平屋顶防水层老化，女儿墙根部出现裂缝"
            @update:model-value="summary = $event" />
          <view class="special-forms__buttons">
            <AppButton block :disabled="busy || !summary.trim()" :loading="busy"
              data-testid="a-special-save" @tap="save">{{ editingId ? '保存修改' : '保存记录' }}</AppButton>
            <AppButton v-if="editingId" variant="text" :disabled="busy" @tap="cancelEdit">取消</AppButton>
          </view>
        </view>
        <view class="special-forms__finish">
          <text class="special-forms__finish-copy">{{ canFinish ? '记录齐全后可完成模拟节点；完成后不可再编辑。' : '请先保存至少一条有效记录。' }}</text>
          <AppButton v-if="!confirmFinish" variant="secondary" block
            :disabled="busy || !canFinish" data-testid="a-special-finish-request"
            @tap="confirmFinish = true">完成模拟节点</AppButton>
          <view v-else class="special-forms__confirmation">
            <text>确认记录已齐全并完成当前节点？</text>
            <AppButton :disabled="busy" data-testid="a-special-finish-confirm"
              @tap="run({ kind: 'finish' })">确认完成</AppButton>
            <AppButton variant="text" :disabled="busy" @tap="confirmFinish = false">返回检查</AppButton>
          </view>
        </view>
      </template>
      <AppStatus v-else tone="success" quiet :message="uxStateLanguage.syntheticNode" data-testid="a-special-complete" />
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodeRead } from '@shared/ports'
import { createDefaultStoragePort } from '@app/composition'
import {
  createAStageSpecialMockController, type AStageSpecialView,
  type AStageSpecialAction, type AStageSpecialKind,
} from '@app/a-stage-special-mock-ui'
import { useSessionStore } from '@shared/state'
import AppButton from '@shared/ui/AppButton.vue'
import AppTextarea from '@shared/ui/AppTextarea.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { uxStateLanguage } from '@shared/ui/ux-state-language'

const props = defineProps<{ readonly kind: AStageSpecialKind; readonly workOrderId: string;
  readonly node: WorkflowNodeRead }>()
const emit = defineEmits<{ (event: 'changed'): void }>()
const session = useSessionStore()
const viewState = ref<AStageSpecialView | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const operationFeedback = ref('')
const recoveryFeedback = ref('')
const summary = ref('')
const editingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const confirmFinish = ref(false)
const canFinish = computed(() => Boolean(viewState.value?.entries.some(row =>
  row.state === 'active' && (props.kind === 'forms' || row.editable))))
const storage = createDefaultStoragePort()
let revision = 0
let controller: ReturnType<typeof createAStageSpecialMockController> | null = null
function actor() {
  const current = session.session
  return current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) }
    : null
}
async function refresh(): Promise<void> {
  const ticket = ++revision
  const current = controller
  if (!current) return
  loading.value = true
  error.value = ''
  recoveryFeedback.value = ''
  try {
    const next = await current.load()
    if (revision !== ticket) return
    viewState.value = next
  } catch {
    if (revision === ticket) error.value = '当前记录未能安全读取，请重新进入工单后再试。'
  } finally { if (revision === ticket) loading.value = false }
}
watch(() => [props.kind, props.workOrderId, props.node.id,
  session.session?.sessionRef, session.session?.currentRole?.id, session.session?.roleVersion] as const,
() => {
  revision++
  viewState.value = null
  error.value = ''
  operationFeedback.value = ''
  recoveryFeedback.value = ''
  summary.value = ''
  editingId.value = null
  confirmDeleteId.value = null
  confirmFinish.value = false
  controller = createAStageSpecialMockController({ kind: props.kind,
    workOrderId: props.workOrderId, storage, getActor: actor })
  void refresh()
}, { immediate: true })
onBeforeUnmount(() => { revision++; controller = null })
function edit(id: string): void {
  const row = viewState.value?.entries.find(entry => entry.id === id && entry.editable)
  if (!row) return
  editingId.value = id
  summary.value = row.summary
  confirmDeleteId.value = null
  confirmFinish.value = false
}
function cancelEdit(): void { editingId.value = null; summary.value = '' }
async function save(): Promise<void> {
  const action: AStageSpecialAction = editingId.value
    ? { kind: 'edit', id: editingId.value, summary: summary.value }
    : { kind: 'save', summary: summary.value }
  await run(action)
}
async function run(action: AStageSpecialAction): Promise<void> {
  const current = controller
  if (!current || busy.value) return
  busy.value = true
  error.value = ''
  operationFeedback.value = ''
  const ticket = revision
  try {
    const result = await current.execute(action)
    if (ticket !== revision) return
    if (result.state !== 'succeeded') {
      await refresh()
      if (ticket === revision) operationFeedback.value = result.message
      return
    }
    viewState.value = result.view
    cancelEdit()
    confirmDeleteId.value = null
    confirmFinish.value = false
    emit('changed')
  } finally { if (ticket === revision) busy.value = false }
}
async function recoverCompleted(): Promise<void> {
  const current = controller
  if (!current || busy.value || !viewState.value?.pendingRecoverable) return
  busy.value = true
  operationFeedback.value = ''
  recoveryFeedback.value = ''
  const ticket = revision
  try {
    const result = await current.recoverCompleted(summary.value)
    if (ticket !== revision) return
    if (result.state !== 'succeeded') { recoveryFeedback.value = result.message; return }
    viewState.value = result.view
    cancelEdit()
    emit('changed')
  } finally { if (ticket === revision) busy.value = false }
}
</script>

<style scoped>
.special-forms { margin-top: 22rpx; padding: 26rpx 24rpx; border-radius: var(--app-radius-card); }
.special-forms__header,.special-forms__section-heading,.special-forms__record,.special-forms__buttons,.special-forms__row-actions,.special-forms__confirmation { display:flex; align-items:center; gap:16rpx; }
.special-forms__header,.special-forms__section-heading { justify-content:space-between; }
.special-forms__header-copy,.special-forms__record-main { flex:1; min-width:0; }
.special-forms__title { display:block; font-size:var(--app-font-section-title); font-weight:700; color:var(--app-color-text-primary); }
.special-forms__subtitle,.special-forms__scope,.special-forms__notice,.special-forms__count,.special-forms__record-summary,.special-forms__muted,.special-forms__finish-copy { display:block; font-size:23rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__scope { flex-shrink:0; align-self:flex-start; background:#edf5ff; color:#2465ae; border-radius:12rpx; padding:7rpx 12rpx; font-weight:650; }
.special-forms__notice { margin-top:18rpx; }
.special-forms__task-state { margin-top:22rpx; border:1rpx solid #d7e7fc; background:#f1f7ff; border-radius:16rpx; padding:20rpx; display:flex; flex-direction:column; gap:6rpx; }
.special-forms__task-marker { font-weight:750; font-size:29rpx; color:#1d5796; }
.special-forms__task-detail { color:#4b6484; font-size:23rpx; line-height:1.5; }
.special-forms__section-heading { margin-top:28rpx; margin-bottom:8rpx; font-weight:700; font-size:29rpx; color:var(--app-color-text-primary); }
.special-forms__record { align-items:flex-start; border-top:1rpx solid var(--app-color-border); min-height:100rpx; padding:22rpx 0; }
.special-forms__record-index { color:var(--app-color-text-secondary); font-size:25rpx; min-width:30rpx; }
.special-forms__record-title { display:block; font-size:27rpx; font-weight:600; color:var(--app-color-text-primary); }
.special-forms__record-summary { margin-top:8rpx; overflow-wrap:anywhere; }
.special-forms__row-actions { margin-top:10rpx; }
.special-forms__editor,.special-forms__finish { border-top:1rpx solid var(--app-color-border); margin-top:22rpx; padding-top:24rpx; }
.special-forms__recovery { border-top:1rpx solid var(--app-color-border); margin-top:18rpx; padding-top:18rpx; }
.special-forms__section-title { display:block; font-size:29rpx; font-weight:700; color:var(--app-color-text-primary); margin-bottom:20rpx; }
.special-forms__label { display:block; font-size:26rpx; font-weight:600; margin-bottom:12rpx; }
.special-forms__required { color:#b55343; }
.special-forms__buttons { margin-top:22rpx; }
.special-forms__finish-copy { margin-bottom:16rpx; }
.special-forms__message,.special-forms__empty { display:block; padding:24rpx 0; font-size:25rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__message--error { color:#985919; }
.special-forms__confirmation { flex-wrap:wrap; padding:16rpx 0; font-size:24rpx; }
</style>
