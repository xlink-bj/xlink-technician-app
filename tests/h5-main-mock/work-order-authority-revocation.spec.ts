import { expect, test, type Page, type TestInfo } from '@playwright/test'

test.skip(process.env.XLINK_H5_AUTHORITY_REVOCATION !== 'true', 'Dedicated browser-only authority fixture')
const ordinary = 'basic/serviceAppointment/query'
const todoPath = 'basic/serviceAppointment/querySAWorkflowNode'
const menuPath = '/pages/serviceAppointment/serviceAppointments'
const category = (page: Page, key: string) => page.getByTestId(`work-order-category-${key}`)
const names = (page: Page) => page.locator('.card-customer')
type Body = Record<string, string>
function gate() {
  let arrived!: () => void, release!: (failure?: boolean) => void
  const entered = new Promise<void>(resolve => { arrived = resolve })
  const response = new Promise<boolean>(resolve => { release = value => resolve(value ?? false) })
  return { entered, response, arrived, release }
}
async function fixture(page: Page, origin: string) {
  const state = {
    menus: 'both' as 'both' | 'todo-only' | 'drift', logins: 0,
    calls: [] as { method: string; path: string; body: Body; query: Body; at: number }[],
    events: [] as { event: string; at: number }[], unexpected: [] as string[], errors: [] as string[],
    menuGate: null as ReturnType<typeof gate> | null, pageGate: null as ReturnType<typeof gate> | null,
  }
  const event = (event: string) => { state.events.push({ event, at: Date.now() }) }
  const row = (id: string, name: string, status = 104) => ({ _id: id, name, orderNum: id,
    title: name, state: 1, status, serviceType: '40', exts: { sourceType: '' } })
  page.on('pageerror', error => state.errors.push(error.message))
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
    else { state.unexpected.push('WS ' + socket.url()); socket.close() }
  })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) { state.unexpected.push(request.method() + ' ' + url.origin + url.pathname); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/xlink/wm/')) {
      if (request.method() === 'GET' && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue()
      state.unexpected.push(request.method() + ' ' + url.pathname); return route.abort('blockedbyclient')
    }
    const path = url.pathname.slice('/xlink/wm/'.length)
    const body = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
    const query = Object.fromEntries(url.searchParams)
    state.calls.push({ method: request.method(), path, body, query, at: Date.now() })
    const ok = (json: unknown, status = 200) => route.fulfill({ status, json })
    if (path === 'index/phoneLogin.do') {
      state.logins++; event(`login:${state.logins}`)
      return ok({ status: 1, success: true, data: { token: `synthetic-session-${state.logins}`,
        user: { _id: 'synthetic-user', name: '合成授权验证' }, currentRole: { _id: 'synthetic-role', name: '合成角色' }, capabilityNames: [] } })
    }
    if (path === 'function/queryTreeByRoleId') {
      const action = state.menus === 'drift' ? `${menuPath}?status=104` : menuPath
      const functionList = [{ order: 0, exts: { tabDisplay: '1' }, action: `${menuPath}?type=SANode&orderState=todo` },
        ...(state.menus === 'todo-only' ? [] : [{ order: 1, exts: { tabDisplay: '1' }, action }])]
      const held = state.menuGate; state.menuGate = null
      if (held) { event('menu:held'); held.arrived(); const fail = await held.response; event('menu:released'); if (fail) return ok({ message: 'synthetic late menu failure' }, 503) }
      return ok({ data: { functionList } })
    }
    if (path === ordinary || path === todoPath) {
      const pageNumber = Number(body.page), size = Number(body.rows), session = state.logins
      const search = body['regex:name|string#or']
      const list = search ? [row('searched', '搜索新结果')]
        : path === todoPath ? [row('todo', '待联系新结果')]
        : session > 1 ? [row('new-session', '新会话结果')]
        : Array.from({ length: 40 }, (_, i) => row(`ordinary-${i + 1}`, `普通范围${i + 1}`))
      const payload = { data: list.slice((pageNumber - 1) * size, pageNumber * size).map(data => path === todoPath
        ? { _id: 'node-' + data._id, state: 0, nodeDef: { nodeType: 'forms' }, data } : data),
        total: list.length, page: pageNumber, rows: size }
      const held = pageNumber === 2 ? state.pageGate : null
      if (held) { state.pageGate = null; event('page2:held'); held.arrived(); const fail = await held.response; event('page2:released'); if (fail) return ok({ message: 'synthetic late page failure' }, 503) }
      return ok(payload)
    }
    if (['basic/serviceAppointment/queryById/ordinary-1', 'basic/serviceAppointment/queryById/ordinary-21', 'basic/serviceAppointment/queryById/searched'].includes(path)) {
      const id = path.split('/').at(-1)!
      const sa = { ...row(id, id === 'searched' ? '搜索新结果' : id === 'ordinary-21' ? '普通范围21' : '普通范围1'), workflowId: 'synthetic-workflow' }
      return ok({ status: 1, success: true, data: { serviceAppointment: sa,
        workflow: { _id: 'synthetic-workflow', formDataId: sa._id, state: 0 }, workflowNode: [] } })
    }
    if (path === 'code/query' && body['is:type|string#and'] === 'STATUS') return ok({ data: [], total: 0, page: Number(body.page), rows: Number(body.rows) })
    state.unexpected.push(request.method() + ' ' + path)
    return route.abort('blockedbyclient')
  })
  return state
}
async function login(page: Page) {
  await page.locator('.launch-cta').click()
  await page.locator('.method-card').filter({ hasText: '快捷登录' }).click()
  await expect(page.locator('.home-page')).toBeVisible()
}
async function open(page: Page) {
  await page.goto('/#/pages/index/index')
  await login(page)
  await page.locator('.work-orders-entry').click()
  await expect(names(page)).toHaveCount(20)
  await expect(category(page, 'all')).toHaveAttribute('aria-selected', 'true')
}
async function release(page: Page, held: ReturnType<typeof gate>, suffix: string, fail = false) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(suffix))
  held.release(fail)
  await (await response).finished()
  // Flush the completed transport's normal browser/Vue rendering, not a timed sleep.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}
