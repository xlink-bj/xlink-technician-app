import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
test.beforeEach(({},info)=>test.skip(info.config.metadata.mapChoiceDatetimeEdit!==true,'Dedicated intercepted configured editing'))
for(const mode of ['conditional-hide','conditional-nonpreset-root','conditional-reveal','conditional-reopen','conditional-checkbox-hidden','conditional-checkbox-empty-hidden',
 'cascade-three-level','cascade-cancel','cascade-provider','cascade-lost'] as const)test(`normal Map condition and cascade ${mode}`,async({page,baseURL},info)=>{
 const def='configured-form',treeId='location-tree',checkbox=mode.includes('checkbox'),initialHidden=mode==='conditional-reveal'||checkbox
 const calls:any[]=[],writes:any[]=[],errors:string[]=[],unexpected:string[]=[]
 const fields=[{_id:'choice-field',name:'operationMode',nameDisp:'填写方式',type:'radio',preset:mode==='conditional-nonpreset-root'?0:1,required:'1',options:[{value:'show',label:'填写明细'},{value:'hide',label:'暂不填写'}]},
  {_id:'time-field',name:'detailValue',nameDisp:'现场明细',type:checkbox?'checkbox':'textarea',multiple:checkbox,preset:0,required:checkbox?'0':'1',showType:'3',showField:'operationMode',showFieldPreset:1,showValue:'show',
   ...(checkbox?{options:[{value:'a',label:'事项甲'},{value:'b',label:'事项乙'}]}:{})},
  {_id:'note-field',name:'locationPath',nameDisp:'服务位置',type:'cascade',multiple:false,preset:0,required:'1',valueOption:treeId}]
  .map(f=>({tenantId:'t',extId:def,colName:'configuredNotes',state:1,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}',...f}))
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
  nodeDef:{nodeType:'repeat',name:'现场记录',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成服务',orderNum:'CONDITION-TREE',exts:{sourceType:''}}
 const detail=checkbox?(mode==='conditional-checkbox-empty-hidden'?[]:['a']):mode==='conditional-reveal'?'':'原有现场明细'
 let a:any={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,operationMode:initialHidden?'hide':'show',detailValue:detail,locationPath:['north','upper','left'],
  exts:{detailValue:structuredClone(detail),locationPath:['north','upper','left'],opaque:{keep:[1,2]}},createTime:'2026-11-07 13:04:09',updateTime:'2026-11-07 13:04:09'}
 if(mode==='conditional-nonpreset-root')a.exts.operationMode='show'
 const original=structuredClone(a),b={...structuredClone(a),_id:'saved-b'},oldB=structuredClone(b)
 const child=(id:string,value:string,name:string,parentId:string,children:any[]=[])=>({_id:id,value,name,parentId,type:treeId,tenantId:'t',children})
 const group={_id:'G',type:treeId,tenantId:'t',children:[child('N','north','北区','G',[child('U','upper','一层','N',[child('L','left','左侧','U')])]),
  child('S','south','南区','G',[child('D','lower','二层','S',[child('R','right','右侧','D')])])]}
 page.on('pageerror',e=>errors.push(e.message))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['fetch','xhr'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort('blockedbyclient')}
  const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''));calls.push({path,body})
  if(req.method()!=='POST'){unexpected.push(req.method());return route.abort('blockedbyclient')}
  const ok=(json:unknown)=>route.fulfill({json})
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-condition-session',user:{_id:'u'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20})
  if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'0',colName:'configuredNotes'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50})
  if(path==='i/code/selectMultistageCode.do'){expect(body).toEqual({types:treeId,tenantId:'t'});return ok([group])}
  if(path==='biz/extForm/query/'+def){const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']);return ok({data,total:data.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);const sent=JSON.parse(body.dataStr);expect(sent._id).toBe('saved-a');expect(sent.exts.opaque).toEqual(original.exts.opaque);writes.push(sent);a=sent
   if(mode==='cascade-lost')return route.abort('failed');return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const field=(name:string)=>page.getByTestId('r1-normal-input-'+name)
 const enter=async()=>{await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()}
 const choice=(text:string)=>field('operationMode').locator('.app-choice').filter({hasText:text})
 try{
  await enter();await page.getByTestId('r1-normal-edit-saved-a').click()
  if(initialHidden)await expect(field('detailValue')).toHaveCount(0)
  if(mode==='conditional-hide'||mode==='conditional-nonpreset-root'){await choice('暂不填写').click();await expect(field('detailValue')).toHaveCount(0)}
  if(mode==='conditional-reveal'){
   await choice('填写明细').click();await expect(field('detailValue')).toBeVisible();await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true')
   await field('detailValue').locator('textarea').fill('补充后的现场明细')
  }
  if(mode==='conditional-reopen'){
   await field('detailValue').locator('textarea').fill('编辑中保留的明细');await choice('暂不填写').click();await expect(field('detailValue')).toHaveCount(0)
   await choice('填写明细').click();await expect(field('detailValue').locator('textarea')).toHaveValue('编辑中保留的明细')
  }
  const changedPath=mode.startsWith('cascade')||checkbox
  if(changedPath)await field('locationPath').locator('.app-choice').filter({hasText:'南区 / 二层 / 右侧'}).click()
  await field('operationMode').scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('conditional-cascade-editor.png')})
  if(mode==='cascade-cancel'){
   await page.getByTestId('r1-normal-edit-cancel').click();expect(writes).toHaveLength(0);await page.getByTestId('r1-normal-edit-saved-a').click()
   await expect(field('locationPath').locator('.app-choice').filter({hasText:'北区 / 一层 / 左侧'})).toHaveAttribute('aria-pressed','true')
  }else{
   if(mode==='cascade-provider')group.children[1]!.children[0]!.children[0]!.name='选项已变化'
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false');await page.getByTestId('r1-normal-save').dblclick()
   if(mode==='cascade-provider'||mode==='cascade-lost'){
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实');expect(writes).toHaveLength(mode==='cascade-provider'?0:1)
    if(mode==='cascade-lost'){await page.reload();await enter();await expect(page.getByTestId('r1-normal-edit-saved-a')).toHaveCount(0)
     await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('上次保存结果尚未核实');expect(writes).toHaveLength(1)}
   }else{
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(writes).toHaveLength(1)
    expect(a.detailValue).toEqual(mode==='conditional-reveal'?'补充后的现场明细':mode==='conditional-reopen'?'编辑中保留的明细':original.detailValue)
    expect(a.exts.detailValue).toEqual(a.detailValue)
    if(mode==='conditional-nonpreset-root'){expect(a.operationMode).toBe('hide');expect(a.exts.operationMode).toBe('hide')}
    if(changedPath){expect(a.locationPath).toEqual(['south','lower','right']);expect(a.exts.locationPath).toEqual(a.locationPath)}
    await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
    await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('本次编辑已保存并核实')
   }
  }
  expect(b).toEqual(oldB);expect(calls.filter(c=>/process|updateExts|upload|upToken|remove|delete/i.test(c.path))).toEqual([])
  expect(errors).toEqual([]);expect(unexpected).toEqual([]);await page.screenshot({path:info.outputPath('conditional-cascade-after.png')})
 }finally{await info.attach('conditional-cascade-ledger',{body:JSON.stringify({mode,calls,writes,a,b,errors,unexpected,realBackend:'NOT_RUN'}),contentType:'application/json'})}
})
