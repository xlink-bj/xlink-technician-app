import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectWorkOrderInformation, workOrderInformationFields, workOrderInformationRequest } from '@adapters/api/read-models/work-order-information'
import { ApiReadTransportError, createRoleScopedTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { r1ReadFieldDisplayValue } from '@features/work-orders/r1-record-read-fields'
import { asOpaqueId } from '@shared/types'

const row = (name: string, extra: Record<string, unknown> = {}) => ({ _id: 'field-' + name, name, nameDisp: name,
  colName: 'serviceAppointment', tenantId: 'tenant', state: 1, preset: 0, type: 'text', showList: ['4'], order: 0, ...extra })
const page = (data: unknown[]) => ({ data, total: data.length, page: 1, size: 200 })
const fields = (data: unknown[]) => workOrderInformationFields(page(data), 'tenant')
const display = (record: Record<string, unknown>, data: unknown[], phone = true) => projectWorkOrderInformation(record, fields(data), phone)
  .map(({field, value}) => [field.label, field.unsupportedReason ? 'unsupported' : r1ReadFieldDisplayValue(field, value)])

beforeEach(() => { vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'dev'); vi.stubEnv('VITE_XLINK_API_BASE_URL', 'http://127.0.0.1:5189/xlink/wm'); vi.stubEnv('VITE_XLINK_MOCK', 'false') })
afterEach(() => vi.unstubAllEnvs())

describe('ServiceAppointment configured information is a bounded read projection', () => {
  it('reads only configured keys from exact root/exts locations and preserves server customized order and labels', () => {
    const record = { same: 'root', zero: 99, no: true, exts: { same: 'extension', zero: 0, no: false, audit: 'PRIVATE' } }
    expect(display(record, [row('same', { _id: 'extension', nameDisp: '新扩展名', order: 90 }), row('same', { _id: 'root', preset: 1, nameDisp: '根字段', order: 0 }), row('zero'), row('no')]))
      .toEqual([['新扩展名','extension'], ['根字段','root'], ['zero','0'], ['no','false']])
    expect(JSON.stringify(projectWorkOrderInformation(record, fields([row('same')]), true))).not.toContain('PRIVATE')
  })
  it('supports newly added and renamed ordinary fields without a fixed key list', () => {
    expect(display({ exts: { newField: '新增内容' } }, [row('newField', {nameDisp: '后台改名'})])).toEqual([['后台改名','新增内容']])
  })
  it.each(['editable','readonly','creatable'])('reads known %s edit modes without granting a write path', operationType => {
    expect(display({exts:{memo:'只读资料'}},[row('memo',{operationType})])).toEqual([['memo','只读资料']])
  })
  it('omits hidden, missing showList, frontend-hidden, role/operation rules and malformed conditions', () => {
    const config = [row('listOnly', {showList:['3']}), row('missing', {showList:undefined}), row('frontHidden', {frontEndConfig:'{"mpDetailHide":true}'}),
      row('role', {roleIds:['role']}), row('configRole', {frontEndConfig:'{"roleIds":["role"]}'}), row('unknownConfig', {frontEndConfig:{customPermission:'PRIVATE'}}), row('operation', {operationType:1}), row('malformed', {frontEndConfig:'{broken'}),
      row('condition', {showType:3, showField:'source', showValue:'yes'}), row('unsupportedRole', {showType:4, showField:'role', showValue:'role'})]
    expect(display({exts: Object.fromEntries(config.map(r=>[r.name,'PRIVATE']))}, config)).toEqual([])
  })
  it.each([0,1])('evaluates showFieldPreset=%s against its precise condition source', preset => {
    const config = [row('answer', {showType:3, showField:'source', showFieldPreset:preset, showValue:'yes'})]
    expect(display({source:'yes',exts:{source:'no',answer:'value'}}, config)).toEqual(preset ? [['answer','value']] : [])
    expect(display({source:'no',exts:{source:'yes',answer:'value'}}, config)).toEqual(preset ? [] : [['answer','value']])
  })
  it('does not mislabel a malformed EXTS container as an unsaved field', () => {
    expect(display({exts:'malformed'},[row('memo')])).toEqual([['memo','unsupported']])
  })
  it('shows unsupported types/objects without leaking their payload, and reuses dictionary formatting', () => {
    expect(display({exts:{unknown:{secret:'PRIVATE'},bad:{secret:'PRIVATE'}, choice:'a'}}, [row('unknown',{type:'newType'}),row('bad'),row('choice',{type:'radio', options:[{value:'a',label:'选项甲'}]})]))
      .toEqual([['unknown','unsupported'],['bad','unsupported'],['choice','选项甲']])
  })
  it('masks phones, omits them before acceptance and in the Production contact policy', () => {
    const config=[row('phone',{preset:1}),row('extraPhone',{type:'phone'})]
    const record={status:104,phone:'13800000000',exts:{extraPhone:'13900000000'}}
    expect(display(record,config)).toEqual([['phone','138****0000'],['extraPhone','139****0000']])
    expect(display({...record,status:103},config)).toEqual([])
    expect(display(record,config,false)).toEqual([])
    expect(JSON.stringify(projectWorkOrderInformation(record, fields(config), true))).not.toContain('13800000000')
  })
  it.each([page([row('a',{tenantId:'other'})]),page([row('a',{colName:'contacts'})]),page([row('a',{preset:undefined})]),
    {...page([row('a')]),total:201}, {...page([row('a')]),total:undefined}, {...page([]),total:null}, {...page([]),total:''},page([row('a'),row('a')])])('rejects incomplete/unproven configuration', raw => {
    expect(()=>workOrderInformationFields(raw,'tenant')).toThrow()
  })
  it('allows a complete empty configuration to hide all generic information',()=>expect(display({phone:'PRIVATE'},[])).toEqual([]))
})

