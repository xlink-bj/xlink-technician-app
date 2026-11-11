import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_SWITCH_RATE_CREATE!=='true','Opt-in synthetic ordinary Switch/Rate create; synthetic only')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[['arbitraryToggle','switch'],['arbitraryScore','rate'],['memo','text'],['zeroProof','number'],['codeProof','select']].map(([name,type],i)=>({_id:'field-'+i,name,nameDisp:name,type,tenantId:'t',extId:'e',colName:'syntheticSwitchRate',state:1,required:mode==='required-score'&&type==='rate'?'1':'0',preset:i===0||i===3?1:0,multiple:false,readOnly:0,operationType:'1',showList:['4'],frontEndConfig:'{}',customizeFlag:1,showType:'1',...(type==='select'?{valueOption:'SYN_CODES'}:{})}))
 if(mode==='renamed')for(const f of fields)f.name=f.nameDisp='other_'+f.name
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通开关评分',orderNum:'SYNTHETIC-ORDINARY-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成配置新建',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
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
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticSwitchRate'})
  if(path==='biz/extField/query'){if(mode==='permission-drift'&&state.calls.filter(p=>p===path).length>1)fields[0].readOnly=1;return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})}
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:{a:'合成甲',b:'合成乙',c:'合成丙'}}])
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved));if(mode==='wrong-ack')state.saved.arbitraryToggle=false
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}


for(const mode of ['save-reopen','renamed','required-score','wrong-ack','permission-drift'])test(`normal configured Switch/Rate ${mode}`,async({page,baseURL},info)=>{
 const {state}=await fixture(page,baseURL!,mode),prefix=mode==='renamed'?'other_':''
 const field=(key:string)=>page.getByTestId('r1-normal-input-'+prefix+key)
 try{
  await open(page)
  await expect(field('arbitraryScore')).toContainText('未评分')
  if(mode==='save-reopen'){
   await field('arbitraryToggle').locator('.app-choice').filter({hasText:'是'}).click()
   await field('arbitraryScore').locator('[aria-label="2 星"]').click()
   await page.locator('.uni-page-head-btn').first().click()
   await expect(page.locator('.work-order-card')).toBeVisible();await page.locator('.work-order-card').click()
   await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
   await expect(field('arbitraryScore')).toContainText('未评分')
   await expect(field('arbitraryToggle').locator('[aria-pressed="true"]')).toHaveCount(0)
   expect(state.writes).toEqual([])
  }
  await field('memo').getByRole('textbox').fill(' synthetic preserved ')
  await field('zeroProof').getByRole('textbox').fill('0')
  if(mode==='required-score'){
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true')
   await page.getByTestId('r1-normal-save').click({force:true});expect(state.writes).toEqual([])
  }
  await field('arbitraryToggle').locator('.app-choice').filter({hasText:'否'}).click()
  await field('arbitraryScore').locator('[aria-label="4 星"]').click()
  await field('arbitraryScore').locator('[aria-label="4 星"]').click()
  await expect(field('arbitraryScore')).toContainText('4 / 5')
  if(mode==='save-reopen'){
   await field('arbitraryScore').locator('.app-button').filter({hasText:'清空'}).click();await expect(field('arbitraryScore')).toContainText('未评分')
   await field('arbitraryScore').locator('[aria-label="5 星"]').click()
  }
  await field('codeProof').locator('.app-choice').filter({hasText:'合成甲'}).click()
  await page.getByTestId('r1-normal-save').click()
  if(mode==='wrong-ack'||mode==='permission-drift'){
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实')
   expect(state.writes).toEqual(mode==='wrong-ack'?['biz/extForm/upsert/e']:[])
   if(mode==='wrong-ack')await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
  }else{
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
   expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
   expect(state.saved[prefix+'arbitraryToggle']).toBe('0');expect(state.saved[prefix+'arbitraryScore']).toBe(mode==='save-reopen'?5:4)
   expect(state.saved.exts[prefix+'arbitraryScore']).toBe(state.saved[prefix+'arbitraryScore'])
   expect(state.saved[prefix+'zeroProof']).toBe(0);expect(state.saved[prefix+'memo']).toBe('synthetic preserved')
   expect(state.saved.exts[prefix+'codeProof']).toBe('a')
   await expect(page.getByTestId('r1-normal-value-'+prefix+'arbitraryToggle')).toContainText('0')
   await expect(page.getByTestId('r1-normal-value-'+prefix+'arbitraryScore')).toContainText(String(state.saved[prefix+'arbitraryScore']))
   await expect(page.getByTestId('r1-normal-append')).toHaveCount(0);await expect(page.getByTestId('r1-normal-edit-saved')).toHaveCount(0)
  }
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
  expect(state.calls.some(p=>/process|upload|upToken|delete/i.test(p))).toBe(false)
  await page.screenshot({path:info.outputPath('switch-rate-'+mode+'.png'),fullPage:true})
 }finally{await info.attach('synthetic-switch-rate-ledger',{body:JSON.stringify({mode,calls:state.calls,writes:state.writes,payloads:state.payloads,unexpected:state.unexpected,errors:state.errors}),contentType:'application/json'})}
})
