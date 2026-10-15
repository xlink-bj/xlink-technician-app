import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const output = resolve(process.cwd(), '.review/g4f-commercial-mock-ux/generated')
const viewports = [
  { width: 375, height: 667, name: '375x667' },
  { width: 390, height: 844, name: '390x844' },
] as const

function isLocalReviewRequest(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.port === '5175'
  } catch {
    return false
  }
}

async function installSafetyGuards(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests = new Set<string>()
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (!isLocalReviewRequest(request.url())) externalRequests.add(request.url())
  })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!isLocalReviewRequest(url)) {
      externalRequests.add(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return { pageErrors, consoleErrors, externalRequests }
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(output, name), animations: 'disabled' })
}

async function expectNoBusinessCommands(page: Page): Promise<void> {
  const counters = await page.evaluate(() => (window as unknown as {
    __G4F_REVIEW_ORDER_MUTATIONS__?: {
      dispatches: number
      workflowStarts: number
      reviewBlockedCommandCalls: number
    }
  }).__G4F_REVIEW_ORDER_MUTATIONS__)
  expect(counters).toEqual({ dispatches: 0, workflowStarts: 0, reviewBlockedCommandCalls: 0 })
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await expect(page.getByTestId('quotation-order-confirmation')).toHaveCount(0)
}

async function expandThreeSelectedItems(page: Page): Promise<void> {
  const compact = page.getByTestId('quotation-group-collapsed-summary-quotation-group-1')
  if (await compact.count() > 0 && await compact.isVisible()) {
    await page.getByTestId('quotation-group-details-toggle-quotation-group-1').click()
  }
  await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(3)
}

async function expectSafe(
  page: Page,
  diagnostics: Awaited<ReturnType<typeof installSafetyGuards>>,
): Promise<void> {
  expect(diagnostics.pageErrors, 'uncaught browser errors').toEqual([])
  expect(diagnostics.consoleErrors, 'console.error output').toEqual([])
  expect([...diagnostics.externalRequests], 'attempted non-local requests, including intercepted requests').toEqual([])
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }))
  expect(dimensions.document, 'document must not overflow mobile viewport horizontally').toBeLessThanOrEqual(dimensions.viewport)
  await expectNoBusinessCommands(page)
}

