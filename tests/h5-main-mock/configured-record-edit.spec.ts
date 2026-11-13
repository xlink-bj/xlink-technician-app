import { test, expect } from '@playwright/test'
import { enterNormalFormWorkspace, leaveNormalFormForList } from '../support/normal-form-workspace-entry'
test.beforeEach(({},info)=>{test.skip(info.project.metadata.configuredRecordEdit!==true,'Dedicated fully intercepted configured-record edit mode')})

for(const mode of ['typed','map','map-date','map-wrong-readback','lost-response','wrong-readback','stale-before-save','map-large-readonly','map-config-changed'] as const){
test(`normal configured existing-record editor ${mode}`,async({page,baseURL},info)=>{
  const isMap=mode.startsWith('map'),definitionId='configured-form',errors:string[]=[],unexpected:string[]=[],calls:any[]=[],writes:any[]=[]
  let stale=false
  const fields:Record<string,any>[]=[{_id:'measurement',name:isMap?'quantity':'squareMeter',nameDisp:'测量值',type:'digit',required:'1',preset:1},
    {_id:'description',name:isMap?'visitComment':'memo',nameDisp:'现场说明',type:'textarea',required:'0',preset:isMap?0:1}]
    .map(f=>({...f,extId:definitionId,tenantId:'t',state:1,colName:isMap?'configuredNotes':'survey',operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}'}))
  const numberKey=fields[0]!.name,textKey=fields[1]!.name
  const extraFields=mode==='map-large-readonly'?Array.from({length:49},(_,i)=>({...fields[1],_id:'readonly-'+i,name:'retainedValue'+i,
    nameDisp:i===0?'已确认状态':i===1?'已选事项':'保留信息'+i,type:i===0?'switch':i===1?'checkbox':'text',readOnly:1,
    multiple:i===1,preset:1,options:i===1?[{value:'b',label:'乙'},{value:'a',label:'甲'}]:undefined})):[]
  fields.push(...extraFields)
  if(mode==='map-large-readonly'||mode==='map-config-changed')fields[1]!.frontEndConfig=JSON.stringify({placeholder:'请输入现场核对说明'})
  const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
    nodeDef:{nodeType:'repeat',name:'现场勘查',formDefId:definitionId,viewableRoleIds:['r'],formFieldIdsFill:['measurement','description'],formFieldIdsReadOnly:extraFields.map(f=>f._id)}}
  const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成现场服务',orderNum:'EDIT-RECORD',exts:{sourceType:''}}
  let a:Record<string,any>={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,[numberKey]:12.5,
    ...(isMap?{}:{[textKey]:'原现场说明'}),exts:{opaque:{keep:[1,2]},...(isMap?{[textKey]:'原现场说明'}:{})},orgId:'o',orgName:'合成组织',belongTo:'u',
    createUser:'u',createUserName:'合成创建者',updateUser:'u',updateUserName:'合成更新者',createTime:isMap&&mode!=='map-date'?'2026-11-07 13:04:09':1700000000123,
    updateTime:isMap?'2026-11-07 13:04:09':1700001000000,part:['4'],surveyDrawing:[],infraredImageList:[],etags:{}}
  for(const [i,f]of extraFields.entries())a[f.name]=i===0?'1':i===1?['b','a']:'原信息'+i
  const original=structuredClone(a),b={...structuredClone(a),_id:'saved-b'},oldB=structuredClone(b)
  const dates=(row:Record<string,any>)=>{const value=structuredClone(row);for(const key of ['createTime','updateTime'])if(typeof value[key]==='number')value[key]=new Date(value[key]+8*3600000).toISOString().slice(0,19).replace('T',' ');return value}
  page.on('pageerror',e=>errors.push(e.message))
  await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS '+socket.url());socket.close()}})
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient')}
    if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['fetch','xhr'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort('blockedbyclient')}
    if(req.method()!=='POST'){unexpected.push(req.method()+' '+url.pathname);return route.abort('blockedbyclient')}
    const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''));calls.push({path,body})
    const ok=(json:unknown)=>route.fulfill({json})
    if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-record-session',user:{_id:'u'},currentRole:{_id:'r'},capabilityNames:[]}})
    if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
    if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
    if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
    if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20})
    if(path==='biz/ext/queryById.do')return ok({_id:definitionId,tenantId:'t',state:1,type:isMap?'0':'1',colName:isMap?'configuredNotes':'survey'})
    if(path==='biz/extField/query'){const p=Number(body.page);return ok({data:fields.slice((p-1)*50,p*50),total:fields.length,page:p,size:50})}
    if(path==='biz/extForm/query/'+definitionId){
      if(stale)a.exts.opaque={keep:['changed-by-another-read']}
      const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']).map(dates)
      return ok({data,total:data.length,page:1,size:Number(body.rows)})
    }
    if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:definitionId,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
    if(path==='biz/extForm/upsert/'+definitionId){
      expect(writes).toHaveLength(0);const submitted=JSON.parse(body.dataStr);expect(submitted._id).toBe('saved-a');writes.push(structuredClone(submitted));a=submitted
      expect(a.exts.opaque).toEqual(original.exts.opaque);expect(b).toEqual(oldB)
      if(mode==='lost-response')return route.abort('failed')
      const ack=dates(a)
      if(mode.endsWith('wrong-readback'))a.exts.opaque={keep:['lost-preservation']}
      return ok({success:true,status:1,data:ack})
    }
    unexpected.push(path);return route.abort('blockedbyclient')
  })
  const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
  async function enter(){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()}
  try{
    await enter();await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(2)
    await expect(page.getByTestId('r1-normal-edit-saved-b')).toHaveCount(0)
    await expect(page.getByTestId('r1-normal-append')).toHaveCount(0);await expect(page.getByTestId('r1-normal-complete-request')).toHaveCount(0)
    await page.getByTestId('r1-normal-edit-saved-a').click()
    if(mode==='map-large-readonly'||mode==='map-config-changed'){
      // uni-app H5 paints placeholder text in its own visible overlay rather
      // than a native textarea attribute. Verify what a user actually sees.
      const input=page.getByTestId('r1-normal-input-'+textKey)
      await input.locator('textarea').fill('')
      await expect(input.locator('.uni-textarea-placeholder')).toHaveText('请输入现场核对说明')
      await expect(input.locator('.uni-textarea-placeholder')).toBeVisible()
      await input.scrollIntoViewIfNeeded()
      await page.screenshot({path:info.outputPath('configured-field-placeholder.png')})
    }
    if(mode==='map-large-readonly'){
      await expect(page.getByTestId('r1-normal-input-retainedValue0').locator('input,textarea')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-input-retainedValue1').locator('input,textarea,.app-choice')).toHaveCount(0)
      expect(calls.some(c=>c.path==='biz/extField/query'&&c.body.page==='2')).toBe(true)
    }
    await page.getByTestId('r1-normal-input-'+textKey).locator('textarea,input').fill('取消不保存的内容')
    await page.getByTestId('r1-normal-edit-cancel').click();expect(writes).toHaveLength(0)
    await page.getByTestId('r1-normal-edit-saved-a').click()
    await expect(page.getByTestId('r1-normal-input-'+textKey).locator('textarea,input')).toHaveValue('原现场说明')
    await page.getByTestId('r1-normal-input-'+numberKey).scrollIntoViewIfNeeded()
    await page.screenshot({path:info.outputPath('existing-editor-before.png')})
    await page.getByTestId('r1-normal-input-'+numberKey).locator('input').fill('0')
    await page.getByTestId('r1-normal-input-'+textKey).locator('textarea,input').fill('已核对现场说明')
    const save=page.getByTestId('r1-normal-save');await save.scrollIntoViewIfNeeded()
    const box=await save.boundingBox(),back=await page.getByTestId('normal-form-workspace-back').boundingBox()
    expect(box!.y+box!.height).toBeLessThanOrEqual(back!.y)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
    await page.screenshot({path:info.outputPath('existing-editor-ready-to-save.png')})
    if(mode==='stale-before-save')stale=true
    if(mode==='map-config-changed')fields[1]!.frontEndConfig=JSON.stringify({placeholder:'请输入现场核对说明',verify:'unverified'})
    await page.getByTestId('r1-normal-save').click()
    if(['lost-response','wrong-readback','map-wrong-readback','stale-before-save','map-config-changed'].includes(mode)){
      await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实')
      const beforeDispatch=['stale-before-save','map-config-changed'].includes(mode)
      expect(writes).toHaveLength(beforeDispatch?0:1)
      await page.reload();await enter()
      if(!beforeDispatch){
        await expect(page.getByTestId('r1-normal-edit-saved-a')).toHaveCount(0)
        await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('上次保存结果尚未核实')
      }
      expect(writes).toHaveLength(beforeDispatch?0:1)
    }else{
      await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
      expect(a[numberKey]).toBe(0);expect(isMap?a.exts[textKey]:a[textKey]).toBe('已核对现场说明')
      expect(a.createTime).toBe(mode==='map-date'?dates(original).createTime:original.createTime)
      await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
      await expect(page.getByTestId('r1-normal-value-'+textKey).filter({hasText:'已核对现场说明'})).toBeVisible();expect(writes).toHaveLength(1)
      await expect(page.getByTestId('r1-normal-edit-saved-a')).toHaveCount(0)
      await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('本次编辑已保存并核实')
      for(const f of extraFields)expect(a[f.name]).toEqual(original[f.name])
    }
    await page.screenshot({path:info.outputPath('existing-editor-after.png')})
    expect(b).toEqual(oldB);expect(calls.filter(c=>/process|updateExts|upToken|upload|remove|delete/.test(c.path))).toEqual([])
    expect(errors).toEqual([]);expect(unexpected).toEqual([])
  }finally{await info.attach('configured-record-http-ledger',{body:JSON.stringify({mode,calls,writes,a,b,errors,unexpected,
    knownAuditNormalization:mode==='map-date'?{key:'createTime',originalRaw:original.createTime,submittedWire:a.createTime,rule:'Observed R1 query Date string; legacy Map upsert converts old Date createTime. NOT BSON-lossless.'}:null,
    realBackend:'NOT_RUN'},null,2),contentType:'application/json'})}
})}
