import { test, expect } from '@playwright/test'
import { enterNormalFormWorkspace } from '../support/normal-form-workspace-entry'
test.beforeEach(({}, info) => test.skip(info.config.metadata.identitySubmission !== true, 'Dedicated intercepted identity submission'))
for (const [type, invalid] of [['phone', '123'], ['IDNumber', 'bad-id']] as const) test(`normal ${type}: explicit submit blocks; save-only retains its contract`, async ({ page, baseURL }, info) => {
  const calls: string[] = [], writes: string[] = [], unexpected: string[] = [], errors: string[] = []
  const fields = [{ _id: 'identity-field', extId: 'e', tenantId: 't', colName: 'syntheticIdentity', name: 'contact', nameDisp: '联系信息',
    type, state: 1, preset: 1, readOnly: 0, required: '0', multiple: false, operationType: '1', showList: ['4'], showType: '1', frontEndConfig: '{}' }]
  const sa = { _id: 's', tenantId: 't', orderNum: 'SYNTHETIC-IDENTITY', workflowId: 'w', state: 1, status: 105, serviceType: '40', name: '合成表单', exts: { sourceType: '' } }
  const node = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: ['r'],
    exts: { formList: [{ _id: 'a', formDefId: 'e', state: 1 }], keep: true },
    nodeDef: { nodeType: 'forms', name: '合成表单', formDefId: 'e', viewableRoleIds: ['r'], formFieldIdsFill: ['identity-field'], formFieldIdsReadOnly: [] } }
  let record: Record<string, unknown> = { _id: 'a', tenantId: 't', sid: 's', nodeId: 'n', workflowId: 'w', formDefId: 'e', smodule: 'serviceAppointment', state: 1, contact: '历史格式', exts: { retained: true } }
  page.on('pageerror', e => errors.push(e.message))
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer()
    else { unexpected.push('WS'); socket.close() }
  })
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin !== baseURL) { unexpected.push(url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (req.method() === 'GET' && !['fetch', 'xhr'].includes(req.resourceType())) return route.continue()
      unexpected.push(url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
    calls.push(path)
    const ok = (json: unknown) => route.fulfill({ json })
    if (path === 'index/phoneLogin.do') return ok({ status: 1, success: true, data: { token: 'synthetic-identity-session', user: { _id: 'u' }, currentRole: { _id: 'r' }, capabilityNames: [] } })
    if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
    if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...node, data: sa }], total: 1, page: 1, rows: 20 })
    if (path === 'basic/serviceAppointment/queryById/s') return ok({ success: true, status: 1, data: { serviceAppointment: sa, workflow: { _id: 'w', tenantId: 't', formDataId: 's', state: 0 }, workflowNode: [node] } })
    if (['code/query', 'biz/action/query.do'].includes(path)) return ok({ data: [], total: 0, page: Number(body.page) || 1, rows: Number(body.rows) || 20 })
    if (path === 'biz/ext/queryById.do') return ok({ _id: 'e', tenantId: 't', state: 1, type: '0', colName: 'syntheticIdentity' })
    if (path === 'biz/extField/query') return ok({ data: fields, total: 1, page: 1, size: 50 })
    if (path === 'biz/extForm/query/e') return ok({ data: [record], total: 1, page: 1, size: Number(body.rows), dataCount: 1 })
    if (path === 'biz/extForm/upsert/e') {
      writes.push(path); record = JSON.parse(body.dataStr)
      expect(record.contact).toBe(invalid); expect(record.exts).toEqual({ retained: true })
      return ok({ success: true, status: 1, data: record })
    }
    if (path === 'workflowNode/updateExts/n') { writes.push(path); node.exts = req.postDataJSON(); return ok({ success: true, status: 1 }) }
    unexpected.push(path); return route.abort('blockedbyclient')
  })
  const read = () => page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' }).click()
  const edit = () => page.getByTestId('r1-normal-edit-a').click()
  const input = () => page.getByTestId('r1-normal-input-contact').locator('input')
  try {
    await page.goto('/#/pages/index/index'); await page.locator('.launch-cta').click()
    await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click(); await page.locator('.work-order-card').click(); await enterNormalFormWorkspace(page); await read(); await edit()
    await input().fill(invalid)
    await page.getByTestId('r1-normal-save-complete-request').click()
    await page.getByTestId('r1-normal-save-complete-confirm').click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('保存未完成或结果尚未核实')
    expect(writes).toEqual([])
    await read()
    if (await page.getByTestId('r1-normal-edit-cancel').count()) await page.getByTestId('r1-normal-edit-cancel').click()
    await edit(); await input().fill(invalid)
    await page.getByTestId('r1-normal-save').click()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('记录已保存并从后台重新读取')
    expect(writes).toEqual(['biz/extForm/upsert/e', 'workflowNode/updateExts/n'])
    expect(record.contact).toBe(invalid); expect(errors).toEqual([]); expect(unexpected).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('identity-save-only.png') })
  } finally { await info.attach('identity-ledger', { body: JSON.stringify({ type, calls, writes, unexpected, errors, realBackend: 'NOT_RUN' }), contentType: 'application/json' }) }
})
