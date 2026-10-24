import type { StoragePort } from '@shared/ports'
import { createOperationError } from '@shared/types'
import type { OperationSnapshot } from '@shared/types'

/**
 * Offline-only R1 multi-step receipt coordinator. No concrete HTTP adapter
 * implements this executor, and the App must not wire live FormData/Exts/
 * Workflow commands before first-pilot evidence + Owner authorization.
 *
 * Persist EACH step's "dispatched-or-may-dispatch" marker first. No automatic
 * recovery/replay, even when an executor reports HTTP failure: the backend
 * might have committed the mutation before the response was lost.
 */
export type R1MultiStepKind =
  | 'form_upsert' | 'repeat_form_upsert' | 'forms_exts_update'
  | 'forms_soft_delete' | 'repeat_remove' | 'workflow_process'
export interface R1MultiStepScope {
  readonly userId: string
  readonly workOrderId: string
  readonly runtimeNodeId: string
  /** Actual node workflow run; required by R1 repeat FormData saves. */
  readonly workflowRunId?: string
  readonly formDefinitionId: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly authorizationScope: string
}
export interface R1MultiStepReceipt {
  readonly version: 1
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly workflowRunId?: string
  readonly userId: string
  readonly formDefinitionId: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly actorHash: string
  readonly steps: readonly R1MultiStepKind[]
  readonly stepIndex: number
  readonly state: 'may_have_dispatched' | 'acknowledged' | 'completed'
  readonly savedFormDataIds: readonly string[]
  /** Server identity for an edit/delete, never local draft ID or raw payload. */
  readonly targetFormDataId?: string
}
export interface R1StepExecutionContext {
  readonly step: R1MultiStepKind
  readonly stepIndex: number
  readonly savedFormDataIds: readonly string[]
}
export interface R1StepAcknowledgement {
  readonly savedFormDataId?: string
}
export interface R1AuthoritativeCompletionReadback {
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly sourceNodeType: 'forms' | 'repeat'
  readonly savedFormDataIds: readonly string[]
  /** Verified workflow readback after Process, not merely an HTTP ACK. */
  readonly workflowCompleted: true
}
/** Offline readback gate for operations which do NOT call workflow/process.
 * A future live caller must populate it from freshly fetched R1 responses,
 * not from a local draft, stale cache or the write response itself. */
export interface R1AuthoritativeMutationReadback {
  readonly workOrderId: string
  readonly runtimeNodeId: string
  readonly formDefinitionId: string
  readonly workflowRunId?: string
  readonly sourceNodeType: 'forms' | 'repeat'
  /** Full R1 record returned by a separate read; absent after repeat/remove. */
  readonly formData?: Readonly<Record<string, unknown>>
  /** The exact fields submitted, compared to fresh FormData (transient). */
  readonly expectedFields?: Readonly<Record<string, string | number | boolean>>
  /** Full, non-truncated workflow-node EXTS readback for forms. */
  readonly formsExts?: Readonly<Record<string, unknown>>
  /** A separately fetched, complete workflow-scoped repeat query result. */
  readonly repeatList?: { readonly complete: true; readonly workflowRunId: string;
    readonly savedIds: readonly string[] }
}
export type R1StepExecutor = (context: R1StepExecutionContext) =>
  Promise<OperationSnapshot<R1StepAcknowledgement>>