for (const viewport of viewports) {
  test(`commercial product journey uses real uni-H5 navigation and restores local draft at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const diagnostics = await installSafetyGuards(page)
    await mkdir(output, { recursive: true })

    await page.goto('/#/pages/product/orders', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('commercial-review-orders')).toBeVisible()
    await expect(page.getByTestId('commercial-review-open-detail')).toBeVisible()
    await expect(page.getByText('待处理报价', { exact: true })).toBeVisible()
    await expect(page.getByText(/H5_VISUAL_PROXY|MOCK_PRODUCT_REVIEW|空草稿|目录浏览/)).toHaveCount(0)
    await capture(page, `01-orders-${viewport.name}.png`)

    await page.getByTestId('commercial-review-open-detail').click()
    await expect(page).toHaveURL(/#\/pages\/product\/detail/)
    await expect(page.getByTestId('commercial-review-detail')).toBeVisible()
    await expect(page.getByTestId('commercial-review-start-quotation')).toBeEnabled()
    await expect(page.getByText('编制维修报价方案')).toBeVisible()
    await capture(page, `02-detail-${viewport.name}.png`)

    await page.getByTestId('commercial-review-start-quotation').click()
    await expect(page).toHaveURL(/#\/pages\/product\/quotation/)
    await expect(page.getByTestId('commercial-review-quotation')).toBeVisible()
    await expect(page.getByTestId('action-workspace-context')).toContainText('演示报价工单')
    await expect(page.getByTestId('action-workspace-context')).toContainText('MOCK-018')
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expect(page.getByTestId('quotation-add-group')).toBeVisible()
    await expect(page.getByTestId('quotation-quote-process')).toContainText('费用与优惠')
    await expect(page.getByTestId('quotation-quote-process')).toContainText('业务规则尚待核验')
    await expect(page.getByText(/G4-F 报价工作区|H5_VISUAL_PROXY|MOCK_PRODUCT_REVIEW|scenario/i)).toHaveCount(0)
    await capture(page, `03-workbench-empty-${viewport.name}.png`)

    await page.getByTestId('quotation-add-group').click()
    await expect(page.getByTestId('quotation-first-repair-part-step')).toBeVisible()
    await page.getByTestId('quotation-first-step-repair-parts-trigger').click()
    await page.getByTestId('survey-repair-part-parents').getByText('屋面', { exact: true }).click()
    await page.getByTestId('quotation-first-step-description').locator('textarea').fill('屋面檐口局部维修')
    await page.getByTestId('quotation-first-step-quantity').locator('input').fill('12')
    await page.getByTestId('quotation-first-step-select-products').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await expect(page.getByTestId('quotation-catalog-browser')).toBeVisible()
    // Protect both concrete job description and broad repair-part path (R1 domain parity).
    await expect(page.getByTestId('quotation-catalog-target')).toContainText('屋面檐口局部维修')
    await expect(page.getByTestId('quotation-catalog-target')).toContainText('维修位置 · 屋面')
    await expect(page.getByTestId('quotation-catalog-kind-package')).toBeVisible()
    await expect(page.getByTestId('quotation-catalog-kind-procedure')).toBeVisible()
    await expect(page.getByTestId('quotation-catalog-kind-material')).toBeVisible()
    await expect(page.getByTestId('quotation-catalog-kind-measure')).toBeVisible()
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await capture(page, `04-catalog-${viewport.name}.png`)

    await expect(page.getByTestId('quotation-package-detail-mock-catalog-package-basic')).toBeVisible()
    await page.getByTestId('quotation-package-detail-mock-catalog-package-basic').click()
    await expect(page.getByTestId('quotation-package-detail')).toBeVisible()
    await page.getByTestId('quotation-package-detail-back').click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await page.getByTestId('quotation-catalog-kind-material').click()
    await expect(page.getByTestId('quotation-catalog-list')).toContainText('弹性密封材料（示例）')
    await page.getByTestId('quotation-catalog-add-material-mock-catalog-material-sealant').click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    await expect(page.getByTestId('quotation-composition-selection')).toHaveCount(1)
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-material')).toContainText('弹性密封材料（示例）')
    await expect(page.getByTestId('quotation-local-gross-total')).toHaveCount(0)
    await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)
    await expect(page.getByTestId('quotation-product-demo-read-only')).toContainText('演示，不提交订单')
    await expect(page.getByTestId('quotation-review-readiness')).toContainText('草稿待完善')
    await expect(page.getByTestId('quotation-review-readiness')).toContainText('一项工序和一项材料')
    await expect(page.getByTestId('quotation-engine-readiness')).toHaveCount(0)
    await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
    await page.getByTestId('quotation-review-readiness').scrollIntoViewIfNeeded()
    await capture(page, `05a-draft-incomplete-${viewport.name}.png`)

    // Exercise the remaining direct-selection tabs; a procedure + material
    // satisfies the currently modeled composition minimum, while measure is
    // optional and must not be treated as a price-bearing amount.
    await page.getByTestId('quotation-browse-quotation-group-1').click()
    await page.getByTestId('quotation-catalog-kind-procedure').click()
    await expect(page.getByTestId('quotation-catalog-list')).toContainText('檐口密封处理（示例）')
    await page.getByTestId('quotation-catalog-add-procedure-mock-catalog-procedure-seal').click()
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-procedure')).toContainText('檐口密封处理（示例）')
    await expect(page.getByTestId('quotation-review-readiness')).toContainText('草稿核对')
    await expect(page.getByTestId('quotation-review-readiness')).toContainText('当前工单的附加字段尚未核验')
    await expect(page.getByTestId('quotation-review-readiness')).toContainText('正式报价不可提交')
    await expect(page.getByTestId('quotation-review-readiness')).toHaveCount(1)
    await expect(page.getByTestId('quotation-engine-readiness')).toHaveCount(0)
    await page.getByTestId('quotation-review-readiness').scrollIntoViewIfNeeded()
    await capture(page, `05b-draft-review-${viewport.name}.png`)

    await page.getByTestId('quotation-browse-quotation-group-1').click()
    await page.getByTestId('quotation-catalog-kind-measure').click()
    await expect(page.getByTestId('quotation-catalog-list')).toContainText('高处作业防护（示例）')
    await page.getByTestId('quotation-catalog-add-measure-mock-catalog-measure-inspection').click()
    await expect(page.getByTestId('quotation-review-readiness'))
      .toContainText('当前工单的附加字段尚未核验')
    await expect(page.getByTestId('quotation-review-readiness'))
      .toContainText('正式报价不可提交')
    // The 3-item group is compact only in the DEV product review.
    await expect(page.getByTestId('quotation-group-collapsed-summary-quotation-group-1'))
      .toContainText('弹性密封材料（示例）')
    const continueAdding = page.getByTestId('quotation-browse-quotation-group-1')
    await continueAdding.scrollIntoViewIfNeeded()
    await expect(continueAdding).toBeVisible()
    await expect(continueAdding).toBeInViewport()
    const addButtonHitbox = await continueAdding.evaluate((element) => {
      const button = element.getBoundingClientRect()
      const footer = document.querySelector('.action-workspace-footer')?.getBoundingClientRect()
      const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2)
      return {
        footerPresent: footer !== undefined,
        aboveFooter: footer !== undefined && button.bottom <= footer.top,
        insideViewport: button.top >= 0 && button.bottom <= window.innerHeight
          && button.left >= 0 && button.right <= window.innerWidth,
        minimumTouchSize: button.height >= 44 && button.width >= 44,
        centerTappable: hit !== null && element.contains(hit),
      }
    })
    expect(addButtonHitbox, '3+ item add-project button must remain visibly tappable above the fixed footer')
      .toEqual({
        footerPresent: true,
        aboveFooter: true,
        insideViewport: true,
        minimumTouchSize: true,
        centerTappable: true,
      })
    await continueAdding.click()
    await expect(page.getByTestId('quotation-catalog-page')).toBeVisible()
    await page.getByTestId('quotation-catalog-close').click()
    await expect(page.getByTestId('quotation-catalog-page')).toHaveCount(0)
    // Editing remains one explicit expand action away, with quantities unchanged.
    await expandThreeSelectedItems(page)
    await expect(page.getByTestId('quotation-group-section-quotation-group-1-measure'))
      .toContainText('高处作业防护（示例）')
    await capture(page, `05-selected-items-${viewport.name}.png`)
    await expect(page.getByText('报价分组草稿已保存在本机。')).toBeVisible()
    await expectNoBusinessCommands(page)

    // Exercise uni-app's actual history stack rather than a faux back tab.
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/#\/pages\/product\/detail/)
    await expect(page.getByTestId('commercial-review-detail')).toBeVisible()
    await page.getByTestId('commercial-review-start-quotation').click()
    await expect(page).toHaveURL(/#\/pages\/product\/quotation/)
    await expandThreeSelectedItems(page)
    await expect(page.getByText('弹性密封材料（示例）', { exact: false })).toBeVisible()
    // Same-SPA navigation may retain the store in memory; hard refresh below
    // is the persistence proof and must report a storage restore explicitly.
    await capture(page, `06-reentered-same-app-draft-${viewport.name}.png`)

    // Verify the actual detail -> list navigator before hard refresh resets
    // uni-app's in-memory page stack.
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/#\/pages\/product\/detail/)
    await page.getByRole('link', { name: /返回工单/ }).click()
    await expect(page).toHaveURL(/#\/pages\/product\/orders/)
    await expect(page.getByTestId('commercial-review-orders')).toBeVisible()

    // Reopen the same demo work order and quotation from the real list flow.
    await page.getByTestId('commercial-review-open-detail').click()
    await expect(page).toHaveURL(/#\/pages\/product\/detail/)
    await page.getByTestId('commercial-review-start-quotation').click()
    await expect(page).toHaveURL(/#\/pages\/product\/quotation/)
    await expandThreeSelectedItems(page)
    await expect(page.getByText('弹性密封材料（示例）', { exact: false })).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/pages\/product\/quotation/)
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await expandThreeSelectedItems(page)
    await expect(page.getByText('弹性密封材料（示例）', { exact: false })).toBeVisible()
    await expect(page.getByText('已恢复本地报价分组草稿。')).toBeVisible()
    await expect(page.getByTestId('quotation-product-demo-read-only')).toContainText('演示，不提交订单')
    await capture(page, `07-hard-refresh-restored-${viewport.name}.png`)
    await expectSafe(page, diagnostics)
  })
}
