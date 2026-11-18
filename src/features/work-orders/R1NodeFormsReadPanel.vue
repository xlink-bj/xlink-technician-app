<template>
  <view data-testid="r1-normal-form-read" :class="{'form-read--commercial':commercial}">
    <slot v-if="archiveEditing" name="archive-edit-experience" :context="archiveEditPresentation" :busy="busy"
      :feedback="feedback.tone === 'error' ? displayMessage : ''" />
    <template v-else-if="appointmentArchive">
      <view class="archive-heading" :class="{ 'archive-summary-heading': appointmentArchive.summary }"><text class="archive-title">预约信息</text>
        <navigator v-if="visibleSnapshot?.records.length && !busy && (appointmentArchive.summary || appointmentArchive.recordId)" class="archive-link" data-testid="appointment-archive-open"
          :url="appointmentArchive.route(appointmentArchive.summary && visibleSnapshot.records.length === 1 ? String(visibleSnapshot.records[0]!.id) : undefined)">
          {{ appointmentArchive.summary ? (visibleSnapshot.records.length === 1 ? '查看详情' : `查看全部 ${visibleSnapshot.records.length} 条`) : '全部预约' }} ›
        </navigator>
      </view>
      <text v-if="loading" class="archive-hint" data-testid="appointment-archive-loading">正在读取预约记录…</text>
      <view v-else-if="!visibleSnapshot" class="archive-failure" data-testid="appointment-archive-error">
        <text class="archive-hint">{{ displayMessage || '预约记录尚未读取' }}</text>
        <AppButton variant="text" size="compact" :disabled="busy" @tap="load">重新读取</AppButton>
      </view>
      <template v-else>
        <text v-if="!visibleSnapshot.records.length" class="archive-hint" data-testid="appointment-archive-empty">暂无预约记录</text>
        <text v-else-if="appointmentArchive.summary && visibleSnapshot.records.length > 1" class="archive-copy">共 {{ visibleSnapshot.records.length }} 条预约，请选择记录查看</text>
        <view v-else-if="appointmentArchive.summary" :class="{ 'appointment-preview': appointmentSummaryFields.length }"
          data-testid="appointment-archive-summary">
          <view v-for="field in appointmentSummaryFields" :key="field.fieldId" class="archive-copy appointment-preview__row">
            <text>{{ field.label }}<text class="appointment-preview__separator">：</text></text><text class="appointment-preview__value">{{ field.text }}</text>
          </view>
        </view>
        <template v-else>
          <text v-if="displayMessage && feedback.tone !== 'neutral'" class="archive-hint" role="status" data-testid="r1-normal-form-read-message">{{ displayMessage }}</text>
          <text v-if="appointmentArchive.recordId && !archiveRecords.length" class="archive-hint" data-testid="appointment-record-unavailable">这条预约暂不可查看，请返回全部预约重新选择。</text>
          <navigator v-for="(record,index) in !appointmentArchive.recordId ? visibleSnapshot.records : []" :key="String(record.id)"
            :url="appointmentArchive.route(String(record.id))" class="archive-entry archive-navigator" :data-testid="`appointment-record-${record.id}`">
            <view class="archive-heading"><text class="archive-entry-title">预约记录 {{ index + 1 }}</text><text class="archive-link">查看详情 ›</text></view>
            <text v-for="field in appointmentPreview(record)" :key="field.fieldId" class="archive-copy">{{ field.label }}：{{ field.text }}</text>
          </navigator>
          <view v-for="record in archiveRecords" :key="String(record.id)" data-testid="appointment-record-detail">
            <AppInformationRow v-for="field in appointmentReadFields(record)" :key="field.fieldId" :data-testid="`r1-normal-value-${field.valueKey}`">
              <template #label>{{ field.label }}</template><template #value>{{ field.text }}</template>
            </AppInformationRow>
            <AppButton v-if="canEditAppointment(String(record.id))" data-testid="appointment-modify" @tap="edit(String(record.id))">修改预约</AppButton>
            <text v-else class="archive-hint" data-testid="appointment-read-only">此预约当前仅可查看，不能修改。</text>
          </view>
        </template>
      </template>
    </template>
    <template v-else>
    <text v-if="!commercial" class="form-read__hint">读取当前工单节点已保存的记录。查看不会保存或推进流程。</text>
    <AppButton variant="secondary" size="compact" :disabled="loading || busy || fileBusy || fileCancelling || draftWorking" @tap="load">
      {{ loading ? '正在读取…' : '读取已保存表单' }}
    </AppButton>
    <text v-if="displayMessage" class="form-read__hint" :class="`form-read__hint--${feedback.tone}`" data-testid="r1-normal-form-read-message">{{ displayMessage }}</text>
    <view v-if="draftMessage" class="form-read__draft" data-testid="r1-normal-draft-status" aria-live="polite">
      <text class="form-read__hint">{{ draftMessage }}</text>
      <AppButton v-if="draftRead?.state === 'recoverable'" variant="secondary" :disabled="draftWorking" data-testid="r1-normal-draft-restore" @tap="restoreDraft">恢复填写</AppButton>
      <AppButton v-if="draftRead && draftRead.state !== 'empty' && draftRead.state !== 'uncertain' && !confirmDraftDiscard" variant="text" :disabled="draftWorking" data-testid="r1-normal-draft-discard" @tap="confirmDraftDiscard = true">丢弃本地草稿</AppButton>
      <template v-if="confirmDraftDiscard">
        <text class="form-read__hint">确认丢弃未提交的本地内容？此操作不会删除后台记录。</text>
        <AppButton variant="secondary" :disabled="draftWorking" data-testid="r1-normal-draft-discard-confirm" @tap="discardDraft">确认丢弃</AppButton>
        <AppButton variant="text" :disabled="draftWorking" data-testid="r1-normal-draft-keep" @tap="confirmDraftDiscard = false">保留草稿</AppButton>
      </template>
    </view>
    <template v-if="visibleSnapshot">
      <text v-if="!actions && visibleSnapshot.definition.fields?.some(field => field.type==='file')" class="form-read__hint" data-testid="r1-normal-file-unavailable">此表单的附件配置或授权尚不支持新增图片。</text>
      <text v-if="!visibleSnapshot.records.length && (!commercial || !actions || actions.locked())" class="form-read__hint" data-testid="r1-normal-form-empty">暂无已保存记录。</text>
      <view v-for="(record,index) in visibleSnapshot.records" :key="String(record.id)" class="form-read__record" data-testid="r1-normal-form-record">
        <text class="form-read__title">{{ visibleSnapshot.node.displayName || '现场记录' }} · {{ index + 1 }}</text>
        <view v-for="group in readGroups(record)" :key="group.key" :class="{'form-read__group':commercial}"
          :data-testid="commercial?'s01-source-group':undefined">
          <AppTaskSectionHeading v-if="commercial && (group.title || group.kind==='number' && group.fields.length>1)"
            :title="group.title || '数值信息'" icon="task" tone="measure" status="已保存" />
        <view v-for="field in group.fields" :key="field.fieldId" class="form-read__field">
          <slot v-if="$slots['read-field'] && readFieldOverride?.(visibleSnapshot, record, field)"
            name="read-field" :snapshot="visibleSnapshot" :record="record" :field="field" />
          <template v-else>
            <text class="form-read__label">{{ field.label }}</text>
            <text v-if="!readFiles(record,field)" class="form-read__value" :data-testid="`r1-normal-value-${field.valueKey}`">{{ field.text }}</text>
            <R1NormalFileField v-if="readFiles(record,field)" :field="field"
              :model-value="record.values?.[field.valueKey]" :retained="retainedReadFiles(record,field)" :commercial="commercial" />
          </template>
        </view>
        </view>
        <text v-if="actions?.editProblem?.(String(record.id))" class="form-read__hint"
          :data-testid="`r1-normal-edit-status-${record.id}`">{{ actions.editProblem(String(record.id)) }}</text>
        <AppButton v-if="actions?.canEdit?.(String(record.id)) && !actions.locked()" variant="secondary" size="compact"
          :disabled="busy || loading" :data-testid="`r1-normal-edit-${record.id}`" @tap="edit(String(record.id))">编辑记录</AppButton>
      </view>
      <template v-if="actions && !actions.locked()">
        <AppButton v-if="(visibleSnapshot.records.length || fileEditorClosed) && actions.canCreate?.() && !editing" variant="secondary"
          :disabled="busy || loading" data-testid="r1-normal-append" @tap="beginCreate">新增记录</AppButton>
        <view v-if="editing || (!visibleSnapshot.records.length && !fileEditorClosed)" class="form-read__record" data-testid="r1-normal-create">
          <text v-if="!commercial" class="form-read__title">{{ visibleSnapshot.node.displayName || '新增现场记录' }}</text>
          <slot v-if="$slots['edit-experience'] && editPresentation" name="edit-experience" :context="editPresentation" />
          <template v-else>
          <view v-for="group in editGroups" :key="group.key" :class="{'form-read__group':commercial}"
            :data-testid="commercial?'s01-source-group':undefined">
            <AppTaskSectionHeading v-if="commercial && (group.title || group.kind==='number' && group.fields.length>1)"
              :title="group.title || '数值信息'" icon="appointment" tone="measure" status="按实际填写" />
            <view :class="{'form-read__group-fields':commercial}">
          <template v-for="field in group.fields" :key="field.fieldId">
            <AppField v-if="field.visible" :label="field.label" :required="field.required" :data-testid="`r1-normal-input-${field.valueKey}`" :optional="commercial && !field.required" :read-only="commercial && field.readOnly"
              :class="{'form-read__numeric':commercial && (field.type==='number' || field.type==='digit')}">
              <R1NormalFileField v-if="field.supported && field.type==='file' && (actions.fileMedia || actions.retainedFiles)" :field="field" :commercial="commercial"
                :model-value="values[field.valueKey]" :draft="values" :media="actions.fileMedia" :retained="actions.retainedFiles" :allow-retained-removal="actions.retainedFiles" :disabled="busy || loading || fileCancelling || draftBlocked || draftWorking"
                @update:model-value="setFileValue(field.fieldId,field.valueKey,$event)" />
              <R1FormFieldControl v-else-if="field.supported" :field="field" :model-value="scalarValueFor(field.valueKey)"
                :disabled="busy || loading || fileCancelling || draftBlocked || draftWorking" @update:model-value="setValue(field.valueKey, $event)" />
              <text v-else class="form-read__hint">{{ field.reason || '当前字段不可编辑' }}</text>
            </AppField>
          </template>
            </view>
          </view>
          <template v-if="!commercial">
          <AppButton :disabled="loading || busy || fileCancelling || draftBlocked || draftWorking || !validDraft" :loading="busy" data-testid="r1-normal-save" @tap="save(false)">保存记录</AppButton>
          <AppButton v-if="actions.canSaveAndComplete?.()" variant="secondary" :disabled="loading || busy || fileCancelling || draftBlocked || draftWorking || !validDraft"
            data-testid="r1-normal-save-complete-request" @tap="confirmSaveCompletion = true">保存并完成</AppButton>
          <template v-if="confirmSaveCompletion">
            <text class="form-read__hint">确认保存本条记录并完成当前节点？</text>
            <AppButton :disabled="loading || busy || fileCancelling || draftBlocked || draftWorking || !validDraft" :loading="busy" data-testid="r1-normal-save-complete-confirm" @tap="save(true)">确认保存并完成</AppButton>
            <AppButton variant="text" :disabled="busy" @tap="confirmSaveCompletion = false">返回检查</AppButton>
          </template>
          </template>
          </template>
          <AppButton v-if="!commercial && (editing || actions.fileMedia)" variant="text" :disabled="busy || fileCancelling" :loading="fileCancelling" data-testid="r1-normal-edit-cancel" @tap="cancelEdit">{{ actions.fileMedia && !editingId ? '取消本次新增' : '取消编辑' }}</AppButton>
          <text v-if="!commercial" class="form-read__hint">保存仅保存本条记录，不会完成当前节点或进入下一阶段。</text>
        </view>
        <view v-if="!commercial && visibleSnapshot.records.length && !editing && (actions.canComplete ? actions.canComplete() : true)" class="form-read__record">
          <AppButton v-if="!confirmCompletion" variant="secondary" :disabled="busy" data-testid="r1-normal-complete-request"
            @tap="confirmCompletion = true">完成当前节点</AppButton>
          <template v-else>
            <text class="form-read__hint">确认已保存记录齐全，完成当前节点并由后台生成下一阶段？</text>
            <AppButton :disabled="busy" :loading="busy" data-testid="r1-normal-complete-confirm" @tap="complete">确认完成</AppButton>
            <AppButton variant="text" :disabled="busy" @tap="confirmCompletion = false">返回检查</AppButton>
          </template>
        </view>
      </template>
    </template>
    </template>
  </view>
