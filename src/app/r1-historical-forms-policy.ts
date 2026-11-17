import type { HistoricalFormTarget } from '@features/work-orders/r1-historical-forms-read'
import {appointmentFormDefinitionWireId as appointmentArchiveDefinitionId} from '@adapters/api/appointment-contract'

type Row = Record<string, unknown>
export const historyDenied = (): never => { throw Error('历史表单的权限、关联或完整性无法核实，请重新读取工单。') }
export const historyRow = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : historyDenied()
export const historyId = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.trim() === v && !/[\/,]/.test(v) ? v : historyDenied()
export function historyJson(v: unknown): string {
  const normalize = (x: unknown): unknown => {
    if (x === null || typeof x === 'string' || typeof x === 'boolean' || typeof x === 'number' && Number.isFinite(x)) return x
    if (Array.isArray(x)) return x.map(normalize)
    const r = historyRow(x)
    if (Object.getPrototypeOf(r) !== Object.prototype) return historyDenied()
    return Object.fromEntries(Object.keys(r).sort().map(k => [k, normalize(r[k])]))
  }
  const result = JSON.stringify(normalize(v))
  if (result.length > 200000) return historyDenied()
  return result
}
/** R1 getSAData's historical viewing rule, deliberately separate from action policy.
 * Bare handler IDs match the user here; roles come from the explicit role lists.
 * No R1 index-based universal creator exception, or legacy editing, is inferred. */
export function canReadHistoricalForms(raw: Row, actor: { userId: string; roleId: string }): boolean {
  if (raw.state !== 10 || raw.nodeId === '0') return false
  const def = historyRow(raw.nodeDef)
  if (def.nodeType !== 'forms'
    || def.nodeTypeOld !== undefined && def.nodeTypeOld !== 'forms') return false
  return historicalMembership(raw,actor)
}
function historicalMembership(raw: Row, actor: {userId:string;roleId:string}): boolean {
  const def=historyRow(raw.nodeDef)
  const arrays = [raw.handlerIds, def.userChoose, def.viewableRoleIds]
  if (arrays.some(v => v !== undefined && (!Array.isArray(v) || v.some(id => typeof id !== 'string' || !id || id.trim() !== id)))) return false
  return Boolean((raw.handlerIds as string[] | undefined)?.includes(actor.userId)
    || (def.userChoose as string[] | undefined)?.includes(actor.roleId)
    || (def.viewableRoleIds as string[] | undefined)?.includes(actor.roleId))
}

/** Separate appointment-only closed-node reads. R1 viewForm/getFormList,
 * 6c0a97b:6683–6694, 6987–7000, 10285–10301. Never an edit lease. */
