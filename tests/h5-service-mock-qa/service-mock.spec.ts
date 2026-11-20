import { expect, test, type Page } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const optedIn = process.env.VITE_XLINK_SERVICE_REVIEW === 'true'
const missReceipt = process.env.VITE_XLINK_SERVICE_REVIEW_MISS_RECEIPT === 'true'
const summary = { orderNum: '04009', customer: '陈女士（东坝国际商贸中心业主）' }

async function localOnly(page: Page, baseURL: string) {
  const unexpected: string[] = []
  page.on('pageerror', error => unexpected.push(error.message))
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin.replace('ws:', 'http:') === baseURL) socket.connectToServer()
    else { unexpected.push('non-loopback WebSocket'); socket.close() }
  })
  await page.route('**/*', route => {
    const request = route.request()
    if (new URL(request.url()).origin !== baseURL || !['GET', 'HEAD'].includes(request.method())
      || ['fetch', 'xhr'].includes(request.resourceType())) {
      unexpected.push(request.method() + ' ' + new URL(request.url()).pathname)
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  return unexpected
}

async function openCustomer(page: Page) {
  await page.goto('/#/pages/index/index')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, summary)).click()
  await page.getByTestId('customer-summary').click()
  await expect(page).toHaveURL(/id=mock-work-order-002&read=customer/)
  await expect(page.locator('.customer-info-panel')).toBeVisible()
}

test('G12 changes only the local address snapshot and recovers the original receipt after same-order refresh', async ({ page, baseURL }, info) => {
  const unexpected = await localOnly(page, baseURL!)
  await openCustomer(page)
  const panel = page.getByTestId('service-mock-panel')
  if (!optedIn) {
    await expect(panel).toHaveCount(0)
    expect(unexpected).toEqual([])
    return
  }

  const baseline = await page.locator('.customer-info-panel').innerText()
  await expect(panel).toBeVisible()
  await panel.getByTestId('service-mock-submit').click()
  await expect(panel).toContainText('请填写不同于原地址的新服务地址')
  await panel.getByTestId('service-mock-address').locator('input').fill('合成更正地址 2 号')
  await panel.getByTestId('service-mock-submit').click()
  await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  await panel.getByTestId('service-mock-read').click()
  await expect(panel).toContainText('请先重新读取本单')
  await panel.getByTestId('service-mock-refresh').click()
  await expect(panel.getByTestId('service-mock-read')).toBeVisible()
  await panel.getByTestId('service-mock-read').click()
  if (missReceipt) {
    await expect(panel).toContainText('回执暂不可确认')
    await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  } else await expect(panel.getByTestId('service-mock-receipt')).toContainText('G12-002-01')

  await page.goBack()
  await expect(page.getByTestId('customer-summary')).toBeVisible()
  await page.getByTestId('customer-summary').click()
  await expect(panel.getByTestId('service-mock-read')).toBeVisible()
  await panel.getByTestId('service-mock-read').click()
  await expect(panel.getByTestId('service-mock-receipt')).toContainText('G12-002-01')
  await expect(panel.getByTestId('service-mock-snapshot')).toHaveText('合成更正地址 2 号')
  expect(await page.locator('.customer-info-panel').innerText()).toBe(baseline)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(unexpected).toEqual([])
  await info.attach('g12-result', { contentType: 'application/json', body: JSON.stringify({ refresh: 'same order', originalReceipt: 'G12-002-01', outsideOrWriteRequests: unexpected }) })
})

const locationDenied = process.env.VITE_XLINK_SERVICE_REVIEW_LOCATION_DENIED === 'true'

async function openSurvey(page: Page) {
  await page.getByTestId('home-schedule-mock-work-order-017-survey-success').click()
  await expect(page).toHaveURL(/id=mock-work-order-017-survey-success/)
  await expect(page.locator('.detail-page')).toContainText('邓先生')
}

async function openPrivacy(page: Page) {
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '26019', customer: '蒋女士' })).click()
  await expect(page).toHaveURL(/id=mock-work-order-019-continuous-journey/)
  await expect(page.locator('.detail-page')).toContainText('蒋女士')
}

test('G13 captures synthetic location and time and reopens the same survey receipt', async ({ page, baseURL }, info) => {
  const unexpected = await localOnly(page, baseURL!)
  await page.goto('/#/pages/index/index')
  await openSurvey(page)
  const panel = page.getByTestId('service-mock-panel')
  if (!optedIn) {
    await expect(panel).toHaveCount(0)
    expect(unexpected).toEqual([])
    return
  }

  await expect(panel).toContainText('勘查到场打卡')
  await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  await panel.getByTestId('service-mock-capture').click()
  if (locationDenied) {
    await expect(panel).toContainText('模拟定位不可用，未生成到场记录')
    await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
    await expect(panel.getByTestId('service-mock-read')).toHaveCount(0)
    await page.goBack()
    await openSurvey(page)
    await expect(panel.getByTestId('service-mock-capture')).toBeVisible()
    await expect(panel.getByTestId('service-mock-read')).toHaveCount(0)
    expect(unexpected).toEqual([])
    return
  }

  const sample = panel.getByTestId('service-mock-capture-result')
  await expect(sample).toContainText('39.9700, 116.4300')
  await expect(sample).toContainText(/采集时间 \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC/)
  const originalTime = await sample.locator('uni-text').last().innerText()
  await panel.getByTestId('service-mock-submit').click()
  await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  await panel.getByTestId('service-mock-read').click()
  if (missReceipt) {
    await expect(panel).toContainText('回执暂不可确认')
    await expect(panel.getByTestId('service-mock-capture')).toHaveCount(0)
  } else await expect(panel.getByTestId('service-mock-receipt')).toContainText('G13-017-01')

  await page.goBack()
  await openSurvey(page)
  await panel.getByTestId('service-mock-read').click()
  await expect(panel.getByTestId('service-mock-receipt')).toContainText('G13-017-01')
  await expect(panel.getByTestId('service-mock-survey-receipt')).toContainText(originalTime)
  await expect(panel.getByTestId('service-mock-survey-receipt')).toContainText('39.9700, 116.4300')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(unexpected).toEqual([])
  await info.attach('g13-result', { contentType: 'application/json', body: JSON.stringify({ task: '017 survey', originalReceipt: 'G13-017-01', outsideOrWriteRequests: unexpected }) })
})

