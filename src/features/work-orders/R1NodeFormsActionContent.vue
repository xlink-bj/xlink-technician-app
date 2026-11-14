<template>
  <ActionWorkspaceShell :class="{'app-visual-scope--craft':commercialForm}" :customer-name="customerName" :service-address="serviceAddress" :service-district="serviceDistrict" :display-number="displayNumber"
    :h5-navigation-fit="true" lifecycle="available" draft-status="clean" :can-submit="false" submit-label="返回工单详情">
  <view v-if="visible" data-testid="normal-form-workspace-content">
   <view :data-testid="commercialForm ? 's01-normal-form' : undefined">
    <AppActionContentHeading :title="node.displayName || '表单记录'" :caption="commercialForm ? (footer?.editing ? '请按现场实际情况填写' : '查看与核对已保存记录') : '按当前节点配置查看与填写'" :variant="commercialForm?'survey':'default'" icon="task" />
    <text v-if="count !== null && !commercialForm" data-testid="normal-form-workspace-count">已加载 {{ count }} 条</text>
    <R1NodeFormsReadPanel v-if="reader?.enabled()" :key="panelKey" ref="panel"
      :commercial="commercialForm" :reader="reader" :work-order-id="workOrderId" :runtime-node-id="String(node.id)"
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
  </view>
  <template #actions>
    <text v-if="exitMessage" role="alert">{{ exitMessage }}</text>
    <view class="normal-form-footer">
      <AppButton block :variant="commercialForm?'text':'primary'" data-testid="normal-form-workspace-back" @tap="emit('back')">返回工单详情</AppButton>
      <text v-if="commercialForm && footer?.notice" class="normal-form-footer__notice" aria-live="polite">{{ footer.notice }}</text>
      <view v-if="commercialForm && footer?.actions.length" class="normal-form-footer__actions">
        <view v-for="action in footer.actions" :key="action.id" class="normal-form-footer__action">
        <AppButton :data-testid="action.id" :variant="action.variant"
          :disabled="action.disabled" :loading="action.loading" block @tap="action.run">{{ action.label }}</AppButton>
        </view>
      </view>
    </view>
  </template>
  </ActionWorkspaceShell>
</template>
<script setup lang="ts">
import { computed, inject, shallowRef, ref, watch, onBeforeUnmount } from 'vue'
import type { FormDataRead, WorkflowNodeRead } from '@shared/ports'
import { r1NodeFormsReaderKey, type R1NodeFormsSnapshot } from './r1-node-forms-read'
import { createNormalSurveyCauseRead, surveyLeakageCauseReadKey } from './survey-leakage-cause-read'
import SurveyLeakageCauseExperience from './components/SurveyLeakageCauseExperience.vue'
import NormalAppointmentEditExperience from './components/NormalAppointmentEditExperience.vue'
import { appointmentEditDraft } from './r1-repeat-appointment-edit'
import type { R1RecordReadField } from './r1-record-read-fields'
import R1NodeFormsReadPanel from './R1NodeFormsReadPanel.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import type {R1FormWorkspaceFooter} from './r1-form-workspace-presentation'
import AppButton from '@shared/ui/AppButton.vue'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
const props=defineProps<{workOrderId:string;node:WorkflowNodeRead;actorScope:string|null;visible:boolean;serviceAddress?:string;serviceDistrict?:string;customerName?:string;displayNumber?:string;exitMessage?:string}>()
const emit=defineEmits<{(event:'changed'|'back'):void}>()
const reader=inject(r1NodeFormsReaderKey,null)
const panel=ref<{flushLocalDraft():Promise<boolean>;workspaceFooter:R1FormWorkspaceFooter}|null>(null)
const readState=shallowRef<{actorScope:string;snapshot:R1NodeFormsSnapshot}|null>(null)
const causeDependencies = inject(surveyLeakageCauseReadKey, null)
const causeRead = reader && causeDependencies ? createNormalSurveyCauseRead({ reader, ...causeDependencies, source: () => {
 const s = readState.value
 return props.visible && s && props.actorScope && s.actorScope === props.actorScope
   ? { snapshot: s.snapshot, actorScope: props.actorScope, workOrderId: props.workOrderId, nodeId: String(props.node.id) } : null
} }) : null
const visualScope=computed(()=>JSON.stringify([props.workOrderId,props.node.id,props.node.formDefinitionId,props.actorScope]))
const presentation=shallowRef<{scope:string;purpose?:string}|null>(null)
watch(readState,value=>{if(value&&value.actorScope===props.actorScope)presentation.value={scope:visualScope.value,purpose:value.snapshot.definition.purpose}},{flush:'sync'})
const commercialForm=computed(()=>props.node.formPurpose!=='appointment'&&presentation.value?.scope===visualScope.value&&presentation.value.purpose!=='appointment')
const footer=computed(()=>panel.value?.workspaceFooter)
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

<style scoped>
.normal-form-footer{width:100%}
.normal-form-footer__notice{display:block;color:var(--app-color-text-secondary);font-size:var(--app-font-meta);line-height:1.4;margin-bottom:var(--app-space-sm);text-align:center}
.normal-form-footer__actions{display:flex;flex-wrap:wrap;gap:var(--app-action-bar-gap);width:100%}
.normal-form-footer__action{flex:1 1 0;min-width:0}
</style>
