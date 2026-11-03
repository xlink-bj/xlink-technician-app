<template>
  <view class="special-forms app-surface" data-testid="a-stage-special-panel">
    <view class="special-forms__header">
      <view class="special-forms__header-copy">
        <text class="special-forms__title">{{ kind === 'repeat' ? '现场复检' : '现场记录' }}</text>
        <text class="special-forms__subtitle">{{ kind === 'repeat' ? '每次复检单独保存，确认齐全后完成' : '按当前表单填写检查结论，保存后可补充记录' }}</text>
      </view>
    </view>
    <view v-if="loading" class="special-forms__message" data-testid="a-special-loading">正在读取表单…</view>
    <view v-else-if="error" class="special-forms__message special-forms__message--error"
      data-testid="a-special-error" role="alert">
      <text>{{ error }}</text>
      <AppButton variant="secondary" size="compact" :disabled="busy" @tap="refresh">重新读取</AppButton>
    </view>
    <template v-else-if="viewState">
      <AppStatus v-if="networkState === 'offline'" tone="warning" quiet
        message="网络不可用，可继续填写；连接恢复后请主动保存。" data-testid="a-special-offline" />
      <text v-if="draftFeedback" class="special-forms__finish-copy" data-testid="a-special-local-draft">{{ draftFeedback }}</text>
      <AppStatus v-if="operationFeedback" tone="warning" quiet
        :message="operationFeedback" data-testid="a-special-operation-feedback" />
      <view class="special-forms__task-state" data-testid="a-special-task-state">
        <text class="special-forms__task-marker">{{ viewState.receiptPending ? '结果待核对' : viewState.nodeActive ? '正在填写' : '记录已完成' }}</text>
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
          <text class="special-forms__finish-copy">{{ uxStateLanguage.pendingReceipt }}可只读核对最新记录，确认后解除重复提交保护。</text>
          <template v-if="viewState.pendingNeedsOriginalFields">
            <text class="special-forms__finish-copy">请逐项还原原保存的表单；所有字段必须与权威记录一致，核对期间不会重新发送业务命令。</text>
            <template v-for="field in editableFields" :key="field.fieldId">
              <view class="special-forms__field" :data-testid="`a-special-recover-field-${field.valueKey}`">
                <text class="special-forms__label">{{ field.label }} <text v-if="field.required" class="special-forms__required">*</text></text>
              <R1FormFieldControl :field="field" :model-value="draftValues[field.valueKey]"
                :disabled="busy" @update:model-value="setField(field.valueKey, $event)" />
              </view>
            </template>
          </template>
          <AppButton block variant="secondary" :loading="busy"
            :disabled="busy || (viewState.pendingNeedsOriginalFields && !formValid)"
            data-testid="a-special-recover" @tap="recoverCompleted">只读核对并恢复</AppButton>
        </template>
        <AppStatus v-else tone="warning" quiet
          message="保存结果尚未完全确认，暂不能再次提交。请联系支持人员核查。"
          data-testid="a-special-unresolved" />
        <AppStatus v-if="recoveryFeedback" tone="warning" quiet
          :message="recoveryFeedback" data-testid="a-special-recovery-feedback" />
      </view>
      <template v-else-if="viewState.nodeActive">
        <view class="special-forms__editor">
          <text class="special-forms__section-title">{{ editingId ? '编辑已保存记录' : '新增一条记录' }}</text>
          <view v-if="kind === 'forms' && !editingId && viewState.definitions.length > 1"
            class="special-forms__field" data-testid="a-special-definition-choice">
            <text class="special-forms__label">记录类型</text>
            <AppChoiceGroup :options="formChoices" :model-value="selectedFormDefinitionId"
              :disabled="busy" @update:model-value="selectDefinition" />
          </view>
          <template v-for="field in viewFields" :key="field.fieldId">
            <view v-if="field.supported && editableFieldTypes.has(field.type)"
              class="special-forms__field" :data-testid="`a-special-field-${field.valueKey}`">
              <text class="special-forms__label">{{ field.label }} <text v-if="field.required" class="special-forms__required">*</text></text>
              <R1FormFieldControl :field="field" :model-value="draftValues[field.valueKey]"
                :disabled="busy" @update:model-value="setField(field.valueKey, $event)" />
            </view>
            <view v-else class="special-forms__reference" :data-testid="`a-special-reference-${field.valueKey}`">
              <text>{{ field.label }} · {{ field.type === 'image' ? '参考图片（只读，非上传项）' : field.reason || '当前不可编辑' }}</text>
            </view>
          </template>
          <text v-if="!formValid" class="special-forms__validation" data-testid="a-special-form-validation">{{ validationMessage }}</text>
          <view class="special-forms__buttons">
            <view class="special-forms__save-button">
              <AppButton block :disabled="busy || !formValid" :loading="busy"
                data-testid="a-special-save" @tap="save">{{ editingId ? '保存修改' : '保存记录' }}</AppButton>
            </view>
            <view v-if="editingId" class="special-forms__cancel-button">
              <AppButton variant="text" :disabled="busy" @tap="cancelEdit">取消</AppButton>
            </view>
          </view>
          <view v-if="kind === 'forms' && !editingId" class="special-forms__finish">
            <text class="special-forms__finish-copy">也可将本条记录保存后立即完成节点；确认后不可继续编辑。</text>
            <AppButton v-if="!confirmSaveFinish" variant="secondary" block
              :disabled="busy || !formValid" data-testid="a-special-save-finish-request"
              @tap="confirmSaveFinish = true">保存并完成节点</AppButton>
            <view v-else class="special-forms__confirmation">
              <text>确认保存本条记录，并立即完成当前节点？</text>
              <AppButton :disabled="busy || !formValid" data-testid="a-special-save-finish-confirm"
                @tap="run({ kind: 'save_finish', fields: draftValues, formDefinitionId: selectedFormDefinitionId })">确认保存并完成</AppButton>
              <AppButton variant="text" :disabled="busy" @tap="confirmSaveFinish = false">返回检查</AppButton>
            </view>
          </view>
        </view>
        <view class="special-forms__finish">
          <text class="special-forms__finish-copy">{{ canFinish ? '确认记录齐全后可以完成；完成后不可再编辑。' : '请先保存至少一条有效记录。' }}</text>
          <AppButton v-if="!confirmFinish" variant="secondary" block
            :disabled="busy || !canFinish" data-testid="a-special-finish-request"
            @tap="confirmFinish = true">完成现场记录</AppButton>
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
import type {
  AStageSpecialView, AStageSpecialAction, AStageSpecialKind,
  AStageSpecialMockController, AStageSpecialMockControllerFactory,
} from './a-stage-special-mock-port'
import { useSessionStore } from '@shared/state'
import AppButton from '@shared/ui/AppButton.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import R1FormFieldControl from './R1FormFieldControl.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { uxStateLanguage } from '@shared/ui/ux-state-language'
import { projectR1LocalFields } from './r1-local-form-fields'
import { r1SpecialMockWritableTypes, validateR1SpecialMockFields, type R1SpecialMockFields } from './r1-special-mock-form-fields'

