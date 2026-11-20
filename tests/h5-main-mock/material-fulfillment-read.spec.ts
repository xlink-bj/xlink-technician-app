import { expect, test } from '@playwright/test'

const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
const screenshots = `.review/g08-g09/${brand}`
test.use({ serviceWorkers: 'block' })

test('reads same-work-order material and rechecks batch arrival with the local App', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const unexpected: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    const resource = request.resourceType()
    if (new URL(request.url()).origin === origin && request.method() === 'GET' && !['xhr', 'fetch'].includes(resource)) {
      return route.continue()
    }
    unexpected.push(`${request.method()} ${resource}`)
    return route.abort()
  })

  await page.setViewportSize({ width: 430, height: 932 })
  const panel = page.getByTestId('material-fulfillment')
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-002')
  await expect(page.getByTestId('construction-read-entry')).toBeVisible()
  await expect(panel).toHaveCount(0)

  await page.goto('/#/pages/index/index')
  await page.getByTestId('home-schedule-mock-work-order-002').click()
  const read = panel.getByTestId('material-fulfillment-read')
  await expect(page.getByText('查看报价与订单', { exact: true })).toBeVisible()
  await expect(panel).toContainText('演示记录 · 只读')
  await expect(panel.getByTestId('material-request')).toHaveCount(0)
  await page.screenshot({ path: `${screenshots}/430x932/01-entry.png` })
  await read.click()

  const firstRequest = panel.getByTestId('material-request').filter({ hasText: 'CL-001' })
  const secondRequest = panel.getByTestId('material-request').filter({ hasText: 'CL-002' })
  await expect(firstRequest).toContainText('高分子防水卷材')
  await expect(firstRequest.getByTestId('material-delivery-batch')).toHaveCount(2)
  await expect(firstRequest.getByTestId('material-arrival-status')).toHaveText(['已到货', '配送中'])
  await expect(secondRequest.getByTestId('material-arrival-status')).toHaveText('到货待核实')
  await panel.screenshot({ path: `${screenshots}/430x932/02-records.png` })
  await read.click()
  await expect(firstRequest.getByTestId('material-arrival-status')).toHaveText(['已到货', '已到货'])
  await expect(firstRequest.getByTestId('material-delivery-batch').filter({ hasText: 'PS-002' }))
    .toContainText('更新于 11月20日 08:40')
  await expect(secondRequest.getByTestId('material-arrival-status')).toHaveText('到货待核实')
  await expect(panel.locator('uni-button, button')).toHaveCount(1)
  await panel.screenshot({ path: `${screenshots}/430x932/03-rechecked.png` })

  for (const [width, height] of [[375, 667], [390, 844]]) {
    await page.setViewportSize({ width, height })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await read.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await panel.screenshot({ path: `${screenshots}/${width}x${height}/records.png` })
  }

  const patchRead = async (mode: 'failed' | 'empty' | 'normal') => {
    await page.evaluate(async mode => {
      const modulePath = '/src/app/dev-material-fulfillment-read.ts'
      const { materialFulfillmentMock } = await import(/* @vite-ignore */ modulePath)
      const testPage = window as Window & { materialReadOriginal?: typeof materialFulfillmentMock.read }
      testPage.materialReadOriginal ??= materialFulfillmentMock.read
      materialFulfillmentMock.read = mode === 'normal' ? testPage.materialReadOriginal
        : async (workOrderId: string) => {
            if (mode === 'failed') throw new Error('Synthetic read unavailable')
            return { workOrderId, requests: [], batches: [] }
          }
    }, mode)
  }

  await page.setViewportSize({ width: 430, height: 932 })
  await patchRead('failed')
  await read.click()
  await expect(panel.getByTestId('material-fulfillment-error')).toHaveText('到货状态暂时无法核对。')
  await expect(panel.getByTestId('material-delivery-batch')).toHaveCount(0)
  await panel.screenshot({ path: `${screenshots}/430x932/04-read-failed.png` })
  await patchRead('empty')
  await read.click()
  await expect(panel.getByTestId('material-fulfillment-empty')).toBeVisible()
  await panel.screenshot({ path: `${screenshots}/430x932/05-empty.png` })
  await patchRead('normal')
  await read.click()
  await expect(panel.getByTestId('material-delivery-batch')).toHaveCount(3)

  await page.evaluate(async () => {
    const modulePath = '/src/shared/state/index.ts'
    const session = (await import(/* @vite-ignore */ modulePath)).useSessionStore()
    session.session.currentRole.id = 'different-synthetic-role'
  })
  await expect(panel).toHaveCount(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})