</template>

<script lang="ts">
import { shallowRef as readerOwnerRef, toRaw as rawReader } from 'vue'
import type { R1NodeFormsReader as ReaderPort } from './r1-node-forms-read'
// View ownership is separate from the reader's private source/command proofs.
const normalReaderViews = new WeakMap<ReaderPort, ReturnType<typeof readerOwnerRef<object | null>>>()
function claimNormalReader(reader: ReaderPort) {
  reader=rawReader(reader)
  let current = normalReaderViews.get(reader)
  if (!current) { current=readerOwnerRef<object|null>(null);normalReaderViews.set(reader,current) }
  const state=current, owner={}
  const previous=state.value;state.value=owner
  if (previous) reader.clear() // Immediately revoke a superseded view's source.
  const own=()=>state.value===owner
  return { drop:()=>{if(own())state.value=null}, reader:{...reader,
    isCurrent:(snapshot: Parameters<ReaderPort['isCurrent']>[0])=>own()&&reader.isCurrent(snapshot),
    clear:()=>{if(own())reader.clear()},
    load:async(...args:Parameters<ReaderPort['load']>)=>{if(!own())return null;const value=await reader.load(...args);return own()?value:null},
  } as ReaderPort }
}
</script>

<script setup lang="ts">
import { useFormInputValidityScope } from '@shared/ui/form-input-validity'

