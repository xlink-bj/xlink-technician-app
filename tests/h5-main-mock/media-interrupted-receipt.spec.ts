import { expect, test, type Page } from '@playwright/test'

const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WS+QX8AAAAASUVORK5CYII=',
  'base64',
)

async function enterSurvey(page: Page) {
  await page.goto('/#/pages/index/index?devReview=1')
  await page.getByTestId('mock-continuous-journey-entry').click()
  await page.locator('.action-content-field--note textarea').fill('合成媒体回执恢复，不提交业务表单')
  await expect(page.getByTestId('mock-journey-progress')).toContainText('已保存，可继续下一步')
  await page.getByTestId('mock-journey-advance').click()
  await expect(page.locator('.current-task-card')).toContainText('现场勘察')
  await page.locator('.primary-task-action').click()
  await expect(page.getByTestId('dynamic-media-add-images1')).toBeVisible()
}

async function chooseImage(page: Page) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('dynamic-media-add-images1').click(),
  ])
  await chooser.setFiles({ name: 'synthetic-receipt.png', mimeType: 'image/png', buffer: sampleImage })
}

async function queueRows(page: Page) {
  return page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.includes('media-upload-queue:v1:'))
    .map(([key, value]) => {
      const outer = JSON.parse(value)
      return { key, task: typeof outer.data === 'string' ? JSON.parse(outer.data) : outer }
    }))
}

for (const scenario of ['interrupted-receipt', 'known-retryable'] as const) {
  test(`430×932 normal Survey media recovery: ${scenario}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const external: string[] = [], errors: string[] = []
    let thumbnails = 0, fileChoosers = 0, appResourceRequests = 0
    const origin = new URL(baseURL!).origin
    page.on('pageerror', error => errors.push(error.message))
    page.on('filechooser', () => { fileChoosers += 1 })
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      // Only App resources may reach the loopback server; business API stays in Mock.
      if (url.origin === origin && request.method() === 'GET'
        && !['xhr', 'fetch'].includes(request.resourceType())
        && !/^\/(api|biz|basic|index|i|workflow)(\/|$)/.test(url.pathname)) {
        appResourceRequests += 1
        return route.continue()
      }
      if (request.method() === 'GET' && url.hostname === 'mock-upload.invalid'
        && url.pathname.startsWith('/mock-upload/')) {
        thumbnails += 1
        return route.fulfill({ status: 200, contentType: 'image/png', body: sampleImage })
      }
      external.push(`${request.method()} ${url.origin}${url.pathname}`)
      return route.abort('blockedbyclient')
    })
    await page.routeWebSocket('**/*', socket => {
      if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer()
      else { external.push(`WS ${socket.url()}`); socket.close() }
    })
    try {
      await enterSurvey(page)
      if (scenario === 'interrupted-receipt') {
        // Fail only the final metadata ACK write. Do not inject task state, call
        // hidden handlers, replace the queue, or send any actual file remotely.
        await page.evaluate(() => {
          const original = Storage.prototype.setItem
          let rejected = false
          Storage.prototype.setItem = function (key, value) {
            if (key.includes('media-upload-queue:v1:')) {
              const outer = JSON.parse(value)
              const task = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer
              if (!rejected && task.state === 'uploaded') {
                rejected = true
                sessionStorage.setItem('synthetic-media-receipt-write-denied', '1')
                throw new DOMException('Synthetic receipt storage failure', 'QuotaExceededError')
              }
            }
            return original.call(this, key, value)
          }
        })
      } else {
        await page.evaluate(() => sessionStorage.setItem('xlink:e2e:fail-next-media-upload', 'retryable'))
      }
      await chooseImage(page)
      if (scenario === 'interrupted-receipt') {
        await expect.poll(async () => (await queueRows(page))[0]?.task.state).toBe('uploading')
        await expect.poll(() => page.evaluate(() => sessionStorage.getItem('synthetic-media-receipt-write-denied'))).toBe('1')
      } else {
        await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('上传失败，可点击重试')
      }
      const before = await queueRows(page)
      expect(before).toHaveLength(1)
      await testInfo.attach('before-refresh.json', { body: JSON.stringify(before, null, 2), contentType: 'application/json' })
      await page.reload()
      if (scenario === 'interrupted-receipt') {
        await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('结果待核查')
        await expect(page.getByTestId('dynamic-media-actions-images1')).toHaveCount(0)
        await expect(page.getByTestId('dynamic-media-add-images1')).toHaveCount(0)
        await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('0')
        const recovered = await queueRows(page)
        expect(recovered).toHaveLength(1)
        expect(recovered[0].task).toMatchObject({
          taskId: before[0].task.taskId, state: 'failed_retryable', attempts: 1,
          lastError: { code: 'ambiguous_upload' },
        })
        // A second restart must preserve the same denial, not replay the upload.
        await page.reload()
        await expect(page.getByTestId('dynamic-media-status-images1')).toContainText('结果待核查')
        await expect(page.getByTestId('dynamic-media-actions-images1')).toHaveCount(0)
        expect(await queueRows(page)).toEqual(recovered)
        expect(thumbnails).toBe(0)
      } else {
        await expect(page.getByTestId('dynamic-media-actions-images1')).toContainText('继续处理')
        await page.getByTestId('dynamic-media-actions-images1').locator('.app-button').click()
        await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('1')
        const recovered = await queueRows(page)
        expect(recovered).toHaveLength(1)
        expect(recovered[0].task).toMatchObject({ taskId: before[0].task.taskId, state: 'uploaded', attempts: 2 })
        await page.reload()
        await expect(page.getByTestId('dynamic-media-count-images1')).toContainText('1')
      }
      expect(fileChoosers).toBe(1)
      expect(external).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await testInfo.attach('media-recovery-evidence.json', {
        body: JSON.stringify({ scenario, rows: await queueRows(page), external, errors, thumbnails, fileChoosers, appResourceRequests }, null, 2),
        contentType: 'application/json',
      })
    }
  })
}