async function evidence(page: Page, info: TestInfo, state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
  for (const call of state.calls.filter(c => [ordinary, todoPath].includes(c.path))) {
    for (const key of ['tenantId', 'notFilterBelongTo', 'notFilterOrgId', 'type', '_all']) expect(call.body).not.toHaveProperty(key)
    expect(call.body.orderState).not.toBe('all')
    expect(call.query).toEqual({})
  }
  expect(state.calls.every(c => c.method === 'POST')).toBe(true)
  for (const call of state.calls.filter(c => c.path === 'function/queryTreeByRoleId')) {
    expect(call.query).toEqual({roleId:'synthetic-role'}); expect(call.body).toEqual({})
  }
  expect(state.calls.some(c => c.path === 'function/changeRole')).toBe(false)
  for (const call of state.calls.filter(c => c.path.startsWith('basic/serviceAppointment/queryById/'))) { expect(call.body).toEqual({}); expect(call.query).toEqual({}) }
  await info.attach('authority-timing-and-requests', { body: JSON.stringify({ ...state, menuGate: undefined, pageGate: undefined,
    realBackend: 'NOT_RUN', browser: 'normal App, synthetic intercepted API only' }, null, 2), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('authority-final-430.png'), fullPage: true })
}

test('fresh dual menus authorize ordinary All without permission bypass parameters', async ({ page, baseURL }, info) => {
  const s = await fixture(page, baseURL!); await open(page)
  const calls = s.calls.filter(c => [ordinary, todoPath].includes(c.path))
  expect(calls).toHaveLength(1); expect(calls[0]!.path).toBe(ordinary)
  expect(calls[0]!.body).toEqual({ page: '1', rows: '20', sortField: 'createTime', sortOrder: 'desc', 'is:state|integer#and': '1' })
  await evidence(page, info, s)
})
for (const mode of ['todo-only', 'drift'] as const) {
  test(`page two rejects ${mode} menu drift and clears old rows before explicit retry`, async ({ page, baseURL }, info) => {
    const s = await fixture(page, baseURL!); await open(page); s.menus = mode
    await page.locator('.load-more').click()
    await expect(page.getByText('工单加载失败', { exact: true })).toBeVisible()
    await expect(names(page)).toHaveCount(0)
    expect(s.calls.filter(c => [ordinary, todoPath].includes(c.path))).toHaveLength(1)
    await page.getByText('再次尝试', { exact: true }).click()
    await expect(names(page)).toHaveText(['待联系新结果'])
    const last = s.calls.filter(c => [ordinary, todoPath].includes(c.path)).at(-1)!
    expect(last.path).toBe(todoPath); expect(last.body.page).toBe('1'); expect(last.body.orderState).toBe('todo')
    await evidence(page, info, s)
  })
}
for (const target of ['page', 'menu'] as const) for (const fail of [false, true]) {
  test(`late ${target} ${fail ? 'failure' : 'success'} cannot replace a newer category and search`, async ({ page, baseURL }, info) => {
    const s = await fixture(page, baseURL!); await open(page)
    const held = gate(); if (target === 'page') s.pageGate = held; else s.menuGate = held
    await page.locator('.load-more').click(); await held.entered
    await category(page, 'need_contact').click()
    await expect(names(page)).toHaveText(['待联系新结果'])
    await page.getByTestId('app-search-bar').locator('input').fill('搜索')
    await page.locator('.search-button').click(); await expect(names(page)).toHaveText(['搜索新结果'])
    s.events.push({event:'new-search:rendered',at:Date.now()})
    await release(page, held, target === 'page' ? ordinary : 'function/queryTreeByRoleId', fail)
    s.events.push({event:'old-response:network-finished-and-render-flushed',at:Date.now()})
    await expect(names(page)).toHaveText(['搜索新结果'])
    await expect(category(page, 'need_contact')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('app-search-bar').locator('input')).toHaveValue('搜索')
    if (target === 'menu') expect(s.calls.filter(c => c.path === ordinary && c.body.page === '2')).toHaveLength(0)
    // The late response must not revoke the newer listed-ID either.
    await page.locator('.work-order-card').click()
    await expect(page.getByTestId('ds02b-detail-record-card')).toContainText('搜索新结果')
    expect(s.calls.filter(c=>c.path==='basic/serviceAppointment/queryById/searched')).toHaveLength(1)
    await evidence(page, info, s)
  })
}
test('logout and a new normal login isolate a late old pagination response', async ({ page, baseURL }, info) => {
  const s = await fixture(page, baseURL!); await open(page)
  const held = gate(); s.pageGate = held
  await page.locator('.load-more').click(); await held.entered
  await page.goBack(); await expect(page.locator('.home-page')).toBeVisible()
  await page.getByText('退出登录', { exact: true }).click(); await expect(page.locator('.login-page')).toBeVisible()
  await login(page); await page.locator('.work-orders-entry').click()
  await expect(names(page)).toHaveText(['新会话结果'])
  s.events.push({event:'new-session:rendered',at:Date.now()})
  await release(page, held, ordinary)
  s.events.push({event:'old-response:network-finished-and-render-flushed',at:Date.now()})
  await expect(names(page)).toHaveText(['新会话结果']); expect(s.logins).toBe(2)
  await evidence(page, info, s)
})

