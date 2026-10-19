import { expect, test } from '@playwright/test'

/** Real main uni-app H5 page. No policy URLs configured; every external request
 * is blocked by the browser before I/O. No credentials/session/real SMS used. */
for (const width of [375, 390]) {
  test('R1 manual login no consent/legal configuration never authenticates at '+width, async({page})=>{
    await page.setViewportSize({width,height:844})
    const forbidden:string[]=[]
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url())
      if(url.origin==='http://localhost:5173')return route.continue()
      forbidden.push(route.request().method()+' '+url.origin+url.pathname)
      await route.abort('blockedbyclient')
    })
    await page.goto('/#/pages/index/index',{waitUntil:'domcontentloaded'})
    await page.locator('.login-page .launch-stage .launch-cta').click()
    await expect(page.locator('.methods-stage')).toBeVisible()
    await page.locator('.method-card').filter({hasText:'验证码登录'}).click()
    await expect(page.locator('.form-stage')).toBeVisible()
    await page.locator('.field input[placeholder="请输入手机号"]').fill('13800000000')
    await page.locator('.code-field input').fill('123456')
    await expect(page.getByTestId('r1-login-consent')).toContainText('登录协议尚未配置')
    await expect(page.locator('.login-consent-panel checkbox')).toBeDisabled()
    await page.locator('.form-stage > .submit').click()
    await expect(page.locator('.form-stage .feedback')).toContainText('登录协议尚未配置')
    expect(forbidden).toEqual([])
  })
}
