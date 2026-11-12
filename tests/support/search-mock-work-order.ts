import { expect, type Locator, type Page } from '@playwright/test'

type MockWorkOrderSearch = { orderNum: string; customer: string }

/** Search the synthetic row's actual R1 orderNum, not its display-only MOCK alias.
 * Cached cards remain visible while page1 is pending and must never be clicked.
 * The caller clicks only after this helper verifies the settled unique identity. */
export async function searchMockWorkOrder(page: Page, target: '020' | '021' | MockWorkOrderSearch): Promise<Locator> {
  const { orderNum, customer } = typeof target === 'string'
    ? target === '020' ? { orderNum: '26020', customer: '韩先生' } : { orderNum: '26021', customer: '田女士' }
    : target
  if (!/^\d{1,5}$/.test(orderNum) || !customer.trim()) {
    throw new Error('Mock search requires the actual bounded orderNum and customer identity')
  }
  const search = page.getByTestId('app-search-bar').locator('input')
  const submit = page.locator('.search-button')
  await expect(submit).toBeEnabled()
  await search.fill(orderNum)
  await submit.click()
  // The disabled submit / absent settled count during page1 refresh exclude
  // cached cards, including a previous result for this same search.
  await expect(submit).toBeEnabled()
  await expect(page.locator('.inline-refresh')).toHaveCount(0)
  await expect(search).toHaveValue(orderNum)
  await expect(page.locator('.list-loaded-count')).toHaveText('已加载 1 条')
  await expect(page.locator('.work-order-card')).toHaveCount(1)
  const card = page.locator('.work-order-card').filter({ hasText: customer })
  await expect(card.locator('.card-number')).toHaveText(`#${orderNum}`)
  await expect(card).toHaveAttribute('aria-disabled', 'false')
  await expect(card).toHaveAttribute('role', 'link')
  return card
}
