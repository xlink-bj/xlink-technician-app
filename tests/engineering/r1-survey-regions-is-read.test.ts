import { describe, expect, it, vi } from 'vitest'
import { createNormalNodeFormsReader } from '@app/r1-node-forms-read'
import { createNormalRepeatActionProvider } from '@app/r1-repeat-authorization'
import { projectR1RecordReadFields } from '@features/work-orders/r1-record-read-fields'

const origin='http://127.0.0.1:5189',definitionId='synthetic-regions-is-survey'
const env={DEV:true,VITE_XLINK_R1_NODE_FORM_READ:'true',VITE_XLINK_ENVIRONMENT:'dev',VITE_XLINK_MOCK:'false',VITE_XLINK_API_BASE_URL:origin+'/xlink/wm',VITE_XLINK_ENABLE_REAL_WRITES:'false',VITE_XLINK_ENABLE_R1_SPECIAL_WRITES:'false'}
function harness(excluded=false) {
  const session:any={sessionRef:'synthetic-code-reader',user:{id:'user'},currentRole:{id:'role'}}
  const fields:any[]=[
    {_id:'province-field',tenantId:'tenant',extId:definitionId,colName:'survey',name:'province',nameDisp:'合成省份',type:'select',valueOption:'regions',preset:1,showList:excluded?['5']:['4']},
    {_id:'mold-field',tenantId:'tenant',extId:definitionId,colName:'survey',name:'isMoldRemoved',nameDisp:'合成处理情况',type:'radio',valueOption:'IS',preset:0,showList:excluded?[]:['4']},
  ].map(f=>({...f,state:1,required:'0',multiple:false,readOnly:0,showType:'1',frontEndConfig:'{}'}))
  const record:any={_id:'saved',tenantId:'tenant',sid:'work',nodeId:'node',workflowId:'run',state:1,province:'SYN-P1',exts:{isMoldRemoved:'1'}}
  const node={_id:'node',tenantId:'tenant',workflowId:'run',workflowFormDataId:'work',workflowFormColName:'serviceAppointment',state:0,handlerIds:['role'],nodeDef:{nodeType:'repeat',formDefId:definitionId,formFieldIdsFill:[],formFieldIdsReadOnly:fields.map(f=>f._id)}}
  const calls:any[]=[];let fault:string|undefined
  const execute=vi.fn(async(request:any)=>{
    calls.push(structuredClone(request))
    if(request.path==='basic/serviceAppointment/queryById/work')return {success:true,status:1,data:{serviceAppointment:{_id:'work',tenantId:'tenant',workflowId:'run',state:1},workflow:{_id:'run',tenantId:'tenant',formDataId:'work',state:0},workflowNode:[node]}}
    if(request.path==='biz/ext/queryById.do')return {_id:definitionId,tenantId:'tenant',state:1,type:'1',colName:'survey'}
    if(request.path==='biz/extField/query')return {data:structuredClone(fields),total:2,page:1,size:50}
    if(request.path==='i/code/selectCode.do'){
      expect(request.body.tenantId).toBe('tenant')
      const query=JSON.parse(request.body.jsonPara);expect(query).toHaveLength(1)
      const code=query[0].codeId;expect(query).toEqual([{codeId:code,eleid:code}]);expect(['regions','IS']).toContain(code)
      const group:any={...query[0],options:code==='regions'?{'SYN-P1':'合成省一','SYN-P2':'合成省二'}:{'0':'合成未处理','1':'合成已处理'}}
      if(fault==='wrong-provider')group.codeId='other'
      if(fault==='wrong-eleid')group.eleid='other'
      if(fault==='foreign-tenant')group.tenantId='other-tenant'
      if(fault==='invalid-label')group.options[Object.keys(group.options)[0]!]={invalid:true}
      return JSON.stringify([group])
    }
    if(request.path==='biz/extForm/query/'+definitionId)return {data:[structuredClone(record)],total:1,page:1,size:request.body.rows,dataCount:1}
    throw Error('Unexpected request; commands are never allowed')
  })
  const auth={getCurrentSession:()=>session}
  const reader=createNormalNodeFormsReader({auth,read:{listWorkOrders:vi.fn(),isWorkOrderListedForCurrentSession:()=>true,getDynamicCodeOptions:vi.fn()},tenantId:'tenant',env,origin,transport:{execute}})
  const provider=createNormalRepeatActionProvider({auth,reader,env,origin})
  return {reader,provider,fields,record,calls,fault:(value?:string)=>{fault=value}}
}
describe('Survey regions Select and IS Radio normal read',()=>{
  it('binds each real Code request to current tenant and raw field provider; displays root and EXTS labels',async()=>{
    const h=harness(),s=await h.reader.load('work','node')
    expect(h.calls.filter(r=>r.path==='i/code/selectCode.do').map(r=>r.body)).toEqual([
      {jsonPara:'[{"codeId":"regions","eleid":"regions"}]',tenantId:'tenant'},
      {jsonPara:'[{"codeId":"IS","eleid":"IS"}]',tenantId:'tenant'},
    ])
    expect(s.definition.fields!.map(f=>[f.valueKey,f.type,f.valueOption,f.preset])).toEqual([['province','select','regions',true],['isMoldRemoved','radio','IS',false]])
    expect(projectR1RecordReadFields(s.definition,s.records[0]!).map(f=>f.text)).toEqual(['合成省一','合成已处理'])
    expect(h.provider.forSnapshot(s)).toBeNull()
    expect(h.calls.some(r=>/upsert|process|upload|selectMultistage/.test(r.path))).toBe(false)
  })
  it('preserves captured mobile exclusion rather than enabling either original field',async()=>{
    const h=harness(true),s=await h.reader.load('work','node')
    expect(h.calls.some(r=>r.path==='i/code/selectCode.do')).toBe(false)
    expect(projectR1RecordReadFields(s.definition,s.records[0]!)).toEqual([])
    expect(h.provider.forSnapshot(s)).toBeNull()
  })
  it.each(['wrong-provider','wrong-eleid','foreign-tenant','invalid-label'])('rejects %s response and revokes the previous read',async fault=>{
    const h=harness(),old=await h.reader.load('work','node');h.fault(fault)
    await expect(h.reader.load('work','node')).rejects.toThrow()
    expect(h.reader.isCurrent(old)).toBe(false)
    expect(h.calls.some(r=>/upsert|process|upload/.test(r.path))).toBe(false)
    h.fault();expect(h.reader.isCurrent(await h.reader.load('work','node'))).toBe(true)
  })
  it.each(['province','isMoldRemoved'])('marks unknown %s value as unverified, never as a known option label',async key=>{
    const h=harness();if(key==='province')h.record.province='UNKNOWN';else h.record.exts.isMoldRemoved='UNKNOWN'
    const s=await h.reader.load('work','node'),field=projectR1RecordReadFields(s.definition,s.records[0]!).find(f=>f.valueKey===key)!
    expect(field.text).toBe('UNKNOWN（选项未核实）');expect(h.provider.forSnapshot(s)).toBeNull()
  })
  it.each([{},['1',{}],[null]])('rejects unrepresentable effective IS EXTS %#',value=>{
    const h=harness();h.record.exts.isMoldRemoved=value
    return expect(h.reader.load('work','node')).rejects.toThrow()
  })
  it('keeps an explicit empty extension instead of falling back to an old root',async()=>{
    const h=harness();h.record.isMoldRemoved='1';h.record.exts.isMoldRemoved=''
    const s=await h.reader.load('work','node')
    expect(projectR1RecordReadFields(s.definition,s.records[0]!).find(f=>f.valueKey==='isMoldRemoved')?.text).toBe('空值')
  })
})


