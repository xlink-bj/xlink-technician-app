import { expect, test, type Page } from '@playwright/test'

function isLocalReviewRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.port === '5175'
  } catch { return false }
}

async function guardNetworkAndErrors(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!isLocalReviewRequest(url)) {
      externalRequests.push(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return { pageErrors, consoleErrors, externalRequests }
}

async function expectReviewSafe(page: Page, diagnostics: Awaited<ReturnType<typeof guardNetworkAndErrors>>) {
  expect(diagnostics.pageErrors).toEqual([])
  expect(diagnostics.consoleErrors).toEqual([])
  expect(diagnostics.externalRequests).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { __G4F_REVIEW_ORDER_MUTATIONS__?: { dispatches: number } }).__G4F_REVIEW_ORDER_MUTATIONS__?.dispatches ?? 0)).toBeLessThanOrEqual(1)
}

test('Phase 1I actual quotation workspace confirms once, locks in flight, then renders authoritative readback', async ({ page }) => {
  const diagnostics = await guardNetworkAndErrors(page)
  await page.goto('/?scenario=submit-ready', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('quotation-engine-ready')).toBeVisible()
  const submit = page.getByTestId('action-workspace-submit')
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByTestId('quotation-order-confirmation')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__G4F_REVIEW_ORDER_MUTATIONS__.dispatches)).toBe(0)
  await page.getByTestId('quotation-order-confirm').click()
  await expect(submit).toHaveAttribute('disabled', 'true')
  await expect(submit).toContainText('提交中')
  await expect.poll(() => page.evaluate(() => (window as any).__G4F_REVIEW_ORDER_MUTATIONS__.dispatches)).toBe(1)
  await expect(page.getByText('订单已提交并完成服务器核对。')).toBeVisible()
  await expect(page.getByTestId('quotation-order-confirmation')).toHaveCount(0)
  await expectReviewSafe(page, diagnostics)
})

test('Phase 1I readback-pending state allows read-only retry and never re-dispatches', async ({ page }) => {
  const diagnostics = await guardNetworkAndErrors(page)
  await page.goto('/?scenario=readback-pending', { waitUntil: 'domcontentloaded' })
  const submit = page.getByTestId('action-workspace-submit')
  await expect(page.getByText('订单已提交，正在等待权威订单信息；请勿重复提交。')).toBeVisible()
  await expect(submit).toHaveAttribute('disabled', 'true')
  await expect(page.getByTestId('quotation-order-readback-retry')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__G4F_REVIEW_ORDER_MUTATIONS__.dispatches)).toBe(0)
  await expectReviewSafe(page, diagnostics)
})

test('Phase 1I supported orderId route enters same-order edit mode using synthetic readback', async ({ page }) => {
  const diagnostics = await guardNetworkAndErrors(page)
  await page.goto('/?scenario=edit&orderId=order-synthetic-review', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('quotation-edit-state')).toContainText('更新同一订单身份')
  await expect(page.getByTestId('quotation-engine-ready')).toBeVisible()
  await expect(page.getByTestId('action-workspace-submit')).toBeEnabled()
  expect(await page.evaluate(() => (window as any).__G4F_REVIEW_ORDER_MUTATIONS__.dispatches)).toBe(0)
  await expectReviewSafe(page, diagnostics)
})

test('Phase 1I unsupported existing order remains fail-closed and read-only', async ({ page }) => {
  const diagnostics = await guardNetworkAndErrors(page)
  await page.goto('/?scenario=unsupported-edit&orderId=order-synthetic-review', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('quotation-edit-state')).toContainText('优惠券')
  await expect(page.getByTestId('action-workspace-submit')).toHaveAttribute('disabled', 'true')
  expect(await page.evaluate(() => (window as any).__G4F_REVIEW_ORDER_MUTATIONS__.dispatches)).toBe(0)
  await expectReviewSafe(page, diagnostics)
})
