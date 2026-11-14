<template>
 <R1DevMockDynamicFormActionContent v-if="devMockDynamicFormContent" ref="content" :content="devMockDynamicFormContent"
  :work-order-id="workOrderId" :actor-scope="actorScope" :visible="visible" :customer-name="customerName" :service-address="serviceAddress" :service-district="serviceDistrict"
  :display-number="displayNumber" :exit-message="exitMessage" :create-controller="createDevMockDynamicFormController"
  @changed="emit('changed')" @back="emit('back')" />
 <R1NodeFormsActionContent v-else-if="node" ref="content" :node="node" :work-order-id="workOrderId"
  :actor-scope="actorScope" :visible="visible" :customer-name="customerName" :service-address="serviceAddress" :service-district="serviceDistrict" :display-number="displayNumber"
  :exit-message="exitMessage" @changed="emit('changed')" @back="emit('back')" />
</template>
<script setup lang="ts">
import { ref } from 'vue'
import type { WorkflowNodeRead } from '@shared/ports'
import type { AStageDynamicFormMockControllerFactory } from './a-stage-dynamic-form-mock-port'
import type { DevMockDynamicFormWorkspaceContent } from './dev-mock-dynamic-form-workspace-content'
import R1NodeFormsActionContent from './R1NodeFormsActionContent.vue'
import R1DevMockDynamicFormActionContent from './R1DevMockDynamicFormActionContent.vue'
defineProps<{node:WorkflowNodeRead|null;devMockDynamicFormContent:DevMockDynamicFormWorkspaceContent|null;workOrderId:string;actorScope:string|null;visible:boolean;createDevMockDynamicFormController:AStageDynamicFormMockControllerFactory;serviceAddress?:string;serviceDistrict?:string;customerName?:string;displayNumber?:string;exitMessage?:string}>()
const emit=defineEmits<{(event:'changed'|'back'):void}>()
const content=ref<{flushLocalDraft():Promise<boolean>}|null>(null)
defineExpose({flushLocalDraft:()=>content.value?.flushLocalDraft()??Promise.resolve(false)})
</script>
