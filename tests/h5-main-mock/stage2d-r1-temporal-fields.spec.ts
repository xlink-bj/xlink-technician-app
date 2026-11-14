import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { searchMockWorkOrder } from '../support/search-mock-work-order'
import { expect, test } from '@playwright/test'

test.describe('Stage 2D R1 temporal/rating record roundtrip', () => {
  test.skip(process.env.VITE_XLINK_R1_STAGE2D_FIELDS !== 'true', 'Explicit synthetic temporal FormDef required')
  for (const kind of ['forms', 'repeat'] as const) {
    test(`430×932 ${kind}: picker/rating save → reload → clear → independent readback`, async ({ page }, info) => {
      await page.setViewportSize({ width: 430, height: 932 })
      const external: string[] = [], errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin === 'http://localhost:5174') return route.continue()
        external.push(url.origin + url.pathname)
        return route.abort('blockedbyclient')
      })
      await page.goto('/#/pages/index/index?devReview=1')
      await page.locator('.work-orders-entry').click()
      await (await searchMockWorkOrder(page, kind === 'forms' ? '020' : '021')).click(); await enterDevMockDynamicFormWorkspace(page)
      const field = (key: string) => page.getByTestId(`a-special-field-${key}`)
      await field('inspectionSummary').locator('textarea').fill('时间与评分完整回读')
      await field('inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
      const choose = async (target: ReturnType<typeof page.locator>) => {
        await target.click()
        await page.getByText('Done', { exact: true }).filter({ visible: true }).last().click()
      }
      await choose(field('inspectionDate').locator('.app-date-time-field__value'))
      await choose(field('inspectionTime').locator('.app-date-time-field__value'))
      await choose(field('inspectionDateTime').locator('.app-date-time-field__picker').nth(0))
      await choose(field('inspectionDateTime').locator('.app-date-time-field__picker').nth(1))
      await field('inspectionRating').locator('.app-rating-field__star').nth(3).click()
      const selectedDate = (await field('inspectionDate').locator('.app-date-time-field__value').innerText()).match(/\d{4}-\d{2}-\d{2}/)![0]
      const selectedTime = (await field('inspectionTime').locator('.app-date-time-field__value').innerText()).match(/\d{2}:\d{2}/)![0]
      const selectedDateTime = (await field('inspectionDateTime').locator('.app-date-time-field__value').allInnerTexts()).map(value => value.match(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/)![0])
      await expect(page.getByTestId('a-special-save')).toHaveAttribute('aria-disabled', 'false')
      await info.attach(`${kind}-temporal-430`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
      await page.getByTestId('a-special-save').click()
      const id = `mock-special-form-data-${kind}-1`
      await expect(page.getByTestId(`a-special-row-${id}`)).toContainText('时间与评分完整回读')
      await page.reload()
      await page.getByTestId(`a-special-edit-${id}`).click()
      await expect(field('inspectionDate').locator('.app-date-time-field__value')).toContainText(selectedDate)
      await expect(field('inspectionTime').locator('.app-date-time-field__value')).toContainText(selectedTime)
      for (const [index, value] of selectedDateTime.entries()) await expect(field('inspectionDateTime').locator('.app-date-time-field__value').nth(index)).toContainText(value)
      await expect(field('inspectionRating').locator('.app-rating-field__star').nth(3)).toHaveAttribute('aria-pressed', 'true')
      for (const key of ['inspectionDate', 'inspectionTime', 'inspectionDateTime', 'inspectionRating']) {
        await field(key).locator('.app-button').filter({ hasText: '清空' }).click()
      }
      await page.getByTestId('a-special-save').click()
      // This is a completed-save roundtrip, not an interrupted transaction.
      // The existing row is already visible during an edit; wait for the
      // editor to reset after durable cleanup before reloading the page.
      await expect(page.getByTestId('a-special-save')).toHaveText('保存记录')
      await expect(page.getByTestId('a-special-local-submission-pending')).toHaveCount(0)
      await expect(page.getByTestId('a-special-receipt-pending')).toHaveCount(0)
      await page.reload()
      await page.getByTestId(`a-special-edit-${id}`).click()
      await expect(field('inspectionDate')).toContainText('请选择日期')
      await expect(field('inspectionTime')).toContainText('请选择时间')
      await expect(field('inspectionRating')).toContainText('未评分')
      await expect(field('inspectionDateTime')).toContainText('请选择日期')
      await expect(field('inspectionDateTime')).toContainText('请选择时间')
      expect(external).toEqual([])
      expect(errors).toEqual([])
    })
  }
})
