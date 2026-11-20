import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { searchMockWorkOrder } from '../support/search-mock-work-order'

async function openLogs(page: Page, reload = false) {
  await page.goto('/#/pages/index/index')
  if (reload) await page.reload()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '04009', customer: '陈女士' })).click()
  await page.getByTestId('construction-read-entry').click()
  await expect(page.getByTestId('construction-sop-entry')).toBeVisible()
}

function scopedTraffic(page: Page, baseURL: string) {
  const external: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const attached = page.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL).origin && request.method() === 'GET'
      && !url.pathname.startsWith('/api/')) return route.continue()
    external.push(request.method() + ' ' + url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  return {
    attached,
    expectOffline() {
      expect(external).toEqual([])
      expect(errors).toEqual([])
    },
  }
}

async function openWorkspace(page: Page) {
  await page.getByTestId('construction-sop-entry').click()
  await expect(page.getByTestId('construction-sop-assigned')).toBeVisible()
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name + '.png') })
}

async function returnToDetail(page: Page) {
  await page.evaluate(() => uni.navigateBack())
  await expect(page.getByTestId('construction-read-entry')).toBeVisible()
  await page.getByTestId('construction-read-entry').click()
  await openWorkspace(page)
}

async function injectFault(page: Page, operation: 'read' | 'create' | 'process', fault: 'reject' | 'lose-receipt') {
  await page.evaluate(async ([op, faultMode]) => {
    const dev = await import(/* @vite-ignore */ '/src/app/' + 'dev-construction-sop.ts')
    dev.setConstructionSopFixtureFault(op, faultMode)
  }, [operation, fault] as const)
}

test('G10 creates one linked set and reopens its original receipt after acknowledgement loss', async ({ page, baseURL }, info) => {
  const traffic = scopedTraffic(page, baseURL!)
  await traffic.attached
  await openLogs(page)
  await screenshot(page, info, '01-construction-archive')
  await openWorkspace(page)
  await page.getByTestId('construction-sop-add').click()
  const create = page.getByTestId('construction-sop-create')
  await expect(create).toHaveAttribute('disabled', 'true')
  await page.getByText('屋面排水口', { exact: true }).click()
  const description = page.getByTestId('construction-sop-description').locator('textarea').or(page.locator('textarea[data-testid="construction-sop-description"]'))
  await description.fill('检查排水口周边及收口。')
  await screenshot(page, info, '02-create-ready')

  await injectFault(page, 'create', 'reject')
  await create.click()
  await expect(page.getByTestId('construction-sop-feedback')).toContainText('未能创建')
  await expect(create).not.toHaveAttribute('disabled', 'true')
  await injectFault(page, 'create', 'lose-receipt')
  await create.click()
  await expect(page.getByTestId('construction-sop-feedback')).toContainText('结果待核对')
  await expect(create).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('construction-sop-record')).toHaveCount(0)
  await screenshot(page, info, '03-create-unknown')
  await page.getByTestId('construction-sop-recheck').click()
  const original = page.getByTestId('construction-sop-record')
  for (const id of ['C-26022', 'S-26022', 'E-26022', 'REQ-26022']) await expect(original).toContainText(id)
  await expect(page.getByTestId('construction-sop-node-receipt')).toHaveCount(0)
  await screenshot(page, info, '04-create-receipt')

  // Real page reload discards Vue state. The original receipt comes from the journal again.
  await openLogs(page, true)
  await openWorkspace(page)
  await expect(page.getByTestId('construction-sop-created')).toHaveCount(1)
  await expect(page.getByTestId('construction-sop-add')).toHaveCount(0)
  await page.getByTestId('construction-sop-created').click()
  for (const id of ['C-26022', 'S-26022', 'E-26022', 'REQ-26022']) await expect(original).toContainText(id)
  await expect(original).toContainText('检查排水口周边及收口。')
  traffic.expectOffline()
})

test('G17 explicitly completes the original assigned task and recovers its independent node receipt', async ({ page, baseURL }, info) => {
  const traffic = scopedTraffic(page, baseURL!)
  await traffic.attached
  await openLogs(page)
  await injectFault(page, 'read', 'reject')
  await page.getByTestId('construction-sop-entry').click()
  await expect(page.getByTestId('construction-sop-feedback')).toContainText('暂时无法读取')
  await expect(page.getByTestId('construction-sop-assigned')).toHaveCount(0)
  await page.getByTestId('construction-sop-recheck').click()
  await page.getByTestId('construction-sop-assigned').click()
  const original = page.getByTestId('construction-sop-record')
  await expect(original).toContainText('C-26021')
  const review = page.getByTestId('construction-sop-review-node')
  const process = page.getByTestId('construction-sop-process')
  await expect(review).toHaveAttribute('disabled', 'true')
  await page.getByTestId('construction-sop-note').locator('textarea').or(page.locator('textarea[data-testid="construction-sop-note"]'))
    .fill('基层和收口已复核，接缝连续。')
  await review.click()
  await expect(page.getByTestId('construction-sop-node-receipt')).toHaveCount(0)
  await screenshot(page, info, '05-node-confirm')
  await injectFault(page, 'process', 'reject')
  await process.click()
  await expect(page.getByTestId('construction-sop-feedback')).toContainText('节点未办理')
  await expect(original).toContainText('待办理')
  await review.click()
  await injectFault(page, 'process', 'lose-receipt')
  await process.click()
  await expect(page.getByTestId('construction-sop-feedback')).toContainText('结果待核对')
  await expect(page.getByTestId('construction-sop-node-receipt')).toHaveCount(0)
  await expect(review).toHaveCount(0)
  await screenshot(page, info, '06-node-unknown')

  await returnToDetail(page)
  await page.getByTestId('construction-sop-assigned').click()
  await expect(original).toContainText('C-26021')
  await expect(original).toContainText('已办理')
  await expect(page.getByTestId('construction-sop-node-receipt')).toContainText('基层和收口已复核，接缝连续。')
  await expect(page.getByTestId('construction-sop-add')).toHaveCount(0)
  // The creation lane is untouched. Return to the list to confirm this.
  await page.getByText('返回施工', { exact: true }).click()
  await expect(page.getByTestId('construction-sop-add')).toBeVisible()
  await page.getByTestId('construction-sop-assigned').click()
  await screenshot(page, info, '07-node-reopened')

  await page.evaluate(async () => {
    const { useSessionStore } = await import(/* @vite-ignore */ '/src/shared/state/' + 'index.ts')
    useSessionStore().session = null
  })
  await expect(page.getByTestId('construction-sop-workspace')).toHaveCount(0)
  await expect(page.getByTestId('construction-sop-entry')).toHaveCount(0)
  traffic.expectOffline()
})
