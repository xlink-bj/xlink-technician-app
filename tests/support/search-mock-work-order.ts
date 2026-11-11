import { expect, type Locator, type Page } from '@playwright/test'

/** Search the synthetic row's actual R1 orderNum, not its display-only MOCK alias.
 * Cached cards remain visible while page1 is pending and must never be clicked. */
export async function searchMockWorkOrder(page: Page, number: '020' | '021'): Promise<Locator> {
  const orderNum = number === '020' ? '26020' : '26021'
  const customer = number === '020' ? '韩先生' : '田女士'
  const search = page.getByTestId('app-search-bar').locator('input')
  const submit = page.locator('.search-button')
  await expect(submit).toBeEnabled()
  await search.fill(orderNum)
  await submit.click()
  // One matching row proves the search result replaced the initial multi-row list.
  // Enabled submit + settled count + navigable card exclude the pending old list.
  await expect(submit).toBeEnabled()
  await expect(search).toHaveValue(orderNum)
  await expect(page.locator('.list-loaded-count')).toHaveText('已加载 1 条')
  await expect(page.locator('.work-order-card')).toHaveCount(1)
  const card = page.locator('.work-order-card').filter({ hasText: customer })
  await expect(card).toHaveAttribute('aria-disabled', 'false')
  await expect(card).toHaveAttribute('role', 'link')
  return card
}
