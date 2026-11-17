import {nativeAppointmentMockEnabled} from '@shared/config/native-appointment-mock'
import {nativeAppointmentIds as ids,nativeAppointmentFields,createNativeAppointmentMockCommandTransport} from '@adapters/api/mock/native-appointment'
import {createRepeatAppointmentPageActions} from './r1-repeat-appointment-actions'
import type {AuthSessionPort} from '@shared/ports'
import type {R1NodeFormsReader} from '@features/work-orders/r1-node-forms-read'
import type {R1RepeatActionProvider} from '@features/work-orders/r1-repeat-actions-port'
export function createNativeAppointmentMockActionProvider(input:{auth:Pick<AuthSessionPort,'getCurrentSession'>;reader:R1NodeFormsReader;env:Record<string,unknown>;origin:string}):R1RepeatActionProvider{
 const grant={version:2 as const,scope:{tenantId:ids.tenantId,userId:ids.userId,roleId:ids.roleId,workOrderId:ids.workOrderId,workflowRunId:ids.workflowRunId,runtimeNodeId:ids.runtimeNodeId,formDefinitionId:ids.formDefinitionId},recordIds:[ids.recordId]}
 return{forSnapshot(snapshot){
  if(!nativeAppointmentMockEnabled(input.env,input.origin))return null
  return createRepeatAppointmentPageActions({...input,snapshot,getGrant:()=>nativeAppointmentMockEnabled(input.env,input.origin)?grant:null,
   schemaMatches:s=>s.workOrderId===ids.workOrderId&&s.node.id===ids.runtimeNodeId&&s.node.runId===ids.workflowRunId
    &&s.definition.id===ids.formDefinitionId&&s.node.formDefinitionId===ids.formDefinitionId
    &&s.definition.fields?.length===6&&s.fillableFieldIds?.length===6&&s.node.formFieldIdsReadOnly?.length===0
    &&nativeAppointmentFields.every(field=>s.definition.fields?.some(actual=>actual.fieldId===field._id)&&s.fillableFieldIds?.includes(field._id)),
   transport:createNativeAppointmentMockCommandTransport()})
 }}
}
