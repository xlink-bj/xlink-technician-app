import { vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'

const commands = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@adapters/api/uni-api-command-transport', () => ({ createUniApiCommandTransport: () => commands }))
const origin = 'http://127.0.0.1:5189'
export function existingRecordFixture(alternate = false) {
  const scope = { tenantId: 'tenant-edit', userId: 'engineer', roleId: 'technician', workOrderId: 'job-edit', workflowRunId: 'run-edit', runtimeNodeId: 'node-edit', formDefinitionId: 'survey-edit' }
  let actor: any = { sessionRef: 'synthetic-edit-session', user: { id: scope.userId }, currentRole: { id: scope.roleId } }
  let listed = true, beforeRead: (() => void) | undefined, afterDispatch: (() => void) | undefined
  const keys = alternate ? ['width', 'visitComment'] : ['squareMeter', 'memo']
  const fields: any[] = keys.map((name, i) => ({ _id: 'configured-' + i, tenantId: scope.tenantId, extId: scope.formDefinitionId,
    state: 1, name, nameDisp: i ? '现场说明' : '测量值', type: i ? 'textarea' : 'digit', required: i ? '0' : '1',
    preset: alternate && i ? 0 : 1, colName: 'survey', operationType: '1', showList: ['4'], showType: '1', frontEndConfig: '{}' }))
  const node: any = { _id: scope.runtimeNodeId, tenantId: scope.tenantId, orgId: 'org-edit', workflowId: scope.workflowRunId,
    workflowFormDataId: scope.workOrderId, workflowFormColName: 'serviceAppointment', state: 0, handlerIds: [scope.userId],
    nodeDef: { nodeType: 'repeat', name: '现场勘查', formDefId: scope.formDefinitionId, viewableRoleIds: [scope.roleId],
      formFieldIdsFill: fields.map(f => f._id), formFieldIdsReadOnly: [] } }
  const ext: any = { _id: scope.formDefinitionId, tenantId: scope.tenantId, state: 1, type: '1', colName: 'survey' }
  const record: any = { _id: 'saved-edit', sid: scope.workOrderId, nodeId: scope.runtimeNodeId, workflowId: scope.workflowRunId,
    tenantId: scope.tenantId, orgId: 'org-edit', orgName: '合成组织', belongTo: scope.userId, state: 1, [keys[0]!]: 12.5,
    ...(alternate ? {} : { [keys[1]!]: '原说明' }), exts: { preserved: { sequence: [1, 2], empty: null }, ...(alternate ? { [keys[1]!]: '原说明' } : {}) },
    part: ['4'], surveyDrawing: [], infraredImageList: [], sourceType: 4, serviceType: '11',
    name: '合成客户', address: '合成现场', createTime: 1700000000123, updateTime: 1700001000000,
    createUser: scope.userId, createUserName: '合成创建者', updateUser: scope.userId, updateUserName: '合成编辑者', etags: {} }
  const other = { ...structuredClone(record), _id: 'saved-other' }, writes: any[] = [], events: string[] = []
  const grant: any = { version: 6, synthetic: true, profile: 'configured-record-edit', scope, expiresAt: '2099-01-01T00:00:00Z',
    fieldIds: fields.map(f => f._id), operations: ['edit'], recordIds: [record._id] }
  const env: any = { DEV: true, VITE_XLINK_ENVIRONMENT: 'dev', VITE_XLINK_AUTH_TENANT: scope.tenantId,
    VITE_XLINK_API_BASE_URL: origin + '/xlink/wm', VITE_XLINK_MOCK: 'false', VITE_XLINK_R1_NODE_FORM_READ: 'true',
    VITE_XLINK_ENABLE_REAL_WRITES: 'true', VITE_XLINK_ENABLE_R1_SPECIAL_WRITES: 'true', VITE_XLINK_R1_REPEAT_ACTIONS: 'true',
    VITE_XLINK_R1_REPEAT_GRANT: JSON.stringify(grant) }
  const auth = { getCurrentSession: () => actor }
  const transport = { execute: vi.fn(async (request: any) => {
    events.push(request.path); beforeRead?.()
    if (request.path === 'basic/serviceAppointment/queryById/' + scope.workOrderId) return structuredClone({ success: true, status: 1,
      data: { serviceAppointment: { _id: scope.workOrderId, tenantId: scope.tenantId, state: 1, workflowId: scope.workflowRunId },
        workflow: { _id: scope.workflowRunId, tenantId: scope.tenantId, formDataId: scope.workOrderId, state: 0 }, workflowNode: [node] } })
    if (request.path === 'biz/ext/queryById.do') return structuredClone(ext)
    if (request.path === 'biz/extField/query') {
      const page = Number(request.body.page)
      return { data: structuredClone(fields.slice((page - 1) * 50, page * 50)), total: fields.length, page, size: 50 }
    }
    if (request.path === 'biz/extForm/findByIdWithWorkflow') {
      const selected=[record,other].find(r=>r._id===request.body.id)
      if(!selected)throw Error('No synthetic precise record')
      return {success:true,status:1,data:{data:structuredClone(selected),workflow:null,workflowNode:null}}
    }
    if (request.path === 'biz/extForm/query/' + scope.formDefinitionId) {
      const id = request.body?.['is:_id|string#and'], data = [record, other].filter(r => !id || r._id === id)
      const rows=structuredClone(data)
      for(const row of rows)for(const key of ['createTime','updateTime'])if(typeof row[key]==='number')row[key]=new Date(row[key]+8*3600000).toISOString().slice(0,19).replace('T',' ')
      return { data: rows, total: data.length, page: 1, size: Number(request.body.rows) }
    }
    throw Error('Unexpected synthetic readonly path: ' + request.path)
  }) }
  const reader = createNormalNodeFormsReader({ auth, tenantId: scope.tenantId, env, origin, transport,
    read: { isWorkOrderListedForCurrentSession: () => listed, listWorkOrders: vi.fn() } })
  commands.execute.mockImplementation(async (request: any) => {
    events.push(request.path); writes.push(structuredClone(request))
    if (request.path !== 'biz/extForm/upsert/' + scope.formDefinitionId) throw Error('Unexpected synthetic command')
    const value = JSON.parse(request.body.dataStr)
    if(ext.type==='1')delete value.smodule // A command context slot, not a persisted Survey property.
    Object.keys(record).forEach(k => delete record[k]); Object.assign(record, value)
    afterDispatch?.()
    return { success: true, status: 1, data: structuredClone(record) }
  })
  const provider = () => createNormalRepeatActionProvider({ auth, reader, env, origin })
  return { scope, keys, fields, ext, node, record, other, env, grant, reader, provider, writes, events, transport, commands,
    load: () => reader.load(scope.workOrderId, scope.runtimeNodeId), setGrant() { env.VITE_XLINK_R1_REPEAT_GRANT = JSON.stringify(grant) },
    changeActor() { actor = { ...actor, sessionRef: 'other-session' } }, unlist() { listed = false },
    beforeRead(fn?: () => void) { beforeRead = fn }, afterDispatch(fn?: () => void) { afterDispatch = fn },
    mapRoute() { ext.type='0';ext.colName='configuredNotes';for(const f of fields)f.colName=ext.colName
      for(const r of [record,other]){r.createTime='2026-11-07 13:04:09';r.updateTime=r.createTime} } }
}
