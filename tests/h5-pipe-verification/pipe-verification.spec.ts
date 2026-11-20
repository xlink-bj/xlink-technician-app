import { expect, test, type Locator, type Page } from '@playwright/test'
import { searchMockWorkOrder } from '../support/search-mock-work-order'

const target = { orderNum: '04009', customer: '陈女士' }
const other = { orderNum: '26018', customer: '吴先生' }
const optOut = process.env.XLINK_PIPE_MOCK_OPT_OUT === 'true'

test.use({ serviceWorkers: 'block' })

async function openList(page: Page): Promise<void> {
  await page.goto('/#/pages/index/index')
  await expect(page.locator('.home-page')).toBeVisible()
  await page.locator('.work-orders-entry').click()
}

async function keepTrafficLocal(page: Page, baseURL: string | undefined): Promise<() => Promise<void>> {
  const origin = new URL(baseURL!).origin
  const errors: string[] = []
  const disallowed: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    disallowed.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  return async () => {
    expect(disallowed).toEqual([])
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
}

async function guardDevicePorts(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const attempted: string[] = []
    Object.defineProperty(window, '__pipeDeviceAttempts', { value: attempted, configurable: true })
    for (const name of ['scanCode', 'chooseImage', 'chooseMedia', 'authorize', 'openSetting',
      'makePhoneCall', 'requestSubscribeMessage', 'uploadFile'] as const) {
      Object.defineProperty(uni, name, {
        configurable: true,
        value: () => { attempted.push(name); throw new Error('Unexpected device action') },
      })
    }
    if (navigator.mediaDevices) {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => { attempted.push('getUserMedia'); throw new Error('Unexpected browser capture') },
      })
    }
  })
  return async () => {
    const calls = await page.evaluate(() => Reflect.get(window, '__pipeDeviceAttempts') as string[])
    expect(calls).toEqual([])
  }
}

async function imageFingerprint(original: Locator): Promise<string> {
  const { src, origin, dimensions } = await original.locator('img').evaluate(async img => {
    const image = img as HTMLImageElement
    await image.decode()
    return {
      src: image.currentSrc,
      origin: window.location.origin,
      dimensions: [image.naturalWidth, image.naturalHeight],
    }
  })
  const asset = new URL(src)
  expect(asset.origin).toBe(origin)
  expect(asset.pathname).toMatch(/\/ppr-(marked|obscured)\.png$/)
  expect(dimensions).toEqual([432, 238])
  return src
}

test('G22 reads three scan outcomes and rechecks the same code after reopen', async ({ page, baseURL }, testInfo) => {
  test.skip(optOut, 'G22 needs the explicit pipe Mock opt-in')
  const verifyTraffic = await keepTrafficLocal(page, baseURL)
  await openList(page)
  await (await searchMockWorkOrder(page, target)).click()
  const verifyPorts = await guardDevicePorts(page)
  await page.getByTestId('pipe-open-scan').click()
  const result = page.getByTestId('pipe-scan-result')
  await expect(result).toHaveCount(0)
  await page.getByTestId('pipe-scan').click()
  await expect(result).toHaveAttribute('data-outcome', 'found')
  const code = page.getByTestId('pipe-scan-code')
  await expect(code).toHaveText('MOCK-PPR-2401')
  await page.getByTestId('pipe-recheck').click()
  await expect(code).toHaveText('MOCK-PPR-2401')
  await expect(page.getByTestId('pipe-recheck-count')).toHaveText('已复核 1 次')

  await page.goBack()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  await (await searchMockWorkOrder(page, target)).click()
  await page.getByTestId('pipe-open-scan').click()
  await expect(result).toHaveAttribute('data-outcome', 'found')
  await expect(code).toHaveText('MOCK-PPR-2401')
  await page.getByTestId('pipe-recheck').click()
  await expect(page.getByTestId('pipe-recheck-count')).toHaveText('已复核 2 次')
  await page.screenshot({ path: testInfo.outputPath('G22-430x932-recheck.png') })

  await page.getByTestId('pipe-scan-fixtures').getByText('清晰编码 B', { exact: true }).click()
  await expect(result).toHaveCount(0)
  await page.getByTestId('pipe-scan').click()
  await expect(result).toHaveAttribute('data-outcome', 'not-found')
  await expect(code).toHaveText('MOCK-PPR-2402')

  await page.getByTestId('pipe-scan-fixtures').getByText('残缺编码', { exact: true }).click()
  await page.getByTestId('pipe-scan').click()
  await expect(result).toHaveAttribute('data-outcome', 'unknown')
  await expect(result).toContainText('样本编码残缺')
  await expect(code).toHaveCount(0)
  await page.getByTestId('pipe-recheck').click()
  await expect(result).toHaveAttribute('data-outcome', 'unknown')
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('G22-430x932-unknown.png') })
  await verifyPorts()
  await verifyTraffic()
})

