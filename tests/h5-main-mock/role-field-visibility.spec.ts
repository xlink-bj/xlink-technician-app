import { test, expect } from '@playwright/test'
import { enterNormalFormWorkspace, leaveNormalFormForList } from '../support/normal-form-workspace-entry'
test.beforeEach(({}, info) => test.skip(info.config.metadata.roleFieldVisibility !== true, 'Dedicated intercepted readonly role visibility'))
for (const mode of ['selected-r', 'selected-other', 'invalid-list', 'old-condition', 'session-switch'] as const) test(`normal readonly role fields ${mode}`, async ({ page, baseURL }, info) => {
  let role = mode === 'selected-other' ? 'other' : 'r'
  const calls: string[] = [], unexpected: string[] = [], errors: string[] = []
  const fields: Record<string, unknown>[] = [
    { _id: 'include-row', name: 'sameName', nameDisp: '指定角色可见', showType: '4' },
    { _id: 'exclude-row', name: 'sameName', nameDisp: '其他角色可见', showType: '5' },
  ].map(row => ({ ...row, extId: 'e', tenantId: 't', colName: 'syntheticRole', type: 'text', state: 1,
    preset: 1, readOnly: 1, required: '0', multiple: false, operationType: '1', showList: ['4'], roleIds: ['r'], frontEndConfig: '{}' }))
  if (mode === 'invalid-list') fields.forEach(field => { field.roleIds = [] })
  if (mode === 'old-condition') fields.forEach(field => { field.frontEndConfig = JSON.stringify({ showField: 'flag', showValue: 'yes' }) })
  const sa = { _id: 's', tenantId: 't', orderNum: 'SYNTHETIC-ROLES', workflowId: 'w', state: 1, status: 105, serviceType: '40', name: '合成只读角色', exts: { sourceType: '' } }
  const node = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment', state: 0, handlerIds: [role],
    nodeDef: { nodeType: 'repeat', name: '角色字段只读', formDefId: 'e', viewableRoleIds: ['r', 'other'], formFieldIdsFill: [], formFieldIdsReadOnly: fields.map(f => f._id) } }
  const record = { _id: 'a', tenantId: 't', sid: 's', nodeId: 'n', workflowId: 'w', state: 1, sameName: 'SYNTHETIC-ROLE-VALUE', flag: 'yes' }
  page.on('pageerror', e => errors.push(e.message))
  await page.routeWebSocket('**/*', socket => { if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer(); else { unexpected.push('WS'); socket.close() } })
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin !== baseURL) { unexpected.push(url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (req.method() === 'GET' && !['fetch', 'xhr'].includes(req.resourceType())) return route.continue()
      unexpected.push(url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
    calls.push(path); const ok = (json: unknown) => route.fulfill({ json })
    if (path === 'index/phoneLogin.do') return ok({ status: 1, success: true, data: { token: 'synthetic-role-session', user: { _id: 'u', roles: ['r', 'other'] }, currentRole: { _id: role }, capabilityNames: [] } })
    if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
    if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...node, data: sa }], total: 1, page: 1, rows: 20 })
    if (path === 'basic/serviceAppointment/queryById/s') return ok({ success: true, status: 1, data: { serviceAppointment: sa, workflow: { _id: 'w', tenantId: 't', formDataId: 's', state: 0 }, workflowNode: [node] } })
    if (['code/query', 'biz/action/query.do'].includes(path)) return ok({ data: [], total: 0, page: Number(body.page) || 1, rows: Number(body.rows) || 20 })
    if (path === 'biz/ext/queryById.do') return ok({ _id: 'e', tenantId: 't', state: 1, type: '0', colName: 'syntheticRole' })
    if (path === 'biz/extField/query') return ok({ data: fields, total: 2, page: 1, size: 50 })
    if (path === 'biz/extForm/query/e') return ok({ data: [record], total: 1, page: 1, size: Number(body.rows), dataCount: 1 })
    unexpected.push(path); return route.abort('blockedbyclient')
  })
  try {
    await page.goto('/#/pages/index/index'); await page.locator('.launch-cta').click()
    await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click(); await page.locator('.work-order-card').click(); await enterNormalFormWorkspace(page)
    await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' }).click()
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
    const rows = page.getByTestId('r1-normal-value-sameName')
    if (mode === 'invalid-list' || mode === 'old-condition') {
      await expect(rows).toHaveCount(2)
      await expect(page.getByText('SYNTHETIC-ROLE-VALUE', { exact: true })).toHaveCount(0)
    } else {
      await expect(rows).toHaveCount(1)
      await expect(rows).toContainText('SYNTHETIC-ROLE-VALUE')
      await expect(page.getByText(role === 'r' ? '指定角色可见' : '其他角色可见', { exact: true })).toBeVisible()
      await expect(page.getByText(role === 'r' ? '其他角色可见' : '指定角色可见', { exact: true })).toHaveCount(0)
    }
    if (mode === 'session-switch') {
      await leaveNormalFormForList(page); await page.goBack(); await expect(page.locator('.home-page')).toBeVisible()
      await page.getByText('退出登录', { exact: true }).click(); await expect(page.locator('.login-page')).toBeVisible()
      role = 'other'; node.handlerIds = [role]
      await page.locator('.launch-cta').click()
      await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible()
      await page.locator('.work-orders-entry').click(); await page.locator('.work-order-card').click(); await enterNormalFormWorkspace(page)
      await page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' }).click()
      await expect(rows).toHaveCount(1); await expect(rows).toContainText('SYNTHETIC-ROLE-VALUE')
      await expect(page.getByText('其他角色可见', { exact: true })).toBeVisible()
      await expect(page.getByText('指定角色可见', { exact: true })).toHaveCount(0)
      expect(calls.filter(path => path === 'biz/extField/query')).toHaveLength(2)
    }
    await expect(page.getByTestId('r1-normal-edit-a')).toHaveCount(0)
    expect(calls.some(path => /upsert|updateExts|process|upload/.test(path))).toBe(false)
    expect(unexpected).toEqual([]); expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('role-fields.png') })
  } finally { await info.attach('role-read-ledger', { body: JSON.stringify({ mode, role, calls, unexpected, errors, realBackend: 'NOT_RUN' }), contentType: 'application/json' }) }
})
