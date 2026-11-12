import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { expect, test } from '@playwright/test'

// Explicit synthetic fixture, never a claim about captured Survey providers.
test.skip(process.env.XLINK_H5_DUPLICATE_FILE !== 'true', 'Dedicated synthetic duplicate-file acceptance only')
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WS+QX8AAAAASUVORK5CYII=', 'base64')
for (const kind of ['forms', 'repeat'] as const) {
  test(`430 ${kind}: visible sibling upload, save, edit and refresh use the same row identity`, async ({ page, baseURL }, info) => {
    const external: string[] = [], errors: string[] = []
    let uploads = 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const r = route.request(), url = new URL(r.url())
      if (url.origin === baseURL && r.method() === 'GET' && !/^\/(biz|basic|workflow|api|index\/phoneLogin)(\/|$)/.test(url.pathname)) return route.continue()
      external.push(r.method() + ' ' + url.origin + url.pathname)
      return route.abort('blockedbyclient')
    })
    await page.routeWebSocket('**/*', socket => {
      if (new URL(socket.url()).host === new URL(baseURL!).host) socket.connectToServer()
      else { external.push('WS ' + socket.url()); socket.close() }
    })
    await page.goto('/#/pages/index/index?devReview=1')
    await page.goto(`/#/pages/work-orders/detail?id=mock-work-order-${kind === 'forms' ? '020-local-forms' : '021-local-repeat'}`)
    await enterDevMockDynamicFormWorkspace(page)
    const summary = page.getByTestId('a-special-field-inspectionSummary').locator('textarea')
    const result = page.getByTestId('a-special-field-inspectionResult')
    await summary.fill('唯一可见附件行')
    await result.locator('.app-choice').filter({ hasText: '需要跟进' }).click()
    const pick = page.getByTestId('a-special-media-pick-inspectionFiles')
    await expect(pick).toHaveCount(1)
    const note=page.getByTestId('a-special-field-inspectionNote').locator('textarea')
    await note.fill('唯一可见标量行')
    const choose = async () => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), pick.click()])
      await chooser.setFiles({ name: 'synthetic-duplicate.png', mimeType: 'image/png', buffer: image }); uploads++
      await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
    }
    await choose()
    await page.reload()
    await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
    await expect(note).toHaveValue('唯一可见标量行')
    await page.getByTestId('a-special-media-remove-inspectionFiles-0').click()
    await page.getByTestId('a-special-media-remove-accept-inspectionFiles').click()
    await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toHaveCount(0)
    await choose()
    await page.getByTestId('a-special-save').click()
    const row = page.getByTestId(`a-special-row-mock-special-form-data-${kind}-1`)
    await expect(row).toContainText('唯一可见附件行')
    await page.reload()
    await page.getByTestId(`a-special-edit-mock-special-form-data-${kind}-1`).click()
    await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
    await summary.fill('同一附件身份编辑')
    await page.getByTestId('a-special-save').click()
    await expect(row).toContainText('同一附件身份编辑')
    await page.reload()
    await expect(row).toContainText('同一附件身份编辑')
    await page.getByTestId(`a-special-edit-mock-special-form-data-${kind}-1`).click()
    await page.getByTestId('a-special-media-remove-inspectionFiles-0').click()
    await page.getByTestId('a-special-media-remove-accept-inspectionFiles').click()
    await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toHaveCount(0)
    await page.getByTestId('a-special-save').click()
    await page.reload()
    await page.getByTestId(`a-special-edit-mock-special-form-data-${kind}-1`).click()
    await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toHaveCount(0)
    expect(uploads).toBe(2)
    expect(external).toEqual([]); expect(errors).toEqual([])
    await info.attach('duplicate-file-evidence', { body: JSON.stringify({ kind, uploads, external, errors,
      realBackend: 'NOT_RUN', media: 'synthetic local queue only' }), contentType: 'application/json' })
  })
}