export function historicalAppointmentSources(envelope: unknown, scope: {tenantId:string;workOrderId:string;userId:string;roleId:string}) {
  const root=historyRow(envelope),data=historyRow(root.data),sa=historyRow(data.serviceAppointment),wf=historyRow(data.workflow)
  if(root.success!==true||root.status!==1||sa._id!==scope.workOrderId||sa.tenantId!==scope.tenantId||sa.state!==1
    ||wf._id!==historyId(sa.workflowId)||wf.tenantId!==scope.tenantId||wf.formDataId!==scope.workOrderId
    ||![0,10].includes(wf.state as number)||!Array.isArray(data.workflowNode)||data.workflowNode.length>200)return historyDenied()
  matchesAliases(sa,['id'],scope.workOrderId);matchesAliases(wf,['id','workflowId','runId','workflowRunId'],historyId(wf._id))
  if(wf.formColName!==undefined&&wf.formColName!=='serviceAppointment')return historyDenied()
  const seen=new Set<string>()
  const sources=[]
  for(const raw of data.workflowNode){
    const n=historyRow(raw),nodeId=historyId(n._id)
    if(seen.has(nodeId))return historyDenied();seen.add(nodeId)
    if(n.state!==10||n.nodeId==='0')continue
    const def=historyRow(n.nodeDef)
    if(def.formDefId!==appointmentArchiveDefinitionId||!['forms','repeat'].includes(String(def.nodeType)))continue
    if(def.nodeTypeOld!==undefined&&def.nodeTypeOld!==def.nodeType)return historyDenied()
    if(!historicalMembership(n,scope))continue
    if(n.tenantId!==scope.tenantId||n.workflowId!==wf._id||n.workflowFormDataId!==scope.workOrderId||n.workflowFormColName!=='serviceAppointment')return historyDenied()
    matchesAliases(n,['id'],nodeId);matchesAliases(n,['workflowRunId','runId'],historyId(wf._id))
    matchesAliases(n,['formDefId'],appointmentArchiveDefinitionId);matchesAliases(def,['formDefinitionId','extId'],appointmentArchiveDefinitionId)
    let ids:string[]|undefined
    if(def.nodeType==='forms'){
      const exts=n.exts===undefined?undefined:historyRow(n.exts)
      if(exts&&Object.hasOwn(exts,'formList')){
        if(!Array.isArray(exts.formList)||exts.formList.length>50)return historyDenied()
        const refs=exts.formList.map(historyRow),allIds=new Set<string>();ids=[]
        for(const ref of refs){
          const key=historyId(ref._id)
          if(allIds.has(key)||![-1,1].includes(ref.state as number)||ref.formDefId!==appointmentArchiveDefinitionId)return historyDenied()
          allIds.add(key);matchesAliases(ref,['id','dataId'],key);matchesAliases(ref,['formDefinitionId','extId'],appointmentArchiveDefinitionId)
          if(ref.state===1)ids.push(key)
        }
      }else if(n.formDataId!==undefined&&n.formDataId!=='')ids=[historyId(n.formDataId)]
      else return historyDenied() // Missing references are unknown, never zero.
    }
    sources.push({workOrderId:scope.workOrderId,workflowRunId:historyId(wf._id),runtimeNodeId:nodeId,
      formDefinitionId:appointmentArchiveDefinitionId,sourceNodeType:def.nodeType as 'forms'|'repeat',ids,
      binding:historyJson({workflowState:wf.state,node:n})})
  }
  return sources
}
function matchesAliases(raw: Row, keys: readonly string[], expected: string): void {
  for (const key of keys) if (Object.hasOwn(raw, key) && raw[key] !== expected) historyDenied()
}
export function historicalTargets(envelope: unknown, scope: { tenantId: string; workOrderId: string; userId: string; roleId: string }) {
  const root = historyRow(envelope)
  if (root.success !== true || root.status !== 1) return historyDenied()
  const data = historyRow(root.data), sa = historyRow(data.serviceAppointment), wf = historyRow(data.workflow)
  if (sa._id !== scope.workOrderId || sa.tenantId !== scope.tenantId || sa.state !== 1
    || wf._id !== historyId(sa.workflowId) || wf.tenantId !== scope.tenantId || wf.formDataId !== scope.workOrderId
    || ![0, 10].includes(wf.state as number) || !Array.isArray(data.workflowNode) || data.workflowNode.length > 200) return historyDenied()
  matchesAliases(sa, ['id'], scope.workOrderId)
  matchesAliases(wf, ['id', 'workflowId', 'runId', 'workflowRunId'], historyId(wf._id))
  if (wf.formColName !== undefined && wf.formColName !== 'serviceAppointment') return historyDenied()
  const nodes = data.workflowNode.map(historyRow), seen = new Set<string>(), targets: HistoricalFormTarget[] = []
  const bindings = new Map<HistoricalFormTarget, string>()
  for (const n of nodes) {
    const nodeId = historyId(n._id)
    if (seen.has(nodeId)) return historyDenied()
    seen.add(nodeId)
    if (!canReadHistoricalForms(n, scope)) continue
    if (n.tenantId !== scope.tenantId || n.workflowId !== wf._id || n.workflowFormDataId !== scope.workOrderId
      || n.workflowFormColName !== 'serviceAppointment') return historyDenied()
    matchesAliases(n, ['id'], nodeId)
    matchesAliases(n, ['workflowRunId', 'runId'], historyId(wf._id))
    const def = historyRow(n.nodeDef)
    if (n.formDefId !== undefined && n.formDefId !== def.formDefId) return historyDenied()
    historyId(def.formDefId)
    matchesAliases(def, ['formDefinitionId', 'extId'], String(def.formDefId))
    const exts = historyRow(n.exts), refs = exts.formList
    if (!Array.isArray(refs) || refs.length > 50) return historyDenied()
    const recordIds = new Set<string>()
    for (const value of refs) {
      const ref = historyRow(value), recordId = historyId(ref._id), definitionId = historyId(ref.formDefId)
      if (recordIds.has(recordId) || ![1, -1].includes(ref.state as number)) return historyDenied()
      recordIds.add(recordId)
      for (const key of ['id', 'dataId']) if (Object.hasOwn(ref, key) && ref[key] !== recordId) return historyDenied()
      for (const key of ['formDefinitionId', 'extId']) if (Object.hasOwn(ref, key) && ref[key] !== definitionId) return historyDenied()
      if (ref.state === -1) continue
      const target: HistoricalFormTarget = Object.freeze({ kind: 'completed-forms-reference', workOrderId: scope.workOrderId,
        workflowRunId: historyId(wf._id), runtimeNodeId: nodeId, formDefinitionId: definitionId, recordId,
        title: typeof ref.formTitle === 'string' && ref.formTitle.trim() ? ref.formTitle.trim().slice(0, 80)
          : typeof def.name === 'string' && def.name.trim() ? def.name.trim().slice(0, 80) : '已完成表单' })
      targets.push(target)
      bindings.set(target, historyJson({ workflowState: wf.state, node: n }))
    }
  }
  if (targets.length > 200) return historyDenied()
  return { targets: Object.freeze(targets), bindings }
}
