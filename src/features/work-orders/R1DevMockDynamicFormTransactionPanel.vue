<template>
  <view class="special-forms app-surface" data-testid="a-stage-special-panel">
    <view class="special-forms__header">
      <view class="special-forms__header-copy">
        <text class="special-forms__title">{{ kind === 'repeat' ? '现场复检' : '现场记录' }}</text>
      </view>
    </view>
    <view v-if="loading" class="special-forms__message" data-testid="a-special-loading">正在读取表单…</view>
    <view v-else-if="error" class="special-forms__message special-forms__message--error"
      data-testid="a-special-error" role="alert">
      <text>{{ error }}</text>
      <AppButton variant="secondary" size="compact" :disabled="busy || restoringDraft" @tap="refresh">重新读取</AppButton>
    </view>
    <template v-else-if="viewState">
      <AppStatus v-if="networkState === 'offline'" tone="warning" quiet
        message="网络不可用，可继续填写；连接恢复后请主动保存。" data-testid="a-special-offline" />
      <text v-if="draftFeedback" class="special-forms__finish-copy" data-testid="a-special-local-draft">{{ draftFeedback }}</text>
      <AppStatus v-if="operationFeedback" tone="warning" quiet
        :message="operationFeedback" data-testid="a-special-operation-feedback" />
      <view class="special-forms__task-state" data-testid="a-special-task-state">
        <text class="special-forms__task-marker">{{ viewState.receiptPending ? '结果待核对' : viewState.nodeActive ? '正在填写' : '记录已完成' }}</text>
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
          <view v-else-if="entry.editable && !localSubmissionPending && !cleanupPending && !viewState.receiptPending && viewState.nodeActive"
            class="special-forms__row-actions">
            <AppButton variant="text" size="compact" :disabled="busy || restoringDraft"
              :data-testid="`a-special-edit-${entry.id}`" @tap="edit(entry.id)">编辑</AppButton>
            <AppButton variant="text" size="compact" :disabled="busy || restoringDraft"
              :data-testid="`a-special-delete-${entry.id}`" @tap="confirmDeleteId = entry.id">删除</AppButton>
          </view>
          <view v-if="confirmDeleteId === entry.id" class="special-forms__confirmation">
            <text>确定删除这条记录？</text>
            <AppButton size="compact" :disabled="busy || restoringDraft"
              :data-testid="`a-special-confirm-delete-${entry.id}`"
              @tap="run({ kind: 'delete', id: entry.id, expectedRevision: entry.revision })">确认删除</AppButton>
            <AppButton variant="text" size="compact" @tap="confirmDeleteId = null">取消</AppButton>
          </view>
        </view>
      </view>
      <AppStatus v-if="viewState.receiptPending" tone="warning" quiet
        message="上次操作结果待核对，核对前请勿重复提交。" data-testid="a-special-receipt-pending" />
      <view v-if="localSubmissionPending" data-testid="a-special-local-submission-pending">
        <AppStatus tone="warning" quiet message="上次提交的本机内容尚待核对，禁止恢复或重复保存。请保留记录并联系支持人员核查。" />
        <view v-for="field in sealedFields.filter(row=>row.supported && Object.hasOwn(sealedValues,row.valueKey))" :key="field.fieldId" data-testid="a-special-sealed-value">
          <text>{{ field.label }}：{{ Array.isArray(sealedValues[field.valueKey]) ? `已封存列表（${(sealedValues[field.valueKey] as readonly unknown[]).length} 项）` : String(sealedValues[field.valueKey]) }}</text>
        </view>
      </view>
      <view v-else-if="cleanupPending" data-testid="a-special-cleanup-pending">
        <text>记录已保存，本机草稿清理失败。请留在当前页面重试，不要重复保存。</text>
        <AppButton :disabled="busy || restoringDraft" data-testid="a-special-cleanup-retry" @tap="retryCleanup">重试本机清理</AppButton>
      </view>
      <view v-else-if="viewState.receiptPending" class="special-forms__recovery" data-testid="a-special-recovery">
        <template v-if="viewState.pendingRecoverable">
          <text class="special-forms__finish-copy">{{ uxStateLanguage.pendingReceipt }}可只读核对最新记录，确认后解除重复提交保护。</text>
          <template v-if="viewState.pendingNeedsOriginalFields">
            <text class="special-forms__finish-copy">请逐项还原原保存的表单；所有字段必须与权威记录一致，核对期间不会重新发送业务命令。</text>
            <template v-for="field in editableFields" :key="field.fieldId">
              <view class="special-forms__field" :data-testid="`a-special-recover-field-${field.valueKey}`">
                <text class="special-forms__label">{{ field.label }} <text v-if="field.required" class="special-forms__required">*</text></text>
              <text v-if="field.type === 'file'" class="special-forms__finish-copy">
                原保存附件须与权威记录一致；可从已恢复的附件队列核对，不重新上传。
              </text>
              <R1FormFieldControl v-else :field="field" :model-value="scalarValueFor(field.valueKey)"
                :disabled="busy || restoringDraft" @update:model-value="setField(field.valueKey, $event)" />
              </view>
            </template>
          </template>
          <AppButton block variant="secondary" :loading="busy"
            :disabled="busy || restoringDraft || (viewState.pendingNeedsOriginalFields && !formValid)"
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
              :disabled="busy || restoringDraft" @update:model-value="selectDefinition" />
          </view>
          <template v-for="field in viewFields" :key="field.fieldId">
            <view v-if="field.supported && editableFieldTypes.has(field.type)"
              class="special-forms__field" :data-testid="`a-special-field-${field.valueKey}`">
              <text class="special-forms__label">{{ field.label }} <text v-if="field.required" class="special-forms__required">*</text></text>
              <template v-if="field.type === 'file'">
                <view class="special-forms__media" :data-testid="`a-special-media-${field.valueKey}`">
                  <view v-for="(item,index) in mediaValues(field.valueKey)" :key="item.url"
                    class="special-forms__media-item">
                    <text class="special-forms__media-name">{{ mediaDisplayName(item, index) }}</text>
                    <AppButton variant="text" size="compact" :disabled="busy || restoringDraft"
                      :data-testid="`a-special-media-remove-${field.valueKey}-${index}`"
                      @tap="pendingMediaRemoval = { key: field.valueKey, url: item.url }">移除</AppButton>
                  </view>
                  <view v-if="pendingMediaRemoval?.key === field.valueKey" class="special-forms__confirmation"
                    :data-testid="`a-special-media-remove-confirm-${field.valueKey}`">
                    <text>确认移除这份附件？保存修改后生效。</text>
                    <AppButton variant="text" size="compact" :disabled="busy || restoringDraft"
                      :data-testid="`a-special-media-remove-accept-${field.valueKey}`" @tap="confirmMediaRemoval">确认移除</AppButton>
                    <AppButton variant="text" size="compact" :disabled="busy || restoringDraft"
                      :data-testid="`a-special-media-remove-cancel-${field.valueKey}`" @tap="pendingMediaRemoval = null">取消</AppButton>
                  </view>
                  <view v-for="task in tasksFor(field.fieldId).filter(task => task.state !== 'uploaded')"
                    :key="task.taskId" class="special-forms__media-item">
                    <text class="special-forms__media-name">{{ mediaStatus(task) }}</text>
                    <AppButton v-if="task.state === 'failed_retryable'" variant="text" size="compact"
                      :disabled="busy || restoringDraft || task.lastError?.code === 'ambiguous_postprocess'"
                      :data-testid="`a-special-media-retry-${field.valueKey}`"
                      @tap="retryMediaTask(task.taskId)">重试</AppButton>
                    <AppButton variant="text" size="compact" :disabled="busy || restoringDraft"
                      @tap="discardMediaTask(task.taskId)">删除</AppButton>
                  </view>
                  <AppButton variant="secondary" size="compact" :disabled="busy || restoringDraft || mediaValues(field.valueKey).length + tasksFor(field.fieldId).filter(task => task.state !== 'uploaded').length >= 10"
                    :data-testid="`a-special-media-pick-${field.valueKey}`"
                    @tap="pickMediaField(field.fieldId)">添加附件</AppButton>
                </view>
              </template>
              <R1FormFieldControl v-else :field="field" :model-value="scalarValueFor(field.valueKey)"
                :disabled="busy || restoringDraft" @update:model-value="setField(field.valueKey, $event)" />
            </view>
            <view v-else class="special-forms__reference" :data-testid="`a-special-reference-${field.valueKey}`">
              <text>{{ field.label }} · {{ field.type === 'image' ? '参考图片（只读，非上传项）' : field.reason || '当前不可编辑' }}</text>
            </view>
          </template>
          <text v-if="!formValid" class="special-forms__validation" data-testid="a-special-form-validation">{{ validationMessage }}</text>
          <view class="special-forms__buttons">
            <view class="special-forms__save-button">
              <AppButton block :disabled="busy || restoringDraft || !formValid || hasPendingMedia" :loading="busy"
                data-testid="a-special-save" @tap="save">{{ editingId ? '保存修改' : '保存记录' }}</AppButton>
            </view>
            <view v-if="editingId" class="special-forms__cancel-button">
              <AppButton variant="text" :disabled="busy || restoringDraft" @tap="cancelEdit">取消</AppButton>
            </view>
          </view>
          <view v-if="kind === 'forms' && !editingId" class="special-forms__finish">
            <AppButton v-if="!confirmSaveFinish" variant="secondary" block
              :disabled="busy || restoringDraft || !formValid || hasPendingMedia" data-testid="a-special-save-finish-request"
              @tap="confirmSaveFinish = true">保存并完成节点</AppButton>
            <view v-else class="special-forms__confirmation">
              <text>确认保存本条记录，并立即完成当前节点？</text>
              <AppButton :disabled="busy || restoringDraft || !formValid || hasPendingMedia" data-testid="a-special-save-finish-confirm"
                @tap="run({ kind: 'save_finish', fields: draftValues, formDefinitionId: selectedFormDefinitionId })">确认保存并完成</AppButton>
              <AppButton variant="text" :disabled="busy || restoringDraft" @tap="confirmSaveFinish = false">返回检查</AppButton>
            </view>
          </view>
        </view>
        <view class="special-forms__finish">
          <text class="special-forms__finish-copy">{{ canFinish ? '确认记录齐全后可以完成；完成后不可再编辑。' : '请先保存至少一条有效记录。' }}</text>
          <AppButton v-if="!confirmFinish" variant="secondary" block
            :disabled="busy || restoringDraft || !canFinish" data-testid="a-special-finish-request"
            @tap="confirmFinish = true">完成现场记录</AppButton>
          <view v-else class="special-forms__confirmation">
            <text>确认记录已齐全并完成当前节点？</text>
            <AppButton :disabled="busy || restoringDraft" data-testid="a-special-finish-confirm"
              @tap="run({ kind: 'finish' })">确认完成</AppButton>
            <AppButton variant="text" :disabled="busy || restoringDraft" @tap="confirmFinish = false">返回检查</AppButton>
          </view>
        </view>
      </template>
      <AppStatus v-else tone="success" quiet :message="uxStateLanguage.syntheticNode" data-testid="a-special-complete" />
    </template>
  </view>
