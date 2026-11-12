import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_FORMS_MIXED_CREATE!=='true','Opt-in synthetic ordinary per-field state and Code-array create; synthetic only')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[['independentFlag','switch',false,1,true],['evidenceScore','rate',false,0,true],['reviewedItems','checkbox',false,1,true],['selectedServices','select',true,0,true],['note','text',false,0,false],['zeroMeasure','number',false,1,false],['spareChoices','select',true,0,false],['spareScore','rate',false,0,false],['spareFlag','switch',false,1,false]].map(([name,type,multiple,preset,required],i)=>({_id:'field-'+i,name,nameDisp:name,type,multiple,preset,tenantId:'t',extId:'e',colName:'syntheticMixedRecord',state:1,required:required?'1':'0',readOnly:0,operationType:'1',showList:['4'],frontEndConfig:'{}',customizeFlag:1,showType:'1',...(['select','checkbox'].includes(String(type))?{valueOption:'SYN_CODES'}:{})}))
 const codes={a:'合成甲',b:'合成乙',c:'合成丙'}
 if(mode==='renamed')for(const f of fields)f.name=f.nameDisp='other_'+f.name
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通开关评分',orderNum:'SYNTHETIC-ORDINARY-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成配置新建',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 page.on('pageerror',()=>state.errors.push('pageerror'))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{state.unexpected.push('external-websocket');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==baseURL){state.unexpected.push('external');return route.abort()}
  if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push('unexpected local');return route.abort()}
  const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json});state.calls.push(path)
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-mixed-session',user:{_id:'u',tenantId:'t'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticMixedRecord'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:codes}])
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved));if(mode==='wrong-switch-ack')state.saved.independentFlag=false;if(mode==='wrong-rate-ack')state.saved.evidenceScore=state.saved.exts.evidenceScore='4';if(mode==='wrong-array-ack')state.saved.exts.selectedServices=['c']
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields,codes}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}


for(const mode of ['save-double','renamed','optional-clear','wrong-switch-ack','wrong-rate-ack','wrong-array-ack','option-drift','permission-drift'])test(`ordinary per-field mixed create ${mode}`,async({page,baseURL},info)=>{
 const {state,fields,codes}=await fixture(page,baseURL!,mode),prefix=mode==='renamed'?'other_':''
 const field=(key:string)=>page.getByTestId('r1-normal-input-'+prefix+key)
 try{
  await open(page)
  await expect(field('evidenceScore')).toContainText('未评分')
  if(mode==='save-double'){
   await field('independentFlag').locator('.app-choice').filter({hasText:'是'}).click();await field('evidenceScore').locator('[aria-label="2 星"]').click()
   await field('reviewedItems').locator('.app-choice--multi').filter({hasText:'合成甲'}).click()
   await page.locator('.uni-page-head-btn').first().click();await expect(page.locator('.work-order-card')).toBeVisible();await page.locator('.work-order-card').click()
   await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
   await expect(field('evidenceScore')).toContainText('未评分');await expect(field('reviewedItems').locator('[aria-pressed="true"]')).toHaveCount(0);expect(state.writes).toEqual([])
  }
  await field('note').getByRole('textbox').fill(' mixed preserved ');await field('zeroMeasure').getByRole('textbox').fill('0')
  await field('independentFlag').locator('.app-choice').filter({hasText:'否'}).click()
  await field('reviewedItems').locator('.app-choice--multi').filter({hasText:'合成乙'}).click();await field('reviewedItems').locator('.app-choice--multi').filter({hasText:'合成甲'}).click()
  await field('selectedServices').locator('.app-choice--multi').filter({hasText:'合成丙'}).click();await field('selectedServices').locator('.app-choice--multi').filter({hasText:'合成甲'}).click()
  await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true');await page.getByTestId('r1-normal-save').click({force:true});expect(state.writes).toEqual([])
  await field('evidenceScore').locator('[aria-label="4 星"]').click();await field('evidenceScore').locator('[aria-label="4 星"]').click();await expect(field('evidenceScore')).toContainText('4 / 5')
  if(mode==='optional-clear'){
   const choice=field('spareChoices').locator('.app-choice--multi').filter({hasText:'合成乙'});await choice.click();await choice.click();await expect(choice).toHaveAttribute('aria-pressed','false')
   await field('spareScore').locator('[aria-label="2 星"]').click();await field('spareScore').locator('.app-button').filter({hasText:'清空'}).click();await expect(field('spareScore')).toContainText('未评分')
  }
  if(mode==='option-drift')codes.a='changed Code label'
  if(mode==='permission-drift')fields[0].readOnly=1
  if(mode==='save-double')await page.getByTestId('r1-normal-save').dblclick();else await page.getByTestId('r1-normal-save').click()
  if(mode.startsWith('wrong-')||mode.endsWith('-drift')){
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成')
   expect(state.writes).toEqual(mode.startsWith('wrong-')?['biz/extForm/upsert/e']:[])
  }else{
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
   expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
   expect(state.saved[prefix+'independentFlag']).toBe('0');expect(state.saved[prefix+'evidenceScore']).toBe(4)
   expect(state.saved[prefix+'reviewedItems']).toEqual(['a','b']);expect(state.saved[prefix+'selectedServices']).toEqual(['a','c'])
   for(const key of ['evidenceScore','selectedServices','note'])expect(state.saved.exts[prefix+key]).toEqual(state.saved[prefix+key])
   for(const key of ['independentFlag','reviewedItems','zeroMeasure'])expect(state.saved.exts).not.toHaveProperty(prefix+key)
   expect(state.saved[prefix+'zeroMeasure']).toBe(0);expect(state.saved[prefix+'note']).toBe('mixed preserved')
   for(const key of ['spareChoices','spareScore','spareFlag']){expect(state.saved).not.toHaveProperty(prefix+key);expect(state.saved.exts).not.toHaveProperty(prefix+key)}
   await expect(page.getByTestId('r1-normal-value-'+prefix+'reviewedItems')).toHaveText('合成甲 / 合成乙')
   await expect(page.getByTestId('r1-normal-append')).toHaveCount(0);await expect(page.getByTestId('r1-normal-edit-saved')).toHaveCount(0)
  }
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);expect(state.calls.some(p=>/process|upload|upToken|delete/i.test(p))).toBe(false)
 }finally{await info.attach('synthetic-mixed-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,payloads:state.payloads,unexpected:state.unexpected,errors:state.errors}),contentType:'application/json'})}
})
