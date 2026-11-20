import { expect, type Page, type Request } from '@playwright/test'

type DetailLoadObserver = Window & { workOrderALoadSettled?: Promise<unknown> }

export async function observeWorkOrderALoad(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const modulePath = '/src/features/work-orders/detail.ts'
    const { useWorkOrderDetailStore } = await import(/* @vite-ignore */ modulePath) as typeof import('../../src/features/work-orders/detail')
    const workOrder = useWorkOrderDetailStore()
    // Observe the actual route action without replacing the store or the read.
    const workOrderALoadSettled = new Promise(resolve => {
      const stop = workOrder.$onAction(({ name, args, after, onError }) => {
        if (name !== 'loadFromRoute' || args[0] !== 'A') return
        stop()
        after(resolve)
        onError(() => resolve(null))
      }, true)
    })
    Object.assign(window, { workOrderALoadSettled })
  })
}

export async function expectWorkOrderBAfterLateInformationA(
  page: Page,
  requestA: Request,
  releaseA: () => void,
): Promise<void> {
  const pendingResponse = requestA.response()
  releaseA()
  const response = await pendingResponse
  if (!response) throw new Error('The held Work Order A information request did not receive a response')
  expect(response.status()).toBe(200)
  expect(await response.finished()).toBeNull()
  // A successful HTTP response is insufficient: the old App read must settle.
  expect(await page.evaluate(() => (window as DetailLoadObserver).workOrderALoadSettled))
    .toMatchObject({ state: 'failed_terminal', error: { category: 'authorization_denied' } })

  await expect(page).toHaveURL(url => {
    const route = new URL(url.hash.slice(1), url.origin)
    return route.pathname === '/pages/work-orders/detail'
      && route.searchParams.getAll('id').join(',') === 'B'
      && route.searchParams.getAll('read').join(',') === 'customer'
  })
  const panel = page.locator('.customer-info-panel')
  await expect(panel).toBeVisible()
  const rows = panel.getByTestId('configured-information-row')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('扩展备注B')
  await expect(panel).not.toContainText(/合成客户A|扩展备注A|根(?:部)?备注A|SYNTHETIC(?:-ROLE)?-A/)
}
