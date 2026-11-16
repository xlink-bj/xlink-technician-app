import { test, expect } from '@playwright/test'
import { selectBrand } from '../../config/vite/brand-profile'

const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const name = brand === 'yuhong' ? '雨虹' : '修链'

for (const width of [430, 375]) test(`build-selected ${brand} Home and Login at ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: width === 430 ? 932 : 667 })
  const external: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue()
    external.push(new URL(route.request().url()).pathname)
    return route.abort('blockedbyclient')
  })
  const screenshot = async (state: string) => {
    await expect(page.locator('.uni-navigator-hover, .button-hover')).toHaveCount(0)
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      document.querySelectorAll('uni-page-wrapper, uni-page-body').forEach(element => { element.scrollTop = 0 })
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    expect(await page.locator('body').innerText()).not.toMatch(/SYNTHETIC|DEV-Q00|Mock|测试数据/)
    await page.screenshot({ path: `.review/home-service-copy/${brand}-after/${state}-${width}x${width === 430 ? 932 : 667}.png`, animations: 'disabled', caret: 'hide' })
  }
  const touch = async (selector: string) => {
    const box = await page.locator(selector).boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await expect(page.locator('.c1-next')).toBeVisible()
  await expect(page.locator('.c1-brand')).toHaveText(`${name}服务`)
  await expect(page.locator('.c1-title')).toHaveText('工作台')
  await expect(page.locator('.c1-demo')).toHaveText('演示数据')
  await expect(page.locator('.uni-page-head__title')).toHaveText(name)
  await expect(page.locator('.home-greeting')).toContainText('王师傅')
  if (brand === 'yuhong') {
    await expect(page.locator('.home-greeting')).toHaveCSS('font-size', '20px')
    await expect(page.locator('.c1-section').first()).toHaveCSS('font-size', '18px')
    await expect(page.locator('.section-link')).toHaveCount(0)
    await touch('[data-testid=home-next]')
    await touch('[data-testid=home-work-all]')
  }
  await screenshot('01-home')
  // Actual Mock session remains unchanged except display-only long-name data.
  await page.evaluate(async () => {
    const stateModule = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(stateModule)
    const session = useSessionStore()
    if (session.session) session.session.user.displayName = '王师傅·防水维修与客户现场服务负责人'
  })
  await expect(page.locator('.home-greeting')).toContainText('客户现场服务负责人')
  await screenshot('01b-home-long-name')
  await page.locator('.work-orders-entry').click()
  await expect(page).toHaveURL(/#\/pages\/work-orders\/work-orders/)
  await page.getByTestId('main-tab-home').click()
  await expect(page.locator('.home-page')).toBeVisible()
  await page.getByTestId('main-tab-me').click(); await expect(page.locator('.me-page')).toBeVisible(); await page.locator('.main-logout').click()
  await expect(page.locator('.uni-modal')).toBeVisible()
  await page.locator('.uni-modal__btn').filter({ hasText: '退出登录' }).click()
  await expect(page.locator('.launch-stage')).toBeVisible()
  await expect(page.locator('.brand-name')).toHaveText(name)
  await expect(page.locator('.brand-tagline')).toHaveText('家装服务')
  await expect(page.locator('.launch-message')).toHaveText('让家装服务更专业、更高效')
  if (brand === 'yuhong') {
    await expect(page.locator('.launch-cta')).toHaveCSS('background-color', 'rgb(200, 32, 43)')
    await expect(page.locator('.launch-cta')).toHaveCSS('border-radius', '4px')
    await touch('.launch-cta')
  }
  await screenshot('02-launch')
  await page.locator('.launch-cta').click()
  await expect(page.locator('.methods-stage')).toBeVisible()
  const quick = page.locator('.method-card').filter({ hasText: '快捷登录' })
  await expect(quick).toHaveAttribute('disabled', 'true')
  await expect(quick).toHaveAttribute('aria-disabled', 'true')
  await quick.click()
  await expect(page.locator('.methods-stage')).toBeVisible()
  await expect(page.locator('.method-card').filter({ hasText: '密码登录' })).toHaveAttribute('aria-disabled', 'true')
  if (brand === 'yuhong') {
    await expect(quick).toHaveCSS('background-color', 'rgb(229, 231, 232)')
    await expect(page.locator('.stage-title')).toHaveCSS('font-size', '20px')
    await touch('.back-link')
  }
  await screenshot('03-methods')
  await page.locator('.back-link').click()
  await expect(page.locator('.launch-stage')).toBeVisible()
  await page.locator('.launch-cta').click()
  await page.locator('.method-card').filter({ hasText: '验证码登录' }).click()
  await expect(page.locator('.form-stage')).toBeVisible()
  await expect(page.locator('.code-button')).toHaveAttribute('disabled', 'true')
  // Public policy URLs may be configured locally; both states keep consent explicit.
  const unavailable = page.locator('.login-consent-unavailable')
  if (await unavailable.count()) await expect(unavailable).toBeVisible()
  else await expect(page.locator('.login-legal-links uni-navigator')).toHaveCount(2)
  if (brand === 'yuhong') {
    await expect(page.locator('.submit')).toHaveCSS('background-color', 'rgb(200, 32, 43)')
    await expect(page.locator('.code-button')).toHaveCSS('background-color', 'rgb(229, 231, 232)')
    await expect(page.locator('.input')).toHaveCSS('border-radius', '4px')
    await expect(page.locator('.label').first()).toHaveCSS('font-size', '16px')
    await touch('.code-button')
    await touch('.back-button')
  }
  await screenshot('04-login-form')
  await page.locator('.submit').click()
  await expect(page.locator('.feedback')).toContainText('手机号')
  await screenshot('05-validation')
  await page.locator('.back-button').click()
  await expect(page.locator('.methods-stage')).toBeVisible()
  await page.locator('.method-card').filter({ hasText: '验证码登录' }).click()
  // Visual-only pending state: no auth port, request or authenticated identity is created.
  await page.evaluate(async () => {
    const stateModule = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(stateModule)
    useSessionStore().status = 'authenticating'
  })
  await expect(page.locator('.in-flight')).toBeVisible()
  await expect(page.locator('.submit')).toHaveAttribute('disabled', 'true')
  if (brand === 'yuhong') {
    await expect(page.locator('.submit')).toHaveCSS('background-color', 'rgb(229, 231, 232)')
    await expect(page.locator('.submit')).toHaveCSS('color', 'rgb(85, 94, 100)')
    await expect(page.locator('.input')).toHaveCSS('background-color', 'rgb(244, 245, 245)')
    await expect(page.locator('.code-input-wrap')).toHaveCSS('background-color', 'rgb(244, 245, 245)')
  }
  await screenshot('06-pending-visual-state')
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
