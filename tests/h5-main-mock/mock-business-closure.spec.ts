import { expect, test } from '@playwright/test'

/** Main App synthetic path, never a detached review harness or a real write. */
for (const viewport of [{width:375,height:667},{width:390,height:844}]) {
  test(`Mock saved form → local Workflow → SKU / Order / Contract at ${viewport.width}`, async ({page}, info) => {
    await page.setViewportSize(viewport)
    const external: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.route('**/*', async route => {
      if (new URL(route.request().url()).origin === 'http://localhost:5174') {
        await route.continue()
        return
      }
      external.push(`${route.request().method()} ${new URL(route.request().url()).origin}`)
      await route.abort('blockedbyclient')
    })

    await page.goto('/#/pages/index/index?devReview=1', {waitUntil:'domcontentloaded'})
    await page.getByTestId('mock-continuous-journey-entry').click()
    // Verify the initial unsaved state, not the exact commercial help copy.
    // B2-X may simplify that copy without changing the save/advance contract.
    await expect(page.getByTestId('mock-journey-save-state')).toContainText('保存后')
    await expect(page.getByTestId('mock-journey-save-state')).not.toContainText('已保存')
    await page.getByTestId('mock-journey-advance').click()
    await expect(page.getByTestId('mock-journey-feedback')).toContainText('尚无可核对')
    await expect(page).toHaveURL(/action-workspace/)

    await page.locator('.action-content-field--note textarea').fill('平屋顶渗漏 · 本机编辑')
    await page.getByTestId('mock-journey-advance').click()
    await expect(page).toHaveURL(/work-orders\/detail/)
    await expect(page.getByTestId('mock-journey-workflow-state')).toContainText('Mock · 未提交后台')
    await expect(page.getByTestId('mock-stage-appointment')).toContainText('本机已走过')
    await expect(page.getByTestId('mock-stage-survey')).toContainText('当前模拟节点')
    await info.attach(`mock-survey-step-${viewport.width}`, {body: await page.screenshot({fullPage:true}), contentType:'image/png'})

    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('mock-journey-context-appointment')).toContainText('平屋顶渗漏')
    // R1 survey field visibility depends on the repair-part cascade; choose
    // the actual option before asserting a conditional measurement control.
    const repairPart = page.getByTestId('survey-part-picker-trigger')
    if (await repairPart.isVisible()) {
      await repairPart.click()
      await expect(page.getByTestId('survey-part-picker-panel')).toBeVisible()
      await page.getByTestId('survey-repair-part-parents').locator('.app-cascade-selector__parent').first().click()
      await page.getByTestId('survey-repair-part-children').locator('.app-cascade-selector__child').first().click()
      await page.getByTestId('survey-part-picker-confirm').click()
      await expect(page.getByTestId('survey-part-picker-panel')).toHaveCount(0)
    }
    await expect(page.getByTestId('dynamic-field-squareMeter')).toBeVisible()
    await page.getByTestId('dynamic-field-squareMeter').locator('input').fill('18.5')
    await page.getByTestId('mock-journey-advance').click()
    await expect(page).toHaveURL(/work-orders\/detail/)
    await expect(page.getByTestId('mock-stage-survey')).toContainText('本机已走过')
    await expect(page.getByTestId('mock-stage-quotation')).toContainText('当前模拟节点')
    await page.locator('.primary-task-action').click()
    await expect(page.getByTestId('quotation-order-hub')).toBeVisible()
    await expect(page.getByTestId('mock-commerce-handoff')).toBeVisible()
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已核对 0/3')
    await page.getByTestId('mock-commerce-confirm-quotation').click()
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已核对 1/3')
    await page.getByTestId('mock-commerce-toggle-pause').click()
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已暂停')
    await info.attach(`mock-commerce-hub-${viewport.width}`, {body: await page.screenshot({fullPage:true}), contentType:'image/png'})

    await page.getByTestId('mock-journey-sku-review').click()
    await expect(page.getByTestId('sku-mock-workbench')).toBeVisible()
    await expect(page.getByTestId('sku-mock-footer')).toContainText('不支持提交')
    await page.getByTestId('sku-mock-mode-direct').click()
    await expect(page.getByTestId('sku-mock-read-accepted')).toBeVisible()
    await page.getByTestId('sku-mock-choice-thickness-2').click()
    await page.getByTestId('sku-mock-choice-color-grey').click()
    await expect(page.getByTestId('sku-mock-matched')).toContainText('synthetic-sku-2-grey')
    await page.getByTestId('sku-mock-confirm-review').click()
    await expect(page.getByTestId('sku-mock-review-feedback')).toContainText('已暂停')

    const quoteRoute = '/#/pages/work-orders/action-workspace?id=mock-work-order-019-continuous-journey&node=mock-workflow-node-019-place-order&action=place_order&entry=orders'
    await page.goto(quoteRoute, {waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已暂停')
    await page.getByTestId('mock-commerce-toggle-pause').click()
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已核对 1/3')
    await page.getByTestId('mock-journey-sku-review').click()
    await page.getByTestId('sku-mock-mode-direct').click()
    await expect(page.getByTestId('sku-mock-read-accepted')).toBeVisible()
    await page.getByTestId('sku-mock-choice-thickness-2').click()
    await page.getByTestId('sku-mock-choice-color-grey').click()
    await page.getByTestId('sku-mock-confirm-review').click()
    await expect(page.getByTestId('sku-mock-review-feedback')).toContainText('SKU 身份已核对')

    await page.goto(quoteRoute, {waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已核对 2/3')
    await expect(page.getByTestId('mock-journey-signing-review')).toContainText('本机报价未提交')
    await page.getByTestId('mock-journey-signing-review').click()
    await expect(page.getByTestId('signing-mock-orders')).toContainText('模拟正式订单 B')
    await expect(page.getByTestId('signing-mock-confirm-relation')).toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('signing-mock-scenario-no_orders').click()
    await expect(page.getByTestId('signing-mock-empty')).toBeVisible()
    await expect(page.getByTestId('signing-mock-local-checkpoint')).toHaveCount(0)
    await page.getByTestId('signing-mock-scenario-read_error').click()
    await expect(page.getByTestId('signing-mock-error')).toBeVisible()
    await page.getByTestId('signing-mock-scenario-normal').click()
    await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()
    await expect(page.getByTestId('signing-mock-contract')).toContainText('MOCK-CONTRACT-019-B')
    await expect(page.getByTestId('signing-mock-confirm-relation')).not.toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('signing-mock-confirm-relation').click()
    await expect(page.getByTestId('signing-mock-review-feedback')).toContainText('本机演示资料闭环完成')
    // uni-app H5 renders custom <uni-button disabled="true"> nodes. Their
    // disabled contract is aria-disabled, not a native button's :disabled.
    await expect(page.getByTestId('signing-mock-preview-disabled')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('signing-mock-apply-disabled')).toHaveAttribute('aria-disabled', 'true')
    // The signing review scrolls within a uni-app page container; capture
    // the selected contract itself, rather than a viewport-only page top.
    await info.attach(`mock-contract-${viewport.width}`, {
      body: await page.getByTestId('signing-mock-contract').screenshot(), contentType:'image/png',
    })

    await page.goto(quoteRoute, {waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('三个资料核对点均完成')
    await page.getByTestId('mock-commerce-revoke-last').click()
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('已核对 2/3')
    await expect(page.getByTestId('mock-commerce-feedback')).toContainText('已撤销最近一项')
    await page.getByTestId('mock-journey-signing-review').click()
    await page.getByTestId('signing-mock-order-mock-official-order-019-b').click()
    await page.getByTestId('signing-mock-confirm-relation').click()
    await expect(page.getByTestId('signing-mock-review-feedback')).toContainText('本机演示资料闭环完成')
    await page.goto(quoteRoute, {waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('mock-commerce-progress')).toContainText('三个资料核对点均完成')
    await page.goto('/#/pages/work-orders/detail?id=mock-work-order-019-continuous-journey', {waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('mock-journey-commercial-summary')).toContainText('非业务完成或已签约')
    await info.attach(`mock-local-closure-${viewport.width}`, {body: await page.screenshot({fullPage:true}), contentType:'image/png'})

    expect(external).toEqual([])
    expect(errors).toEqual([])
  })
}
