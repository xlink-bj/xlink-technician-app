<template>
  <view data-testid="r1-normal-form-read">
    <text class="form-read__hint">读取当前工单节点已保存的记录。查看不会保存或推进流程。</text>
    <AppButton variant="secondary" size="compact" :disabled="loading || busy" @tap="load">
      {{ loading ? '正在读取…' : '读取已保存表单' }}
    </AppButton>
    <text v-if="message" class="form-read__hint" data-testid="r1-normal-form-read-message">{{ message }}</text>
    <template v-if="visibleSnapshot">
      <text v-if="!visibleSnapshot.records.length" class="form-read__hint" data-testid="r1-normal-form-empty">暂无已保存记录。</text>
      <view v-for="(record,index) in visibleSnapshot.records" :key="String(record.id)" class="form-read__record" data-testid="r1-normal-form-record">
        <text class="form-read__title">{{ visibleSnapshot.node.displayName || '现场记录' }} · {{ index + 1 }}</text>
        <view v-for="field in projectR1RecordReadFields(visibleSnapshot.definition, record)" :key="field.fieldId" class="form-read__field">
          <text class="form-read__label">{{ field.label }}</text>
          <text class="form-read__value" :data-testid="`r1-normal-value-${field.valueKey}`">{{ field.text }}</text>
        </view>
        <AppButton v-if="actions?.canEdit?.(String(record.id)) && !actions.locked()" variant="secondary" size="compact"
          :disabled="busy || loading" :data-testid="`r1-normal-edit-${record.id}`" @tap="edit(String(record.id))">编辑记录</AppButton>
      </view>
      <template v-if="actions && !actions.locked()">
        <AppButton v-if="visibleSnapshot.records.length && actions.canCreate?.() && !editing" variant="secondary"
          :disabled="busy || loading" data-testid="r1-normal-append" @tap="beginCreate">新增记录</AppButton>
        <view v-if="editing || !visibleSnapshot.records.length" class="form-read__record" data-testid="r1-normal-create">
          <text class="form-read__title">{{ visibleSnapshot.node.displayName || '新增现场记录' }}</text>
          <template v-for="field in editableFields" :key="field.fieldId">
            <AppField v-if="field.visible" :label="field.label" :required="field.required" :data-testid="`r1-normal-input-${field.valueKey}`">
              <R1FormFieldControl v-if="field.supported" :field="field" :model-value="values[field.valueKey]"
                :disabled="busy" @update:model-value="setValue(field.valueKey, $event)" />
              <text v-else class="form-read__hint">{{ field.reason || '当前字段不可编辑' }}</text>
            </AppField>
          </template>
          <AppButton :disabled="busy || !validDraft" :loading="busy" data-testid="r1-normal-save" @tap="save(false)">保存记录</AppButton>
          <AppButton v-if="actions.canSaveAndComplete?.()" variant="secondary" :disabled="busy || !validDraft"
            data-testid="r1-normal-save-complete-request" @tap="confirmSaveCompletion = true">保存并完成</AppButton>
          <template v-if="confirmSaveCompletion">
            <text class="form-read__hint">确认保存本条记录并完成当前节点？</text>
            <AppButton :disabled="busy || !validDraft" :loading="busy" data-testid="r1-normal-save-complete-confirm" @tap="save(true)">确认保存并完成</AppButton>
            <AppButton variant="text" :disabled="busy" @tap="confirmSaveCompletion = false">返回检查</AppButton>
          </template>
          <AppButton v-if="editing" variant="text" :disabled="busy" data-testid="r1-normal-edit-cancel" @tap="cancelEdit">取消编辑</AppButton>
          <text class="form-read__hint">保存仅保存本条记录，不会完成当前节点或进入下一阶段。</text>
        </view>
        <view v-if="visibleSnapshot.records.length && !editing && (actions.canComplete ? actions.canComplete() : true)" class="form-read__record">
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
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppField from '@shared/ui/AppField.vue'
import R1FormFieldControl from './R1FormFieldControl.vue'
import { normalizeR1RepeatValues, projectR1RepeatFields, updateR1FormDraftValue } from './r1-repeat-form'
import { projectR1RecordReadFields } from './r1-record-read-fields'
import type { R1LocalFieldValue } from './r1-local-form-fields'
import { r1RepeatActionsKey } from './r1-repeat-actions-port'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from './r1-node-forms-read'

const props = defineProps<{ readonly reader: R1NodeFormsReader; readonly workOrderId: string;
  readonly runtimeNodeId: string; readonly actorScope?: string | null }>()
// Preserve the reader's exact identity while keeping the empty→loaded change reactive.
const snapshot = shallowRef<R1NodeFormsSnapshot | null>(null)
const snapshotActorScope = ref<string | null>(null)
const loading = ref(false), message = ref('')
const busy = ref(false), confirmCompletion = ref(false), confirmSaveCompletion = ref(false)
const editing = ref(false), editingId = ref<string | undefined>()
const values = ref<Record<string,R1LocalFieldValue>>({})
const actionProvider = inject(r1RepeatActionsKey,null)
const emit = defineEmits<{ (event: 'changed'): void;
  (event: 'snapshot-change', value: { readonly actorScope: string; readonly snapshot: R1NodeFormsSnapshot } | null): void }>()
const actions = computed(() => visibleSnapshot.value ? actionProvider?.forSnapshot(visibleSnapshot.value) ?? null : null)
const editableFields = computed(() => visibleSnapshot.value ? actions.value?.projectFields?.(values.value,editingId.value)
  ?? projectR1RepeatFields(visibleSnapshot.value, values.value) : [])
