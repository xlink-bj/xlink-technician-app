import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import { enterNormalFormWorkspace, leaveNormalFormForList } from '../support/normal-form-workspace-entry'
import { test, expect } from '@playwright/test'
test.beforeEach(({},info)=>{test.skip(info.config.metadata.normalAppointmentExperience!==true,'Dedicated intercepted normal appointment experience only')})
const def = '2522989775781119510'

for (const mode of ['plain', 'revoked'] as const) {
test(`normal repeat appointment ${mode} edits a by real UI and preserves b after reentry`, async ({ page, baseURL }, info) => {
  const calls: { path: string; body: Record<string, string> }[] = [], writes: unknown[] = [], errors: string[] = [], unexpected: string[] = []
  const node = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['r'],
    nodeDef: { nodeType: 'repeat', name: '合成预约', formDefId: def, viewableRoleIds: ['r'],
      formFieldIdsFill: ['need', 'reasons1', 'otherReason', 'datetime', 'note', 'modifyReason'], formFieldIdsReadOnly: [] } }
  const fields = [
    { name: 'need', type: 'radio', required: 1, options: [{ value: '1', label: '上门' }, { value: '2', label: '不上门' }] },
    { name: 'reasons1', type: 'select', required: 1, options: [{ value: 'normal', label: '普通原因' }, { value: 'other', label: '其他' }], frontEndConfig: { showField: 'need', showValue: '2' } },
    { name: 'otherReason', type: 'text', required: 1, frontEndConfig: { showField: 'reasons1', showValue: 'other' } },
    { name: 'datetime', type: 'datetime', required: 1, frontEndConfig: { showField: 'need', showValue: '1' } },
    { name: 'note', type: 'text', required: 0 },
    { name: 'modifyReason', type: 'text', required: 1, frontEndConfig: { showField: '_id', showValue: '$exist' } },
  ].map(f => ({ ...f, _id: f.name, tenantId: 't', extId: def, state: 1, readOnly: 0, preset: 1, colName: 'appointment', showList: ['2', '4'], showType: '1' }))
  let a: Record<string, unknown> = { _id: 'a', tenantId: 't', formDefId: def, sid: 's', smodule: 'serviceAppointment', nodeId: 'n', workflowId: 'w', state: 1,
    need: '1', datetime: '2026-11-12 10:30', note: 'old', modifyReason: '', exts: {}, orgId: 'o', createDateTime: '2026-11-10 10:00:00' }
  const b = { ...structuredClone(a), _id: 'b', note: 'other' }, initialB = structuredClone(b), reads: unknown[] = []
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
    if (path === 'biz/extForm/query/' + def) { const id = body['is:_id|string#and'], data = [a, b].filter(r => !id || r._id === id); reads.push(structuredClone(data)); return ok({ data, total: data.length, page: 1, size: Number(body.rows), dataCount: data.length }) }
    if (path === 'biz/extForm/upsert/' + def) {
      const data = JSON.parse(body.dataStr); expect(data).toMatchObject({ _id: 'a', sid: 's', nodeId: 'n', workflowId: 'w', smodule: 'serviceAppointment', state: 1 })
      expect(writes).toHaveLength(0); writes.push(structuredClone(data)); a = data; return ok({ success: true, status: 1, data: { _id: 'a' } })
    }
    unexpected.push(path); return route.abort('blockedbyclient')
  })
  const read=()=>page.getByTestId('r1-normal-form-read').locator('.app-button').filter({hasText:'读取已保存表单'})
  let outcome='RUNNING'
  try{
    await page.goto('/#/pages/index/index');await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible();await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page)
    await expect(page).toHaveURL(/action=set_appointment/);await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0);await read().click();await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(2);await expect(page.getByTestId('r1-normal-edit-b')).toHaveCount(0);await expect(page.getByTestId('r1-normal-complete-request')).toHaveCount(0);await page.getByTestId('r1-normal-edit-a').click();await expect(page.getByTestId('normal-appointment-experience')).toBeVisible()
    await page.getByTestId('r1-normal-input-note').locator('input,textarea').fill('normal specialized note');await page.getByTestId('r1-normal-input-modifyReason').locator('input,textarea').fill('confirmed change')
    await page.getByTestId('normal-appointment-time-open').click();await page.locator('.time-slot').filter({hasText:'14:00'}).click();await page.getByTestId('normal-appointment-time-cancel').click();await expect(page.getByTestId('normal-appointment-time-open')).toContainText('10:30');expect(writes).toHaveLength(0)
    await page.getByTestId('normal-appointment-time-open').click();await page.locator('.time-slot').filter({hasText:'14:00'}).click()
    if(mode==='revoked'){
      node.handlerIds=['other-role'];await read().click();await expect(page.getByTestId('normal-appointment-experience')).toHaveCount(0);await expect(page.getByTestId('normal-appointment-save')).toHaveCount(0);await expect(page.getByTestId('r1-normal-edit-a')).toHaveCount(0);expect(writes).toHaveLength(0);outcome='PASS_REVOKED_WITHOUT_COMMAND'
    }else{
      await page.getByTestId('normal-appointment-time-confirm').click();await expect(page.getByTestId('normal-appointment-time-open')).toContainText('14:00');await page.getByTestId('normal-appointment-review').click();await page.getByTestId('normal-appointment-review-back').click();await page.getByTestId('r1-normal-input-note').locator('input,textarea').fill('returned and checked');await page.getByTestId('normal-appointment-review').click();await page.getByTestId('normal-appointment-save').dblclick();await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取');expect(writes).toHaveLength(1);expect(a).toMatchObject({_id:'a',note:'returned and checked',datetime:'2026-11-12 14:00',modifyReason:'confirmed change'});expect(b).toEqual(initialB)
      await leaveNormalFormForList(page);await page.locator('.work-order-card').click();await enterNormalFormWorkspace(page);await read().click();await expect(page.getByTestId('r1-normal-value-note').filter({hasText:'returned and checked'})).toBeVisible();expect(writes).toHaveLength(1);outcome='PASS_NORMAL_SPECIALIZED_SAVE_ONLY'
    }
    expect(calls.filter(c=>/updateExts|process|upload|upToken/i.test(c.path))).toEqual([]);expect(errors).toEqual([]);expect(unexpected).toEqual([])
    // Runtime artifacts follow the dedicated config; no real backend is contacted.
  }finally{await info.attach('normal-appointment-experience-ledger',{body:JSON.stringify({outcome,calls,writes,reads,a,b,errors,unexpected,realBackend:'NOT_RUN'},null,2),contentType:'application/json'})}
})}
