<template>
  <view v-if="nodes.length" class="app-record-card archive-card" data-testid="appointment-archive">
    <template v-if="!selectedNode">
      <view class="archive-heading"><text class="archive-title">预约信息</text></view>
      <navigator v-for="(node,index) in nodes" :key="String(node.id)" :url="route(String(node.id))" class="archive-link">查看预约节点 {{ index + 1 }} ›</navigator>
      <text v-if="nodeId" class="archive-hint">原预约节点已变化，请重新选择。</text>
    </template>
    <R1NodeFormsReadPanel v-else-if="reader?.enabled() && selectedNode.lifecycle === 'active'" :key="panelKey"
      :reader="reader" :work-order-id="workOrderId" :runtime-node-id="String(selectedNode.id)" :actor-scope="actorScope"
      :read-revision="readRevision"
      :appointment-archive="{summary,recordId,route:recordRoute}" :edit-experience-override="isAppointmentEdit">
      <template #edit-experience="{context}">
        <template v-for="editContext in [context]" :key="editContext.recordId">
          <NormalAppointmentEditExperience :view="editContext" />
        </template>
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
import {computed,inject} from 'vue'
import type {WorkflowNodeRead} from '@shared/ports'
import {r1NodeFormsReaderKey,type R1NodeFormsSnapshot} from './r1-node-forms-read'
import {appointmentArchiveRoute} from './appointment-archive'
import {appointmentEditDraft} from './r1-repeat-appointment-edit'
import HistoricalAppointmentArchive from './HistoricalAppointmentArchive.vue'
import R1NodeFormsReadPanel from './R1NodeFormsReadPanel.vue'
import NormalAppointmentEditExperience from './components/NormalAppointmentEditExperience.vue'
const props=defineProps<{workOrderId:string;nodes:readonly WorkflowNodeRead[];actorScope:string|null;summary:boolean;nodeId?:string;recordId?:string;readRevision?:number}>()
const reader=inject(r1NodeFormsReaderKey,null)
const selectedNode=computed(()=>props.nodeId ? props.nodes.find(node=>String(node.id)===props.nodeId) : props.nodes.length===1?props.nodes[0]:undefined)
const panelKey=computed(()=>JSON.stringify([props.workOrderId,selectedNode.value,props.actorScope,props.recordId]))
function route(nodeId:string){return appointmentArchiveRoute(props.workOrderId,nodeId)}
function recordRoute(recordId?:string){return appointmentArchiveRoute(props.workOrderId,String(selectedNode.value!.id),recordId)}
function isAppointmentEdit(snapshot:R1NodeFormsSnapshot,id:string):boolean {
  if(!reader?.isCurrent(snapshot))return false
  const evidence=reader.currentRepeatAppointment?.(snapshot,id)
  if(!evidence||!reader.isCurrentRepeatAppointment?.(snapshot,id,evidence))return false
  try{appointmentEditDraft(snapshot,evidence);return true}catch{return false}
}
</script>
<style scoped lang="scss">
@import "@brand-ui/detail-archives.scss";
</style>