function harness() {
  let actor: any = { sessionRef:'session',userId:'user',roleId:'role',roleVersion:null }
  let config: unknown=page([row('memo')]), hook=async()=>{}, dictionary: unknown = {data:[{_id:'option',type:'information-choice',value:'A value',name:'已核实选项',order:0}],total:1,page:1,rows:50}
  const execute=vi.fn(async (request: ApiReadRequest): Promise<unknown> => {
    if(request.path.startsWith('function/'))return{data:{functionList:[{action:'/pages/serviceAppointment/serviceAppointments',order:0,exts:{tabDisplay:'1'}}]}}
    if(request.path==='basic/serviceAppointment/query')return{data:[{_id:'A'},{_id:'B'}],page:1,rows:20,total:2}
    if(request.path.startsWith('basic/serviceAppointment/queryById/'))return {data:{serviceAppointment:{_id:request.path.split('/').at(-1),tenantId:'tenant',name:'Verified customer',exts:{memo:request.path.endsWith('/A')?'A value':'B value'}}}}
    if(request.path==='biz/extField/query'){await hook();if(config instanceof Error)throw config;return structuredClone(config)}
    if(request.path==='code/query'){if(dictionary instanceof Error)throw dictionary;return dictionary}
    if(request.path==='biz/action/query.do')return{data:[]}
    throw Error('Unexpected read '+request.path)
  })
  const api=createRoleScopedTechnicianApiReadAdapter({execute},()=>actor?.roleId??null,{codeTenantId:'tenant',getReadAuthorizationScope:()=>actor})
  return {api,execute, config:(raw:unknown)=>{config=raw},dictionary:(raw:unknown)=>{dictionary=raw},hook:(fn:()=>Promise<void>)=>{hook=fn},revoke:()=>{actor=null},
    list:()=>api.listWorkOrders({page:1,pageSize:20,category:'all'}),read:(id='A')=>api.getWorkOrderDetail(asOpaqueId<'WorkOrderId'>(id))}
}

describe('information read integration preserves detail authority and fallback',()=>{
  it('uses only the bounded configuration protocol and returns independent values for A and B',async()=>{
    const h=harness();await h.list()
    expect((await h.read()).data?.informationFields?.[0]?.value).toBe('A value')
    expect((await h.read('B')).data?.informationFields?.[0]?.value).toBe('B value')
    expect(h.execute.mock.calls.filter(([r])=>r.path==='biz/extField/query').map(([r])=>r)).toEqual([workOrderInformationRequest,workOrderInformationRequest])
    expect(h.execute.mock.calls.some(([r])=>/upsert|save|process|contact/i.test(r.path))).toBe(false)
  })
  it('uses the existing complete scoped dictionary reader for configured choices',async()=>{
    const h=harness();h.config(page([row('memo',{type:'radio',valueOption:'information-choice'})]));await h.list()
    const value=(await h.read()).data?.informationFields?.[0];expect(value&&r1ReadFieldDisplayValue(value.field,value.value)).toBe('已核实选项')
  })
  it('retains clearly unverified choice display when its dictionary fails',async()=>{
    const h=harness();h.config(page([row('memo',{type:'radio',valueOption:'information-choice'})]));h.dictionary(new Error('offline'));await h.list()
    const value=(await h.read()).data?.informationFields?.[0];expect(value&&r1ReadFieldDisplayValue(value.field,value.value)).toBe('A value（选项未核实）')
  })
  it.each([new Error('offline'), {data:[]}, page([row('memo',{tenantId:'other'})])])('keeps verified fallback on failed/incomplete configuration',async config=>{
    const h=harness();h.config(config);await h.list();const result=await h.read()
    expect(result.state).toBe('succeeded');expect(result.data?.customerName).toBe('Verified customer');expect(result.data?.informationFields).toBeUndefined()
  })
  it('does not turn an authenticated denial into a legacy fallback',async()=>{
    const h=harness();h.config(new ApiReadTransportError('revoked','authorization_denied'));await h.list()
    expect((await h.read()).error?.category).toBe('authorization_denied')
  })
  it('rejects a late configuration response after identity revocation',async()=>{
    const h=harness();await h.list();let release!:()=>void;h.hook(()=>new Promise<void>(resolve=>{release=resolve}))
    const pending=h.read();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));h.revoke();release()
    expect((await pending).error?.category).toBe('authorization_denied')
  })
  it('does not read metadata for an unlisted ID or enable the unverified Production configuration route',async()=>{
    const h=harness();expect((await h.read()).error?.category).toBe('authorization_denied');expect(h.execute).not.toHaveBeenCalled()
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','prod');await h.list();expect((await h.read()).data?.informationFields).toBeUndefined()
    expect(h.execute.mock.calls.some(([r])=>r.path==='biz/extField/query')).toBe(false)
  })
})
