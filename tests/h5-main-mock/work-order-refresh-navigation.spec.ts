import { expect, test } from '@playwright/test'

test.skip(process.env.XLINK_H5_REFRESH_NAVIGATION !== 'true', 'Opt-in fully intercepted normal App list navigation')

for (const outcome of ['success', 'failure'] as const) test(`normal search cached cards remain inert before ${outcome}`, async ({ page, baseURL }, info) => {
  const calls: { path: string; at: number }[] = [], unexpected: string[] = [], errors: string[] = []
  let markHeld!: () => void, release!: () => void, held = false, searched = false
  const arrived = new Promise<void>(r => { markHeld = r }), gate = new Promise<void>(r => { release = r })
  const row = { _id: 'A', tenantId: 'synthetic-authority', name: '合成刷新工单', orderNum: 'SYNTHETIC-REFRESH', state: 1, status: 104, serviceType: '40', exts: { sourceType: '' } }
  page.on('pageerror', e => errors.push(e.message))
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer()
    else { unexpected.push('WS'); socket.close() }
  })
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin !== baseURL) { unexpected.push(req.method() + ' ' + url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (req.method() === 'GET' && !['xhr', 'fetch'].includes(req.resourceType())) return route.continue()
      unexpected.push(url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(req.postData() ?? ''))
    calls.push({ path, at: Date.now() })
    if (path === 'index/phoneLogin.do') return route.fulfill({ json: { success: true, status: 1, data: { token: 'synthetic-local-navigation-only', user: { _id: 'synthetic-user' }, currentRole: { _id: 'synthetic-role' }, capabilityNames: [] } } })
    if (path === 'function/queryTreeByRoleId') return route.fulfill({ json: { data: { functionList: [
      { order: 0, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=todo' },
      { order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments' },
    ] } } })
    if (path === 'basic/serviceAppointment/query') {
      if (searched && !held) {
        held = true; markHeld(); await gate
        if (outcome === 'failure') return route.fulfill({ status: 503, json: { success: false, message: 'Synthetic list failure' } })
      }
      return route.fulfill({ json: { data: [row], total: 1, page: 1, rows: 20 } })
    }
    if (path === 'basic/serviceAppointment/queryById/A') return route.fulfill({ json: { success: true, status: 1, data: { serviceAppointment: { ...row, workflowId: 'synthetic-flow' }, workflow: { _id: 'synthetic-flow', formDataId: 'A', state: 0 }, workflowNode: [] } } })
    if (path === 'code/query' && body['is:type|string#and'] === 'STATUS') return route.fulfill({ json: { data: [], total: 0, page: Number(body.page), rows: Number(body.rows) } })
    unexpected.push(path); return route.abort('blockedbyclient')
  })
  try {
    await page.goto('/#/pages/index/index'); await page.locator('.launch-cta').click()
    await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible()
    await page.locator('.work-orders-entry').click(); const card = page.locator('.work-order-card'); await expect(card).toBeVisible()
    await page.getByRole('searchbox').fill('SYNTHETIC-REFRESH'); searched = true; await page.locator('.search-button:visible').click(); await arrived
    await expect(card).toHaveAttribute('aria-disabled', 'true'); await expect(card).not.toHaveAttribute('role', 'link')
    await expect(card.locator('.app-record-card')).not.toHaveClass(/app-record-card--interactive/)
    await card.click({ force: true }); await card.click({ force: true })
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    await expect(page).toHaveURL(/#\/pages\/work-orders\/work-orders/)
    expect(calls.filter(c => c.path.startsWith('basic/serviceAppointment/queryById/'))).toHaveLength(0)
    await page.screenshot({ path: info.outputPath('cached-card-held.png'), fullPage: true })
    release()
    if (outcome === 'failure') {
      await expect(page.getByText('暂时无法加载工单', { exact: true })).toBeVisible(); await expect(card).toHaveCount(0)
      expect(calls.filter(c => c.path.startsWith('basic/serviceAppointment/queryById/'))).toHaveLength(0)
      await page.getByText('重新加载', { exact: true }).click()
    }
    await expect(card).toHaveAttribute('aria-disabled', 'false'); await expect(card).toHaveAttribute('role', 'link')
    await card.click(); await expect(page.locator('.summary-customer')).toHaveText(row.name)
    expect(calls.filter(c => c.path.startsWith('basic/serviceAppointment/queryById/'))).toHaveLength(1)
    await page.locator('.uni-page-head-hd:visible').last().click(); await expect(card).toHaveAttribute('aria-disabled', 'false')
    expect(calls.filter(c => /upsert|updateExts|Process|upload|delete/.test(c.path))).toEqual([])
    expect(errors).toEqual([]); expect(unexpected).toEqual([])
  } finally {
    release(); await page.unrouteAll({ behavior: 'wait' })
    await info.attach('refresh-navigation-ledger', { body: JSON.stringify({ outcome, calls, unexpected, errors, realBackend: 'NOT_RUN' }), contentType: 'application/json' })
  }
})
