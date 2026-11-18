<template>
  <view v-if="nodes.length" :class="{ 'app-record-card archive-card': !editing }" data-testid="appointment-archive">
    <template v-if="!selectedNode">
      <view class="archive-heading"><text class="archive-title">预约信息</text></view>
      <navigator v-for="(node,index) in nodes" :key="String(node.id)" :url="route(String(node.id))" class="archive-link">查看预约节点 {{ index + 1 }} ›</navigator>
      <text v-if="nodeId" class="archive-hint">原预约节点已变化，请重新选择。</text>
    </template>
    <R1NodeFormsReadPanel v-else-if="reader?.enabled() && (selectedNode.lifecycle === 'active'
      || reader.canReadCompletedAppointment?.(workOrderId,String(selectedNode.id)))" :key="panelKey"
      ref="panel"
      :reader="reader" :work-order-id="workOrderId" :runtime-node-id="String(selectedNode.id)" :actor-scope="actorScope"
      :read-revision="readRevision"
      :appointment-archive="archivePresentation" :edit-experience-override="isAppointmentEdit"
      @archive-edit-change="setEditing">
      <template #archive-edit-experience="{context,busy,feedback}">
        <ActionWorkspaceShell h5-navigation-fit :customer-name="workspaceContext?.customerName"
          :display-number="workspaceContext?.displayNumber" :service-district="workspaceContext?.serviceDistrict"
          :service-address="workspaceContext?.serviceAddress" :lifecycle="busy ? 'submitting' : 'in_progress'"
          draft-status="clean" :can-submit="false" submit-label="确认保存记录" :business-feedback="feedback">
          <view v-if="context" :class="{ 'app-surface action-workspace-content appointment-edit-surface': editor?.pane !== 'time' }">
            <AppActionContentHeading v-if="editor?.pane !== 'time'" icon="appointment"
              :title="editor?.pane === 'confirm' ? '核对改约信息' : '预约信息'"
              :caption="editor?.pane === 'confirm' ? '请确认本次修改内容' : '请与客户确认上门时间安排'" />
            <NormalAppointmentEditExperience :key="context.recordId" ref="editor" :view="context" workspace-actions @cancel="requestCancel" />
          </view>
          <AppStatus v-else-if="!busy && !feedback" message="当前预约状态已变化，请返回详情重新查看。" tone="warning" quiet />
          <template #actions>
            <template v-if="confirmCancel && context && editor && !busy">
              <AppStatus class="appointment-edit-cancel-note" message="放弃对这条预约的未保存修改？" tone="warning" quiet />
              <view class="appointment-edit-actions">
                <AppButton class="appointment-edit-action" variant="text" block data-testid="appointment-edit-discard" @tap="cancelEdit">放弃修改</AppButton>
                <AppButton class="appointment-edit-action appointment-edit-action--primary" block
                  data-testid="appointment-edit-keep" @tap="confirmCancel = false">继续修改</AppButton>
              </view>
            </template>
            <view v-else-if="context && editor" class="appointment-edit-actions">
              <AppButton v-for="action in editor.actions" :key="action.id" :data-testid="action.id"
                class="appointment-edit-action" :class="{ 'appointment-edit-action--primary': action.variant === 'primary' }"
                :variant="action.variant" :disabled="action.disabled || busy" :loading="busy && action.id === 'normal-appointment-save'"
                block @tap="action.run">{{ action.label }}</AppButton>
            </view>
            <AppButton v-else variant="text" block :disabled="busy" data-testid="appointment-edit-cancel" @tap="requestCancel">
              取消修改
            </AppButton>
          </template>
        </ActionWorkspaceShell>
      </template>
    </R1NodeFormsReadPanel>
    <HistoricalAppointmentArchive v-else-if="selectedNode.lifecycle === 'closed'" :key="panelKey" :work-order-id="workOrderId" :node-id="String(selectedNode.id)"
      :actor-scope="actorScope" :summary="summary" :record-id="recordId" />
    <template v-else>
      <view class="archive-heading"><text class="archive-title">预约信息</text></view>
      <text class="archive-hint" data-testid="appointment-archive-unavailable">当前环境暂不支持读取预约档案。</text>
    </template>
  </view>
  <text v-else-if="!summary" class="archive-hint" data-testid="appointment-archive-unavailable">当前工单没有可核实的预约节点，请返回工单详情。</text>
