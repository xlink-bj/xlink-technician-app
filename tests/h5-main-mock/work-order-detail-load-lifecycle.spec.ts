import { expect, test } from '@playwright/test'

test.skip(process.env.XLINK_H5_DETAIL_LIFECYCLE !== 'true', 'Fully intercepted normal App detail lifecycle only')

for (const late of ['success', 'session-invalid'] as const) test(`normal A-back-B ignores late A ${late}`, async ({ page, baseURL }, info) => {
  const origin = baseURL!, calls: { method: string; path: string; body: Record<string, string>; query: Record<string, string>; at: number }[] = []
  const events: { event: string; at: number }[] = [], unexpected: string[] = [], errors: string[] = []
  let markA!: () => void, releaseA!: () => void, logins = 0
  const arrivedA = new Promise<void>(resolve => { markA = resolve })
  const heldA = new Promise<void>(resolve => { releaseA = resolve })
  const event = (event: string) => events.push({ event, at: Date.now() })
  const row = (id: string) => ({ _id: id, name: `合成详情${id}`, orderNum: `SYNTHETIC-${id}`,
    tenantId: 'synthetic-authority', state: 1, status: 104, serviceType: '40', exts: { sourceType: '' } })
  page.on('pageerror', error => errors.push(error.message))
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin.replace('ws:', 'http:') === origin) socket.connectToServer()
    else { unexpected.push('WS ' + socket.url()); socket.close() }
  })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) { unexpected.push(request.method() + ' ' + url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (request.method() === 'GET' && !['xhr', 'fetch'].includes(request.resourceType())) return route.continue()
      unexpected.push(request.method() + ' ' + url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
    calls.push({ method: request.method(), path, body, query: Object.fromEntries(url.searchParams), at: Date.now() })
    if (path === 'index/phoneLogin.do') {
      logins++; return route.fulfill({ json: { status: 1, success: true, data: { token: 'synthetic-detail-no-remote-authority',
        user: { _id: 'synthetic-user', name: '合成详情验证' }, currentRole: { _id: 'synthetic-role', name: '合成角色' }, capabilityNames: [] } } })
    }
    if (path === 'function/queryTreeByRoleId') return route.fulfill({ json: { data: { functionList: [
      { order: 0, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=todo' },
      { order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments' },
    ] } } })
    if (path === 'basic/serviceAppointment/query') return route.fulfill({ json: { data: [row('A'), row('B')], total: 2, page: 1, rows: 20 } })
    if (path === 'basic/serviceAppointment/queryById/A' || path === 'basic/serviceAppointment/queryById/B') {
      const id = path.endsWith('/A') ? 'A' : 'B'; event('detail:' + id + ':request')
      if (id === 'A') { markA(); await heldA; event('detail:A:released')
        if (late === 'session-invalid') return route.fulfill({ status: 401, json: { message: 'synthetic stale session failure' } })
      }
      return route.fulfill({ json: { status: 1, success: true, data: { serviceAppointment: { ...row(id), workflowId: 'synthetic-flow-' + id },
        workflow: { _id: 'synthetic-flow-' + id, formDataId: id, state: 0 }, workflowNode: [] } } })
    }
    if (path === 'code/query' && body['is:type|string#and'] === 'STATUS') return route.fulfill({ json: { data: [], total: 0, page: Number(body.page), rows: Number(body.rows) } })
    unexpected.push(request.method() + ' ' + path); return route.abort('blockedbyclient')
  })
  try {
    await page.goto('/#/pages/index/index')
    await page.locator('.launch-cta').click()
    await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
    await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click()
    await expect(page.locator('.card-customer')).toHaveText(['合成详情A', '合成详情B'])
    await page.locator('.card-customer').filter({ hasText: '合成详情A' }).click()
    await arrivedA
    event('ui:A:pending')
    // Real browser Back traverses normal uni-app history, with no store/route injection.
    await page.goBack()
    await expect(page.locator('.work-orders-page')).toBeVisible()
    await page.locator('.card-customer').filter({ hasText: '合成详情B' }).click()
    await expect.poll(() => calls.filter(call => call.path === 'basic/serviceAppointment/queryById/B').length).toBe(1)
    await expect(page.locator('.summary-customer')).toHaveText('合成详情B')
    event('ui:B:rendered')
    const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/basic/serviceAppointment/queryById/A'))
    releaseA(); const lateResponse = await response; await lateResponse.finished()
    expect(lateResponse.status()).toBe(late === 'session-invalid' ? 401 : 200)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.locator('.summary-customer')).toHaveText('合成详情B')
    await expect(page.locator('.guard-page')).toHaveCount(0)
    expect(logins).toBe(1)
    expect(calls.filter(call => call.path === 'basic/serviceAppointment/queryById/A')).toHaveLength(1)
    expect(events.findIndex(e => e.event === 'detail:B:request')).toBeLessThan(events.findIndex(e => e.event === 'detail:A:released'))
    expect(events.findIndex(e => e.event === 'ui:B:rendered')).toBeLessThan(events.findIndex(e => e.event === 'detail:A:released'))
    for (const call of calls.filter(c => c.path.startsWith('basic/serviceAppointment/queryById/'))) { expect(call.body).toEqual({}); expect(call.query).toEqual({}) }
    expect(calls.every(call => call.method === 'POST')).toBe(true)
    expect(unexpected).toEqual([]); expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('B-after-late-A.png'), fullPage: true })
  } finally {
    releaseA()
    await info.attach('detail-lifecycle-ledger', { body: JSON.stringify({ late, calls, events, unexpected, errors, logins,
      businessCommands: calls.filter(call => /upsert|Process|upload|delete|changeRole|logout/.test(call.path)), realBackend: 'NOT_RUN' }, null, 2), contentType: 'application/json' })
  }
})
