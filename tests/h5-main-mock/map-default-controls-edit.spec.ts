import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
test.beforeEach(({},info)=>test.skip(info.config.metadata.mapChoiceDatetimeEdit!==true,'Dedicated intercepted Map editing'))
for(const mode of ['save-cancel','rate-clear','readonly','drift','required'] as const)test(`normal Map default controls ${mode}`,async({page,baseURL},info)=>{
 const def='configured-form',calls:any[]=[],writes:any[]=[],errors:string[]=[],unexpected:string[]=[]
 const fields:Record<string,any>[]=[{_id:'choice-field',name:'safetyGate',nameDisp:'是否具备施工条件',type:'switch',required:'1'},
  {_id:'time-field',name:'serviceScore',nameDisp:'现场评分',type:'rate',required:mode==='required'?'1':'0'},
  {_id:'note-field',name:'visitMemo',nameDisp:'现场备注',type:'textarea',required:'0'}]
  .map(f=>({...f,tenantId:'t',extId:def,colName:'configuredNotes',state:1,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',preset:0,multiple:false}))
 const extra=mode==='readonly'?[{...fields[0],_id:'kept-switch',name:'keptToggle',readOnly:1},{...fields[1],_id:'kept-rate',name:'keptScore',readOnly:1}]:[]
 fields.push(...extra)
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
  nodeDef:{nodeType:'repeat',name:'现场检查',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:['choice-field','time-field','note-field'],formFieldIdsReadOnly:extra.map(f=>f._id)}}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成服务',orderNum:'DEFAULT-CONTROLS',exts:{sourceType:''}}
 const values={safetyGate:'1',serviceScore:mode==='required'?'':3,visitMemo:'未修改',...(mode==='readonly'?{keptToggle:'0',keptScore:2}:{})}
 let a:any={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,...values,
  exts:{...values,opaque:{keep:[1,2]}},createTime:'2026-11-07 13:04:09',updateTime:'2026-11-07 13:04:09'}
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
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-default-session',user:{_id:'u'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20})
  if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'0',colName:'configuredNotes'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50})
  if(path==='biz/extForm/query/'+def){const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']);return ok({data,total:data.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);a=JSON.parse(body.dataStr);expect(a._id).toBe('saved-a');expect(a.exts.opaque).toEqual(original.exts.opaque);writes.push(structuredClone(a));return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const field=(name:string)=>page.getByTestId('r1-normal-input-'+name)
 try{
  await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read();await page.getByTestId('r1-normal-edit-saved-a').click()
  if(mode==='required')await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true')
  if(mode==='readonly'){
   await expect(field('keptToggle').locator('input,button,.app-choice')).toHaveCount(0);await expect(field('keptScore').locator('.app-rating-field__star')).toHaveCount(0)
  }else{
   await field('safetyGate').locator('.app-choice').filter({hasText:'否'}).click()
   if(mode==='rate-clear'){
    await field('serviceScore').locator('.app-button').filter({hasText:'清空'}).click()
    await expect(field('serviceScore').locator('.app-rating-field__star[aria-pressed="true"]')).toHaveCount(0)
   }else{
    await field('serviceScore').locator('.app-rating-field__star').nth(4).click()
    await expect(field('serviceScore').locator('.app-rating-field__star').nth(4)).toHaveAttribute('aria-pressed','true')
    await expect(field('serviceScore').locator('.app-rating-field__star--active')).toHaveCount(5)
   }
  }
  if(mode==='save-cancel'){
   await page.getByTestId('r1-normal-edit-cancel').click();expect(writes).toHaveLength(0);await page.getByTestId('r1-normal-edit-saved-a').click()
   await expect(field('safetyGate').locator('.app-choice').filter({hasText:'是'})).toHaveAttribute('aria-pressed','true')
   await expect(field('serviceScore').locator('.app-rating-field__star').nth(2)).toHaveAttribute('aria-pressed','true')
   await field('safetyGate').locator('.app-choice').filter({hasText:'否'}).click();await field('serviceScore').locator('.app-rating-field__star').nth(4).click()
  }
  await field('visitMemo').locator('textarea').fill('检查完成后的现场记录')
  await field('safetyGate').scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('default-controls-editor.png')})
  if(mode==='drift')fields[0]!.frontEndConfig=JSON.stringify({activeValue:'yes'})
  await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false');await page.getByTestId('r1-normal-save').dblclick()
  if(mode==='drift'){await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实');expect(writes).toHaveLength(0)}
  else{
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(writes).toHaveLength(1)
   expect(a.safetyGate).toBe(mode==='readonly'?'1':'0');expect(a.serviceScore).toBe(mode==='rate-clear'?'':mode==='readonly'?3:5)
   expect(a.exts.safetyGate).toBe(a.safetyGate);expect(a.exts.serviceScore).toBe(a.serviceScore)
   if(mode==='readonly'){expect(a.keptToggle).toBe('0');expect(a.exts.keptToggle).toBe('0');expect(a.keptScore).toBe(2);expect(a.exts.keptScore).toBe(2)}
   await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
   await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('本次编辑已保存并核实')
  }
  expect(b).toEqual(oldB);expect(errors).toEqual([]);expect(unexpected).toEqual([]);expect(calls.filter(c=>/process|updateExts|upload|upToken|delete|remove/i.test(c.path))).toEqual([])
  await page.screenshot({path:info.outputPath('default-controls-after.png')})
 }finally{await info.attach('default-controls-ledger',{body:JSON.stringify({mode,calls,writes,a,b,errors,unexpected,realBackend:'NOT_RUN'}),contentType:'application/json'})}
})
