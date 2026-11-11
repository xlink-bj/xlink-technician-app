import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

test.skip(process.env.XLINK_H5_CONFIGURED_FILE_CREATE !== 'true', 'Opt-in synthetic normal App configurations')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGOUq7j0nwEJMDGgAcICAJ0wAm/4ZvM3AAAAAElFTkSuQmCC','base64')
const pngSha = createHash('sha256').update(png).digest('hex')

for (const scenario of ['map-three-mixed','typed-renamed','wrong-root-ack','unsupported-root'] as const) {
  test(`normal configured files ${scenario}`, async ({ page, baseURL }, info) => {
    const typed = scenario === 'typed-renamed'||scenario==='unsupported-root', badAck = scenario === 'wrong-root-ack'
    const tenant='synthetic-media-tenant', actor='synthetic-media-user', role='synthetic-media-role', def='synthetic-media-def'
    const col = typed ? 'survey' : 'syntheticOrdinaryForm', imageOrigin='https://synthetic-configured-media.invalid'
    const config = typed ? [
      { id:'f4', key:'followup', type:'text', preset:0, required:'0' },
      { id:'f0', key:scenario==='unsupported-root'?'undeclaredRoot':'arbitrarySnapshots', type:'file', preset:scenario==='unsupported-root'?1:0, required:'0', max:1 },
      { id:'f2', key:'caption', type:'text', preset:0, required:'1' },
      { id:'f1', key:'memo', type:'text', preset:1, required:'0' },
      { id:'f3', key:'measuredCount', type:'number', preset:0, required:'1' },
    ] : [
      { id:'f0', key:'captureNorth', type:'file', preset:1, required:'1', max:1 },
      { id:'f1', key:'caption', type:'text', preset:0, required:'0' },
      { id:'f2', key:'proofWest', type:'file', preset:0, required:'1', max:3 },
      { id:'f3', key:'measuredCount', type:'number', preset:1, required:'1' },
      { id:'f4', key:'assetView', type:'file', preset:1, required:'0', max:3 },
    ]
    const fields=config.map((f,i)=>({_id:f.id,tenantId:tenant,extId:def,colName:col,name:f.key,nameDisp:`合成配置 ${f.key}`,state:1,
      type:f.type,preset:f.preset,required:f.required,multiple:false,showList:['1','2','4'],showType:'1',operationType:'1',showFieldPreset:0,
      exts:{},showField:'',showValue:'',calculateConfig:'',frontEndConfig:JSON.stringify(f.type==='file'?{max:f.max}:{}) ,order:i}))
    const work={_id:'synthetic-media-work',tenantId:tenant,orderNum:'SYNTHETIC-CONFIGURED-FILES',workflowId:'synthetic-media-run',state:1,status:105,serviceType:'40',name:'合成配置驱动表单',exts:{sourceType:''}}
    const node={_id:'synthetic-media-node',tenantId:tenant,workflowId:work.workflowId,workflowFormDataId:work._id,workflowFormColName:'serviceAppointment',state:0,handlerIds:[role],nodeDef:{nodeType:'repeat',name:'配置表单',formDefId:def,viewableRoleIds:[role],formFieldIdsFill:['f0','f1','f2','f3','f4'],formFieldIdsReadOnly:[]}}
    const ledger:{kind:string;path?:string;key?:string;imageSha?:string;values?:unknown}[]=[],unexpected:string[]=[],errors:string[]=[]
    let saved:Record<string,any>|null=null, pendingKey='', tokens=0, uploads=0, upserts=0
    page.on('pageerror', e=>errors.push(e.message))
    await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();else{unexpected.push('WS');socket.close()}})
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),ok=(json:unknown)=>route.fulfill({json})
      if(url.origin==='https://up-z1.qiniup.com'&&req.method()==='POST'){
        const body=req.postDataBuffer()!;expect(body).toBeTruthy();expect(body.includes(png)).toBe(true)
        expect(body.toString('latin1')).toContain(`name="key"\r\n\r\n${pendingKey}\r\n`)
        expect(body.toString('latin1')).toContain('Content-Type: image/png')
        const boundary=/boundary=(?:"([^"]+)"|([^;]+))/.exec(req.headers()['content-type']??'')
        expect(boundary).toBeTruthy()
        const filePart=body.toString('latin1').split('--'+(boundary![1]??boundary![2])).find(part=>/name="file"/.test(part))!
        expect(filePart).toBeTruthy()
        const actualFile=Buffer.from(filePart.slice(filePart.indexOf('\r\n\r\n')+4,-2),'latin1')
        const actualSha=createHash('sha256').update(actualFile).digest('hex')
        expect(actualFile).toEqual(png);expect(actualSha).toBe(pngSha)
        uploads++;ledger.push({kind:'actual-uni-multipart-intercepted',key:pendingKey,imageSha:actualSha})
        return ok({key:pendingKey,hash:'synthetic-intercepted-no-external-storage'})
      }
      if(url.origin===imageOrigin&&req.method()==='GET')return route.fulfill({contentType:'image/png',body:png})
      if(url.origin!==baseURL){unexpected.push(req.method()+' '+url.origin);return route.abort('blockedbyclient')}
      if(!url.pathname.startsWith('/xlink/wm/')){
        if(req.method()==='GET'&&!['fetch','xhr'].includes(req.resourceType()))return route.continue()
        unexpected.push(url.pathname);return route.abort('blockedbyclient')
      }
      const path=url.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??''))
      ledger.push({kind:'synthetic-api',path});if(req.method()!=='POST'){unexpected.push(path);return route.abort()}
      if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-configured-only',user:{_id:actor},currentRole:{_id:role},capabilityNames:[]}})
      if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
      if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:work}],total:1,page:1,rows:20})
      if(path==='basic/serviceAppointment/queryById/'+work._id)return ok({success:true,status:1,data:{serviceAppointment:work,workflow:{_id:work.workflowId,tenantId:tenant,formDataId:work._id,state:0},workflowNode:[node]}})
      if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20,dataCount:0})
      if(path==='biz/ext/queryById.do')return ok({_id:def,tenantId:tenant,type:typed?'1':'0',state:1,colName:col,preScriptContent:'',scriptContent:''})
      if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:50,dataCount:fields.length})
      if(path==='back/super/file/upToken.do'){tokens++;pendingKey=`synthetic-configured-${tokens}.png`;return ok({token:'synthetic-not-live',key:pendingKey})}
      if(path==='biz/extForm/upsert/'+def){
        const values=JSON.parse(body.dataStr);expect(saved).toBeNull();expect(values).not.toHaveProperty('_id');upserts++
        saved={...values,_id:'synthetic-configured-record',tenantId:tenant}
        if(typed)for(const f of config)if(!['memo'].includes(f.key))delete saved![f.key]
        ledger.push({kind:'create',values:structuredClone(saved)})
        const ack=structuredClone(saved!);if(badAck)ack.proofWest=[{...ack.exts.proofWest[0],name:'conflicting-shadow.png'}]
        return ok({success:true,status:1,data:ack})
      }
      if(path==='biz/extForm/query/'+def)return ok({data:saved?[saved]:[],total:saved?1:0,page:1,size:Number(body.rows),dataCount:saved?1:0})
      unexpected.push(path);return route.abort('blockedbyclient')
    })
    try {
    await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click()
    await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click();const card=page.locator('.work-order-card');await expect(card).toHaveAttribute('aria-disabled','false');await card.click()
    const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})
    await read().click()
    if(scenario==='unsupported-root'){
      await expect(page.getByTestId('r1-normal-file-unavailable')).toContainText('尚不支持新增图片')
      await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
      await expect(page.locator('[data-testid^="r1-normal-file-add-"]')).toHaveCount(0)
      expect(tokens).toBe(0);expect(uploads).toBe(0);expect(upserts).toBe(0);expect(unexpected).toEqual([]);expect(errors).toEqual([])
      return
    }
    await expect(page.getByTestId('r1-normal-save')).toBeVisible();await expect(page.getByTestId('r1-normal-complete')).toHaveCount(0)
    for(const f of config){
      if(f.type==='file'){
        const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByTestId('r1-normal-file-add-'+f.key).click()])
        await chooser.setFiles({name:'synthetic-'+f.key+'.png',mimeType:'image/png',buffer:png})
        await expect(page.getByTestId('r1-normal-file-preview-'+f.key)).toBeVisible()
      }else await page.getByTestId('r1-normal-input-'+f.key).locator('input,textarea').fill(f.type==='number'?'7':'synthetic '+f.key)
    }
    await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false')
    await page.getByTestId('r1-normal-save').click()
    if(badAck){await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('结果尚未核实');expect(upserts).toBe(1)}
    else{
      await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
      await page.goto('/#/pages/work-orders/work-orders');await expect(card).toHaveAttribute('aria-disabled','false');await card.click();await read().click()
      await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
      for(const f of config)if(f.type==='file')await expect(page.getByTestId('r1-normal-form-record').getByTestId('r1-normal-file-preview-'+f.key)).toBeVisible()
      await expect(page.getByTestId('r1-normal-file-add-'+config.find(f=>f.type==='file')!.key)).toHaveCount(0)
    }
    expect(upserts).toBe(1);expect(tokens).toBe(typed?1:3);expect(uploads).toBe(tokens)
    expect(ledger.filter(x=>x.path&&/Process|updateExts|delete/.test(x.path))).toEqual([])
    expect(unexpected).toEqual([]);expect(errors).toEqual([])
    } finally {
    await info.attach('configured-ledger',{body:JSON.stringify({scenario,ledger,tokens,uploads,upserts,externalNetwork:0,realJava:false}),contentType:'application/json'})
    await page.screenshot({path:info.outputPath('configured-'+scenario+'.png'),fullPage:true}).catch(()=>{})
    }
  })
}
