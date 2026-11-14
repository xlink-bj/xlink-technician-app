<template>
 <ActionWorkspaceShell :customer-name="customerName" :service-address="serviceAddress" :service-district="serviceDistrict" :display-number="displayNumber" lifecycle="available" draft-status="clean" :can-submit="false" submit-label="返回工单详情">
  <view v-if="visible" data-testid="special-form-workspace-content">
   <AppActionContentHeading :title="content.node.displayName || '现场记录'" caption="按当前节点核对现场记录" icon="task" />
   <R1DevMockDynamicFormTransactionPanel v-if="content.mode!=='completed'" :key="panelKey" ref="panel"
    :kind="content.kind" :node="content.node" :work-order-id="workOrderId" :create-controller="createController" @changed="emit('changed')" />
   <AppStatus v-else tone="success" quiet message="现场记录已完成，可返回工单详情查看。" data-testid="a-special-complete" />
  </view>
  <template #actions>
   <text v-if="exitMessage" role="alert">{{ exitMessage }}</text>
   <AppButton block data-testid="special-form-workspace-back" @tap="emit('back')">返回工单详情</AppButton>
  </template>
 </ActionWorkspaceShell>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DevMockDynamicFormWorkspaceContent } from './dev-mock-dynamic-form-workspace-content'
import type { AStageDynamicFormMockControllerFactory } from './a-stage-dynamic-form-mock-port'
import R1DevMockDynamicFormTransactionPanel from './R1DevMockDynamicFormTransactionPanel.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppStatus from '@shared/ui/AppStatus.vue'
const props=defineProps<{workOrderId:string;content:DevMockDynamicFormWorkspaceContent;actorScope:string|null;visible:boolean;createController:AStageDynamicFormMockControllerFactory;serviceAddress?:string;serviceDistrict?:string;customerName?:string;displayNumber?:string;exitMessage?:string}>()
const emit=defineEmits<{(event:'changed'|'back'):void}>()
const panel=ref<{flushLocalDraft():Promise<boolean>}|null>(null)
// An owned active→closed pending session keeps its controller; actor/scope replacement cannot.
const panelKey=computed(()=>JSON.stringify([props.workOrderId,props.content.kind,props.content.node.id,props.content.node.runId,props.content.node.formDefinitionId,props.actorScope]))
defineExpose({flushLocalDraft:()=>props.content.mode==='completed'?Promise.resolve(true):panel.value?.flushLocalDraft()??Promise.resolve(false)})
</script>
