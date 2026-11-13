import { isWorkOrderInformationRead } from '../support/work-order-information-fixture'
import { expect, test } from '@playwright/test'
import { enterNormalFormWorkspace, leaveNormalFormForList } from '../support/normal-form-workspace-entry'
import { normalSurveyCauseReadFixture } from '../support/normal-survey-cause-read-fixture'

test.skip(process.env.XLINK_H5_NORMAL_SURVEY_CAUSE_READ !== 'true', 'Opt-in synthetic normal Survey readonly experience')
for (const mode of ['current', 'duplicate-provider', 'foreign-record', 'raw-conflict', 'metadata-reload', 'late-provider', 'logout-role'] as const) {
 test(`normal Survey readonly experience ${mode}`, async ({ page, baseURL }, info) => {
  const f = normalSurveyCauseReadFixture(), unexpected: string[] = [], errors: string[] = []
  let queries = 0, logins = 0, loginRole = 'r', releaseOld: (() => Promise<void>) | undefined
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  if (mode === 'duplicate-provider') f.providerRows.push({ part: '1', leakageCause: 'cause-a', label: '歧义原因' })
  if (mode === 'raw-conflict') (f.raw.exts as Record<string, unknown>).leakageCause = ['other-cause']
  await page.routeWebSocket('**/*', socket => {
   if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer()
   else { unexpected.push('WS ' + socket.url()); socket.close() }
  })
  await page.route('**/*', async route => {
   if (isWorkOrderInformationRead(route.request(), baseURL!)) return route.fulfill({ json: { success: false, message: 'Synthetic information configuration unavailable' } })
   const request = route.request(), url = new URL(request.url())
   if (url.origin !== baseURL) { unexpected.push('external:' + url.origin); return route.abort() }
   if (!url.pathname.startsWith('/xlink/wm/')) {
    if (request.method() === 'GET' && !['xhr', 'fetch'].includes(request.resourceType())) return route.continue()
    unexpected.push(request.method() + ' ' + url.pathname); return route.abort('blockedbyclient')
   }
   const path = url.pathname.slice('/xlink/wm/'.length), body = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
   const ok = (json: unknown) => route.fulfill({ json })
   if (path === 'index/phoneLogin.do') {logins++;return ok({ success: true, status: 1, data: { token: 'synthetic-cause-session-'+logins, user: { _id: 'u', tenantId: 't' }, currentRole: { _id: loginRole }, capabilityNames: [] } })}
   if (['function/changeRole', 'function/queryTreeByRoleId'].includes(path)) return ok({ data: { functionList: [{ functionList: [{ order: 1, exts: { tabDisplay: '1' }, action: '/pages/serviceAppointment/serviceAppointments?type=SANode&orderState=0' }] }] } })
   if (['basic/serviceAppointment/query', 'basic/serviceAppointment/querySAWorkflowNode'].includes(path)) return ok({ data: [{ ...f.node, data: f.sa }], total: 1, page: 1, rows: 20 })
   if (['code/query', 'biz/action/query.do'].includes(path)) return ok({ data: [], total: 0, page: 1, rows: 20 })
   if (path === 'biz/extForm/queryByColName/leakageCause') {
    queries++
    if (mode === 'late-provider' && queries === 1) { f.calls.push(path); releaseOld = () => ok({ data: [{ part: '1', leakageCause: 'cause-a', label: '过期原因' }] }); return }
   }
   try { return await ok(await f.execute({ path, body })) }
   catch { if (!f.commands.length && !f.uploads.length && !f.processes.length) unexpected.push(path); return route.abort() }
  })
  const read = () => page.getByTestId('r1-normal-form-read').locator('.app-button').filter({ hasText: '读取已保存表单' }).click()
  const dedicated = () => page.getByTestId('survey-leakage-cause-read')
  try {
   await page.goto('/#/pages/index/index'); await page.locator('.launch-cta').click()
   await page.locator('.method-card').filter({ hasText: '快捷登录' }).click(); await expect(page.locator('.home-page')).toBeVisible()
   await page.locator('.work-orders-entry').click(); await page.locator('.work-order-card').click(); await enterNormalFormWorkspace(page)
   const originalWorkspaceUrl=page.url()
   await read()
   if (mode === 'foreign-record') {
    await expect(dedicated()).toContainText('原因A');await expect(page.getByTestId('r1-normal-value-width')).toHaveText('0')
    f.raw.tenantId='foreign-tenant';await read()
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText('暂时无法完整核实')
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(0); await expect(dedicated()).toHaveCount(0);await expect(page.getByTestId('r1-normal-value-width')).toHaveCount(0)
   } else if (mode === 'raw-conflict') {
    await expect(page.getByTestId('r1-normal-form-read-message')).toContainText(/已从后台读取|暂时无法完整核实/)
    await expect(dedicated()).toHaveCount(0)
    // Conflicting raw slots cannot acquire verified domain labels, regardless
    // of whether the existing reader rejects or exposes generic unavailable UI.
    await expect(page.getByTestId('r1-normal-form-read')).not.toContainText('原因A')
   } else {
    await expect(page.getByTestId('r1-normal-form-record')).toHaveCount(1)
    await expect(page.getByTestId('r1-normal-value-width')).toHaveText('0')
    if (mode === 'late-provider') {
     await expect.poll(() => queries).toBe(1)
     f.raw.width=9;await read(); await expect(dedicated()).toContainText('原因A');await expect(page.getByTestId('r1-normal-value-width')).toHaveText('9')
     expect(releaseOld).toBeDefined();const oldResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('biz/extForm/queryByColName/leakageCause'))
     await releaseOld!();await (await oldResponse).finished()
     await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
     await expect(dedicated()).not.toContainText('过期原因');await expect(page.getByTestId('r1-normal-value-width')).toHaveText('9')
    } else {
     await expect(dedicated()).toContainText(mode === 'duplicate-provider' ? '未解析（cause-a）' : '原因A')
     if (mode === 'duplicate-provider') await expect(dedicated()).not.toContainText('歧义原因')
     if (mode === 'metadata-reload') {
      f.fields.find(row => row.name === 'leakageCause')!.multiple = false;f.raw.width=9
      await read(); await expect(dedicated()).toHaveCount(0);await expect(page.getByTestId('r1-normal-value-width')).toHaveText('9')
     }
     if(mode==='logout-role'){
      await expect(page.getByTestId('r1-normal-value-width')).toHaveText('0');await leaveNormalFormForList(page)
      await page.goBack();await expect(page.locator('.home-page')).toBeVisible()
      await page.getByText('退出登录',{exact:true}).click();await expect(page.locator('.login-page')).toBeVisible()
      loginRole='other-role';await page.locator('.launch-cta').click();await page.locator('.method-card').filter({hasText:'快捷登录'}).click();await expect(page.locator('.home-page')).toBeVisible()
      await page.locator('.work-orders-entry').click();await page.locator('.work-order-card').click()
      await expect(page.getByTestId('normal-form-workspace-content')).toHaveCount(0);await expect(page.getByTestId('r1-normal-value-width')).toHaveCount(0);await expect(dedicated()).toHaveCount(0)
      // Revisit the actual previously captured route under the new login; no
      // new node/grant/store is constructed by this navigation.
      await page.goto(originalWorkspaceUrl);await expect(page.getByText('当前操作暂不可用',{exact:true})).toBeVisible()
      await expect(page.getByTestId('normal-form-workspace-content')).toHaveCount(0);await expect(page.getByTestId('r1-normal-value-width')).toHaveCount(0);await expect(dedicated()).toHaveCount(0);expect(logins).toBe(2)
     }
     if (mode === 'current') {
      expect(queries).toBe(1)
      await page.getByTestId('normal-form-workspace-back').click(); await expect(page).toHaveURL(/pages\/work-orders\/detail/)
      await enterNormalFormWorkspace(page); await read(); await expect(dedicated()).toContainText('原因A')
      expect(queries).toBe(2)
     }
    }
    await expect(page.locator('[data-testid="survey-leakage-cause-trigger"], [data-testid="survey-leakage-cause-read-trigger"], [data-testid^="r1-normal-edit-"], [data-testid^="r1-normal-complete-"], [data-testid="r1-normal-create"], [data-testid="r1-normal-append"]')).toHaveCount(0)
   }
   expect(f.commands).toEqual([]); expect(f.uploads).toEqual([]); expect(f.processes).toEqual([]); expect(unexpected).toEqual([]); expect(errors).toEqual([])
  } finally {
   if (releaseOld && queries < 2) await releaseOld()
   await info.attach('normal-survey-cause-ledger', { body: JSON.stringify({ mode, calls: f.calls, queries, logins, commands: f.commands, uploads: f.uploads, processes: f.processes, unexpected, errors }), contentType: 'application/json' })
  }
 })
}
