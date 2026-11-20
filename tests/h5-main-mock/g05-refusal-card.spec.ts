import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 430, height: 932 } })
test('same assignment: cancel, reason, one refusal and receipt after reopening', async ({ page, baseURL }, info) => {
  const enabled = process.env.VITE_XLINK_G05_REFUSAL === 'true'
  const missing = process.env.VITE_XLINK_G05_MISS_FIRST_RECEIPT === 'true'
  const outside: string[] = []
  const exceptions: string[] = []
  const writeAttempts: string[] = []
  page.on('pageerror', e => exceptions.push(e.message))
  await page.context().route('**/*', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) {
      writeAttempts.push(route.request().method())
      return route.abort()
    }
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) return route.continue()
    outside.push(new URL(route.request().url()).origin)
    return route.abort()
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.card-customer').first()).toBeVisible()
  const action = page.getByTestId('g05-card-action')
  await expect(action).toHaveCount(enabled ? 1 : 0)
  if (enabled) {
    const card = page.locator('.work-order-card').filter({ has: action })
    await expect(card.locator('.card-accept-button')).toHaveCount(0)
    const ordinary = page.locator('.work-order-card').filter({ hasText: '李先生' })
    await expect(ordinary.locator('.card-accept-button')).toBeVisible()
    await expect(ordinary.getByTestId('g05-card-action')).toHaveCount(0)
    const capture = (label: string) => page.screenshot({ path: info.outputPath(label + '-430x932.png') })
    const modal = page.locator('.accept-confirm-card')
    const field = modal.locator('textarea')
    const confirm = modal.getByText('确认拒单', { exact: true }).last()
    await action.click()
    await field.fill('取消的原因'); await modal.getByText('取消', { exact: true }).click()
    await expect(modal).toHaveCount(0); await expect(action).toHaveText('拒单'); await capture('01-cancel')
    await action.click(); await confirm.click()
    await expect(modal).toContainText('请填写拒单原因'); await capture('02-empty')
    await field.fill('已有同日施工安排'); await confirm.click()
    await expect(modal.getByText('确认拒单', { exact: true })).toHaveCount(0)
    await capture('03-submitted')
    await modal.getByText('查询原回执', { exact: true }).click()
    if (missing) {
      await expect(modal).toContainText('回执暂不可确认')
      await expect(modal.getByText('确认拒单', { exact: true })).toHaveCount(0)
      await capture('04-unknown')
    }
    await modal.getByText('关闭', { exact: true }).click()
    await expect(action).toHaveText('查拒单回执')
    await action.click()
    await expect(modal).toContainText('已确认拒单')
    await expect(modal).toContainText('已有同日施工安排')
    await expect(modal).toContainText('#01501')
    await capture('05-reopened')
  }
  expect(outside).toEqual([])
  expect(exceptions).toEqual([])
  expect(writeAttempts).toEqual([])
})
