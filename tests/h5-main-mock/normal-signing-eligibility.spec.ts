import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import {test,expect} from '@playwright/test'
// Real normal App navigation; all HTTP is closed synthetic transport. No signing/Contract API is opened.
for(const mode of ['verified','node-mismatch','late-logout'] as const)test('normal signing readonly eligibility '+mode,async({page,baseURL},info)=>{
 const calls:any[]=[],unexpected:string[]=[],errors:string[]=[];let detailReads=0,logins=0,hold=false,release!:()=>void,arrived!:()=>void
 const held=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r)
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',orderNum:'SYNTHETIC-SIGN',name:'合成工单',exts:{sourceType:'4'}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['u'],nodeDef:{nodeType:'placeOrder',name:'下单',viewableRoleIds:['r','r2']}}
 const order={_id:'o',serviceAppointmentId:'s',tenantId:'t',type:1,state:1,processState:0,orderNumber:'SYNTHETIC-ORDER',bjProducts:JSON.stringify({orderList:[]}),exts:{}}
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.routeWebSocket('**/*',s=>{if(new URL(s.url()).host===new URL(baseURL!).host)s.connectToServer();else{unexpected.push('WS');s.close()}})
 await page.route('**/*',async route=>{
    if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ json: { success: false, message: 'Synthetic information configuration unavailable' } })
  const req=route.request(),url=new URL(req.url());if(url.origin!==baseURL){unexpected.push(url.origin+url.pathname);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort('blockedbyclient')}
  const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''));calls.push({path,body});const ok=(json:unknown)=>route.fulfill({json})
  if(req.method()!=='POST'){unexpected.push(req.method());return route.abort('blockedbyclient')}
  if(path==='index/phoneLogin.do'){logins++;return ok({success:true,status:1,data:{token:'synthetic-session-'+logins,user:{_id:'u'},currentRole:{_id:logins>1?'r2':'r'},capabilityNames:[]}})}
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s'){detailReads++;if(hold){hold=false;arrived();await gate}return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[mode==='node-mismatch'&&detailReads>1?{...node,handlerIds:['foreign-user']}:node]}})}
  if(path==='basic/order/query'){expect(body['is:serviceAppointmentId|string#and']).toBe('s');expect(body['is:type|integer#and']).toBe('1');return ok({data:[order],total:1,page:1,rows:3})}
  if(['code/query','biz/action/query.do','biz/projPackage/queryWithRank','biz/procedure/queryWithRank','basic/material/queryWithRank','biz/measure/queryWithRank','i/code/selectCode','i/code/selectMultistageCode','i/code/selectMultistageCode.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  unexpected.push(path);return route.abort('blockedbyclient')
 })
 try{
  await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('quotation-hub-signing-o')).toBeVisible();await page.getByTestId('quotation-hub-signing-o').click();await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
  if(mode==='late-logout')hold=true
  await page.getByTestId('signing-handler-check').click()
  if(mode==='late-logout'){
   await held;await page.goBack();await page.goBack();await page.goBack();await page.goBack();await expect(page.locator('.home-page')).toBeVisible();await page.getByText('退出登录',{exact:true}).click();await expect(page.locator('.login-page')).toBeVisible();release();await expect(page.getByTestId('signing-eligibility')).toHaveCount(0)
   await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
   await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await page.locator('.primary-task-action').click()
   await expect(page.getByText('操作内容暂不可用',{exact:true})).toBeVisible();await expect(page.getByTestId('signing-eligibility')).toHaveCount(0)
   await page.locator('.workspace-state-action').filter({hasText:'返回工单详情'}).click();await expect(page).toHaveURL(/pages\/work-orders\/detail/);await page.locator('.primary-task-action').click()
   await page.getByTestId('quotation-hub-signing-o').click();await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
   await expect(page.getByTestId('signing-handler-reason')).toHaveCount(0);await expect(page.getByTestId('signing-eligibility-result')).toContainText('当前操作条件尚未确认，请重新读取订单信息。');expect(logins).toBe(2)

  }else{
   await expect(page.getByTestId('signing-handler-reason')).toContainText(mode==='verified'?'当前处理信息已核对。':'当前处理信息尚未确认，请重新读取订单信息。')
   await expect(page.getByTestId('signing-eligibility-result')).toContainText('当前操作条件尚未确认，请重新读取订单信息。')
   await expect(page.getByTestId('signing-eligibility-reason')).toHaveText(['如需更新，请重新读取当前订单后再核对。'])
   await expect(page.getByTestId('signing-eligibility')).not.toContainText(/handlerIds|R1|API|roleVersion|EXTS|生产合同|根槽/)
   expect(detailReads).toBeGreaterThanOrEqual(2)
  }
  await expect(page.getByTestId('signing-eligibility')).not.toContainText(/handlerIds|processState|exts\.|isAgain|\bAPI\b|\bR1\b|\bDEV\b|\bMock\b|fixture/i)
  expect(calls.filter(c=>/signature|contract|upsert|process|sendMessage|upload|pdf/i.test(c.path))).toEqual([]);expect(errors).toEqual([]);expect(unexpected).toEqual([])
 }finally{release();await info.attach('readonly-ledger',{body:JSON.stringify({mode,calls:calls.map(c=>c.path==='index/phoneLogin.do'?{path:c.path,body:{redacted:true}}:c),errors,unexpected,realBackend:false}),contentType:'application/json'})}
})