import { isR1RetainedFileArray, isR1RetainedFileSubset } from '@shared/form/r1-retained-file-values'
import { r1ConfiguredFileReadDisplay } from '@shared/form/r1-configured-file-read-evidence'
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import AppInformationRow from '@shared/ui/AppInformationRow.vue'
import { appointmentDisplayFor } from './appointment-time'
import AppTaskSectionHeading from '@shared/ui/AppTaskSectionHeading.vue'
import {r1FormFieldGroups,type R1FormWorkspaceFooter,type R1FormFooterAction} from './r1-form-workspace-presentation'
import R1FormFieldControl from './R1FormFieldControl.vue'
import R1NormalFileField from './R1NormalFileField.vue'
import { isR1NormalFileFieldEligible, sameR1NormalFileValues } from './r1-normal-file-values'
import type { R1FileWireValue } from '@shared/types'
import type { FormDataRead } from '@shared/ports'
import { normalizeR1RepeatValues, projectR1RepeatFields, updateR1FormDraftValue } from './r1-repeat-form'
import { projectR1RecordReadFields, type R1RecordReadField } from './r1-record-read-fields'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { r1NormalFormDraftsKey, r1NormalDraftValues, type R1NormalDraftRead, type R1NormalDraftSession } from './r1-normal-form-drafts'
import { r1RepeatActionsKey } from './r1-repeat-actions-port'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from './r1-node-forms-read'

const props = defineProps<{ readonly reader: R1NodeFormsReader; readonly workOrderId: string;
  readonly runtimeNodeId: string; readonly commercial?:boolean; readonly actorScope?: string | null;
  readonly readRevision?: number;
  readonly appointmentArchive?: { readonly summary: boolean; readonly recordId?: string; route(recordId?: string): string };
  readonly editExperienceOverride?: (snapshot: R1NodeFormsSnapshot, recordId: string) => boolean;
  readonly readFieldOverride?: (snapshot: R1NodeFormsSnapshot, record: FormDataRead, field: R1RecordReadField) => boolean }>()
let readerView = claimNormalReader(props.reader)
let viewReader = readerView.reader
// Preserve the reader's exact identity while keeping the empty→loaded change reactive.
const snapshot = shallowRef<R1NodeFormsSnapshot | null>(null)
const snapshotActorScope = ref<string | null>(null)
const loading = ref(false)
// Plain notices stay neutral; only guarded reader/action outcomes set a tone.
const feedback = ref<{ text: string; tone: 'neutral' | 'error' | 'success' }>({ text: '', tone: 'neutral' })
const message = computed({
  get: () => feedback.value.text,
  set: (text: string) => { feedback.value = { text, tone: 'neutral' } },
})
function setFeedback(text: string, tone: 'error' | 'success') { feedback.value = { text, tone } }
const busy = ref(false), confirmCompletion = ref(false), confirmSaveCompletion = ref(false)
const editing = ref(false), editingId = ref<string | undefined>()
const fileEditorClosed=ref(false),fileCancelling=ref(false)
const values = ref<Record<string,R1LocalFieldValue|readonly R1FileWireValue[]>>({})
const actionProvider = inject(r1RepeatActionsKey,null)
const draftProvider = inject(r1NormalFormDraftsKey,null)
let draftSession: R1NormalDraftSession | null = null
const draftRead = shallowRef<R1NormalDraftRead | null>(null)
let lastLocalWrite: Promise<boolean> | null = null
const draftMessage = ref(''), draftWorking = ref(false), confirmDraftDiscard = ref(false)
const draftBlocked = computed(() => !editingId.value && Boolean(draftRead.value && draftRead.value.state !== 'empty'))
const emit = defineEmits<{ (event: 'changed'): void;
  (event: 'archive-edit-change', editing: boolean): void;
  (event: 'snapshot-change', value: { readonly actorScope: string; readonly snapshot: R1NodeFormsSnapshot } | null): void }>()