test('G14 requests a synthetic privacy appointment and keeps the contact outcome unconfirmed', async ({ page, baseURL }, info) => {
  const unexpected = await localOnly(page, baseURL!)
  await page.goto('/#/pages/index/index')
  await openPrivacy(page)
  const panel = page.getByTestId('service-mock-panel')
  if (!optedIn) {
    await expect(panel).toHaveCount(0)
    expect(unexpected).toEqual([])
    return
  }

  await expect(panel).toContainText('隐私号预约申请')
  await panel.getByTestId('service-mock-submit').click()
  await expect(panel).toContainText('请选择拟约时段')
  await panel.getByTestId('service-mock-window-afternoon').click()
  await panel.getByTestId('service-mock-submit').click()
  await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  await panel.getByTestId('service-mock-read').click()
  if (missReceipt) {
    await expect(panel).toContainText('回执暂不可确认')
    await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  } else await expect(panel.getByTestId('service-mock-receipt')).toContainText('G14-019-01')

  await page.goBack()
  await (await searchMockWorkOrder(page, { orderNum: '26019', customer: '蒋女士' })).click()
  await panel.getByTestId('service-mock-read').click()
  await expect(panel.getByTestId('service-mock-receipt')).toContainText('G14-019-01')
  const receipt = panel.getByTestId('service-mock-privacy-receipt')
  await expect(receipt).toContainText(/申请时段 \d{4}-\d\d-\d\d 14:00–16:00（北京时间）/)
  await expect(receipt).toContainText('联系结果：未联系，预约未确认')
  await expect(panel.locator('a[href^="tel:"],a[href^="sms:"]')).toHaveCount(0)
  await expect(page.locator('.detail-page')).toContainText('开始预约')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(unexpected).toEqual([])
  await info.attach('g14-result', { contentType: 'application/json', body: JSON.stringify({ appointment: '019', originalReceipt: 'G14-019-01', contactOutcome: 'not_contacted', outsideOrWriteRequests: unexpected }) })
})

test('survey draft is discarded when its exact task or synthetic role is replaced', async ({ page, baseURL }) => {
  test.skip(!optedIn || locationDenied, 'The opted-in successful synthetic capture is required')
  const unexpected = await localOnly(page, baseURL!)
  await page.goto('/#/pages/index/index')
  await openSurvey(page)
  const panel = page.getByTestId('service-mock-panel')
  await panel.getByTestId('service-mock-capture').click()
  await expect(panel.getByTestId('service-mock-submit')).toBeVisible()

  // Change the actual mounted page's projection, without extending the Mock
  // fixture or writing to the backend. The page must drop the old intent.
  await page.evaluate(() => {
    const root = document.getElementById('app') as any
    const store = root?.__vue_app__?.config.globalProperties.$pinia?._s.get('workOrderDetail')
    const detail = store?.detail
    if (detail?.id !== 'mock-work-order-017-survey-success'
      || detail.workflowNodes?.[0]?.id !== 'mock-workflow-node-017-inspection') {
      throw Error('Expected the exact mounted survey task')
    }
    ;(window as any).restoreSurveyTask = () => { store.detail = detail }
    store.detail = { ...detail, workflowNodes: [{ ...detail.workflowNodes[0], id: 'other-synthetic-node' }] }
  })
  await expect(panel).toHaveCount(0)
  await page.evaluate(() => {
    const runtime = window as any
    runtime.restoreSurveyTask()
    delete runtime.restoreSurveyTask
  })
  await expect(panel.getByTestId('service-mock-capture')).toBeVisible()
  await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  await expect(panel.getByTestId('service-mock-read')).toHaveCount(0)

  await panel.getByTestId('service-mock-capture').click()
  await expect(panel.getByTestId('service-mock-submit')).toBeVisible()
  await page.evaluate(() => {
    const root = document.getElementById('app') as any
    const store = root?.__vue_app__?.config.globalProperties.$pinia?._s.get('session')
    const actor = store?.session
    if (actor?.currentRole?.id !== 'synthetic-role') throw Error('Expected the exact mounted synthetic role')
    ;(window as any).restoreServiceRole = () => { store.session = actor }
    store.session = { ...actor, currentRole: { id: 'other-synthetic-role' }, roleVersion: 'service-review-revoked' }
  })
  await expect(panel).toHaveCount(0)
  await page.evaluate(() => {
    const runtime = window as any
    runtime.restoreServiceRole()
    delete runtime.restoreServiceRole
  })
  await expect(panel.getByTestId('service-mock-capture')).toBeVisible()
  await expect(panel.getByTestId('service-mock-submit')).toHaveCount(0)
  await expect(panel.getByTestId('service-mock-read')).toHaveCount(0)
  expect(unexpected).toEqual([])
})
