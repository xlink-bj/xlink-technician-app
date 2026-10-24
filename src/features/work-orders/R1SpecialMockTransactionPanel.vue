<template>
  <view class="special-forms app-surface" data-testid="a-stage-special-panel">
    <view class="special-forms__header">
      <view class="special-forms__header-copy">
        <text class="special-forms__title">{{ kind === 'repeat' ? '现场复检记录' : '现场表单记录' }}</text>
        <text class="special-forms__subtitle">{{ kind === 'repeat' ? '每次记录单独保存' : '可新增、编辑或移除记录' }}</text>
      </view>
      <text class="special-forms__scope">Mock · 未提交后台</text>
    </view>
    <AppStatus class="special-forms__notice" quiet
      message="当前为合成工单，保存与完成操作仅写入本机 Mock 协议记录。" />
    <view v-if="loading" class="special-forms__message" data-testid="a-special-loading">正在读取表单…</view>
    <view v-else-if="error" class="special-forms__message special-forms__message--error"
      data-testid="a-special-error" role="alert">
      <text>{{ error }}</text>
      <AppButton variant="secondary" size="compact" :disabled="busy" @tap="refresh">重新读取</AppButton>
    </view>
    <template v-else-if="viewState">
      <view class="special-forms__section-heading">
        <text>已保存记录</text>
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
            <AppButton variant="text" size="compact" :disabled="busy" @tap="edit(entry.id)">编辑</AppButton>
            <AppButton variant="text" size="compact" :disabled="busy" @tap="confirmDeleteId = entry.id">删除</AppButton>
          </view>
          <view v-if="confirmDeleteId === entry.id" class="special-forms__confirmation">
            <text>确定删除这条记录？</text>
            <AppButton size="compact" :disabled="busy" @tap="run({ kind: 'delete', id: entry.id })">确认删除</AppButton>
            <AppButton variant="text" size="compact" @tap="confirmDeleteId = null">取消</AppButton>
          </view>
        </view>
      </view>
      <AppStatus v-if="viewState.receiptPending" tone="warning" quiet
        message="上一笔操作结果尚未核对，已保留防重复提交记录。请停止操作并核查。"
        data-testid="a-special-receipt-pending" />
      <template v-else-if="viewState.nodeActive">
        <view class="special-forms__editor">
          <text class="special-forms__section-title">{{ editingId ? '修改现场记录' : '新增现场记录' }}</text>
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
          <text class="special-forms__finish-copy">完成当前节点后不能再编辑这些记录。</text>
          <AppButton v-if="!confirmFinish" variant="secondary" block
            :disabled="busy || !canFinish" data-testid="a-special-finish-request"
            @tap="confirmFinish = true">完成当前节点</AppButton>
          <view v-else class="special-forms__confirmation">
            <text>确认记录已齐全并完成当前节点？</text>
            <AppButton :disabled="busy" @tap="run({ kind: 'finish' })">确认完成</AppButton>
            <AppButton variant="text" :disabled="busy" @tap="confirmFinish = false">返回检查</AppButton>
          </view>
        </view>
      </template>
      <AppStatus v-else tone="success" quiet message="当前节点已完成（仅本机 Mock）。" data-testid="a-special-complete" />
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

const props = defineProps<{ readonly kind: AStageSpecialKind; readonly workOrderId: string;
  readonly node: WorkflowNodeRead }>()
const emit = defineEmits<{ (event: 'changed'): void }>()
const session = useSessionStore()
const viewState = ref<AStageSpecialView | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
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
  const ticket = revision
  try {
    const result = await current.execute(action)
    if (ticket !== revision) return
    if (result.state !== 'succeeded') { error.value = result.message; await refresh(); return }
    viewState.value = result.view
    cancelEdit()
    confirmDeleteId.value = null
    confirmFinish.value = false
    emit('changed')
  } finally { if (ticket === revision) busy.value = false }
}
</script>

<style scoped>
.special-forms { margin-top: 22rpx; padding: 30rpx 28rpx; border-radius: var(--app-radius-card); }
.special-forms__header,.special-forms__section-heading,.special-forms__record,.special-forms__buttons,.special-forms__row-actions,.special-forms__confirmation { display:flex; align-items:center; gap:16rpx; }
.special-forms__header,.special-forms__section-heading { justify-content:space-between; }
.special-forms__header-copy,.special-forms__record-main { flex:1; min-width:0; }
.special-forms__title { display:block; font-size:var(--app-font-section-title); font-weight:700; color:var(--app-color-text-primary); }
.special-forms__subtitle,.special-forms__scope,.special-forms__notice,.special-forms__count,.special-forms__record-summary,.special-forms__muted,.special-forms__finish-copy { display:block; font-size:23rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__scope { flex-shrink:0; }
.special-forms__notice { margin-top:18rpx; }
.special-forms__section-heading { margin-top:28rpx; margin-bottom:8rpx; font-weight:700; font-size:29rpx; color:var(--app-color-text-primary); }
.special-forms__record { align-items:flex-start; border-top:1rpx solid var(--app-color-border); min-height:100rpx; padding:22rpx 0; }
.special-forms__record-index { color:var(--app-color-text-secondary); font-size:25rpx; min-width:30rpx; }
.special-forms__record-title { display:block; font-size:27rpx; font-weight:600; color:var(--app-color-text-primary); }
.special-forms__record-summary { margin-top:8rpx; overflow-wrap:anywhere; }
.special-forms__row-actions { margin-top:10rpx; }
.special-forms__editor,.special-forms__finish { border-top:1rpx solid var(--app-color-border); margin-top:22rpx; padding-top:24rpx; }
.special-forms__section-title { display:block; font-size:29rpx; font-weight:700; color:var(--app-color-text-primary); margin-bottom:20rpx; }
.special-forms__label { display:block; font-size:26rpx; font-weight:600; margin-bottom:12rpx; }
.special-forms__required { color:#b55343; }
.special-forms__buttons { margin-top:22rpx; }
.special-forms__finish-copy { margin-bottom:16rpx; }
.special-forms__message,.special-forms__empty { display:block; padding:24rpx 0; font-size:25rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__message--error { color:#985919; }
.special-forms__confirmation { flex-wrap:wrap; padding:16rpx 0; font-size:24rpx; }
</style>
