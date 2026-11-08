import { expect, test, type Page } from '@playwright/test'

const hasCategoryFixtures = process.env.VITE_XLINK_R1_CATEGORY_FIXTURES === 'true'

async function openList(page: Page, width: number) {
  await page.setViewportSize({width, height: 932})
  const external: string[] = [], exceptions: string[] = []
  page.on('pageerror', error => exceptions.push(error.message))
  await page.context().route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://localhost:5174') return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  await page.goto('/#/pages/index/index?devReview=1')
  await page.locator('.work-orders-entry').click()
  await expect(page.locator('.card-customer').filter({hasText: '李先生'})).toBeVisible()
  return {external, exceptions}
}
const category = (page: Page, key: string) => page.getByTestId(`work-order-category-${key}`)

for (const width of [375, 430]) {
test(`${width}: five R2 categories constrain the normal App list and keep unknown statuses only in all`, async ({page}, info) => {
  const evidence = await openList(page, width)
  await expect(page.getByRole('tab')).toHaveText(['待接单', '待联系', '待上门', '待跟进', '全部'])
  await expect(category(page, 'all')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.card-customer')).toHaveCount(hasCategoryFixtures ? 15 : 12)
  const initial = await page.locator('.card-customer').allTextContents()
  await category(page, 'to_accept').click()
  await expect(page.locator('.card-customer')).toHaveText(['李先生'])
  await category(page, 'following').click()
  await expect(page.locator('.card-customer')).toHaveCount(2)
  await expect(page.locator('.card-customer')).toContainText(['张先生', '陈女士'])
  await page.screenshot({path: info.outputPath(`r2-following-${width}.png`), fullPage: true})
  await category(page, 'need_contact').click()
  await expect(page.locator('.card-customer')).toHaveText(hasCategoryFixtures ? ['周先生'] : [])
  await expect(category(page, 'need_contact')).toHaveAttribute('aria-selected', 'true')
  await category(page, 'onsite').click()
  await expect(page.locator('.card-customer')).toHaveText(hasCategoryFixtures ? ['钱女士', '郑先生'] : [])
  // Existing symbolic Mock-only statuses are not fabricated into the real R1 groups.
  await category(page, 'all').click()
  await expect(page.locator('.card-customer')).toHaveText(initial)
  await page.screenshot({path: info.outputPath(`r2-all-${width}.png`), fullPage: true})
  expect(evidence).toEqual({external: [], exceptions: []})
})

test(`${width}: search remains scoped across classification and normal detail return`, async ({page}, info) => {
  const evidence = await openList(page, width)
  const input = page.getByTestId('app-search-bar').locator('input')
  await input.fill('张先生')
  await page.locator('.search-button').click()
  await expect(page.locator('.card-customer')).toHaveText(['张先生'])
  await category(page, 'to_accept').click()
  await expect(page.locator('.card-customer')).toHaveCount(0)
  await expect(input).toHaveValue('张先生')
  await category(page, 'following').click()
  await expect(page.locator('.card-customer')).toHaveText(['张先生'])
  await page.locator('.work-order-card').click()
  await expect(page).toHaveURL(/pages\/work-orders\/detail/)
  await page.goBack()
  await expect(category(page, 'following')).toHaveAttribute('aria-selected', 'true')
  await expect(input).toHaveValue('张先生')
  await expect(page.locator('.card-customer')).toHaveText(['张先生'])
  await page.screenshot({path: info.outputPath(`r2-category-return-${width}.png`), fullPage: true})
  expect(evidence).toEqual({external: [], exceptions: []})
})

}
