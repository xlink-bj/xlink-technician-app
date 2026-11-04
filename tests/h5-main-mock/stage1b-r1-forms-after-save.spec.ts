import { expect, test, type Page } from '@playwright/test'

/** Stage 1B: real uni-app H5 composition, Mock 020 only. Browser traffic to
 * anything other than the local dev server is an immediate failure. */
test.describe('Stage 1B forms Save→EXTS→Process / durable readback', () => {
  test.skip(process.env.VITE_XLINK_R1_MP_UX_FIXTURES !== 'true',
    'The isolated 020/021 synthetic fixtures must be explicitly enabled.')

  async function guardExternalRequests(page: Page, external: string[], errors: string[]) {
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
    })
  }

  async function openForms(page: Page) {
    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await page.getByTestId('app-search-bar').locator('input').fill('MOCK-020')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '韩先生' }).click()
    await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
    await expect(page.getByTestId('a-stage-special-panel')).not.toContainText(/DEV|Mock|fixture/i)
  }

  test('430×932: confirmed Save and Process survives reload without replay', async ({ page }, info) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:5174') return route.continue()
      external.push(`${route.request().method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
    })

    await page.goto('/#/pages/index/index?devReview=1', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.mock-source-indicator')).toContainText('Mock')
    await page.locator('.work-orders-entry').click()
    await page.getByTestId('app-search-bar').locator('input').fill('MOCK-020')
    await page.locator('.search-button').click()
    await page.locator('.work-order-card').filter({ hasText: '韩先生' }).click()

    const panel = page.getByTestId('a-stage-special-panel')
    await expect(panel).toBeVisible()
    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('Stage1B 430 宽度下现场情况和节点完成')
    await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
    await page.getByTestId('a-special-save-finish-request').click()
    await expect(page.getByTestId('a-special-save-finish-confirm')).toBeVisible()
    await info.attach('stage1b-forms-confirm-before-process-430x932', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    await page.getByTestId('a-special-save-finish-confirm').click()
    await expect(page.getByTestId('a-special-complete')).toBeVisible()
    // The detail projection intentionally switches to the completed-node
    // summary and unmounts the editor. Exact saved payload is independently
    // checked by the controller's fresh-record readback tests.
    await expect(panel).toHaveCount(0)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    await expect(page.getByTestId('a-special-save')).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('a-special-complete')).toBeVisible()
    await expect(panel).toHaveCount(0)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    await expect(page.getByTestId('a-special-save-finish-request')).toHaveCount(0)
    expect(external, 'Zero attempted external requests').toEqual([])
    expect(errors, 'No uncaught browser errors').toEqual([])
  })

  test('430×932: completed Save receipt is read back after restart and cleared without resending', async ({ page }, info) => {
    const external: string[] = []
    const errors: string[] = []
    await guardExternalRequests(page, external, errors)
    await page.setViewportSize({ width: 430, height: 932 })
    await openForms(page)

    // Simulate a failed local receipt cleanup after all Mock protocol steps
    // and authoritative reads succeed. Recovery must be read-only.
    await page.evaluate(() => {
      type RemoveOptions = { key: string; success?: () => void; fail?: (error: unknown) => void }
      const runtime = window as Window & { uni?: {
        removeStorage: (options: RemoveOptions) => unknown
      } }
      const api = runtime.uni
      if (!api) throw new Error('uni storage API is unavailable')
      const remove = api.removeStorage.bind(api)
      api.removeStorage = options => {
        if (options.key.includes('r1-multistep%3Av1')
          && !sessionStorage.getItem('xlink-test-r1-receipt-cleanup-lost')) {
          sessionStorage.setItem('xlink-test-r1-receipt-cleanup-lost', '1')
          options.fail?.({ errMsg: 'Simulated receipt cleanup failure' })
          return
        }
        return remove(options)
      }
    })
    const savedText = '回执清理失败后只读核对恢复'
    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill(savedText)
    await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice')
      .filter({ hasText: '需要跟进' }).click()
    await page.getByTestId('a-special-save').click()
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem('xlink-test-r1-receipt-cleanup-lost'))).toBe('1')
    await expect(page.getByTestId('a-special-receipt-pending')).toBeVisible()
    await expect(page.getByTestId('a-special-recover')).toBeVisible()
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1'))
      .toContainText(savedText)
    await info.attach('stage1b-forms-recoverable-receipt-430x932', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('a-special-recover')).toBeVisible()
    await expect(page.getByTestId('a-special-local-draft'))
      .toContainText('本机草稿已保留，提交结果待核对')
    await page.getByTestId('a-special-recover').click()
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText(savedText)
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(1)
    await expect(page.getByTestId('a-special-save')).toBeVisible()
    await expect(page.getByTestId('a-special-local-draft')).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText(savedText)
    await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
    expect(external, 'Zero attempted external requests').toEqual([])
    expect(errors, 'No uncaught browser errors').toEqual([])
  })

  test('430×932: lost Process storage acknowledgement stays pending after reload and never replays', async ({ page }, info) => {
    const external: string[] = []
    const errors: string[] = []
    await guardExternalRequests(page, external, errors)
    await page.setViewportSize({ width: 430, height: 932 })
    await openForms(page)

    // The synthetic R1 Mock commits its complete node snapshot and then loses
    // the local storage ACK. This represents an unknown Process outcome while
    // keeping the normal App, controller, transaction receipt and UI in play.
    await page.evaluate(() => {
      const runtime = window as Window & { uni?: {
        setStorageSync: (key: string, value: unknown) => unknown
      } }
      const api = runtime.uni
      if (!api) throw new Error('uni storage API is unavailable')
      const write = api.setStorageSync.bind(api)
      api.setStorageSync = (key, value) => {
        const result = write(key, value)
        if (key === 'xlink.dev.mock.r1-special.020-021.v1'
          && typeof value === 'string'
          && JSON.parse(value)?.forms?.state === 10
          && !sessionStorage.getItem('xlink-test-r1-process-ack-lost')) {
          sessionStorage.setItem('xlink-test-r1-process-ack-lost', '1')
          throw new Error('Simulated lost local Mock acknowledgement')
        }
        return result
      }
    })
    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
      .fill('Process 结果不明，保留防重回执')
    await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice')
      .filter({ hasText: '需要跟进' }).click()
    await page.getByTestId('a-special-save-finish-request').click()
    await page.getByTestId('a-special-save-finish-confirm').click()
    await expect.poll(() => page.evaluate(() =>
      sessionStorage.getItem('xlink-test-r1-process-ack-lost'))).toBe('1')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
    await expect(page.getByTestId('a-special-task-state')).toContainText('结果待核对')
    await expect(page.getByTestId('a-special-local-draft'))
      .toContainText('本机草稿已保留，提交结果待核对')
    await expect(page.getByTestId('a-special-receipt-pending')).toBeVisible()
    await expect(page.getByTestId('a-special-unresolved')).toBeVisible()
    await expect(page.getByTestId('a-special-complete')).toHaveCount(0)
    await expect(page.getByTestId('a-special-save')).toHaveCount(0)
    await expect(page.getByTestId('a-special-recover')).toHaveCount(0)
    const row = page.getByTestId('a-special-row-mock-special-form-data-forms-1')
    await expect(row).toContainText('Process 结果不明，保留防重回执')
    await expect(row).toHaveCount(1)
    await info.attach('stage1b-forms-process-outcome-unknown-430x932', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toHaveCount(1)
    await expect(page.getByTestId('a-special-unresolved')).toBeVisible()
    expect(external, 'Zero attempted external requests').toEqual([])
    expect(errors, 'No uncaught browser errors').toEqual([])
  })

  test('430×932: second editor detects stale record revision and preserves the newer save', async ({ page, context }, info) => {
    const external: string[] = []
    const errors: string[] = []
    await guardExternalRequests(page, external, errors)
    await page.setViewportSize({ width: 430, height: 932 })
    await openForms(page)
    const summary = page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
    await summary.fill('两个编辑器共享同一条记录')
    await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice')
      .filter({ hasText: '需要跟进' }).click()
    await page.getByTestId('a-special-save').click()
    const rowId = 'mock-special-form-data-forms-1'
    await expect(page.getByTestId(`a-special-row-${rowId}`)).toContainText('两个编辑器共享同一条记录')

    const staleEditor = await context.newPage()
    await guardExternalRequests(staleEditor, external, errors)
    await staleEditor.setViewportSize({ width: 430, height: 932 })
    await openForms(staleEditor)
    await expect(staleEditor.getByTestId(`a-special-row-${rowId}`)).toContainText('两个编辑器共享同一条记录')
    await page.getByTestId(`a-special-edit-${rowId}`).click()
    await staleEditor.getByTestId(`a-special-edit-${rowId}`).click()

    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
      .fill('较新的编辑器保存内容')
    await page.getByTestId('a-special-save').click()
    await expect(page.getByTestId(`a-special-row-${rowId}`)).toContainText('较新的编辑器保存内容')

    await staleEditor.getByTestId('a-special-field-inspectionSummary').locator('textarea')
      .fill('过期编辑器不得覆盖')
    await staleEditor.getByTestId('a-special-save').click()
    await expect(staleEditor.getByTestId('a-special-operation-feedback'))
      .toContainText('记录已被其他编辑器更新')
    await expect(staleEditor.getByTestId(`a-special-row-${rowId}`))
      .toContainText('较新的编辑器保存内容')
    await expect(staleEditor.getByTestId(`a-special-row-${rowId}`))
      .not.toContainText('过期编辑器不得覆盖')
    await info.attach('stage1b-forms-stale-editor-conflict-430x932', {
      body: await staleEditor.screenshot({ fullPage: true }), contentType: 'image/png',
    })
    expect(external, 'Zero attempted external requests').toEqual([])
    expect(errors, 'No uncaught browser errors').toEqual([])
  })
})