</template>

<script setup lang="ts">
import { useFormInputValidityScope } from '@shared/ui/form-input-validity'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodeRead } from '@shared/ports'
import type {
  AStageDynamicFormView, AStageDynamicFormAction, AStageDynamicFormNodeKind,
  AStageDynamicFormMockController, AStageDynamicFormMockControllerFactory,
} from './a-stage-dynamic-form-mock-port'
import { useSessionStore } from '@shared/state'
import AppButton from '@shared/ui/AppButton.vue'
import AppChoiceGroup from '@shared/ui/AppChoiceGroup.vue'
import R1FormFieldControl from './R1FormFieldControl.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import { uxStateLanguage } from '@shared/ui/ux-state-language'
import { projectR1LocalFields } from './r1-local-form-fields'
import { r1SpecialMockWritableTypes, validateR1SpecialMockFields, type R1SpecialMockFields } from './r1-special-mock-form-fields'
import {
  isR1FileWireArray, r1FileWireFromUpload,
  type R1FileWireValue, type MediaUploadTask, type MediaUploadTaskId,
} from '@shared/types'

const props = defineProps<{ readonly kind: AStageDynamicFormNodeKind; readonly workOrderId: string;
  readonly node: WorkflowNodeRead; readonly createController: AStageDynamicFormMockControllerFactory }>()
