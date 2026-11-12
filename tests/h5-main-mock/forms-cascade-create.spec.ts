import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_FORMS_CASCADE_CREATE!=='true','Opt-in synthetic ordinary Map single-path Cascade first-create')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[{_id:'checks',name:'pathNorth',type:'cascade',multiple:false,preset:1},{_id:'multi',name:'regionPath',type:'cascade',multiple:false,preset:0},{_id:'memo',name:'memo',type:'text',multiple:false,preset:0}].map(f=>({...f,tenantId:'t',extId:'e',colName:'syntheticCascadeRecord',nameDisp:f.name,state:1,required:f._id==='checks'?'1':'0',readOnly:0,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',customizeFlag:1,...(f.type==='text'?{}:{valueOption:'SYN_TREE'})}))
 if(mode==='renamed-zero'){fields[0].name=fields[0].nameDisp='siteRoute';fields[1].name=fields[1].nameDisp='evidenceRoute';fields[2].type='number'}
 const group:any={_id:'G',type:'SYN_TREE',tenantId:'t',children:[{_id:'N',value:'north',name:'合成北',parentId:'G',type:'SYN_TREE',children:[{_id:'B',value:'branch',name:'合成分支',parentId:'N',type:'SYN_TREE',children:mode==='prefix'?[]:[{_id:'L',value:'leaf',name:'合成叶',parentId:'B',type:'SYN_TREE',children:[]}]}]},{_id:'R',value:'root-leaf',name:'合成根叶',parentId:'G',type:'SYN_TREE',children:[]}]}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通多选',orderNum:'SYNTHETIC-CHOICE-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成配置多选',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 page.on('pageerror',()=>state.errors.push('pageerror'))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{state.unexpected.push('external-websocket');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==baseURL){state.unexpected.push('external');return route.abort()}
  if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push('unexpected local');return route.abort()}
  const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json});state.calls.push(path)
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-choice-session',user:{_id:'u',tenantId:'t'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticCascadeRecord'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectMultistageCode.do'){expect(body).toEqual({types:'SYN_TREE',tenantId:'t'});return ok([group])}
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved))
   if(mode==='wrong-ack')state.saved.exts.regionPath=['INVALID']
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields,group}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}
for(const mode of ['save','renamed-zero','optional','prefix','tree-drift','permission-drift','wrong-ack'])test(`ordinary complete path create ${mode}`,async({page,baseURL},info)=>{
 const {state,fields,group}=await fixture(page,baseURL!,mode)
 try{
  await open(page)
  const key1=fields[0].name,key2=fields[1].name
  await page.getByTestId('r1-normal-input-memo').getByRole('textbox').fill(mode==='renamed-zero'?'0':' synthetic memo ')
  if(mode==='prefix'){
   const parent=page.getByTestId('r1-normal-input-'+key1).locator('.app-cascade-selector__parent').filter({hasText:'合成北'})
   await parent.click();await expect(parent).toHaveAttribute('aria-pressed','false')
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true')
   await page.getByTestId('r1-normal-save').click({force:true});expect(state.writes).toEqual([])
  }else{
   await page.getByTestId('r1-normal-input-'+key1).locator('.app-choice--multi').filter({hasText:'合成北 / 合成分支 / 合成叶'}).click()
   if(mode!=='optional')await page.getByTestId('r1-normal-input-'+key2).locator('.app-choice--multi').filter({hasText:'合成根叶'}).click()
   if(mode==='tree-drift')group.children[0].name='changed tree label'
   if(mode==='permission-drift')fields[0].readOnly=1
   await page.getByTestId('r1-normal-save').click()
   if(['tree-drift','permission-drift','wrong-ack'].includes(mode)){
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成')
    expect(state.writes).toEqual(mode==='wrong-ack'?['biz/extForm/upsert/e']:[])
   }else{
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
    expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
    expect(state.saved[key1]).toEqual(['north','branch','leaf']);expect(state.saved.exts).not.toHaveProperty(key1)
    expect(state.saved.memo).toBe(mode==='renamed-zero'?0:'synthetic memo')
    if(mode==='optional'){expect(state.saved).not.toHaveProperty(key2);expect(state.saved.exts).not.toHaveProperty(key2)}
    else{expect(state.saved[key2]).toEqual(['root-leaf']);expect(state.saved.exts[key2]).toEqual(['root-leaf'])}
    await expect(page.getByTestId('r1-normal-value-'+key1)).toHaveText('合成北 / 合成分支 / 合成叶')
    await expect(page.getByTestId('r1-normal-edit-saved')).toHaveCount(0);await expect(page.getByTestId('r1-normal-append')).toHaveCount(0)
   }
  }
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);expect(state.calls.some(p=>/process|upload|upToken|delete/i.test(p))).toBe(false)
 }finally{await info.attach('synthetic-cascade-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,payloads:state.payloads,unexpected:state.unexpected,errors:state.errors}),contentType:'application/json'})}
})
