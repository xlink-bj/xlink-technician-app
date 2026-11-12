<template>
  <ActionWorkspaceShell :customer-name="customerName" :display-number="displayNumber"
    lifecycle="available" draft-status="clean" :can-submit="false" submit-label="返回工单详情">
  <view v-if="visible" data-testid="normal-form-workspace-content">
    <AppActionContentHeading :title="node.displayName || '表单记录'" caption="按当前节点配置查看与填写" icon="task" />
    <text v-if="count !== null" data-testid="normal-form-workspace-count">已加载 {{ count }} 条</text>
    <R1NodeFormsReadPanel v-if="reader?.enabled()" :key="panelKey" ref="panel"
      :reader="reader" :work-order-id="workOrderId" :runtime-node-id="String(node.id)"
      :actor-scope="actorScope" @changed="emit('changed')" @snapshot-change="readState=$event" />
  </view>
  <template #actions>
    <text v-if="exitMessage" role="alert">{{ exitMessage }}</text>
    <AppButton block data-testid="normal-form-workspace-back" @tap="emit('back')">返回工单详情</AppButton>
  </template>
  </ActionWorkspaceShell>
</template>
<script setup lang="ts">
import { computed, inject, shallowRef, ref } from 'vue'
import type { WorkflowNodeRead } from '@shared/ports'
import { r1NodeFormsReaderKey, type R1NodeFormsSnapshot } from './r1-node-forms-read'
import R1NodeFormsReadPanel from './R1NodeFormsReadPanel.vue'
import ActionWorkspaceShell from '@shared/ui/ActionWorkspaceShell.vue'
import AppButton from '@shared/ui/AppButton.vue'
import AppActionContentHeading from '@shared/ui/AppActionContentHeading.vue'
const props=defineProps<{workOrderId:string;node:WorkflowNodeRead;actorScope:string|null;visible:boolean;customerName?:string;displayNumber?:string;exitMessage?:string}>()
const emit=defineEmits<{(event:'changed'|'back'):void}>()
const reader=inject(r1NodeFormsReaderKey,null)
const panel=ref<{flushLocalDraft():Promise<boolean>}|null>(null)
const readState=shallowRef<{actorScope:string;snapshot:R1NodeFormsSnapshot}|null>(null)
const panelKey=computed(()=>JSON.stringify([props.workOrderId,props.node.id,props.node.sourceNodeType,props.node.runId,props.node.formDefinitionId,props.node.lifecycle,props.node.handlers,props.node.visibility,props.node.formFieldIdsReadOnly]))
const count=computed(()=>{
 const s=readState.value
 return s&&s.actorScope===props.actorScope&&s.snapshot.workOrderId===props.workOrderId
  &&s.snapshot.node.id===props.node.id&&reader?.isCurrent(s.snapshot)?s.snapshot.records.length:null
})
defineExpose({flushLocalDraft:()=>panel.value?.flushLocalDraft()??Promise.resolve(false)})
</script>
