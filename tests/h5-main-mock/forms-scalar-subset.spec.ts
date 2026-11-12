import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import { test,expect,type Page } from '@playwright/test'
test.skip(process.env.XLINK_H5_FORMS_SCALAR_SUBSET!=='true','Explicit loopback synthetic scalar-subset grant only')
async function fixture(page:Page,baseURL:string){

 const state={calls:[] as string[],writes:[] as string[],unexpected:[] as string[],errors:[] as string[],rows:[] as any[],revoke:false}
 const fields=[{_id:'area',name:'area',nameDisp:'Measured scalar',type:'digit',required:1,readOnly:0,preset:0},
 ...Array.from({length:58},(_,i)=>({_id:'ro-'+i,name:'protected'+i,nameDisp:'Protected '+i,type:'text',required:1,readOnly:1,preset:1}))].map(f=>({...f,extId:'e',tenantId:'t',state:1}))
 const sa={_id:'s',tenantId:'t',orderNum:'SCALAR-SYNTHETIC',workflowId:'w',state:1,status:105,name:'合成标量验证',serviceType:'40',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],audit:{keep:true}},
 nodeDef:{nodeType:'forms',name:'合成59行标量子集',formDefId:'e',viewableRoleIds:['r'],formFieldIdsFill:['area'],formFieldIdsReadOnly:fields.slice(1).map(f=>f._id)}}
 page.on('pageerror',e=>state.errors.push(e.message))
 await page.routeWebSocket('**/*',s=>{if(new URL(s.url()).host===new URL(baseURL).host)s.connectToServer();else{state.unexpected.push(s.url());s.close()}})
 await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url())
 if(url.origin!==baseURL){state.unexpected.push(url.origin+url.pathname);return route.abort('blockedbyclient')}
 if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push(url.pathname);return route.abort('blockedbyclient')}
 const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json})
 state.calls.push(path)
 if(path==='index/phoneLogin.do')return ok({status:1,success:true,data:{token:'synthetic-session',user:{_id:'u',name:'合成用户'},currentRole:{_id:'r',name:'合成角色'},capabilityNames:[]}})
 if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
 if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
 if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
 if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'1',colName:'survey'})
 if(path==='biz/extField/query'){const p=Number(body.page),size=Number(body.rows),rows=fields.map(f=>state.revoke&&f._id==='area'?{...f,readOnly:1}:f).slice((p-1)*size,p*size);return ok({data:rows,total:59,page:p,size,dataCount:rows.length})}
 if(path==='biz/extForm/query/e'){const rows=state.rows.filter(r=>!body['is:_id|string#and']||body['is:_id|string#and']===r._id);return ok({data:rows,total:rows.length,page:Number(body.page),size:Number(body.rows),dataCount:rows.length})}
 if(path==='biz/extForm/upsert/e'){state.writes.push(path);const data=JSON.parse(body.dataStr!);state.rows=[{...data,tenantId:'t',formDefId:'e',_id:data._id??'created'}];return ok({status:1,success:true,data:{_id:'created'}})}
 if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!) as any;return ok({status:1,success:true})}
 if(path==='code/query'||path==='biz/action/query.do')return ok({data:[],total:0,page:Number(body.page)||1,rows:Number(body.rows)||20,dataCount:0})
 state.unexpected.push(path);return route.abort('blockedbyclient')
 })
 return state
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-input-area')).toBeVisible()}
test('normal App creates from 59 metadata rows and reads the exact server record without Process',async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);await open(page)
 await expect(page.getByTestId('r1-normal-input-protected0')).toHaveCount(0)
 await page.getByTestId('r1-normal-input-area').locator('input').fill('12.5');await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
 expect(s.rows[0]).toMatchObject({_id:'created',area:12.5,exts:{area:12.5}})
 expect(s.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n']);expect(s.unexpected).toEqual([]);expect(s.errors).toEqual([])
 await info.attach('synthetic-request-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
test('fresh metadata revocation prevents the first write through the normal App',async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);await open(page);await page.getByTestId('r1-normal-input-area').locator('input').fill('12.5');s.revoke=true;await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成')
 expect(s.writes).toEqual([]);expect(s.unexpected).toEqual([]);expect(s.errors).toEqual([])
 await info.attach('synthetic-request-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
test('normal App keeps existing large-schema records read-only even with an edit grant',async({page,baseURL},info)=>{
 const s=await fixture(page,baseURL!);await open(page)
 await page.getByTestId('r1-normal-input-area').locator('input').fill('2');await page.getByTestId('r1-normal-save').click()
 await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
 // Ext is deliberately typed while field rows omit colName. This must not
 // turn an unclassified display purpose into non-typed edit authority.
 s.rows[0]._class='com.fsgo.entity.basic.Survey';s.rows[0].unknownRoot={retain:[0,false]}
 await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click()
 await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
 await expect(page.getByTestId('r1-normal-edit-created')).toHaveCount(0)
 expect(s.rows[0]).toMatchObject({area:2,_class:'com.fsgo.entity.basic.Survey',unknownRoot:{retain:[0,false]}})
 expect(s.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
 expect(s.unexpected).toEqual([]);expect(s.errors).toEqual([])
 await info.attach('synthetic-request-evidence',{body:JSON.stringify(s),contentType:'application/json'})
})
