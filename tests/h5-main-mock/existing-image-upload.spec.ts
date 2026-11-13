import {test,expect} from '@playwright/test'
import {createHash} from 'node:crypto'
// @ts-ignore Unmodified private loopback harness supplied for this test slice.
import {createLocalImageSink,sinkRequest,IMAGE,IMAGE_SHA256} from '../support/existing-image-loopback-sink.mjs'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
for(const mode of ['success','cancel-before-upload','cancel-after-upload','known-upload-failure','explicit-retry-after-known-rejection','lost-upload-ack','lost-save-ack','actor-change-during-upload'] as const)test(`normal existing image append ${mode}`,async({page,baseURL},info)=>{
 const sink=await createLocalImageSink(),bridge='https://existing-image-bridge.invalid'
 let bridgeAttempts=0
 let held:Promise<void>|undefined,release:(()=>void)|undefined,entered=false,lostSave=false,verifiedSaved=false,readGeneration=0,verifiedColdRead=false,coldLockState:string|null=null
 const readbacks:any[]=[],imageRequests:string[]=[],calls:any[]=[],writes:any[]=[],errors:string[]=[],unexpected:string[]=[],def='configured-form'
 const ref=(id:string)=>({url:`https://files.example.invalid/${id}.jpg`,name:`private-${id}`,extname:'jpg'})
 const fields=[{_id:'choice-field',name:'inspectionNote',type:'text',required:'1',preset:1},
  {_id:'time-field',name:'attachments',type:'file',required:'0',preset:0},
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
  const req=route.request(),url=new URL(req.url())
  if(url.origin===bridge&&url.pathname==='/upload'&&req.method()==='POST'){
   if(++bridgeAttempts>(mode==='explicit-retry-after-known-rejection'?2:1)){unexpected.push('upload budget exceeded');return route.abort('blockedbyclient')}
   expect(req.headers()['x-test-object-key']).toBe(sink.objectKey)
   const bytes=req.postDataBuffer()!;expect(createHash('sha256').update(bytes).digest('hex')).toBe(IMAGE_SHA256)
   try{const ack=await sinkRequest(sink,{bytes});expect(ack.key).toBe(sink.objectKey);expect(sink.storedHash()).toBe(IMAGE_SHA256);entered=true;if(held)await held
    return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{key:sink.objectKey,url:'https://files.example.invalid/objects/'+sink.objectKey,hash:IMAGE_SHA256}})
   }catch{entered=true;const last=sink.snapshot().filter((e:any)=>e.method==='PUT').at(-1)
    if(last?.stored===false)return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*','X-Test-Upload-Outcome':'known-rejected','Access-Control-Expose-Headers':'X-Test-Upload-Outcome'},body:''})
    return route.abort('connectionreset')}
  }
  if(url.origin===bridge&&req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Test-Object-Key','Access-Control-Allow-Methods':'POST'}})
  if(url.origin==='https://files.example.invalid'&&url.pathname==='/objects/'+sink.objectKey&&req.method()==='GET'){const bytes=await sinkRequest(sink,{method:'GET'});expect(createHash('sha256').update(bytes).digest('hex')).toBe(IMAGE_SHA256);return route.fulfill({contentType:'image/png',body:bytes})}
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
  if(path==='back/super/file/upToken.do'){expect(calls.filter(c=>c.path===path).length).toBeLessThanOrEqual(mode==='explicit-retry-after-known-rejection'?2:1);expect(body.fileName).toBe('fixed.png');return ok({token:'synthetic-local-only',key:sink.objectKey})}
  if(path==='index/logout.do'||path==='index/logout')return ok({success:true,status:1})
  if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'0',colName:'configuredNotes'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50})
  if(path==='biz/extForm/query/'+def){const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']);readbacks.push({generation:readGeneration,idFilter:body['is:_id|string#and'],data:structuredClone(data)});return ok({data,total:data.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);const value=JSON.parse(body.dataStr);expect(value._id).toBe('saved-a');expect(value.exts.opaque).toEqual(oldA.exts.opaque);writes.push(structuredClone(value));a=value;if(lostSave)return route.abort('connectionreset');return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const editor=page.getByTestId('r1-normal-input-attachments'),save=page.getByTestId('r1-normal-save')
 const row=()=>page.getByTestId('r1-normal-form-record').filter({has:page.getByTestId('r1-normal-value-inspectionNote').filter({hasText:'记录A'})})
 const stableRead=async()=>{
  const expected=structuredClone(a.attachments)
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('已从后台读取 2 条记录，当前仅查看。')
  await expect(page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})).toHaveAttribute('aria-disabled','false')
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(2)
  await expect(row().locator('.r1-file-item')).toHaveCount(expected.length+1)
  await expect(row().locator('.r1-file-preview')).toHaveCount(expected.length)
  await expect(row().locator('.r1-file-name')).toHaveText('private-kept')
  for(let index=0;index<expected.length;index++){
   const escaped=expected[index].url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
   await expect(row().locator('.r1-file-preview').nth(index).locator('div').first()).toHaveCSS('background-image',new RegExp(escaped))
  }
  const read=readbacks.filter(entry=>entry.generation===readGeneration&&entry.idFilter==='saved-a').at(-1)
  expect(read).toBeDefined();expect(read.data).toHaveLength(1)
  expect(read.data[0]._id).toBe('saved-a');expect(read.data[0].attachments).toEqual(expected)
  expect(read.data[0].exts.attachments).toEqual(expected)
  expect(read.data[0].keptAttachments).toEqual(kept);expect(read.data[0].exts.keptAttachments).toEqual(kept)
  expect(read.data[0].exts.opaque).toEqual(oldA.exts.opaque)
  const sibling=readbacks.filter(entry=>entry.generation===readGeneration&&entry.idFilter==='saved-b').at(-1)
  expect(sibling?.data).toEqual([oldB])
  await expect(page.getByTestId('r1-normal-edit-saved-b')).toHaveCount(0)
 }
 const choose=async(cancel=false)=>{const chooser=page.waitForEvent('filechooser');await page.getByTestId('r1-normal-file-add-attachments').click();const c=await chooser
  if(cancel)await c.element().dispatchEvent('cancel');else await c.setFiles({name:'fixed.png',mimeType:'image/png',buffer:IMAGE})}
 const settled=async()=>{await expect(page.getByTestId('r1-normal-file-status-attachments')).not.toHaveText('正在处理图片')}
 const reenter=async()=>{readGeneration++;await page.reload();await page.goto('/#/pages/index/index');await expect(page.locator('.home-page, .launch-cta')).toBeVisible();if(await page.locator('.launch-cta').isVisible()){await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click()}await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read();await stableRead();verifiedColdRead=true}
 try{
  await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
  await stableRead()
  await expect(row().locator('.r1-file-item')).toHaveCount(3)
  await expect(row().locator('.r1-file-preview')).toHaveCount(2)
  await expect(row().locator('.r1-file-name')).toHaveText('private-kept')
  await expect(row().getByTestId('r1-normal-file-remove-attachments-0')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-edit-saved-b')).toHaveCount(0)
  await page.getByTestId('r1-normal-edit-saved-a').click();await expect(editor.locator('.r1-file-item')).toHaveCount(2)
  await expect(page.getByTestId('r1-normal-file-add-attachments')).toBeVisible()
  if(mode==='cancel-before-upload'){
   await choose(true);await settled();await page.getByTestId('r1-normal-edit-cancel').click();await expect(editor).toHaveCount(0);await reenter()
   expect(sink.snapshot().filter((e:any)=>e.method==='PUT')).toHaveLength(0);expect(writes).toHaveLength(0);expect(a).toEqual(oldA)
  }else{
   if(mode==='known-upload-failure'||mode==='explicit-retry-after-known-rejection')sink.failNext('before-store')
   if(mode==='lost-upload-ack')sink.failNext('lose-response')
   if(mode==='actor-change-during-upload')held=new Promise<void>(r=>release=r)
   await choose()
   if(mode==='actor-change-during-upload'){
    await expect.poll(()=>entered).toBe(true)
    await page.goto('/#/pages/index/index');await expect(page.locator('.home-page')).toBeVisible();await page.locator('.home-footer .secondary').click();await expect(page.locator('.login-page')).toBeVisible()
    release!();await expect(editor).toHaveCount(0);expect(a).toEqual(oldA);expect(writes).toHaveLength(0)
   }else{
    await settled()
    if(mode==='explicit-retry-after-known-rejection'){
     expect(sink.snapshot().filter((e:any)=>e.method==='PUT')).toMatchObject([{stored:false}]);await expect(save).toHaveAttribute('aria-disabled','true')
     await page.getByTestId('r1-normal-file-retry-attachments').click();await settled()
    }
    if(mode==='known-upload-failure'||mode==='lost-upload-ack'){
     await expect(save).toHaveAttribute('aria-disabled','true');expect(writes).toHaveLength(0);expect(a).toEqual(oldA)
     const count=sink.snapshot().filter((e:any)=>e.method==='PUT').length;await reenter();expect(sink.snapshot().filter((e:any)=>e.method==='PUT')).toHaveLength(count)
     await page.getByTestId('r1-normal-edit-saved-a').click();await expect(save).toHaveAttribute('aria-disabled','true');expect(a).toEqual(oldA)
    }else{
     await expect(editor.locator('.r1-file-item')).toHaveCount(3)
     const puts=sink.snapshot().filter((e:any)=>e.method==='PUT');expect(puts.filter((e:any)=>e.stored)).toHaveLength(1);expect(sink.storedHash()).toBe(IMAGE_SHA256)
     if(mode==='cancel-after-upload'){
      await page.getByTestId('r1-normal-edit-cancel').click();await expect(editor).toHaveCount(0);await reenter();expect(writes).toHaveLength(0);expect(a).toEqual(oldA)
     }else{
      lostSave=mode==='lost-save-ack';await expect(save).toHaveAttribute('aria-disabled','false');await save.dblclick()
      if(lostSave)await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成')
      else{await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');verifiedSaved=true;await expect(save).toHaveCount(0)}
      expect(writes).toHaveLength(1);expect(a.attachments.slice(0,2)).toEqual(originalFiles)
      expect(a.attachments).toHaveLength(3);expect(a.attachments[2]).toEqual({url:'https://files.example.invalid/objects/'+sink.objectKey,name:sink.objectKey,extname:'png'})
      expect(a.exts.attachments).toEqual(a.attachments);expect(a.exts.opaque).toEqual(oldA.exts.opaque)
      await reenter();expect(writes).toHaveLength(1);expect(sink.snapshot().filter((e:any)=>e.method==='PUT')).toHaveLength(puts.length)
      await expect(page.getByTestId('r1-normal-edit-saved-a')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText(lostSave?'上次保存结果尚未核实':'本次编辑已保存并核实')
      coldLockState=lostSave?'uncertain':'completed'
     }
    }
   }
  }
  expect(bridgeAttempts).toBe(mode==='cancel-before-upload'?0:mode==='explicit-retry-after-known-rejection'?2:1)
  expect(calls.filter(c=>c.path==='back/super/file/upToken.do')).toHaveLength(bridgeAttempts)
  expect(a.keptAttachments).toEqual(oldA.keptAttachments);expect(a.exts.keptAttachments).toEqual(oldA.exts.keptAttachments)
  expect(b).toEqual(oldB);expect(errors).toEqual([]);expect(unexpected).toEqual([])
  expect(calls.filter(c=>/process|updateExts|delete|remove/i.test(c.path))).toEqual([])
  if(mode!=='actor-change-during-upload')expect(verifiedColdRead).toBe(true)
  await info.attach('settled-app-state',{body:await page.screenshot(),contentType:'image/png'})
 }finally{await info.attach('existing-image-upload-ledger',{body:JSON.stringify({mode,calls:calls.map(c=>c.path==='index/phoneLogin.do'?{path:c.path,body:{redacted:true}}:c),writes,a,b,readbacks,errors,unexpected,imageRequests,uploads:sink.snapshot(),bridgeAttempts,imageSha256:IMAGE_SHA256,verifiedSaved,verifiedColdRead,coldLockState,realBackend:'NOT_RUN',realQiniu:'NOT_RUN',provider:'LOCAL_SINK_NOT_QINIU'}),contentType:'application/json'});release?.();await sink.close()}
})
