import { expect, test } from '@playwright/test'

test('normal App displays bounded configured information, safe fallback and isolated object switching', async ({ page, baseURL }, info) => {
  const origin=baseURL!, calls:{path:string;body:Record<string,string>}[]=[], unexpected:string[]=[], errors:string[]=[]
  const field=(name:string,extra:Record<string,unknown>={})=>({_id:'field-'+name,name,nameDisp:name,colName:'serviceAppointment',tenantId:'synthetic-authority',state:1,preset:0,type:'text',showList:['4'],order:0,...extra})
  let config:Record<string,unknown>={data:[]}, currentId='A', configFailure=false, preAccept=false, holdA=false, releaseA=()=>{}, markA=()=>{}
  const arrivedA=new Promise<void>(resolve=>{markA=resolve})
  const row=(id:string)=>({_id:id,name:'合成客户'+id,phone:'13800000000',orderNum:'SYNTHETIC-'+id,tenantId:'synthetic-authority',state:1,status:104,
    address:'合成地址',area:['440000','440300','440305'],gpsPoint:{longitude:'DO-NOT-EXPOSE-LNG',latitude:'DO-NOT-EXPOSE-LAT'},serviceType:'40',memo:'根部备注'+id,exts:{sourceType:'',area:[330000,330100,330106],memo:'扩展备注'+id,hidden:'不能展示的合成隐藏值',unknown:{secret:'不能展示的合成对象'}}})
  const configured=(data:unknown[])=>({data,total:data.length,page:1,size:200})
  page.on('pageerror',e=>errors.push(e.message))
  await page.routeWebSocket('**/*', socket=>{if(new URL(socket.url()).origin.replace('ws:','http:')===origin)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
  await page.route('**/*', async route=>{
    const request=route.request(),url=new URL(request.url())
    if(url.origin!==origin){unexpected.push(request.method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient')}
    if(!url.pathname.startsWith('/xlink/wm/')){
      if(request.method()==='GET'&&!['xhr','fetch'].includes(request.resourceType()))return route.continue()
      unexpected.push(request.method()+' '+url.pathname);return route.abort('blockedbyclient')
    }
    const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(request.postData()??''));calls.push({path,body})
    if(path==='index/phoneLogin.do')return route.fulfill({json:{status:1,success:true,data:{token:'synthetic-information-no-remote-authority',user:{_id:'synthetic-user',name:'合成验证'},currentRole:{_id:'synthetic-role',name:'合成角色'},capabilityNames:[]}}})
    // The DEV app's existing login/menu operation is fully intercepted. No actual role mutation is executed.
    if(path==='function/changeRole')return route.fulfill({json:{data:{functionList:[{order:0,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments'}]}}})
    if(path==='basic/serviceAppointment/query')return route.fulfill({json:{data:[row('A'),row('B')],total:2,page:1,rows:20}})
    if(path.startsWith('basic/serviceAppointment/queryById/')){currentId=path.split('/').at(-1)!;return route.fulfill({json:{status:1,success:true,data:{serviceAppointment:row(currentId),workflowNode:preAccept?[{_id:'synthetic-accept',state:0,nodeDef:{nodeType:'accept'}}]:[]}}})}
    if(path==='biz/extField/query'){
      if(configFailure)return route.fulfill({status:503,json:{message:'synthetic unavailable configuration'}})
      const response=structuredClone(config)
      if(holdA&&currentId==='A'){holdA=false;markA();await new Promise<void>(resolve=>{releaseA=resolve})}
      return route.fulfill({json:response})
    }
    if(path==='biz/action/query.do')return route.fulfill({json:{data:[]}})
    if(path==='code/query'&&body['is:type|string#and']==='STATUS')return route.fulfill({json:{data:[],total:0,page:Number(body.page),rows:Number(body.rows)}})
    unexpected.push(request.method()+' '+path);return route.abort('blockedbyclient')
  })
  const open=async(id='A')=>{await page.locator('.card-customer').filter({hasText:'合成客户'+id}).click();await expect(page.locator('.summary-customer')).toHaveText('合成客户'+id);await page.locator('.detail-tab').filter({hasText:'客户'}).click()}
  const back=async()=>{await page.goBack();await expect(page.locator('.work-orders-page')).toBeVisible()}
  try{
    await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click()
    await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await expect(page.locator('.card-customer')).toHaveCount(2)
    await open();await expect(page.locator('.customer-info-panel')).toContainText('客户姓名');await expect(page.getByTestId('configured-information-row')).toHaveCount(0)
    await page.screenshot({path:info.outputPath('before-verified-fallback-430x932.png'),fullPage:true});await back()
    config=configured([field('memo',{nameDisp:'后台新增备注',order:9}),field('name',{preset:1,nameDisp:'改名客户',order:0}),field('phone',{preset:1,type:'phone',nameDisp:'手机'}),field('hidden',{showList:['3']}),field('roleHidden',{roleIds:['synthetic-role'],nameDisp:'不能展示的角色字段'}),field('unknown',{type:'futureType',nameDisp:'未知字段'})])
    await open();const rows=page.getByTestId('configured-information-row')
    await expect(rows).toHaveCount(4);await expect(rows.locator('.row-label')).toHaveText(['后台新增备注','改名客户','手机','未知字段'])
    await expect(rows).toContainText(['扩展备注A','合成客户A','138****0000','该内容暂不支持展示'])
    await expect(page.locator('.customer-info-panel')).not.toContainText('13800000000');await expect(page.locator('.customer-info-panel')).not.toContainText('不能展示')
    await page.screenshot({path:info.outputPath('after-configured-430x932.png'),fullPage:true});await back()
    config=configured([field('memo',{preset:1,nameDisp:'重新排序后根备注'}),field('name',{preset:1,nameDisp:'再次改名'})])
    await open();await expect(rows.locator('.row-label')).toHaveText(['重新排序后根备注','再次改名']);await expect(rows.first()).toContainText('根部备注A');await back()
    config=configured([field('area',{preset:1,type:'area',nameDisp:'根区域'}),field('area',{_id:'ext-area',type:'area',nameDisp:'扩展区域'}),field('address',{preset:1,type:'map',nameDisp:'地图地址'})])
    await open();await expect(rows).toContainText(['广东省深圳市南山区','浙江省杭州市西湖区','合成地址'])
    await expect(page.locator('.customer-info-panel')).not.toContainText('DO-NOT-EXPOSE')
    await page.screenshot({path:info.outputPath('area-map-readonly-430x932.png'),fullPage:true});await back()
    config=configured([field('name',{preset:1,showList:['3']}),field('address',{preset:1,type:'map',frontEndConfig:{mpDetailHide:true}})])
    await open();await expect(rows).toHaveCount(0);await expect(page.locator('.customer-info-panel')).toContainText('暂无可展示资料')
    await expect(page.locator('.customer-info-panel')).not.toContainText('客户姓名');await expect(page.locator('.customer-info-panel')).not.toContainText('合成客户A')
    await page.screenshot({path:info.outputPath('all-configured-fields-hidden-430x932.png'),fullPage:true});await back()
    config=configured([]);await open();await expect(rows).toHaveCount(0);await expect(page.locator('.customer-info-panel')).toContainText('暂无可展示资料');await back()
    configFailure=true;await open();await expect(rows).toHaveCount(0);await expect(page.locator('.customer-info-panel')).toContainText('客户姓名');await back();configFailure=false
    config=configured([field('memo',{nameDisp:'切换字段'})]);holdA=true
    await page.locator('.card-customer').filter({hasText:'合成客户A'}).click();await arrivedA;await back();await open('B')
    await expect(rows).toContainText(['扩展备注B']);releaseA();await expect(page.locator('.summary-customer')).toHaveText('合成客户B');await expect(rows).toContainText(['扩展备注B'])
    await page.screenshot({path:info.outputPath('B-after-late-A-430x932.png'),fullPage:true})
    await back();preAccept=true;const readsBefore=calls.filter(c=>c.path==='biz/extField/query').length
    await page.locator('.card-customer').filter({hasText:'合成客户A'}).click();await expect(page.getByText('工单待接单',{exact:true})).toBeVisible()
    await expect(rows).toHaveCount(0);await expect(page.locator('.detail-content')).toHaveCount(0)
    expect(calls.filter(c=>c.path==='biz/extField/query')).toHaveLength(readsBefore)
    expect(errors).toEqual([]);expect(unexpected).toEqual([])
    const metadata=calls.filter(c=>c.path==='biz/extField/query');expect(metadata.length).toBeGreaterThan(4)
    for(const call of metadata)expect(call.body).toEqual({colName:'serviceAppointment','is:state|integer#and':'1',sortField:'order',sortOrder:'asc',page:'1',size:'200'})
    expect(calls.filter(c=>/save|upsert|upload|process|delete/i.test(c.path))).toEqual([])
  }finally{releaseA();await info.attach('information-read-ledger',{body:JSON.stringify({calls,unexpected,errors,realBackend:'NOT_RUN',businessWrites:0},null,2),contentType:'application/json'})}
})
