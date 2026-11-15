import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import{test,expect}from'@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
test.skip(process.env.XLINK_H5_SURVEY_FIRST_MEDIA_SAVE!=='true','Explicit fully intercepted synthetic typed media run only')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGOUq7j0nwEJMDGgAcICAJ0wAm/4ZvM3AAAAAElFTkSuQmCC','base64')
const cases=[{scenario:'success',width:430},{scenario:'ack-conflict',width:430},{scenario:'upload-failure',width:430},{scenario:'success',width:375},{scenario:'upload-failure',width:375}] as const
for(const {scenario,width} of cases)test(`normal App typed first media ${scenario} at ${width}`,async({page,baseURL},info)=>{
 await page.setViewportSize({width,height:width===430?932:667})
 const brand=selectBrand(process.env.VITE_XLINK_BRAND).id
 const actor='synthetic-media-user',role='synthetic-media-role',tenant='synthetic-media-tenant',definition='synthetic-media-def',origin='https://synthetic-survey-media.invalid'
 const sa={_id:'synthetic-media-work',tenantId:tenant,orderNum:'19017',workflowId:'synthetic-media-run',state:1,status:105,serviceType:'40',name:'邓先生',exts:{sourceType:''}}
 const node={_id:'synthetic-media-node',tenantId:tenant,workflowId:sa.workflowId,workflowFormDataId:sa._id,workflowFormColName:'serviceAppointment',state:0,handlerIds:[role],nodeDef:{nodeType:'repeat',name:'现场图片',formDefId:definition,viewableRoleIds:[role],formFieldIdsFill:['infrared','images'],formFieldIdsReadOnly:[]}}
 const fields=['infraredImageList','images1'].map((name,i)=>({_id:i?'images':'infrared',tenantId:tenant,extId:definition,colName:'survey',name,nameDisp:i?'现场照片':'红外照片',state:1,enabled:1,type:'file',required:i?'1':'0',readOnly:0,preset:i?0:1,multiple:false,showList:['1','2','4'],showType:'1',operationType:'1',showFieldPreset:0,exts:{},showField:'',showValue:'',calculateConfig:'',frontEndConfig:JSON.stringify({max:i?10:4})}))
 let saved:any=null,pendingKey='',tokens=0,uploads=0;const writes:string[]=[],unexpected:string[]=[],errors:string[]=[],recordReads:any[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('external websocket');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());const ok=(json:unknown)=>route.fulfill({json})
  // No route.fetch: neither Qiniu nor an external resource receives traffic.
  // Upload adapter and owned queue run normally against wholly synthetic responses.
  if(url.origin==='https://up-z1.qiniup.com'&&req.method()==='POST'){uploads++;if(scenario==='upload-failure'&&uploads===1)return route.fulfill({status:503,json:{error:'Synthetic upload temporarily unavailable'}});return ok({key:pendingKey,hash:'synthetic-no-remote-upload'})}
  if(url.origin===origin&&req.method()==='GET')return route.fulfill({contentType:'image/png',body:png})
  if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin);return route.abort()}
  if(!url.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();unexpected.push(url.pathname);return route.abort()}
  const path=url.pathname.slice('/xlink/wm/'.length),b=Object.fromEntries(new URLSearchParams(req.postData()??''));if(req.method()!=='POST'){unexpected.push(path);return route.abort()}
  if(isWorkOrderInformationRead(req,baseURL!))return route.fulfill({status:503,json:{success:false,message:'Synthetic information configuration unavailable'}})
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-no-live-authority',user:{_id:actor,name:'王师傅'},currentRole:{_id:role,name:'技师'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/'+sa._id)return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:sa.workflowId,tenantId:tenant,formDataId:sa._id,state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20,dataCount:0})
  if(path==='biz/ext/queryById.do'&&b.id===definition)return ok({_id:definition,tenantId:tenant,type:'1',state:1,colName:'survey'})
  if(path==='biz/extField/query'&&b.extId===definition)return ok({data:fields.map(({enabled,readOnly,...field})=>field),total:2,page:1,size:50,dataCount:2})
  if(path==='back/super/file/upToken.do'){pendingKey=`synthetic-photo-${++tokens}.png`;return ok({token:'synthetic-no-remote-authority',key:pendingKey})}
  if(path==='biz/extForm/upsert/'+definition){const data=JSON.parse(b.dataStr);expect(saved).toBeNull();expect(data).not.toHaveProperty('_id');expect(data).toMatchObject({sid:sa._id,nodeId:node._id,workflowId:sa.workflowId,state:1});writes.push(path)
   // Unit/source-equivalent synthetic DTO construction, not actual Java proof.
   saved={...data,_id:'synthetic-typed-media-record',tenantId:tenant};delete saved.images1;const ack=structuredClone(saved);if(scenario==='ack-conflict')ack.images1=ack.exts.images1;return ok({success:true,status:1,data:ack})}
  if(path==='biz/extForm/query/'+definition){if(saved)recordReads.push({id:saved._id,exact:JSON.stringify(saved)});return ok({data:saved?[saved]:[],total:saved?1:0,page:1,size:Number(b.rows),dataCount:saved?1:0})}
  unexpected.push(path);return route.abort()
 })
 const shot=async(name:string)=>{
  const dir=process.env.XLINK_MEDIA_REVIEW_DIR
  if(dir)await mkdir(dir,{recursive:true})
  await expect(page.locator('.app-button--pressed,.app-button__loading-slot--active')).toHaveCount(0)
  await page.screenshot({path:dir?resolve(dir,scenario+'-'+width+'-'+name+'.png'):info.outputPath(name+'.png'),animations:'disabled',caret:'hide'})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
 }
 const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})
 await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read().click()
 await expect(page.getByTestId('r1-normal-file-add-infraredImageList')).toBeVisible();await expect(page.getByTestId('r1-normal-complete')).toHaveCount(0)
 await shot('empty')
 if(brand==='yuhong')await expect(page.locator('.r1-file-field').first()).toHaveCSS('font-size','16px')
 for(const key of ['infraredImageList','images1']){
  const choose=async()=>{
   const[chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByTestId('r1-normal-file-add-'+key).click()])
   await chooser.setFiles({name:key+'.png',mimeType:'image/png',buffer:png})
  }
  await choose()
  if(scenario==='upload-failure'&&key==='infraredImageList'){
   await expect(page.getByTestId('r1-normal-file-retry-'+key)).toBeVisible()
   if(brand==='yuhong'){
    const add=await page.getByTestId('r1-normal-file-add-'+key).boundingBox()
    const retry=await page.getByTestId('r1-normal-file-retry-'+key).boundingBox()
    const discard=await page.getByTestId('r1-normal-file-discard-'+key).boundingBox()
    expect(retry!.y).toBeGreaterThanOrEqual(add!.y+add!.height)
    expect(discard!.y).toBe(retry!.y)
    expect(retry!.width).toBeGreaterThanOrEqual(120)
    expect(discard!.width).toBeGreaterThanOrEqual(120)
   }
   await shot('upload-failure')
   await page.getByTestId('r1-normal-file-retry-'+key).click()
   await expect(page.getByTestId('r1-normal-file-status-'+key)).toContainText('不可重试')
   expect(uploads).toBe(1)
   await page.getByTestId('r1-normal-file-discard-'+key).click()
   await expect(page.getByTestId('r1-normal-file-add-'+key)).toHaveAttribute('aria-disabled','false')
   await choose()
  }
  await expect(page.getByTestId('r1-normal-file-preview-'+key)).toBeVisible()
  if(brand==='yuhong'){
   await expect(page.getByTestId('r1-normal-file-preview-'+key)).toHaveCSS('border-radius','4px')
   expect((await page.getByTestId('r1-normal-file-remove-'+key+'-0').boundingBox())?.height).toBeGreaterThanOrEqual(44)
  }
 }
 await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false');await shot('uploaded');await page.getByTestId('r1-normal-save').click()
 if(scenario!=='ack-conflict'){
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
  await page.goto('/#/pages/work-orders/work-orders');await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read().click();await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1);await expect(page.getByTestId('r1-normal-file-add-images1')).toHaveCount(0);expect(recordReads.length).toBeGreaterThanOrEqual(4)
 }else{await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('结果尚未核实');expect(writes).toHaveLength(1)}
 await shot('readback');expect(writes).toEqual(['biz/extForm/upsert/'+definition]);expect(tokens).toBe(scenario==='upload-failure'?3:2);expect(uploads).toBe(scenario==='upload-failure'?3:2);expect(unexpected).toEqual([]);expect(errors).toEqual([])
 await info.attach('scoped-ledger',{body:JSON.stringify({scenario,writes,tokens,syntheticUploadResponses:uploads,externalNetworkFetches:0,recordReads:recordReads.length,realJava:false}),contentType:'application/json'})
})