const archiveEditing = computed(() => Boolean(props.appointmentArchive && editing.value))
watch(archiveEditing, value => emit('archive-edit-change', value))
const actions = computed(() => visibleSnapshot.value ? actionProvider?.forSnapshot(visibleSnapshot.value) ?? null : null)
const archiveRecords = computed(() => props.appointmentArchive?.recordId
  ? visibleSnapshot.value?.records.filter(record => String(record.id) === props.appointmentArchive!.recordId) ?? [] : [])
function appointmentReadFields(record: FormDataRead) {
  const source = visibleSnapshot.value
  return source ? projectR1RecordReadFields(source.definition, record).map(field =>
    !field.unavailable && source.definition.fields?.find(f => f.fieldId === field.fieldId)?.type === 'datetime'
      ? { ...field, text: appointmentMinuteText(record.values?.[field.valueKey]) } : field) : []
}
function appointmentMinuteText(value: unknown): string {
  const parsed = appointmentDisplayFor(value)
  return parsed ? `${parsed.date} ${parsed.timeLabel}` : typeof value === 'string' && value ? value : '—'
}
function appointmentPreview(record: FormDataRead) { return appointmentReadFields(record).filter(field => ['need','datetime'].includes(field.valueKey)) }
const appointmentSummaryFields = computed(() => {
  const record = visibleSnapshot.value?.records[0]
  return record ? appointmentPreview(record) : []
})
function matchesArchiveEdit(id: string): boolean {
  const archive = props.appointmentArchive
  return !archive || (!archive.summary && archive.recordId === id)
}
function canEditAppointment(id: string): boolean {
  return Boolean(matchesArchiveEdit(id)
    && visibleSnapshot.value && props.editExperienceOverride?.(visibleSnapshot.value,id)
    && actions.value?.canEdit?.(id) && !actions.value.locked())
}
const fileBusy=computed(()=>{void actions.value?.fileMedia?.revision.value;return actions.value?.fileMedia?.busy()??false})
const editableFields = computed(() => visibleSnapshot.value ? actions.value?.projectFields?.(values.value,editingId.value)
  ?? projectR1RepeatFields(visibleSnapshot.value, values.value) : [])
function readGroups(record:FormDataRead){const source=visibleSnapshot.value;const fields=source?projectR1RecordReadFields(source.definition,record):[];return source&&props.commercial?r1FormFieldGroups(source.definition,fields):[{key:'all',kind:'field' as const,fields}]}
const editGroups=computed(()=>visibleSnapshot.value&&props.commercial?r1FormFieldGroups(visibleSnapshot.value.definition,editableFields.value.filter(field=>field.visible)):[{key:'all',kind:'field' as const,fields:editableFields.value}])
const inputsValid = useFormInputValidityScope()
const validDraft = computed(() => { if(!inputsValid.value || fileCancelling.value)return false;try {void actions.value?.fileMedia?.revision.value
  if(actions.value?.fileMedia&&!actions.value.fileMedia.ready(values.value))return false
  return Boolean(visibleSnapshot.value && (actions.value?.validateDraft
  ? actions.value.validateDraft(values.value, editingId.value) : normalizeR1RepeatValues(visibleSnapshot.value, values.value))) } catch { return false } })
