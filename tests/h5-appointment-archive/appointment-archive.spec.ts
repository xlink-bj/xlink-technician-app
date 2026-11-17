import {isWorkOrderInformationRead} from '../support/work-order-information-fixture'
import {test,expect} from '@playwright/test'
const def='2522989775781119510'
for(const mode of ['single','minute','date-only','multiple','empty','failed','delayed','uncertain','revoked'] as const){
test(`appointment archive ${mode}: actual App entry and selected record`,async({page,baseURL},info)=>{
  let releaseRead!:()=>void
  const delayRead=new Promise<void>(resolve=>{releaseRead=resolve})
  const calls: { path: string; body: Record<string, string> }[] = [], writes: unknown[] = [], errors: string[] = [], unexpected: string[] = []
  const node = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['r'],
    nodeDef: { nodeType: 'repeat', name: '预约', formDefId: def, viewableRoleIds: ['r'],
      formFieldIdsFill: ['need', 'reasons1', 'otherReason', 'datetime', 'note', 'modifyReason'], formFieldIdsReadOnly: [] } }
  const fields = [
    { nameDisp: '是否上门', name: 'need', type: 'radio', required: 1, options: [{ value: '1', label: '上门' }, { value: '2', label: '不上门' }] },
    { nameDisp: '不上门原因', name: 'reasons1', type: 'select', required: 1, options: [{ value: 'normal', label: '普通原因' }, { value: 'other', label: '其他' }], frontEndConfig: { showField: 'need', showValue: '2' } },
    { nameDisp: '其他原因', name: 'otherReason', type: 'text', required: 1, frontEndConfig: { showField: 'reasons1', showValue: 'other' } },
    { nameDisp: '上门时间', name: 'datetime', type: 'datetime', required: 1, frontEndConfig: { showField: 'need', showValue: '1' } },
    { nameDisp: '预约备注', name: 'note', type: 'text', required: 0 },
    { nameDisp: '修改原因', name: 'modifyReason', type: 'text', required: 1, frontEndConfig: { showField: '_id', showValue: '$exist' } },
  ].map(f => ({ ...f, _id: f.name, tenantId: 't', extId: def, state: 1, readOnly: 0, preset: 1, colName: 'appointment', showList: ['2', '4'], showType: '1' }))
  let a: Record<string, unknown> = { _id: 'a', tenantId: 't', formDefId: def, sid: 's', smodule: 'serviceAppointment', nodeId: 'n', workflowId: 'w', state: 1,
    need: '1', datetime: '2026-11-20 10:37:42', note: '请提前联系', modifyReason: '', exts: {}, orgId: 'o', createDateTime: '2026-11-10 10:00:00' }
  if(mode==='date-only')a.datetime='2026-11-20'
  const b = { ...structuredClone(a), _id: 'b', note: '另一次预约' }, initialB = structuredClone(b), reads: unknown[] = []
  const sa = { _id: 's', tenantId: 't', workflowId: 'w', state: 1, status: 105, serviceType: '40', name: '合成改约验证', orderNum: 'SYNTHETIC-APPOINTMENT', exts: { sourceType: '' } }
  page.on('pageerror', e => errors.push(e.message))
  await page.routeWebSocket('**/*', socket => { if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer(); else { unexpected.push('WS ' + socket.url()); socket.close() } })
  await page.route('**/*', async route => {
    if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ status: 503, json: { success: false, message: 'Synthetic information configuration unavailable' } })
    const req = route.request(), url = new URL(req.url())
    if (url.origin !== baseURL) { unexpected.push(req.method() + ' ' + url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (req.method() === 'GET' && !['fetch', 'xhr'].includes(req.resourceType())) return route.continue()
      unexpected.push(req.method() + ' ' + url.pathname); return route.abort('blockedbyclient')
    }
    if (req.method() !== 'POST') { unexpected.push(req.method() + ' ' + url.pathname); return route.abort('blockedbyclient') }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
    calls.push({ path, body }); const ok = (json: unknown) => route.fulfill({ json })
    if (path === 'index/phoneLogin.do') return ok({ success: true, status: 1, data: { token: 'synthetic-appointment-session', user: { _id: 'u', name: '合成预约技师' }, currentRole: { _id: 'r', name: '合成角色' }, capabilityNames: [] } })
    if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
    if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...node, data: sa }], total: 1, page: 1, rows: 20 })
    if (path === 'basic/serviceAppointment/queryById/s') return ok({ success: true, status: 1, data: { serviceAppointment: sa, workflow: { _id: 'w', tenantId: 't', formDataId: 's', state: 0 }, workflowNode: [node] } })
    if (['code/query', 'biz/action/query.do'].includes(path)) return ok({ data: [], total: 0, page: Number(body.page) || 1, rows: Number(body.rows) || 20, dataCount: 0 })
    if (path === 'biz/ext/queryById.do' && body.id === def) return ok({ _id: def, tenantId: 't', state: 1, type: '0', colName: 'appointment' })
    if (path === 'biz/extField/query' && body.extId === def) return ok({ data: fields, total: 6, page: 1, size: Number(body.rows) || 50, dataCount: 6 })
    if (path === 'biz/extForm/query/' + def) { if(mode==='failed')return route.fulfill({status:503,json:{success:false}}); if(mode==='delayed')await delayRead; const id = body['is:_id|string#and'], data = (mode==='empty'?[]:(mode==='single'||mode==='minute'||mode==='date-only')?[a]:[a,b]).filter(r => !id || r._id === id); if(mode==='uncertain'&&writes.length) data.forEach(r=>{if(r._id==='a')r.note='保存结果待核实'}); reads.push(structuredClone(data)); return ok({ data, total: data.length, page: 1, size: Number(body.rows), dataCount: data.length }) }
    if (path === 'biz/extForm/upsert/' + def) {
      const data = JSON.parse(body.dataStr); expect(data).toMatchObject({ _id: 'a', sid: 's', nodeId: 'n', workflowId: 'w', smodule: 'serviceAppointment', state: 1 })
      expect(writes).toHaveLength(0); writes.push(structuredClone(data)); a = data; return ok({ success: true, status: 1, data: { _id: 'a' } })
    }
    unexpected.push(path); return route.abort('blockedbyclient')
  })

  try {
    await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click()
    await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click()
    const archive=page.getByTestId('appointment-archive')
    await expect(archive).toBeVisible()
    await expect(page.getByTestId('order-archive-summary')).toHaveCount(0)
    await expect(page.getByTestId('contract-archive-unverified')).toHaveCount(0)
    await expect(page.getByTestId('warranty-archive-unverified')).toHaveCount(0)
    if(mode==='delayed'){
      await expect(page.getByTestId('appointment-archive-loading')).toBeVisible();await expect(page.getByTestId('appointment-archive-empty')).toHaveCount(0);releaseRead()
      await expect(page.getByTestId('appointment-archive-open')).toBeVisible()
    }else if(mode==='empty'){
      await expect(page.getByTestId('appointment-archive-empty')).toBeVisible();await expect(page.getByTestId('appointment-archive-open')).toHaveCount(0)
    }else if(mode==='failed'){
      await expect(page.getByTestId('appointment-archive-error')).toBeVisible();await expect(page.getByTestId('appointment-archive-empty')).toHaveCount(0)
    }else{
      await expect(page.getByTestId('appointment-archive-open')).toBeVisible()
      await page.screenshot({path:info.outputPath('01-work-order-card.png'),fullPage:true})
      await page.getByTestId('appointment-archive-open').click()
      if(!['single','minute','date-only'].includes(mode)){
        await expect(page.getByTestId('appointment-record-a')).toBeVisible()
        await page.getByTestId('appointment-record-b').click()
        await expect(page.getByTestId('appointment-read-only')).toBeVisible();await expect(page.getByTestId('appointment-modify')).toHaveCount(0)
        await page.screenshot({path:info.outputPath('02-read-only-record-b.png'),fullPage:true})
        await page.getByTestId('appointment-archive-open').click();await page.getByTestId('appointment-record-a').click()
      }
      if(mode!=='date-only')await expect(page.getByTestId('appointment-record-detail')).toContainText('10:37')
      else await expect(page.getByTestId('appointment-record-detail')).toContainText('2026-11-20')
      await expect(page.getByTestId('appointment-record-detail')).not.toContainText('10:37:42')
      if(mode==='single'){
        await page.getByTestId('appointment-archive-open').click()
        await expect(page).not.toHaveURL(/&record=/)
        await expect(page.getByTestId('appointment-record-a')).toBeVisible()
        await page.getByTestId('appointment-record-a').click()
        await expect(page).toHaveURL(/&record=a/)
      }
      await page.screenshot({path:info.outputPath('03-record-a-detail.png'),fullPage:true})
      await page.getByTestId('appointment-modify').click()
      await page.getByTestId('r1-normal-input-modifyReason').locator('input,textarea').fill('客户调整到下午')
      await page.getByTestId('normal-appointment-time-open').click()
      if(mode==='date-only')await expect(page.getByTestId('normal-appointment-time-confirm')).toHaveAttribute('aria-disabled','true')
      if(mode==='minute'){
        await page.getByTestId('appointment-minute-picker').click()
        const minuteColumn=page.locator('.uni-picker-toggle uni-picker-view-column').nth(1)
        const box=(await minuteColumn.boundingBox())!,row=(await minuteColumn.locator('.uni-picker-view-indicator').boundingBox())!
        await minuteColumn.click({position:{x:box.width/2,y:box.height/2+row.height*2}})
        await page.locator('.uni-picker-toggle .uni-picker-action-confirm').click()
        await expect(page.getByTestId('appointment-minute-picker')).toContainText('10:39')
      }else await page.locator('.time-slot').filter({hasText:/^14:00$/}).click()
      await page.getByTestId('normal-appointment-time-confirm').click()
      await page.getByTestId('normal-appointment-review').click()
      await expect(page.getByTestId('appointment-before-datetime')).toContainText(mode==='date-only'?'2026-11-20':'10:37')
      await page.screenshot({path:info.outputPath('04-review-before-after.png'),fullPage:true})
      if(mode==='single'){
        const original=page.viewportSize()!
        for(const viewport of [{width:375,height:667},{width:390,height:844}]){
          await page.setViewportSize(viewport)
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
          await page.screenshot({path:info.outputPath(`04-review-${viewport.width}x${viewport.height}.png`),fullPage:true})
        }
        await page.setViewportSize(original)
      }
      if(mode==='revoked')node.handlerIds=['other-role']
      await page.getByTestId('normal-appointment-save').dblclick()
      if(mode==='revoked'||mode==='uncertain'){
        await expect(page.getByTestId('appointment-archive-error').or(page.getByTestId('r1-normal-form-read-message'))).toContainText('保存未完成或结果尚未核实')
        await expect(page.getByTestId('normal-appointment-save')).toHaveCount(0)
        expect(writes).toHaveLength(mode==='revoked'?0:1)
      }else{
        await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
        expect(writes).toHaveLength(1);expect(a).toMatchObject({_id:'a',datetime:mode==='minute'?'2026-11-20 10:39:42':mode==='date-only'?'2026-11-20 14:00':'2026-11-20 14:00:42',modifyReason:'客户调整到下午'});expect(b).toEqual(initialB)
        await expect(page.getByTestId('appointment-record-detail')).toContainText(mode==='minute'?'10:39':'14:00')
        // Return through the real retained page stack; the card rereads instead of using an ACK.
        if(mode==='single'){
          for(let step=0;step<4&&page.url().includes('read=appointment');step++){
            const previous=page.url()
            await page.locator('uni-page-head .uni-page-head-btn').first().click()
            await expect(page).not.toHaveURL(previous)
          }
          await expect(page.getByTestId('appointment-archive-summary')).toContainText('14:00')
        }
      }
    }
    await page.screenshot({path:info.outputPath('05-final-state.png'),fullPage:true})
    expect(calls.filter(c=>/takeback|delete|process|updateExts|upload|upToken/i.test(c.path))).toEqual([])
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    expect(errors).toEqual([]);expect(unexpected).toEqual([])
  } finally {releaseRead();await info.attach('appointment-archive-http-ledger',{body:JSON.stringify({mode,calls,writes,reads,a,b,errors,unexpected,realBackend:'NOT_RUN'},null,2),contentType:'application/json'})}
})}