const validDraft = computed(() => { try { return Boolean(visibleSnapshot.value && (actions.value?.validateDraft
  ? actions.value.validateDraft(values.value, editingId.value) : normalizeR1RepeatValues(visibleSnapshot.value, values.value))) } catch { return false } })
let version = 0
// A failed explicit reread hides the editor but must not erase its recovery
// identity. Only a fresh authorized snapshot can restore it.
let pendingEditor: { readonly id: string | undefined } | null = null
const visibleSnapshot = computed(() => props.actorScope && props.actorScope === snapshotActorScope.value && snapshot.value
  && snapshot.value.workOrderId === props.workOrderId && String(snapshot.value.node.id) === props.runtimeNodeId
  && props.reader.isCurrent(snapshot.value) ? snapshot.value : null)
// Share only the exact visible read state, never a save ACK or the stale parent EXTS summary.
watch(visibleSnapshot, value => emit('snapshot-change', value && snapshotActorScope.value
  ? { actorScope: snapshotActorScope.value, snapshot: value } : null), { immediate: true, flush: 'sync' })
function clear() { version++; pendingEditor = null; props.reader.clear(); snapshot.value = null; snapshotActorScope.value = null; loading.value = false; busy.value = false; message.value = ''; values.value = {}; confirmCompletion.value = false; confirmSaveCompletion.value = false; editing.value = false; editingId.value = undefined }
watch(() => [props.workOrderId, props.runtimeNodeId, props.actorScope], clear)
onBeforeUnmount(clear)
async function load() {
  if (loading.value || busy.value || !props.actorScope) return
  const ticket = ++version, actorScope = props.actorScope
  if (editing.value) pendingEditor = { id: editingId.value }
  const editor = pendingEditor
  confirmCompletion.value = false; confirmSaveCompletion.value = false; editing.value = false; editingId.value = undefined
  snapshot.value = null; message.value = ''; loading.value = true
  try {
    const value = await props.reader.load(props.workOrderId, props.runtimeNodeId)
    if (ticket !== version || props.actorScope !== actorScope || !props.reader.isCurrent(value)) return
    snapshotActorScope.value = actorScope; snapshot.value = value
    const fresh=actionProvider?.forSnapshot(value)
    if(editor && pendingEditor === editor){
      if(fresh && !fresh.locked() && (editor.id?fresh.canEdit?.(editor.id):fresh.canCreate?.())){
        editing.value=true;editingId.value=editor.id
      }
      // A successful read resolves recovery; revoked authority must not leave
      // a dormant identity that could revive a draft on a later grant.
      pendingEditor = null
    }
    message.value = `已从后台读取 ${value.records.length} 条记录，当前仅查看。`
  } catch { if (ticket === version) message.value = '记录暂时无法完整核实，请重新读取工单后再试。' }
  finally { if (ticket === version) loading.value = false }
}
function setValue(key: string,value: R1LocalFieldValue) {
  if (busy.value || !editableFields.value.some(f => f.valueKey === key && f.supported)) return
  if (!visibleSnapshot.value) return
  try { values.value = updateR1FormDraftValue(visibleSnapshot.value, values.value, key, value) }
  catch { message.value = '当前字段或平面面积计算尚未核实，不能更新草稿。' }
}
function cancelEdit() { if (busy.value) return; pendingEditor = null; editing.value=false; editingId.value=undefined; values.value={}; confirmSaveCompletion.value=false }
function beginCreate() { if(busy.value||!actions.value?.canCreate?.())return; cancelEdit(); editing.value=true }
function edit(id:string) {
  if(busy.value||!actions.value?.canEdit?.(id))return
  const initial=actions.value.initialValues?.(id)
  if(!initial)return
  values.value={...initial} as Record<string,R1LocalFieldValue>;editing.value=true;editingId.value=id
  confirmCompletion.value=false;confirmSaveCompletion.value=false
}
async function save(finish=false) {
  const action = actions.value
  if (!action || busy.value || !validDraft.value || (finish && (!confirmSaveCompletion.value || !action.saveAndComplete))) return
  const ticket = version, actorScope = props.actorScope; busy.value = true; message.value = ''
  try {
    if(finish){
      await action.saveAndComplete!(values.value,editingId.value)
      if(ticket!==version||props.actorScope!==actorScope)return
      snapshot.value=null;cancelEdit();message.value='记录已保存，已重新读取并确认当前节点完成。';emit('changed');return
    }
    const saved = await action.saveOnly(values.value,editingId.value)
    if (ticket !== version || props.actorScope !== actorScope || !props.reader.isCurrent(saved)) return
    snapshot.value = saved; values.value = {}; editing.value=false; editingId.value=undefined; confirmSaveCompletion.value=false; message.value = '记录已保存并从后台重新读取，当前节点尚未完成。'
  } catch { if (ticket === version) message.value = '保存未完成或结果尚未核实，请勿重复提交。' }
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

<style scoped>
.form-read__hint{display:block;color:#68788f;font-size:12px;line-height:20px;margin:10px 0}
.form-read__record{border-top:1px solid #e6edf5;margin-top:14px;padding-top:14px}
.form-read__title{font-size:14px;font-weight:600;color:#263b55}
.form-read__field{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #f1f4f8}
.form-read__label{font-size:13px;color:#68788f;flex:0 0 90px}
.form-read__value{font-size:13px;color:#263b55;text-align:right;overflow-wrap:anywhere}
</style>
