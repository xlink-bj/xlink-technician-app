import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
const output = `.review/main-shell/${brand}`
mkdirSync(output, { recursive: true })

test('four roots, scoped notice handoff, return, and logout', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    return route.abort('blockedbyclient')
  })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await expect(page.locator('.main-navigation-item')).toHaveCount(4)
  await page.screenshot({ path: `${output}/01-workbench-430x932.png`, animations: 'disabled' })

  await page.getByTestId('main-tab-workOrders').click()
  await expect(page).toHaveURL(/#\/pages\/work-orders\/work-orders/)
  await expect(page.locator('.work-orders-page')).toBeVisible()
  await expect(page.locator('.work-order-card').first()).toBeVisible()
  await page.screenshot({ path: `${output}/02-work-orders-430x932.png`, animations: 'disabled' })
  await page.getByTestId('main-tab-notices').click()
  await expect(page.locator('.notices-page')).toBeVisible()
  await expect(page.locator('.main-list-row')).toHaveCount(3)
  await expect(page.locator('.notice-demo')).toContainText('仅为本地开发演示')
  await page.getByTestId('notice-filter-read').click()
  await expect(page.getByText('暂无已读通知')).toBeVisible()
  await page.screenshot({ path: `${output}/03a-notices-empty-430x932.png`, animations: 'disabled' })
  await page.getByTestId('notice-filter-unread').click()
  await expect(page.locator('.notice-card')).toHaveCount(3)
  await page.getByTestId('notice-filter-all').click()
  await page.screenshot({ path: `${output}/03-notices-430x932.png`, animations: 'disabled' })

  await page.locator('.main-list-row').filter({ hasText: '有工单等待查看' }).click()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await expect(page.locator('.main-navigation')).toHaveCount(0)
  await page.locator('.main-primary-action').click()
  await expect(page.locator('.work-order-detail-page, .detail-page')).toBeVisible()
  await expect(page.locator('.main-navigation')).toHaveCount(0)
  await page.goBack()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.notices-page')).toBeVisible()
  await expect(page.locator('.notice-card--read')).toHaveCount(1)
  await page.getByTestId('notice-filter-read').click()
  await expect(page.locator('.notice-card')).toHaveCount(1)
  await page.screenshot({ path: `${output}/03b-notices-read-430x932.png`, animations: 'disabled' })
  await page.getByTestId('notice-filter-all').click()

  await page.locator('.main-list-row').filter({ hasText: '工单可见性已变化' }).click()
  await page.locator('.main-primary-action').dblclick()
  await expect(page.getByText('当前账号无法查看关联工单。')).toBeVisible()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await page.goBack()
  await page.getByTestId('main-tab-me').click()
  await expect(page.locator('.me-page')).toBeVisible()
  const identity = await page.evaluate(async () => {
    const modulePath = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(modulePath)
    const current = useSessionStore().session
    return { name: current?.user.displayName?.trim() || '姓名未提供',
      role: current?.currentRole?.name?.trim() || '岗位未提供' }
  })
  await expect(page.locator('.me-name')).toHaveText(identity.name)
  await expect(page.locator('.me-role')).toHaveText(identity.role)
  await expect(page.locator('.me-info-row').filter({ hasText: '当前版本' })).toContainText('0.1.0')
  await page.screenshot({ path: `${output}/04-me-430x932.png`, animations: 'disabled' })
  await page.locator('.main-logout').click()
  await expect(page.locator('.uni-modal')).toBeVisible()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.login-page')).toBeVisible()
  await expect(page.locator('.main-navigation')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('unknown notice and unavailable service state stay explicit', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/notices/detail?id=unknown')
  await expect(page.getByText('无法查看这条通知')).toBeVisible()
  await expect(page.locator('.main-primary-action')).toHaveCount(0)
  await page.evaluate(async () => {
    const modulePath = '/src/app/business-mock.ts'
    const { setBusinessMockMode } = await import(modulePath)
    setBusinessMockMode('off')
  })
  await page.goto('/#/pages/notices/notices')
  await expect(page.getByText('通知暂未接入')).toBeVisible()
  await expect(page.locator('.main-list-row')).toHaveCount(0)
  await page.screenshot({ path: `${output}/03c-notices-unavailable-430x932.png`, animations: 'disabled' })
})

test('root entry and tab return do not grow the UniApp page stack', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  const initialDepth = await page.evaluate(() => getCurrentPages().length)
  for (let index = 0; index < 7; index += 1) {
    await page.locator('.work-orders-entry').click()
    await expect(page.locator('.work-orders-page')).toBeVisible()
    expect(await page.evaluate(() => getCurrentPages().length)).toBe(initialDepth)
    await page.getByTestId('main-tab-home').click()
    await expect(page.locator('.home-page')).toBeVisible()
    expect(await page.evaluate(() => getCurrentPages().length)).toBe(initialDepth)
  }
  for (const tab of ['notices', 'me', 'workOrders', 'home'] as const) {
    await page.getByTestId(`main-tab-${tab}`).dblclick()
    await expect(page.getByTestId(`main-tab-${tab}`)).toHaveAttribute('aria-selected', 'true')
    expect(await page.evaluate(() => getCurrentPages().length)).toBe(initialDepth)
  }
})

test('notice navigation failure is visible and can be retried', async ({ page }) => {
  await page.goto('/#/pages/index/index')
  await page.getByTestId('main-tab-notices').click()
  await page.evaluate(async () => {
    const modulePath = '/src/features/work-orders/list.ts'
    const { useWorkOrderListStore } = await import(modulePath)
    const list = useWorkOrderListStore()
    const original = list.navigateTo.bind(list)
    list.navigateTo = async (_url: string) => { list.navigateTo = original; throw new Error('synthetic navigation failure') }
  })
  await page.getByTestId('notice-mock-notice-work-1').click()
  await expect(page.getByText('通知暂时无法打开，请稍后重试')).toBeVisible()
  await expect(page.locator('.notices-page')).toBeVisible()
  await page.getByTestId('notice-mock-notice-work-1').click()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
})

test('failed logout leaves My usable and retry succeeds', async ({ page }) => {
  await page.goto('/#/pages/index/index')
  await page.getByTestId('main-tab-me').click()
  await page.evaluate(async () => {
    const modulePath = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(modulePath)
    const store = useSessionStore()
    const original = store.endSession.bind(store)
    store.endSession = async () => {
      store.endSession = original
      return { state: 'failed_terminal', error: { category: 'server_terminal', message: 'synthetic failure' } } as any
    }
  })
  await page.locator('.main-logout').click()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.me-page')).toBeVisible()
  await expect(page.getByText('退出登录失败，请稍后重试')).toBeVisible()
  await expect(page.locator('.main-logout')).toBeEnabled()
  await page.locator('.main-logout').click()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.login-page')).toBeVisible()
})

test('reading is forgotten after logout and the same mock account returns', async ({ page }) => {
  await page.goto('/#/pages/index/index')
  await page.getByTestId('main-tab-notices').click()
  await page.locator('.main-list-row').filter({ hasText: '有工单等待查看' }).click()
  await expect(page.locator('.notice-detail-page')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.notice-card--read')).toHaveCount(1)
  await page.getByTestId('main-tab-me').click()
  await page.locator('.main-logout').click()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.login-page')).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(path)
    await useSessionStore().bootstrap()
  })
  await expect(page.locator('.home-page')).toBeVisible()
  await page.getByTestId('main-tab-notices').click()
  await expect(page.locator('.notice-card--read')).toHaveCount(0)
})
