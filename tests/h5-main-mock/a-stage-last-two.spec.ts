import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { expect, test, type Page } from '@playwright/test'

// Synthetic file only; no customer media, network upload or Production write.
const sampleImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WS+QX8AAAAASUVORK5CYII=',
  'base64',
)
async function capture(page: Page, scene: string) {
  const directory = process.env.XLINK_STAGE_B_SCREENSHOTS
  if (directory) await page.screenshot({ path: `${directory}/${scene}.png` })
}

async function openForms(page: import('@playwright/test').Page, kind: 'forms' | 'repeat' = 'forms') {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.goto(`/#/pages/work-orders/detail?id=mock-work-order-${kind === 'forms' ? '020-local-forms' : '021-local-repeat'}`)
  await enterDevMockDynamicFormWorkspace(page)
  await expect(page.getByTestId('a-stage-special-panel')).toBeVisible()
}
async function populate(page: import('@playwright/test').Page, summary: string) {
  await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill(summary)
  await page.getByTestId('a-special-field-inspectionResult')
    .locator('.app-choice').filter({ hasText: '需要跟进' }).click()
}

test.describe('source-only special file and conflict', () => {
  test.skip(process.env.VITE_XLINK_R1_SPECIAL_MEDIA !== 'true', 'Opt-in source-backed media fixture')

  for (const kind of ['forms', 'repeat'] as const) {
    test(`430 ${kind}: common file queue survives failure, restart, save and confirmed removal`, async ({ page }) => {
      const external: string[] = []
      page.on('request', request => {
        if (new URL(request.url()).origin !== 'http://localhost:5174') external.push(request.url())
      })
      await page.route('**/*', route => {
        if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
        return route.abort('blockedbyclient')
      })
      await openForms(page, kind)
      const pick = page.getByTestId('a-special-media-pick-inspectionFiles')
      await expect(pick).toBeVisible()
      await page.getByTestId('a-special-field-inspectionSummary').scrollIntoViewIfNeeded()
      await capture(page, `${kind}-empty`)
      await populate(page, '源字段附件事务')
      await page.evaluate(() => sessionStorage.setItem('xlink:e2e:fail-next-media-upload', 'retryable'))
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), pick.click()])
      await chooser.setFiles({ name: 'xlink-synthetic-file.png', mimeType: 'image/png', buffer: sampleImage })
      await expect(page.getByTestId('a-special-media-retry-inspectionFiles')).toBeVisible()
      await page.getByTestId('a-special-media-retry-inspectionFiles').scrollIntoViewIfNeeded()
      await capture(page, `${kind}-attachment-failed`)
      await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'true')
      await page.reload()
      await expect(page.getByTestId('a-special-media-retry-inspectionFiles')).toBeVisible()
      await page.getByTestId('a-special-media-retry-inspectionFiles').click()
      await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
      await expect(page.getByTestId('a-special-media-inspectionFiles')).not.toContainText('mock-upload')
      await page.getByTestId('a-special-media-inspectionFiles').scrollIntoViewIfNeeded()
      await capture(page, `${kind}-media-uploaded`)
      await expect(page.getByTestId('a-special-save')).toBeEnabled()
      await page.getByTestId('a-special-save').click()
      const row = page.getByTestId(`a-special-row-mock-special-form-data-${kind}-1`)
      await row.scrollIntoViewIfNeeded()
      await capture(page, `${kind}-record-saved`)
      await expect(row).toContainText('源字段附件事务')
      await page.reload()
      await page.getByTestId(`a-special-edit-mock-special-form-data-${kind}-1`).click()
      await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
      await expect(page.getByTestId('a-special-media-inspectionFiles')).not.toContainText('mock-upload')
      await page.getByTestId('a-special-media-inspectionFiles').scrollIntoViewIfNeeded()
      await capture(page, `${kind}-record-restored`)
      await page.getByTestId('a-special-media-remove-inspectionFiles-0').click()
      await expect(page.getByTestId('a-special-media-remove-confirm-inspectionFiles')).toBeVisible()
      await page.getByTestId('a-special-media-remove-cancel-inspectionFiles').click()
      await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toBeVisible()
      await expect(page.getByTestId('a-special-media-inspectionFiles')).not.toContainText('mock-upload')
      await page.getByTestId('a-special-media-remove-inspectionFiles-0').click()
      await page.getByTestId('a-special-media-remove-accept-inspectionFiles').click()
      await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toHaveCount(0)
      await page.getByTestId('a-special-save').click()
      await expect(row).toBeVisible()
      await page.reload()
      await page.getByTestId(`a-special-edit-mock-special-form-data-${kind}-1`).click()
      await expect(page.getByTestId('a-special-media-remove-inspectionFiles-0')).toHaveCount(0)
      await capture(page, `${kind}-attachment-removed-restored`)
      expect(external).toEqual([])
    })
  }

  test('430: separate tabs reject an outdated edit before FormData command', async ({ page, context }) => {
    await openForms(page)
    await populate(page, '第一版')
    await page.getByTestId('a-special-save').click()
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toBeVisible()
    const other = await context.newPage()
    await openForms(other)
    const editId = 'a-special-edit-mock-special-form-data-forms-1'
    await page.getByTestId(editId).click()
    await other.getByTestId(editId).click()
    await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('A 编辑器提交')
    await page.getByTestId('a-special-save').click()
    await expect(page.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText('A 编辑器提交')
    await other.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('B 旧版本修改')
    await other.getByTestId('a-special-save').click()
    await expect(other.getByTestId('a-special-operation-feedback')).toContainText('记录已被其他编辑器更新')
    await other.getByTestId('a-special-operation-feedback').scrollIntoViewIfNeeded()
    await capture(other, 'special-version-conflict')
    await other.reload()
    await expect(other.getByTestId('a-special-row-mock-special-form-data-forms-1')).toContainText('A 编辑器提交')
  })
})
