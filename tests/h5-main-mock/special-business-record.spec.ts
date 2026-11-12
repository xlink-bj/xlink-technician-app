import { enterDevMockDynamicFormWorkspace } from '../support/dev-mock-dynamic-form-workspace-entry'
import { expect, test } from '@playwright/test'

test.describe('special bizSelect through offline entity Provider', () => {
  test.skip(process.env.VITE_XLINK_R1_BUSINESS_FIELDS !== 'true', 'Explicit offline Provider required')
  for (const kind of ['forms', 'repeat'] as const) {
    test(`${kind}: load, select, save, edit, restart and clear business IDs`, async ({ page }) => {
      await page.setViewportSize({ width: 430, height: 932 })
      const external: string[] = []
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin === 'http://localhost:5174') return route.continue()
        external.push(url.origin + url.pathname)
        return route.abort('blockedbyclient')
      })
      await page.goto('/#/pages/index/index?devReview=1')
      await page.goto(`/#/pages/work-orders/detail?id=mock-work-order-${kind === 'forms' ? '020-local-forms' : '021-local-repeat'}`)
      await enterDevMockDynamicFormWorkspace(page)
      const field = page.getByTestId('a-special-field-serviceGoods')
      await expect(field).toContainText('屋面防水维修')
      await page.getByTestId('a-special-field-inspectionSummary').locator('textarea').fill('业务选择完整事务')
      await page.getByTestId('a-special-field-inspectionResult').locator('.app-choice').filter({ hasText: '需要跟进' }).click()
      await field.locator('.app-choice').filter({ hasText: '屋面防水维修' }).click()
      await field.locator('.app-choice').filter({ hasText: '外墙防水维修' }).click()
      await page.getByTestId('a-special-save').click()
      const id = `mock-special-form-data-${kind}-1`
      await expect(page.getByTestId(`a-special-row-${id}`)).toContainText('业务选择完整事务')
      await page.reload()
      await page.getByTestId(`a-special-edit-${id}`).click()
      await expect(field.locator('.app-choice--selected')).toHaveCount(2)
      await field.locator('.app-choice').filter({ hasText: '屋面防水维修' }).click()
      await page.getByTestId('a-special-save').click()
      await page.reload()
      await page.getByTestId(`a-special-edit-${id}`).click()
      await expect(field.locator('.app-choice--selected')).toHaveCount(1)
      await expect(field.locator('.app-choice--selected')).toContainText('外墙防水维修')
      await field.locator('.app-choice--selected').click()
      await page.getByTestId('a-special-save').click()
      await page.reload()
      await page.getByTestId(`a-special-edit-${id}`).click()
      await expect(field.locator('.app-choice--selected')).toHaveCount(0)
      expect(external).toEqual([])
    })
  }
})
