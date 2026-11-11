import { expect,test } from '@playwright/test'
test.skip(process.env.XLINK_H5_SURVEY_REGIONS_IS_READ!=='true','Opt-in synthetic regions/IS normal-App read contract')
const def='synthetic-regions-is-survey'
for(const mode of ['labels','excluded','wrong-provider','foreign-tenant','unknown','wrong-shape'] as const){
 test(`regions/IS normal read ${mode}`,async({page,baseURL},info)=>{
  const calls:string[]=[],commands:string[]=[],unexpected:string[]=[],errors:string[]=[]
  let fault=mode==='wrong-provider'||mode==='foreign-tenant'
  const fields=[
   {_id:'province-field',name:'province',nameDisp:'合成省份',type:'select',valueOption:'regions',preset:1,showList:mode==='excluded'?['5']:['4']},
   {_id:'mold-field',name:'isMoldRemoved',nameDisp:'合成处理情况',type:'radio',valueOption:'IS',preset:0,showList:mode==='excluded'?[]:['4']},
  ].map(f=>({...f,tenantId:'t',extId:def,colName:'survey',state:1,required:'0',multiple:false,readOnly:0,showType:'1',frontEndConfig:'{}'}))
  const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成字典读取',orderNum:'CODE-READ',exts:{sourceType:''}}
  const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],nodeDef:{nodeType:'repeat',formDefId:def,name:'省份与处理情况',formFieldIdsFill:[],formFieldIdsReadOnly:fields.map(f=>f._id)}}
  const records=[{_id:'saved',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,province:mode==='unknown'?'UNKNOWN-P':'SYN-P1',exts:{isMoldRemoved:mode==='unknown'?'UNKNOWN-I':mode==='wrong-shape'?['1','0']:'1'}}]
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url())
   if(u.origin!==baseURL){unexpected.push('external');return route.abort()}
   if(!u.pathname.startsWith('/xlink/'))return route.continue()
   const path=u.pathname.slice('/xlink/wm/'.length),b=Object.fromEntries(new URLSearchParams(req.postData()??''));calls.push(path)
   const ok=(json:unknown)=>route.fulfill({json})
   if(/upsert|process|updateExts|upload/.test(path)){commands.push(path);return route.abort()}
   if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-code-read-session',user:{_id:'u',tenantId:'t'},currentRole:{_id:'r'},capabilityNames:[]}})
   if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
   if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
   if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
   if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
   if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'1',colName:'survey'})
   if(path==='biz/extField/query')return ok({data:fields,total:2,page:1,size:Number(b.rows)})
   if(path==='i/code/selectCode.do'){
    const q=JSON.parse(b.jsonPara!);expect(b.tenantId).toBe('t');expect(q).toHaveLength(1);const id=q[0].codeId
    expect(q).toEqual([{codeId:id,eleid:id}]);expect(['regions','IS']).toContain(id)
    const group:any={...q[0],options:id==='regions'?{'SYN-P1':'合成省一','SYN-P2':'合成省二'}:{'0':'合成未处理','1':'合成已处理'}}
    if(fault&&mode==='wrong-provider')group.codeId='other'
    if(fault&&mode==='foreign-tenant')group.tenantId='other'
    return ok(JSON.stringify([group]))
   }
   if(path==='biz/extForm/query/'+def)return ok({data:records,total:1,page:1,size:Number(b.rows),dataCount:1})
   unexpected.push(path);return route.abort()
  })
  page.on('pageerror',()=>errors.push('pageerror'))
  try{
   await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click()
   const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
   await read()
   if(fault){await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('暂时无法完整核实');await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0);fault=false;await read()}
   await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
   if(mode==='excluded'){
    await expect(page.getByTestId('r1-normal-value-province')).toHaveCount(0);await expect(page.getByTestId('r1-normal-value-isMoldRemoved')).toHaveCount(0)
    expect(calls.filter(p=>p==='i/code/selectCode.do')).toHaveLength(0)
   }else{
    await expect(page.getByTestId('r1-normal-value-province')).toHaveText(mode==='unknown'?'UNKNOWN-P（选项未核实）':'合成省一')
    await expect(page.getByTestId('r1-normal-value-isMoldRemoved')).toHaveText(mode==='unknown'?'UNKNOWN-I（选项未核实）':mode==='wrong-shape'?'1 / 0（选项未核实）':'合成已处理')
    expect(calls.filter(p=>p==='i/code/selectCode.do').length).toBeGreaterThanOrEqual(2)
   }
   await expect(page.locator('[data-testid^="r1-normal-edit-"],[data-testid^="r1-normal-complete-"],[data-testid="r1-normal-create"],[data-testid="r1-normal-append"]')).toHaveCount(0)
   expect(commands).toEqual([]);expect(unexpected).toEqual([]);expect(errors).toEqual([]);expect(calls.some(p=>p.includes('selectMultistage'))).toBe(false)
   await page.screenshot({path:info.outputPath('regions-is-'+mode+'.png'),fullPage:true})
  }finally{await info.attach('code-read-contract-ledger',{body:JSON.stringify({mode,calls,commands,unexpected,errors}),contentType:'application/json'})}
 })
}
