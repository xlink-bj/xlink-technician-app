import {test,expect} from '@playwright/test'
import {enterNormalFormWorkspace,leaveNormalFormForList} from '../support/normal-form-workspace-entry'
test.beforeEach(({},info)=>test.skip(info.config.metadata.mapChoiceDatetimeEdit!==true,'Dedicated intercepted Map choice/time editing'))
for(const mode of ['save','revoked','checkbox-order','checkbox-clear','checkbox-required','checkbox-provider','checkbox-lost'] as const)test(`normal Map configured choices and datetime ${mode}`,async({page,baseURL},info)=>{
 const def='configured-form',calls:any[]=[],writes:any[]=[],errors:string[]=[],unexpected:string[]=[]
 let revoked=false
 const checkbox=mode.startsWith('checkbox'),optional=mode==='checkbox-clear'||mode==='checkbox-lost'
 let options={onsite:'现场',remote:'远程'}
 const fields=[{_id:'choice-field',name:'contactMode',type:checkbox?'checkbox':'radio',multiple:checkbox,required:optional?'0':'1',preset:checkbox?0:1,valueOption:'contact-options'},
  {_id:'time-field',name:'windowStart',type:'datetime',required:'1',preset:0},
  {_id:'note-field',name:'visitNotes',type:'textarea',required:'0',preset:1}]
  .map(f=>({...f,nameDisp:f.name,tenantId:'t',extId:def,colName:'appointment',state:1,operationType:'1',showList:['4'],showType:'1',frontEndConfig:'{}'}))
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],
  nodeDef:{nodeType:'repeat',name:'配置表单',formDefId:def,viewableRoleIds:['r'],formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成服务',orderNum:'CONFIGURED-TIME',exts:{sourceType:''}}
 let a:any={_id:'saved-a',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',state:1,contactMode:'onsite',windowStart:'',visitNotes:'未修改',
  exts:{windowStart:'',opaque:{keep:[1,2]}},createTime:1700000000123,updateTime:'2026-11-07 13:04:09'}
 if(checkbox){a.contactMode=['onsite'];a.exts.contactMode=['onsite'];a.windowStart='2027-03-04 09:15:23';a.exts.windowStart=a.windowStart}
 const b={...structuredClone(a),_id:'saved-b'},oldB=structuredClone(b)
 const query=(r:any)=>{const x=structuredClone(r);if(typeof x.createTime==='number')x.createTime='2023-11-15 06:13:20';return x}
 page.on('pageerror',e=>errors.push(e.message))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['fetch','xhr'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort('blockedbyclient')}
  const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''))
  calls.push({path,body});if(req.method()!=='POST'){unexpected.push(req.method());return route.abort('blockedbyclient')}
  const ok=(json:unknown)=>route.fulfill({json})
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-map-session',user:{_id:'u'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[{...node,handlerIds:revoked?[]:['u']}]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20})
  if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:'t',state:1,type:'0',colName:'appointment'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50})
  if(path==='i/code/selectCode.do'){expect(body).toEqual({tenantId:'t',jsonPara:JSON.stringify([{codeId:'contact-options',eleid:'contact-options'}])});return route.fulfill({json:JSON.stringify([{codeId:'contact-options',eleid:'contact-options',options}])})}
  if(path==='biz/extForm/query/'+def){const data=[a,b].filter(r=>!body['is:_id|string#and']||r._id===body['is:_id|string#and']).map(query);return ok({data,total:data.length,page:1,size:Number(body.rows)})}
  if(path==='biz/extForm/findByIdWithWorkflow'){expect(body).toEqual({extId:def,id:'saved-a'});return ok({success:true,status:1,data:{data:a,workflow:null,workflowNode:null}})}
  if(path==='biz/extForm/upsert/'+def){expect(writes).toHaveLength(0);const value=JSON.parse(body.dataStr);expect(value._id).toBe('saved-a');expect(value.exts.opaque).toEqual({keep:[1,2]});writes.push(value);a=value;if(mode==='checkbox-lost')return route.abort('failed');return ok({success:true,status:1,data:a})}
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 const field=(key:string)=>page.getByTestId('r1-normal-input-'+key)
 const pick=async(index:number)=>{await field('windowStart').locator('.app-date-time-field__picker').nth(index).click();const done=page.getByText('Done',{exact:true}).filter({visible:true}).last();await expect(done).toBeVisible();await done.click();await expect(done).toBeHidden()}
 const enter=async()=>{
  await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
 }
 try{
  await enter()
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(2);await page.getByTestId('r1-normal-edit-saved-a').click()
  if(checkbox){
   await field('contactMode').locator('.app-choice').filter({hasText:'现场'}).click()
   if(!optional)await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true')
   if(!optional&&mode!=='checkbox-required'){
    await field('contactMode').locator('.app-choice').filter({hasText:'远程'}).click()
    await field('contactMode').locator('.app-choice').filter({hasText:'现场'}).click()
   }
  }else{
   await field('contactMode').locator('.app-choice').filter({hasText:'远程'}).click()
   await pick(0);await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true');expect(writes).toHaveLength(0)
   await pick(1)
  }
  await field('visitNotes').locator('textarea').fill('配置控件保存')
  await field('contactMode').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('choices-before-save.png')})
  if(mode==='revoked'){
   revoked=true;await read();await expect(page.getByTestId('r1-normal-save')).toHaveCount(0);expect(writes).toHaveLength(0)
  }else if(mode==='checkbox-required'){
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true');expect(writes).toHaveLength(0)
  }else{
   if(mode==='checkbox-provider')options={onsite:'现场',remote:'不同选项代次'}
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false');await page.getByTestId('r1-normal-save').dblclick()
   if(mode==='checkbox-provider'||mode==='checkbox-lost'){
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实')
    expect(writes).toHaveLength(mode==='checkbox-provider'?0:1)
    if(mode==='checkbox-lost'){
     expect(a.contactMode).toEqual([]);expect(a.exts.contactMode).toEqual([])
     // A cold reload drops in-memory authorization/list evidence. Rebuild it
     // through normal login/list/CTA; never assume the old workspace survived.
     await page.reload();await enter()
     await expect(page.getByTestId('r1-normal-edit-saved-a')).toHaveCount(0)
     await expect(page.getByTestId('r1-normal-edit-status-saved-a')).toContainText('上次保存结果尚未核实')
     expect(writes).toHaveLength(1)
    }
   }else{
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
    expect(writes).toHaveLength(1)
    if(checkbox){expect(a.contactMode).toEqual(optional?[]:['remote','onsite']);expect(a.exts.contactMode).toEqual(a.contactMode)}else expect(a.contactMode).toBe('remote')
    expect(a.windowStart).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);expect(a.exts.windowStart).toBe(a.windowStart)
    await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read()
    await expect(page.getByTestId('r1-normal-value-visitNotes').filter({hasText:'配置控件保存'})).toBeVisible();expect(writes).toHaveLength(1)
   }
  }
  await page.screenshot({path:info.outputPath('choices-after.png')})
  expect(b).toEqual(oldB);expect(calls.filter(c=>/process|updateExts|upload|upToken|remove|delete/i.test(c.path))).toEqual([]);expect(errors).toEqual([]);expect(unexpected).toEqual([])
 }finally{await info.attach('map-choice-time-ledger',{body:JSON.stringify({mode,calls,writes,a,b,errors,unexpected,realBackend:'NOT_RUN'}),contentType:'application/json'})}
})