const emit = defineEmits<{ (event: 'changed'): void }>()
const session = useSessionStore()
const viewState = ref<AStageDynamicFormView | null>(null)
const loading = ref(true)
const restoringDraft=ref(false)
const busy = ref(false)
const error = ref('')
const operationFeedback = ref('')
const recoveryFeedback = ref('')
const localSubmissionPending=ref(false)
const sealedValues=ref<R1SpecialMockFields>({})
const sealedFields=computed(()=>selectedDefinition.value?projectR1LocalFields(selectedDefinition.value,sealedValues.value):[])
const cleanupPending = ref<{formId:string;recordId?:string;view:AStageDynamicFormView}|null>(null)
const draftValues = ref<R1SpecialMockFields>({})
const editableFieldTypes = r1SpecialMockWritableTypes
const mediaTasks = ref<readonly MediaUploadTask[]>([])
const pendingMediaRemoval = ref<{ key: string; url: string } | null>(null)
watch([draftValues, () => props.workOrderId], () => { pendingMediaRemoval.value = null })
const hasPendingMedia = computed(() => mediaTasks.value.some(task => task.state !== 'uploaded'))
function mediaDisplayName(file: R1FileWireValue, index: number): string {
  const pickedName = mediaTasks.value.find(task => task.uploadedRef?.url === file.url)?.uploadedRef?.fileName
  const name = pickedName || file.name
  return name && !/[/:\\]/.test(name) ? name : `附件 ${index + 1} · ${file.extname.toUpperCase()}`
}
const scalarValueFor = (key: string): import('./r1-local-form-fields').R1LocalFieldValue | undefined => {
  const value = draftValues.value[key]
  return isR1FileWireArray(value) ? undefined
    : value as import('./r1-local-form-fields').R1LocalFieldValue | undefined
}
const mediaValues = (key: string): readonly R1FileWireValue[] => {
  const value = draftValues.value[key]
  return isR1FileWireArray(value) ? value : []
}
const tasksFor = (fieldId: string): readonly MediaUploadTask[] =>
  mediaTasks.value.filter(task => task.scope.fieldId === fieldId)
