import { expect, test } from '@playwright/test'

// A tiny, synthetic PNG: no customer image, device camera, or external fixture.
const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WS+QX8AAAAASUVORK5CYII=',
  'base64',
)

test('430×932 Survey: browser image selection → mock upload → preview → restored draft', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })

  const externalRequests: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  await page.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    // The mock upload adapter returns a synthetic, non-routable image URL.
    // Serve ONLY its GET thumbnail in-process; never send it to the network.
    if (request.method() === 'GET' && url.hostname === 'mock-upload.invalid'
      && url.pathname.startsWith('/mock-upload/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: sampleImage })
    }
    externalRequests.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await expect(page.locator('.uni-page-head__title')).toContainText('预约上门')
  await page.locator('.action-content-field--note textarea').fill('H5 图片流程：仅使用本地虚构材料')
  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await page.getByTestId('mock-journey-advance').click()
  await expect(page.locator('.current-task-card')).toContainText('现场勘察')
  await page.locator('.primary-task-action').click()
  await expect(page.locator('.uni-page-head__title')).toContainText('现场勘查')

  await page.getByTestId('survey-part-picker-trigger').click()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()

  const first = page.getByTestId('dynamic-media-add-images1')
  const second = page.getByTestId('dynamic-media-add-images2')
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('0')
  await expect(page.getByTestId('dynamic-media-count-images2')).toContainText('0')

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    first.click(),
  ])
  await chooser.setFiles({
    name: 'xlink-synthetic-survey.png',
    mimeType: 'image/png',
    buffer: sampleImage,
  })

  await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('1')
  await expect(page.getByTestId('dynamic-media-count-images2')).toContainText('0')
  await expect(page.getByTestId('dynamic-media-preview-images1').locator('.dynamic-action-media-tile--preview')).toHaveCount(1)
  await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('上传')

  await page.getByTestId('dynamic-media-preview-images1').locator('.dynamic-action-media-tile--preview').click()
  await expect(page.getByTestId('survey-media-lightbox')).toBeVisible()
  await page.getByTestId('survey-media-lightbox').getByText('返回表单').click()
  await expect(page.getByTestId('survey-media-lightbox')).toHaveCount(0)

  // The real action page should rehydrate a LOCAL synthetic draft, with the
  // two independent media fields still isolated after a full app reload.
  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('1')
  await expect(page.getByTestId('dynamic-media-count-images2')).toContainText('0')
  await expect(page.getByTestId('dynamic-media-preview-images1').locator('.dynamic-action-media-tile--preview')).toHaveCount(1)

  expect(externalRequests, 'no business endpoint or remote image is contacted').toEqual([])
  expect(pageErrors, 'the real H5 page must have no browser runtime errors').toEqual([])
})

test('430×932 Survey: retryable upload fails once, then resumes the same queued image', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const externalRequests: string[] = []
  const errors: string[] = []
  let fileChooserCount = 0
  page.on('filechooser', () => { fileChooserCount += 1 })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === 'http://localhost:5174') return route.continue()
    if (request.method() === 'GET' && url.hostname === 'mock-upload.invalid'
      && url.pathname.startsWith('/mock-upload/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: sampleImage })
    }
    externalRequests.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('mock-continuous-journey-entry').click()
  await page.locator('.action-content-field--note textarea').fill('H5 一次性合成上传失败与恢复')
  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await page.getByTestId('mock-journey-advance').click()
  await expect(page.locator('.current-task-card')).toContainText('现场勘察')
  await page.locator('.primary-task-action').click()
  await page.getByTestId('survey-part-picker-trigger').click()
  await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
  await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
  await page.getByTestId('survey-part-picker-confirm').click()

  await expect(page.getByTestId('dynamic-media-add-images1')).toBeVisible()
  await page.evaluate(() => {
    window.sessionStorage.setItem('xlink:e2e:fail-next-media-upload', 'retryable')
  })
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('dynamic-media-add-images1').click(),
  ])
  await chooser.setFiles({
    name: 'xlink-synthetic-retry.png',
    mimeType: 'image/png',
    buffer: sampleImage,
  })

  await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('上传失败，可点击重试')
  await expect(page.getByTestId('dynamic-media-preview-images1').locator('.dynamic-action-media-tile--preview')).toHaveCount(0)
  await expect(page.getByTestId('dynamic-media-actions-images1')).toContainText('继续处理')
  await expect(page.getByTestId('dynamic-media-count-images2')).toContainText('0')
  expect(await page.evaluate(() => window.sessionStorage.getItem('xlink:e2e:fail-next-media-upload'))).toBeNull()

  // Destroy every in-memory asset and blob URL. Only persisted file bytes
  // may make the retry succeed after this full application restart.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dynamic-media-actions-images1')).toContainText('继续处理')
  await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('0')
  // No second file chooser: retry must reuse the durable queued media task.
  await page.getByTestId('dynamic-media-actions-images1').locator('.app-button').click({ timeout: 5_000 })
  await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('已上传')
  await expect(page.getByTestId('dynamic-media-preview-images1').locator('.dynamic-action-media-tile--preview')).toHaveCount(1)
  await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('1')
  await expect(page.getByTestId('dynamic-media-count-images2')).toContainText('0')

  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dynamic-media-preview-images1').locator('.dynamic-action-media-tile--preview')).toHaveCount(1)
  await expect(page.getByTestId('dynamic-media-count-images2')).toContainText('0')
  expect(fileChooserCount, 'recovery must not ask the user to select the same image twice').toBe(1)
  expect(externalRequests, 'the failure and retry must stay inside the local Mock').toEqual([])
  expect(errors, 'the retry flow must not produce browser runtime errors').toEqual([])
})