let version = 0
// A failed explicit reread hides the editor but must not erase its recovery
// identity. Only a fresh authorized snapshot can restore it.
type ReadIdentity = NonNullable<ReturnType<NonNullable<R1NodeFormsReader['retainReadIdentity']>>>
let editorSource: string | null = null, editorIdentity: ReadIdentity | null = null
let pendingEditor: { readonly id: string | undefined; readonly source: string | null; readonly identity: ReadIdentity | null } | null = null
// These transient bytes compare reader-issued originals, never display values
// or write credentials. A successful fresh read must independently authorize edit.
function editSource(source: R1NodeFormsSnapshot, id: string): string | null {
  try {
    if (!props.actorScope || !viewReader.isCurrent(source)) return null
    const original = viewReader.currentFormOriginal?.(source, id)
    if (!original) return null
    return JSON.stringify([props.actorScope, source.workOrderId, source.node,
      source.definition, source.fillableFieldIds ?? null, id, original], (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)
  } catch { return null }
}
const visibleSnapshot = computed(() => props.actorScope && props.actorScope === snapshotActorScope.value && snapshot.value
  && snapshot.value.workOrderId === props.workOrderId && String(snapshot.value.node.id) === props.runtimeNodeId
  && viewReader.isCurrent(snapshot.value) ? snapshot.value : null)
// Presentation callbacks belong to this exact edit, never to a future record/view.
const editPresentation = computed(() => {
  const source=visibleSnapshot.value,id=editingId.value,action=actions.value,identity=editorIdentity,ticket=version
  if(!source||!id||!editing.value||!identity||!action||!matchesArchiveEdit(id)||action.locked()||!action.canEdit?.(id)
    ||!props.editExperienceOverride?.(source,id))return null
  const owns=()=>version===ticket&&visibleSnapshot.value===source&&editingId.value===id&&matchesArchiveEdit(id)&&editorIdentity===identity
    &&identity.isSameActor()&&actions.value===action&&!action.locked()&&action.canEdit?.(id)===true
    &&!busy.value&&!loading.value&&!draftBlocked.value&&!draftWorking.value&&!fileCancelling.value
  return {snapshot:source,recordId:id,fields:editableFields.value,values:Object.freeze({...values.value}),originalValues:Object.freeze({...action.initialValues?.(id)}),
    disabled:busy.value||loading.value||draftBlocked.value||draftWorking.value||fileCancelling.value,valid:validDraft.value,
    updateValue:(key:string,value:R1LocalFieldValue)=>{if(owns())setValue(key,value)},
    saveOnly:async()=>{if(owns())await save(false)}}
})
const archiveEditPresentation = computed<typeof editPresentation.value>(previous => {
  if (!archiveEditing.value) return null
  // Preflight and readback replace the source while saving. Keep the current
  // pane visible and disabled during that transition, with actor checks intact.
  if (editPresentation.value) return editPresentation.value
  if (busy.value && previous && previous.recordId === editingId.value && matchesArchiveEdit(previous.recordId) && editorIdentity?.isSameActor()
    && props.actorScope === snapshotActorScope.value && previous.snapshot.workOrderId === props.workOrderId
    && String(previous.snapshot.node.id) === props.runtimeNodeId) return { ...previous, disabled: true }
  return null
})
watch(actions,(next,old)=>{if(old?.fileMedia&&next?.fileMedia!==old.fileMedia)old.fileMedia.dispose()})
const displayMessage=computed(()=>props.commercial && actions.value && !actions.value.locked() && /^已从后台读取 \d+ 条记录，当前仅查看。$/.test(message.value) ? message.value.replace('，当前仅查看。','。') : message.value)
// Share only the exact visible read state, never a save ACK or the stale parent EXTS summary.
watch(visibleSnapshot, value => emit('snapshot-change', value && snapshotActorScope.value
  ? { actorScope: snapshotActorScope.value, snapshot: value } : null), { immediate: true, flush: 'sync' })
function clear() { lastLocalWrite=null;draftSession=null; draftRead.value=null; draftMessage.value=''; draftWorking.value=false; confirmDraftDiscard.value=false; actions.value?.fileMedia?.dispose(); version++; pendingEditor = null; editorSource = null; editorIdentity = null; viewReader.clear(); snapshot.value = null; snapshotActorScope.value = null; loading.value = false; busy.value = false; fileEditorClosed.value=false;fileCancelling.value=false; message.value = ''; values.value = {}; confirmCompletion.value = false; confirmSaveCompletion.value = false; editing.value = false; editingId.value = undefined }
watch(() => [props.workOrderId, props.runtimeNodeId, props.actorScope], clear)
onBeforeUnmount(()=>{if(archiveEditing.value)emit('archive-edit-change',false);clear();readerView.drop()})
watch(()=>props.reader,next=>{clear();readerView.drop();readerView=claimNormalReader(next);viewReader=readerView.reader})
// MP may retain a custom component despite a changed Vue key. A visible
// archive page explicitly renews its reader ownership before reading again.
watch(()=>props.readRevision,()=>{
  clear();readerView.drop();readerView=claimNormalReader(props.reader);viewReader=readerView.reader;void load()
})
watch(() => props.appointmentArchive ? [props.workOrderId,props.runtimeNodeId,props.actorScope] : null,
  value => { if(value)void load() }, { immediate: true })
async function load() {
  if (loading.value || busy.value || fileBusy.value || fileCancelling.value || draftWorking.value || !props.actorScope) return
  const ticket = ++version, actorScope = props.actorScope
  let invalidatedEditor = false
  if (editing.value) {
    const id = editingId.value, source = visibleSnapshot.value, action = actions.value
    const currentSource = id && source ? editSource(source, id) : null
    if (id && (!action || action.locked() || !action.canEdit?.(id)
      || !editorIdentity?.isSameActor() || !currentSource || currentSource !== editorSource)) {
      pendingEditor = null; editorSource = null; editorIdentity = null; values.value = {}; invalidatedEditor = true
    } else pendingEditor = { id, source: currentSource, identity: editorIdentity }
  }
  if (pendingEditor && (!viewReader.enabled() || (pendingEditor.id && !pendingEditor.identity?.isSameActor()))) {
    pendingEditor = null; editorSource = null; editorIdentity = null; values.value = {}; invalidatedEditor = true
  }
  const editor = pendingEditor
  confirmCompletion.value = false; confirmSaveCompletion.value = false; editing.value = false; editingId.value = undefined
  snapshot.value = null; message.value = ''; loading.value = true
  try {
    const value = await viewReader.load(props.workOrderId, props.runtimeNodeId)
    if (ticket !== version || props.actorScope !== actorScope || !viewReader.isCurrent(value)) return
    snapshotActorScope.value = actorScope; snapshot.value = value
    const fresh=actions.value
    if(fresh?.fileMedia){
      fileEditorClosed.value=false
      const media=fresh.fileMedia,inspected=await media.inspect()
      if(ticket!==version||props.actorScope!==actorScope||!viewReader.isCurrent(value)||actions.value?.fileMedia!==media)return
      if(!inspected){message.value=`已从后台读取 ${value.records.length} 条记录；${media.message()||'本地附件队列尚未核实，不能新建或保存。'}`;return}
    }
    if(editor && pendingEditor === editor){
      const sameSource = !editor.id || Boolean(editor.identity?.isSameActor() && editor.source && editSource(value, editor.id) === editor.source)
      if(fresh && !fresh.locked() && sameSource && (editor.id?fresh.canEdit?.(editor.id):fresh.canCreate?.())){
        editing.value=true;editingId.value=editor.id;editorSource=editor.source;editorIdentity=editor.identity
      } else {
        // Explicitly invalidate the whole old editor; never turn it into a new
        // zero-record draft or silently adopt the fresh original as its baseline.
        values.value={};editorSource=null;editorIdentity=null;invalidatedEditor=true
      }
      // A successful read resolves recovery; revoked authority must not leave
      // a dormant identity that could revive a draft on a later grant.
      pendingEditor = null
    }
    const session = draftProvider?.open(value,fresh??null) ?? null
    draftSession=session; draftRead.value=null; draftMessage.value=''; confirmDraftDiscard.value=false
    if(session){
      const read=await session.read()
      if(ticket!==version||props.actorScope!==actorScope||!viewReader.isCurrent(value)||draftSession!==session)return
      if(read.state==='recoverable' && Object.keys(values.value).length){
        try{r1NormalDraftValues(value,fresh!,values.value);draftRead.value={state:'empty'};draftMessage.value='草稿已保存在本机，尚未提交。'}
        catch{draftRead.value={state:'blocked',message:'字段配置或权限已变化，当前内容已保留，不能继续提交。'};draftMessage.value=draftRead.value.message}
      }else{
        if(read.state==='empty'&&value.records.length)draftSession=null
        draftRead.value=read
        draftMessage.value=read.state==='recoverable'?'有未提交的本地草稿，可恢复后继续填写。':read.state==='empty'?'':read.message
      }
    }
    message.value = invalidatedEditor ? '后台记录或编辑权限已变化，未保存内容已失效；请重新打开记录后填写。'
      : `已从后台读取 ${value.records.length} 条记录，当前仅查看。`
  } catch { if (ticket === version) {
    if (pendingEditor?.id && !pendingEditor.identity?.isSameActor()) {
      pendingEditor=null;editorSource=null;editorIdentity=null;values.value={};invalidatedEditor=true
    }
    setFeedback(invalidatedEditor
      ? '编辑身份或记录来源已失效，未保存内容已失效；记录暂时无法完整核实，请重新读取。'
      : '记录暂时无法完整核实，请重新读取工单后再试。', 'error')
  } }
  finally { if (ticket === version) loading.value = false }
}
function setValue(key: string,value: R1LocalFieldValue) {
  if (busy.value || draftBlocked.value || draftWorking.value || fileCancelling.value || !editableFields.value.some(f => f.valueKey === key && f.supported)) return
  if (!visibleSnapshot.value) return
  try {
    let next:typeof values.value
    if(actions.value?.updateCreateDraft)next=actions.value.updateCreateDraft(values.value as Record<string,R1LocalFieldValue>,key,value,editingId.value)
    else if(actions.value?.fileMedia)next={...values.value,[key]:value}
    else next=updateR1FormDraftValue(visibleSnapshot.value, values.value as Record<string,R1LocalFieldValue>, key, value)
    // Validate choice intent against the proposed current draft before either
    // value or intent can become visible as a successful editor transition.
    if(editingId.value)actions.value?.recordFieldSelection?.(editingId.value,key,value,next)
    values.value=next
  }
  catch { message.value = '当前字段或平面面积计算尚未核实，不能更新草稿。'; return }
  persistDraft()
}
function persistDraft() {
  const session=draftSession, ticket=version
  if(!session||editingId.value)return
  lastLocalWrite = session.save(values.value).then(()=>{
    if(ticket===version&&draftSession===session)draftMessage.value='草稿已保存在本机，尚未提交。'
    return true
  }).catch(()=>{
    if(ticket===version&&draftSession===session){draftMessage.value='本地草稿尚未保存，请保留页面并重新读取后重试。';draftRead.value={state:'failed',message:draftMessage.value}}
    return false
  })
}
async function flushLocalDraft(): Promise<boolean> {
  const ticket=version, session=draftSession
  // A pending pure read owns no mutable editor, draft or receipt. Back may
  // cancel it; the existing view/version checks reject its late response.
  if (loading.value && !busy.value && !fileBusy.value && !fileCancelling.value && !draftWorking.value
    && !editing.value && !pendingEditor && !editorIdentity && !actions.value
    && !draftSession && !lastLocalWrite && Object.keys(values.value).length===0
    && (!draftRead.value || draftRead.value.state==='empty')) return true
  if (busy.value||loading.value||fileBusy.value||fileCancelling.value||draftWorking.value) return false
  // An edit can enqueue another write while Back is waiting for the first.
  // Drain this view's latest queue ticket, then recheck its exact ownership.
  while (lastLocalWrite) {
    const pending=lastLocalWrite
    if (!await pending || ticket!==version || session!==draftSession) return false
    if (pending===lastLocalWrite) break
  }
  return ticket===version && session===draftSession && draftRead.value?.state !== 'failed'
    && !busy.value && !loading.value && !fileBusy.value && !fileCancelling.value && !draftWorking.value
}
// Shell-owned placement only; every callback still enters the original guarded operation.
const workspaceFooter=computed<R1FormWorkspaceFooter>(()=>{
 const source=visibleSnapshot.value,action=actions.value,ticket=version,actor=props.actorScope
 if(!props.commercial||!source||!action||action.locked())return{actions:[],notice:'',editing:false}
 const own=()=>ticket===version&&props.actorScope===actor&&visibleSnapshot.value===source&&actions.value===action&&viewReader.isCurrent(source)&&!action.locked()
 const list:R1FormFooterAction[]=[]
 const add=(id:string,label:string,variant:R1FormFooterAction['variant'],disabled:boolean,run:()=>void,working=false)=>list.push({id,label,variant,disabled,loading:working,run:()=>{if(own())run()}})
 const blocked=loading.value||busy.value||fileCancelling.value||draftBlocked.value||draftWorking.value||!validDraft.value
 const editor=editing.value||!source.records.length&&!fileEditorClosed.value
 let notice='保存记录不会自动完成当前节点。'
 if(editor&&!editPresentation.value){
  if(confirmSaveCompletion.value){notice='确认保存本条记录并完成当前节点？';add('r1-normal-save-complete-confirm','确认保存并完成','primary',blocked,()=>{void save(true)},busy.value);add('r1-normal-save-complete-back','返回检查','text',busy.value,()=>{confirmSaveCompletion.value=false})}
  else{add('r1-normal-save','保存记录','secondary',blocked,()=>{void save(false)},busy.value)
   if(action.canSaveAndComplete?.())add('r1-normal-save-complete-request','保存并完成','primary',blocked,()=>{confirmSaveCompletion.value=true})
   else add('r1-normal-complete-unavailable','完成当前节点','primary',true,()=>{})}
  if(editing.value||action.fileMedia)add('r1-normal-edit-cancel',action.fileMedia&&!editingId.value?'取消本次新增':'取消编辑','text',busy.value||fileCancelling.value,()=>{void cancelEdit()},fileCancelling.value)
 }else if(source.records.length&&!editing.value&&(action.canComplete?action.canComplete():true)){
  if(confirmCompletion.value){notice='确认已保存记录齐全，完成当前节点？';add('r1-normal-complete-confirm','确认完成','primary',busy.value,()=>{void complete()},busy.value);add('r1-normal-complete-back','返回检查','text',busy.value,()=>{confirmCompletion.value=false})}
  else add('r1-normal-complete-request','完成当前节点','primary',busy.value,()=>{confirmCompletion.value=true})
 }
 return{actions:list,notice:list.length?notice:'',editing:editor}
})
function cancelArchiveEdit(): boolean {
  if (!archiveEditing.value) return false
  if (!busy.value && !loading.value && !draftWorking.value && !fileCancelling.value) void cancelEdit()
  return true
}
defineExpose({ flushLocalDraft, workspaceFooter, cancelArchiveEdit })
function restoreDraft(){
  const source=visibleSnapshot.value, action=actions.value, read=draftRead.value
  if(!source||!action||action.locked()||read?.state!=='recoverable'||draftWorking.value)return
  try{values.value={...r1NormalDraftValues(source,action,read.values,true)};draftRead.value={state:'empty'};draftMessage.value='已恢复本地草稿，尚未提交。'}
  catch{draftRead.value={state:'blocked',message:'字段配置或权限已变化，本地草稿已保留，未恢复。'};draftMessage.value=draftRead.value.message}
}
async function discardDraft(){
  const session=draftSession,ticket=version,sourceBeforeDiscard=visibleSnapshot.value,valuesBeforeDiscard=values.value,recordBeforeDiscard=editingId.value
  if(!session||!confirmDraftDiscard.value||draftWorking.value)return
  draftWorking.value=true
  try{await session.discard();if(ticket!==version||draftSession!==session)return
    // Discard owns only this zero-record first-create editor. A blocked old
    // create draft may coexist with a different existing-record edit target.
    if(sourceBeforeDiscard && sourceBeforeDiscard===visibleSnapshot.value && !sourceBeforeDiscard.records.length
      && !recordBeforeDiscard && !editingId.value && values.value===valuesBeforeDiscard)values.value={}
    draftRead.value={state:'empty'};draftMessage.value='本地草稿已丢弃，后台记录未改变。';confirmDraftDiscard.value=false
    const source=visibleSnapshot.value,action=actions.value;draftSession=source&&action&&!source.records.length?draftProvider?.open(source,action)??null:null
    if(draftSession){const next=draftSession,read=await next.read();if(ticket!==version||draftSession!==next)return;draftRead.value=read;if(read.state!=='empty')draftMessage.value=read.state==='recoverable'?'有未提交的本地草稿，可恢复后继续填写。':read.message}
  }catch{if(ticket===version)draftMessage.value='本地草稿尚未清理，请保留内容后重试。'}
  finally{if(ticket===version)draftWorking.value=false}
}
function setFileValue(fieldId:string,key:string,value:readonly R1FileWireValue[]){
  const s=visibleSnapshot.value,media=actions.value?.fileMedia,retained=actions.value?.retainedFiles
  if(busy.value||loading.value||draftBlocked.value||draftWorking.value||fileCancelling.value||!s||(!media&&!retained)||!editableFields.value.some(f=>f.fieldId===fieldId&&f.valueKey===key&&f.type==='file'&&f.supported)
    ||(media?JSON.stringify(value)!==JSON.stringify(media.values(fieldId,{...values.value,[key]:value}))
      :retained?!editingId.value||!actions.value?.canEdit?.(editingId.value)||!isR1RetainedFileSubset(values.value[key],value)
      :true))return
  values.value={...values.value,[key]:value.map(file=>({...file}))}
}
function retainedReadFiles(record:FormDataRead,field:R1RecordReadField){
  const s=visibleSnapshot.value,metadata=s?.definition.fields?.find(f=>f.fieldId===field.fieldId)
  return Boolean(s&&metadata&&r1ConfiguredFileReadDisplay(s.definition,record,metadata)==='retained-files')
}
function readFiles(record:FormDataRead,projected:R1RecordReadField){
  const source=visibleSnapshot.value
  if(!source||projected.unavailable)return false
  const current=projectR1RecordReadFields(source.definition,record).find(f=>f.fieldId===projected.fieldId&&f.valueKey===projected.valueKey)
  const field=source.definition.fields?.find(f=>f.fieldId===projected.fieldId&&f.valueKey===projected.valueKey)
  return current?.unavailable===false&&field?.type==='file'&&!field.unsupportedReason&&!field.presentationOnly
    &&Array.isArray(record.values?.[field.valueKey])&&(record.values![field.valueKey] as readonly unknown[]).length>0
    &&(retainedReadFiles(record,projected)?isR1RetainedFileArray(record.values?.[field.valueKey])
      :sameR1NormalFileValues(record.values?.[field.valueKey],record.values?.[field.valueKey]))
}
function scalarValueFor(key:string):R1LocalFieldValue|undefined{
  const value=values.value[key]
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value
  return Array.isArray(value)&&value.every(item=>typeof item==='string')?value as readonly string[]:undefined
}
async function cancelEdit() {
  if(busy.value||fileCancelling.value)return
  const media=actions.value?.fileMedia
  if(!media){
    // A blocked first-create draft can outlive its shape or a consumed media
    // session. Confirm its cleanup before closing any current editor.
    if(draftSession&&!archiveEditing.value){const session=draftSession,ticket=version;draftWorking.value=true;try{await session.discard();if(ticket!==version||draftSession!==session)return;draftSession=null;draftRead.value=null;draftMessage.value=''}catch{if(ticket===version)draftMessage.value='本地草稿尚未清理，请保留内容后重试。';return}finally{if(ticket===version)draftWorking.value=false}}
    pendingEditor=null;editorSource=null;editorIdentity=null;editing.value=false;editingId.value=undefined;values.value={};confirmSaveCompletion.value=false;return}
  const ticket=version,actorScope=props.actorScope,source=visibleSnapshot.value
  fileCancelling.value=true
  try{
    const cancelled=await media.cancel()
    if(ticket!==version||props.actorScope!==actorScope||(actions.value?.fileMedia!==media&&actions.value?.fileMedia!==undefined)||!source||!viewReader.isCurrent(source))return
    if(!cancelled){message.value=media.message()||'取消结果尚未核实，请保留当前草稿并核对附件状态。';return}
    if(draftSession){try{await draftSession.discard()}catch{message.value='附件已取消，本地草稿尚未清理，请保留页面后重试。';return};if(ticket!==version||props.actorScope!==actorScope)return;draftSession=null;draftRead.value=null;draftMessage.value=''}
    pendingEditor=null;editorSource=null;editorIdentity=null;editing.value=false;editingId.value=undefined;values.value={};confirmSaveCompletion.value=false;fileEditorClosed.value=true
    message.value=source.records.length?'未保存修改已取消。':'未保存草稿已取消，可重新新增。'
  }catch{if(ticket===version&&props.actorScope===actorScope)message.value='取消结果尚未核实，请保留当前草稿并核对附件状态。'}
  finally{if(ticket===version&&props.actorScope===actorScope)fileCancelling.value=false}
}
async function beginCreate() {
  if(busy.value||draftBlocked.value||draftWorking.value||fileCancelling.value||fileBusy.value||!actions.value?.canCreate?.())return
  const ticket=version
  if(actions.value.fileMedia){
    if(!fileEditorClosed.value||!actions.value.fileMedia.ready({}))return
    pendingEditor=null;values.value={};editingId.value=undefined;fileEditorClosed.value=false;editing.value=true
  }else{
    await cancelEdit();if(ticket!==version)return;editing.value=true
  }
  const source=visibleSnapshot.value,action=actions.value
  if(!source||!action||source.records.length||!draftProvider)return
  const session=draftProvider.open(source,action);draftSession=session
  if(!session)return
  draftWorking.value=true
  try{const read=await session.read();if(ticket!==version||draftSession!==session)return;draftRead.value=read;draftMessage.value=read.state==='empty'?'':read.state==='recoverable'?'有未提交的本地草稿，可恢复后继续填写。':read.message}
  finally{if(ticket===version)draftWorking.value=false}
}
function edit(id:string) {
  if(busy.value||!actions.value?.canEdit?.(id)||(props.appointmentArchive&&!canEditAppointment(id)))return
  const initial=actions.value.initialValues?.(id)
  if(!initial||actions.value.beginEdit?.(id)===false)return
  pendingEditor=null;editorSource=visibleSnapshot.value?editSource(visibleSnapshot.value,id):null
  editorIdentity=visibleSnapshot.value?viewReader.retainReadIdentity?.(visibleSnapshot.value)??null:null
  values.value={...initial} as Record<string,R1LocalFieldValue>;editing.value=true;editingId.value=id
  confirmCompletion.value=false;confirmSaveCompletion.value=false
}
async function finalizeLocalDraft(session:R1NormalDraftSession|null){
  if(!session)return
  try{await session.complete();if(draftSession===session)draftMessage.value=''}
  catch{if(draftSession===session)draftMessage.value='记录已保存，本地草稿清理失败；旧草稿不会自动恢复。'}
}
async function save(finish=false) {
  const action = actions.value
  if (!action || loading.value || busy.value || draftBlocked.value || draftWorking.value || !validDraft.value || (finish && (!confirmSaveCompletion.value || !action.saveAndComplete))) return
  const ticket = version, actorScope = props.actorScope, session=editingId.value?null:draftSession
  // A pre-dispatch save reread can revoke this reader generation. Keep only
  // its existing baseline; the fresh action and persisted receipt decide retry.
  if(editingId.value && editorSource && editorIdentity?.isSameActor())
    pendingEditor={id:editingId.value,source:editorSource,identity:editorIdentity}
  busy.value = true; message.value = ''
  try {
    if(session){
      try{await session.markUncertain(values.value)}catch{if(ticket===version){message.value='本地草稿未能保存，尚未提交记录。';draftRead.value={state:'failed',message:message.value};draftMessage.value=message.value};return}
      if(ticket!==version||props.actorScope!==actorScope)return
    }
    if(finish){
      await action.saveAndComplete!(values.value,editingId.value)
      if(ticket!==version||props.actorScope!==actorScope)return
      await finalizeLocalDraft(session);if(ticket!==version||props.actorScope!==actorScope)return;draftSession=null;draftRead.value=null;
      pendingEditor=null;editorSource=null;editorIdentity=null;snapshot.value=null;values.value={};editing.value=false;editingId.value=undefined;setFeedback('记录已保存，已重新读取并确认当前节点完成。', 'success');emit('changed');return
    }
    const saved = await action.saveOnly(values.value,editingId.value)
    if (ticket !== version || props.actorScope !== actorScope) return
    if (!viewReader.isCurrent(saved)) {
      if (props.appointmentArchive) throw new Error('预约回读结果已失效')
      return
    }
    await finalizeLocalDraft(session)
    if(ticket!==version||props.actorScope!==actorScope)return
    draftSession=null;draftRead.value=null;
    pendingEditor=null;editorSource=null;editorIdentity=null;snapshot.value = saved; values.value = {}; editing.value=false; editingId.value=undefined; confirmSaveCompletion.value=false
    setFeedback(props.appointmentArchive ? '记录已保存并从后台重新读取。' : '记录已保存并从后台重新读取，当前节点尚未完成。', 'success')
  } catch { if (ticket === version) {if(pendingEditor?.id){editing.value=false;editingId.value=undefined};setFeedback('保存未完成或结果尚未核实，请勿重复提交。', 'error');if(session){draftRead.value={state:'uncertain',message:message.value};draftMessage.value='上次保存结果尚未核实。本地草稿已保留，请核对已保存记录，勿重复提交。'}} }
  finally { if (ticket === version) busy.value = false }
}
async function complete() {
  const action = actions.value
  if (!action || busy.value || !confirmCompletion.value) return
  const ticket = version, actorScope = props.actorScope; busy.value = true; message.value = ''
  try {
    await action.complete()
    if (ticket !== version || props.actorScope !== actorScope) return
    message.value = '已收到提交回执，正在重新读取工单确认下一阶段。'
    emit('changed')
  } catch { if (ticket === version) message.value = '流程结果尚未核实，请勿重复提交。' }
  finally { if (ticket === version) busy.value = false }
}
</script>

<style scoped lang="scss">
@import "@brand-ui/node-forms-read.scss";
@import "@brand-ui/detail-archives.scss";
</style>
