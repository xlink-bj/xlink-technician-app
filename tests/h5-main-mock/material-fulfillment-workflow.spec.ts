import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })
const brand = process.env.VITE_XLINK_BRAND === 'yuhong' ? 'yuhong' : 'xlink'
const screenshots = `.review/g08-g09-workflow/${brand}/430x932`

test('submits a material order, reconciles the exact batch and reopens its original receipt', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const unexpected: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    const resource = request.resourceType()
    if (new URL(request.url()).origin === origin && request.method() === 'GET' && !['xhr', 'fetch'].includes(resource)) {
      return route.continue()
    }
    unexpected.push(`${request.method()} ${resource}`)
    return route.abort()
  })

  await page.setViewportSize({ width: 430, height: 932 })
  const workflow = page.getByTestId('material-workflow')
  const submit = workflow.getByTestId('material-submit-order')
  const grantButton = (name: string) => workflow.getByTestId('material-workflow-grants')
    .locator('uni-button, button').filter({ hasText: name })
  const pickGrant = (name: string) => grantButton(name).click({ timeout: 5000 })
  const enterWorkOrder = async () => {
    await page.getByTestId('home-schedule-mock-work-order-002').click()
    await workflow.getByTestId('material-workflow-open').click()
  }

  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-002')
  await expect(page.getByTestId('construction-read-entry')).toBeVisible()
  await expect(workflow).toHaveCount(0)
  await page.goto('/#/pages/index/index')
  await enterWorkOrder()
  await expect(grantButton('仅查看')).toHaveAttribute('aria-pressed', 'true')
  await expect(workflow.getByTestId('material-order-denied')).toBeVisible()
  await expect(submit).toHaveAttribute('aria-disabled', 'true')
  await pickGrant('仅收货')
  await expect(submit).toHaveAttribute('aria-disabled', 'true')
  await workflow.screenshot({ path: `${screenshots}/01-no-order-authority.png` })

  await pickGrant('仅下单')
  await workflow.getByTestId('material-workflow-quantity').locator('input').fill('0')
  await submit.click()
  await expect(workflow.getByTestId('material-workflow-feedback')).toContainText('请输入 1 到 99')
  await workflow.getByTestId('material-workflow-quantity').locator('input').fill('3')
  await submit.click()
  await expect(submit).toHaveCount(0)
  await expect(workflow.getByTestId('material-workflow-feedback')).toContainText('已提交到本地演示')
  await workflow.getByTestId('material-order-readback').click()
  const order = workflow.getByTestId('material-workflow-order')
  const batch = order.getByTestId('material-workflow-batch')
  await expect(order).toContainText('CL-DEMO-001')
  await expect(order).toContainText('3 卷')
  await expect(batch).toContainText('PS-DEMO-001')
  await expect(batch).toContainText('配送中')
  await expect(workflow.getByTestId('material-receive-denied')).toBeVisible()
  await expect(workflow.getByTestId('material-confirm-receipt')).toHaveCount(0)
  await workflow.screenshot({ path: `${screenshots}/02-order-readback.png` })

  await pickGrant('仅收货')
  await workflow.getByTestId('material-delay-receipt').click()
  await workflow.getByTestId('material-confirm-receipt').click()
  await expect(workflow.getByTestId('material-receipt-unknown')).toBeVisible()
  await expect(batch).toContainText('结果待核对')
  await expect(workflow.getByTestId('material-confirm-receipt')).toHaveCount(0)
  const lookup = workflow.getByTestId('material-receipt-read')
  await lookup.click()
  await expect(workflow.getByTestId('material-workflow-feedback')).toContainText('本次未查到原回执')
  await workflow.screenshot({ path: `${screenshots}/03-unknown-receipt.png` })
  await lookup.click()
  const receipt = workflow.getByTestId('material-workflow-receipt')
  await expect(receipt).toContainText('SH-DEMO-001')
  await expect(receipt).toContainText('材料单 CL-DEMO-001 · 配送批次 PS-DEMO-001')
  await expect(batch).toContainText('已到货')
  await workflow.getByTestId('material-receipt-close').click()
  await expect(receipt).toHaveCount(0)
  await lookup.click()
  await expect(receipt).toContainText('SH-DEMO-001')
  await workflow.screenshot({ path: `${screenshots}/04-original-receipt.png` })

  await page.goBack()
  await enterWorkOrder()
  await workflow.getByTestId('material-order-readback').click()
  await lookup.click()
  await expect(receipt).toContainText('SH-DEMO-001')
  await expect(workflow.getByTestId('material-confirm-receipt')).toHaveCount(0)
  await expect(submit).toHaveCount(0)

  await page.evaluate(async () => {
    const modulePath = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(/* @vite-ignore */ modulePath)
    useSessionStore().session.currentRole.id = 'different-synthetic-role'
  })
  await expect(workflow).toHaveCount(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})
