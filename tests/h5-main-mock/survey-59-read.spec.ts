import { expect, test, type Page } from '@playwright/test'
import { survey59Fields, survey59Paths, survey59Record, expectedSurvey59VisibleIds } from '../fixtures/survey-59-synthetic'

test.skip(process.env.XLINK_H5_SURVEY_59 !== 'true', 'Dedicated readonly Survey 59 synthetic API acceptance only')
async function fixture(page: Page, baseURL: string) {
  const state = { part: ['1', '130'] as unknown, providerFailure: false, foreignRecord: false, invalidPartExts: false,
    calls: [] as Array<{ path: string; body: Record<string, string> }>, unexpected: [] as string[], errors: [] as string[], writes: 0 }
  const fields = survey59Fields.map(field => ({ ...field,
    ...(field.valueOption ? { valueOption: `qa-survey-59-${field.name}` } : {}) }))
  const sa = { _id: 's', tenantId: 't', orderNum: 'SYNTHETIC-59', workflowId: 'w', state: 1, status: 105,
    name: '合成59字段客户', serviceType: '40', exts: { sourceType: '' } }
  const node = { _id: 'n', tenantId: 't', workflowId: 'w', workflowFormDataId: 's', workflowFormColName: 'serviceAppointment',
    state: 0, handlerIds: ['r'], nodeDef: { nodeType: 'repeat', name: '合成勘察只读核验', formDefId: 'e',
      viewableRoleIds: ['r'], formFieldIdsFill: [], formFieldIdsReadOnly: fields.map(field => field._id) } }
  page.on('pageerror', error => state.errors.push(error.message))
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(baseURL).host) socket.connectToServer()
    else { state.unexpected.push('WS ' + socket.url()); socket.close() }
  })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== baseURL) { state.unexpected.push(request.method() + ' ' + url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (request.method() === 'GET' && !['xhr', 'fetch'].includes(request.resourceType())) return route.continue()
      state.unexpected.push(request.method() + ' ' + url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
    state.calls.push({ path, body })
    const ok = (json: unknown, status = 200) => route.fulfill({ status, json })
    if (path === 'index/phoneLogin.do') return ok({ status: 1, success: true, data: { token: 'synthetic-session',
      user: { _id: 'u', name: '合成验证师傅' }, currentRole: { _id: 'r', name: '合成角色' }, capabilityNames: [] } })
    if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1,
      exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
    if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...node, data: sa }], total: 1, page: 1, rows: 20 })
    if (path === 'basic/serviceAppointment/queryById/s') return ok({ success: true, status: 1, data: { serviceAppointment: sa,
      workflow: { _id: 'w', tenantId: 't', formDataId: 's', state: 0 }, workflowNode: [node] } })
    if (path === 'biz/ext/queryById.do' && body.id === 'e') return ok({ _id: 'e', tenantId: 't', state: 1, type: '1', colName: 'survey' })
    if (path === 'biz/extField/query' && body.extId === 'e') {
      const page = Number(body.page), size = Number(body.rows)
      return ok({ data: fields.slice((page - 1) * size, page * size), total: 59, page, size, dataCount: Math.min(size, Math.max(0, 59 - (page - 1) * size)) })
    }
    // Explicitly synthetic provider namespace and empty protocol edge case.
    // This does NOT resolve the reference's real provider aliases/options.
    if (path === 'i/code/selectMultistageCode.do' && body.types === 'qa-survey-59-part') {
      return state.providerFailure ? ok({ success: false, code: 'RETRYABLE' }) : ok([{ type: body.types, children: [] }])
    }
    if (path === 'biz/extForm/query/e') {
      const data: Record<string, unknown> = { ...survey59Record(state.part), ...(state.foreignRecord ? { tenantId: 'foreign' } : {}) }
      if (state.invalidPartExts) (data.exts as Record<string, unknown>).part = { broken: true }
      const rows = !body['is:_id|string#and'] || body['is:_id|string#and'] === 'saved' ? [data] : []
      return ok({ data: rows, total: rows.length, page: Number(body.page), size: Number(body.rows), dataCount: rows.length })
    }
    if (path === 'code/query' && body['is:type|string#and'] === 'STATUS') return ok({ data: [], total: 0, page: Number(body.page), rows: Number(body.rows), dataCount: 0 })
    if (path === 'biz/action/query.do') return ok({ data: [], total: 0, page: 1, rows: 20 })
    if (/upsert|process|upload|updateExts/.test(path)) state.writes++
    state.unexpected.push(request.method() + ' ' + path); return route.abort('blockedbyclient')
  })
  return state
}
async function open(page: Page) {
  await page.goto('/#/pages/index/index')
  await page.locator('.launch-cta').click()
  await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await page.locator('.work-order-card').click()
  await expect(page.getByTestId('r1-normal-form-read')).toBeVisible()
}
const read = (page: Page) => page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' })
test('normal App reads 59 rows in two pages and projects every captured part path without loading media', async ({ page, baseURL }, info) => {
  const state = await fixture(page, baseURL!)
  await open(page)
  for (const part of survey59Paths) {
    state.part = part; await read(page).click()
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
    const expected = expectedSurvey59VisibleIds(part)
    await expect(page.getByTestId('r1-normal-form-record').locator('.form-read__value')).toHaveCount(expected.length)
    for (const key of new Set(survey59Fields.map(f => f.name))) {
      const rows = survey59Fields.filter(f => f.name === key && expected.includes(f._id))
      await expect(page.getByTestId(`r1-normal-value-${key}`)).toHaveCount(rows.length)
      if (rows.some(f => f.type === 'file')) await expect(page.getByTestId(`r1-normal-value-${key}`)).toContainText('PNG')
    }
    await expect(page.getByTestId('r1-normal-value-perimeter')).toHaveCount(0)
    await expect(page.getByTestId('r1-normal-value-beforeMoldRemoval')).toHaveCount(0)
    await expect(page.getByTestId('r1-normal-value-afterMoldRemoval')).toHaveCount(0)
    await expect(page.getByTestId('r1-normal-value-height')).toContainText('尚未完整核实')
    await expect(page.getByTestId('r1-normal-form-record')).not.toContainText('https://')
    await expect(page.getByTestId('r1-normal-form-record').locator('a,img')).toHaveCount(0)
  }
  expect(state.calls.filter(c => c.path === 'biz/extField/query').map(c => c.body.page)).toContain('2')
  expect(state.calls.some(c => c.path === 'i/code/selectCode.do')).toBe(false)
  expect(state.writes).toBe(0); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
  await info.attach('readonly-59-evidence', { body: JSON.stringify({ paths: 13, schemaRows: 59, mobileRows: 40,
    calls: state.calls, writes: state.writes, realProviderOptions: 'UNKNOWN', unexpected: state.unexpected }), contentType: 'application/json' })
})
test('normal App refuses provider failure and foreign records, then restores only by explicit read', async ({ page, baseURL }, info) => {
  const state = await fixture(page, baseURL!)
  await open(page); state.providerFailure = true; await read(page).click()
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('无法完整核实')
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0)
  state.providerFailure = false; await read(page).click()
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
  state.foreignRecord = true; await read(page).click()
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0)
  state.foreignRecord = false; await read(page).click()
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
  await page.reload(); await open(page); await read(page).click()
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
  await expect(page.getByTestId('r1-normal-append')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-save')).toHaveCount(0)
  expect(state.writes).toBe(0); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
  await info.attach('readonly-failure-recovery', { body: JSON.stringify({ calls: state.calls, writes: state.writes,
    unexpected: state.unexpected, realBackend: 'NOT_RUN' }), contentType: 'application/json' })
})

test('normal App refuses invalid authoritative EXTS instead of revealing stale root-conditioned values', async ({ page, baseURL }, info) => {
  const state = await fixture(page, baseURL!)
  await open(page);state.invalidPartExts = true;await read(page).click()
  await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('无法完整核实')
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0)
  await expect(page.getByTestId('r1-normal-value-squareMeter')).toHaveCount(0)
  state.invalidPartExts = false;await read(page).click()
  await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
  await expect(page.getByTestId('r1-normal-value-squareMeter')).toContainText('18.75')
  expect(state.writes).toBe(0);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([])
  await info.attach('invalid-exts-explicit-read-recovery', {body:JSON.stringify({calls:state.calls,writes:state.writes,unexpected:state.unexpected}),contentType:'application/json'})
})
