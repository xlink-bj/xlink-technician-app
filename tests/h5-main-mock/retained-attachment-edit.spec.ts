import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
for(const mode of ['cancel','remove','clear','readonly','required','config'] as const)test(`normal retained attachment references ${mode}`,async({page,baseURL},info)=>{
 const imageRequests:string[]=[],calls:any[]=[],writes:any[]=[],errors:string[]=[],unexpected:string[]=[],def='configured-form'
 const ref=(id:string)=>({url:`https://files.example.invalid/${id}.jpg`,name:`private-${id}`,extname:'jpg'})
 const fields=[{_id:'choice-field',name:'inspectionNote',type:'text',required:'1',preset:1},
  {_id:'time-field',name:'attachments',type:'file',required:mode==='required'?'1':'0',preset:0},
  {_id:'note-field',name:'keptAttachments',type:'file',required:'0',preset:0}]
  .map(f=>({...f,nameDisp:f.name,tenantId:'t',extId:def,colName:'configuredNotes',state:1,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',multiple:false}))
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
  nodeDef:{nodeType:'repeat',name:'现场资料',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:['choice-field','time-field'],formFieldIdsReadOnly:['note-field']}}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成服务',orderNum:'RETAINED-FILES',exts:{sourceType:''}}
 const originalFiles=[ref('a'),{...ref('b'),rotation:0,sourceInfo:{keep:'original'}}],kept=[{...ref('kept'),url:'https://unpreviewable.example.invalid/kept.jpg'}]
 let a:any={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,inspectionNote:'记录A',attachments:structuredClone(originalFiles),keptAttachments:structuredClone(kept),
  exts:{attachments:structuredClone(originalFiles),keptAttachments:structuredClone(kept),opaque:{keep:[1,2]}},createTime:'2026-11-07 13:04:09',updateTime:'2026-11-07 13:04:09'}
 const b={...structuredClone(a),_id:'saved-b',inspectionNote:'记录B'},oldA=structuredClone(a),oldB=structuredClone(b)
 page.on('pageerror',e=>errors.push(e.message))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
 await page.route('**/*',async route=>{
    if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ status: 503, json: { success: false, message: 'Synthetic information configuration unavailable' } })
  const req=route.request(),url=new URL(req.url())
  if(url.origin==='https://files.example.invalid'&&req.method()==='GET'&&req.resourceType()==='image'&&['/a.jpg','/b.jpg'].includes(url.pathname)){
   imageRequests.push(url.pathname)
   return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'})
  }
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
  if(path==='biz/extForm/query/'+def){const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']);return ok({data,total:data.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);const value=JSON.parse(body.dataStr);expect(value._id).toBe('saved-a');expect(value.exts.opaque).toEqual(oldA.exts.opaque);writes.push(structuredClone(value));a=value;return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const editor=page.getByTestId('r1-normal-input-attachments'),save=page.getByTestId('r1-normal-save')
 const row=()=>page.getByTestId('r1-normal-form-record').filter({has:page.getByTestId('r1-normal-value-inspectionNote').filter({hasText:'记录A'})})
 const remove=async(remaining:number)=>{await page.getByTestId('r1-normal-file-remove-attachments-0').click();await expect(editor.locator('.r1-file-item')).toHaveCount(remaining);if(remaining===1)await expect(editor.locator('.r1-file-preview div').first()).toHaveCSS('background-image',/b\.jpg/)}
 const reenter=async()=>{await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()}
 try{
  await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
  await expect(row().locator('.r1-file-item')).toHaveCount(3)
  await expect(row().locator('.r1-file-preview')).toHaveCount(2)
  await expect(row().locator('.r1-file-name')).toHaveText('private-kept')
  await expect(row().getByTestId('r1-normal-file-remove-attachments-0')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-edit-saved-b')).toHaveCount(0)
  await page.getByTestId('r1-normal-edit-saved-a').click();await expect(editor.locator('.r1-file-item')).toHaveCount(2)
  await expect(page.getByTestId('r1-normal-file-add-attachments')).toBeVisible()
  await expect(page.getByTestId('r1-normal-file-add-attachments')).toHaveAttribute('aria-disabled','false')
  await expect(page.getByTestId('r1-normal-file-add-keptAttachments')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-file-remove-keptAttachments-0')).toHaveCount(0)
  if(mode==='readonly')await page.getByTestId('r1-normal-input-inspectionNote').locator('input').fill('记录A更新')
  else await remove(1)
  if(mode==='cancel'){
   await page.getByTestId('r1-normal-edit-cancel').click();await expect(page.getByTestId('r1-normal-create')).toHaveCount(0)
   await reenter();await page.getByTestId('r1-normal-edit-saved-a').click();await expect(editor.locator('.r1-file-item')).toHaveCount(2)
   await expect(editor.locator('.r1-file-preview').first().locator('div').first()).toHaveCSS('background-image',/a\.jpg/)
   expect(writes).toHaveLength(0);expect(a).toEqual(oldA)
  }else if(mode==='required'){
   await remove(0);await expect(save).toHaveAttribute('aria-disabled','true');expect(writes).toHaveLength(0)
  }else{
   if(mode==='clear')await remove(0)
   if(mode==='config')fields[1].frontEndConfig=JSON.stringify({fileType:'video'})
   await expect(save).toHaveAttribute('aria-disabled','false');await save.dblclick()
   if(mode==='config'){
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成');expect(writes).toHaveLength(0);expect(a).toEqual(oldA)
   }else{
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');await expect(save).toHaveCount(0)
    expect(writes).toHaveLength(1);expect(a._id).toBe('saved-a')
    const expected=mode==='clear'?[]:mode==='readonly'?originalFiles:originalFiles.slice(1)
    expect(a.attachments).toEqual(expected);expect(a.exts.attachments).toEqual(expected)
    expect(Object.hasOwn(a,'attachments')).toBe(true);expect(Object.hasOwn(a.exts,'attachments')).toBe(true)
    expect(a.keptAttachments).toEqual(kept);expect(a.exts.keptAttachments).toEqual(kept);expect(a.exts.opaque).toEqual(oldA.exts.opaque)
    await reenter();await expect(row().locator('.r1-file-item')).toHaveCount(expected.length+1);expect(writes).toHaveLength(1)
   }
  }
  expect(imageRequests.length).toBeGreaterThan(0)
  expect(b).toEqual(oldB);expect(errors).toEqual([]);expect(unexpected).toEqual([])
  expect(calls.filter(c=>/process|updateExts|upload|upToken|delete|remove/i.test(c.path))).toEqual([])
 }finally{await info.attach('retained-file-ledger',{body:JSON.stringify({mode,calls,writes,a,b,errors,unexpected,imageRequests,realBackend:'NOT_RUN'}),contentType:'application/json'})}
})