const props = defineProps<{ readonly kind: AStageSpecialKind; readonly workOrderId: string;
  readonly node: WorkflowNodeRead; readonly createController: AStageSpecialMockControllerFactory }>()
const emit = defineEmits<{ (event: 'changed'): void }>()
const session = useSessionStore()
const viewState = ref<AStageSpecialView | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const operationFeedback = ref('')
const recoveryFeedback = ref('')
const draftValues = ref<R1SpecialMockFields>({})
const editableFieldTypes = r1SpecialMockWritableTypes
const selectedFormDefinitionId = ref('')
const formChoices = computed(() => viewState.value?.definitions.map(item => ({ value: item.id, label: item.label })) ?? [])
const selectedDefinition = computed(() => viewState.value?.definitions.find(
  item => item.id === selectedFormDefinitionId.value)?.definition ?? viewState.value?.definition)
function selectDefinition(id: string): void {
  if (busy.value || editingId.value || !viewState.value?.definitions.some(item => item.id === id)) return
  selectedFormDefinitionId.value = id
  draftValues.value = {}
  confirmFinish.value = false
  confirmSaveFinish.value = false
  void restoreLocalDraft()
}
const viewFields = computed(() => viewState.value
  ? projectR1LocalFields(selectedDefinition.value!, draftValues.value) : [])
