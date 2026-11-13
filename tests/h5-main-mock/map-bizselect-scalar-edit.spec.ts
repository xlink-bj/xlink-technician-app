import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
// Synthetic, no calculation rules. This does not establish the live three
// business configurations, their provider response, permissions or pricing.
for(const mode of ['save','cancel','provider-change','reselect-original','hidden-to-visible'] as const)test(`normal type0 scalar business selector ${mode}`,async({page,baseURL},info)=>{
 const calls:any[]=[],writes:any[]=[],errors:string[]=[],consoleErrors:string[]=[],unexpected:string[]=[],def='configured-form'
 const fields=[{_id:'measurement',name:'quantity',type:'digit',preset:1,required:'1',frontEndConfig:'{}'},
  {_id:'description',name:'renamedBusinessOption',type:'bizSelect',preset:1,required:'0',valueOption:'projPackage',multiple:true,
   frontEndConfig:JSON.stringify({url:'biz/projPackage/query.do',params:{_all:1},label:'name',value:'_id'})}]
  .map(f=>({...f,nameDisp:f.name,tenantId:'t',extId:def,colName:'configuredNotes',state:1,operationType:'1',showList:['4'],showType:'1'}))
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
  nodeDef:{nodeType:'repeat',name:'已配置业务选择',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:['measurement','description'],formFieldIdsReadOnly:[]}}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成服务',orderNum:'SYNTHETIC-BUSINESS',exts:{sourceType:''}}
 const options:any[]=[{_id:'old-package',name:'Old synthetic package',tenantId:'t',state:1},{_id:'new-package',name:'New synthetic package',tenantId:'t',state:1}]
 let a:any={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,quantity:12.5,renamedBusinessOption:'old-package',renamedBusinessOptionLabel:'Historical old package',
  exts:{opaque:{keep:[0,'original']}},createTime:'2026-11-07 13:04:09',updateTime:'2026-11-07 13:04:09'}
 if(mode==='hidden-to-visible'){fields[0].type='text';Object.assign(fields[1],{showType:'3',showField:'quantity',showValue:'show',showFieldPreset:1});a.quantity='hidden'}
 const b={...structuredClone(a),_id:'saved-b'},before=structuredClone(a),other=structuredClone(b)
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())})
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['fetch','xhr'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort('blockedbyclient')}
  const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''));calls.push({path,body})
  if(req.method()!=='POST'){unexpected.push(req.method());return route.abort('blockedbyclient')}
  const ok=(json:unknown)=>route.fulfill({json})
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-business-session',user:{_id:'u'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20})
  if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'0',colName:'configuredNotes'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50})
  if(path==='biz/projPackage/query.do'){expect(body).toEqual({_all:'1',tenantId:'t','is:state|integer#and':'1'});return ok({data:options,total:options.length,page:1})}
  if(path==='biz/extForm/query/'+def){const rows=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']);return ok({data:rows,total:rows.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);const value=JSON.parse(body.dataStr);expect(value._id).toBe('saved-a');writes.push(value);a=value;return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=async()=>{await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('已从后台读取 2 条记录');await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(2)}
 const field=page.getByTestId('r1-normal-input-renamedBusinessOption'),save=page.getByTestId('r1-normal-save')
 const reenter=async()=>{await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()}
 try{
  await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
  await page.getByTestId('r1-normal-edit-saved-a').click();if(mode==='hidden-to-visible'){await expect(field).toHaveCount(0);await page.getByTestId('r1-normal-input-quantity').locator('input').fill('show')}await expect(field.locator('.app-choice')).toHaveCount(2)
  await expect(field.locator('.app-choice').filter({hasText:'Old synthetic package'})).toHaveAttribute('aria-pressed','true')
  await field.locator('.app-choice').filter({hasText:'New synthetic package'}).click();await expect(field.locator('.app-choice').filter({hasText:'New synthetic package'})).toHaveAttribute('aria-pressed','true')
  if((mode==='reselect-original'||mode==='hidden-to-visible')){await field.locator('.app-choice').filter({hasText:'Old synthetic package'}).click();await expect(field.locator('.app-choice').filter({hasText:'Old synthetic package'})).toHaveAttribute('aria-pressed','true')}
  if(mode==='cancel'){
   await page.getByTestId('r1-normal-edit-cancel').click();await reenter();await page.getByTestId('r1-normal-edit-saved-a').click()
   await expect(field.locator('.app-choice').filter({hasText:'Old synthetic package'})).toHaveAttribute('aria-pressed','true');expect(a).toEqual(before);expect(writes).toHaveLength(0)
  }else{
   if(mode==='provider-change')options.pop()
   await expect(save).toHaveAttribute('aria-disabled','false');await save.dblclick()
   if(mode==='provider-change'){await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成');expect(writes).toHaveLength(0);expect(a).toEqual(before)}
   else{
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(writes).toHaveLength(1)
    expect(a.renamedBusinessOption).toBe((mode==='reselect-original'||mode==='hidden-to-visible')?'old-package':'new-package');expect(a.renamedBusinessOptionLabel).toBe((mode==='reselect-original'||mode==='hidden-to-visible')?'Old synthetic package':'New synthetic package');expect(a.exts).toEqual(before.exts)
    await reenter();await expect(page.getByTestId('r1-normal-value-renamedBusinessOption').first()).toContainText((mode==='reselect-original'||mode==='hidden-to-visible')?'Old synthetic package':'New synthetic package');expect(writes).toHaveLength(1)
   }
  }
  expect(b).toEqual(other);expect(consoleErrors).toEqual([]);expect(errors).toEqual([]);expect(unexpected).toEqual([])
  expect(calls.filter(c=>/queryWithRank|process|updateExts|upToken|upload|delete/i.test(c.path))).toEqual([])
 }finally{await info.attach('business-selector-ledger',{body:JSON.stringify({mode,calls:calls.map(c=>c.path==='index/phoneLogin.do'?{path:c.path,body:{redacted:true}}:c),writes,a,b,errors,consoleErrors,unexpected,realBackend:'NOT_RUN',liveConfiguration:'NOT_ESTABLISHED'}),contentType:'application/json'})}
})
