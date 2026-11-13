import { expect, test, type Page } from '@playwright/test'
import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
test.beforeEach(({}, info) => test.skip(info.config.metadata.informationRole !== true, 'Dedicated fully intercepted DEV information role read'))

function field(showType: string, roleIds: unknown = ['r'], extra: Record<string, unknown> = {}) {
  return { _id: 'role-memo', colName: 'serviceAppointment', tenantId: 'synthetic-authority', name: 'memo', nameDisp: '角色资料',
    state: 1, preset: 0, readOnly: 0, type: 'text', showList: ['4'], showType, roleIds, frontEndConfig: '{}', ...extra }
}
async function fixture(page: Page, origin: string, initialRole: string | null = 'r') {
  let role = initialRole, lastId = '', config = [field('4')], hold = false, release = () => {}, arrived = () => {}
  let held = Promise.resolve()
  const calls: { path: string; body: Record<string, string> }[] = [], unexpected: string[] = [], errors: string[] = []
  const row = (id: string) => ({ _id: id, tenantId: 'synthetic-authority', name: '合成客户' + id, orderNum: 'SYNTHETIC-ROLE-' + id,
    state: 1, status: 104, serviceType: '40', phone: '13800000000', memo: '根备注' + id, exts: { sourceType: '', memo: '扩展备注' + id } })
  page.on('pageerror', e => errors.push(e.message))
  await page.routeWebSocket('**/*', socket => { if (new URL(socket.url()).origin.replace('ws:', 'http:') === origin) socket.connectToServer(); else { unexpected.push('WS'); socket.close() } })
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin !== origin) { unexpected.push('external'); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (req.method() === 'GET' && !['xhr', 'fetch'].includes(req.resourceType())) return route.continue()
      unexpected.push(url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
    calls.push({ path, body }); const ok = (json: unknown) => route.fulfill({ json })
    if (path === 'index/phoneLogin.do') return ok({ status: 1, success: true, data: { token: 'synthetic-information-role-session', user: { _id: 'u', roleIds: ['r', 'other'] }, ...(role ? { currentRole: { _id: role } } : {}), capabilityNames: [] } })
    if (path === 'function/changeRole') return ok({ data: { functionList: [{ order: 0, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments' }] } })
    if (path === 'basic/serviceAppointment/query') return ok({ data: [row('A'), row('B')], total: 2, page: 1, rows: 20 })
    if (['basic/serviceAppointment/queryById/A', 'basic/serviceAppointment/queryById/B'].includes(path)) {
      lastId = path.endsWith('/A') ? 'A' : 'B'; return ok({ status: 1, success: true, data: { serviceAppointment: row(lastId), workflowNode: [] } })
    }
    if (isWorkOrderInformationRead(req, origin)) {
      const response = { data: structuredClone(config), total: config.length, page: 1, size: 200 }
      if (hold && lastId === 'A') { hold = false; arrived(); await new Promise<void>(resolve => { release = resolve }) }
      return ok(response)
    }
    if (path === 'code/query' && body['is:type|string#and'] === 'STATUS') return ok({ data: [], total: 0, page: Number(body.page), rows: Number(body.rows) })
    if (path === 'biz/action/query.do') return ok({ data: [] })
    unexpected.push(req.method() + ' ' + path); return route.abort('blockedbyclient')
  })
  const login = async () => { await page.locator('.launch-cta').click(); await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible(); await page.locator('.work-orders-entry').click() }
  const open = async (id = 'A') => { await page.locator('.card-customer').filter({ hasText: '合成客户' + id }).click(); await expect(page.locator('.summary-customer')).toHaveText('合成客户' + id); await page.locator('.detail-tab').filter({ hasText: '客户' }).click() }
  const back = async () => { await page.goBack(); await expect(page.locator('.work-orders-page')).toBeVisible() }
  const rows = page.getByTestId('configured-information-row')
  return { calls, unexpected, errors, rows, open, back, login, config: (next: ReturnType<typeof field>[]) => { config = next },
    role: (next: string | null) => { role = next }, holdA: () => { hold = true; held = new Promise<void>(resolve => { arrived = resolve }) }, arrived: () => held, release: () => release() }
}

for (const [showType, role, visible] of [['4', 'r', true], ['4', 'other', false], ['5', 'r', false], ['5', 'other', true]] as const) test(`normal readonly information ${showType} selected ${role}: visible ${visible}`, async ({ page, baseURL }, info) => {
  const h = await fixture(page, baseURL!, role)
  h.config([field(showType), field(showType, ['r'], { _id: 'root-memo', preset: 1, nameDisp: '根角色资料' }), field(showType, ['r'], { _id: 'phone-role', name: 'phone', preset: 1, type: 'phone', nameDisp: '角色电话' })])
  try {
    await page.goto('/#/pages/index/index'); await h.login(); await h.open()
    await expect(h.rows).toHaveCount(visible ? 3 : 0)
    if (visible) await expect(h.rows).toContainText(['扩展备注A', '根备注A', '138****0000'])
    await expect(page.locator('.customer-info-panel')).not.toContainText('13800000000')
    expect(h.calls.some(c => /upsert|process|upload|delete/i.test(c.path))).toBe(false)
    expect(h.unexpected).toEqual([]); expect(h.errors).toEqual([])
    await page.screenshot({ path: info.outputPath('selected-role.png') })
  } finally { h.release(); await info.attach('information-role-ledger', { body: JSON.stringify({ showType, role, calls: h.calls, unexpected: h.unexpected, errors: h.errors, realBackend: 'NOT_RUN', writes: 0 }), contentType: 'application/json' }) }
})

test('real detail rejects malformed/legacy role rules, stale A and logout/missing current role', async ({ page, baseURL }, info) => {
  const h = await fixture(page, baseURL!)
  const relogin = async (role: string | null) => {
    await h.back(); await page.goBack(); await expect(page.locator('.home-page')).toBeVisible()
    await page.getByText('退出登录', { exact: true }).click(); await expect(page.locator('.login-page')).toBeVisible()
    await expect(h.rows).toHaveCount(0); h.role(role); await h.login()
  }
  try {
    await page.goto('/#/pages/index/index'); await h.login(); await h.open(); await expect(h.rows).toContainText('扩展备注A'); await h.back()
    for (const roleIds of [[], null, ['r', 'r'], [1]]) {
      h.config([field('5', roleIds)]); await h.open(); await expect(h.rows).toHaveCount(0); await h.back()
    }
    h.config([field('4', ['r'], { frontEndConfig: { showField: 'memo', showValue: '根备注A' }, showFieldPreset: 1 })])
    await h.open(); await expect(h.rows).toHaveCount(0); await h.back()
    h.config([field('4')]); h.holdA(); await page.locator('.card-customer').filter({ hasText: '合成客户A' }).click(); await h.arrived()
    await h.back(); await h.open('B'); await expect(h.rows).toContainText('扩展备注B'); h.release()
    await expect(page.locator('.summary-customer')).toHaveText('合成客户B'); await expect(h.rows).toContainText('扩展备注B')
    await relogin('other'); await h.open(); await expect(h.rows).toHaveCount(0)
    await h.back(); h.config([field('5')]); await h.open(); await expect(h.rows).toContainText('扩展备注A')
    const before = h.calls.filter(c => c.path === 'biz/extField/query').length
    await relogin(null); await expect(h.rows).toHaveCount(0)
    expect(h.calls.filter(c => c.path === 'biz/extField/query')).toHaveLength(before)
    expect(h.calls.some(c => /upsert|process|upload|delete/i.test(c.path))).toBe(false)
    expect(h.unexpected).toEqual([]); expect(h.errors).toEqual([])
  } finally { h.release(); await info.attach('information-role-lifecycle', { body: JSON.stringify({ calls: h.calls, unexpected: h.unexpected, errors: h.errors, realBackend: 'NOT_RUN', writes: 0 }), contentType: 'application/json' }) }
})