const editableFields = computed(() => viewFields.value.filter(field => field.supported
  && editableFieldTypes.has(field.type)))
const validation = computed(() => viewState.value
  ? validateR1SpecialMockFields(selectedDefinition.value!, draftValues.value)
  : { ok: false as const, message: '表单尚未载入。' })
const formValid = computed(() => validation.value.ok)
const validationMessage = computed(() => validation.value.ok ? '' : validation.value.message)
function setField(key: string, value: string | number | boolean | readonly string[]): void {
  if (busy.value || !viewState.value) return
  const field = viewFields.value.find(item => item.valueKey === key)
  if (!field?.supported || !editableFieldTypes.has(field.type)
    || (typeof value === 'string' && value.length > 4000)
    || (Array.isArray(value) && (value.length > 30 || value.some(item => item.length > 256)))) return
  // Keep partially typed decimals ("1.", "-", etc.) visible until Submit.
  // The shared FormDef validator normalizes once at the transaction boundary.
  const next = { ...draftValues.value }
  if (value === '' || (Array.isArray(value) && value.length === 0)) delete next[key]
  else next[key] = value
  draftValues.value = next
  editRevision++
  persistLocalDraft()
}
const editingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const confirmFinish = ref(false)
const confirmSaveFinish = ref(false)
const canFinish = computed(() => Boolean(viewState.value?.entries.some(row =>
  row.state === 'active' && (props.kind === 'forms' || row.editable))))
