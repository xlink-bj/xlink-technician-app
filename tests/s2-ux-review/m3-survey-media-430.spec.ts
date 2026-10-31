import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

/** M3-P0: actual uni-app Main H5, synthetic 019 journey, one Owner viewport. */
test('Survey media retains commercial add actions at 430x932 when Runtime permits edits', async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const external: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().method() + ' ' + url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('mock-continuous-journey-entry')).toBeVisible()
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.getByTestId('app-action-content-heading')).toContainText('预约信息')
  await page.locator('.action-content-field--note textarea').fill('屋面渗漏勘查（合成数据）')
  await page.getByTestId('mock-journey-advance').click()
  await expect(page.locator('.primary-task-action')).toBeVisible()
  await page.locator('.primary-task-action').click()
  const form = page.getByTestId('dynamic-form-action-content')
  await expect(form).toBeVisible()
  const parts = page.getByTestId('survey-part-picker-trigger')
  await parts.click()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()

  await expect(page.getByTestId('dynamic-media-add-images1')).toBeVisible()
  await expect(page.getByTestId('dynamic-media-add-images2')).toBeVisible()
  await expect(page.getByTestId('dynamic-media-add-images1')).toContainText('选择图片')
  await expect(page.getByTestId('dynamic-media-actions-images1')).toHaveCount(0)
  await expect(page.getByTestId('survey-media-section').first()).toBeVisible()
  expect(await form.innerText()).not.toMatch(/H5_VISUAL_PROXY|MOCK_PRODUCT_REVIEW|调试控制台/)

  const screenshot = await form.screenshot({ animations: 'disabled', caret: 'hide' })
  const evidenceDir = resolve('.review/m3-p0')
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(resolve(evidenceDir, 'survey-media-430x932.png'), screenshot)
  await info.attach('M3 Survey commercial media · actual Main H5 · 430x932', {
    body: screenshot,
    contentType: 'image/png',
  })
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
