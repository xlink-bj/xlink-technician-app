import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_ORDINARY_UI_ATOMICITY!=='true','Opt-in synthetic ordinary input atomicity and real Uni H5 picker lifecycle')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[['visitDate','date'],['visitTime','time'],['visitAt','datetime'],['mode','text'],['followupAt','datetime'],['memo','text']].map(([name,type],i)=>({_id:'field-'+i,name,nameDisp:name,type,tenantId:'t',extId:'e',colName:'syntheticSchedule',state:1,required:name==='followupAt'?'1':'0',preset:i===0||i===2?1:0,multiple:false,readOnly:0,operationType:'1',showList:['4'],frontEndConfig:'{}',customizeFlag:1,showType:name==='followupAt'?'3':'1',...(name==='followupAt'?{showField:'mode',showValue:'on',showFieldPreset:0}:{})}))
 if(mode==='reject-empty')fields[4].showType='2'
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通时间条件',orderNum:'SYNTHETIC-ORDINARY-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成六字段新建',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 page.on('pageerror',error=>state.errors.push(error.stack??error.message))
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
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticSchedule'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙',c:'合成丙'}}])
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved))
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}


async function telemetry(page:Page){
 await page.addInitScript(()=>{
  const w=window as any,original=w.setTimeout.bind(w),cancel=w.clearTimeout.bind(w),entries:any[]=[];w.__pickerAudit={entries}
  w.setTimeout=function(fn:any,delay?:number,...args:any[]){
   const source=typeof fn==='function'?String(fn):'',kind=/\.prepend\(/.test(source)&&/\.remove\(/.test(source)?'close':/\.visible\s*=\s*true/.test(source)?'show':null
   if(!kind)return original(fn,delay,...args)
   const e:any={id:null,kind,delay,state:'pending',scheduled:performance.now(),closes:entries.filter(x=>x.kind==='close').map(x=>({id:x.id,state:x.state}))};entries.push(e)
   e.id=original(function(this:any,...values:any[]){e.state='firing';try{return fn.apply(this,values)}finally{e.state='completed';e.finished=performance.now()}},delay,...args);return e.id
  }
  w.clearTimeout=function(id:any){const e=entries.find(x=>x.id===id&&x.state==='pending');if(e){e.state='cancelled';e.finished=performance.now()}return cancel(id)}
 })
}
async function audit(page:Page){return page.evaluate(()=>structuredClone((window as any).__pickerAudit.entries))}
async function settleCloses(page:Page){await expect.poll(async()=>(await audit(page)).filter((e:any)=>e.kind==='close'&&e.state==='pending').length).toBe(0)}
async function choose(page:Page,picker:ReturnType<Page['locator']>,settle=true){
 const before=(await audit(page)).length;await picker.click();const done=page.getByText('Done',{exact:true}).filter({visible:true}).last();await expect(done).toBeVisible();await done.click()
 await expect.poll(async()=>(await audit(page)).slice(before).filter((e:any)=>e.kind==='close').length).toBeGreaterThan(0)
 const close=(await audit(page)).slice(before).filter((e:any)=>e.kind==='close').at(-1)
 if(settle)await settleCloses(page)
 return close
}
async function inputState(page:Page){return page.getByTestId('r1-normal-input-mode').getByRole('textbox').evaluate((el:any)=>{
 let instance=el.__vueParentComponent,element=el
 while(!instance&&element){element=element.parentElement;instance=element?.__vueParentComponent}
 const result:any={nativeValue:el.value,readOnlyPropsInspection:true,modelInjection:false}
 while(instance){const name=instance.type.__name??instance.type.name??'';if(name==='AppInput')result.inputModel=instance.props.modelValue;if(name==='R1FormFieldControl')result.controlModel=instance.props.modelValue;instance=instance.parent}
 return result
})}
for(const mode of ['reject-trim','reject-empty'])test(`rejected input restores native and model atomically ${mode}`,async({page,baseURL},info)=>{
 await telemetry(page);const {state}=await fixture(page,baseURL!,mode);const field=(key:string)=>page.getByTestId('r1-normal-input-'+key)
 try{await open(page);await field('mode').getByRole('textbox').fill('on')
  for(const p of [field('followupAt').locator('.app-date-time-field__picker').nth(0),field('followupAt').locator('.app-date-time-field__picker').nth(1)])await choose(page,p)
  const nativeBefore=await field('mode').getByRole('textbox').elementHandle(),dateBefore=await field('followupAt').elementHandle(),dateText=await field('followupAt').innerText()
  await field('mode').getByRole('textbox').fill(mode==='reject-trim'?' on ':'')
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('不能更新草稿')
  await info.attach('atomic-readonly-snapshot',{body:JSON.stringify(await inputState(page)),contentType:'application/json'})
  await expect(field('mode').getByRole('textbox')).toHaveValue('on')
  expect(await inputState(page)).toMatchObject({nativeValue:'on',inputModel:'on',controlModel:'on'})
  expect(await nativeBefore!.evaluate(e=>e.isConnected)).toBe(true);expect(await dateBefore!.evaluate(e=>e.isConnected)).toBe(true)
  await choose(page,field('visitDate').getByTestId('app-date-time-field'))
  await expect(field('mode').getByRole('textbox')).toHaveValue('on');await expect.poll(()=>field('followupAt').innerText()).toBe(dateText)
  expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([])
 }finally{await info.attach('atomic-ui-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,errors:state.errors,unexpected:state.unexpected,picker:await audit(page)}),contentType:'application/json'})}
})
for(const mode of ['done-hide','time-done-hide','done-back','rapid-reopen','open-back'])test(`real picker lifecycle ${mode}`,async({page,baseURL},info)=>{
 await telemetry(page);const {state}=await fixture(page,baseURL!,'hide-reopen');const follow=page.getByTestId('r1-normal-input-followupAt').locator('.app-date-time-field__picker').nth(mode==='time-done-hide'?1:0)
 try{await open(page);await page.getByTestId('r1-normal-input-mode').getByRole('textbox').fill('on')
  if(mode==='open-back'){
   await follow.click();await page.goBack();await expect(page.locator('.work-order-card')).toBeVisible()
   await expect.poll(async()=>(await audit(page)).filter((e:any)=>e.kind==='show'&&e.state==='pending').length).toBe(0)
  }else{
   const close=await choose(page,follow,false);expect(close.state).toBe('pending')
   if(mode==='done-hide'||mode==='time-done-hide')await page.getByTestId('r1-normal-input-mode').getByRole('textbox').fill('off')
   if(mode==='done-back')await page.goBack()
   if(mode==='rapid-reopen'){
    const before=(await audit(page)).length;await follow.click();await expect(page.getByText('Done',{exact:true}).filter({visible:true}).last()).toBeVisible()
    const reopen=(await audit(page)).slice(before).find((e:any)=>e.kind==='show');expect(reopen).toBeTruthy();expect(['pending','cancelled','completed']).toContain(reopen.closes.find((e:any)=>e.id===close.id).state)
    await expect.poll(async()=>(await audit(page)).find((e:any)=>e.id===close.id).state).not.toBe('pending')
    await expect(page.getByText('Done',{exact:true}).filter({visible:true}).last()).toBeVisible()
    await page.getByText('Done',{exact:true}).filter({visible:true}).last().click()
   }
   await settleCloses(page)
   if(mode==='done-hide'||mode==='time-done-hide')await expect(page.getByTestId('r1-normal-input-followupAt')).toHaveCount(0)
   if(mode==='done-back')await expect(page.locator('.work-order-card')).toBeVisible()
  }
  expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.writes).toEqual([])
 }finally{await info.attach('picker-lifecycle-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,errors:state.errors,unexpected:state.unexpected,picker:await audit(page)}),contentType:'application/json'})}
})