test('G23 recognizes selected synthetic photos and reopens the matching original and receipt', async ({ page, baseURL }, testInfo) => {
  test.skip(optOut, 'G23 needs the explicit pipe Mock opt-in')
  const verifyTraffic = await keepTrafficLocal(page, baseURL)
  await openList(page)
  await (await searchMockWorkOrder(page, target)).click()
  const verifyPorts = await guardDevicePorts(page)
  await page.getByTestId('pipe-open-photo').click()

  const run = page.getByTestId('pipe-recognize')
  const result = page.getByTestId('pipe-photo-result')
  const original = page.getByTestId('pipe-original-image')
  const choices = page.getByTestId('pipe-photo-fixtures')
  await expect(run).toHaveAttribute('aria-disabled', 'true')
  const clearPhoto = choices.getByText('标记清晰样本', { exact: true })
  const blockedPhoto = choices.getByText('标记遮挡样本', { exact: true })
  await clearPhoto.click()
  await expect(clearPhoto).toHaveAttribute('aria-pressed', 'true')
  await expect(blockedPhoto).toHaveAttribute('aria-pressed', 'false')
  const selectedBorder = await clearPhoto.evaluate(el => getComputedStyle(el).borderColor)
  const unselectedBorder = await blockedPhoto.evaluate(el => getComputedStyle(el).borderColor)
  expect(selectedBorder).not.toBe(unselectedBorder)
  await expect(run).toHaveAttribute('aria-disabled', 'false')
  await expect(original).toHaveAttribute('data-original-id', 'marked')
  const marked = await imageFingerprint(original)
  expect(new URL(marked).pathname).toMatch(/\/ppr-marked\.png$/)
  await expect(result).toHaveCount(0)
  await run.click()
  await expect(result).toHaveAttribute('data-outcome', 'recognized')
  await expect(result).toHaveAttribute('data-image-id', 'marked')
  await expect(result).toContainText('PP-R')
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('G23-430x932-recognized.png') })
  await page.getByTestId('pipe-close').click()
  await page.getByTestId('pipe-open-photo').click()
  expect(await imageFingerprint(original)).toBe(marked)
  await expect(result).toHaveAttribute('data-image-id', 'marked')

  let releaseOriginal: () => void = () => {}
  const pendingOriginal = new Promise<void>(resolve => { releaseOriginal = resolve })
  let originalRequested = false
  await page.route('**/ppr-obscured.png', async route => {
    originalRequested = true
    await pendingOriginal
    await route.continue()
  })
  try {
    await blockedPhoto.click()
    await expect(original).toHaveAttribute('data-original-id', 'obscured')
    await expect(result).toHaveCount(0)
    await expect.poll(() => originalRequested).toBe(true)
    const pendingSrc = await original.evaluate(el => el.querySelector('img')?.currentSrc ?? '')
    expect(pendingSrc).not.toBe(marked)
  } finally {
    releaseOriginal()
  }
  const obscured = await imageFingerprint(original)
  expect(new URL(obscured).pathname).toMatch(/\/ppr-obscured\.png$/)
  await run.click()
  await expect(result).toHaveAttribute('data-outcome', 'inconclusive')
  await expect(result).toHaveAttribute('data-image-id', 'obscured')
  await expect(result).toContainText('样本标记被遮挡')
  await page.goBack()
  await expect(page).toHaveURL(/pages\/work-orders\/work-orders/)
  await (await searchMockWorkOrder(page, target)).click()
  await page.getByTestId('pipe-open-photo').click()
  await expect(result).toHaveAttribute('data-outcome', 'inconclusive')
  expect(await imageFingerprint(original)).toBe(obscured)
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('G23-430x932-inconclusive.png') })
  await verifyPorts()
  await verifyTraffic()
})

test('scoped panel denies a different order, direct access without list provenance and role revocation', async ({ page, baseURL }) => {
  test.skip(optOut, 'The scope test needs the explicit pipe Mock opt-in')
  const verifyTraffic = await keepTrafficLocal(page, baseURL)
  await page.goto('/#/pages/work-orders/detail?id=mock-work-order-002')
  await expect(page.getByTestId('ds02b-detail-record-card')).toBeVisible()
  const panel = page.getByTestId('pipe-verification-panel')
  await expect(panel).toHaveCount(0)

  await openList(page)
  await (await searchMockWorkOrder(page, other)).click()
  await expect(page.getByTestId('ds02b-detail-record-card')).toBeVisible()
  await expect(panel).toHaveCount(0)

  await page.goBack()
  await (await searchMockWorkOrder(page, target)).click()
  await page.getByTestId('pipe-open-scan').click()
  await page.getByTestId('pipe-scan').click()
  await expect(page.getByTestId('pipe-scan-result')).toBeVisible()
  await page.evaluate(async () => {
    const modulePath = '/src/shared/state/index.ts'
    const { useSessionStore } = await import(/* @vite-ignore */ modulePath)
    const sessionStore = useSessionStore()
    sessionStore.session = {
      ...sessionStore.session,
      currentRole: { id: 'foreign-pipe-role', name: '另一角色' },
    }
  })
  await expect(panel).toHaveCount(0)
  await expect(page.getByText('MOCK-PPR-2401', { exact: true })).toHaveCount(0)
  await verifyTraffic()
})

test('explicit opt-in guard hides both tools when the lane flag is off', async ({ page, baseURL }, testInfo) => {
  test.skip(!optOut, 'Run this negative proof with XLINK_PIPE_MOCK_OPT_OUT=true')
  const verifyTraffic = await keepTrafficLocal(page, baseURL)
  await openList(page)
  await (await searchMockWorkOrder(page, target)).click()
  await expect(page.getByTestId('ds02b-detail-record-card')).toBeVisible()
  await expect(page.getByTestId('pipe-verification-panel')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('430x932-lane-off.png') })
  await verifyTraffic()
})