const currentLocks = new Set<string>()
function fail<T>(message: string): OperationSnapshot<T> {
  return { state:'failed_terminal', error:createOperationError('unsupported_capability',message) }
}
function hash(s: string): string {
  let n=2166136261
  for(let i=0;i<s.length;i++)n=Math.imul(n ^ s.charCodeAt(i),16777619)
  return (n>>>0).toString(16).padStart(8,'0')
}
function key(s: R1MultiStepScope) {
  return { namespace:'draft' as const,
    key:['r1-multistep:v1',s.userId,s.workOrderId,s.runtimeNodeId,s.formDefinitionId]
      .map(encodeURIComponent).join(':') }
}
function valid(r: unknown,s:R1MultiStepScope): r is R1MultiStepReceipt {
  if (!r || typeof r!=='object' || Array.isArray(r)) return false
  const x=r as Record<string,unknown>
  const steps=x.steps, saved=x.savedFormDataIds
  return x.version===1 && x.userId===s.userId && x.workOrderId===s.workOrderId
    && x.runtimeNodeId===s.runtimeNodeId && x.formDefinitionId===s.formDefinitionId
    && x.workflowRunId===s.workflowRunId
    && x.sourceNodeType===s.sourceNodeType && x.actorHash===hash(s.authorizationScope)
    && Array.isArray(steps) && steps.length>0 && steps.length<=50
    && steps.every(y=>['form_upsert','repeat_form_upsert','forms_exts_update','forms_soft_delete','repeat_remove','workflow_process'].includes(String(y)))
    && typeof x.stepIndex==='number' && Number.isInteger(x.stepIndex)
    && x.stepIndex>=0 && x.stepIndex<steps.length
    && ['may_have_dispatched','acknowledged','completed'].includes(String(x.state))
    && Array.isArray(saved) && saved.length<=50
    && saved.every(y=>typeof y==='string' && y.trim().length>0)
    && (x.targetFormDataId===undefined || (typeof x.targetFormDataId==='string'
      && x.targetFormDataId.trim().length>0 && !x.targetFormDataId.startsWith('local-')))
}
async function read(storage:StoragePort,s:R1MultiStepScope):Promise<OperationSnapshot<R1MultiStepReceipt|null>> {
  let result:OperationSnapshot<unknown|null>
  try {result=await storage.read(key(s))}
  catch { return fail('持久化事务读取异常；禁止多表单写入。') }
  if (result.state!=='succeeded') return fail('持久化事务读取失败；禁止多表单写入。')
  if (result.data===null) return {state:'succeeded',data:null}
  if (!valid(result.data,s)) return fail('事务记录结构或操作人不符，需要人工核对。')
  return {state:'succeeded',data:result.data}
}
async function persist(storage:StoragePort,s:R1MultiStepScope,r:R1MultiStepReceipt):Promise<boolean> {
  try {
    const result=await storage.write(key(s),r)
    return result.state==='succeeded'
  } catch {return false}
}
function validatePlan(s:R1MultiStepScope,steps:readonly R1MultiStepKind[]):boolean {
  if (!s.userId || !s.workOrderId || !s.runtimeNodeId || !s.formDefinitionId || !s.authorizationScope
    || steps.length<1 || steps.length>50)return false
  if (s.sourceNodeType==='forms') {
    return (steps.length===3 && steps[0]==='form_upsert'
      && steps[1]==='forms_exts_update' && steps[2]==='workflow_process')
      || (steps.length===2 && steps[0]==='form_upsert' && steps[1]==='forms_exts_update')
      || (steps.length===2 && steps[0]==='forms_exts_update' && steps[1]==='forms_soft_delete')
      || (steps.length===1 && steps[0]==='workflow_process')
  }
  return (steps.length===1 && (steps[0]==='repeat_form_upsert' || steps[0]==='repeat_remove'
    || steps[0]==='workflow_process'))
    || (steps.length>=2 && steps.at(-1)==='workflow_process'
      && steps.slice(0,-1).every(x=>x==='repeat_form_upsert'))
}
export async function inspectR1MultiStepReceipt(storage:StoragePort,s:R1MultiStepScope) {
  return read(storage,s)
}

/** The completed receipt remains a replay fence until a separate, authoritative
 * workflow and FormData read confirms the server's state. Never clear on ACK. */
export async function closeCompletedR1ReceiptAfterReadback(
  storage:StoragePort, scope:R1MultiStepScope,
  readback:R1AuthoritativeCompletionReadback,
):Promise<boolean>{
  const receipt=await read(storage,scope)
  if(receipt.state!=='succeeded'||!receipt.data||receipt.data.state!=='completed')return false
  const r=receipt.data
  if(!r.steps.includes('workflow_process') || readback.workflowCompleted!==true
    || readback.workOrderId!==r.workOrderId
    || readback.runtimeNodeId!==r.runtimeNodeId||readback.sourceNodeType!==r.sourceNodeType
    || readback.savedFormDataIds.length!==r.savedFormDataIds.length
    || r.savedFormDataIds.some(x=>!readback.savedFormDataIds.includes(x)))return false
  try{return (await storage.remove(key(scope))).state==='succeeded'}catch{return false}
}