function mediaStatus(task: MediaUploadTask): string {
  switch (task.state) {
    case 'failed_retryable':
      return task.lastError?.code === 'ambiguous_postprocess' ? '上传结果待核对' : '上传失败，可重试'
    case 'failed_terminal': return '上传失败，请移除后重新添加'
    case 'queued':
    case 'ready_to_upload': return '等待上传'
    case 'uploading': return '正在上传'
    default: return '正在处理附件'
  }
}
const selectedFormDefinitionId = ref('')
const formChoices = computed(() => viewState.value?.definitions.map(item => ({ value: item.id, label: item.label })) ?? [])
const selectedDefinition = computed(() => viewState.value?.definitions.find(
  item => item.id === selectedFormDefinitionId.value)?.definition ?? viewState.value?.definition)
function selectDefinition(id: string): void {
  if (busy.value || editingId.value || !viewState.value?.definitions.some(item => item.id === id)) return
  selectedFormDefinitionId.value = id
  draftValues.value = {}
  mediaTasks.value = []
  confirmFinish.value = false
  confirmSaveFinish.value = false
  void restoreLocalDraft().then(() => restoreMediaTasks())
}
const viewFields = computed(() => viewState.value
  ? projectR1LocalFields(selectedDefinition.value!, draftValues.value) : [])
const editableFields = computed(() => viewFields.value.filter(field => field.supported
  && editableFieldTypes.has(field.type)))
const validation = computed(() => viewState.value
  ? validateR1SpecialMockFields(selectedDefinition.value!, draftValues.value)
  : { ok: false as const, message: '表单尚未载入。' })
const inputsValid = useFormInputValidityScope()
const formValid = computed(() => inputsValid.value && validation.value.ok)
const validationMessage = computed(() => validation.value.ok ? '' : validation.value.message)

