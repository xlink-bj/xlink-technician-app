import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
import {test,expect,type Page} from '@playwright/test'
test.skip(process.env.XLINK_H5_ORDINARY_CREATE_PLAN!=='true','Opt-in synthetic ordinary per-field state and Code-array create; synthetic only')
async function fixture(page:Page,baseURL:string,mode:string){
 const state={uploads:0,pickers:0,saved:null as any,calls:[] as string[],writes:[] as string[],payloads:[] as any[],unexpected:[] as string[],errors:[] as string[]}
 const fields:any[]=[['flag','switch',false,1,true],['score','rate',false,0,true],['checks','checkbox',false,1,true],['multi','select',true,0,true],['note','text',false,0,false],['zero','number',false,1,false],['photo','file',false,0,mode!=='optional-file'],['path','cascade',false,1,true],['spare','select',true,0,false]].map(([name,type,multiple,preset,required],i)=>({_id:'field-'+i,name,nameDisp:name,type,multiple,preset,tenantId:'t',extId:'e',colName:'syntheticUnifiedRecord',state:1,required:required?'1':'0',readOnly:0,operationType:'1',showList:['4'],frontEndConfig:'{}',customizeFlag:1,showType:'1',...(['select','checkbox'].includes(String(type))?{valueOption:'SYN_CODES'}:type==='cascade'?{valueOption:'SYN_TREE'}:{})}))
 const group:any={_id:'G',type:'SYN_TREE',tenantId:'t',children:[{_id:'N',value:'same',name:'Root',parentId:'G',type:'SYN_TREE',children:[{_id:'B',value:'same',name:'Branch',parentId:'N',type:'SYN_TREE',children:[{_id:'L',value:'leaf',name:'Leaf',parentId:'B',type:'SYN_TREE',children:[]}]}]},{_id:'R',value:'root-leaf',name:'RootLeaf',parentId:'G',type:'SYN_TREE',children:[]}]}
 const codes={a:'合成甲',b:'合成乙',c:'合成丙'}
 if(mode==='hide-owned-file')Object.assign(fields.find(f=>f.type==='file')!,{showType:'3',showField:'note',showValue:'on',showFieldPreset:0})
 if(mode==='renamed'){fields.reverse();for(const f of fields)f.name=f.nameDisp='other_'+f.name}
 const sa={_id:'s',tenantId:'t',workflowId:'w',state:1,status:203,serviceType:'40',name:'合成普通开关评分',orderNum:'SYNTHETIC-ORDINARY-CREATE',exts:{sourceType:''}}
 const node={_id:'n',tenantId:'t',workflowId:'w',workflowFormDataId:'s',workflowFormColName:'serviceAppointment',state:0,handlerIds:['r'],exts:{formList:[],unknownNode:{keep:[0,false]}} as any,nodeDef:{nodeType:'forms',name:'合成配置新建',formDefId:'e',formFieldIdsFill:fields.map(f=>f._id),formFieldIdsReadOnly:[]}}
 page.on('filechooser',()=>state.pickers++)
 page.on('pageerror',()=>state.errors.push('pageerror'))
 await page.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();else{state.unexpected.push('external-websocket');socket.close()}})
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin==='https://up-z1.qiniup.com'&&req.method()==='POST'){state.uploads++;const response=await route.fetch({url:'http://127.0.0.1:5338/upload',maxRedirects:0});return route.fulfill({response})}
  if(u.origin==='https://synthetic-normal-r1-file.invalid'&&u.pathname==='/objects/normal-r1-photo.png'){const response=await route.fetch({url:'http://127.0.0.1:5338'+u.pathname,maxRedirects:0});return route.fulfill({response})}
  if(u.origin!==baseURL){state.unexpected.push('external');return route.abort()}
  if(!u.pathname.startsWith('/xlink/wm/')){if(req.method()==='GET'&&!['xhr','fetch'].includes(req.resourceType()))return route.continue();state.unexpected.push('unexpected local');return route.abort()}
  const path=u.pathname.slice('/xlink/wm/'.length),body=Object.fromEntries(new URLSearchParams(req.postData()??'')),ok=(json:unknown)=>route.fulfill({json});state.calls.push(path)
  if(path==='index/phoneLogin.do')return ok({success:true,status:1,data:{token:'synthetic-mixed-session',user:{_id:'u',tenantId:'t'},currentRole:{_id:'r'},capabilityNames:[]}})
  if(['function/changeRole','function/queryTreeByRoleId'].includes(path))return ok({data:{functionList:[{functionList:[{order:1,exts:{tabDisplay:'1'},action:'/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0'}]}]}})
  if(['basic/serviceAppointment/query','basic/serviceAppointment/querySAWorkflowNode'].includes(path))return ok({data:[{...node,data:sa}],total:1,page:1,rows:20})
  if(path==='basic/serviceAppointment/queryById/s')return ok({success:true,status:1,data:{serviceAppointment:sa,workflow:{_id:'w',tenantId:'t',formDataId:'s',state:0},workflowNode:[node]}})
  if(['code/query','biz/action/query.do'].includes(path))return ok({data:[],total:0,page:1,rows:20})
  if(path==='biz/ext/queryById.do')return ok({_id:'e',tenantId:'t',state:1,type:'0',colName:'syntheticUnifiedRecord'})
  if(path==='biz/extField/query')return ok({data:fields,total:fields.length,page:1,size:Number(body.rows)})
  if(path==='back/super/file/upToken.do')return ok({token:'synthetic-no-remote-authority',key:'normal-r1-photo.png'})
  if(path==='i/code/selectMultistageCode.do')return ok([group])
  if(path==='i/code/selectCode.do')return ok([{codeId:'SYN_CODES',eleid:'SYN_CODES',options:codes}])
  if(path==='biz/extForm/query/e')return ok({data:state.saved?[state.saved]:[],total:state.saved?1:0,page:1,size:Number(body.rows),dataCount:state.saved?1:0})
  if(path==='biz/extForm/upsert/e'){
   state.writes.push(path);state.saved={...JSON.parse(body.dataStr!),_id:'saved',tenantId:'t'};state.payloads.push(structuredClone(state.saved));if(mode==='wrong-ack')state.saved.exts[mixedKey(fields,'multi')]=['c']
   return ok({success:true,status:1,data:state.saved})
  }
  if(path==='workflowNode/updateExts/n'){state.writes.push(path);node.exts=JSON.parse(req.postData()!);return ok({success:true,status:1})}
  state.unexpected.push(path);return route.abort()
 })
 return{state,fields,codes,group}
}
async function open(page:Page){await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'}).click();await expect(page.getByTestId('r1-normal-create')).toBeVisible()}



const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGOUq7j0nwEJMDGgAcICAJ0wAm/4ZvM3AAAAAElFTkSuQmCC','base64')
function mixedKey(fields:any[],key:string){return fields.find(f=>f.name===key||f.name==='other_'+key)!.name}
for(const mode of ['save-double','renamed','optional-file','wrong-ack','permission-drift','tree-drift','hide-owned-file'])test(`ordinary configured field plan ${mode}`,async({page,baseURL,request},info)=>{
 const {state,fields,codes,group}=await fixture(page,baseURL!,mode),key=(name:string)=>mixedKey(fields,name),field=(name:string)=>page.getByTestId('r1-normal-input-'+key(name))
 try{
  await open(page)
  await field('note').getByRole('textbox').fill(mode==='hide-owned-file'?'on':' configured form ');await field('zero').getByRole('spinbutton').fill('0')
  await field('flag').locator('.app-choice').filter({hasText:'否'}).click();await field('score').locator('[aria-label="4 星"]').click()
  await field('checks').locator('.app-choice--multi').filter({hasText:'合成乙'}).click();await field('checks').locator('.app-choice--multi').filter({hasText:'合成甲'}).click()
  await field('multi').locator('.app-choice--multi').filter({hasText:'合成甲'}).click();await field('multi').locator('.app-choice--multi').filter({hasText:'合成丙'}).click()
  await field('path').locator('.app-choice--multi').filter({hasText:mode==='optional-file'?'RootLeaf':'Root / Branch / Leaf'}).click()
  if(mode!=='optional-file'){
   await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','true')
   const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByTestId('r1-normal-file-add-'+key('photo')).click()]);await chooser.setFiles({name:'synthetic-plan.png',mimeType:'image/png',buffer:png})
   await expect.poll(()=>state.uploads).toBe(1);await expect(page.getByTestId('r1-normal-file-preview-'+key('photo'))).toBeVisible()
  }
  if(mode==='hide-owned-file'){
   await field('note').getByRole('textbox').fill('off');await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('不能更新草稿');await expect(field('note').getByRole('textbox')).toHaveValue('on');expect(state.writes).toEqual([]);expect(state.uploads).toBe(1);expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([]);return
  }
  await expect(page.getByTestId('r1-normal-save')).toHaveAttribute('aria-disabled','false')
  if(mode==='permission-drift')fields.find(f=>f.name===key('flag'))!.readOnly=1
  if(mode==='tree-drift')group.children[0].name='changed tree label'
  if(mode==='save-double')await page.getByTestId('r1-normal-save').dblclick();else await page.getByTestId('r1-normal-save').click()
  if(['wrong-ack','permission-drift','tree-drift'].includes(mode)){
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成');expect(state.writes).toEqual(mode==='wrong-ack'?['biz/extForm/upsert/e']:[])
  }else{
   await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(state.writes).toEqual(['biz/extForm/upsert/e','workflowNode/updateExts/n'])
   expect(state.saved[key('flag')]).toBe('0');expect(state.saved[key('score')]).toBe(4);expect(state.saved[key('checks')]).toEqual(['a','b']);expect(state.saved[key('multi')]).toEqual(['a','c']);expect(state.saved[key('path')]).toEqual(mode==='optional-file'?['root-leaf']:['same','same','leaf']);expect(state.saved[key('zero')]).toBe(0);expect(state.saved[key('note')]).toBe('configured form')
   for(const name of ['score','multi','note'])expect(state.saved.exts[key(name)]).toEqual(state.saved[key(name)])
   expect(state.saved).not.toHaveProperty(key('spare'));expect(state.saved.exts).not.toHaveProperty(key('spare'))
   if(mode==='optional-file'){expect(state.saved).not.toHaveProperty(key('photo'));expect(state.saved.exts).not.toHaveProperty(key('photo'))}else expect(state.saved.exts[key('photo')]).toEqual(state.saved[key('photo')])
  }
  expect(state.uploads).toBe(mode==='optional-file'?0:1);expect(state.pickers).toBe(mode==='optional-file'?0:1);expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.calls.some(p=>/Process|delete/i.test(p))).toBe(false)
 }finally{await info.attach('synthetic-plan-ledger',{body:JSON.stringify({mode,...state}),contentType:'application/json'})}
})
