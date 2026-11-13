import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectWorkOrderInformation, workOrderInformationFields, workOrderInformationRequest } from '@adapters/api/read-models/work-order-information'
import { ApiReadTransportError, createRoleScopedTechnicianApiReadAdapter, type ApiReadRequest } from '@adapters/api/technician-api'
import { r1ReadFieldDisplayValue } from '@features/work-orders/r1-record-read-fields'
import { createUniApiReadTransport } from '@adapters/api/uni-api-read-transport'
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
  it.each([4,5])('does not expose role visibility mode %s without verified context', showType => {
    expect(display({role:'matching-role',exts:{memo:'PRIVATE'}},[row('memo',{showType,showField:'role',showFieldPreset:1,showValue:'matching-role'})])).toEqual([])
  })
  it.each([4,5])('keeps actual roleIds-only mode %s closed without a verified role context', showType => {
    expect(display({role:'matching-role',exts:{memo:'PRIVATE'}},[row('memo',{showType,roleIds:['matching-role']})])).toEqual([])
  })
  it('does not union all user roles to expose role rules for a different current role', () => {
    const record={user:{roleIds:['matching-role','other']},currentRole:{_id:'other'},exts:{memo:'PRIVATE'}}
    expect(display(record,[row('memo',{showType:4,roleIds:['matching-role']}),row('memo',{_id:'field-role5',showType:5,roleIds:['matching-role']})])).toEqual([])
  })
  it.each(['area','map'])('never infers a %s value from an unknown object shape',type=>{
    expect(display({exts:{memo:{coordinate:'PRIVATE'}}},[row('memo',{type})])).toEqual([['memo','unsupported']])
  })
  it('renders verified area paths from exact root/exts locations using the pinned three-level dictionary', () => {
    const record={area:['440000','440300','440305'],exts:{area:[330000,330100,330106]}}
    expect(display(record,[row('area',{preset:1,type:'area',nameDisp:'根区域'}),row('area',{_id:'ext-area',type:'area',nameDisp:'扩展区域'})]))
      .toEqual([['根区域','广东省深圳市南山区'],['扩展区域','浙江省杭州市西湖区']])
  })
  it.each([['440000','330100','330106'],['440000','440300','330106'],['990000','990100','990101'],['440000','440300'],[['440000','440300','440305']], '440000,440300,440305'])('does not reveal an unknown or mismatched area path (%j)', value=>{
    expect(display({exts:{area:value},province:'440000',city:'440300',district:'440305'},[row('area',{type:'area'})])).toEqual([['area','unsupported']])
  })
  it('preserves empty and absent area values without inventing administrative labels',()=>{
    expect(display({exts:{area:[]}},[row('area',{type:'area'})])).toEqual([['area','空值']])
    expect(display({exts:{area:null}},[row('area',{type:'area'})])).toEqual([['area','空值']])
    expect(display({},[row('area',{type:'area'})])).toEqual([['area','未保存']])
  })
  it('reads map addresses as plain field strings and never reconstructs them from gpsPoint',()=>{
    const record={address:'合成根地址',gpsPoint:{longitude:'PRIVATE-LNG',latitude:'PRIVATE-LAT'},exts:{address:'合成扩展地址'}}
    const config=[row('address',{preset:1,type:'map',nameDisp:'根地址'}),row('address',{_id:'ext-address',type:'map',nameDisp:'扩展地址'})]
    expect(display(record,config)).toEqual([['根地址','合成根地址'],['扩展地址','合成扩展地址']])
    const unreadGps={address:'合成根地址',exts:{address:'合成扩展地址'}}
    Object.defineProperty(unreadGps,'gpsPoint',{get:()=>{throw Error('gpsPoint must remain unread')}})
    expect(display(unreadGps,config)).toEqual([['根地址','合成根地址'],['扩展地址','合成扩展地址']])
    expect(JSON.stringify(projectWorkOrderInformation(record,fields(config),true))).not.toContain('PRIVATE')
    expect(display({gpsPoint:record.gpsPoint},[config[0]!])).toEqual([['根地址','未保存']])
  })
  it.each([{longitude:1,latitude:2},[1,2],42])('rejects non-string map data (%j) without projecting coordinates', value=>{
    expect(display({exts:{address:value}},[row('address',{type:'map'})])).toEqual([['address','unsupported']])
  })
  it('retains the phone privacy boundary even if metadata changes the phone type to map',()=>{
    expect(display({status:104,phone:'13800000000'},[row('phone',{preset:1,type:'map'})])).toEqual([['phone','138****0000']])
  })
  it('rejects Contacts configuration even when supplied as an empty-mobile-detail historical object', () => {
    expect(()=>fields([row('phone',{colName:'contacts',preset:1,showList:['1','2','3']})])).toThrow()
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
  return {api,execute, config:(raw:unknown)=>{config=raw},dictionary:(raw:unknown)=>{dictionary=raw},hook:(fn:()=>Promise<void>)=>{hook=fn},revoke:()=>{actor=null},switchRole:()=>{actor={...actor,roleId:'other',roleIds:['role','other']}},
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
  it('keeps a valid nonempty configuration with every field hidden distinct from a failed read',async()=>{
    const h=harness();h.config(page([row('memo',{showList:['3']}),row('name',{preset:1,frontEndConfig:{mpDetailHide:true}})]));await h.list()
    const result=await h.read();expect(result.state).toBe('succeeded');expect(result.data?.informationFields).toEqual([])
  })
  it('uses the existing complete scoped dictionary reader for configured choices',async()=>{
    const h=harness();h.config(page([row('memo',{type:'radio',valueOption:'information-choice'})]));await h.list()
    const value=(await h.read()).data?.informationFields?.[0];expect(value&&r1ReadFieldDisplayValue(value.field,value.value)).toBe('已核实选项')
  })
  it('deduplicates dictionaries within a detail and stops after four distinct providers',async()=>{
    const h=harness();h.config(page(Array.from({length:12},(_,index)=>row('choice'+index,{type:'radio',valueOption:'dictionary-'+Math.floor(index/2)}))));h.dictionary(new Error('unavailable'));await h.list()
    expect((await h.read()).state).toBe('succeeded')
    const reads=h.execute.mock.calls.filter(([r])=>r.path==='code/query').map(([r])=>r.body?.['is:type|string#and'])
    expect(reads).toEqual(['dictionary-0','dictionary-1','dictionary-2','dictionary-3'])
  })
  it('retains clearly unverified choice display when its dictionary fails',async()=>{
    const h=harness();h.config(page([row('memo',{type:'radio',valueOption:'information-choice'})]));h.dictionary(new Error('offline'));await h.list()
    const value=(await h.read()).data?.informationFields?.[0];expect(value&&r1ReadFieldDisplayValue(value.field,value.value)).toBe('A value（选项未核实）')
  })
  it.each([new Error('offline'), {data:[]}, page([row('memo',{tenantId:'other'})]), page([row('phone',{colName:'contacts',preset:1,showList:['1','2','3']})])])('keeps verified fallback on failed/incomplete configuration',async config=>{
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
  it('discards metadata after current-role switch even if the old role remains in user roles',async()=>{
    const h=harness();await h.list();let release!:()=>void;h.hook(()=>new Promise<void>(resolve=>{release=resolve}))
    const pending=h.read();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));h.switchRole();release()
    expect((await pending).error?.category).toBe('authorization_denied')
    expect((await h.read()).error?.category).toBe('authorization_denied')
    await h.list();h.hook(async()=>{});h.config(page([row('memo',{nameDisp:'新角色配置'})]))
    expect((await h.read()).data?.informationFields?.[0]?.field.label).toBe('新角色配置')
  })
  it.each(['beta','unknown'])('keeps the new reader closed outside actual guarded DEV (%s)',async environment=>{
    const h=harness();vi.stubEnv('VITE_XLINK_ENVIRONMENT',environment);await h.list()
    expect((await h.read()).data?.informationFields).toBeUndefined();expect(h.execute.mock.calls.some(([r])=>r.path==='biz/extField/query')).toBe(false)
  })
  it('does not read metadata for an unlisted ID or enable the unverified Production configuration route',async()=>{
    const h=harness();expect((await h.read()).error?.category).toBe('authorization_denied');expect(h.execute).not.toHaveBeenCalled()
    vi.stubEnv('VITE_XLINK_ENVIRONMENT','prod');await h.list();expect((await h.read()).data?.informationFields).toBeUndefined()
    expect(h.execute.mock.calls.some(([r])=>r.path==='biz/extField/query')).toBe(false)
  })
})


describe('metadata request cannot broaden the object, method or read budget', () => {
  it('resists mutation of the fixed request by another consumer', () => {
    expect(Reflect.set(workOrderInformationRequest.body, 'colName', 'contacts')).toBe(false)
    expect(Reflect.set(workOrderInformationRequest.body, 'size', 99999)).toBe(false)
    expect(Reflect.set(workOrderInformationRequest, 'method', 'DELETE')).toBe(false)
    expect(workOrderInformationRequest.body.colName).toBe('serviceAppointment')
    expect(workOrderInformationRequest.body.size).toBe(200)
    expect(workOrderInformationRequest.method).toBe('POST')
  })
  it.each(['contacts', 'order', 'material', 'ServiceAppointment', 'serviceAppointment/../contacts', 'serviceAppointment%00'])('rejects response object substitution %s', colName => {
    expect(() => fields([row('memo', { colName })])).toThrow()
  })
  it('rejects 201 returned rows even when the server count agrees', () => {
    expect(() => fields(Array.from({ length: 201 }, (_, index) => row('field' + index)))).toThrow()
  })
  it.each([
    workOrderInformationRequest,
    { ...workOrderInformationRequest, method: 'GET' },
    { ...workOrderInformationRequest, method: 'PUT' },
    { ...workOrderInformationRequest, method: 'DELETE' },
    { ...workOrderInformationRequest, body: { ...workOrderInformationRequest.body, colName: 'contacts' } },
    { ...workOrderInformationRequest, body: { ...workOrderInformationRequest.body, size: 201 } },
    { ...workOrderInformationRequest, body: { ...workOrderInformationRequest.body, page: 2 } },
    { ...workOrderInformationRequest, body: { ...workOrderInformationRequest.body, _all: '1' } },
    { ...workOrderInformationRequest, path: 'biz/extField/upsert' },
  ])('keeps unverified metadata and malicious variants closed before Production HTTP ($method $path)', async input => {
    vi.stubEnv('VITE_XLINK_ENVIRONMENT', 'prod')
    const request = vi.fn()
    const transport = createUniApiReadTransport({ apiBaseUrl:'https://xlink.fsgo365.cn/fsgo/wm',
      getSessionRef: () => asOpaqueId<'SessionRef'>('synthetic-session'), request })
    await expect(transport.execute(input as ApiReadRequest)).rejects.toMatchObject({ category: 'unsupported_capability' })
    expect(request).not.toHaveBeenCalled()
  })
})