async function restoreMediaTasks(): Promise<void> {
  const current = controller, formId = selectedFormDefinitionId.value
  const recordId = editingId.value ?? undefined, ticket = revision, changes = editRevision
  if (!current || !formId) return
  try {
    const tasks = await current.listMediaTasks(formId, recordId)
    if (ticket !== revision || changes !== editRevision || editingId.value !== (recordId ?? null)
      || formId !== selectedFormDefinitionId.value) return
    mediaTasks.value = tasks
    const next = { ...draftValues.value }
    let changed = false
    for (const field of viewFields.value.filter(item => item.type === 'file' && item.supported)) {
      const currentValues = mediaValues(field.valueKey)
      const uploaded = tasks.filter(task => task.scope.fieldId === field.fieldId
        && task.state === 'uploaded' && task.uploadedRef)
        .flatMap(task => task.uploadedRef ? [r1FileWireFromUpload(task.uploadedRef)] : [])
        .filter((ref): ref is R1FileWireValue => ref !== null)
      const merged = [...currentValues]
      for (const ref of uploaded) if (!merged.some(value => value.url === ref.url)) merged.push(ref)
      if (merged.length !== currentValues.length && isR1FileWireArray(merged)) {
        next[field.valueKey] = merged
        changed = true
      }
    }
    if (changed) { draftValues.value = next; editRevision++; persistLocalDraft() }
  } catch { if (ticket === revision) operationFeedback.value = '附件队列暂时无法恢复，请重新打开后核对。' }
}
async function pickMediaField(fieldId: string): Promise<void> {
  if (busy.value || !controller) return
  busy.value = true
  operationFeedback.value = ''
  const ticket = revision
  try {
    const result = await controller.pickMedia(selectedFormDefinitionId.value, fieldId, editingId.value ?? undefined)
    if (ticket !== revision) return
    if (result.state === 'failed') operationFeedback.value = result.message ?? '附件未完成上传。'
  } finally {
    if (ticket === revision) { busy.value = false; await restoreMediaTasks() }
  }
}
async function retryMediaTask(taskId: MediaUploadTaskId): Promise<void> {
  if (busy.value || !controller) return
  busy.value = true
  const ticket = revision
  try {
    const ok = await controller.retryMedia(selectedFormDefinitionId.value, taskId, editingId.value ?? undefined)
    if (ticket === revision && !ok) operationFeedback.value = '附件重试未完成，已保留原队列。'
  } finally { if (ticket === revision) { busy.value = false; await restoreMediaTasks() } }
}
async function discardMediaTask(taskId: MediaUploadTaskId): Promise<void> {
  if (busy.value || !controller) return
  busy.value = true
  const ticket = revision
  try {
    if (!await controller.discardMedia(selectedFormDefinitionId.value, taskId, editingId.value ?? undefined)
      && ticket === revision) operationFeedback.value = '删除本机附件失败，原队列已保留。'
  } finally { if (ticket === revision) { busy.value = false; await restoreMediaTasks() } }
}
async function confirmMediaRemoval(): Promise<void> {
  const pending = pendingMediaRemoval.value
  if (!pending || busy.value) return
  const index = mediaValues(pending.key).findIndex(file => file.url === pending.url)
  pendingMediaRemoval.value = null
  if (index >= 0) await removeMediaValue(pending.key, index)
}
async function removeMediaValue(key: string, index: number): Promise<void> {
  const values = mediaValues(key), file = values[index]
  if (busy.value || !file) return
  const field = viewFields.value.find(item => item.valueKey === key && item.supported && item.type === 'file')
  if (!field) return
  const ticket = revision
  const task = mediaTasks.value.find(item => item.scope.fieldId === field.fieldId
    && item.scope.valueKey === key && item.uploadedRef?.url === file.url)
  if (task && controller) {
    busy.value = true
    try {
      const ok = await controller.discardMedia(selectedFormDefinitionId.value, task.taskId, editingId.value ?? undefined)
      if (ticket !== revision) return
      if (!ok) { operationFeedback.value = '附件尚未安全移除，请重试。'; return }
      mediaTasks.value = mediaTasks.value.filter(item => item.taskId !== task.taskId)
    } catch {
      if (ticket === revision) operationFeedback.value = '附件尚未安全移除，请重试。'
      return
    } finally { if (ticket === revision) busy.value = false }
  }
  if (ticket === revision) setField(key, values.filter((_, i) => i !== index))
}
function setField(key: string, value: R1SpecialMockFields[string]): void {
  if (busy.value || restoringDraft.value || !viewState.value) return
  const field = viewFields.value.find(item => item.valueKey === key && item.supported)
  if (!field?.supported || !editableFieldTypes.has(field.type)
    || (typeof value === 'string' && value.length > 4000)
    || (Array.isArray(value) && !(isR1FileWireArray(value)
      || value.length <= 30 && value.every(item => typeof item === 'string' && item.length <= 256)))) return
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
const editingRevision = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const confirmFinish = ref(false)
const confirmSaveFinish = ref(false)
const canFinish = computed(() => Boolean(viewState.value?.entries.some(row =>
  row.state === 'active' && (props.kind === 'forms' || row.editable))))
let revision = 0
let loadRevision = 0
let controller: AStageDynamicFormMockController | null = null
const draftFeedback = ref('')
const networkState = ref<import('@shared/ports').NetworkStatus>('unknown')
let unsubscribeNetwork: (() => void) | undefined
let draftWrites: Promise<boolean> = Promise.resolve(true)
let editRevision = 0
function draftRecordId(): string | undefined {
  return editingId.value
    ?? (viewState.value?.receiptPending ? viewState.value.pendingDraftRecordId : undefined)
}
function persistLocalDraft(): void {
  const current = controller, formId = selectedFormDefinitionId.value, recordId = draftRecordId()
  if (!current || !formId) return
  const values = { ...draftValues.value }, ticket = revision
  draftFeedback.value = '正在保存到本机…'
  draftWrites = draftWrites.catch(() => false).then(async () => {
    if (ticket !== revision) return false
    const saved = await current.writeDraft(formId, values, recordId)
    if (ticket === revision) draftFeedback.value = saved ? '已保存到本机，尚未提交' : '本机保存失败，请保留当前页面后重试'
    return saved && ticket === revision
  }).catch(() => { if (ticket === revision) draftFeedback.value = '本机保存失败，请保留当前页面后重试';return false })
}
async function waitLocalWrites(ticket:number):Promise<boolean> {
  while (ticket === revision) {
    const latest=draftWrites
    const ok=await latest
    if(ticket!==revision)return false
    if(latest!==draftWrites)continue
    return ok && !cleanupPending.value
  }
  return false
}
async function flushLocalDraft():Promise<boolean>{
  return !busy.value && Boolean(controller) && await waitLocalWrites(revision)
}
defineExpose({flushLocalDraft})
async function restoreLocalDraft(): Promise<void> {
  const current = controller, formId = selectedFormDefinitionId.value, recordId = draftRecordId()
  const ticket = revision, changes = editRevision
  if (!current || !formId) return
  restoringDraft.value=true
  try {
    await draftWrites
    const pending=await current.isDraftSubmissionPending(formId,recordId)
    if(ticket!==revision)return
    localSubmissionPending.value=pending
    if(pending){
      const sealed=await current.readSealedDraft(formId,recordId);if(ticket!==revision)return
      sealedValues.value=sealed??{};draftFeedback.value='上次提交的本机内容已封存，尚待核对。';return
    }
    const values = await current.readDraft(formId, recordId)
    if (ticket !== revision || changes !== editRevision || formId !== selectedFormDefinitionId.value
      || recordId !== draftRecordId()) return
    if (values) {
      draftValues.value = values
      draftFeedback.value = viewState.value?.receiptPending
        ? '本机草稿已保留，提交结果待核对'
        : '已恢复本机草稿，尚未提交'
    }
    else draftFeedback.value = ''
  } catch { if (ticket === revision) {localSubmissionPending.value=true;draftFeedback.value = '本机草稿读取失败，原草稿已保留'} }
  finally{if(ticket===revision)restoringDraft.value=false}
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
  session.session?.sessionRef, session.session?.user.id, session.session?.currentRole?.id, session.session?.roleVersion] as const,
() => {
  revision++
  busy.value = false
  restoringDraft.value=false
  editRevision++
  unsubscribeNetwork?.()
  viewState.value = null
  error.value = ''
  operationFeedback.value = ''
  recoveryFeedback.value = ''
  cleanupPending.value = null
  localSubmissionPending.value=false
  sealedValues.value={}
  draftWrites = Promise.resolve(true)
  draftValues.value = {}
  mediaTasks.value = []
  selectedFormDefinitionId.value = ''
  editingId.value = null
  editingRevision.value = null
  confirmDeleteId.value = null
  confirmFinish.value = false
  confirmSaveFinish.value = false
  const owner=revision
  controller = props.createController({ kind: props.kind,
    workOrderId: props.workOrderId, getActor: () => owner===revision ? actor() : null })
  const current = controller
  const ticket = revision
  unsubscribeNetwork = current.network.subscribe(status => {
    if (ticket === revision) networkState.value = status
  })
  void current.network.current().then(status => { if (ticket === revision) networkState.value = status })
  void refresh().then(async () => { await restoreLocalDraft(); await restoreMediaTasks() })
}, { immediate: true })
onBeforeUnmount(() => { revision++; unsubscribeNetwork?.(); controller = null })
function edit(id: string): void {
  const row = viewState.value?.entries.find(entry => entry.id === id && entry.editable)
  if (!row) return
  editingId.value = id
  mediaTasks.value = []
  editingRevision.value = row.revision ?? null
  selectedFormDefinitionId.value = row.formDefinitionId
  draftValues.value = { ...row.values }
  confirmDeleteId.value = null
  confirmFinish.value = false
  confirmSaveFinish.value = false
  editRevision++
  void restoreLocalDraft().then(() => restoreMediaTasks())
}
function cancelEdit(restoreDraft = true): void {
  editingId.value = null
  editingRevision.value = null
  mediaTasks.value = []
  draftValues.value = {}
  editRevision++
  if (restoreDraft) void restoreLocalDraft().then(() => restoreMediaTasks())
}
async function save(): Promise<void> {
  const action: AStageDynamicFormAction = editingId.value
    ? { kind: 'edit', id: editingId.value, fields: draftValues.value, formDefinitionId: selectedFormDefinitionId.value,
      ...(editingRevision.value ? { expectedRevision: editingRevision.value } : {}) }
    : { kind: 'save', fields: draftValues.value, formDefinitionId: selectedFormDefinitionId.value }
  await run(action)
}
async function run(action: AStageDynamicFormAction): Promise<void> {
  if ('fields' in action && !inputsValid.value) return
  const current = controller
  if (!current || busy.value || restoringDraft.value || localSubmissionPending.value || cleanupPending.value || hasPendingMedia.value) return
  busy.value = true
  error.value = ''
  operationFeedback.value = ''
  const ticket = revision
  try {
    if(!await waitLocalWrites(ticket)){
      // A completed edit advances the local generation. Read the newer row for
      // conflict feedback without dispatching through the stale editor.
      if(action.kind==='edit'&&action.expectedRevision){
        await refresh()
        if(ticket!==revision||current!==controller)return
        const row=viewState.value?.entries.find(entry=>entry.id===action.id)
        if(row?.revision&&row.revision!==action.expectedRevision){
          operationFeedback.value='记录已被其他编辑器更新，请核对最新记录。';return
        }
      }
      operationFeedback.value='本机草稿尚未安全保存，请保留页面后重试。';return
    }
    const savedDefinition = selectedFormDefinitionId.value, savedRecord = editingId.value ?? undefined
    if('fields' in action && await current.network.current()!=='offline'){
      if(ticket!==revision)return
      const sealed=await current.sealDraftForSubmission(savedDefinition,action.fields,savedRecord).catch(()=>false)
      if(ticket!==revision||current!==controller)return
      if(!sealed){operationFeedback.value='本机提交保护尚未安全保存，请保留页面后重试。';return}
    }
    if(ticket!==revision)return
    const result = await current.execute(action)
    if (ticket !== revision) return
    if (result.state !== 'succeeded') {
      await refresh()
      if (ticket === revision) {
        operationFeedback.value = result.message
        const pending=await current.isDraftSubmissionPending(savedDefinition,savedRecord).catch(()=>true)
        if(ticket!==revision||current!==controller)return
        localSubmissionPending.value=pending
        if (viewState.value?.receiptPending && !draftFeedback.value.includes('失败')) {
          draftFeedback.value = '本机草稿已保留，提交结果待核对'
        }
      }
      return
    }
    if (action.kind === 'save' || action.kind === 'edit' || action.kind === 'save_finish') {
      const cleaned = await current.finalizeMedia(savedDefinition, savedRecord)
      if (!cleaned && ticket === revision) operationFeedback.value = '记录已保存，部分本机附件待清理。'
      const removed = await current.removeDraft(savedDefinition, savedRecord).catch(()=>false)
      if (ticket !== revision) return
      if(!removed){
        cleanupPending.value={formId:savedDefinition,recordId:savedRecord,view:result.view}
        viewState.value=result.view;draftFeedback.value='记录已保存，本机草稿清理失败，请保留页面重试。'
        return
      }
    }
    viewState.value = result.view
    draftFeedback.value = ''
    cancelEdit(false)
    confirmDeleteId.value = null
    confirmFinish.value = false
    confirmSaveFinish.value = false
    emit('changed')
  } finally { if (ticket === revision) busy.value = false }
}
async function retryCleanup():Promise<void>{
  const pending=cleanupPending.value,current=controller,ticket=revision
  if(!pending||!current||busy.value)return
  busy.value=true
  try{
    const removed=await current.removeDraft(pending.formId,pending.recordId).catch(()=>false)
    if(ticket!==revision||cleanupPending.value!==pending||!removed)return
    cleanupPending.value=null;viewState.value=pending.view;draftFeedback.value=''
    cancelEdit(false);emit('changed')
  }finally{if(ticket===revision)busy.value=false}
}
async function recoverCompleted(): Promise<void> {
  const current = controller
  if (!current || busy.value || !viewState.value?.pendingRecoverable) return
  busy.value = true
  operationFeedback.value = ''
  recoveryFeedback.value = ''
  const ticket = revision
  try {
    const before = viewState.value
    const formId = before?.pendingFormDefinitionId ?? selectedFormDefinitionId.value
    const recordId = before?.pendingDraftRecordId
    const result = await current.recoverCompleted(draftValues.value)
    if (ticket !== revision) return
    if (result.state !== 'succeeded') { recoveryFeedback.value = result.message; return }
    let mediaFinalized = true
    let draftRemoved = true
    if (before?.pendingNeedsOriginalFields && formId) {
      try { mediaFinalized = await current.finalizeMedia(formId, recordId) }
      catch { mediaFinalized = false }
      try { draftRemoved = await current.removeDraft(formId, recordId) }
      catch { draftRemoved = false }
    }
    if (ticket !== revision) return
    if(!draftRemoved && formId){
      cleanupPending.value={formId,recordId,view:result.view}
      viewState.value=result.view;draftFeedback.value='记录已核对，本机草稿清理失败，请保留当前页面并重试。'
      return
    }
    viewState.value = result.view
    cancelEdit(false)
    if (!mediaFinalized) operationFeedback.value = '记录已核对，部分本机附件待清理。'
    if (!draftRemoved) draftFeedback.value = '记录已核对，本机草稿清理失败，请保留当前页面并重试。'
    else draftFeedback.value = ''
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
.special-forms__count,.special-forms__record-summary,.special-forms__muted,.special-forms__finish-copy { display:block; font-size:26rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__task-state { margin-top: 12rpx; }
.special-forms__task-marker { font-weight: 600; font-size: 26rpx; color: var(--app-color-text-secondary); }
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
.special-forms__reference { margin-top:16rpx; padding:16rpx 18rpx; border-radius:12rpx; background:var(--app-color-surface, #f5f7fa); color:var(--app-color-text-secondary); font-size:26rpx; }
.special-forms__validation { display:block; margin-top:16rpx; font-size:26rpx; color:#985919; }
.special-forms__required { color:#b55343; }
.special-forms__buttons { margin-top:22rpx; }
.special-forms__save-button { flex:1 1 0; min-width:0; }
.special-forms__cancel-button { flex:0 0 auto; min-width:96rpx; }
.special-forms__finish-copy { margin-bottom:16rpx; }
.special-forms__message,.special-forms__empty { display:block; padding:24rpx 0; font-size:25rpx; line-height:1.5; color:var(--app-color-text-secondary); }
.special-forms__message--error { color:#985919; }
.special-forms__confirmation { flex-wrap:wrap; padding:16rpx 0; font-size:24rpx; }
.special-forms__media { display:flex; flex-direction:column; align-items:flex-start; gap:12rpx; }
.special-forms__media-item { display:flex; align-items:center; gap:12rpx; width:100%; box-sizing:border-box; padding:12rpx 16rpx; border:1rpx solid var(--app-color-border); border-radius:12rpx; }
.special-forms__media-name { flex:1; min-width:0; overflow-wrap:anywhere; font-size:25rpx; }
</style>
