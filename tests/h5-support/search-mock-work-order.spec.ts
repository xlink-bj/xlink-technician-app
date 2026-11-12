import { expect, test, type Page } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

// Isolated DOM contract for test support, not a business fixture or App grant.
// Actual normal-App integration is exercised by the unchanged broad suite.
async function host(page: Page, result: 'empty' | 'wrong-customer' | 'wrong-number' | 'pending' | 'valid') {
  await page.setContent(`
    <div data-testid="app-search-bar"><input></div><button class="search-button">Search</button>
    <div id="result"></div><span id="clicks">0</span>
    <script>
      window.cardClicks = 0; window.searches = 0;
      document.querySelector('button').onclick = () => {
        window.searches++;
        const result = ${JSON.stringify(result)};
        document.querySelector('#result').innerHTML = result === 'empty' ? '' :
          '<span class="list-loaded-count">已加载 1 条</span><div class="work-order-card" role="link" aria-disabled="false">' +
          (result === 'wrong-customer' ? '陈女士' : '吴先生') + '<span class="card-number">' +
          (result === 'wrong-number' ? '#04009' : '#26018') + '</span></div>';
        if (result === 'pending') document.querySelector('button').disabled = true;
        document.querySelector('.work-order-card')?.addEventListener('click', () => {
          window.cardClicks++; document.querySelector('#clicks').textContent = window.cardClicks;
        });
      };
    </script>`)
}

for (const result of ['empty', 'wrong-customer', 'wrong-number', 'pending'] as const) {
  test(`search helper refuses ${result} without clicking a card`, async ({ page }) => {
    await host(page, result)
    let refused = false
    try {
      const card = await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })
      await card.click()
    } catch { refused = true }
    expect(refused).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { searches: number }).searches)).toBe(1)
    await expect(page.locator('#clicks')).toHaveText('0')
  })
}

test('search helper returns only the settled matching card for a normal click', async ({ page }) => {
  await host(page, 'valid')
  const card = await searchMockWorkOrder(page, { orderNum: '26018', customer: '吴先生' })
  await expect(page.locator('#clicks')).toHaveText('0')
  await card.click()
  await expect(page.locator('#clicks')).toHaveText('1')
})

test('search helper rejects a display alias before submitting', async ({ page }) => {
  await host(page, 'valid')
  await expect(searchMockWorkOrder(page, { orderNum: 'MOCK-018', customer: '吴先生' })).rejects.toThrow('actual bounded orderNum')
  expect(await page.evaluate(() => (window as unknown as { searches: number }).searches)).toBe(0)
})