/** Clear a non-Process receipt only after operation-specific R1 state was
 * independently read back. In particular, a successful HTTP ACK is not proof
 * of a FormData+EXTS pair or of repeat removal. */
export async function closeCompletedR1MutationReceiptAfterReadback(
  storage:StoragePort, scope:R1MultiStepScope,
  readback:R1AuthoritativeMutationReadback,
):Promise<boolean>{
  const result=await read(storage,scope)
  if(result.state!=='succeeded'||!result.data||result.data.state!=='completed')return false
  const r=result.data
  if(r.steps.includes('workflow_process') || readback.workOrderId!==r.workOrderId
    || readback.runtimeNodeId!==r.runtimeNodeId
    || readback.formDefinitionId!==r.formDefinitionId
    || readback.workflowRunId!==r.workflowRunId
    || readback.sourceNodeType!==r.sourceNodeType)return false
  const saving=r.steps[0]==='form_upsert'||r.steps[0]==='repeat_form_upsert'
  const removing=r.steps.includes('forms_soft_delete')||r.steps.includes('repeat_remove')
  if(!saving&&!removing)return false
  const target=saving?r.savedFormDataIds[0]:r.targetFormDataId
  if(!target||target.startsWith('local-')
    || (saving && (r.savedFormDataIds.length!==1
      || (r.targetFormDataId!==undefined && r.targetFormDataId!==target))))return false
  const record=readback.formData
  if(r.sourceNodeType==='forms'){
    const list=readback.formsExts?.formList
    if(!Array.isArray(list)||list.length>100)return false
    const entries=list.filter(x=>x && typeof x==='object' && !Array.isArray(x)
      && (x as Record<string,unknown>)._id===target)
    if(entries.length!==1 || (entries[0] as Record<string,unknown>).state!==(saving?1:-1))return false
    if((r.steps[0]==='form_upsert' && r.steps[1]!=='forms_exts_update')
      || (r.steps[0]==='forms_exts_update' && r.steps[1]!=='forms_soft_delete'))return false
  } else {
    const list=readback.repeatList
    if(!list||list.complete!==true || list.workflowRunId!==r.workflowRunId
      || list.savedIds.length>50 || new Set(list.savedIds).size!==list.savedIds.length
      || list.savedIds.some(x=>!x||x.startsWith('local-'))
      || list.savedIds.includes(target)!==saving)return false
  }
  if(saving){
    if(!record || !readback.expectedFields || Array.isArray(readback.expectedFields)
      || record._id!==target || record.sid!==r.workOrderId
      || record.nodeId!==r.runtimeNodeId || record.smodule!=='serviceAppointment'
      || record.state!==1 || (r.sourceNodeType==='repeat'&&record.workflowId!==r.workflowRunId)
      || (record.formDefId!==undefined&&record.formDefId!==r.formDefinitionId))return false
    for(const [key,value] of Object.entries(readback.expectedFields)){
      if(record[key]!==value)return false
    }
  } else if(r.sourceNodeType==='forms'){
    if(!record || record._id!==target || record.sid!==r.workOrderId
      || record.nodeId!==r.runtimeNodeId || record.state!==-1)return false
  } else if(record!==undefined){
    // A repeat removal must be established by the complete scoped query;
    // do not treat a still-returned record as removed.
    if(record._id===target && record.state!==-1)return false
  }
  try{return (await storage.remove(key(scope))).state==='succeeded'}catch{return false}
}

/**
 * Injection point is for isolated local tests only. Caller supplies no direct
 * API request; live command adapter does NOT consume this interface.
 */
