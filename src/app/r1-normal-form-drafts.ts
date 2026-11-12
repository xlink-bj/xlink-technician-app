import type { AuthSessionPort } from '@shared/ports'
import { asOpaqueId } from '@shared/types'
import type { ActionDraftIdentity, ActionDraftRecord, ActionDraftRepository } from '@runtimes/action'
import { actionDraftStorageKey } from '@runtimes/action'
import type { R1NodeFormsReader, R1NodeFormsSnapshot } from '@features/work-orders/r1-node-forms-read'
import { r1NormalDraftValues, type R1NormalDraftProvider, type R1NormalDraftRead } from '@features/work-orders/r1-normal-form-drafts'

const denied = (): never => { throw Error('本地草稿尚未安全保存，请保留页面并重试。') }
const valid = (v: unknown): v is string => typeof v === 'string' && !!v && v.trim() === v
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => (value as Record<string,unknown>)[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonical((value as Record<string,unknown>)[k])).join(',') + '}'
  return JSON.stringify(value)
}

/** Reuses the existing semantic draft repository. Serialization below is only
 * same-runtime ordering, not a cross-process/tab compare-and-swap guarantee. */
export function createR1NormalFormDraftProvider(input: {
  readonly auth: Pick<AuthSessionPort,'getCurrentSession'>
  readonly reader: R1NodeFormsReader
  readonly tenantId: string
  readonly repository: ActionDraftRepository
}): R1NormalDraftProvider {
  const queues = new Map<string, Promise<unknown>>()
  const owners = new Map<string, object>()
  let clock = 0
  function queue<T>(key: string, run: () => Promise<T>): Promise<T> {
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run)
    queues.set(key, next)
    void next.finally(() => { if (queues.get(key) === next) queues.delete(key) }).catch(() => undefined)
    return next
  }
  return { open(snapshot, actions) {
    const actor = input.auth.getCurrentSession()
    if (!actor?.currentRole || !valid(input.tenantId) || !valid(actor.user.id) || !valid(actor.currentRole.id)
      || !valid(snapshot.node.runId) || !valid(snapshot.definition.id) || snapshot.node.formDefinitionId !== snapshot.definition.id
      || !['forms','repeat'].includes(snapshot.node.sourceNodeType ?? '') || !input.reader.isCurrent(snapshot)) return null
    const identity: ActionDraftIdentity = { version:1, userId:actor.user.id, roleId:actor.currentRole.id,
      workOrderId:asOpaqueId<'WorkOrderId'>(snapshot.workOrderId), workflowNodeId:snapshot.node.id,
      actionIntent:'interact_with_form',contentKind:'dynamic_form',
      contentIdentity:JSON.stringify(['r1-normal-create-v1',input.tenantId,snapshot.node.runId,snapshot.definition.id]) }
    const principal={sessionRef:actor.sessionRef,userId:actor.user.id,roleId:actor.currentRole.id,roleVersion:actor.roleVersion}
    const key=actionDraftStorageKey(identity), owner={}; owners.set(key,owner)
    const schema=canonical([snapshot.definition,snapshot.fillableFieldIds,snapshot.node.formFieldIdsReadOnly,
      snapshot.node.sourceNodeType,principal.roleVersion ?? null])
    let revision: string | null = null, initialized=false, closed=false, closing=false, uncertain=false, conflict=false
    const sameActor=()=>{const a=input.auth.getCurrentSession();return a?.sessionRef===principal.sessionRef
      &&a.user.id===principal.userId&&a.currentRole?.id===principal.roleId&&a.roleVersion===principal.roleVersion}
    const scopeCurrent=()=>owners.get(key)===owner&&!closed&&sameActor()&&input.reader.isCurrent(snapshot)
    const live=()=>Boolean(actions&&scopeCurrent()&&!closing&&!actions.locked()&&(actions.canCreate?actions.canCreate():snapshot.node.sourceNodeType==='repeat'))
    const schemaCurrent=()=>schema===canonical([snapshot.definition,snapshot.fillableFieldIds,snapshot.node.formFieldIdsReadOnly,
      snapshot.node.sourceNodeType,principal.roleVersion??null])
    const eligible=()=>live()&&schemaCurrent()&&snapshot.records.length===0
    const rawRead=async()=>{const result=await input.repository.read(identity);if(result.state!=='succeeded')return denied();return result.data}
    const checkedRead=async()=>{const current=await rawRead();if((current?.updatedAt??null)!==revision){conflict=true;throw Error('另一处已更新本地草稿，请重新读取。')}return current}
    const stamp=()=>new Date(clock=Math.max(Date.now(),clock+1)).toISOString()
    const stored=(values:Readonly<Record<string,unknown>>,state:'editing'|'uncertain'|'complete',status:'unfinished'|'completed'='unfinished'):ActionDraftRecord<Readonly<Record<string,unknown>>>=>({
      version:1,identity,updatedAt:stamp(),status,values:{kind:'r1-normal-create-v1',schema,state,fields:values} })
    async function write(values:Readonly<Record<string,unknown>>, state:'editing'|'uncertain') {
      if(!initialized||conflict||uncertain||!eligible())return denied()
      const fields=r1NormalDraftValues(snapshot,actions!,values)
      if(state==='uncertain')uncertain=true
      // Capture validated values before navigation revokes live authority. An
      // already queued local write may finish; no late callback can grant save.
      return queue(key,async()=>{await checkedRead();const record=stored(fields,state)
        const result=await input.repository.write(record);if(result.state!=='succeeded')return denied();revision=record.updatedAt})
    }
    async function finish() {
      if(!initialized||conflict||!sameActor()||owners.get(key)!==owner||closed)return denied()
      closing=true
      return queue(key,async()=>{if(closed)return;await checkedRead();const record=stored({},'complete','completed')
        const result=await input.repository.write(record);if(result.state!=='succeeded')return denied();revision=record.updatedAt
        const removed=await input.repository.remove(identity);if(removed.state!=='succeeded')return denied();revision=null;closed=true})
    }
    return {
      async read():Promise<R1NormalDraftRead> {return queue(key,async()=>{
        try {
          if(!scopeCurrent())return{state:'blocked',message:'当前表单权限尚未核实，本地草稿未恢复。'}
          const record=await rawRead();if(!scopeCurrent())return{state:'blocked',message:'当前表单权限已变化，本地草稿未恢复。'};revision=record?.updatedAt??null;initialized=true
          if(!record){if(snapshot.records.length){closed=true;return{state:'empty'}}return{state:'empty'}}
          const v=record.values
          if(record.status==='completed')return{state:'blocked',message:'本地草稿清理尚未完成，请重试丢弃。'}
          if(v.kind==='r1-normal-create-v1'&&v.state==='uncertain'){uncertain=true;return{state:'uncertain',message:'上次保存结果尚未核实。本地草稿已保留，请核对已保存记录，勿重复提交。'}}
          if(v.kind!=='r1-normal-create-v1'||v.schema!==schema||!eligible())return{state:'blocked',message:'记录、字段配置或权限已变化，本地草稿已保留，未覆盖当前表单。'}
          if(v.state!=='editing')return denied()
          const fields=r1NormalDraftValues(snapshot,actions!,v.fields as Readonly<Record<string,unknown>>,true)
          return Object.keys(fields).length?{state:'recoverable',values:fields}:{state:'empty'}
        } catch {return{state:'failed',message:'本地草稿暂时无法读取，当前内容未覆盖，请保留页面后重试。'}}
      })},
      save:values=>write(values,'editing'),markUncertain:values=>write(values,'uncertain'),
      discard:async()=>{if(uncertain)throw Error('保存结果尚未核实，不能丢弃或重放。');await finish()},
      complete:finish,
    }
  } }
}
