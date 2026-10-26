import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const screenshotPath = resolve(process.cwd(), '.review/g4f-phase1a/01-quotation-action.png')

function localReviewRequest(url: string): boolean {
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

test('true uni-app H5 mounts the synthetic placeOrder quotation workspace with no external traffic', async ({ page, browser }) => {
  console.log(`[g4f-uni-h5-review] Playwright ${browser.version()}`)
  await mkdir(resolve(process.cwd(), '.review/g4f-phase1a'), { recursive: true })
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (!localReviewRequest(request.url())) externalRequests.push(request.url())
  })
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (!localReviewRequest(url)) {
      externalRequests.push(url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('g4f-quotation-review')).toBeVisible()
  await expect(page.getByTestId('g4f-review-title')).toContainText('报价工作区')
  await expect(page.getByText('H5_VISUAL_PROXY')).toBeVisible()
  await expect(page.getByText('MOCK_PRODUCT_REVIEW')).toBeVisible()
  await expect(page.getByTestId('g4f-quotation-workspace')).toBeVisible()
  await expect(page.getByTestId('action-workspace-context')).toContainText('吴先生')
  await expect(page.getByTestId('action-workspace-context')).toContainText('MOCK-018')
  await expect(page.getByTestId('quotation-initial-empty-workbench')).toContainText('请选择维修部位')
  await expect(page.getByTestId('quotation-draft-notice')).toContainText('本机报价草稿')
  await expect(page.getByTestId('quotation-quote-process')).toContainText('费用与优惠')
  await expect(page.getByTestId('quotation-add-group')).toBeVisible()
  await expect(page.getByTestId('dynamic-form-save')).toHaveCount(0)
  const submitControl = page.locator('[data-testid="action-workspace-submit"], [data-testid="quotation-submit-disabled-preview"]')
  await expect(submitControl).toHaveCount(1)
  await expect(submitControl).toHaveAttribute('disabled', 'true')
  await expect(submitControl).toBeVisible()
  await expect(page.getByTestId('quotation-order-submit-boundary').getByRole('button')).toHaveCount(0)
  await expect(page.getByText(/(?:¥|￥)\s*\d|\d+(?:\.\d{1,2})?\s*元/)).toHaveCount(0)

  const focus = page.getByTestId('quotation-state-ready')
  await focus.scrollIntoViewIfNeeded()
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })

  expect(pageErrors, 'pageerror output').toEqual([])
  expect(consoleErrors, 'console.error output').toEqual([])
  expect(externalRequests, 'unexpected non-local network requests').toEqual([])
})
