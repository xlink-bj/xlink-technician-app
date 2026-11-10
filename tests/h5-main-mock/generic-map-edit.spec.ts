import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_GENERIC_MAP_EDIT!=='true','Dedicated fully intercepted generic Map edit only')
async function fixture(page:Page,baseURL:string){
 const s={type:'0',colName:'syntheticScalar',afterType:false,unknownAck:false,errors:[] as string[],unexpected:[] as string[],calls:[] as {path:string;body:Record<string,string>}[],writes:[] as string[],payloads:[] as any[],record:{_id:'v',tenantId:'t',sid:'s',nodeId:'n',workflowId:'w',formDefId:'e',state:1,memo:'old',formTitle:'独立原记录标题',unknownRoot:{keep:[0,false]},protected1:{readonly:'keep'},exts:{memo:'old',audit:{keep:true},protected2:['readonly']}} as any}
 const fields=Array.from({length:59},(_,i)=>({_id:i?'ro-'+i:'memo',tenantId:'t',extId:'e',state:1,name:i?'protected'+i:'memo',nameDisp:i?'Protected '+i:'Memo',type:'text',required:i?0:1,readOnly:i?1:0,preset:i?1:0}))
 const sa={_id:'s',tenantId:'t',orderNum:'SYNTHETIC-GENERIC-EDIT',workflowId:'w',state:1,status:105,name:'合成generic编辑',serviceType:'40',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[{_id:'v',formDefId:'e',state:1,formTitle:'独立列表标题',audit:{keep:true}},{_id:'deleted',formDefId:'e',state:-1,unknown:true}],unknownNode:{keep:true}},nodeDef:{nodeType:'forms',name:'59行合成已保存表单',formDefId:'e',viewableRoleIds:['r'],formFieldIdsFill:['memo'],formFieldIdsReadOnly:fields.slice(1).map(f=>f._id)}}
 page.on('pageerror',e=>s.errors.push(e.message))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{s.unexpected.push(socket.url());socket.close()}})
 await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url())
 if(u.origin!==baseURL){s.unexpected.push(req.method()+' '+u.origin+u.pathname);return route.abort('blockedbyclient')}
 if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();s.unexpected.push(u.pathname);return route.abort('blockedbyclient')}
 const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown,status=200)=>route.fulfill({json,status});s.calls.push({path,body})
 if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-session',user:{_id:'u',name:'合成用户'},currentRole:{_id:'r',name:'合成角色'},capabilityNames:[]}})
 if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
 if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
 if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
 if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:s.type,colName:s.colName})
 if(path==='biz/extField/query'){const p=Number(body.page),size=Number(body.rows),rows=fields.map(f=>({...f,colName:s.colName})).slice((p-1)*size,p*size);return ok({data:rows,total:fields.length,page:p,size,dataCount:rows.length})}
 if(path==='biz/extForm/query/e'){const data=structuredClone(s.record);if(s.colName==='serviceAppointment')delete data.phone;const rows=!body['is:_id|string#and']||body['is:_id|string#and']==='v'?[data]:[];return ok({data:rows,total:rows.length,page:Number(body.page),size:Number(body.rows),dataCount:rows.length})}
 if(path==='biz/extForm/upsert/e'){s.writes.push(path);const data=JSON.parse(body.dataStr!);s.payloads.push(structuredClone(data));s.record=data;if(s.afterType)s.type='1';return s.unknownAck?ok({success:false,message:'synthetic unknown ACK'},503):ok({success:true,status:1,data:{_id:'v'}})}
 if(path==='workflowNode/updateExts/n'){s.writes.push(path);node.exts=JSON.parse(req.postData()!) as any;return ok({success:true,status:1})}
 if(path==='code/query'||path==='biz/action/query.do')return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20,dataCount:0})
 s.unexpected.push(path);return route.abort('blockedbyclient')
 });return s
}
const read=(p:Page)=>p.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})
const input=(p:Page)=>p.getByTestId('r1-normal-input-memo').getByRole('textbox')
async function open(p:Page){await p.goto('/#/pages/index/index');await p.locator('.launch-cta').click();await p.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(p.locator('.home-page')).toBeVisible();await p.locator('.work-orders-entry').click();await p.locator('.work-order-card').click();await read(p).click();await expect(p.getByTestId('r1-normal-form-record')).toHaveCount(1)}
const safe=(s:Awaited<ReturnType<typeof fixture>>)=>{expect(s.unexpected).toEqual([]);expect(s.errors).toEqual([]);expect(s.writes.some(p=>/process|upload/.test(p))).toBe(false)}
test('normal App generic edit preserves the exact JSON original and both independent titles',async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);await open(page);const before=structuredClone(s.record)
 await page.getByTestId('r1-normal-edit-v').click();await input(page).fill('  new value  ');await page.getByTestId('r1-normal-save').click();await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
 expect(s.record).toEqual({...before,memo:'new value',smodule:'serviceAppointment',exts:{...before.exts,memo:'new value'}})
 expect(s.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
 await page.reload();await open(page);await page.getByTestId('r1-normal-edit-v').click();await expect(input(page)).toHaveValue('new value')
 safe(s);await info.attach('synthetic-generic-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
for(const kind of ['typed','privacy'] as const)test(`normal App ${kind} records stay read-only despite matching edit grant`,async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);if(kind==='typed'){s.type='1';s.record._class='generic'}else{s.colName='serviceAppointment';s.record.phone='00000000000'}
 await open(page);await expect(page.getByTestId('r1-normal-edit-v')).toHaveCount(0);expect(s.writes).toEqual([]);safe(s)
 await info.attach('synthetic-generic-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
test('fresh type drift rejects before dispatch and explicit reread restores the draft',async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);await open(page);await page.getByTestId('r1-normal-edit-v').click();await input(page).fill('recover draft');s.type='1';await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成');expect(s.writes).toEqual([])
 s.type='0';await read(page).click();await expect(input(page)).toHaveValue('recover draft');await page.getByTestId('r1-normal-save').click();await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(s.writes).toHaveLength(2);safe(s)
 await info.attach('synthetic-generic-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
for(const kind of ['post-type','unknown-ack'] as const)test(`normal App ${kind} stops the second write and retains persistent uncertainty`,async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);await open(page);await page.getByTestId('r1-normal-edit-v').click();await input(page).fill('uncertain');if(kind==='post-type')s.afterType=true;else s.unknownAck=true;await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成');expect(s.writes).toEqual(['biz/extForm/upsert/e'])
 s.type='0';s.afterType=false;s.unknownAck=false;await page.reload();await open(page);await expect(page.getByTestId('r1-normal-edit-v')).toHaveCount(0);await expect(page.getByTestId('r1-normal-save')).toHaveCount(0);expect(s.writes).toHaveLength(1);safe(s)
 await info.attach('synthetic-generic-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