describe('single-choice read shape, preserving scalar and true multi-choice contracts',()=>{
  const options=[{value:'1',label:'合成已处理'},{value:'0',label:'合成未处理'},{value:'false',label:'合成布尔代码'},{value:'true',label:'合成布尔真代码'}]
  const text=(type:string,multiple:boolean,value:unknown)=>projectR1RecordReadFields({id:definitionId,purpose:'survey',fields:[{fieldId:'shape',valueKey:'shape',label:'合成选项',type,multiple,required:false,readOnly:true,options}]} as any,{id:'saved',definitionId,values:{shape:value}} as any)[0]!.text
  it.each(['radio','select'])('marks all array shapes unverified for scalar %s',type=>{
    for(const value of [[],['1'],['1','0'],[1],[false],[{}],[null]])expect(text(type,false,value)).toContain('选项未核实')
    expect(text(type,false,['1','0'])).toBe('1 / 0（选项未核实）')
    expect(text(type,false,[])).not.toBe('未保存');expect(text(type,false,[])).not.toBe('空值')
  })
  it.each(['radio','select'])('preserves %s string/number/bool scalar normalization and distinct empty/unsaved',type=>{
    for(const [value,label] of [['1','合成已处理'],[1,'合成已处理'],[0,'合成未处理'],[false,'合成布尔代码'],[true,'合成布尔真代码'],['','空值'],[null,'空值'],[undefined,'未保存']] as const)expect(text(type,false,value)).toBe(label)
  })
  it.each(['select','checkbox'])('does not change explicit multi-choice %s',type=>{
    expect(text(type,true,['1','0'])).toBe('合成已处理 / 合成未处理')
    expect(text(type,true,['1'])).toBe('合成已处理');expect(text(type,true,[])).toBe('空值')
  })
  it('does not turn Radio into multi-choice even when multiple metadata is true',()=>{
    for(const value of [[],['1'],['1','0'],[false],[1]])expect(text('radio',true,value)).toContain('选项未核实')
    expect(text('radio',true,'1')).toBe('合成已处理')
  })
  it('does not change checkbox with default multiple metadata or ordinary scalar zero/false',()=>{
    expect(text('checkbox',false,['1','0'])).toBe('合成已处理 / 合成未处理')
    expect(text('text',false,0)).toBe('0');expect(text('text',false,false)).toBe('false')
  })
})
