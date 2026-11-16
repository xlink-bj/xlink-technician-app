import { expect, test, type Page } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
const brand = process.env.VITE_XLINK_BRAND || 'yuhong'
const phase = process.env.REVIEW_PHASE || 'after'
const after = phase === 'after'
const dir = `.review/雨虹UIUX优化-20261116/A订单与签约/${brand}-${phase}`
async function openHub(page: Page, orderNum: string, customer: string) {
  await page.goto('/#/pages/index/index')
  await page.locator('.work-orders-entry').click()
  await (await searchMockWorkOrder(page, { orderNum, customer })).click()
  await page.getByTestId('task-focus-action').click()
  await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
}
for (const [width, height] of [[430, 932], [375, 667], [390, 844]]) {
  test(`A review ${brand} ${width}x${height}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height })
    const external: string[] = [], errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', r => {
      if (new URL(r.request().url()).origin === baseURL) return r.continue()
      external.push(r.request().method() + ' ' + new URL(r.request().url()).pathname)
      return r.abort()
    })
    const capture = async (scene: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: `${dir}/${scene}-${width}x${height}.png`, animations: 'disabled' })
    }
    await openHub(page, '26018', '吴先生')
    await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
    await capture('01-read-failure')
    await page.getByTestId('quotation-hub-create-unverified').click()
    await page.getByTestId('quotation-add-group').click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('屋面节点维修草稿')
    // Wait for actual local persistence before simulating a return/reload.
    await page.getByTestId('quotation-first-step-save-draft').click()
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/features/work-orders/quotation/composition-store.ts'
      return (await import(path)).useQuotationCompositionStore().localState
    })).toBe('saved_local')
    await page.reload()
    await expect(page.getByTestId('quotation-hub-local-draft')).toBeVisible()
    await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
    await capture('02-failure-local-draft')
    if (after) {
      const error = page.getByTestId('quotation-hub-read-error')
      await expect(error.getByTestId('quotation-hub-create-unverified')).toHaveCount(0)
      await expect(page.getByTestId('quotation-hub-local-draft')).toContainText('未提交后台')
    }
    await page.getByTestId('quotation-hub-create-unverified').click()
    await expect(page.getByTestId('quotation-first-step-description').locator('textarea')).toHaveValue('屋面节点维修草稿')
    await page.reload()
    await expect(page.getByTestId('quotation-hub-read-error')).toBeVisible()
    await openHub(page, '04009', '陈女士')
    const order = 'mock-official-order-001'
    await capture('03-official-order')
    await page.getByTestId(`quotation-hub-view-${order}`).click()
    await expect(page.getByTestId(`quotation-hub-details-${order}`)).toBeVisible()
    if (after) await expect(page.getByTestId(`quotation-hub-details-${order}`)).toContainText('不代表订单无项目')
    await capture('04-order-expanded')
    if (after) {
      const lastDetail = page.getByTestId(`quotation-hub-details-${order}`).locator('.quotation-hub__detail-note').last()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const fieldBox = (await lastDetail.boundingBox())!, footerBox = (await page.locator('.quotation-hub__action-area').boundingBox())!
      expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(footerBox.y + 1)
      await capture('04b-last-order-detail')
    }
    await page.getByTestId(`quotation-hub-signing-${order}`).click()
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    if (after) {
      await expect(page.getByTestId('signing-review-progress')).not.toContainText(/步骤|[123]\/3/)
      await expect(page.locator('.xl-craft__progress-track')).toHaveCount(0)
      await expect(page.getByTestId('signing-order-read-verified')).toContainText('订单身份已核验')
      await expect(page.getByTestId('signing-read-amount-unverified')).toBeVisible()
      await expect(page.getByTestId('signing-contract-read-request')).toContainText('只读')
    }
    await capture('05-contract-idle')
    await page.getByTestId('signing-contract-read-request').click()
    await expect(page.getByTestId('signing-contract-matched')).toBeVisible()
    await capture('06-contract-record')
    await page.getByTestId('signing-read-operations-toggle').click()
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('signing-order-read-return').scrollIntoViewIfNeeded()
    await capture('07-last-action')
    const last = await page.getByTestId('signing-order-read-return').boundingBox()
    expect(last!.y + last!.height).toBeLessThanOrEqual(height)
    expect(external).toEqual([]); expect(errors).toEqual([])
  })
}

test('A read errors show only permitted recovery and distinguish idle/loading', async ({ page, baseURL }) => {
  test.skip(!after, 'New error-state assertions apply to the implementation')
  const external: string[] = []
  await page.route('**/*', r => new URL(r.request().url()).origin === baseURL ? r.continue() : (external.push(r.request().method()), r.abort()))
  await openHub(page, '26018', '吴先生')
  const failure = page.getByTestId('quotation-hub-read-error')
  await expect(failure).toContainText('不能判断是否已有订单')
  await expect(page.getByTestId('quotation-hub-read-retry')).toHaveCount(0)
  const heading = failure.locator('.quotation-hub__read-error-heading')
  const icon = await heading.locator('.uni-icons').boundingBox()
  const title = await heading.locator('.quotation-hub__read-error-title').boundingBox()
  expect(Math.abs(icon!.y + icon!.height / 2 - title!.y - title!.height / 2)).toBeLessThan(3)
  // View-only lifecycle fixture after a genuine terminal read failure. Never inject ready
  // Order data, session authority or a command port. Retry retains the real guard.
  for (const state of ['idle', 'loading', 'failed_retryable'] as const) {
    await page.evaluate(async state => {
      const path = '/src/features/work-orders/quotation/order-browse-store.ts'
      const store = (await import(path)).useQuotationOrderBrowseStore()
      store.state = state
      store.errorMessage = ''
    }, state)
    await expect(page.getByTestId('quotation-hub-no-records')).toHaveCount(0)
    if (state === 'failed_retryable') {
      const retry = page.getByTestId('quotation-hub-read-retry')
      await expect(retry).toBeVisible()
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      if (brand === 'yuhong') await expect(retry.locator('.uni-icons')).toHaveCSS('color', 'rgb(23, 93, 166)')
    } else await expect(page.getByTestId('quotation-hub-loading')).toContainText(state === 'idle' ? '尚未读取' : '正在核对')
    await page.screenshot({ path: `${dir}/08-order-${state}-view-fixture-430x932.png` })
  }
  await page.getByTestId('quotation-hub-read-retry').click()
  await expect(failure).toContainText('不能判断是否已有订单')
  await expect(page.getByTestId('quotation-hub-read-retry')).toHaveCount(0)
  expect(external).toEqual([])
})

test('A contract loading failure and signed record remain read only', async ({ page, baseURL }) => {
  test.skip(!after, 'New state assertions apply to the implementation')
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', r => new URL(r.request().url()).origin === baseURL ? r.continue() : (external.push(r.request().method()), r.abort()))
  await openHub(page, '04009', '陈女士')
  await page.evaluate(async () => {
    const path = '/tests/h5-main-mock/fixtures/signing-read-theme-fixture.ts'
    ;(await import(path)).installReadVariants()
  })
  for (const mode of ['contract-loading', 'contract-failed', 'signed']) {
    await page.evaluate(async mode => {
      const path = '/tests/h5-main-mock/fixtures/signing-read-theme-fixture.ts'
      ;(await import(path)).selectReadMode(mode)
    }, mode)
    await page.getByTestId('quotation-hub-signing-mock-official-order-001').click()
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    await page.getByTestId('signing-contract-read-request').click()
    const title = page.getByTestId('signing-read-stage-title')
    await expect(title).toHaveText(mode === 'contract-loading' ? '正在只读核验合同' : mode === 'contract-failed' ? '合同读取失败' : '合同记录显示已签署')
    await expect(page.locator('.xl-craft__progress-track')).toHaveCount(0)
    await page.screenshot({ path: `${dir}/09-${mode}-430x932.png` })
    if (mode === 'contract-loading') {
      await expect(page.getByTestId('signing-contract-read-request')).toHaveCount(0)
      await page.evaluate(async () => {
        const path = '/tests/h5-main-mock/fixtures/signing-read-theme-fixture.ts'
        ;(await import(path)).releaseRead()
      })
      await expect(title).toHaveText('签约处理中')
    }
    if (mode === 'signed') {
      await page.locator('.signing-read-context-toggle').click()
      await expect(page.getByTestId('signing-read-stage-detail')).toContainText('不是 PDF、签名真实性或当前账号权限证明')
    }
    await page.getByTestId('signing-read-operations-toggle').click()
    await expect(page.getByTestId('signing-order-read-sign-disabled')).toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('signing-order-read-sign-disabled').click({ force: true })
    await expect(page.getByTestId('signing-order-read-verified')).toBeVisible()
    await page.getByTestId('signing-order-read-return').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
  }
  expect(external).toEqual([]); expect(errors).toEqual([])
})