test('normal history forward cannot reopen an old listed-ID after menu withdrawal', async ({page,baseURL}, info) => {
  const s=await fixture(page,baseURL!);await open(page)
  await page.locator('.work-order-card').first().click()
  await expect(page.getByTestId('ds02b-detail-record-card')).toContainText('普通范围1')
  expect(s.calls.filter(c=>c.path==='basic/serviceAppointment/queryById/ordinary-1')).toHaveLength(1)
  await page.goBack();await expect(names(page)).toHaveCount(20)
  s.menus='todo-only';await page.locator('.load-more').click()
  await expect(page.getByText('工单加载失败',{exact:true})).toBeVisible();await expect(names(page)).toHaveCount(0)
  await page.goForward()
  await expect(page.getByText('工单详情暂不可用',{exact:true})).toBeVisible()
  await expect(page.locator('.detail-content')).toHaveCount(0)
  expect(s.calls.filter(c=>c.path==='basic/serviceAppointment/queryById/ordinary-1')).toHaveLength(1)
  await evidence(page,info,s)
})

test('late page success cannot resurrect a formerly visited page-two ID', async ({page,baseURL},info)=>{
  const s=await fixture(page,baseURL!);await open(page)
  await page.locator('.load-more').click();await expect(names(page)).toHaveCount(40)
  await page.locator('.work-order-card').filter({hasText:'普通范围21'}).click()
  await expect(page.getByTestId('ds02b-detail-record-card')).toContainText('普通范围21')
  await page.goBack();await expect(names(page)).toHaveCount(40)
  // Returning preserves pagination; rebuild page one through normal tabs.
  await category(page,'need_contact').click();await expect(names(page)).toHaveText(['待联系新结果'])
  await category(page,'all').click();await expect(names(page)).toHaveCount(20)
  const held=gate();s.pageGate=held
  await page.locator('.load-more').click();await held.entered
  await category(page,'need_contact').click();await expect(names(page)).toHaveText(['待联系新结果'])
  await page.getByTestId('app-search-bar').locator('input').fill('搜索')
  await page.locator('.search-button').click();await expect(names(page)).toHaveText(['搜索新结果'])
  s.events.push({event:'new-search:rendered',at:Date.now()})
  await release(page,held,ordinary)
  await expect(names(page)).toHaveText(['搜索新结果'])
  await page.goForward()
  await expect(page.getByText('工单详情暂不可用',{exact:true})).toBeVisible()
  await expect(page.locator('.detail-content')).toHaveCount(0)
  expect(s.calls.filter(c=>c.path==='basic/serviceAppointment/queryById/ordinary-21')).toHaveLength(1)
  await evidence(page,info,s)
})
