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
  await expect(page.getByTestId('action-workspace-context')).toContainText('演示报价工单')
  await expect(page.getByTestId('action-workspace-context')).toContainText('#MOCK-018')
  await expect(page.getByTestId('quotation-draft-empty')).toContainText('还没有添加报价明细')
  await expect(page.getByTestId('g4f-readonly-boundary')).toContainText('报价草稿仅保存在本机，不会提交报价')
  await expect(page.getByTestId('quotation-add-item')).toBeVisible()
  await expect(page.getByTestId('dynamic-form-save')).toHaveCount(0)
  await expect(page.getByTestId('action-workspace-submit')).toHaveCount(0)
  await expect(page.getByText(/价格|单价|小计|总价|¥|￥/)).toHaveCount(0)

  const focus = page.getByTestId('quotation-state-ready')
  await focus.scrollIntoViewIfNeeded()
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })

  expect(pageErrors, 'pageerror output').toEqual([])
  expect(consoleErrors, 'console.error output').toEqual([])
  expect(externalRequests, 'unexpected non-local network requests').toEqual([])
})
