<template>
  <ActionWorkspaceShell :customer-name="customerName" :display-number="displayNumber"
    lifecycle="available" draft-status="clean" :can-submit="false" submit-label="返回工单详情">
  <view v-if="visible" data-testid="normal-form-workspace-content">
    <AppActionContentHeading :title="node.displayName || '表单记录'" caption="按当前节点配置查看与填写" icon="task" />
    <text v-if="count !== null" data-testid="normal-form-workspace-count">已加载 {{ count }} 条</text>
    <R1NodeFormsReadPanel v-if="reader?.enabled()" :key="panelKey" ref="panel"
      :reader="reader" :work-order-id="workOrderId" :runtime-node-id="String(node.id)"
      :actor-scope="actorScope" :read-field-override="isCauseReadField" :edit-experience-override="isAppointmentEdit" @changed="emit('changed')" @snapshot-change="readState=$event">
      <template #edit-experience="{context}">
        <template v-for="editContext in [context]" :key="editContext.recordId">
          <NormalAppointmentEditExperience :view="editContext" />
        </template>
      </template>
      <template #read-field="{snapshot,record}">
        <SurveyLeakageCauseExperience :read-view="causeRead?.forRecord(snapshot,record) ?? null" />
      </template>
    </R1NodeFormsReadPanel>
  </view>
  <template #actions>
    <text v-if="exitMessage" role="alert">{{ exitMessage }}</text>
    <AppButton block data-testid="normal-form-workspace-back" @tap="emit('back')">返回工单详情</AppButton>
  </template>
  </ActionWorkspaceShell>
</template>
<script setup lang="ts">
import { computed, inject, shallowRef, ref, onBeforeUnmount } from 'vue'
import type { FormDataRead, WorkflowNodeRead } from '@shared/ports'
import { r1NodeFormsReaderKey, type R1NodeFormsSnapshot } from './r1-node-forms-read'
import { createNormalSurveyCauseRead, surveyLeakageCauseReadKey } from './survey-leakage-cause-read'
import SurveyLeakageCauseExperience from './components/SurveyLeakageCauseExperience.vue'
import NormalAppointmentEditExperience from './components/NormalAppointmentEditExperience.vue'
import { appointmentEditDraft } from './r1-repeat-appointment-edit'
import type { R1RecordReadField } from './r1-record-read-fields'
import R1NodeFormsReadPanel from './R1NodeFormsReadPanel.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
const props=defineProps<{workOrderId:string;node:WorkflowNodeRead;actorScope:string|null;visible:boolean;customerName?:string;displayNumber?:string;exitMessage?:string}>()
const emit=defineEmits<{(event:'changed'|'back'):void}>()
const reader=inject(r1NodeFormsReaderKey,null)
const panel=ref<{flushLocalDraft():Promise<boolean>}|null>(null)
const readState=shallowRef<{actorScope:string;snapshot:R1NodeFormsSnapshot}|null>(null)
const causeDependencies = inject(surveyLeakageCauseReadKey, null)
const causeRead = reader && causeDependencies ? createNormalSurveyCauseRead({ reader, ...causeDependencies, source: () => {
 const s = readState.value
 return props.visible && s && props.actorScope && s.actorScope === props.actorScope
   ? { snapshot: s.snapshot, actorScope: props.actorScope, workOrderId: props.workOrderId, nodeId: String(props.node.id) } : null
} }) : null
function isAppointmentEdit(snapshot:R1NodeFormsSnapshot,recordId:string):boolean {
  if(!reader?.isCurrent(snapshot))return false
  const evidence=reader.currentRepeatAppointment?.(snapshot,recordId)
  if(!evidence||!reader.isCurrentRepeatAppointment?.(snapshot,recordId,evidence))return false
  try{appointmentEditDraft(snapshot,evidence);return true}catch{return false}
}
function isCauseReadField(snapshot:R1NodeFormsSnapshot, record:FormDataRead, field:R1RecordReadField):boolean {
 return causeRead?.forRecord(snapshot,record)?.fieldId === field.fieldId
}
onBeforeUnmount(() => causeRead?.dispose())
const panelKey=computed(()=>JSON.stringify([props.workOrderId,props.node.id,props.node.sourceNodeType,props.node.runId,props.node.formDefinitionId,props.node.lifecycle,props.node.handlers,props.node.visibility,props.node.formFieldIdsReadOnly]))
const count=computed(()=>{
 const s=readState.value
 return s&&s.actorScope===props.actorScope&&s.snapshot.workOrderId===props.workOrderId
  &&s.snapshot.node.id===props.node.id&&reader?.isCurrent(s.snapshot)?s.snapshot.records.length:null
})
defineExpose({flushLocalDraft:()=>panel.value?.flushLocalDraft()??Promise.resolve(false)})
</script>
