import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
test.beforeEach(({},info)=>test.skip(info.config.metadata.mapChoiceDatetimeEdit!==true,'Dedicated intercepted Map editing'))
for(const mode of ['identity-save','identity-provider','identity-lost','temporal-save','temporal-clear','select-cancel'] as const)test(`normal Map remaining scalars ${mode}`,async({page,baseURL},info)=>{
 const temporal=mode.startsWith('temporal'),clear=mode==='temporal-clear',calls:any[]=[],writes:any[]=[],errors:string[]=[],unexpected:string[]=[]
 const def='configured-form',provider='configured-selections'
 let options={a:'选项甲',b:'选项乙'}
 const fields=[{_id:'choice-field',name:temporal?'serviceDate':'contactPhone',nameDisp:temporal?'服务日期':'联系手机',type:temporal?'date':'phone',required:temporal?'0':'1'},
  {_id:'time-field',name:temporal?'serviceTime':'identityCode',nameDisp:temporal?'服务时间':'身份编号',type:temporal?'time':'IDNumber',required:'0'},
  {_id:'note-field',name:'serviceOption',nameDisp:'服务选项',type:'select',required:'1',valueOption:provider}]
  .map(f=>({...f,tenantId:'t',extId:def,colName:'configuredNotes',state:1,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',preset:0,multiple:false}))
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
  nodeDef:{nodeType:'repeat',name:'现场资料',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成服务',orderNum:'MAP-PRIMITIVES',exts:{sourceType:''}}
 const values=temporal?{serviceDate:clear?'2028-02-29':'',serviceTime:clear?'23:59':''}:{contactPhone:'13800138000',identityCode:'000100200300400500'}
 let a:any={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,...values,serviceOption:'a',
  exts:{...values,serviceOption:'a',opaque:{keep:[1,2]}},createTime:'2026-11-07 13:04:09',updateTime:'2026-11-07 13:04:09'}
 const original=structuredClone(a),b={...structuredClone(a),_id:'saved-b'},oldB=structuredClone(b)
 page.on('pageerror',e=>errors.push(e.message))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
 await page.route('**/*',async route=>{
    if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ status: 503, json: { success: false, message: 'Synthetic information configuration unavailable' } })
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['fetch','xhr'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort('blockedbyclient')}
  const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''));calls.push({path,body})
  if(req.method()!=='POST'){unexpected.push(req.method());return route.abort('blockedbyclient')}
  const ok=(json:unknown)=>route.fulfill({json})
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-scalar-session',user:{_id:'u'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20})
  if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'0',colName:'configuredNotes'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50})
  if(path==='i/code/selectCode.do'){expect(body).toEqual({tenantId:'t',jsonPara:JSON.stringify([{codeId:provider,eleid:provider}])});return ok(JSON.stringify([{codeId:provider,eleid:provider,options}]))}
  if(path==='biz/extForm/query/'+def){const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']);return ok({data,total:data.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);a=JSON.parse(body.dataStr);expect(a._id).toBe('saved-a');expect(a.exts.opaque).toEqual(original.exts.opaque);writes.push(structuredClone(a));if(mode==='identity-lost')return route.abort('failed');return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const field=(name:string)=>page.getByTestId('r1-normal-input-'+name)
 const enter=async()=>{await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()}
 const pick=async(name:string)=>{await field(name).locator('.app-date-time-field').click();const done=page.getByText('Done',{exact:true}).filter({visible:true}).last();await expect(done).toBeVisible();await done.click();await expect(done).toBeHidden()}
 try{
  await enter();await page.getByTestId('r1-normal-edit-saved-a').click()
  if(temporal){
   if(clear){await field('serviceDate').locator('.app-button').filter({hasText:'清空'}).click();await field('serviceTime').locator('.app-button').filter({hasText:'清空'}).click()}
   else{await pick('serviceDate');await pick('serviceTime')}
  }else{
   await field('contactPhone').locator('input').fill('10000000000');await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true');expect(writes).toHaveLength(0)
   await field('contactPhone').locator('input').fill('13900139000');await field('identityCode').locator('input').fill('00010020030040050X')
  }
  await field('serviceOption').locator('.app-choice').filter({hasText:'选项乙'}).click()
  await field(fields[0]!.name).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('scalar-editor.png')})
  if(mode==='select-cancel'){
   await page.getByTestId('r1-normal-edit-cancel').click();await page.getByTestId('r1-normal-edit-saved-a').click();expect(writes).toHaveLength(0)
   await expect(field('contactPhone').locator('input')).toHaveValue('13800138000');await expect(field('serviceOption').locator('.app-choice').filter({hasText:'选项甲'})).toHaveAttribute('aria-pressed','true')
  }else{
   if(mode==='identity-provider')options={a:'选项甲',b:'新的选项乙'}
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false');await page.getByTestId('r1-normal-save').dblclick()
   if(mode==='identity-provider'||mode==='identity-lost'){
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实');expect(writes).toHaveLength(mode==='identity-provider'?0:1)
    if(mode==='identity-lost'){await page.reload();await enter();await expect(page.getByTestId('r1-normal-edit-saved-a')).toHaveCount(0);await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('上次保存结果尚未核实');expect(writes).toHaveLength(1)}
   }else{
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(writes).toHaveLength(1);expect(a.serviceOption).toBe('b')
    if(temporal){if(clear){expect(a.serviceDate).toBe('');expect(a.serviceTime).toBe('')}else{expect(a.serviceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(a.serviceTime).toMatch(/^\d{2}:\d{2}$/)}}
    else{expect(a.contactPhone).toBe('13900139000');expect(a.identityCode).toBe('00010020030040050X')}
    for(const f of fields)expect(a.exts[f.name]).toBe(a[f.name])
    await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
    await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('本次编辑已保存并核实')
   }
  }
  expect(b).toEqual(oldB);expect(errors).toEqual([]);expect(unexpected).toEqual([]);expect(calls.filter(c=>/process|updateExts|upload|upToken|delete|remove/i.test(c.path))).toEqual([])
  await page.screenshot({path:info.outputPath('scalar-after.png')})
 }finally{await info.attach('scalar-editor-ledger',{body:JSON.stringify({mode,calls,writes,a,b,errors,unexpected,realBackend:'NOT_RUN'}),contentType:'application/json'})}
})
