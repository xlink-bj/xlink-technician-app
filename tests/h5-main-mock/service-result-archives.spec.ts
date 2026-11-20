import { expect, test, type Page } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const enabled = process.env.VITE_XLINK_G06_G07_ARCHIVES === 'true'
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const directory = `.review/g06-g07-h5/${brand}/430x932`
const workOrderId = 'mock-work-order-002'
const destinations = {
  acceptance: { title: '正式验收结果', number: 'YS-04009-01', record: 'mock-g06-acceptance-04009' },
  warranty: { title: '已发质保卡', number: 'ZB-04009-01', record: 'mock-g07-warranty-04009' },
} as const
type ArchiveKind = keyof typeof destinations

test.use({ viewport: { width: 430, height: 932 } })

async function openWorkOrder(page: Page, query = '') {
  await page.goto(`/${query}#/pages/index/index`)
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum: '04009', customer: '陈女士' })).click()
  await expect(page.getByTestId('work-order-archives')).toBeVisible()
  await expect(page.locator('.uni-page-head__title')).toHaveText('工单详情')
}

async function guard(page: Page, baseURL: string) {
  const unexpected: string[] = []
  page.on('pageerror', error => unexpected.push(error.message))
  await page.context().route('**/*', route => {
    const request = route.request()
    if (new URL(request.url()).origin === baseURL && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    unexpected.push(`${request.method()} ${new URL(request.url()).origin}`)
    return route.abort()
  })
  return () => expect(unexpected).toEqual([])
}

function archiveLink(page: Page, kind: ArchiveKind) {
  return page.getByTestId(`service-archive-open-${kind}`)
}

function archiveRoute(kind: ArchiveKind, order = workOrderId, record: string = destinations[kind].record) {
  return `#/pages/work-orders/detail?id=${order}&read=g06-g07-service-archive&archive=${kind}&record=${record}`
}

async function capture(page: Page, filename: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(430)
  await page.screenshot({ path: `${directory}/${filename}.png`, animations: 'disabled' })
}

async function openArchive(page: Page, kind: ArchiveKind) {
  await archiveLink(page, kind).click()
  await expect(page.locator('.uni-page-head__title')).toHaveText(destinations[kind].title)
  const hash = new URL(page.url()).hash
  expect(hash).toBe(archiveRoute(kind))
  return page.getByTestId('dev-service-archive-detail')
}

test('the ordinary work order exposes the two archive links only when explicitly enabled', async ({ page, baseURL }) => {
  const checkNetwork = await guard(page, baseURL!)
  await openWorkOrder(page)
  for (const kind of ['acceptance', 'warranty'] as const) {
    await expect(archiveLink(page, kind)).toHaveCount(enabled ? 1 : 0)
  }
  if (!enabled) {
    await page.goto(`/${archiveRoute('acceptance')}`)
    await expect(page.getByTestId('work-order-archives')).toBeVisible()
    await expect(page.getByTestId('dev-service-archive-detail')).toHaveCount(0)
    await expect(page.locator('.uni-page-head__title')).toHaveText('工单详情')
  }
  checkNetwork()
})

if (enabled) {
  test('technician opens and reopens each exact record, then the alternate role cannot read either saved URL', async ({ page, baseURL }) => {
    const checkNetwork = await guard(page, baseURL!)
    await openWorkOrder(page)
    const materialRead = page.getByTestId('material-fulfillment')
    const materialWorkflow = page.getByTestId('material-workflow')
    await expect(materialRead).toBeVisible()
    await expect(materialWorkflow).toBeVisible()
    await archiveLink(page, 'warranty').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 20))
    await capture(page, '01-detail-overview')
    for (const [kind, other] of [['acceptance', 'warranty'], ['warranty', 'acceptance']] as const) {
      for (let visit = 0; visit < 2; visit++) {
        const view = await openArchive(page, kind)
        await expect(materialRead).not.toBeVisible()
        await expect(materialWorkflow).not.toBeVisible()
        await expect(view.getByTestId('service-archive-record')).toContainText(destinations[kind].number)
        await expect(view).toContainText('04009')
        await expect(view).not.toContainText(destinations[other].number)
        await expect(view.locator('a,uni-navigator,button,uni-button')).toHaveCount(0)
        if (visit === 0) await capture(page, `02-${kind}`)
        await page.goBack()
        await expect(page.locator('.uni-page-head__title')).toHaveText('工单详情')
        await expect(archiveLink(page, kind)).toBeVisible()
        await expect(materialWorkflow).toBeVisible()
      }
    }

    await openWorkOrder(page, '?archiveRole=observer')
    await expect(materialRead).toHaveCount(0)
    await expect(materialWorkflow).toHaveCount(0)
    for (const kind of ['acceptance', 'warranty'] as const) {
      await expect(page.getByTestId(`service-archive-${kind}`)).toHaveAttribute('data-read-state', 'denied')
      await expect(archiveLink(page, kind)).toHaveCount(0)
    }
    for (const kind of ['acceptance', 'warranty'] as const) {
      await page.goto(`/?archiveRole=observer${archiveRoute(kind)}`)
      const view = page.getByTestId('dev-service-archive-detail')
      await expect(view).toContainText(`当前账号无权查看${destinations[kind].title}`)
      await expect(view.getByTestId('service-archive-record')).toHaveCount(0)
      await expect(view).not.toContainText(/YS-04009|ZB-04009|读取失败|暂无/)
      if (kind === 'warranty') await capture(page, '03-observer-denied')
    }
    await openWorkOrder(page)
    await expect((await openArchive(page, 'acceptance')).getByTestId('service-archive-record')).toContainText(destinations.acceptance.number)
    checkNetwork()
  })

  test('successful empty, transient retry and wrong record stay distinct in the actual detail page', async ({ page, baseURL }) => {
    const checkNetwork = await guard(page, baseURL!)
    await openWorkOrder(page, '?archiveScenario=empty')
    for (const kind of ['acceptance', 'warranty'] as const) {
      const card = page.getByTestId(`service-archive-${kind}`)
      await expect(card).toHaveAttribute('data-read-state', 'empty')
      await expect(card).toContainText(`暂无${destinations[kind].title}`)
      await expect(archiveLink(page, kind)).toHaveCount(0)
    }
    await page.getByTestId('service-archive-warranty').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 20))
    await capture(page, '04-authorized-empty')
    await page.goto(`/?archiveScenario=empty${archiveRoute('acceptance')}`)
    await expect(page.getByTestId('dev-service-archive-detail')).toContainText('暂无正式验收结果')

    await openWorkOrder(page, '?archiveScenario=transient')
    for (const kind of ['acceptance', 'warranty'] as const) {
      const view = await openArchive(page, kind)
      await expect(view).toContainText(`${destinations[kind].title}读取失败`)
      await expect(view).not.toContainText(/无权|暂无|YS-04009|ZB-04009/)
      if (kind === 'acceptance') await capture(page, '05-transient-failure')
      const location = page.url()
      await view.getByTestId('service-archive-retry').click()
      await expect(view.getByTestId('service-archive-record')).toContainText(destinations[kind].number)
      await expect(view.getByTestId('service-archive-retry')).toHaveCount(0)
      expect(page.url()).toBe(location)
      if (kind === 'acceptance') await capture(page, '06-recovered-same-record')
      await page.goBack()
    }

    await page.goto(`/${archiveRoute('warranty', workOrderId, destinations.acceptance.record)}`)
    await expect(page.getByTestId('dev-service-archive-detail')).toContainText('当前账号无权查看已发质保卡')
    await expect(page.getByTestId('service-archive-record')).toHaveCount(0)
    await page.goto(`/${archiveRoute('acceptance', 'mock-work-order-003')}`)
    await expect(page.getByText('当前工单档案不可查看。')).toBeVisible()
    await expect(page.getByTestId('service-archive-record')).toHaveCount(0)
    checkNetwork()
  })
}