export async function executeR1MultiStepOffline(
  storage:StoragePort, scope:R1MultiStepScope,
  steps:readonly R1MultiStepKind[], executor:R1StepExecutor,
  /** Only separately verified server FormData IDs may be used for finalize-only Process. */
  authoritativeSavedIds:readonly string[] = [],
  /** Mandatory delete identity; optional exact existing-edit identity. */
  targetFormDataId?:string,
):Promise<OperationSnapshot<R1MultiStepReceipt>> {
  if(!validatePlan(scope,steps))return fail('R1 特殊节点事务计划无效。')
  const deletes=steps.includes('forms_soft_delete')||steps.includes('repeat_remove')
  if((deletes && !targetFormDataId)|| (targetFormDataId!==undefined
    && (!targetFormDataId.trim()||targetFormDataId.startsWith('local-')
      || (!deletes && !steps.includes('form_upsert') && !steps.includes('repeat_form_upsert')))))
    return fail('R1 编辑或删除缺少服务端 FormData 身份。')
  if(authoritativeSavedIds.length>50 || new Set(authoritativeSavedIds).size!==authoritativeSavedIds.length
    || authoritativeSavedIds.some(x=>!x.trim()||x.startsWith('local-'))
    || (steps.length!==1 && authoritativeSavedIds.length>0)
    || (steps.length===1 && steps[0]==='workflow_process' && authoritativeSavedIds.length===0))
    return fail('R1 完成节点缺少服务端已核验 FormData 身份。')
  const storageKey=key(scope).key
  const work=async():Promise<OperationSnapshot<R1MultiStepReceipt>>=>{
    if(currentLocks.has(storageKey))return fail('同一节点正在处理另一笔事务。')
    currentLocks.add(storageKey)
    try {
      const existing=await read(storage,scope)
      if(existing.state!=='succeeded')return fail('事务防重复记录读取失败。')
      if(existing.data!==null)return fail('事务已存在，需核对服务端状态；禁止自动重放。')
      const ids:string[]=[...authoritativeSavedIds]
      for(let stepIndex=0;stepIndex<steps.length;stepIndex++){
        const step=steps[stepIndex]!
        const base:Omit<R1MultiStepReceipt,'state'>={
          version:1,userId:scope.userId,workOrderId:scope.workOrderId,
          runtimeNodeId:scope.runtimeNodeId,formDefinitionId:scope.formDefinitionId,
          ...(scope.workflowRunId?{workflowRunId:scope.workflowRunId}:{}),
          sourceNodeType:scope.sourceNodeType,actorHash:hash(scope.authorizationScope),
          steps:[...steps],stepIndex,savedFormDataIds:[...ids],
          ...(targetFormDataId?{targetFormDataId}:{}),
        }
        // If persistence fails, absolutely no next command may be called.
        if(!await persist(storage,scope,{...base,state:'may_have_dispatched'}))
          return fail('发送前事务记录写入失败，未发出当前步骤。')
        let ack:OperationSnapshot<R1StepAcknowledgement>
        try { ack=await executor({step,stepIndex,savedFormDataIds:[...ids]}) }
        catch { return fail('事务请求结果未知；禁止自动重试。') }
        if(ack.state!=='succeeded'||!ack.data)
          return fail('事务步骤未收到可信成功回执；人工核对服务端结果。')
        if(step==='form_upsert'||step==='repeat_form_upsert'){
          const id=ack.data.savedFormDataId
          if(!id || !id.trim() || id.startsWith('local-') || ids.includes(id))
            return fail('事务保存回执未返回唯一 FormData ID。')
          ids.push(id)
        }
        if(!await persist(storage,scope,{
          ...base,state:stepIndex===steps.length-1?'completed':'acknowledged',
          savedFormDataIds:[...ids],
        })) return fail('步骤已返回成功，但记录未能落盘；禁止后续写入。')
      }
      const last=await read(storage,scope)
      return last.state==='succeeded' && last.data?.state==='completed'
        ? {state:'succeeded',data:last.data}
        : fail('事务完成状态不可核验，需人工检查。')
    } finally {currentLocks.delete(storageKey)}
  }
  const target=import.meta.env.UNI_PLATFORM
  const browser=target==='h5' || (target!=='mp-weixin' && target!=='app' && target!=='app-plus'&&typeof window!=='undefined')
  if(browser){
    if(typeof navigator==='undefined'||!navigator.locks)return fail('H5 缺少跨窗口事务锁，禁止操作。')
    try{return await navigator.locks.request(storageKey,{mode:'exclusive'},work)}
    catch{return fail('H5 跨窗口事务锁异常，禁止操作。')}
  }
  return work()
}
