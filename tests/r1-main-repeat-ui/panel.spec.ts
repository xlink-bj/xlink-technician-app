import { expect, test, type Page } from '@playwright/test'

const externalRequests = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const external: string[] = []
  externalRequests.set(page, external)
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5176') return route.continue()
    external.push(route.request().method())
    return route.abort('blockedbyclient')
  })
  await page.goto('/')
})

test.afterEach(async ({ page }) => {
  expect(externalRequests.get(page)).toEqual([])
})

test('click renders one safe saved reference and clears it on identity switch', async ({ page }) => {
  await expect(page.getByTestId('main-repeat-unknown')).toBeVisible()
  await expect(page.getByTestId('main-repeat-record')).toHaveCount(0)
  await page.getByTestId('main-repeat-read-button').click()
  await expect(page.getByTestId('request-count')).toContainText('1 次')
  await expect(page.getByTestId('main-repeat-count')).toContainText('已读取 1 条')
  await expect(page.getByTestId('main-repeat-record')).toHaveCount(1)
  await expect(page.getByTestId('main-repeat-record')).toContainText('未命名记录')
  await expect(page.getByTestId('main-repeat-record')).toContainText('已保存')
  await page.screenshot({ path: 'test-results/r1-main-repeat-ui/synthetic-390x844.png', fullPage: true })
  await page.getByTestId('switch-identity').click()
  await expect(page.getByTestId('main-repeat-unknown')).toBeVisible()
  await expect(page.getByTestId('main-repeat-record')).toHaveCount(0)
  await expect(page.getByTestId('request-count')).toContainText('1 次')
  await expect(page.locator('.main-repeat button')).toHaveCount(1)
  await expect(page.locator('.main-repeat button')).toContainText('读取已保存记录')
  await expect(page.getByRole('button', { name: /^(提交|删除|编辑|推进流程)/ })).toHaveCount(0)
})

for (const [scenario, marker, text] of [
  ['empty', 'main-repeat-empty', '空记录列表'],
  ['error', 'main-repeat-error', '读取未成功'],
  ['more', 'main-repeat-count', '尚有未读取记录'],
] as const) {
  test(`${scenario} shows an explicit read result`, async ({ page }) => {
    await page.getByTestId(`scenario-${scenario}`).click()
    await page.getByTestId('main-repeat-read-button').click()
    await expect(page.getByTestId(marker)).toContainText(text)
    await expect(page.getByTestId('request-count')).toContainText('1 次')
  })
}
