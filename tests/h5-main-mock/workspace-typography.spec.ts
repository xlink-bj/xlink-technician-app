import { expect, test, type Page } from '@playwright/test'

async function expectSystemTypography(page: Page) {
  const pageFamily = await page.locator('uni-page-body').evaluate(el => getComputedStyle(el).fontFamily)
  const metrics = await page.locator('[data-testid="action-workspace-shell"]').evaluate(shell => {
    const elements = [shell, ...shell.querySelectorAll(
      '.app-work-order-summary__customer, .app-work-order-summary__address, .app-action-content-heading__title, .app-field__label, .app-button__label, input, textarea',
    )].filter(element => element.getBoundingClientRect().height > 0)
    return elements.map(element => {
      const style = getComputedStyle(element)
      return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight,
        lineHeight: style.lineHeight, overflow: element.scrollWidth > element.clientWidth + 1 }
    })
  })
  expect(metrics.length).toBeGreaterThan(3)
  for (const metric of metrics) {
    expect(metric.family).toBe(pageFamily)
    expect(metric.family).toContain('"PingFang SC"')
    expect(metric.family).toContain('sans-serif')
    expect(metric.family).not.toContain('Times New Roman')
    expect(metric.overflow).toBe(false)
  }
  return metrics
}

for (const viewport of [{ width: 430, height: 932 }, { width: 375, height: 667 }]) {
  test(`shared page typography reaches appointment, survey and quotation at ${viewport.width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize(viewport)
    const remote: string[] = []
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === baseURL) return route.continue()
      remote.push(route.request().url()); return route.abort('blockedbyclient')
    })
    const metrics: Record<string, unknown> = {}
    await page.goto('/#/pages/index/index?devReview=1')
    await page.getByTestId('mock-continuous-journey-entry').click()
    await expect(page.getByTestId('app-action-content-heading')).toContainText('预约信息')
    metrics.appointment = await expectSystemTypography(page)
    await page.locator('.action-content-field--note textarea').fill('合成字体回归')
    await page.getByTestId('mock-journey-advance').click()
    await expect(page).toHaveURL(/pages\/work-orders\/detail/)
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('dynamic-form-action-content')).toBeVisible()
    metrics.survey = await expectSystemTypography(page)
    await page.goto('/#/pages/index/index?devReview=1')
    await page.locator('.mock-action-scenario').filter({ hasText: '报价草稿' }).click()
    await expect(page.getByTestId('quotation-state-ready')).toBeVisible()
    await page.getByTestId('quotation-add-group').click()
    metrics.quotation = await expectSystemTypography(page)
    expect(remote).toEqual([])
    await info.attach('computed-typography', { body: JSON.stringify(metrics), contentType: 'application/json' })
  })

}