</template>
<script setup lang="ts">
import {computed,inject,ref} from 'vue'
import type {WorkflowNodeRead} from '@shared/ports'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
import {r1NodeFormsReaderKey,type R1NodeFormsSnapshot} from './r1-node-forms-read'
import {appointmentArchiveRoute} from './appointment-archive'
import {appointmentEditDraft} from './r1-repeat-appointment-edit'
import HistoricalAppointmentArchive from './HistoricalAppointmentArchive.vue'
import R1NodeFormsReadPanel from './R1NodeFormsReadPanel.vue'
import NormalAppointmentEditExperience from './components/NormalAppointmentEditExperience.vue'
const props=defineProps<{workOrderId:string;nodes:readonly WorkflowNodeRead[];actorScope:string|null;summary:boolean;nodeId?:string;recordId?:string;readRevision?:number;
  workspaceContext?: { customerName?: string; displayNumber?: string; serviceDistrict?: string; serviceAddress?: string }}>()
const emit=defineEmits<{(event:'edit-mode-change',editing:boolean):void}>()
const reader=inject(r1NodeFormsReaderKey,null)
const panel = ref<InstanceType<typeof R1NodeFormsReadPanel> | null>(null)
const editor = ref<InstanceType<typeof NormalAppointmentEditExperience> | null>(null)
const editing = ref(false)
const confirmCancel = ref(false)
const selectedNode=computed(()=>props.nodeId ? props.nodes.find(node=>String(node.id)===props.nodeId) : props.nodes.length===1?props.nodes[0]:undefined)
const panelKey=computed(()=>JSON.stringify([props.workOrderId,selectedNode.value,props.actorScope,props.recordId]))
const archivePresentation = computed(() => ({ summary: props.summary, recordId: props.recordId, route: recordRoute }))
function route(nodeId:string){return appointmentArchiveRoute(props.workOrderId,nodeId)}
function recordRoute(recordId?:string){return appointmentArchiveRoute(props.workOrderId,String(selectedNode.value!.id),recordId)}
function setEditing(value:boolean) {
  editing.value = value
  if (!value) confirmCancel.value = false
  emit('edit-mode-change', value)
}
function cancelEdit() { return panel.value?.cancelArchiveEdit() ?? false }
function requestCancel(): boolean {
  if (!editing.value) return false
  if (!editor.value?.hasChanges) return cancelEdit()
  confirmCancel.value = true
  return true
}
function backPress(): boolean {
  if (confirmCancel.value) {
    confirmCancel.value = false
    return true
  }
  return editor.value?.backPress() || requestCancel()
}
defineExpose({backPress})
function isAppointmentEdit(snapshot:R1NodeFormsSnapshot,id:string):boolean {
  if(!reader?.isCurrent(snapshot))return false
  const evidence=reader.currentRepeatAppointment?.(snapshot,id)
  if(!evidence||!reader.isCurrentRepeatAppointment?.(snapshot,id,evidence))return false
  try{appointmentEditDraft(snapshot,evidence);return true}catch{return false}
}
</script>
<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
.appointment-edit-surface { margin-top: var(--app-space-md); padding: var(--app-card-padding); }
.appointment-edit-cancel-note { margin-bottom: var(--app-space-sm); }
.appointment-edit-actions { display: flex; gap: var(--app-action-bar-gap); }
.appointment-edit-action { flex: 1; min-width: 0; }
.appointment-edit-action--primary { flex: 2; order: 1; }
</style>