let revision = 0
let loadRevision = 0
let controller: AStageSpecialMockController | null = null
const draftFeedback = ref('')
const networkState = ref<import('@shared/ports').NetworkStatus>('unknown')
let unsubscribeNetwork: (() => void) | undefined
let draftWrites: Promise<unknown> = Promise.resolve()
let editRevision = 0
function persistLocalDraft(): void {
  const current = controller, formId = selectedFormDefinitionId.value, recordId = editingId.value ?? undefined
  if (!current || !formId) return
  const values = { ...draftValues.value }, ticket = revision
  draftFeedback.value = '正在保存到本机…'
  draftWrites = draftWrites.catch(() => undefined).then(async () => {
    const saved = await current.writeDraft(formId, values, recordId)
    if (ticket === revision) draftFeedback.value = saved ? '已保存到本机，尚未提交' : '本机保存失败，请保留当前页面后重试'
  }).catch(() => { if (ticket === revision) draftFeedback.value = '本机保存失败，请保留当前页面后重试' })
}
async function restoreLocalDraft(): Promise<void> {
  const current = controller, formId = selectedFormDefinitionId.value, recordId = editingId.value ?? undefined
  const ticket = revision, changes = editRevision
  if (!current || !formId) return
  try {
    await draftWrites
    const values = await current.readDraft(formId, recordId)
    if (ticket !== revision || changes !== editRevision || formId !== selectedFormDefinitionId.value
      || recordId !== (editingId.value ?? undefined)) return
    if (values) { draftValues.value = values; draftFeedback.value = '已恢复本机草稿，尚未提交' }
    else draftFeedback.value = ''
  } catch { if (ticket === revision) draftFeedback.value = '本机草稿读取失败，原草稿已保留' }
}
function actor() {
  const current = session.session
  return current?.user.id && current.currentRole?.id && current.sessionRef
    ? { userId: String(current.user.id), roleId: String(current.currentRole.id),
        identity: JSON.stringify([current.sessionRef, current.user.id,
          current.currentRole.id, current.roleVersion ?? null]) }
    : null
}
async function refresh(): Promise<void> {
  const ticket = revision, loadTicket = ++loadRevision
  const current = controller
  if (!current) return
  loading.value = true
  error.value = ''
  recoveryFeedback.value = ''
  try {
    const next = await current.load()
    if (revision !== ticket || loadTicket !== loadRevision) return
    viewState.value = next
    if (next.pendingFormDefinitionId) selectedFormDefinitionId.value = next.pendingFormDefinitionId
    else if (!next.definitions.some(item => item.id === selectedFormDefinitionId.value)) {
      selectedFormDefinitionId.value = String(next.definition.id)
    }
  } catch {
    if (revision === ticket && loadTicket === loadRevision) error.value = '当前记录未能安全读取，请重新进入工单后再试。'
  } finally { if (revision === ticket && loadTicket === loadRevision) loading.value = false }
}
watch(() => [props.kind, props.workOrderId, props.node.id,
  session.session?.sessionRef, session.session?.currentRole?.id, session.session?.roleVersion] as const,
() => {
  revision++
  busy.value = false
  editRevision++
  unsubscribeNetwork?.()
  viewState.value = null
  error.value = ''
  operationFeedback.value = ''
  recoveryFeedback.value = ''
  draftValues.value = {}
  selectedFormDefinitionId.value = ''
  editingId.value = null
  confirmDeleteId.value = null
  confirmFinish.value = false
  confirmSaveFinish.value = false
  controller = props.createController({ kind: props.kind,
    workOrderId: props.workOrderId, getActor: actor })
  const current = controller
  const ticket = revision
  unsubscribeNetwork = current.network.subscribe(status => {
    if (ticket === revision) networkState.value = status
  })
  void current.network.current().then(status => { if (ticket === revision) networkState.value = status })
  void refresh().then(() => restoreLocalDraft())
}, { immediate: true })
onBeforeUnmount(() => { revision++; unsubscribeNetwork?.(); controller = null })
function edit(id: string): void {
  const row = viewState.value?.entries.find(entry => entry.id === id && entry.editable)
  if (!row) return
  editingId.value = id
  selectedFormDefinitionId.value = row.formDefinitionId
  draftValues.value = { ...row.values }
  confirmDeleteId.value = null
  confirmFinish.value = false
  confirmSaveFinish.value = false
  editRevision++
  void restoreLocalDraft()
}
function cancelEdit(): void { editingId.value = null; draftValues.value = {}; editRevision++; void restoreLocalDraft() }
async function save(): Promise<void> {
  const action: AStageSpecialAction = editingId.value
    ? { kind: 'edit', id: editingId.value, fields: draftValues.value, formDefinitionId: selectedFormDefinitionId.value }
    : { kind: 'save', fields: draftValues.value, formDefinitionId: selectedFormDefinitionId.value }
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
    await draftWrites
    const savedDefinition = selectedFormDefinitionId.value, savedRecord = editingId.value ?? undefined
    const result = await current.execute(action)
    if (ticket !== revision) return
    if (result.state !== 'succeeded') {
      await refresh()
      if (ticket === revision) operationFeedback.value = result.message
      return
    }
    if (action.kind === 'save' || action.kind === 'edit' || action.kind === 'save_finish') {
      await current.removeDraft(savedDefinition, savedRecord)
      if (ticket !== revision) return
    }
    viewState.value = result.view
    draftFeedback.value = ''
    cancelEdit()
    confirmDeleteId.value = null
    confirmFinish.value = false
    confirmSaveFinish.value = false
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
    const result = await current.recoverCompleted(draftValues.value)
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
.special-forms__field { margin-top:20rpx; }
.special-forms__reference { margin-top:16rpx; padding:16rpx 18rpx; border-radius:12rpx; background:var(--app-color-surface, #f5f7fa); color:var(--app-color-text-secondary); font-size:23rpx; }
.special-forms__validation { display:block; margin-top:16rpx; font-size:23rpx; color:#985919; }
.special-forms__required { color:#b55343; }
.special-forms__buttons { margin-top:22rpx; }
.special-forms__save-button { flex:1 1 0; min-width:0; }
.special-forms__cancel-button { flex:0 0 auto; min-width:96rpx; }
.special-forms__finish-copy { margin-bottom:16rpx; }
.special-forms__message,.special-forms__empty { display:block; padding:24rpx 0; font-size:25rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__message--error { color:#985919; }
.special-forms__confirmation { flex-wrap:wrap; padding:16rpx 0; font-size:24rpx; }
</style>
